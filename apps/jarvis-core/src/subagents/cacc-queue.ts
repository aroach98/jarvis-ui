import type { CaccPanelState, QueueTicket } from "@jarvis-ui/shared";
import { poolerQuery } from "../lib/db.js";
import { vaultSecret } from "../lib/vault.js";
import { ageLabel } from "../lib/format.js";

/**
 * HQ portal feedback queues: hq.bug_reports + hq.feature_requests, joined
 * against agents.tasks so a dispatched ticket shows its live agent status.
 * Mirrors cacc-hq's own semantics (src/lib/s6-forms in that repo):
 * - "open" = archived_at IS NULL + the per-kind open status list
 * - system → repo comes from HQ's agentTargets map; general/unknown = null,
 *   never a default repo
 * - a ticket is dispatchable only when AI-triaged (the dispatch text is the
 *   triage blob, same as HQ's Send-to-agents button)
 */

export const SYSTEM_REPO: Record<string, string | null> = {
  tools: "cacc-hq",
  apply_portal: "cacc-apply",
  training: "cacc-training",
  cacc_site: "cacc-website",
  general: null,
};

export const OPEN_BUG_STATUSES = ["new", "in_review", "needs_info", "building"];
export const OPEN_FEATURE_STATUSES = ["new", "in_review", "needs_info", "planned", "building"];

interface QueueRow {
  id: string;
  system: string;
  status: string;
  body: string;
  submitter_name: string | null;
  created_at: string;
  agent_task_ref: { id?: string; repo?: string; number?: number } | null;
  summary: string | null;
  severity: string | null;
  confidence: string | null;
  root_cause: string | null;
  proposed_fix: string | null;
  triaged: boolean;
  agent_status: string | null;
  agent_number: number | null;
  total: string;
}

function toTicket(kind: QueueTicket["kind"], r: QueueRow): QueueTicket {
  const repoSlug = SYSTEM_REPO[r.system] ?? null;
  const ref = r.agent_task_ref;
  const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
  return {
    kind,
    id: r.id,
    system: r.system,
    status: r.status,
    title: oneLine(r.summary ?? r.body).slice(0, 140),
    submitter: r.submitter_name ?? "(unknown)",
    age: ageLabel(r.created_at),
    severity: r.severity ?? undefined,
    confidence: r.confidence != null ? Number(r.confidence) : undefined,
    repoSlug,
    dispatchable: r.triaged && repoSlug !== null && !ref?.id,
    agent: ref?.id
      ? {
          taskId: String(ref.id),
          repo: ref.repo ?? repoSlug ?? "?",
          number: r.agent_number ?? ref.number,
          status: r.agent_status ?? undefined,
        }
      : undefined,
    detail: r.body.trim(),
    triage: r.triaged
      ? {
          rootCause: r.root_cause ?? undefined,
          proposedFix: r.proposed_fix ?? undefined,
        }
      : undefined,
  };
}

const AGENT_JOIN = `left join agents.tasks t
       on t.id = nullif(r.agent_task_ref->>'id','')::bigint`;

export async function fetchCaccQueue(): Promise<CaccPanelState["queue"]> {
  try {
    const dbUrl = await vaultSecret(
      "cacc",
      "CACC Core / Supabase",
      "SUPABASE_SUPAVISOR_TRANSACTION_URL",
    );

    const inList = (statuses: string[]) => statuses.map((s) => `'${s}'`).join(",");
    const [bugs, features] = await Promise.all([
      poolerQuery<QueueRow>(
        dbUrl,
        false,
        `select r.id, r.system, r.status, r.description as body, r.submitter_name,
                r.created_at, r.agent_task_ref,
                r.ai_triage->>'summary' as summary,
                r.ai_triage->>'severity' as severity,
                r.ai_triage->>'confidence' as confidence,
                r.ai_triage->>'root_cause_hypothesis' as root_cause,
                r.ai_triage->>'proposed_fix' as proposed_fix,
                (r.ai_triage->>'claude_code_prompt' is not null) as triaged,
                t.status as agent_status, t.number as agent_number,
                count(*) over () as total
           from hq.bug_reports r ${AGENT_JOIN}
          where r.archived_at is null and r.status in (${inList(OPEN_BUG_STATUSES)})
          order by r.created_at desc
          limit 30`,
      ),
      poolerQuery<QueueRow>(
        dbUrl,
        false,
        `select r.id, r.system, r.status, r.idea as body, r.submitter_name,
                r.created_at, r.agent_task_ref,
                r.ai_triage->>'summary' as summary,
                null as severity,
                r.ai_triage->>'confidence' as confidence,
                r.ai_triage->>'understanding' as root_cause,
                r.ai_triage->>'proposed_design' as proposed_fix,
                (r.ai_triage->>'claude_code_prompt' is not null) as triaged,
                t.status as agent_status, t.number as agent_number,
                count(*) over () as total
           from hq.feature_requests r ${AGENT_JOIN}
          where r.archived_at is null and r.status in (${inList(OPEN_FEATURE_STATUSES)})
          order by r.created_at desc
          limit 30`,
      ),
    ]);

    const items = [
      ...bugs.map((r) => toTicket("bug", r)),
      ...features.map((r) => toTicket("feature", r)),
    ].sort((a, b) => {
      // Undispatched work floats above tickets an agent already owns.
      const aOwned = a.agent ? 1 : 0;
      const bOwned = b.agent ? 1 : 0;
      if (aOwned !== bOwned) return aOwned - bOwned;
      return 0; // stable: keeps each kind's created_at desc ordering
    });

    const hotBug = items.some(
      (i) => i.kind === "bug" && !i.agent && (i.severity === "high" || i.severity === "critical"),
    );
    return {
      connector: { connected: true },
      directives: { attention: hotBug },
      bugs: Number(bugs[0]?.total ?? 0),
      features: Number(features[0]?.total ?? 0),
      items,
    };
  } catch (err) {
    return {
      connector: { connected: false, reason: `HQ queue: ${(err as Error).message}` },
      bugs: 0,
      features: 0,
      items: [],
    };
  }
}
