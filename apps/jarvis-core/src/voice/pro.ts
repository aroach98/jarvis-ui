import Anthropic from "@anthropic-ai/sdk";
import type { ConnectorStatus } from "@jarvis-ui/shared";
import { getEnv } from "../lib/env.js";
import type { Intent } from "./nlu.js";
import { classifyByRules } from "./nlu.js";
import { PERSONA_PROMPT } from "./persona.js";

/**
 * Pro-mode reasoning: Claude, only ever invoked while the cost toggle is on
 * "pro" (ARCHITECTURE.md §6 — spend is never silent). Fails closed: with no
 * credential, or on any API error, the caller falls back to the free path.
 * Server-side refusal fallbacks are enabled so a classifier decline re-runs
 * on Anthropic's recommended substitute model instead of dropping the turn.
 */
export class ProNlu {
  private client?: Anthropic;
  private readonly model: string;

  constructor(model?: string) {
    this.model = model ?? "claude-opus-5";
    const key = getEnv("ANTHROPIC_API_KEY");
    // The SDK also resolves ANTHROPIC_AUTH_TOKEN / an `ant auth login`
    // profile on its own; the explicit key just takes precedence.
    try {
      this.client = key ? new Anthropic({ apiKey: key }) : new Anthropic();
    } catch {
      this.client = undefined;
    }
  }

  status(): ConnectorStatus {
    if (getEnv("ANTHROPIC_API_KEY")) return { connected: true };
    return {
      connected: false,
      reason: "no ANTHROPIC_API_KEY in .env.local (and no ant auth profile) — pro reasoning falls back to local",
    };
  }

  async classify(utterance: string): Promise<Intent | null> {
    const rule = classifyByRules(utterance);
    if (rule) return rule;
    const label = await this.complete(
      "Classify the voice command into exactly one label:\n" +
        "inbox | checks | crm | tasks | mode_pro | mode_free | stop_music | chat\n" +
        `Command: "${utterance}"\nAnswer with only the label.`,
      undefined,
      64,
    );
    if (label === null) return null;
    const l = label.toLowerCase();
    if (l.includes("inbox")) return { kind: "cacc_inbox" };
    if (l.includes("check")) return { kind: "cacc_checks" };
    if (l.includes("crm")) return { kind: "momentum_crm" };
    if (l.includes("task")) return { kind: "personal_tasks" };
    if (l.includes("mode_pro")) return { kind: "set_mode", mode: "pro" };
    if (l.includes("mode_free")) return { kind: "set_mode", mode: "free" };
    if (l.includes("stop_music")) return { kind: "stop_music" };
    return { kind: "chat" };
  }

  async chat(utterance: string, context: string): Promise<string | null> {
    return this.complete(
      "The DATA block below is the live state of the user's dashboards — " +
        "answer ONLY from it. If the data can't answer, say so plainly.\n" +
        `DATA:\n${context}\n\nUser: ${utterance}`,
      PERSONA_PROMPT,
      300,
    );
  }

  private async complete(
    prompt: string,
    system: string | undefined,
    maxTokens: number,
  ): Promise<string | null> {
    if (!this.client) return null;
    try {
      const response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        output_config: { effort: "low" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        messages: [{ role: "user", content: prompt }],
      });
      if (response.stop_reason === "refusal") return null;
      const text = response.content.find((b) => b.type === "text");
      return text && "text" in text ? text.text.trim() : null;
    } catch (err) {
      console.warn(`[voice] pro reasoning failed: ${(err as Error).message}`);
      return null;
    }
  }
}
