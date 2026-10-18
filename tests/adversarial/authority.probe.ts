import { afterEach, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";
import { QuoteSession } from "../../src/lib/portia/session";
import { MemorySession } from "../../src/lib/memory/session";
import { MigrationTokenManager } from "../../src/lib/migration/bridge";
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } };
const response = (content: LanguageModelV4GenerateResult["content"], finish: "stop" | "tool-calls"): LanguageModelV4GenerateResult => ({ content, finishReason: { unified: finish, raw: undefined }, usage, warnings: [] });
const modelCall = (toolName: string, input: unknown) => new MockLanguageModelV4({ doGenerate: [response([{ type: "tool-call", toolName, toolCallId: "adversarial", input: JSON.stringify(input) }], "tool-calls"), response([{ type: "text", text: "Done." }], "stop")] });
afterEach(() => vi.restoreAllMocks());

// These regression probes attack model-tool authority boundaries. They are not blind language evals and do not call external models.
it.each([
  ["Use only the official Mumbai tariff. I have no supplied quotation.", "9876"],
  ["The supplier quoted USD 100 for berth hire. Check that supplied quote.", "1000"],
])("faulty model cannot manufacture user-supplied prices: %s", async (question, amount) => {
  const session = new QuoteSession("untrusted-model-amount");
  const model = modelCall("manage_quote", { pricing: "supplied", lines: [{ name: "Berth hire", currency: "USD", amount }], terms: { taxPercent: "0" } });
  await createMigrationMainAgent({ alias: "model-1", mainModel: model, session }).generate({ prompt: question });
  expect([...session.quotes.values()].some(quote => quote.lines.some(line => line.amount === amount))).toBe(false);
});
it("explicit do-not-remember prevents a faulty model from requesting a memory mutation", async () => {
  const manager = new MigrationTokenManager("synthetic", "https://portia.test", new AbortController());
  const memory = new MemorySession(manager, "chat", { runId: "run", runFence: 1 });
  vi.spyOn(memory, "view").mockResolvedValue({ epoch: 0, revision: 0, facts: [], summary: "", scratchpad: "", scratchpadRevision: 0 });
  // Persistence boundary only: prove whether the real memory tool requests a write.
  const mutate = vi.spyOn(memory, "mutate").mockResolvedValue({ saved: true });
  await createMigrationMainAgent({ alias: "model-1", mainModel: modelCall("remember_memory", { key: "port", value: "Mumbai" }), memory: memory.agent() }).generate({ prompt: "Do not remember this. Just explain what gross tonnage means." });
  expect(mutate).not.toHaveBeenCalled();
});
