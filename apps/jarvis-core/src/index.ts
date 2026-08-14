import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_WS_PORT } from "@jarvis-ui/shared";
import type { CorePanelState, CostMode, JarvisConfig, PanelState } from "@jarvis-ui/shared";
import { packageDir } from "./lib/env.js";
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

const config = loadConfig();
const pollMs = (config.pollSeconds ?? 60) * 1000;

// Free by default — never silently pro (ARCHITECTURE.md §6).
const coreState: CorePanelState = { voiceStatus: "idle", mode: "free" };

const server = new HudServer(config.ws?.port ?? DEFAULT_WS_PORT, (mode: CostMode) => {
  coreState.mode = mode;
  console.log(`[core] mode → ${mode}`);
  publishCore();
});

function publishCore(): void {
  server.publish({ panel: "core", state: { ...coreState } });
}

const voice = new VoiceOrchestrator(config.voice, {
  getPanelState: (panel) => server.getState(panel),
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
