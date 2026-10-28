import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";
import { AgentWorkspace } from "../../src/lib/memory/workspace";
import { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";
import { MIGRATION_AGENT_MAX_OUTPUT_TOKENS } from "../../src/lib/migration/agent-policy";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};
function generated(content: LanguageModelV4GenerateResult["content"], finish: "stop" | "tool-calls"): LanguageModelV4GenerateResult {
  return { content, finishReason: { unified: finish, raw: undefined }, usage, warnings: [] };
}

describe("unified domain agent", () => {
  it("reads tariff evidence and calculates exact line items in the same loop", async () => {
    const workspace = await AgentWorkspace.ephemeral();
    const model = new MockLanguageModelV4({ doGenerate: [
      generated([{ type: "tool-call", toolCallId: "read", toolName: "bash", input: JSON.stringify({ command: "grep -n '2.16' /ports/mumbai/tariffs.md | head -n 3" }) }], "tool-calls"),
      generated([{ type: "tool-call", toolCallId: "batch", toolName: "calculate_charge_batch", input: JSON.stringify({ calculations: [
        { id: "dues", expression: "20000 * 10.5366" },
        { id: "pilotage", expression: "20000 * 17.2897" },
        { id: "total", expression: "$dues + $pilotage" },
      ] }) }], "tool-calls"),
      generated([{ type: "text", text: "INR 556526.0000, pre-GST. tariffs.md §§2.16 and 2.1(A). Static schedule; validity and scope apply." }], "stop"),
    ] });
    const agent = createMigrationMainAgent({ alias: "model-2", mainModel: model, workspace });
    const result = await agent.generate({ prompt: "Estimate the charges" });
    expect(Object.keys(agent.tools).sort()).toEqual(["ask_user_input", "bash", "calculate_charge_batch", "get_vessel", "search_vessels"]);
    expect(model.doGenerateCalls).toHaveLength(3);
    expect(JSON.stringify(model.doGenerateCalls[1].prompt)).toContain("2.16");
    expect(JSON.stringify(model.doGenerateCalls[2].prompt)).toContain("556526.0000");
    expect(result.text).toContain("INR 556526.0000");
    expect(result.finishReason).toBe("stop");
    expect(model.doGenerateCalls.map(call => call.maxOutputTokens)).toEqual([MIGRATION_AGENT_MAX_OUTPUT_TOKENS, MIGRATION_AGENT_MAX_OUTPUT_TOKENS - 5, MIGRATION_AGENT_MAX_OUTPUT_TOKENS - 10]);
  });

  it("suspends on a single structured ask_user_input call", async () => {
    const model = new MockLanguageModelV4({ doGenerate: generated([{
      type: "tool-call", toolCallId: "ask-1", toolName: "ask_user_input",
      input: JSON.stringify({ title: "Voyage details", fields: [{ name: "grt", label: "Gross tonnage", type: "number", unit: "GRT", required: true }] }),
    }], "tool-calls") });
    const result = await createMigrationMainAgent({ alias: "model-1", mainModel: model, workspace: await AgentWorkspace.ephemeral() }).generate({ prompt: "Calculate my port call" });
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.toolName).toBe("ask_user_input");
    expect(result.toolResults).toHaveLength(0);
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("stops before another provider call after checkpoint failure", async () => {
    let checkpointFailure: Error | undefined;
    const model = new MockLanguageModelV4({ doGenerate: [
      generated([{ type: "tool-call", toolCallId: "read", toolName: "bash", input: JSON.stringify({ command: "printf checked" }) }], "tool-calls"),
      generated([{ type: "text", text: "must not run" }], "stop"),
    ] });
    const agent = createMigrationMainAgent({ alias: "model-1", mainModel: model, workspace: await AgentWorkspace.ephemeral(), assertCanContinue: () => {
      if (checkpointFailure) throw checkpointFailure;
    } });
    await expect(agent.generate({ prompt: "checkpoint failure", onStepEnd: async () => { checkpointFailure = new Error("checkpoint failed"); } })).rejects.toThrow(/checkpoint failed/);
    expect(model.doGenerateCalls).toHaveLength(1);
  });
});
