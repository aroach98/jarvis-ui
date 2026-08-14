import type { CaccPanelState, MomentumPanelState, PanelId, PanelState, TopPanelState } from "@jarvis-ui/shared";
import { stateOf } from "./answers.js";

type StateLookup = (panel: PanelId) => PanelState | undefined;

/**
 * "Good morning, Jarvis" flash briefing (ARCHITECTURE.md §5): one line per
 * panel, 15 words or less each, fixed order — CACC, Momentum, Today. Per the
 * design, the panel-owning subagent merges its siblings' briefs into one line
 * (these brief functions are that merge); Jarvis just reads them out. Word
 * caps are enforced by construction — clauses are dropped, never data
 * invented.
 */
export function buildBriefing(lookup: StateLookup): string[] {
  return [
    capWords(caccBrief(stateOf<CaccPanelState>(lookup, "left")), 15),
    capWords(momentumBrief(stateOf<MomentumPanelState>(lookup, "right")), 15),
    capWords(todayBrief(stateOf<TopPanelState>(lookup, "top")), 15),
  ];
}

function caccBrief(s?: CaccPanelState): string {
  if (!s) return "CACC: no data yet, sir.";
  const parts: string[] = [];
  if (s.inbox.connector.connected) {
    parts.push(`${s.inbox.unread} unread, ${s.inbox.flagged} flagged`);
  }
  if (s.checks.connector.connected) {
    const bad = s.checks.items.filter((i) => i.verdict === "failed").length;
    parts.push(bad === 0 ? "checks green" : `${bad} check${bad === 1 ? "" : "s"} failing`);
  }
  return parts.length > 0 ? `CACC, sir: ${parts.join("; ")}.` : "CACC connectors are offline, sir.";
}

function momentumBrief(s?: MomentumPanelState): string {
  if (!s) return "Momentum: no data yet, sir.";
  if (!s.crm.connector.connected) return "Momentum's CRM is offline, sir.";
  const top = s.crm.clients[0];
  const lead = top ? `, ${top.name} at ${top.stage.replace(/_/g, " ")}` : "";
  return `Momentum: ${s.crm.clients.length} open deals${lead}.`;
}

function todayBrief(s?: TopPanelState): string {
  if (!s) return "Today: no data yet, sir.";
  if (!s.tasks.connector.connected) return "The taskers connector is offline, sir.";
  if (s.tasks.items.length === 0) return "Nothing due today, sir. Enjoy it.";
  const first = s.tasks.items[0]!;
  return `Today: ${s.tasks.items.length} taskers, nearest ${first.label.replace(/^❗ /, "")} ${first.due}.`;
}

function capWords(line: string, max: number): string {
  const words = line.split(/\s+/);
  if (words.length <= max) return line;
  return words.slice(0, max).join(" ").replace(/[,;]$/, "") + ".";
}
