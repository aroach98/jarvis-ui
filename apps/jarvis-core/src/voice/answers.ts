import type {
  CaccPanelState,
  MomentumPanelState,
  PanelId,
  PanelState,
  TopPanelState,
} from "@jarvis-ui/shared";
import type { Intent } from "./nlu.js";
import { plural } from "./persona.js";

type StateLookup = (panel: PanelId) => PanelState | undefined;

/**
 * Deterministic spoken answers composed from cached panel state — the free
 * path ARCHITECTURE.md §3 describes ("answer from cached panel state, no API
 * call"). Never invents numbers: a disconnected connector is said out loud.
 * Phrasing follows the butler persona (persona.ts).
 */
export function answerFromState(intent: Intent, lookup: StateLookup): string | null {
  switch (intent.kind) {
    case "cacc_inbox": {
      const s = stateOf<CaccPanelState>(lookup, "left");
      if (!s) return "I don't yet have the CACC panel state, sir.";
      if (!s.inbox.connector.connected) {
        return "I'm afraid the CACC inbox connector is offline, sir.";
      }
      const top = s.inbox.items[0];
      const headline = top ? ` The most recent is from ${top.from}: ${top.subject}.` : "";
      return `You have ${plural(s.inbox.unread, "unread message")}, sir, ${s.inbox.flagged} of them flagged.${headline}`;
    }
    case "cacc_checks": {
      const s = stateOf<CaccPanelState>(lookup, "left");
      if (!s) return "I don't yet have the CACC panel state, sir.";
      if (!s.checks.connector.connected) {
        return "I'm afraid the checks connector is offline, sir.";
      }
      const bad = s.checks.items.filter((i) => i.verdict === "failed");
      const waived = s.checks.items.filter((i) => i.verdict === "waived");
      if (bad.length === 0 && waived.length === 0) {
        return `All ${s.checks.items.length} checks are green, sir. Rather a good day.`;
      }
      const badPart =
        bad.length > 0
          ? `${plural(bad.length, "check")} failing, sir: ${bad
              .slice(0, 3)
              .map((b) => b.site)
              .join(", ")}.`
          : "";
      const waivedPart = waived.length > 0 ? ` ${bad.length > 0 ? "" : "Sir, "}${waived.length} waived.` : "";
      return `${badPart}${waivedPart}`.trim();
    }
    case "momentum_crm": {
      const s = stateOf<MomentumPanelState>(lookup, "right");
      if (!s) return "I don't yet have the Momentum panel state, sir.";
      if (!s.crm.connector.connected) {
        return "I'm afraid the CRM connector is offline, sir.";
      }
      if (s.crm.clients.length === 0) return "The pipeline is empty at present, sir.";
      const list = s.crm.clients
        .slice(0, 4)
        .map((c) => `${c.name} at ${c.stage.replace(/_/g, " ")}`)
        .join("; ");
      return `${plural(s.crm.clients.length, "open deal")} in the pipeline, sir: ${list}.`;
    }
    case "personal_tasks": {
      const s = stateOf<TopPanelState>(lookup, "top");
      if (!s) return "I don't yet have the top panel state, sir.";
      if (!s.tasks.connector.connected) {
        return "I'm afraid the taskers connector is offline, sir.";
      }
      if (s.tasks.items.length === 0) {
        return "Nothing on the docket for the next two weeks, sir.";
      }
      const list = s.tasks.items
        .slice(0, 3)
        .map((t) => `${t.label.replace(/^❗ /, "")}, ${t.due}`)
        .join("; ");
      return `${plural(s.tasks.items.length, "tasker")} coming up, sir: ${list}.`;
    }
    case "set_mode":
      return intent.mode === "pro"
        ? "Premium mode engaged, sir."
        : "Reverting to save mode, sir. Frugality suits us.";
    case "stop_music":
      return "Very good, sir.";
    case "chat":
      return null;
  }
}

/** Compact real-data context block for free-form questions. */
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

export function stateOf<T>(lookup: StateLookup, panel: PanelId): T | undefined {
  const ps = lookup(panel);
  return ps ? (ps.state as T) : undefined;
}
