import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_WS_PORT } from "@jarvis-ui/shared";
import type { CorePanelState, CostMode, JarvisConfig, PanelState } from "@jarvis-ui/shared";
import { packageDir } from "./lib/env.js";
import { handleAction, isMutating } from "./actions.js";
import { HudServer } from "./server.js";
import { buildCaccPanel, buildMomentumPanel, buildTopPanel } from "./registry.js";
import { VoiceOrchestrator } from "./voice/orchestrator.js";

function loadConfig(): JarvisConfig {
  const p = process.env.JARVIS_CONFIG ?? path.join(packageDir, "jarvis.config.json");
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8")) as JarvisConfig;
  } catch (err) {
    console.warn(`[core] unreadable ${p}: ${(err as Error).message} — using defaults`);
    return {};
  }
}

// Last-resort guards: log with a stack instead of dying silently. A native
// crash can still kill the process without reaching these, so start-core.cmd
// additionally wraps the whole thing in a restart loop.
process.on("uncaughtException", (err) => {
  console.error(`[core] UNCAUGHT: ${err.stack ?? err.message}`);
});
process.on("unhandledRejection", (reason) => {
  console.error(`[core] UNHANDLED REJECTION: ${(reason as Error)?.stack ?? String(reason)}`);
});

const config = loadConfig();
const pollMs = (config.pollSeconds ?? 60) * 1000;

// Mute survives restarts (unlike mode): a muted mic silently going hot again
// after the supervisor loop restarts core would defeat the point of muting.
const STATE_PATH = path.join(packageDir, ".jarvis-state.json");
function loadMuted(): boolean {
  try {
    return (JSON.parse(readFileSync(STATE_PATH, "utf8")) as { muted?: boolean }).muted === true;
  } catch {
    return false;
  }
}
function saveMuted(muted: boolean): void {
  try {
    writeFileSync(STATE_PATH, JSON.stringify({ muted }));
  } catch (err) {
    console.warn(`[core] could not persist mute state: ${(err as Error).message}`);
  }
}

// Free by default — never silently pro (ARCHITECTURE.md §6).
const coreState: CorePanelState = { voiceStatus: "idle", mode: "free", muted: loadMuted() };

const server = new HudServer(
  config.ws?.port ?? DEFAULT_WS_PORT,
  (mode: CostMode) => {
    coreState.mode = mode;
    console.log(`[core] mode → ${mode}`);
    publishCore();
  },
  async (action) => {
    const result = await handleAction(action);
    console.log(
      `[core] action ${action.kind} → ${result.ok ? "ok" : "FAIL"}${result.message ? `: ${result.message}` : ""}`,
    );
    // A successful dispatch changed upstream state — refresh the panels now
    // instead of waiting out the poll interval.
    if (result.ok && isMutating(action)) void pollOnce();
    return result;
  },
  (muted: boolean) => {
    coreState.muted = muted;
    saveMuted(muted);
    voice.noteMuteChanged();
    console.log(`[core] mic ${muted ? "MUTED (wake listener released)" : "live"}`);
    publishCore();
  },
);

function publishCore(): void {
  server.publish({ panel: "core", state: { ...coreState } });
}

const voice = new VoiceOrchestrator(config.voice, {
  getPanelState: (panel) => server.getState(panel),
  getMode: () => coreState.mode,
  getMuted: () => coreState.muted,
  setMode: (mode) => {
    coreState.mode = mode;
    console.log(`[core] mode → ${mode} (voice)`);
  },
  onVoiceChange: (status, lastRoute, pipeline) => {
    coreState.voiceStatus = status;
    if (lastRoute) coreState.lastRoute = lastRoute;
    if (pipeline) coreState.pipeline = pipeline;
    publishCore();
  },
});

const PANEL_BUILDERS: Array<() => Promise<PanelState>> = [
  async () => ({ panel: "left", state: await buildCaccPanel() }),
  async () => ({ panel: "right", state: await buildMomentumPanel() }),
  async () => ({ panel: "top", state: await buildTopPanel() }),
];

let polling = false;
async function pollOnce(): Promise<void> {
  if (polling) return; // a slow upstream must not stack poll cycles
  polling = true;
  try {
    await Promise.all(
      PANEL_BUILDERS.map(async (build) => {
        const state = await build();
        server.publish(state);
      }),
    );
  } finally {
    polling = false;
  }
}

publishCore();
voice.start();
void pollOnce();
setInterval(() => void pollOnce(), pollMs);
console.log(`[core] polling every ${pollMs / 1000}s`);
