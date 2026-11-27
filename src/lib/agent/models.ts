import type { ModelAlias } from "../chat/contracts";

/** OpenRouter model behind each alias. The UI and the model only ever say "Model 1" and "Model 2". */
export const MODEL_IDS: Record<ModelAlias, string> = {
  "model-1": "openai/gpt-6.1-sol",
  "model-2": "deepseek/deepseek-v4.1-flash-1017",
};

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
/** Bound provider credit preauthorization; libfx keeps its existing 25k compaction reserve. */
export const MAX_REQUEST_OUTPUT_TOKENS = 8192;

/**
 * libfx compacts when a request reaches 80% of the usable window (the context
 * window minus the output reserve): 0.8 × (400k − 25k) = 300k tokens.
 * `PORTIA_CONTEXT_WINDOW` shrinks the window to exercise compaction locally.
 */
export function contextLimits(env: Record<string, string | undefined> = process.env) {
  const override = Number(env.PORTIA_CONTEXT_WINDOW);
  const contextWindow = Number.isInteger(override) && override >= 8_000 ? Math.min(override, 400_000) : 400_000;
  const maxOutputTokens = Math.min(25_000, Math.floor(contextWindow / 4));
  return { contextWindow, maxOutputTokens, compactAt: Math.floor(0.8 * (contextWindow - maxOutputTokens)) };
}

export type ModelMode = "mock" | "openrouter";

/** The mock is the default; real inference needs an explicit, paid-usage opt-in. */
export function modelMode(env: Record<string, string | undefined> = process.env): ModelMode {
  if (env.PORTIA_MODEL_MODE !== "openrouter") return "mock";
  if (env.LLM_ALLOW_PAID !== "true" || !env.OPENROUTER_API_KEY) {
    throw new Error("PORTIA_MODEL_MODE=openrouter requires LLM_ALLOW_PAID=true and OPENROUTER_API_KEY.");
  }
  return "openrouter";
}

export function customProvider(env: Record<string, string | undefined> = process.env) {
  const { contextWindow, maxOutputTokens } = contextLimits(env);
  return {
    name: "openrouter",
    baseUrl: OPENROUTER_BASE_URL,
    models: Object.fromEntries(Object.values(MODEL_IDS).map(id => [id, { contextWindow, maxOutputTokens, supportsToolUse: true }])),
  };
}
