/**
 * Optional LLM explanation of a RECORDED decision. The model only narrates numbers already computed and stored;
 * it never participates in the decision. Disabled unless ANTHROPIC_API_KEY is set.
 */
import type { DecisionRecord } from "@predictit/engine";
import type { Env } from "./env";

export async function explainDecision(env: Env, decision: DecisionRecord | null, decisionId?: string): Promise<{ text: string; model?: string; disabled?: boolean }> {
  if (!env.ANTHROPIC_API_KEY) return { text: "Explanation is disabled (no ANTHROPIC_API_KEY configured).", disabled: true };
  if (!decision) return { text: "No decision recorded yet." };
  if (decisionId && decision.id !== decisionId) return { text: "Requested decision is not the current one; explanations are only generated for recorded records." };
  const compact = {
    state: decision.state,
    asOf: new Date(decision.asOf).toISOString(),
    phase: decision.phase,
    mode: decision.mode,
    primary: decision.primary ? { name: decision.primary.name, direction: decision.primary.direction, lifecycle: decision.primary.lifecycle, trigger: decision.primary.triggerCondition, invalidation: decision.primary.invalidationText, horizonMinutes: decision.primary.horizonMinutes, evidence: decision.primary.evidence.map((e) => `${e.label}: ${e.value}`), counterargument: decision.primary.counterargument } : null,
    topContract: decision.contracts[0] ?? null,
    passReasons: decision.passReasons,
    whyWait: decision.whyWait,
    regime: { trend: decision.regime.trend, volatility: decision.regime.volatility, gamma: decision.regime.gamma, liquidity: decision.regime.liquidity, dataConfidence: decision.regime.dataConfidence, evidence: decision.regime.evidence },
    closing: decision.closing ? { subWindow: decision.closing.subWindow, recommendation: decision.closing.recommendation } : null,
    dataNotes: decision.dataNotes.map((n) => `${n.level}: ${n.message}`),
  };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-5-5",
      max_tokens: 500,
      system: "You explain a recorded trading-decision record in plain English for its owner. Only restate what is in the record. Do not add predictions, probabilities, or advice. Keep it under 150 words. Mention the strongest counterargument and the data-quality limits.",
      messages: [{ role: "user", content: JSON.stringify(compact) }],
    }),
  });
  if (!res.ok) return { text: `Explanation unavailable (${res.status}).` };
  const j = (await res.json()) as { content: Array<{ type: string; text?: string }>; model: string };
  return { text: j.content.map((c) => c.text ?? "").join(""), model: j.model };
}
