import { vaultSecret } from "./vault.js";

/**
 * Machine-token client for the AGENTS pipeline's ingest surface
 * (agents.cacadets.org — the same endpoint cacc-hq's bug reporter uses).
 * Token: CACC vault "CACC Core / Cross-app shared secrets" /
 * AGENTS_INGEST_TOKEN. Fail closed like every other connector.
 */
export const AGENTS_URL = "https://agents.cacadets.org";

export interface IngestedTask {
  taskId: string;
  number?: number;
  repo: string;
}

async function token(): Promise<string> {
  return vaultSecret("cacc", "CACC Core / Cross-app shared secrets", "AGENTS_INGEST_TOKEN");
}

/** POST /api/ingest/tasks {repo, text} → the created task's identity. */
export async function ingestAgentsTask(repo: string, text: string): Promise<IngestedTask> {
  const res = await fetch(`${AGENTS_URL}/api/ingest/tasks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${await token()}`,
    },
    body: JSON.stringify({ repo, text }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    task?: { id?: number | string; number?: number; repo?: string };
  };
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`repo "${repo}" is not registered on agents.cacadets.org`);
    }
    throw new Error(json.error ?? `AGENTS ingest → HTTP ${res.status}`);
  }
  const task = json.task ?? {};
  if (task.id == null) throw new Error("AGENTS ingest returned no task id");
  return { taskId: String(task.id), number: task.number, repo: task.repo ?? repo };
}
