import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import type {
  ConnectorStatus,
  CoreVoiceStatus,
  CostMode,
  JarvisConfig,
  PanelId,
  PanelState,
  VoicePipelineStatus,
} from "@jarvis-ui/shared";
import { packageDir } from "../lib/env.js";
import { MurmurStt } from "./stt.js";
import { FreeNlu } from "./nlu.js";
import { SapiTts } from "./tts.js";
import { answerFromState, contextForChat } from "./answers.js";

export interface OrchestratorHooks {
  getPanelState: (panel: PanelId) => PanelState | undefined;
  setMode: (mode: CostMode) => void;
  /** Push voiceStatus / lastRoute / pipeline changes to the core panel. */
  onVoiceChange: (
    status: CoreVoiceStatus,
    lastRoute?: { subagent: string; utterance: string; at: string },
    pipeline?: VoicePipelineStatus,
  ) => void;
}

/**
 * Phase 3 voice pipeline (free mode only): wake-word sidecar → Murmur STT →
 * local intent routing → answer from cached panel state → SAPI TTS. Every
 * stage fails closed into the pipeline status the core panel shows.
 */
export class VoiceOrchestrator {
  private readonly stt: MurmurStt;
  private readonly nlu: FreeNlu;
  private readonly tts: SapiTts;
  private readonly eventsPort: number;
  private readonly sidecarCfg: NonNullable<JarvisConfig["voice"]>["sidecar"];
  private server?: http.Server;
  private sidecar?: ChildProcess;
  private sidecarStatus: ConnectorStatus = { connected: false, reason: "sidecar not started" };
  private lastHeartbeat = 0;
  private busy = false;
  private pipeline: VoicePipelineStatus;

  constructor(
    voice: JarvisConfig["voice"],
    private readonly hooks: OrchestratorHooks,
  ) {
    this.stt = new MurmurStt(voice?.murmurUrl ?? "http://127.0.0.1:8722");
    this.nlu = new FreeNlu(
      voice?.ollama?.url ?? "http://192.168.1.62:11434",
      voice?.ollama?.model ?? "huihui_ai/qwen2.5-coder-abliterate:14b",
    );
    this.tts = new SapiTts(voice?.tts?.voice, voice?.tts?.rate ?? 0);
    this.eventsPort = voice?.eventsPort ?? 8723;
    this.sidecarCfg = voice?.sidecar;
    this.pipeline = {
      wake: this.sidecarStatus,
      stt: { connected: false, reason: "not checked yet" },
      nlu: { connected: false, reason: "not checked yet" },
      tts: this.tts.status(),
    };
  }

  start(): void {
    this.startEventServer();
    if (this.sidecarCfg?.autostart !== false) this.startSidecar();
    void this.refreshPipeline();
    setInterval(() => void this.refreshPipeline(), 30_000);
  }

  getPipeline(): VoicePipelineStatus {
    return this.pipeline;
  }

  /** Sidecar → core events: wake detected, utterance WAV, heartbeat. */
  private startEventServer(): void {
    this.server = http.createServer((req, res) => {
      const done = (code: number, body: unknown): void => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
      };
      const url = req.url ?? "";
      if (req.method === "GET" && url === "/health") return done(200, { ok: true });
      if (req.method === "POST" && url === "/voice/heartbeat") {
        this.lastHeartbeat = Date.now();
        this.sidecarStatus = { connected: true };
        collect(req, 4096)
          .then((buf) => {
            try {
              const body = JSON.parse(buf.toString()) as { ok?: boolean; reason?: string };
              if (body.ok === false) {
                this.sidecarStatus = { connected: false, reason: body.reason ?? "sidecar error" };
              }
            } catch {
              /* heartbeat body is optional */
            }
            done(200, { ok: true });
          })
          .catch(() => done(400, { ok: false }));
        return;
      }
      if (req.method === "POST" && url === "/voice/wake") {
        if (!this.busy) this.hooks.onVoiceChange("listening", undefined, this.pipeline);
        return done(200, { ok: true });
      }
      if (req.method === "POST" && url === "/voice/utterance") {
        collect(req, 16 * 1024 * 1024)
          .then((wav) => {
            done(202, { ok: true });
            void this.handleUtterance(wav);
          })
          .catch(() => done(413, { ok: false }));
        return;
      }
      done(404, { ok: false });
    });
    this.server.listen(this.eventsPort, "127.0.0.1", () =>
      console.log(`[voice] event server on 127.0.0.1:${this.eventsPort}`),
    );
  }

  private async handleUtterance(wav: Buffer): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      this.hooks.onVoiceChange("routing", undefined, this.pipeline);
      const text = await this.stt.transcribe(wav);
      if (text.length === 0) {
        this.hooks.onVoiceChange("idle", undefined, this.pipeline);
        return;
      }
      console.log(`[voice] heard: "${text}"`);
      const intent = await this.nlu.classify(text);
      const route = {
        subagent: intentSubagent(intent),
        utterance: text,
        at: new Date().toISOString(),
      };
      if (intent.kind === "set_mode") this.hooks.setMode(intent.mode);
      let spoken = answerFromState(intent, this.hooks.getPanelState);
      if (spoken === null) {
        spoken =
          (await this.nlu.chat(text, contextForChat(this.hooks.getPanelState))) ??
          "I can't reach the local model right now, and that isn't a question I can answer from the panels.";
      }
      this.hooks.onVoiceChange("speaking", route, this.pipeline);
      console.log(`[voice] answer: "${spoken}"`);
      await this.tts.speak(spoken);
      this.hooks.onVoiceChange("idle", route, this.pipeline);
    } catch (err) {
      console.warn(`[voice] utterance failed: ${(err as Error).message}`);
      this.hooks.onVoiceChange("idle", undefined, this.pipeline);
    } finally {
      this.busy = false;
    }
  }

  private startSidecar(): void {
    const sidecarDir = path.join(packageDir, "sidecar");
    const script = path.join(sidecarDir, "wake_listener.py");
    const python =
      this.sidecarCfg?.python ?? path.join(sidecarDir, ".venv", "Scripts", "python.exe");
    if (!existsSync(script) || !existsSync(python)) {
      this.sidecarStatus = {
        connected: false,
        reason: "sidecar venv missing — run sidecar/setup.ps1",
      };
      return;
    }
    // -u: unbuffered — piped Python output never flushes otherwise.
    this.sidecar = spawn(python, ["-u", script, "--core", `http://127.0.0.1:${this.eventsPort}`], {
      cwd: sidecarDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    this.sidecar.on("error", (err) => {
      this.sidecarStatus = { connected: false, reason: `sidecar spawn failed: ${err.message}` };
    });
    this.sidecar.stdout?.on("data", (d: Buffer) =>
      console.log(`[sidecar] ${String(d).trimEnd()}`),
    );
    this.sidecar.stderr?.on("data", (d: Buffer) =>
      console.warn(`[sidecar] ${String(d).trimEnd()}`),
    );
    this.sidecar.on("exit", (code) => {
      this.sidecarStatus = { connected: false, reason: `sidecar exited (${code}) — restarting` };
      // Crash loop guard: restart after a minute, not immediately.
      setTimeout(() => this.startSidecar(), 60_000);
    });
  }

  private async refreshPipeline(): Promise<void> {
    const heartbeatFresh = Date.now() - this.lastHeartbeat < 45_000;
    const [stt, nlu] = await Promise.all([this.stt.health(), this.nlu.health()]);
    this.pipeline = {
      wake: heartbeatFresh
        ? this.sidecarStatus
        : this.sidecarStatus.connected
          ? { connected: false, reason: "sidecar heartbeat lost" }
          : this.sidecarStatus,
      stt,
      nlu,
      tts: this.tts.status(),
    };
    this.hooks.onVoiceChange(this.busy ? "routing" : "idle", undefined, this.pipeline);
  }
}

function intentSubagent(intent: { kind: string }): string {
  switch (intent.kind) {
    case "cacc_inbox":
      return "cacc-comms";
    case "cacc_checks":
      return "cacc-checks";
    case "momentum_crm":
      return "momentum-crm";
    case "personal_tasks":
      return "personal-tasks";
    case "set_mode":
      return "mode";
    default:
      return "chat";
  }
}

function collect(req: http.IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        req.destroy();
        reject(new Error("body too large"));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
