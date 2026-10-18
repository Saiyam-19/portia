import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult, LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";
import { tool } from "ai";
import { z } from "zod";
import { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";
const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 5, text: 5, reasoning: undefined } };
const generated = (content: LanguageModelV4GenerateResult["content"], finish: "stop" | "tool-calls" | "length" = "tool-calls"): LanguageModelV4GenerateResult => ({ content, finishReason: { unified: finish, raw: undefined }, usage, warnings: [] });
function streamed(result: LanguageModelV4GenerateResult) {
  return { stream: new ReadableStream<LanguageModelV4StreamPart>({ start(c) {
    c.enqueue({ type: "stream-start", warnings: [] });
    for (const part of result.content) if (part.type === "tool-call") c.enqueue(part); else if (part.type === "text") { c.enqueue({ type: "text-start", id: "t" }); c.enqueue({ type: "text-delta", id: "t", delta: part.text }); c.enqueue({ type: "text-end", id: "t" }); }
    c.enqueue({ type: "finish", finishReason: result.finishReason, usage }); c.close();
  } }) };
}
describe("shared migration domain agent", () => {
  it.each(["generate", "stream"] as const)("bounds actual provider calls during a runaway read-only tool loop (%s)", async mode => {
    const question = "Pathological repeated consultations"; let count = 0, executed = 0;
    const next = () => (count++, generated([{ type: "tool-call", toolCallId: `read-${count}`, toolName: "read_scratchpad", input: "{}" }]));
    const model = new MockLanguageModelV4({ doGenerate: async () => next(), doStream: async () => streamed(next()) });
    const agent = createMigrationMainAgent({ alias: "model-1", mainModel: model, memory: { instructions: async () => "No facts", tools: { read_scratchpad: tool({ inputSchema: z.object({}).strict(), execute: async () => { executed++; return "Synthetic notes"; } }) } } } as Parameters<typeof createMigrationMainAgent>[0]);
    if (mode === "generate") await agent.generate({ prompt: question }); else { const r = await agent.stream({ prompt: question }); for await (const p of r.stream) if (p.type === "error") throw p.error; }
    expect(count).toBeGreaterThan(1); expect(count).toBeLessThanOrEqual(12); expect(executed).toBe(count);
  });
  it("propagates Stop into an executing tool and does not restart inference", async () => {
    const controller = new AbortController(); let nested: AbortSignal | undefined;
    const question = "cancel nested"; const model = new MockLanguageModelV4({ doGenerate: [generated([{ type: "tool-call", toolCallId: "read", toolName: "read_scratchpad", input: "{}" }])] });
    const agent = createMigrationMainAgent({ alias: "model-1", mainModel: model, memory: { instructions: async () => "", tools: { read_scratchpad: tool({ inputSchema: z.object({}), execute: async (_input, { abortSignal }) => { nested = abortSignal; controller.abort(new DOMException("Stopped", "AbortError")); abortSignal?.throwIfAborted(); return "must not complete"; } }) } } } as Parameters<typeof createMigrationMainAgent>[0]);
    await expect(agent.generate({ prompt: question, abortSignal: controller.signal })).rejects.toThrow(); expect(nested?.aborted).toBe(true); expect(model.doGenerateCalls).toHaveLength(1);
  });
  it("stops before another provider call after checkpoint failure", async () => {
    let failure: Error | undefined; const question = "checkpoint failure";
    const model = new MockLanguageModelV4({ doGenerate: generated([{ type: "tool-call", toolCallId: "calculate", toolName: "calculate_charges", input: JSON.stringify({ expression: "2+3" }) }]) });
    const agent = createMigrationMainAgent({ alias: "model-1", mainModel: model, assertCanContinue: () => { if (failure) throw failure; } });
    await expect(agent.generate({ prompt: question, onStepEnd: async () => { failure = new Error("checkpoint failed"); } })).rejects.toThrow(/checkpoint failed/); expect(model.doGenerateCalls).toHaveLength(1);
  });
});
