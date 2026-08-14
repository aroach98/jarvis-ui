import pg from "pg";
import { SUPABASE_ROOT_CA } from "./supabaseCa.js";

/**
 * One-shot query against a Supavisor transaction pooler. A fresh client per
 * poll keeps this trivially correct (no idle connections against the shared
 * projects' max_connections); at a 60s cadence the handshake cost is noise.
 *
 * TLS matches each upstream repo's own convention: the Momentum pooler leaf
 * chains to the Supabase Root 2021 CA (pin it, like clients/src/lib/db.ts);
 * CACC's cacc-testing runners connect with rejectUnauthorized:false.
 */
export async function poolerQuery<R extends pg.QueryResultRow>(
  connectionString: string,
  pinCa: boolean,
  sql: string,
  params: unknown[] = [],
): Promise<R[]> {
  const client = new pg.Client({
    connectionString,
    ssl: pinCa ? { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true } : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
    query_timeout: 15_000,
  });
  await client.connect();
  try {
    const res = await client.query<R>(sql, params);
    return res.rows;
  } finally {
    await client.end().catch(() => {});
  }
}
