import "server-only";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { ModelAlias } from "./contracts";
import { migrationTestModelActive } from "./config";
import { withSafeModelErrors } from "./safe-model";
import type { ModelErrorContext } from "./error-reporting";

const MODEL_IDS: Record<ModelAlias, string> = {
  "model-1": "openai/gpt-6.1-sol",
  "model-2": "deepseek/deepseek-v4.1-flash-1017",
};

export function migrationLanguageModel(alias: ModelAlias, context: ModelErrorContext = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OpenRouter is not configured.");
  const testOverride = migrationTestModelActive();
  const devModel = process.env.NODE_ENV === "development" ? process.env.PORTIA_DEV_MODEL : undefined;
  if (!testOverride && process.env.LLM_ALLOW_PAID !== "true") {
    throw new Error("Paid migration models require LLM_ALLOW_PAID=true.");
  }
  const modelId = !testOverride && devModel ? devModel : testOverride
    ? process.env.MIGRATION_MODEL_OVERRIDE!
    : MODEL_IDS[alias];
  if (testOverride && modelId !== "openrouter/free" && !modelId.endsWith(":free")) {
    throw new Error("Migration test model override must be explicitly free.");
  }
  const openrouter = createOpenRouter({ apiKey });
  return withSafeModelErrors(openrouter.chat(modelId, {
    reasoning: testOverride ? { enabled: false, effort: "none" } : { effort: "low" },
    provider: {
      allow_fallbacks: false,
      require_parameters: true,
      data_collection: "deny",
      zdr: true,
      ...(testOverride
        ? { max_price: { prompt: 0, completion: 0, request: 0 } }
        : {}),
    },
  }), { ...context, modelAlias: alias });
}
