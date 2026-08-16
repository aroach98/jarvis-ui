import type { ActionRequest, ActionResult, QueueKind } from "@jarvis-ui/shared";
import { fetchMailDetail } from "./subagents/cacc-comms.js";
import { SYSTEM_REPO } from "./subagents/cacc-queue.js";
import { ingestAgentsTask, AGENTS_URL } from "./lib/agentsIngest.js";
import { poolerQuery } from "./lib/db.js";
import { vaultSecret } from "./lib/vault.js";

/**
 * Interactive HUD actions. Dispatches mirror cacc-hq's own Send-to-agents
 * semantics (src/lib/bug-reporter/agents.ts + the dispatch route in that
 * repo): the task text is built from the AI triage blob, the write-back
 * records agent_task_ref/agent_dispatched_at — and deliberately NOT status.
 * HQ's 5-min agent-status cron owns status transitions and routes them
 * through its reporter-email funnel; writing status here would skip it.
 */

interface TicketRow {
  id: string;
  status: string;
  system: string;
  page_route: string | null;
  body: string;
  agent_task_ref: { id?: string; number?: number } | null;
  ai_triage: Record<string, unknown> | null;
}

const TARGET_LABEL: Record<string, { label: string; host: string }> = {
  tools: { label: "HQ Portal", host: "hq.cacadets.org" },
  apply_portal: { label: "Commandant Application Portal", host: "apply.cacadets.org" },
  training: { label: "Training Portal", host: "training.cacadets.org" },
  cacc_site: { label: "CACC Public Website", host: "cacadets.org" },
};

function caccDbUrl(): Promise<string> {
  return vaultSecret("cacc", "CACC Core / Supabase", "SUPABASE_SUPAVISOR_TRANSACTION_URL");
}

const s = (v: unknown): string => (typeof v === "string" ? v : "");
const pct = (v: unknown): number => Math.round((Number(v) || 0) * 100);

/** Same shape as cacc-hq's buildTaskText — agents downstream expect it. */
function bugTaskText(row: TicketRow, target: { label: string; host: string }): string {
  const t = row.ai_triage ?? {};
  const files = Array.isArray(t.suspected_files) ? (t.suspected_files as string[]) : [];
  const lines = [
    `Bug report ${row.id} — filed through the HQ portal bug reporter (hq.cacadets.org).`,
    `Reported against: ${target.label} (${target.host}) — you are working in this repo, not cacc-hq (unless this IS cacc-hq).`,
    `Severity: ${s(t.severity) || "unknown"} · triage confidence ${pct(t.confidence)}%`,
    row.page_route ? `Filed from route: ${row.page_route}` : "",
    files.length ? `Suspected files: ${files.join(", ")}` : "",
    s(t.visible_error_text) ? `On-screen error text: ${s(t.visible_error_text)}` : "",
    "",
    "--- Triage summary ---",
    s(t.summary),
    s(t.root_cause_hypothesis) ? `Hypothesis: ${s(t.root_cause_hypothesis)}` : "",
    s(t.proposed_fix) ? `Proposed fix (maintainer-validated intent): ${s(t.proposed_fix)}` : "",
    "",
    "--- Investigate and fix ---",
    s(t.claude_code_prompt),
  ];
  return lines.filter((l) => l !== "").join("\n");
}

function featureTaskText(row: TicketRow, target: { label: string; host: string }): string {
  const t = row.ai_triage ?? {};
  const files = Array.isArray(t.files_to_touch) ? (t.files_to_touch as string[]) : [];
  const lines = [
    `Feature request ${row.id} — approved for build from the HQ portal feature queue.`,
    `Requested for: ${target.label} (${target.host}) — you are working in this repo, not cacc-hq (unless this IS cacc-hq).`,
    `Effort: ${s(t.effort) || "unknown"} · design confidence ${pct(t.confidence)}%`,
    files.length ? `Files to touch: ${files.join(", ")}` : "",
    "",
    "--- Design summary (maintainer-validated) ---",
    s(t.summary),
    s(t.understanding) ? `Understanding: ${s(t.understanding)}` : "",
    s(t.proposed_design) ? `Proposed design: ${s(t.proposed_design)}` : "",
    "",
    "--- Build it ---",
    s(t.claude_code_prompt),
  ];
  return lines.filter((l) => l !== "").join("\n");
}

async function dispatchTicket(kind: QueueKind, ticketId: string): Promise<ActionResult> {
  const dbUrl = await caccDbUrl();
  const table = kind === "bug" ? "hq.bug_reports" : "hq.feature_requests";
  const bodyCol = kind === "bug" ? "description" : "idea";
  const rows = await poolerQuery<TicketRow>(
    dbUrl,
    false,
    `select id, status, system, page_route, ${bodyCol} as body, agent_task_ref, ai_triage
       from ${table} where id = $1`,
    [ticketId],
  );
  const row = rows[0];
  if (!row) return { ok: false, message: "ticket not found" };
  if (row.agent_task_ref?.id) {
    return {
      ok: false,
      message: `already dispatched — task #${row.agent_task_ref.number ?? row.agent_task_ref.id}`,
    };
  }
  if (!s(row.ai_triage?.claude_code_prompt)) {
    return { ok: false, message: "no AI triage yet — run triage in the HQ portal first" };
  }
  const repo = SYSTEM_REPO[row.system] ?? null;
  if (!repo) {
    return { ok: false, message: `system "${row.system}" maps to no repo — route it in HQ` };
  }

  const target = TARGET_LABEL[row.system] ?? { label: row.system, host: "" };
  const text = kind === "bug" ? bugTaskText(row, target) : featureTaskText(row, target);
  const task = await ingestAgentsTask(repo, text);

  // Write-back HQ's cron sweeps on: ref with a resolvable .id, dispatch stamps.
  const ref = { repo: task.repo, number: task.number, id: task.taskId, url: AGENTS_URL };
  const mode = kind === "bug" ? ", agent_dispatch_mode = 'manual'" : "";
  await poolerQuery(
    dbUrl,
    false,
    `update ${table}
        set agent_task_ref = $2::jsonb, agent_dispatched_at = now(), updated_at = now()${mode}
      where id = $1`,
    [ticketId, JSON.stringify(ref)],
  );
  return {
    ok: true,
    message: `task #${task.number ?? task.taskId} filed on ${task.repo}`,
    dispatched: { taskId: task.taskId, number: task.number, repo: task.repo },
  };
}

const CHECK_CONTEXT: Record<string, string> = {
  suite:
    "The latest Proving Ground E2E run for this site is not green. The runs live in the shared " +
    "Supabase `testing` schema (testing.runs / testing.run_results, keyed by site_id) and the " +
    "suite itself is in the cacc-testing repo — but the FIX belongs in this repo, the site under test.",
  gate: "The latest staging-gate promotion decision for this site is not `promoted` (testing.promotions).",
  deploy: "The site's production deployment on Vercel is not READY.",
};

async function dispatchCheck(
  req: Extract<ActionRequest, { kind: "dispatch-check" }>,
): Promise<ActionResult> {
  const text = [
    `[Jarvis] Investigate failing ${req.checkKind} on ${req.siteId} (prod): ${req.label}`,
    "",
    `Filed from the Jarvis HUD checks board. Current signal: "${req.siteId} · ${req.checkKind}" shows "${req.label}".`,
    CHECK_CONTEXT[req.checkKind] ?? "",
    "",
    "Investigate the root cause. If it is a code defect in this repo, fix it and open a PR. " +
      "If it is environmental, flaky, or belongs to another repo, do NOT guess a code change — " +
      "write up what you found and where the fix belongs instead.",
  ].join("\n");
  const task = await ingestAgentsTask(req.repoSlug, text);
  return {
    ok: true,
    message: `investigation #${task.number ?? task.taskId} filed on ${task.repo}`,
    dispatched: { taskId: task.taskId, number: task.number, repo: task.repo },
  };
}

/** True when the action changed upstream state and the panels should re-poll. */
export function isMutating(action: ActionRequest): boolean {
  return action.kind === "dispatch-ticket" || action.kind === "dispatch-check";
}

export async function handleAction(action: ActionRequest): Promise<ActionResult> {
  try {
    switch (action.kind) {
      case "mail-detail":
        return { ok: true, mail: await fetchMailDetail(action.messageId) };
      case "dispatch-ticket":
        return await dispatchTicket(action.ticket, action.ticketId);
      case "dispatch-check":
        return await dispatchCheck(action);
      default:
        return { ok: false, message: "unknown action" };
    }
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
