import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { expect, it, vi } from "vitest";
import { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";
import { AgentWorkspace } from "../../src/lib/memory/workspace";

const result: LanguageModelV4GenerateResult = {
  content: [{ type: "text", text: "Ready" }],
  finishReason: { unified: "stop", raw: undefined },
  usage: { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } },
  warnings: [],
};
it("loads fresh memory context before the model sees a new chat", async () => {
  const model = new MockLanguageModelV4({ doGenerate: result });
  const memory = { instructions: vi.fn(async () => "MEMORY_CONTEXT_FIXTURE_9187") };
  await createMigrationMainAgent({ alias: "model-1", mainModel: model, memory, workspace: await AgentWorkspace.ephemeral() }).generate({ prompt: "What did I save?" });
  expect(memory.instructions).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(model.doGenerateCalls[0].prompt)).toContain("MEMORY_CONTEXT_FIXTURE_9187");
});
it("does not make a provider call after the memory epoch was invalidated", async () => {
  const model = new MockLanguageModelV4({ doGenerate: result });
  const memory = { instructions: async () => { throw new Error("MEMORY_CHANGED"); } };
  await expect(createMigrationMainAgent({ alias: "model-1", mainModel: model, memory, workspace: await AgentWorkspace.ephemeral() }).generate({ prompt: "Continue" })).rejects.toThrow("MEMORY_CHANGED");
  expect(model.doGenerateCalls).toHaveLength(0);
});
