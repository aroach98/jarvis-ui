import type { CrmStage, MomentumPanelState } from "@jarvis-ui/shared";
import { poolerQuery } from "../lib/db.js";
import { vaultSecret } from "../lib/vault.js";

interface DealRow {
  name: string;
  stage: CrmStage;
}

const OPEN_STAGES: CrmStage[] = ["lead", "discovery", "proposal_sent", "negotiation"];

/** Open pipeline from mscrm.deals, newest movement first. */
export async function fetchMomentumCrm(): Promise<MomentumPanelState["crm"]> {
  try {
    const dbUrl = await vaultSecret("momentum", "Momentum Core / Supabase", "CRM_DATABASE_URL");
    const rows = await poolerQuery<DealRow>(
      dbUrl,
      true,
      // company_id is nullable → left join, fall back to the deal's own name.
      `select coalesce(c.name, d.name) as name, d.stage
         from mscrm.deals d
         left join mscrm.companies c on c.id = d.company_id
        where d.stage = any($1)
        order by d.updated_at desc
        limit 10`,
      [OPEN_STAGES],
    );
    return {
      connector: { connected: true },
      clients: rows.map((r) => ({ name: r.name, stage: r.stage })),
    };
  } catch (err) {
    return {
      connector: { connected: false, reason: `mscrm: ${(err as Error).message}` },
      clients: [],
    };
  }
}
