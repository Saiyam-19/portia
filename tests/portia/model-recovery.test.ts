import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { ToolLoopAgent, tool, stepCountIs } from "ai";
import { z } from "zod";
import type { LanguageModelV4StreamPart, LanguageModelV4CallOptions } from "@ai-sdk/provider";
import { withCompleteModelSteps } from "../../src/lib/migration/complete-model-step";
import { MIGRATION_TRANSPORT_POLICY } from "../../src/lib/migration/agent-policy";

// These are transport-contract tests, never paid factory/release tests.
const state: { model?: MockLanguageModelV4 } = {};
const completeModel = (explicitRecoveries?: number) => explicitRecoveries === undefined
  ? withCompleteModelSteps(state.model!)
  : withCompleteModelSteps(state.model!, { ...MIGRATION_TRANSPORT_POLICY, maxRecoveryDispatchesPerRun: explicitRecoveries });
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } };
const finish = { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage } as const;
let outer: AbortController;
beforeEach(() => { vi.useFakeTimers(); outer = new AbortController(); });
afterEach(() => { outer.abort(); vi.useRealTimers(); vi.restoreAllMocks(); });
const options = (): LanguageModelV4CallOptions => ({ prompt: [{ role: "user", content: [{ type: "text", text: "Calculate" }] }], abortSignal: outer.signal });
function source(parts: LanguageModelV4StreamPart[], signal?: AbortSignal, close = true) {
  let controller: ReadableStreamDefaultController<LanguageModelV4StreamPart>;
  const abort = () => { try { controller.error(signal?.reason); } catch { /* already closed */ } };
  return { stream: new ReadableStream<LanguageModelV4StreamPart>({
    start(c) { controller = c; parts.forEach(part => c.enqueue(part)); if (close) c.close(); else signal?.addEventListener("abort", abort, { once: true }); },
    cancel() { signal?.removeEventListener("abort", abort); },
  }) };
}
async function drain<T>(stream: ReadableStream<T>) {
  const reader = stream.getReader(), parts: T[] = [];
  for (;;) { const next = await reader.read(); if (next.done) return parts; parts.push(next.value); }
}
it("default policy aborts an incomplete buffered tool step without a recovery dispatch", async () => {
  const signals: AbortSignal[] = [];
  state.model = new MockLanguageModelV4({ doStream: async args => {
    signals.push(args.abortSignal!);
    return source([{ type: "tool-call", toolCallId: "must-not-escape", toolName: "save", input: "{}" }], args.abortSignal, false);
  } });
  let released = false;
  const pending = Promise.resolve(completeModel().doStream(options())).then(() => { released = true; return undefined; }, error => error);
  await vi.advanceTimersByTimeAsync(15_001);
  expect(await pending).toMatchObject({ name: "TimeoutError" });
  expect(released).toBe(false); expect(signals).toHaveLength(1); expect(signals[0].aborted).toBe(true);
  expect(MIGRATION_TRANSPORT_POLICY.maxRecoveryDispatchesPerRun).toBe(0);
});
it("default policy rejects early EOF without dispatching a recovery", async () => {
  state.model = new MockLanguageModelV4({ doStream: async args => source([{ type: "text-start", id: "discarded" }], args.abortSignal) });
  await expect(completeModel().doStream(options())).rejects.toThrow(/before its finish/);
  expect(state.model!.doStreamCalls).toHaveLength(1);
});
it("default policy times out headers once and cannot dispatch after later cancellation", async () => {
  state.model = new MockLanguageModelV4({ doStream: async () => new Promise(() => {}) });
  const pending = Promise.resolve(completeModel().doStream(options())).then(() => "unexpected", error => error);
  await vi.advanceTimersByTimeAsync(60_001);
  expect(await pending).toMatchObject({ name: "TimeoutError" }); expect(state.model!.doStreamCalls).toHaveLength(1);
  outer.abort(new DOMException("Stopped", "AbortError")); await vi.advanceTimersByTimeAsync(120_000);
  expect(state.model!.doStreamCalls).toHaveLength(1);
});
it("parent cancellation suppresses recovery even under an explicitly enabled mock-only policy", async () => {
  state.model = new MockLanguageModelV4({ doStream: async args => source([{ type: "tool-call", toolCallId: "hidden", toolName: "save", input: "{}" }], args.abortSignal, false) });
  const pending = Promise.resolve(completeModel(2).doStream(options())).then(() => "unexpected", error => error);
  await vi.advanceTimersByTimeAsync(1); outer.abort(new DOMException("Stopped", "AbortError")); await vi.advanceTimersByTimeAsync(1);
  expect(await pending).toMatchObject({ name: "AbortError" }); expect(state.model!.doStreamCalls).toHaveLength(1);
});
it.each(["length", "content-filter", "error"] as const)("withholds %s finishes even when mock-only recovery is enabled", async reason => {
  state.model = new MockLanguageModelV4({ doStream: async args => source([{ type: "tool-call", toolCallId: "hidden", toolName: "save", input: "{}" }, { ...finish, finishReason: { unified: reason, raw: undefined } }], args.abortSignal) });
  await expect(completeModel(2).doStream(options())).rejects.toThrow();
  expect(state.model!.doStreamCalls).toHaveLength(1);
});
it("requires a valid finish and clean EOF while retaining successful stream contents", async () => {
  const parts: LanguageModelV4StreamPart[] = [{ type: "stream-start", warnings: [] }, { type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "hello" }, { type: "text-end", id: "t" }, { ...finish, finishReason: { unified: "stop", raw: undefined } }];
  state.model = new MockLanguageModelV4({ doStream: async args => source(parts, args.abortSignal) });
  expect(await drain((await completeModel().doStream(options())).stream)).toEqual(parts);
});
it("bounds an explicit mock-only recovery allowance across the whole wrapper lifetime", async () => {
  state.model = new MockLanguageModelV4({ doStream: async args => source([{ type: "stream-start", warnings: [] }], args.abortSignal, false) });
  const model = completeModel(2), pending = Promise.resolve(model.doStream(options())).then(() => "unexpected", error => error);
  await vi.advanceTimersByTimeAsync(180_010);
  expect(await pending).toMatchObject({ name: "TimeoutError" }); expect(state.model!.doStreamCalls).toHaveLength(3);
  const next = Promise.resolve(model.doStream(options())).then(() => "unexpected", error => error);
  await vi.advanceTimersByTimeAsync(60_010);
  expect(await next).toMatchObject({ name: "TimeoutError" }); expect(state.model!.doStreamCalls).toHaveLength(4);
});
it("never retries a budget refusal, including with an explicit mock-only recovery allowance", async () => {
  state.model = new MockLanguageModelV4({ doStream: async () => { throw new Error("LIVE_TEST_SPEND_CAP"); } });
  await expect(completeModel(2).doStream(options())).rejects.toThrow("LIVE_TEST_SPEND_CAP");
  expect(state.model!.doStreamCalls).toHaveLength(1);
});
it("does not turn deterministic failure into retry eligibility during slow cleanup", async () => {
  state.model = new MockLanguageModelV4({ doStream: async () => ({ stream: new ReadableStream<LanguageModelV4StreamPart>({
    start(controller) { setTimeout(() => controller.enqueue({ type: "error", error: new Error("Deterministic provider error") }), 59_990); },
    cancel() { return new Promise<void>(resolve => setTimeout(resolve, 500)); },
  }) }) });
  const pending = Promise.resolve(completeModel(2).doStream(options())).then(() => "unexpected", error => error);
  await vi.advanceTimersByTimeAsync(60_600);
  expect(await pending).toBeInstanceOf(Error); expect(state.model!.doStreamCalls).toHaveLength(1);
});
it("does not repeat an executed earlier tool when a later default-policy step stalls", async () => {
  const execute = vi.fn(async () => ({ saved: true })); let dispatches = 0;
  state.model = new MockLanguageModelV4({ doStream: async args => {
    const first = dispatches++ === 0;
    return source(first
      ? [{ type: "tool-call", toolCallId: "committed-once", toolName: "save", input: "{}" }, finish]
      : [{ type: "raw", rawValue: ": provider heartbeat" }], args.abortSignal, first);
  } });
  const agent = new ToolLoopAgent({ model: completeModel(), tools: { save: tool({ inputSchema: z.object({}), execute }) }, maxRetries: 0, stopWhen: stepCountIs(3) });
  const result = await agent.stream({ prompt: "Save once", abortSignal: outer.signal });
  const ended = Promise.resolve(result.finishReason).catch(() => undefined);
  const consumed = drain(result.stream);
  await vi.advanceTimersByTimeAsync(60_010);
  const parts = await consumed; await ended;
  expect(execute).toHaveBeenCalledTimes(1); expect(dispatches).toBe(2);
  expect(parts.some(part => part.type === "error")).toBe(true);
  expect(parts.filter(part => part.type === "tool-call").map(part => part.toolCallId)).toEqual(["committed-once"]);
});
it("explicit mock-only recovery never executes the discarded partial tool", async () => {
  let dispatches = 0; const execute = vi.fn(async () => ({ saved: true }));
  state.model = new MockLanguageModelV4({ doStream: async args => {
    const current = dispatches++;
    return source(current < 2
      ? [{ type: "tool-call", toolCallId: current ? "committed" : "discarded", toolName: "save", input: "{}" }, ...(current ? [finish] : [])]
      : [{ ...finish, finishReason: { unified: "stop", raw: undefined } }], args.abortSignal, current !== 0);
  } });
  const agent = new ToolLoopAgent({ model: completeModel(1), tools: { save: tool({ inputSchema: z.object({}), execute }) }, maxRetries: 0, stopWhen: stepCountIs(3) });
  const result = await agent.stream({ prompt: "Save once", abortSignal: outer.signal });
  const ended = Promise.resolve(result.finishReason);
  const consumed = drain(result.stream);
  await vi.advanceTimersByTimeAsync(1); expect(execute).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(15_001);
  const parts = await consumed;
  expect(await ended).toBe("stop"); expect(execute).toHaveBeenCalledTimes(1); expect(dispatches).toBe(3);
  expect(parts.filter(part => part.type === "tool-call").map(part => part.toolCallId)).toEqual(["committed"]);
});
