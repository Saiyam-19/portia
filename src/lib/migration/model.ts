import "server-only";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { ModelAlias } from "./contracts";
import { withSafeModelErrors } from "./safe-model";
import type { ModelErrorContext } from "./error-reporting";
import { withCompleteModelSteps } from "./complete-model-step";
import { MIGRATION_TRANSPORT_POLICY } from "./agent-policy";
import { PRIVATE_BUSINESS_TOOLS } from "../portia/tool-names";

// Sol passed the 12/12 interpretation screen; Luna scored 9/12. The price
// ceiling below is USD per million tokens and must admit Sol's Azure price.
export const PORTIA_MODEL_ID = "openai/gpt-6-sol";
/** Provider 3.1.0 drops the AI SDK per-tool strict flag when mapping Chat
 * Completions tools. Forward that documented setting for our strict schemas. */
export const strictBusinessToolFetch: typeof fetch = (input, init) => {
  if (typeof init?.body !== "string") return fetch(input, init);
  const body = JSON.parse(init.body);
  for (const entry of body.tools ?? []) if (PRIVATE_BUSINESS_TOOLS.has(entry.function?.name)) entry.function.strict = true;
  return fetch(input, { ...init, body: JSON.stringify(body) });
};
/** Both historical aliases resolve to the explicitly approved runtime model. */
export function migrationLanguageModel(alias: ModelAlias, context: ModelErrorContext = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OpenRouter is not configured.");
  if (process.env.LLM_ALLOW_PAID !== "true") throw new Error("Paid migration models require LLM_ALLOW_PAID=true.");
  const openrouter = createOpenRouter({ apiKey, fetch: strictBusinessToolFetch });
  return withSafeModelErrors(withCompleteModelSteps(openrouter.chat(PORTIA_MODEL_ID, {
    reasoning: { effort: "none" },
    provider: { only: ["azure"], allow_fallbacks: false, require_parameters: true, data_collection: "deny", zdr: true, max_price: { prompt: 2, completion: 10 } },
  }), MIGRATION_TRANSPORT_POLICY), { ...context, modelAlias: alias });
}
