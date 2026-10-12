import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { describe, expect, it, vi } from "vitest";
import { createMigrationMainAgent, MAIN_SYSTEM_PROMPT, PORT_AGENT_SYSTEM } from "../../src/lib/migration/domain-agent";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

function generated(
  content: LanguageModelV4GenerateResult["content"],
  finish: "stop" | "tool-calls" | "length",
): LanguageModelV4GenerateResult {
  return {
    content,
    finishReason: { unified: finish, raw: undefined },
    usage,
    warnings: [],
  };
}

describe("full migration domain agent", () => {
  it("routes through the same-alias specialist and returns cited tariff output", async () => {
    const mainModel = new MockLanguageModelV4({
      doGenerate: [
        generated([{ type: "tool-call", toolCallId: "consult-1", toolName: "consult_port_agent", input: JSON.stringify({ port_name: "mumbai", query: "Calculate dues for 50000 GRT and cite the tariff." }) }], "tool-calls"),
        generated([{ type: "text", text: "Estimated dues. Source: tariffs.md, cited section. Validity must be confirmed." }], "stop"),
      ],
    });
    const specialistModel = new MockLanguageModelV4({
      doGenerate: generated([{ type: "text", text: "Charge breakdown from tariffs.md section 2; schedule validity unclear; GST and FX not assumed." }], "stop"),
    });
    const specialistFactory = vi.fn(() => specialistModel);
    const agent = createMigrationMainAgent({
      alias: "model-2",
      mainModel,
      specialistModelFactory: specialistFactory,
    });
    const result = await agent.generate({ prompt: "What are Mumbai charges for 50000 GRT?" });
    expect(result.text).toContain("tariffs.md");
    expect(specialistFactory).toHaveBeenCalledWith("model-2");
    expect(specialistModel.doGenerateCalls).toHaveLength(1);
    expect(mainModel.doGenerateCalls).toHaveLength(2);
  });

  it("withholds truncated specialist financial output from the main agent", async () => {
    const mainModel = new MockLanguageModelV4({ doGenerate: [
      generated([{ type: "tool-call", toolCallId: "truncated", toolName: "consult_port_agent", input: JSON.stringify({ port_name: "mumbai", query: "Calculate tariff" }) }], "tool-calls"),
      generated([{ type: "text", text: "The specialist did not finish. Please retry." }], "stop"),
    ] });
    const specialistModel = new MockLanguageModelV4({ doGenerate: generated([{ type: "text", text: "UNSAFE PARTIAL FINANCIAL TOTAL 123456" }], "length") });
    const agent = createMigrationMainAgent({ alias: "model-1", mainModel, specialistModelFactory: () => specialistModel });
    await agent.generate({ prompt: "Estimate charges" });
    const continuation = JSON.stringify(mainModel.doGenerateCalls[1]?.prompt);
    expect(continuation).not.toContain("UNSAFE PARTIAL FINANCIAL TOTAL");
    expect(continuation).toContain("specialist response is incomplete");
  });

  it("does not invoke a specialist for an empty tariff asset", async () => {
    const mainModel = new MockLanguageModelV4({ doGenerate: [
      generated([{ type: "tool-call", toolCallId: "empty-port", toolName: "consult_port_agent", input: JSON.stringify({ port_name: "bpcl-cargo-jetty", query: "Estimate charges" }) }], "tool-calls"),
      generated([{ type: "text", text: "No tariff data available. Please supply an authoritative schedule." }], "stop"),
    ] });
    const specialistFactory = vi.fn(() => { throw new Error("must not incur a specialist call"); });
    await createMigrationMainAgent({ alias: "model-1", mainModel, specialistModelFactory: specialistFactory }).generate({ prompt: "Estimate BPCL cargo jetty" });
    expect(specialistFactory).not.toHaveBeenCalled();
    expect(JSON.stringify(mainModel.doGenerateCalls[1]?.prompt)).toContain("No tariff data available");
  });

  it("suspends on a single structured ask_user_input call", async () => {
    const mainModel = new MockLanguageModelV4({
      doGenerate: generated([{
        type: "tool-call",
        toolCallId: "ask-1",
        toolName: "ask_user_input",
        input: JSON.stringify({
          title: "Voyage details",
          fields: [{ name: "grt", label: "Gross tonnage", type: "number", unit: "GRT", required: true }],
        }),
      }], "tool-calls"),
    });
    const agent = createMigrationMainAgent({ alias: "model-1", mainModel });
    const result = await agent.generate({ prompt: "Calculate my port call" });
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.toolName).toBe("ask_user_input");
    expect(result.toolResults).toHaveLength(0);
    expect(mainModel.doGenerateCalls).toHaveLength(1);
  });

  it("preserves tariff citation, expiry, FX and GST rules in prompts", () => {
    for (const fragment of ["document filename", "effective dates", "expired", "exchange rate", "GST", "static reference"]) {
      expect(`${MAIN_SYSTEM_PROMPT}\n${PORT_AGENT_SYSTEM}`).toContain(fragment);
    }
  });

  it("bounds nested provider calls and specialist consultations per run", async () => {
    const consult = generated([{ type: "tool-call", toolCallId: "consult-loop", toolName: "consult_port_agent", input: JSON.stringify({ port_name: "mumbai", query: "Repeat lookup" }) }], "tool-calls");
    const mainModel = new MockLanguageModelV4({
      doGenerate: [consult, consult, consult, consult, generated([{ type: "text", text: "Budget-aware final answer" }], "stop")],
    });
    const specialistModels: MockLanguageModelV4[] = [];
    const specialistFactory = vi.fn(() => {
      const model = new MockLanguageModelV4({
        doGenerate: generated([{ type: "text", text: "Specialist answer" }], "stop"),
      });
      specialistModels.push(model);
      return model;
    });
    const agent = createMigrationMainAgent({
      alias: "model-1",
      mainModel,
      specialistModelFactory: specialistFactory,
    });
    const result = await agent.generate({ prompt: "Pathological repeated consultations" });
    expect(result.text).toBe("Budget-aware final answer");
    expect(specialistFactory).toHaveBeenCalledTimes(3);
    expect(mainModel.doGenerateCalls.length + specialistModels.reduce((sum, model) => sum + model.doGenerateCalls.length, 0)).toBeLessThanOrEqual(16);
  });

  it("propagates cancellation into a nested specialist call", async () => {
    const controller = new AbortController();
    let nestedSignal: AbortSignal | undefined;
    const mainModel = new MockLanguageModelV4({
      doGenerate: generated([{ type: "tool-call", toolCallId: "consult-abort", toolName: "consult_port_agent", input: JSON.stringify({ port_name: "mumbai", query: "Slow lookup" }) }], "tool-calls"),
    });
    const specialistModel = new MockLanguageModelV4({
      doGenerate: async (options) => {
        nestedSignal = options.abortSignal;
        controller.abort(new DOMException("Stopped", "AbortError"));
        options.abortSignal?.throwIfAborted();
        return generated([{ type: "text", text: "must not complete" }], "stop");
      },
    });
    const agent = createMigrationMainAgent({
      alias: "model-1",
      mainModel,
      specialistModelFactory: () => specialistModel,
    });
    await expect(agent.generate({ prompt: "cancel nested", abortSignal: controller.signal })).rejects.toThrow();
    expect(nestedSignal?.aborted).toBe(true);
  });

  it("stops before another provider call after checkpoint failure", async () => {
    let checkpointFailure: Error | undefined;
    const lookup = generated([{ type: "tool-call", toolCallId: "lookup-1", toolName: "get_vessel", input: JSON.stringify({ id: "1234567", id_type: "imo" }) }], "tool-calls");
    const model = new MockLanguageModelV4({
      doGenerate: [lookup, generated([{ type: "text", text: "must not run" }], "stop")],
    });
    const agent = createMigrationMainAgent({
      alias: "model-1",
      mainModel: model,
      assertCanContinue: () => {
        if (checkpointFailure) throw checkpointFailure;
      },
    });
    await expect(agent.generate({
      prompt: "checkpoint failure",
      onStepEnd: async () => { checkpointFailure = new Error("checkpoint failed"); },
    })).rejects.toThrow(/checkpoint failed/);
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("hard-stops at sixteen actual nested provider invocations", async () => {
    const mainModel = new MockLanguageModelV4({
      doGenerate: generated([{ type: "tool-call", toolCallId: "consult-budget", toolName: "consult_port_agent", input: JSON.stringify({ port_name: "mumbai", query: "Keep consulting" }) }], "tool-calls"),
    });
    const specialists: MockLanguageModelV4[] = [];
    const specialistFactory = () => {
      const model = new MockLanguageModelV4({
        doGenerate: generated([{ type: "tool-call", toolCallId: "calc-budget", toolName: "calculate_charges", input: JSON.stringify({ expression: "1+1" }) }], "tool-calls"),
      });
      specialists.push(model);
      return model;
    };
    const agent = createMigrationMainAgent({ alias: "model-1", mainModel, specialistModelFactory: specialistFactory });
    await expect(agent.generate({ prompt: "exhaust nested budget" })).rejects.toThrow(/Provider call budget exhausted/);
    const calls = mainModel.doGenerateCalls.length + specialists.reduce((sum, model) => sum + model.doGenerateCalls.length, 0);
    expect(calls).toBe(16);
  });
});
