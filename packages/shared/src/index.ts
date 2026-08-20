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
  /** Graph message id — key for the mail-detail action. */
  id: string;
  from: string;
  subject: string;
  /** Pre-formatted for display (e.g. "08:12", "Yesterday") — jarvis-core owns formatting. */
  time: string;
  urgent: boolean;
  unread: boolean;
  /** First ~line of the body (Graph bodyPreview), for the expanded list view. */
  preview: string;
}

/** Full message detail, fetched on demand via the "mail-detail" action. */
export interface MailDetail {
  id: string;
  from: string;
  fromAddress: string;
  to: string[];
  subject: string;
  /** Pre-formatted, e.g. "Sat 08:12" — jarvis-core owns formatting. */
  receivedAt: string;
  /** Plain-text body (Graph is asked for text, never HTML). */
  body: string;
}

export type FleetRunStatus = "running" | "queued" | "failed" | "done";

export interface FleetRun {
  name: string;
  status: FleetRunStatus;
}

/**
 * The AGENTS pipeline (agents.cacadets.org), mirrored 1:1 from that repo's
 * web/index.html PIPELINE array — stage ids, labels, and per-stage tints.
 * The HUD renders the same rail so tasks visibly flow through the stages.
 */
export const AGENT_PIPELINE = [
  { id: "cloning", label: "clone", color: "#60a5fa" },
  { id: "architecting", label: "design", color: "#a78bfa" },
  { id: "contract push", label: "contract", color: "#22d3ee" },
  { id: "setup worktree", label: "worktree", color: "#14b8a6" },
  { id: "installing", label: "install", color: "#fb923c" },
  { id: "coding", label: "code", color: "#0ea5e9" },
  { id: "building", label: "build", color: "#fbbf24" },
  { id: "pushing", label: "push", color: "#c084fc" },
  { id: "pr-open", label: "PR open", color: "#cba6f7" },
] as const;

/** How a task renders on the rail — ported from agents' pipelineState(). */
export type AgentTaskKind =
  | "queued" // unmarked/fetched/deferred/retry — before the rail
  | "active" // riding stage stageIdx
  | "review" // needs_review — parked on the PR pip
  | "done" // merged
  | "deployed"
  | "error"; // error / deploy_failed

export interface AgentTask {
  repo: string;
  number: number;
  title: string;
  kind: AgentTaskKind;
  /** Index into AGENT_PIPELINE when kind is active/review; -1 otherwise. */
  stageIdx: number;
  /** Display label: a stage label, or "merged" / "deployed ✓" / "errored" / …. */
  stageLabel: string;
  /** Pre-formatted elapsed/age, e.g. "4m" / "2h". */
  elapsed: string;
  host?: string;
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

export type CheckKind = "suite" | "gate" | "deploy";

export interface CheckItem {
  site: string;
  label: string;
  verdict: CheckVerdict;
  /** Proving Ground site_id — set when this row maps to a testing.sites row. */
  siteId?: string;
  /** AGENTS repo slug for "investigate" dispatch; absent = not dispatchable. */
  repoSlug?: string;
  kind?: CheckKind;
}

/**
 * HQ portal bug-report / feature-request queue (hq.bug_reports /
 * hq.feature_requests). jarvis-core mirrors HQ's own "open" semantics and
 * dispatch rules — see src/subagents/cacc-queue.ts.
 */
export type QueueKind = "bug" | "feature";

export interface QueueTicket {
  kind: QueueKind;
  /** hq row uuid. */
  id: string;
  system: string;
  /** HQ status vocabulary (new | in_review | needs_info | building | planned | …). */
  status: string;
  /** AI triage summary when present, else the raw description/idea, one line. */
  title: string;
  submitter: string;
  /** Pre-formatted age, e.g. "2d" — jarvis-core owns formatting. */
  age: string;
  /** Bugs only: triage severity (low|medium|high|critical). */
  severity?: string;
  /** Triage/design confidence 0..1 when triaged. */
  confidence?: number;
  /** Resolved AGENTS repo slug for this ticket's system; null = unroutable. */
  repoSlug: string | null;
  /** Whether jarvis can dispatch this ticket (triaged + routable + not yet dispatched). */
  dispatchable: boolean;
  /** Set once an AGENTS task exists for this ticket. */
  agent?: {
    taskId: string;
    repo: string;
    number?: number;
    /** Live agents.tasks status (unmarked|…|done|deployed|error|deploy_failed). */
    status?: string;
  };
  /** Full description/idea, for the expanded detail view. */
  detail: string;
  /** Triage extracts for the detail view. */
  triage?: {
    rootCause?: string;
    proposedFix?: string;
  };
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
    /** Live + recent AGENTS pipeline tasks, newest activity first. */
    tasks: AgentTask[];
  };
  queue: {
    connector: ConnectorStatus;
    directives?: SectionDirectives;
    bugs: number;
    features: number;
    items: QueueTicket[];
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
  /**
   * Jarvis-only mute: the wake sidecar closes ITS mic stream (the device
   * stays available to every other app). Hold-to-talk still works while
   * muted — a held key is explicit intent, unlike an always-hot wake word.
   */
  muted: boolean;
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

/**
 * Interactive actions (HUD → core). Request/response over the same socket:
 * the client mints a request id, core answers with a matching action-result.
 * Mutating actions (dispatch-*) also trigger an immediate re-poll so the
 * panel state reflects the change without waiting a full cycle.
 */
export type ActionRequest =
  /** Fetch one message's full detail for the expanded inbox view. */
  | { kind: "mail-detail"; messageId: string }
  /** File the ticket's triage/design onto the AGENTS pipeline (HQ semantics). */
  | { kind: "dispatch-ticket"; ticket: QueueKind; ticketId: string }
  /** File an AGENTS investigation task for a failing check row. */
  | {
      kind: "dispatch-check";
      siteId: string;
      repoSlug: string;
      checkKind: CheckKind;
      label: string;
    };

export interface ActionResult {
  ok: boolean;
  /** Human-readable outcome ("task #188 filed on cacc-hq") or failure reason. */
  message?: string;
  /** mail-detail payload. */
  mail?: MailDetail;
  /** dispatch-* payload. */
  dispatched?: { taskId: string; number?: number; repo: string };
}

export type ServerMessage =
  | ({ type: "panel-state"; ts: string } & PanelState)
  | { type: "hello"; ts: string }
  | ({ type: "action-result"; id: string } & ActionResult)
  /** Embedded-terminal output (only sent to windows that term-attached). */
  | { type: "term-data"; data: string }
  | { type: "term-exit"; code: number };

export type ClientMessage =
  /** Emitted by the core panel's manual toggle. Phase 1/2 only — voice-driven toggling is Phase 3. */
  | { type: "set-mode"; mode: CostMode }
  /** Core panel's mic toggle — mutes Jarvis's wake listener only, never the device. */
  | { type: "set-muted"; muted: boolean }
  /** A window announces which panel it wants to receive updates for, right after connecting. */
  | { type: "subscribe"; panel: PanelId }
  /** Interactive request; core replies with action-result carrying the same id. */
  | { type: "action"; id: string; action: ActionRequest }
  /**
   * Embedded terminal (the herdr client hosted by jarvis-core in a pty).
   * term-attach subscribes this window to term-data and (re)spawns the pty
   * if needed; input/resize flow back over the same socket.
   */
  | { type: "term-attach"; cols: number; rows: number }
  | { type: "term-input"; data: string }
  | { type: "term-resize"; cols: number; rows: number };

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
    /** Briefing soundtrack — local audio files, preferred over Spotify. */
    music?: {
      /** Folder of audio files. Default: apps/jarvis-core/music. */
      dir?: string;
    };
    sidecar?: {
      /** Spawn the wake-word sidecar automatically. Default true. */
      autostart?: boolean;
      /** Python executable for the sidecar venv. Default: sidecar/.venv python. */
      python?: string;
      /**
       * Input device: index or case-insensitive name substring (e.g. "BRIO").
       * Default: system default input — which on some machines is a silent
       * line-in, so pin the real mic here. `wake_listener.py --list-devices`
       * prints the options.
       */
      device?: string;
      /** Wake-word score threshold 0..1. Default 0.5; lower = more sensitive. */
      wakeThreshold?: number;
      /** Hold-to-talk key (always active alongside the wake word). Default "f8"; "none" disables. */
      pttKey?: string;
    };
  };
}

/** Used by both apps when jarvis.config.json is absent or omits ws.port. */
export const DEFAULT_WS_PORT = 8721;
