import { expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { createMigrationMainAgent, portiaToolset, SUPPLIER_V1_EXCLUDED_TOOLS } from "../../src/lib/migration/domain-agent";

const finishing = () => new MockLanguageModelV4({ doGenerate: async () => ({
  content: [{ type: "tool-call", toolName: "finish_turn", toolCallId: "finish", input: JSON.stringify({ response: "Hello." }) }],
  finishReason: { unified: "tool-calls", raw: undefined }, warnings: [],
  usage: { inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 0, text: 0, reasoning: undefined } },
}) });

async function sentTools(toolset?: "full" | "supplier-v1") {
  const model = finishing();
  await createMigrationMainAgent({ alias: "model-1", mainModel: model, toolset }).generate({ prompt: "Hello." });
  const call = model.doGenerateCalls[0];
  return { names: call.tools!.map(tool => tool.name), bytes: JSON.stringify(call.tools).length, system: JSON.stringify(call.prompt[0]) };
}

it("defaults to the full tool set unless supplier-v1 is chosen explicitly", () => {
  expect(portiaToolset(undefined)).toBe("full");
  expect(portiaToolset("anything")).toBe("full");
  expect(portiaToolset("supplier-v1")).toBe("supplier-v1");
});

it("sends no official-tariff or vessel tools in supplier-v1 and says so", async () => {
  const full = await sentTools("full"), supplier = await sentTools("supplier-v1");
  for (const name of SUPPLIER_V1_EXCLUDED_TOOLS) { expect(full.names).toContain(name); expect(supplier.names).not.toContain(name); }
  expect(supplier.names).toEqual(expect.arrayContaining(["supplied_quote", "read_quotes", "compare_quotes", "finish_turn"]));
  expect(supplier.system).toContain("supplier-supplied quotations only");
  expect(full.system).not.toContain("supplier-supplied quotations only");
  expect(supplier.bytes).toBeLessThan(full.bytes * 0.5);
});
