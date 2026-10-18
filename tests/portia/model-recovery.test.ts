import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { ToolLoopAgent, tool, stepCountIs } from "ai";
import { z } from "zod";
import type { LanguageModelV4StreamPart, LanguageModelV4CallOptions } from "@ai-sdk/provider";
const state = vi.hoisted(() => ({ model: undefined as unknown }));
vi.mock("@openrouter/ai-sdk-provider", () => ({ createOpenRouter: () => ({ chat: () => state.model }) }));
import { migrationLanguageModel } from "../../src/lib/migration/model";
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } };
const finish = { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage } as const;
let outer: AbortController;
beforeEach(() => { vi.useFakeTimers(); vi.stubEnv("OPENROUTER_API_KEY", "test-only"); vi.stubEnv("LLM_ALLOW_PAID", "true"); outer = new AbortController(); });
afterEach(() => { outer.abort(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const options = (): LanguageModelV4CallOptions => ({ prompt: [{ role: "user", content: [{ type: "text", text: "Calculate" }] }], abortSignal: outer.signal });
function source(parts: LanguageModelV4StreamPart[], signal?: AbortSignal, close = true, cancelled = vi.fn()) {
  let controller: ReadableStreamDefaultController<LanguageModelV4StreamPart>;
  const abort = () => { try { controller.error(signal?.reason); } catch { /* already closed */ } };
  return { stream: new ReadableStream<LanguageModelV4StreamPart>({ start(c) { controller = c; parts.forEach(p => c.enqueue(p)); if (close) c.close(); else signal?.addEventListener("abort", abort, { once: true }); }, cancel() { cancelled(); signal?.removeEventListener("abort", abort); } }) };
}
async function collect(result: Awaited<ReturnType<ReturnType<typeof migrationLanguageModel>["doStream"]>>) {
  const reader = result.stream.getReader(), parts = [];
  while (true) { const next = await reader.read(); if (next.done) break; parts.push(next.value); }
  return parts;
}
it("withholds an incomplete tool step, aborts it, then releases only one complete retry", async () => {
  const signals: AbortSignal[] = []; let calls = 0;
  state.model = new MockLanguageModelV4({ doStream: async args => {
    signals.push(args.abortSignal!);
    const id = calls++ === 0 ? "discarded" : "committed";
    return source([{ type: "stream-start", warnings: [] }, { type: "tool-call", toolCallId: id, toolName: "manage_quote", input: "{}" }, ...(id === "committed" ? [finish] : [])], args.abortSignal, id === "committed");
  } });
  let resolved = false;
  const pending = migrationLanguageModel("model-1").doStream(options()); pending.then(() => { resolved = true; }, () => {});
  await vi.advanceTimersByTimeAsync(1); expect(resolved).toBe(false);
  await vi.advanceTimersByTimeAsync(15_001);
  const parts = await collect(await pending);
  expect(signals[0].aborted).toBe(true); expect(signals[1].aborted).toBe(false);
  expect(parts.filter(p => p.type === "tool-call").map(p => p.toolCallId)).toEqual(["committed"]);
  expect(calls).toBe(2);
});
it("bounds recovery to two additional dispatches for the whole run, not per step", async () => {
  let count = 0;
  state.model = new MockLanguageModelV4({ doStream: async args => { count++; return source([{ type: "stream-start", warnings: [] }], args.abortSignal, false); } });
  const model = migrationLanguageModel("model-1"), pending = model.doStream(options()).then(() => "unexpected", error => error);
  await vi.advanceTimersByTimeAsync(180_010);
  expect(await pending).toMatchObject({ name: "TimeoutError" }); expect(count).toBe(3);
  const next = model.doStream(options()).then(() => "unexpected", error => error);
  await vi.advanceTimersByTimeAsync(60_010); expect(await next).toMatchObject({ name: "TimeoutError" }); expect(count).toBe(4);
});
it("does not retry parent cancellation or release buffered calls", async () => {
  let count = 0;
  state.model = new MockLanguageModelV4({ doStream: async args => { count++; return source([{ type: "tool-call", toolCallId: "hidden", toolName: "remember_memory", input: "{}" }], args.abortSignal, false); } });
  const pending = migrationLanguageModel("model-1").doStream(options()).then(() => "unexpected", error => error);
  await vi.advanceTimersByTimeAsync(1); outer.abort(new DOMException("Stopped", "AbortError")); await vi.advanceTimersByTimeAsync(1);
  expect(await pending).toMatchObject({ name: "AbortError" }); expect(count).toBe(1);
});
it.each(["length", "content-filter", "error"] as const)("withholds %s finishes without a retry", async reason => {
  const mock = new MockLanguageModelV4({ doStream: async args => source([{ type: "tool-call", toolCallId: "hidden", toolName: "manage_quote", input: "{}" }, { ...finish, finishReason: { unified: reason, raw: undefined } }], args.abortSignal) }); state.model = mock;
  await expect(migrationLanguageModel("model-1").doStream(options())).rejects.toThrow(); expect(mock.doStreamCalls).toHaveLength(1);
});
it("requires a valid finish and EOF, retaining ordinary successful stream contents", async () => {
  const parts: LanguageModelV4StreamPart[] = [{ type: "stream-start", warnings: [] }, { type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "hello" }, { type: "text-end", id: "t" }, { ...finish, finishReason: { unified: "stop", raw: undefined } }];
  state.model = new MockLanguageModelV4({ doStream: async args => source(parts, args.abortSignal) });
  expect(await collect(await migrationLanguageModel("model-1").doStream(options()))).toEqual(parts);
});
it("recovers an early EOF without releasing the failed step", async () => {
  let count = 0;
  state.model = new MockLanguageModelV4({ doStream: async args => source(count++ ? [finish] : [{ type: "text-start", id: "discarded" }], args.abortSignal) });
  expect(await collect(await migrationLanguageModel("model-1").doStream(options()))).toEqual([finish]); expect(count).toBe(2);
});
it("times out headers and does not dispatch again after parent cancellation", async () => {
  let count = 0;
  state.model = new MockLanguageModelV4({ doStream: async () => { count++; return new Promise(() => {}); } });
  const pending = migrationLanguageModel("model-1").doStream(options()).then(() => "unexpected", error => error);
  await vi.advanceTimersByTimeAsync(60_001); expect(count).toBe(2);
  outer.abort(new DOMException("Stopped", "AbortError"));
  expect(await pending).toMatchObject({ name: "AbortError" }); await vi.advanceTimersByTimeAsync(120_000); expect(count).toBe(2);
});
it("does not retry a budget refusal", async () => {
  const mock = new MockLanguageModelV4({ doStream: async () => { throw new Error("LIVE_TEST_SPEND_CAP"); } }); state.model = mock;
  await expect(migrationLanguageModel("model-1").doStream(options())).rejects.toThrow(); expect(mock.doStreamCalls).toHaveLength(1);
});
it("never turns a deterministic error into a retry while slow cancellation is pending", async () => {
  let count = 0;
  state.model = new MockLanguageModelV4({ doStream: async () => {
    if (count++ > 0) return source([finish]);
    return { stream: new ReadableStream<LanguageModelV4StreamPart>({ start(controller) { setTimeout(() => controller.enqueue({ type: "error", error: new Error("Deterministic provider error") }), 59_990); }, cancel() { return new Promise<void>(resolve => setTimeout(resolve, 500)); } }) };
  } });
  const result = migrationLanguageModel("model-1").doStream(options()).then(() => "unexpected", error => error);
  await vi.advanceTimersByTimeAsync(60_600); expect(await result).toBeInstanceOf(Error); expect(count).toBe(1);
});
it("does not replay a completed tool step when a later text step stalls", async () => {
  let count = 0;
  state.model = new MockLanguageModelV4({ doStream: async args => source(count++ === 1 ? [{ type: "raw", rawValue: ": OPENROUTER PROCESSING" }] : [finish], args.abortSignal, count !== 2) });
  const model = migrationLanguageModel("model-1"); expect(await collect(await model.doStream(options()))).toEqual([finish]);
  const next = model.doStream(options()); await vi.advanceTimersByTimeAsync(60_001);
  expect(await collect(await next)).toEqual([finish]); expect(count).toBe(3);
});
it("executes a recovered tool once and never executes the discarded attempt", async () => {
  let count = 0; const execute = vi.fn(async () => ({ saved: true }));
  state.model = new MockLanguageModelV4({ doStream: async args => {
    const current = count++;
    return source(current < 2 ? [{ type: "tool-call", toolCallId: current ? "committed" : "discarded", toolName: "save", input: "{}" }, ...(current ? [finish] : [])] : [{ ...finish, finishReason: { unified: "stop", raw: undefined } }], args.abortSignal, current !== 0);
  } });
  const agent = new ToolLoopAgent({ model: migrationLanguageModel("model-1"), tools: { save: tool({ inputSchema: z.object({}), execute }) }, maxRetries: 0, stopWhen: stepCountIs(3) });
  const result = await agent.stream({ prompt: "Save once", abortSignal: outer.signal });
  const finished = result.finishReason; await vi.advanceTimersByTimeAsync(1); expect(execute).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(15_001); expect(await finished).toBe("stop"); expect(execute).toHaveBeenCalledTimes(1); expect(count).toBe(3);
});
