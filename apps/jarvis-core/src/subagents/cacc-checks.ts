import type { CaccPanelState, CheckItem, CheckVerdict } from "@jarvis-ui/shared";
import { poolerQuery } from "../lib/db.js";
import { vaultSecret } from "../lib/vault.js";

/**
 * Proving Ground verdicts + hq gate decision + Vercel prod deploy state.
 * Waiver subtlety (testing migration 0034): runs.status is already 'passed'
 * when every failure is waived, with the count in runs.waived — so verdict
 * comes from runs.status + waived, never from re-counting run_results.
 */

interface RunRow {
  site_id: string;
  status: string;
  failed: number;
  waived: number;
  started_at: string;
  criticality: string;
  prod_url: string;
}
interface GateRow {
  site_id: string;
  decision: string;
}

const STALE_DAYS = 7;

function runVerdict(r: RunRow): { verdict: CheckVerdict; label: string } {
  const staleMs = Date.now() - Date.parse(r.started_at);
  const stale = staleMs > STALE_DAYS * 86_400_000;
  if (r.status === "passed" && Number(r.waived) > 0) {
    return { verdict: "waived", label: `${r.waived} waived` };
  }
  if (r.status === "passed") {
    return stale
      ? { verdict: "failed", label: `stale (${STALE_DAYS}d+)` }
      : { verdict: "ok", label: "passed" };
  }
  return { verdict: "failed", label: r.status };
}

const GATE_VERDICT: Record<string, CheckVerdict> = {
  promoted: "ok",
  held_for_human: "waived",
  shadow: "waived",
  blocked: "failed",
  error: "failed",
};

async function vercelDeployChecks(sites: RunRow[]): Promise<CheckItem[]> {
  const token = await vaultSecret("cacc", "CACC Core / Vercel", "VERCEL_TOKEN");
  const keySites = sites.filter((s) => s.criticality === "red" || s.criticality === "amber");
  return Promise.all(
    keySites.map(async (s): Promise<CheckItem> => {
      const host = s.prod_url.replace(/^https?:\/\//, "");
      try {
        const res = await fetch(
          `https://api.vercel.com/v13/deployments/${host}?slug=california-cadet-corps`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const dep = (await res.json()) as { readyState?: string; status?: string };
        const state = (dep.readyState ?? dep.status ?? "unknown").toUpperCase();
        const verdict: CheckVerdict =
          state === "READY" ? "ok" : state === "ERROR" || state === "CANCELED" ? "failed" : "waived";
        return {
          site: `${s.site_id} · prod`,
          label: state === "READY" ? "deployed" : state.toLowerCase(),
          verdict,
        };
      } catch (err) {
        return { site: `${s.site_id} · prod`, label: (err as Error).message, verdict: "failed" };
      }
    }),
  );
}

export async function fetchCaccChecks(): Promise<CaccPanelState["checks"]> {
  try {
    const dbUrl = await vaultSecret(
      "cacc",
      "CACC Core / Supabase",
      "SUPABASE_SUPAVISOR_TRANSACTION_URL",
    );

    const runs = await poolerQuery<RunRow>(
      dbUrl,
      false,
      `select distinct on (r.site_id)
              r.site_id, r.status, r.failed, r.waived, r.started_at,
              s.criticality, s.prod_url
         from testing.runs r
         join testing.sites s on s.site_id = r.site_id
        where r.finished_at is not null and s.active
        order by r.site_id, r.started_at desc`,
    );
    const gates = await poolerQuery<GateRow>(
      dbUrl,
      false,
      `select distinct on (site_id) site_id, decision
         from testing.promotions
        order by site_id, decided_at desc`,
    );

    const suiteItems: CheckItem[] = runs.map((r) => {
      const { verdict, label } = runVerdict(r);
      return { site: `${r.site_id} · suite`, label, verdict };
    });
    const gateItems: CheckItem[] = gates.map((g) => ({
      site: `${g.site_id} · gate`,
      label: g.decision.replace(/_/g, " "),
      verdict: GATE_VERDICT[g.decision] ?? "failed",
    }));
    const deployItems = await vercelDeployChecks(runs).catch((err: Error) => [
      { site: "vercel", label: err.message, verdict: "failed" as CheckVerdict },
    ]);

    // Problems first, then the healthy rows — the portrait panel has room
    // for the whole fleet, so show it rather than collapsing to a summary.
    const all = [...gateItems, ...deployItems, ...suiteItems];
    const items = [
      ...all.filter((i) => i.verdict !== "ok"),
      ...all.filter((i) => i.verdict === "ok"),
    ];

    return {
      connector: { connected: true },
      directives: { attention: items.some((i) => i.verdict === "failed") },
      items,
    };
  } catch (err) {
    return {
      connector: { connected: false, reason: `Proving Ground: ${(err as Error).message}` },
      items: [],
    };
  }
}
