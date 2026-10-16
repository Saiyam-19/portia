import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult, LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { describe, expect, it, vi } from "vitest";
import { tool } from "ai";
import { z } from "zod";
import { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";
import { nonfinancialProposal, projectionProposal, mumbaiProposal, mumbaiQuestion } from "./conversation-fixtures";
import { ConversationSession } from "../../src/lib/migration/conversation-session";
const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 5, text: 5, reasoning: undefined } };
const generated = (content: LanguageModelV4GenerateResult["content"], finish: "stop" | "tool-calls" | "length" = "tool-calls"): LanguageModelV4GenerateResult => ({ content, finishReason: { unified: finish, raw: undefined }, usage, warnings: [] });
const interpret = (p: unknown) => generated([{ type: "tool-call", toolCallId: "interpret", toolName: "interpret_request", input: JSON.stringify(p) }]);
function streamed(result: LanguageModelV4GenerateResult) {
  return { stream: new ReadableStream<LanguageModelV4StreamPart>({ start(c) {
    c.enqueue({ type: "stream-start", warnings: [] });
    for (const part of result.content) if (part.type === "tool-call") c.enqueue(part); else if (part.type === "text") { c.enqueue({ type: "text-start", id: "t" }); c.enqueue({ type: "text-delta", id: "t", delta: part.text }); c.enqueue({ type: "text-end", id: "t" }); }
    c.enqueue({ type: "finish", finishReason: result.finishReason, usage }); c.close();
  } }) };
}
describe("shared migration domain agent", () => {
  // The former test accepted a model-only INR556526 report for this incomplete
  // input. The approved architecture explicitly removes that publication path.
  it("rejects an unbound specialist financial report for the original incomplete request", async () => {
    const model = new MockLanguageModelV4({ doGenerate: generated([{ type: "tool-call", toolCallId: "consult", toolName: "consult_port_agent", input: JSON.stringify({ port_name: "mumbai", query: "Calculate marine charges" }) }]) });
    const factory = vi.fn(() => { throw new Error("Unbound specialist must not run"); });
    await expect(createMigrationMainAgent({ alias: "model-2", mainModel: model, specialistModelFactory: factory }).generate({ prompt: "Estimate Mumbai charges" })).rejects.toMatchObject({name:'PortiaInterpretationError'}); expect(factory).not.toHaveBeenCalled(); expect(model.doGenerateCalls).toHaveLength(1);
  });
  it("keeps the selected alias path while declining to invent missing source applicability", async () => {
    const question = "What are Mumbai charges for 50000 GRT?";
    const p = await projectionProposal([{ role: "user", content: question }], "quote"); p.tasks[0].charges = ["berth", "other"];
    const model = new MockLanguageModelV4({ doGenerate: interpret(p) });
    const result = await createMigrationMainAgent({ alias: "model-2", mainModel: model }).generate({ prompt: question });
    expect(result.text).toMatch(/requested.*scope|governing source/); expect(result.text).not.toMatch(/INR\s*\d/); expect(model.doGenerateCalls).toHaveLength(1);
  });
  it("withholds truncated interpretation output and makes no implicit retry", async () => {
    const model = new MockLanguageModelV4({ doGenerate: generated([{ type: "text", text: "UNSAFE PARTIAL FINANCIAL TOTAL 123456" }], "length") });
    await expect(createMigrationMainAgent({ alias: "model-1", mainModel: model }).generate({ prompt: "Estimate Mumbai charges" })).rejects.toThrow(/did not finish/);
    expect(model.doGenerateCalls).toHaveLength(1);
  });
  it("does not invoke a specialist for an empty tariff asset", async () => {
    const question = "Estimate BPCL cargo jetty"; const p = await projectionProposal([{ role: "user", content: question }], "quote");
    const model = new MockLanguageModelV4({ doGenerate: interpret(p) }); const factory = vi.fn(() => { throw new Error("No source"); });
    const result = await createMigrationMainAgent({ alias: "model-1", mainModel: model, specialistModelFactory: factory }).generate({ prompt: question });
    expect(factory).not.toHaveBeenCalled(); expect(result.text).toContain("not yet available"); expect(result.text).not.toMatch(/(?:USD|INR)\s*\d/);
  });
  it("suspends on one necessary structured question after interpretation", async () => {
    const question = "Calculate my port call"; const p = await projectionProposal([{ role: "user", content: question }], "quote");
    const model = new MockLanguageModelV4({ doGenerate: interpret(p) });
    const result = await createMigrationMainAgent({ alias: "model-1", mainModel: model }).generate({ prompt: question });
    const askStep = result.steps.at(-1)!;
    expect(askStep.toolCalls).toHaveLength(1); expect(askStep.toolCalls[0]?.toolName).toBe("ask_user_input"); expect(askStep.toolResults).toHaveLength(0);
    expect(JSON.stringify(askStep.toolCalls[0].input)).toContain("Requested port or terminal"); expect(model.doGenerateCalls).toHaveLength(1);
  });
  it("publishes financial rows, taxes, rounding, dates and citations exclusively from the source-bound ledger", async () => {
    const model = new MockLanguageModelV4({ doGenerate: { ...interpret(mumbaiProposal()), content: [{ type: "text", text: "unbound INR999999" }, ...interpret(mumbaiProposal()).content] } });
    const binding = { runId: "domain", fence: 2, revision: 4 }; const conversation = new ConversationSession(binding);
    const result = await createMigrationMainAgent({ alias: "model-1", mainModel: model, conversation, quoteBinding: binding }).generate({ prompt: mumbaiQuestion });
    for (const text of ["51,094.00", "CGST 9%", "SGST 9%", "2026-05-09", "whole-rupee", "cbic-gst.gov.in"]) expect(result.text).toContain(text);
    expect(result.text).not.toContain("999999"); expect(conversation.answer?.binding).toEqual(binding); expect(await conversation.verify(conversation.answer)).toBe(true);
  });
  it.each(["generate", "stream"] as const)("bounds actual provider calls during a runaway read-only tool loop (%s)", async mode => {
    const question = "Pathological repeated consultations"; let count = 0, executed = 0;
    const next = () => count++ === 0 ? interpret(nonfinancialProposal(question)) : generated([{ type: "tool-call", toolCallId: `read-${count}`, toolName: "read_scratchpad", input: "{}" }]);
    const model = new MockLanguageModelV4({ doGenerate: async () => next(), doStream: async () => streamed(next()) });
    const agent = createMigrationMainAgent({ alias: "model-1", mainModel: model, memory: { instructions: async () => "No facts", tools: { read_scratchpad: tool({ inputSchema: z.object({}).strict(), execute: async () => { executed++; return "Synthetic notes"; } }) } } } as Parameters<typeof createMigrationMainAgent>[0]);
    if (mode === "generate") await agent.generate({ prompt: question }); else { const r = await agent.stream({ prompt: question }); for await (const p of r.stream) if (p.type === "error") throw p.error; }
    expect(count).toBeGreaterThan(1); expect(count).toBeLessThanOrEqual(16); expect(executed).toBe(count - 1);
  });
  it("propagates Stop into an executing tool and does not restart inference", async () => {
    const controller = new AbortController(); let nested: AbortSignal | undefined;
    const question = "cancel nested"; const model = new MockLanguageModelV4({ doGenerate: [interpret(nonfinancialProposal(question)), generated([{ type: "tool-call", toolCallId: "read", toolName: "read_scratchpad", input: "{}" }])] });
    const agent = createMigrationMainAgent({ alias: "model-1", mainModel: model, memory: { instructions: async () => "", tools: { read_scratchpad: tool({ inputSchema: z.object({}), execute: async (_input, { abortSignal }) => { nested = abortSignal; controller.abort(new DOMException("Stopped", "AbortError")); abortSignal?.throwIfAborted(); return "must not complete"; } }) } } } as Parameters<typeof createMigrationMainAgent>[0]);
    await expect(agent.generate({ prompt: question, abortSignal: controller.signal })).rejects.toThrow(); expect(nested?.aborted).toBe(true); expect(model.doGenerateCalls).toHaveLength(2);
  });
  it("stops before another provider call after checkpoint failure", async () => {
    let failure: Error | undefined; const question = "checkpoint failure";
    const model = new MockLanguageModelV4({ doGenerate: interpret(nonfinancialProposal(question)) });
    const agent = createMigrationMainAgent({ alias: "model-1", mainModel: model, assertCanContinue: () => { if (failure) throw failure; } });
    await expect(agent.generate({ prompt: question, onStepEnd: async () => { failure = new Error("checkpoint failed"); } })).rejects.toThrow(/checkpoint failed/); expect(model.doGenerateCalls).toHaveLength(1);
  });
});
