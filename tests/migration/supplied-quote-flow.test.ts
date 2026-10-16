import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { quotationProposal } from "./conversation-fixtures";
import { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";

const development = JSON.parse(readFileSync("tests/acceptance/portia/development.json", "utf8"));
const original = JSON.parse(readFileSync("output/independent-agent-test-20261014/inputs.json", "utf8"));
const input = (id: string) => development.cases.find((c: { id: string }) => c.id === id).steps[0].text as string;
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } };

// Mock only language interpretation. Real reducer, rule compiler and ledger run.
function dispatcher(question: string) {
  return new MockLanguageModelV4({ doGenerate: async (): Promise<LanguageModelV4GenerateResult> => ({ content: [{ type: "tool-call", toolCallId: "interpret", toolName: "interpret_request", input: JSON.stringify(await quotationProposal(question)) }], finishReason: { unified: "tool-calls", raw: undefined }, usage, warnings: [] }) });
}
describe("supplied quotation through the actual main agent", () => {
  it("D01 completes both quoted charges without tariff intake or a model rewrite", async () => {
    const model = dispatcher(input("D01"));
    const instructions = vi.fn().mockResolvedValueOnce("No stored facts.").mockRejectedValue(new Error("Completed run cannot read memory"));
    const result = await createMigrationMainAgent({ alias: "model-1", mainModel: model, memory: { instructions, tools: {} } }).generate({ prompt: input("D01") });
    expect(result.text).toContain("USD 1,875.00"); expect(result.text).toContain("USD 2,400.00"); expect(result.text).toContain("USD 4,275.00");
    expect(result.text).toMatch(/supplied quotation/i); expect(result.text).toMatch(/not an official/i);
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(instructions).toHaveBeenCalledTimes(1);
  });
  it("D11 applies per-call minimum/cap after time blocks", async () => {
    const model = dispatcher(input("D11"));
    const result = await createMigrationMainAgent({ alias: "model-1", mainModel: model }).generate({ prompt: input("D11") });
    expect(result.text).toContain("USD 1,100.00"); expect(result.text).toContain("3"); expect(model.doGenerateCalls).toHaveLength(1);
  });
  it("original scenario 19 preserves all separately requested duration cases", async () => {
    const question = original.cases.find((c: { id: number }) => c.id === 19).messages[0];
    const model = dispatcher(question);
    const result = await createMigrationMainAgent({ alias: "model-1", mainModel: model }).generate({ prompt: question });
    for (const value of ["INR 60,000.00", "INR 62,500.00", "INR 120,000.00"]) expect(result.text).toContain(value);
    expect(model.doGenerateCalls).toHaveLength(1);
  });
});
