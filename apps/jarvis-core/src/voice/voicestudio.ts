import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ConnectorStatus, JarvisConfig } from "@jarvis-ui/shared";
import { playWav } from "./play.js";

/**
 * Jarvis's voice: a local VoiceStudio (github.com/debpalash/VoiceStudio)
 * backend running the OmniVoice zero-shot cloning engine on this machine's
 * GPU, speaking through a saved voice profile built from reference clips
 * (scripts/build-jarvis-voice.ps1). $0 per utterance, no network, no toggle —
 * this is the voice in every mode. Windows SAPI remains only as the
 * fail-closed fallback while the backend is down or still loading weights.
 *
 * Supervision mirrors the wake sidecar: if nothing answers on the configured
 * port, jarvis-core spawns the backend from the VoiceStudio checkout
 * (`uv run --no-sync uvicorn …`, exactly what `bun run dev:api` does) and
 * restarts it after a crash with a one-minute guard. If something already
 * serves the port (the VoiceStudio desktop app, a manual run) it attaches.
 */
type VoiceStudioConfig = NonNullable<NonNullable<JarvisConfig["voice"]>["voicestudio"]>;

const DEFAULT_URL = "http://127.0.0.1:3900";
const DEFAULT_PROFILE = "JARVIS";
const DEFAULT_ENGINE = "omnivoice";
const HEALTH_TIMEOUT_MS = 4_000;
const SPEAK_TIMEOUT_MS = 90_000;
const RESTART_GUARD_MS = 60_000;

export class VoiceStudioTts {
  private queue: Promise<void> = Promise.resolve();
  private readonly url: string;
  private readonly profile: string;
  private readonly engine: string;
  private readonly dir: string;
  private readonly autostart: boolean;
  private readonly speed: number;
  private readonly tmpDir: string;
  private child?: ChildProcess;
  private spawnedByUs = false;
  private stopping = false;
  private lastStatus: ConnectorStatus = { connected: false, reason: "not checked yet" };
  private profileSeen = false;
  private warmed = false;

  constructor(cfg?: VoiceStudioConfig) {
    this.url = (cfg?.url ?? DEFAULT_URL).replace(/\/+$/, "");
    this.profile = cfg?.profile ?? DEFAULT_PROFILE;
    this.engine = cfg?.engine ?? DEFAULT_ENGINE;
    this.dir = cfg?.dir ?? path.join(os.homedir(), "VoiceStudio");
    this.autostart = cfg?.autostart !== false;
    this.speed = cfg?.speed ?? 1.0;
    this.tmpDir = mkdtempSync(path.join(os.tmpdir(), "jarvis-voice-"));
  }

  status(): ConnectorStatus {
    return this.lastStatus;
  }

  /** Probe the backend; spawn it if nothing answers and autostart is on. */
  async start(): Promise<void> {
    const up = await this.probe();
    if (!up && this.autostart) this.spawnBackend();
    process.on("exit", () => this.stop());
  }

  stop(): void {
    this.stopping = true;
    if (this.child?.pid && this.spawnedByUs) {
      // uv → uvicorn is a tree; TerminateProcess on uv alone would orphan
      // uvicorn holding the port (VoiceStudio's own dev wrapper does the same).
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(this.child.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        this.child.kill();
      }
    }
  }

  /**
   * Health = backend answers AND the Jarvis profile exists. Called on the
   * 30s pipeline refresh; also warms the engine once so the first real
   * utterance of the day doesn't pay the cold model load.
   */
  async health(): Promise<ConnectorStatus> {
    const up = await this.probe();
    if (up && !this.warmed) void this.warm();
    return this.lastStatus;
  }

  /** Serialized. Throws on failure so the caller can fall back to SAPI. */
  speak(text: string): Promise<void> {
    const run = async (): Promise<void> => {
      const wav = await this.synthesize(text);
      const wavPath = path.join(this.tmpDir, "say.wav");
      writeFileSync(wavPath, wav);
      await playWav(wavPath);
    };
    const chained = this.queue.then(run);
    this.queue = chained.catch(() => {});
    return chained;
  }

  private async synthesize(text: string): Promise<Buffer> {
    const res = await fetch(`${this.url}/v1/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.engine,
        voice: this.profile,
        input: text,
        response_format: "wav",
        speed: this.speed,
      }),
      signal: AbortSignal.timeout(SPEAK_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`VoiceStudio HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF") {
      throw new Error("VoiceStudio returned something that is not a WAV");
    }
    return buf;
  }

  private async warm(): Promise<void> {
    this.warmed = true;
    try {
      const t0 = Date.now();
      await this.synthesize("Systems online, sir.");
      console.log(`[voice] VoiceStudio warmed in ${Math.round((Date.now() - t0) / 100) / 10}s`);
    } catch (err) {
      this.warmed = false;
      console.warn(`[voice] VoiceStudio warm-up failed: ${(err as Error).message}`);
    }
  }

  private async probe(): Promise<boolean> {
    try {
      const h = await fetch(`${this.url}/health`, {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      if (!h.ok) {
        this.lastStatus = { connected: false, reason: `VoiceStudio /health ${h.status}` };
        return false;
      }
    } catch {
      this.lastStatus = {
        connected: false,
        reason: this.child
          ? "VoiceStudio backend starting (model load can take a minute) — SAPI meanwhile"
          : `VoiceStudio not reachable at ${this.url} — SAPI meanwhile`,
      };
      return false;
    }
    if (!this.profileSeen) {
      try {
        const r = await fetch(`${this.url}/profiles`, {
          signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
        });
        const rows = (await r.json()) as Array<{ id?: string; name?: string }>;
        this.profileSeen = rows.some(
          (p) => p.id === this.profile || p.name?.toLowerCase() === this.profile.toLowerCase(),
        );
      } catch {
        /* profile listing is best-effort; speech will say if it's missing */
      }
      if (!this.profileSeen) {
        this.lastStatus = {
          connected: false,
          reason: `VoiceStudio is up but has no "${this.profile}" voice profile — run scripts/build-jarvis-voice.ps1`,
        };
        return false;
      }
    }
    this.lastStatus = { connected: true };
    return true;
  }

  private spawnBackend(): void {
    if (this.stopping) return;
    const backendDir = path.join(this.dir, "backend");
    if (!existsSync(path.join(backendDir, "main.py"))) {
      this.lastStatus = {
        connected: false,
        reason: `no VoiceStudio checkout at ${this.dir} — run scripts/install-voicestudio.ps1`,
      };
      return;
    }
    const port = new URL(this.url).port || "3900";
    const args = [
      "run",
      "--no-sync",
      "uvicorn",
      "main:app",
      "--app-dir",
      "backend",
      "--host",
      "127.0.0.1",
      "--port",
      port,
    ];
    console.log(`[voice] spawning VoiceStudio backend in ${this.dir}`);
    this.child = spawn("uv", args, {
      cwd: this.dir,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `${path.join(os.homedir(), ".local", "bin")}${path.delimiter}${process.env.PATH ?? ""}`,
        OMNIVOICE_ANALYTICS_DISABLED: "1",
        OMNIVOICE_PORT: port,
        PYTHONUNBUFFERED: "1",
      },
      windowsHide: true,
    });
    this.spawnedByUs = true;
    this.child.on("error", (err) => {
      this.lastStatus = { connected: false, reason: `VoiceStudio spawn failed: ${err.message}` };
    });
    this.child.stdout?.on("data", (d: Buffer) => logLines("voicestudio", d));
    this.child.stderr?.on("data", (d: Buffer) => logLines("voicestudio", d));
    this.child.on("exit", (code) => {
      this.child = undefined;
      this.profileSeen = false;
      this.warmed = false;
      if (this.stopping) return;
      // 78 = port already in use (VoiceStudio's own convention): something
      // else owns it now, so attach instead of fighting over it.
      if (code === 78) {
        console.log("[voice] VoiceStudio port already served elsewhere — attaching");
        return;
      }
      this.lastStatus = { connected: false, reason: `VoiceStudio exited (${code}) — restarting` };
      setTimeout(() => this.spawnBackend(), RESTART_GUARD_MS);
    });
  }
}

function logLines(tag: string, d: Buffer): void {
  for (const line of String(d).split(/\r?\n/)) {
    const t = line.trim();
    // uvicorn access lines for our own health polls are noise.
    if (t && !/GET \/(health|profiles) HTTP/.test(t)) console.log(`[${tag}] ${t}`);
  }
}
