import type {
  CaccPanelState,
  MomentumPanelState,
  PanelId,
  PanelState,
  TopPanelState,
} from "@jarvis-ui/shared";
import type { Intent } from "./nlu.js";

type StateLookup = (panel: PanelId) => PanelState | undefined;

/**
 * Deterministic spoken answers composed from cached panel state — the free
 * path ARCHITECTURE.md §3 describes ("answer from cached panel state, no API
 * call"). Never invents numbers: a disconnected connector is said out loud.
 */
export function answerFromState(intent: Intent, lookup: StateLookup): string | null {
  switch (intent.kind) {
    case "cacc_inbox": {
      const s = stateOf<CaccPanelState>(lookup, "left");
      if (!s) return "I don't have CACC panel state yet.";
      if (!s.inbox.connector.connected) return "The CACC inbox connector is offline.";
      const top = s.inbox.items[0];
      const headline = top ? ` Most recent: ${top.from}, ${top.subject}.` : "";
      return `${s.inbox.unread} unread, ${s.inbox.flagged} flagged.${headline}`;
    }
    case "cacc_checks": {
      const s = stateOf<CaccPanelState>(lookup, "left");
      if (!s) return "I don't have CACC panel state yet.";
      if (!s.checks.connector.connected) return "The checks connector is offline.";
      const bad = s.checks.items.filter((i) => i.verdict === "failed");
      const waived = s.checks.items.filter((i) => i.verdict === "waived");
      if (bad.length === 0 && waived.length === 0) {
        return `All ${s.checks.items.length} checks are green.`;
      }
      const badPart =
        bad.length > 0
          ? `${bad.length} failing: ${bad
              .slice(0, 3)
              .map((b) => b.site)
              .join(", ")}.`
          : "";
      const waivedPart = waived.length > 0 ? ` ${waived.length} waived.` : "";
      return `${badPart}${waivedPart}`.trim();
    }
    case "momentum_crm": {
      const s = stateOf<MomentumPanelState>(lookup, "right");
      if (!s) return "I don't have Momentum panel state yet.";
      if (!s.crm.connector.connected) return "The CRM connector is offline.";
      if (s.crm.clients.length === 0) return "No open deals in the pipeline.";
      const list = s.crm.clients
        .slice(0, 4)
        .map((c) => `${c.name}, ${c.stage.replace(/_/g, " ")}`)
        .join("; ");
      return `${s.crm.clients.length} open deals. ${list}.`;
    }
    case "personal_tasks": {
      const s = stateOf<TopPanelState>(lookup, "top");
      if (!s) return "I don't have the top panel state yet.";
      if (!s.tasks.connector.connected) return "The taskers connector is offline.";
      if (s.tasks.items.length === 0) return "Nothing due in the next two weeks.";
      const list = s.tasks.items
        .slice(0, 3)
        .map((t) => `${t.label.replace(/^❗ /, "")}, ${t.due}`)
        .join("; ");
      return `${s.tasks.items.length} taskers coming up. ${list}.`;
    }
    case "set_mode":
      return intent.mode === "pro" ? "Premium mode." : "Save mode.";
    case "chat":
      return null;
  }
}

/** Compact real-data context block for free-form questions (local model only). */
export function contextForChat(lookup: StateLookup): string {
  const parts: string[] = [];
  const left = stateOf<CaccPanelState>(lookup, "left");
  if (left?.inbox.connector.connected) {
    parts.push(
      `CACC inbox: ${left.inbox.unread} unread, ${left.inbox.flagged} flagged. ` +
        left.inbox.items.map((i) => `${i.from}: ${i.subject} (${i.time})`).join("; "),
    );
  }
  if (left?.checks.connector.connected) {
    parts.push(
      "Checks: " + left.checks.items.map((c) => `${c.site} ${c.label} [${c.verdict}]`).join("; "),
    );
  }
  const right = stateOf<MomentumPanelState>(lookup, "right");
  if (right?.crm.connector.connected) {
    parts.push(
      "Momentum deals: " +
        right.crm.clients.map((c) => `${c.name} (${c.stage.replace(/_/g, " ")})`).join("; "),
    );
  }
  const top = stateOf<TopPanelState>(lookup, "top");
  if (top?.tasks.connector.connected) {
    parts.push("Taskers: " + top.tasks.items.map((t) => `${t.label} ${t.due}`).join("; "));
  }
  return parts.length > 0 ? parts.join("\n") : "(no connected data)";
}

function stateOf<T>(lookup: StateLookup, panel: PanelId): T | undefined {
  const ps = lookup(panel);
  return ps ? (ps.state as T) : undefined;
}
