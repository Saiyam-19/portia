import { generateText } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrationLanguageModel } from "../../src/lib/migration/model";

const bodies: Array<Record<string, unknown>> = [];

beforeEach(() => {
  bodies.length = 0;
  vi.stubEnv("OPENROUTER_API_KEY", "synthetic-key");
  vi.stubEnv("MIGRATION_TEST_MODE", "true");
  vi.stubEnv("MIGRATION_MODEL_OVERRIDE", "apodex/apodex-1.1-mini:free");
  vi.stubEnv("LLM_ALLOW_PAID", "false");
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    bodies.push(body);
    return Response.json({
      id: "synthetic-completion", object: "chat.completion", created: 1,
      model: body.model,
      choices: [{ index: 0, message: { role: "assistant", content: "Synthetic reply" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("temporary free migration routing", () => {
  it("uses the explicitly configured dev model for both aliases only outside production", async () => {
    vi.stubEnv("MIGRATION_TEST_MODE", "false");
    vi.stubEnv("LLM_ALLOW_PAID", "true");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PORTIA_DEV_MODEL", "deepseek/deepseek-v4.1-flash-1017");
    for (const alias of ["model-1", "model-2"] as const) await generateText({ model: migrationLanguageModel(alias), prompt: "Synthetic dev routing test", maxRetries: 0 });
    expect(bodies.map(body => body.model)).toEqual(["deepseek/deepseek-v4.1-flash-1017", "deepseek/deepseek-v4.1-flash-1017"]);
    vi.stubEnv("NODE_ENV", "production");
    await generateText({ model: migrationLanguageModel("model-1"), prompt: "Synthetic production routing test", maxRetries: 0 });
    expect(bodies[2].model).toBe("openai/gpt-6.1-sol");
  });
  it("routes both aliases free with zero-price and privacy restrictions", async () => {
    for (const alias of ["model-1", "model-2"] as const) {
      await generateText({ model: migrationLanguageModel(alias), prompt: "Synthetic routing test", maxRetries: 0 });
    }
    expect(bodies).toHaveLength(2);
    for (const body of bodies) {
      expect(body.model).toBe("apodex/apodex-1.1-mini:free");
      expect(body.provider).toMatchObject({
        allow_fallbacks: false, require_parameters: true, data_collection: "deny", zdr: true,
        max_price: { prompt: 0, completion: 0, request: 0 },
      });
      expect(body.reasoning).toMatchObject({ enabled: false, effort: "none" });
    }
  });

  it("rejects a paid override and fails closed if free mode is removed", () => {
    vi.stubEnv("MIGRATION_MODEL_OVERRIDE", "paid/model");
    expect(() => migrationLanguageModel("model-1")).toThrow(/explicitly free/);
    vi.stubEnv("MIGRATION_TEST_MODE", "false");
    expect(() => migrationLanguageModel("model-1")).toThrow(/Paid migration models/);
    expect(bodies).toHaveLength(0);
  });

  it("keeps the original paid mapping available for an explicit later opt-in", async () => {
    vi.stubEnv("MIGRATION_TEST_MODE", "false");
    vi.stubEnv("LLM_ALLOW_PAID", "true");
    for (const alias of ["model-1", "model-2"] as const) {
      await generateText({ model: migrationLanguageModel(alias), prompt: "Synthetic routing test", maxRetries: 0 });
    }
    expect(bodies[0].model).toBe("openai/gpt-6.1-sol");
    expect(bodies[1].model).toBe("anthropic/claude-opus-5.5");
    for (const body of bodies) {
      // These endpoints support tools, but not this optional parallel-call parameter.
      // Sending it with require_parameters=true filters out every eligible endpoint.
      expect(body).not.toHaveProperty("parallel_tool_calls");
      expect(body.provider).toMatchObject({
        allow_fallbacks: false, require_parameters: true, data_collection: "deny", zdr: true,
      });
    }
  });
});
