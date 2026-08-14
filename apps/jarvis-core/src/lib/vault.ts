import { getEnv } from "./env.js";

/**
 * Vault client for the two world vaults (identical API). Fail closed: a miss
 * throws with the exact collection/key so the subagent renders disconnected
 * with that reason — never fall back to another source or invent a value.
 */
const VAULTS = {
  cacc: { host: "https://vault.cacadets.org", tokenVar: "CACC_VAULT_TOKEN" },
  momentum: { host: "https://vault.momentumsystems.dev", tokenVar: "MOMENTUM_VAULT_TOKEN" },
} as const;

export type VaultWorld = keyof typeof VAULTS;

const cache = new Map<string, { value: string; at: number }>();
const CACHE_MS = 10 * 60 * 1000;

export async function vaultSecret(
  world: VaultWorld,
  collection: string,
  key: string,
): Promise<string> {
  const cacheKey = `${world}/${collection}/${key}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const { host, tokenVar } = VAULTS[world];
  const token = getEnv(tokenVar);
  if (!token) throw new Error(`${tokenVar} is unset (checked User scope too)`);

  const url = `${host}/api/secrets/${encodeURIComponent(collection)}/${encodeURIComponent(key)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`vault ${world}: ${collection}/${key} → HTTP ${res.status}`);
  }
  const body = (await res.json()) as { value?: string };
  if (typeof body.value !== "string" || body.value.trim() === "") {
    throw new Error(`vault ${world}: ${collection}/${key} returned no value`);
  }
  // Stored values aren't whitespace-normalized; an untrimmed credential fails
  // exactly like a revoked one.
  const value = body.value.trim();
  cache.set(cacheKey, { value, at: Date.now() });
  return value;
}
