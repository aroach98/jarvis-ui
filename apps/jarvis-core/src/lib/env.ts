import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** apps/jarvis-core — works from both src/ (tsx) and dist/ (tsc build). */
export const packageDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const dotEnv: Record<string, string> = {};
const dotEnvPath = path.join(packageDir, ".env.local");
if (existsSync(dotEnvPath)) {
  for (const line of readFileSync(dotEnvPath, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    // trim() also strips the stray \r a CRLF file would leave on the value.
    if (m) dotEnv[m[1]!] = m[2]!.trim();
  }
}

const userScopeCache = new Map<string, string | undefined>();

/**
 * process.env only reflects User-scope Windows variables from process start;
 * a token set or rotated since then reads empty. Re-read the User scope
 * authoritatively before concluding a variable is genuinely unset.
 */
function readUserScope(name: string): string | undefined {
  if (userScopeCache.has(name)) return userScopeCache.get(name);
  let value: string | undefined;
  if (process.platform === "win32") {
    try {
      value =
        execFileSync(
          "powershell",
          ["-NoProfile", "-Command", `[Environment]::GetEnvironmentVariable('${name}','User')`],
          { encoding: "utf8", timeout: 10_000 },
        ).trim() || undefined;
    } catch {
      value = undefined;
    }
  }
  userScopeCache.set(name, value);
  return value;
}

/** .env.local wins, then process.env, then the Windows User scope. */
export function getEnv(name: string): string | undefined {
  return dotEnv[name] ?? process.env[name]?.trim() ?? readUserScope(name);
}
