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
import type { Intent } from "./nlu.js";
import { ProNlu } from "./pro.js";
import { SapiTts } from "./tts.js";
import { ElevenTts } from "./eleven.js";
import { SpotifyPlayer } from "./spotify.js";
import { LocalMusicPlayer } from "./localmusic.js";
import { answerFromState, contextForChat } from "./answers.js";
import { buildBriefing } from "./briefing.js";

const MUSIC_TIMEOUT_MS = 10 * 60 * 1000;

export interface OrchestratorHooks {
  getPanelState: (panel: PanelId) => PanelState | undefined;
  getMode: () => CostMode;
  /** Jarvis-only mic mute (the sidecar polls it via GET /voice/control). */
  getMuted: () => boolean;
  setMode: (mode: CostMode) => void;
  /** Push voiceStatus / lastRoute / pipeline changes to the core panel. */
  onVoiceChange: (
    status: CoreVoiceStatus,
    lastRoute?: { subagent: string; utterance: string; at: string },
    pipeline?: VoicePipelineStatus,
  ) => void;
}

/**
 * The voice pipeline: wake-word sidecar → Murmur STT → intent routing →
 * answer → TTS. The free/pro cost toggle (ARCHITECTURE.md §6) selects the
 * reasoning and voice tiers per utterance — free = Ollama + SAPI ($0),
 * pro = Claude + ElevenLabs — and every pro resource fails closed to its
 * free counterpart rather than dropping the turn. Panel polling is always
 * free regardless of mode.
 */
export class VoiceOrchestrator {
  private readonly stt: MurmurStt;
  private readonly freeNlu: FreeNlu;
  private readonly proNlu: ProNlu;
  private readonly sapi: SapiTts;
  private readonly eleven: ElevenTts;
  private readonly spotify = new SpotifyPlayer();
  private readonly localMusic: LocalMusicPlayer;
  private readonly eventsPort: number;
  private readonly sidecarCfg: NonNullable<JarvisConfig["voice"]>["sidecar"];
  private server?: http.Server;
  private sidecar?: ChildProcess;
  private sidecarStatus: ConnectorStatus = { connected: false, reason: "sidecar not started" };
  private lastHeartbeat = 0;
  private busy = false;
  private musicTimer?: NodeJS.Timeout;
  private pipeline: VoicePipelineStatus;

  constructor(
    voice: JarvisConfig["voice"],
    private readonly hooks: OrchestratorHooks,
  ) {
    this.stt = new MurmurStt(voice?.murmurUrl ?? "http://127.0.0.1:8722");
    this.freeNlu = new FreeNlu(
      voice?.ollama?.url ?? "http://192.168.1.62:11434",
      voice?.ollama?.model ?? "huihui_ai/qwen2.5-coder-abliterate:14b",
    );
    this.proNlu = new ProNlu(voice?.pro?.model);
    this.sapi = new SapiTts(voice?.tts?.voice, voice?.tts?.rate ?? 0);
    this.eleven = new ElevenTts(voice?.cloudTts?.voiceId);
    this.localMusic = new LocalMusicPlayer(voice?.music?.dir ?? path.join(packageDir, "music"));
    this.eventsPort = voice?.eventsPort ?? 8723;
    this.sidecarCfg = voice?.sidecar;
    this.pipeline = {
      wake: this.sidecarStatus,
      stt: { connected: false, reason: "not checked yet" },
      nlu: { connected: false, reason: "not checked yet" },
      tts: this.sapi.status(),
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

  /** Mute flipped — refresh the chips now instead of on the 30s cycle. */
  noteMuteChanged(): void {
    void this.refreshPipeline();
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
      // The sidecar polls this ~1s and releases its mic stream while muted.
      if (req.method === "GET" && url === "/voice/control") {
        return done(200, { muted: this.hooks.getMuted() });
      }
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
        if (!this.busy && !this.hooks.getMuted()) {
          this.hooks.onVoiceChange("listening", undefined, this.pipeline);
        }
        return done(200, { ok: true });
      }
      if (req.method === "POST" && url.startsWith("/voice/utterance")) {
        // Belt-and-braces mute: while muted only explicit push-to-talk
        // utterances are accepted; anything wake-sourced is dropped even if
        // a stale sidecar sent it.
        const ptt = url.includes("src=ptt");
        collect(req, 16 * 1024 * 1024)
          .then((wav) => {
            done(202, { ok: true });
            if (this.hooks.getMuted() && !ptt) {
              console.log("[voice] muted — wake utterance discarded");
              return;
            }
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

      // §5: the trigger phrase is handled specially, never routed.
      if (/\bgood\s+morning\b/i.test(text)) {
        await this.runBriefing(text);
        return;
      }

      const intent = await this.classify(text);
      const route = {
        subagent: intentSubagent(intent),
        utterance: text,
        at: new Date().toISOString(),
      };
      if (intent.kind === "set_mode") this.hooks.setMode(intent.mode);
      if (intent.kind === "stop_music") this.stopMusic();

      let spoken = answerFromState(intent, this.hooks.getPanelState);
      if (spoken === null) {
        spoken =
          (await this.chat(text)) ??
          "I'm afraid I can't reach a reasoning model just now, sir, and the panels don't hold that answer.";
      }
      this.hooks.onVoiceChange("speaking", route, this.pipeline);
      console.log(`[voice] answer: "${spoken}"`);
      await this.speak(spoken);
      this.hooks.onVoiceChange("idle", route, this.pipeline);
    } catch (err) {
      console.warn(`[voice] utterance failed: ${(err as Error).message}`);
      this.hooks.onVoiceChange("idle", undefined, this.pipeline);
    } finally {
      this.busy = false;
    }
  }

  /** §5: ducked music (local rotation first, Spotify fallback), then 3 lines. */
  private async runBriefing(utterance: string): Promise<void> {
    const route = { subagent: "briefing", utterance, at: new Date().toISOString() };
    this.hooks.onVoiceChange("speaking", route, this.pipeline);
    let musicStarted = false;
    if (this.localMusic.available()) {
      musicStarted = this.localMusic.start();
      if (musicStarted) console.log("[voice] music: local rotation started");
    } else if (this.spotify.available()) {
      musicStarted = await this.spotify.startMusic();
    }
    if (musicStarted) {
      clearTimeout(this.musicTimer);
      this.musicTimer = setTimeout(() => this.stopMusic(), MUSIC_TIMEOUT_MS);
    }
    const lines = buildBriefing(this.hooks.getPanelState);
    console.log(`[voice] briefing: ${lines.join(" | ")}`);
    await this.speak("Good morning, sir.");
    for (const line of lines) await this.speak(line);
    this.hooks.onVoiceChange("idle", route, this.pipeline);
  }

  private stopMusic(): void {
    clearTimeout(this.musicTimer);
    this.localMusic.stop();
    void this.spotify.stopMusic();
  }

  /** Mode-aware routing: pro tries Claude first, always landing on free. */
  private async classify(text: string): Promise<Intent> {
    if (this.hooks.getMode() === "pro") {
      const intent = await this.proNlu.classify(text);
      if (intent !== null) return intent;
    }
    return this.freeNlu.classify(text);
  }

  private async chat(text: string): Promise<string | null> {
    const context = contextForChat(this.hooks.getPanelState);
    if (this.hooks.getMode() === "pro") {
      const answer = await this.proNlu.chat(text, context);
      if (answer !== null) return answer;
    }
    return this.freeNlu.chat(text, context);
  }

  /** Mode-aware voice: pro tries ElevenLabs, failing closed to SAPI. */
  private async speak(text: string): Promise<void> {
    if (this.hooks.getMode() === "pro" && this.eleven.status().connected) {
      try {
        await this.eleven.speak(text);
        return;
      } catch (err) {
        console.warn(`[voice] cloud TTS failed, using SAPI: ${(err as Error).message}`);
      }
    }
    await this.sapi.speak(text);
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
    const args = ["-u", script, "--core", `http://127.0.0.1:${this.eventsPort}`];
    if (this.sidecarCfg?.device) args.push("--device", this.sidecarCfg.device);
    if (this.sidecarCfg?.wakeThreshold !== undefined) {
      args.push("--threshold", String(this.sidecarCfg.wakeThreshold));
    }
    if (this.sidecarCfg?.pttKey) args.push("--ptt-key", this.sidecarCfg.pttKey);
    // -u: unbuffered — piped Python output never flushes otherwise.
    this.sidecar = spawn(python, args, {
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
    const [stt, freeNlu] = await Promise.all([this.stt.health(), this.freeNlu.health()]);
    const pro = this.hooks.getMode() === "pro";
    // In pro mode the chips report the pro tier's own health; the free tier
    // is always there beneath it as the fallback.
    const nlu: ConnectorStatus = pro ? this.proNlu.status() : freeNlu;
    const tts: ConnectorStatus = pro ? this.eleven.status() : this.sapi.status();
    const wake: ConnectorStatus = this.hooks.getMuted()
      ? { connected: false, reason: "muted — mic released; hold F8 to talk" }
      : heartbeatFresh
        ? this.sidecarStatus
        : this.sidecarStatus.connected
          ? { connected: false, reason: "sidecar heartbeat lost" }
          : this.sidecarStatus;
    this.pipeline = { wake, stt, nlu, tts };
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
    case "stop_music":
      return "music";
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
