import type { ConnectorStatus } from "@jarvis-ui/shared";

/**
 * Client for Murmur's server mode (the Whisper.net pipeline exposed over
 * localhost HTTP — see the Murmur repo). Contract:
 *   GET  /health      → { ok: true, model: "..." }
 *   POST /transcribe  (body: audio/wav) → { text: "..." }
 */
export class MurmurStt {
  constructor(private readonly baseUrl: string) {}

  async health(): Promise<ConnectorStatus> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return { connected: false, reason: `Murmur health HTTP ${res.status}` };
      return { connected: true };
    } catch {
      return {
        connected: false,
        reason: `Murmur not reachable at ${this.baseUrl} — start Murmur (server mode)`,
      };
    }
  }

  async transcribe(wav: Buffer): Promise<string> {
    const res = await fetch(`${this.baseUrl}/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "audio/wav" },
      body: wav,
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Murmur transcribe HTTP ${res.status}`);
    const body = (await res.json()) as { text?: string };
    if (typeof body.text !== "string") throw new Error("Murmur returned no text");
    return body.text.trim();
  }
}
