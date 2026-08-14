import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Microsoft Graph access to andrew.roach@cacadets.org, sharing the token
 * cache (and its refresh-rotation contract) with ~/.cacc-graph/mail.ps1:
 * refresh when <5 min from expiry, persist the rotated refresh_token.
 */
const TOKEN_PATH = path.join(os.homedir(), ".cacc-graph", "token.json");
const SCOPE = "offline_access User.Read Mail.ReadWrite Mail.Send";

interface TokenCache {
  access_token: string;
  access_expires: string;
  refresh_token: string;
  tenant: string;
  clientId: string;
  [extra: string]: unknown;
}

let refreshing: Promise<string> | null = null;

async function refreshToken(cache: TokenCache): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${cache.tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: cache.clientId,
        refresh_token: cache.refresh_token,
        scope: SCOPE,
      }),
    },
  );
  if (!res.ok) throw new Error(`Graph token refresh failed: HTTP ${res.status}`);
  const tok = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
  cache.access_token = tok.access_token;
  cache.access_expires = new Date(Date.now() + tok.expires_in * 1000).toISOString();
  if (tok.refresh_token) cache.refresh_token = tok.refresh_token;
  writeFileSync(TOKEN_PATH, JSON.stringify(cache, null, 2));
  return cache.access_token;
}

async function getToken(): Promise<string> {
  let cache: TokenCache;
  try {
    cache = JSON.parse(readFileSync(TOKEN_PATH, "utf8")) as TokenCache;
  } catch {
    throw new Error(`no Graph token cache at ~/.cacc-graph/token.json — run the device-code login`);
  }
  if (Date.now() < Date.parse(cache.access_expires) - 5 * 60 * 1000) {
    return cache.access_token;
  }
  // Single-flight so concurrent polls don't race the rotating refresh_token.
  refreshing ??= refreshToken(cache).finally(() => (refreshing = null));
  return refreshing;
}

export async function graphGet<T>(
  pathOrUrl: string,
  headers: Record<string, string> = {},
): Promise<T> {
  const url = pathOrUrl.startsWith("https://")
    ? pathOrUrl
    : `https://graph.microsoft.com/v1.0${pathOrUrl}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${await getToken()}`, ...headers },
  });
  if (!res.ok) throw new Error(`Graph GET ${pathOrUrl} → HTTP ${res.status}`);
  return (await res.json()) as T;
}
