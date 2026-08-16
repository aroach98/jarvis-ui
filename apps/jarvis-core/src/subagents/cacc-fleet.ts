import { AGENT_PIPELINE } from "@jarvis-ui/shared";
import type { AgentTask, AgentTaskKind, CaccPanelState } from "@jarvis-ui/shared";
import { poolerQuery } from "../lib/db.js";
import { vaultSecret } from "../lib/vault.js";

/**
 * Live AGENTS pipeline (agents.cacadets.org, shared Supabase `agents`
 * schema). The status derivation is a 1:1 port of that UI's
 * taskDisplayStatus()/pipelineState() (web/index.html) so the HUD's rail
 * agrees with the real board: needs_review/done/deployed/deploy_failed/error
 * are only known to tasks.status; otherwise the live run mirror's
 * finer-grained stage wins.
 */

interface FleetRow {
  repo_slug: string;
  number: number;
  status: string;
  text: string;
  usd_spent: number | null;
  updated_at: string; // bigint ms
  host: string | null;
  stage: string | null;
  run_started: string | null; // bigint ms
  run_ended: string | null;
  run_host: string | null;
}

const STAGE_IDS = AGENT_PIPELINE.map((p) => p.id as string);

function statusFromStage(stage: string | null): string | null {
  if (!stage) return null;
  if (stage === "done") return "done";
  if (stage === "deployed") return "deployed";
  if (stage === "error") return "error";
  if (stage === "deferred" || stage.startsWith("retry")) return "unmarked";
  if (stage === "pr-open") return "pr_open";
  return STAGE_IDS.includes(stage) ? "in_flight" : null;
}

function elapsed(fromMs: number): string {
  const mins = Math.max(0, Math.round((Date.now() - fromMs) / 60_000));
  if (mins < 60) return `${mins}m`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}

function toTask(r: FleetRow): AgentTask {
  const stage = r.stage ?? "";
  const trusted = ["needs_review", "done", "deployed", "deploy_failed", "error"];
  const display = trusted.includes(r.status)
    ? r.status
    : (statusFromStage(stage) ?? r.status ?? "unmarked");

  let kind: AgentTaskKind;
  let stageIdx = -1;
  let stageLabel: string;
  if (display === "done") {
    kind = "done";
    stageLabel = "merged";
  } else if (display === "deployed") {
    kind = "deployed";
    stageLabel = "deployed ✓";
  } else if (display === "deploy_failed") {
    kind = "error";
    stageLabel = "deploy failed";
  } else if (display === "error") {
    kind = "error";
    stageLabel = "errored";
  } else if (display === "needs_review") {
    kind = "review";
    stageIdx = AGENT_PIPELINE.length - 1;
    stageLabel = "needs review";
  } else if (stage === "deferred") {
    kind = "queued";
    stageLabel = "rate-limited";
  } else if (stage.startsWith("retry")) {
    kind = "queued";
    stageLabel = stage;
  } else {
    stageIdx = STAGE_IDS.indexOf(stage);
    if (stageIdx < 0 && display === "pr_open") stageIdx = AGENT_PIPELINE.length - 1;
    if (stageIdx >= 0) {
      kind = "active";
      stageLabel = AGENT_PIPELINE[stageIdx]?.label ?? stage;
    } else if (display === "in_flight") {
      kind = "active";
      stageLabel = "in flight";
    } else {
      kind = "queued";
      stageLabel = display === "fetched" ? "fetched" : "queued";
    }
  }

  const running = kind === "active" || kind === "review";
  const startMs =
    running && r.run_started && !r.run_ended ? Number(r.run_started) : Number(r.updated_at);
  return {
    repo: r.repo_slug,
    number: r.number,
    title: r.text.replace(/\s+/g, " ").trim().slice(0, 80),
    kind,
    stageIdx,
    stageLabel,
    elapsed: elapsed(startMs),
    host: r.run_host ?? r.host ?? undefined,
  };
}

const KIND_ORDER: Record<AgentTaskKind, number> = {
  active: 0,
  review: 1,
  error: 2,
  queued: 3,
  done: 4,
  deployed: 5,
};

export async function fetchCaccFleet(): Promise<CaccPanelState["fleet"]> {
  try {
    const dbUrl = await vaultSecret(
      "cacc",
      "CACC Core / Supabase",
      "SUPABASE_SUPAVISOR_TRANSACTION_URL",
    );
    const dayAgo = Date.now() - 24 * 3600_000;
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);

    const rows = await poolerQuery<FleetRow>(
      dbUrl,
      false,
      `select t.repo_slug, t.number, t.status, t.text, t.usd_spent, t.updated_at, t.host,
              r.stage, r.started_at as run_started, r.ended_at as run_ended, r.host as run_host
         from agents.tasks t
         left join lateral (
           select stage, started_at, ended_at, host
             from agents.task_runs r
            where r.repo_slug = t.repo_slug and r.task_number = t.number and r.source = 'live'
            order by r.updated_at desc limit 1
         ) r on true
        where t.status in ('unmarked','fetched','in_flight','pr_open','needs_review')
           or t.updated_at > $1
        order by t.updated_at desc
        limit 30`,
      [dayAgo],
    );
    const spendRows = await poolerQuery<{ spend: string | null }>(
      dbUrl,
      false,
      `select sum(usd_spent) as spend from agents.tasks where updated_at > $1`,
      [midnight.getTime()],
    );

    const tasks = rows
      .map(toTask)
      .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
      .slice(0, 16);
    return {
      connector: { connected: true },
      directives: { attention: tasks.some((t) => t.kind === "error") },
      spendTodayUsd: Number(spendRows[0]?.spend ?? 0),
      tasks,
    };
  } catch (err) {
    return {
      connector: { connected: false, reason: `AGENTS pipeline: ${(err as Error).message}` },
      spendTodayUsd: 0,
      tasks: [],
    };
  }
}
