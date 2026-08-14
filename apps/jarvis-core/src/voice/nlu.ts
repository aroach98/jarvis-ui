import type { ConnectorStatus } from "@jarvis-ui/shared";

export type Intent =
  | { kind: "cacc_inbox" }
  | { kind: "cacc_checks" }
  | { kind: "momentum_crm" }
  | { kind: "personal_tasks" }
  | { kind: "set_mode"; mode: "free" | "pro" }
  | { kind: "chat" };

/**
 * Free-mode intent routing. Deterministic rules catch the canned queries
 * (no model call, instant); everything else defers to the local Ollama model
 * for a one-word classification, falling back to "chat" when the box is
 * unreachable. No cloud call ever happens here — that's Phase 4's pro path.
 */
export class FreeNlu {
  constructor(
    private readonly ollamaUrl: string,
    private readonly model: string,
  ) {}

  async health(): Promise<ConnectorStatus> {
    try {
      const res = await fetch(`${this.ollamaUrl}/api/version`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok
        ? { connected: true }
        : { connected: false, reason: `Ollama HTTP ${res.status}` };
    } catch {
      return {
        connected: false,
        reason: `Ollama not reachable at ${this.ollamaUrl} — rules-only routing`,
      };
    }
  }

  classify(utterance: string): Promise<Intent> {
    const rule = classifyByRules(utterance);
    if (rule) return Promise.resolve(rule);
    return this.classifyByModel(utterance);
  }

  private async classifyByModel(utterance: string): Promise<Intent> {
    const prompt =
      "Classify the voice command into exactly one label from this list:\n" +
      "inbox      - CACC email/inbox/messages/mail\n" +
      "checks     - tests, deploys, gates, site health\n" +
      "crm        - Momentum clients, deals, pipeline\n" +
      "tasks      - personal to-dos, taskers, chores, due dates\n" +
      "mode_pro   - switch to premium/pro mode\n" +
      "mode_free  - switch to free/save mode\n" +
      "chat       - anything else\n" +
      `Command: "${utterance}"\n` +
      "Answer with only the label.";
    try {
      const res = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: { temperature: 0, num_predict: 8 },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { response?: string };
      const label = (body.response ?? "").trim().toLowerCase();
      if (label.includes("inbox")) return { kind: "cacc_inbox" };
      if (label.includes("check")) return { kind: "cacc_checks" };
      if (label.includes("crm")) return { kind: "momentum_crm" };
      if (label.includes("task")) return { kind: "personal_tasks" };
      if (label.includes("mode_pro")) return { kind: "set_mode", mode: "pro" };
      if (label.includes("mode_free")) return { kind: "set_mode", mode: "free" };
      return { kind: "chat" };
    } catch {
      return { kind: "chat" };
    }
  }

  /** Free-form answer over a real-data context block. Returns null offline. */
  async chat(utterance: string, context: string): Promise<string | null> {
    try {
      const res = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt:
            "You are Jarvis, a concise voice assistant. The DATA block below is " +
            "the live state of the user's dashboards — answer ONLY from it, in " +
            "at most two short spoken sentences. If the data can't answer, say so.\n" +
            `DATA:\n${context}\n\nUser: ${utterance}\nJarvis:`,
          stream: false,
          options: { temperature: 0.3, num_predict: 120 },
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { response?: string };
      const text = (body.response ?? "").trim();
      return text.length > 0 ? text : null;
    } catch {
      return null;
    }
  }
}

export function classifyByRules(utterance: string): Intent | null {
  const u = utterance.toLowerCase();
  if (/\b(go|switch( to)?)\s+(premium|pro)\b/.test(u)) return { kind: "set_mode", mode: "pro" };
  if (/\b(save mode|free mode|go free)\b/.test(u)) return { kind: "set_mode", mode: "free" };
  if (/\b(inbox|e-?mails?|messages?|unread|flagged)\b/.test(u)) return { kind: "cacc_inbox" };
  if (/\b(checks?|tests?|suites?|deploys?|deployments?|gate|proving ground)\b/.test(u)) {
    return { kind: "cacc_checks" };
  }
  if (/\b(crm|clients?|deals?|pipeline|momentum)\b/.test(u)) return { kind: "momentum_crm" };
  if (/\b(tasks?|taskers?|to-?dos?|due|chores?)\b/.test(u)) return { kind: "personal_tasks" };
  return null;
}
