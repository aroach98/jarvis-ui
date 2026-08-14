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
    unread: number;
    flagged: number;
    items: InboxItem[];
  };
  fleet: {
    connector: ConnectorStatus;
    spendTodayUsd: number;
    runs: FleetRun[];
  };
  checks: {
    connector: ConnectorStatus;
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
    unread: number;
    dueThisWeek: number;
    items: InboxItem[];
  };
  fleet: {
    connector: ConnectorStatus;
    spendTodayUsd: number;
    runs: FleetRun[];
  };
  crm: {
    connector: ConnectorStatus;
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

export interface CorePanelState {
  voiceStatus: CoreVoiceStatus;
  mode: CostMode;
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
}

/** Used by both apps when jarvis.config.json is absent or omits ws.port. */
export const DEFAULT_WS_PORT = 8721;
