import "server-only";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { ModelAlias } from "./contracts";
import { migrationTestModelActive } from "./config";
import { localBackendTarget } from "./local-target";
import { withSafeModelErrors } from "./safe-model";
import type { ModelErrorContext } from "./error-reporting";

const MODEL_IDS: Record<ModelAlias, string> = {
  "model-1": "openai/gpt-6.1-sol",
  "model-2": "anthropic/claude-opus-5.5",
};

export function migrationLanguageModel(alias: ModelAlias, context: ModelErrorContext = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OpenRouter is not configured.");
  const testOverride = migrationTestModelActive();
  if (!testOverride && process.env.LLM_ALLOW_PAID !== "true") {
    throw new Error("Paid migration models require LLM_ALLOW_PAID=true.");
  }
  const modelId = testOverride
    ? process.env.MIGRATION_MODEL_OVERRIDE!
    : MODEL_IDS[alias];
  if (testOverride && modelId !== "openrouter/free" && !modelId.endsWith(":free")) {
    throw new Error("Migration test model override must be explicitly free.");
  }
  // Explicit consent for synthetic, isolated acceptance only. This cannot
  // change privacy routing on a cloud deployment or the normal paid path.
  const allowLocalTestRetention = testOverride && process.env.PORTIA_FREE_TEST_ALLOW_RETENTION === "true" &&
    localBackendTarget(process.env, process.env.NEXT_PUBLIC_CONVEX_URL, process.env.NEXT_PUBLIC_CONVEX_SITE_URL);
  const openrouter = createOpenRouter({ apiKey });
  return withSafeModelErrors(openrouter.chat(modelId, {
    reasoning: testOverride ? { enabled: false, effort: "none" } : { effort: "low" },
    provider: {
      allow_fallbacks: false,
      require_parameters: true,
      data_collection: allowLocalTestRetention ? "allow" : "deny",
      zdr: !allowLocalTestRetention,
      ...(testOverride
        ? { max_price: { prompt: 0, completion: 0, request: 0 } }
        : {}),
    },
  }), { ...context, modelAlias: alias });
}
