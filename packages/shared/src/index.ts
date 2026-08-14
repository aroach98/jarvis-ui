/**
 * Shared contract between jarvis-core (data owner) and jarvis-shell (renderer).
 * Both apps depend on this package instead of redefining these shapes —
 * see ARCHITECTURE.md for the design each of these mirrors.
 */

export type PanelId = "top" | "left" | "core" | "right";

/** Workstream each side panel belongs to, matching ARCHITECTURE.md §2. */
export const PANEL_WORKSTREAM: Record<PanelId, string> = {
  top: "subscriptions-and-today",
  left: "cacc",
  core: "jarvis-core",
  right: "momentum",
};

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export interface InboxItem {
  from: string;
  subject: string;
  /** Pre-formatted for display (e.g. "08:12", "Yesterday") — jarvis-core owns formatting. */
  time: string;
  urgent: boolean;
}

export type FleetRunStatus = "running" | "queued" | "failed" | "done";

export interface FleetRun {
  name: string;
  status: FleetRunStatus;
}

/**
 * A subagent that isn't wired to real data yet (see ARCHITECTURE.md §8 for the
 * current list: cacc-fleet/momentum-fleet org filter, momentum-comms mailbox,
 * subscriptions-usage backend). jarvis-shell renders a "not configured" state
 * for that section instead of hiding it or showing stale/fabricated data.
 */
export interface ConnectorStatus {
  connected: boolean;
  /** Human-readable reason when connected is false, e.g. "agents schema has no org filter yet". */
  reason?: string;
}

/**
 * Generative-UI v1 (ROADMAP Phase 5): a data-owning subagent may flag its
 * panel section for visual emphasis — the renderer amplifies it (glow, pulse)
 * without the subagent knowing anything about CSS. Presentation directives,
 * not layout control; full layout generation stays a future idea.
 */
export interface SectionDirectives {
  /** The subagent judges this section needs the user's eye right now. */
  attention?: boolean;
}

// ---------------------------------------------------------------------------
// Left panel — CACC
// ---------------------------------------------------------------------------

export type CheckVerdict = "ok" | "waived" | "failed";

export interface CheckItem {
  site: string;
  label: string;
  verdict: CheckVerdict;
}

export interface CaccPanelState {
  inbox: {
    connector: ConnectorStatus;
    directives?: SectionDirectives;
    unread: number;
    flagged: number;
    items: InboxItem[];
  };
  fleet: {
    connector: ConnectorStatus;
    directives?: SectionDirectives;
    spendTodayUsd: number;
    runs: FleetRun[];
  };
  checks: {
    connector: ConnectorStatus;
    directives?: SectionDirectives;
    items: CheckItem[];
  };
}

// ---------------------------------------------------------------------------
// Right panel — Momentum
// ---------------------------------------------------------------------------

/** Matches mscrm.deals.stage's CHECK constraint exactly — see clients repo 0001_crm_schema.sql. */
export type CrmStage =
  | "lead"
  | "discovery"
  | "proposal_sent"
  | "negotiation"
  | "won"
  | "lost";

export interface CrmClient {
  name: string;
  stage: CrmStage;
}

export interface MomentumPanelState {
  inbox: {
    connector: ConnectorStatus;
    directives?: SectionDirectives;
    unread: number;
    dueThisWeek: number;
    items: InboxItem[];
  };
  fleet: {
    connector: ConnectorStatus;
    directives?: SectionDirectives;
    spendTodayUsd: number;
    runs: FleetRun[];
  };
  crm: {
    connector: ConnectorStatus;
    directives?: SectionDirectives;
    clients: CrmClient[];
  };
  /** Phase 2+, not designed yet (ARCHITECTURE.md §2) — undefined until the outreach system exists. */
  outreach?: {
    queued: number;
    sent: number;
    replied: number;
  };
}

// ---------------------------------------------------------------------------
// Core panel — Jarvis
// ---------------------------------------------------------------------------

export type CoreVoiceStatus = "idle" | "listening" | "routing" | "speaking";
export type CostMode = "free" | "pro";

/**
 * Health of each voice-pipeline stage (Phase 3), same honesty contract as
 * data connectors: a stage that isn't running reports why instead of the
 * panel pretending voice works.
 */
export interface VoicePipelineStatus {
  /** Wake-word sidecar (openWakeWord, "hey jarvis"). */
  wake: ConnectorStatus;
  /** Murmur server-mode STT. */
  stt: ConnectorStatus;
  /** Intent routing — Ollama in free mode. */
  nlu: ConnectorStatus;
  /** Local TTS voice. */
  tts: ConnectorStatus;
}

export interface CorePanelState {
  voiceStatus: CoreVoiceStatus;
  mode: CostMode;
  pipeline?: VoicePipelineStatus;
  lastRoute?: {
    subagent: string;
    utterance: string;
    /** ISO timestamp. */
    at: string;
  };
}

// ---------------------------------------------------------------------------
// Top panel — Subscriptions & Today
// ---------------------------------------------------------------------------

export interface Subscription {
  name: string;
  /** Plain-text label, e.g. "personal" or "momentum systems" — never accent-colored, see ARCHITECTURE.md §2. */
  payer: string;
  usedPct: number;
  windowLabel: string;
  /** Pre-formatted for display, e.g. "resets Fri 00:00". jarvis-core owns timezone/formatting. */
  resetsLabel: string;
}

export interface TaskItem {
  label: string;
  /** Pre-formatted for display, e.g. "by 5pm", "done". */
  due: string;
  done: boolean;
}

export interface TopPanelState {
  subscriptions: {
    connector: ConnectorStatus;
    items: Subscription[];
  };
  /** Section content is still open — see ARCHITECTURE.md §2 and ROADMAP.md. */
  tasks: {
    connector: ConnectorStatus;
    directives?: SectionDirectives;
    items: TaskItem[];
  };
  /**
   * Backed by the token-spend ledger, which doesn't exist yet (ARCHITECTURE.md
   * §8) — connector carries that fact so the renderer shows "no ledger" instead
   * of a fabricated $0.00.
   */
  spendTodayUsd: {
    connector: ConnectorStatus;
    total: number;
    byWorld: Record<string, number>;
  };
}

// ---------------------------------------------------------------------------
// WS protocol — jarvis-core is the server, jarvis-shell windows are clients
// ---------------------------------------------------------------------------

export type PanelState =
  | { panel: "left"; state: CaccPanelState }
  | { panel: "right"; state: MomentumPanelState }
  | { panel: "core"; state: CorePanelState }
  | { panel: "top"; state: TopPanelState };

export type ServerMessage =
  | ({ type: "panel-state"; ts: string } & PanelState)
  | { type: "hello"; ts: string };

export type ClientMessage =
  /** Emitted by the core panel's manual toggle. Phase 1/2 only — voice-driven toggling is Phase 3. */
  | { type: "set-mode"; mode: CostMode }
  /** A window announces which panel it wants to receive updates for, right after connecting. */
  | { type: "subscribe"; panel: PanelId };

// ---------------------------------------------------------------------------
// jarvis.config.json
// ---------------------------------------------------------------------------

/**
 * Resolves which physical display renders which panel. See
 * ARCHITECTURE.md §2 for the geometry-heuristic default this overrides:
 * topmost display → "top"; of the rest, leftmost → "left", rightmost →
 * "right", the remaining one → "core". `displayOverrides` is keyed by
 * Electron's `display.id` (stable per machine/driver, not guaranteed
 * across a GPU/driver change — that's exactly why the heuristic exists
 * as a fallback rather than requiring this file to be correct).
 */
export interface JarvisConfig {
  displayOverrides?: Record<string, PanelId>;
  ws?: {
    port: number;
  };
  /** Baseline panel refresh interval (ARCHITECTURE.md §2). Default 60. */
  pollSeconds?: number;
  /** Phase 3 voice pipeline. Everything has a sane localhost default. */
  voice?: {
    /** Murmur server-mode STT endpoint. Default http://127.0.0.1:8722. */
    murmurUrl?: string;
    /** jarvis-core's own voice-event listener (sidecar → core). Default 8723. */
    eventsPort?: number;
    ollama?: {
      /** Default http://192.168.1.62:11434 (the 3060 box). */
      url?: string;
      /** Default huihui_ai/qwen2.5-coder-abliterate:14b. */
      model?: string;
    };
    tts?: {
      /** Installed SAPI voice name substring, e.g. "Zira". Default: system default. */
      voice?: string;
      /** SAPI rate -10..10. Default 0. */
      rate?: number;
    };
    /** Pro-mode reasoning (Claude). Key comes from .env.local, never config. */
    pro?: {
      /** Default claude-opus-5. */
      model?: string;
    };
    /** Pro-mode cloud TTS (ElevenLabs). Key comes from .env.local. */
    cloudTts?: {
      /** ElevenLabs voice id. Default: the prebuilt "Daniel" voice. */
      voiceId?: string;
    };
    sidecar?: {
      /** Spawn the wake-word sidecar automatically. Default true. */
      autostart?: boolean;
      /** Python executable for the sidecar venv. Default: sidecar/.venv python. */
      python?: string;
    };
  };
}

/** Used by both apps when jarvis.config.json is absent or omits ws.port. */
export const DEFAULT_WS_PORT = 8721;
