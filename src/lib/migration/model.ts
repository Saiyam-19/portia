import "server-only";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { ModelAlias } from "./contracts";
import { withSafeModelErrors } from "./safe-model";
import type { ModelErrorContext } from "./error-reporting";
import { withCompleteModelSteps } from "./complete-model-step";
import { MIGRATION_TRANSPORT_POLICY } from "./agent-policy";

/** Sol for v1, chosen from the end-to-end tests; Luna is cheaper for development runs.
 * The price ceiling (USD per million tokens) must admit Sol's Azure price. */
export const DEFAULT_MODEL_ID = "openai/gpt-6-sol";
export const ALLOWED_MODEL_IDS = ["openai/gpt-6-luna", "openai/gpt-6-sol"] as const;

export function berthwiseModelId(value = process.env.BERTHWISE_MODEL): string {
  return value && (ALLOWED_MODEL_IDS as readonly string[]).includes(value) ? value : DEFAULT_MODEL_ID;
}

/** Both historical aliases resolve to the configured server-only model. */
export function migrationLanguageModel(alias: ModelAlias, context: ModelErrorContext = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OpenRouter is not configured.");
  if (process.env.LLM_ALLOW_PAID !== "true") throw new Error("Paid migration models require LLM_ALLOW_PAID=true.");
  const openrouter = createOpenRouter({ apiKey });
  return withSafeModelErrors(withCompleteModelSteps(openrouter.chat(berthwiseModelId(), {
    reasoning: { effort: "none" },
    provider: { only: ["azure"], allow_fallbacks: false, require_parameters: true, data_collection: "deny", zdr: true, max_price: { prompt: 2, completion: 10 } },
  }), MIGRATION_TRANSPORT_POLICY), { ...context, modelAlias: alias });
}
