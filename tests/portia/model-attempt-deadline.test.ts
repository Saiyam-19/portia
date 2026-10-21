import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { withCompleteModelSteps } from "../../src/lib/migration/complete-model-step";
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } };
const finish = { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage } as const;
let parent: AbortController;
beforeEach(() => { vi.useFakeTimers(); parent = new AbortController(); });
afterEach(() => { parent.abort(); vi.useRealTimers(); });
it("bounds a continually trickling incomplete attempt without a default recovery dispatch", async () => {
  let count = 0;
  const underlying = new MockLanguageModelV4({ doStream: async args => ({ stream: new ReadableStream<LanguageModelV4StreamPart>({ start(controller) {
    if (count++ > 0) { controller.enqueue({ type: "text-start", id: "ready" }); controller.enqueue({ type: "text-delta", id: "ready", delta: "Ready." }); controller.enqueue({ type: "text-end", id: "ready" }); controller.enqueue(finish); controller.close(); return; }
    controller.enqueue({ type: "text-start", id: "discarded" });
    controller.enqueue({ type: "text-delta", id: "discarded", delta: "Slow" });
    const interval = setInterval(() => controller.enqueue({ type: "text-delta", id: "discarded", delta: " drip" }), 10_000);
    args.abortSignal!.addEventListener("abort", () => { clearInterval(interval); controller.error(args.abortSignal!.reason); }, { once: true });
  } }) }) });
  let released = false;
  const pending = Promise.resolve(withCompleteModelSteps(underlying).doStream({ prompt: [], abortSignal: parent.signal })).then(() => { released = true; return undefined; }, error => error);
  await vi.advanceTimersByTimeAsync(90_001);
  expect(await pending).toMatchObject({ name: "TimeoutError" });
  expect(count).toBe(1); expect(released).toBe(false);
});
it("clears the absolute watchdog before slow cleanup of a deterministic error", async () => {
  let count = 0;
  const underlying = new MockLanguageModelV4({ doStream: async () => ({ stream: new ReadableStream<LanguageModelV4StreamPart>({ start(controller) {
    count++; if (count > 1) { controller.enqueue(finish); controller.close(); return; }
    controller.enqueue({ type: "text-start", id: "t" });
    const interval = setInterval(() => controller.enqueue({ type: "text-delta", id: "t", delta: "progress" }), 10_000);
    setTimeout(() => { clearInterval(interval); controller.enqueue({ type: "error", error: new Error("Nonretryable error") }); }, 89_990);
  }, cancel() { return new Promise<void>(resolve => setTimeout(resolve, 500)); } }) }) });
  const pending = withCompleteModelSteps(underlying).doStream({ prompt: [], abortSignal: parent.signal }).then(() => "unexpected", error => error);
  await vi.advanceTimersByTimeAsync(90_600); expect(await pending).toBeInstanceOf(Error); expect(count).toBe(1);
});
it("retains a valid 89-second completion without a retry", async () => {
  let count = 0;
  const underlying = new MockLanguageModelV4({ doStream: async () => ({ stream: new ReadableStream<LanguageModelV4StreamPart>({ start(controller) {
    count++; controller.enqueue({ type: "text-start", id: "t" });
    const interval = setInterval(() => controller.enqueue({ type: "text-delta", id: "t", delta: "progress" }), 10_000);
    setTimeout(() => { clearInterval(interval); controller.enqueue({ type: "text-end", id: "t" }); controller.enqueue(finish); controller.close(); }, 89_000);
  } }) }) });
  const pending = Promise.resolve(withCompleteModelSteps(underlying).doStream({ prompt: [], abortSignal: parent.signal })); pending.catch(() => {});
  await vi.advanceTimersByTimeAsync(89_001); const reader = (await pending).stream.getReader();
  const parts = []; for (;;) { const next = await reader.read(); if (next.done) break; parts.push(next.value); }
  expect(parts.at(-1)?.type).toBe("finish"); expect(count).toBe(1);
});
it("lets parent cancellation win before the absolute attempt deadline", async () => {
  let count = 0;
  const underlying = new MockLanguageModelV4({ doStream: async args => ({ stream: new ReadableStream<LanguageModelV4StreamPart>({ start(controller) {
    count++; controller.enqueue({ type: "text-start", id: "t" });
    const interval = setInterval(() => controller.enqueue({ type: "text-delta", id: "t", delta: "progress" }), 10_000);
    args.abortSignal!.addEventListener("abort", () => { clearInterval(interval); controller.error(args.abortSignal!.reason); }, { once: true });
  } }) }) });
  const pending = withCompleteModelSteps(underlying).doStream({ prompt: [], abortSignal: parent.signal }).then(() => "unexpected", error => error);
  await vi.advanceTimersByTimeAsync(80_000); parent.abort(new DOMException("Stopped", "AbortError"));
  await vi.advanceTimersByTimeAsync(20_000); expect(await pending).toMatchObject({ name: "AbortError" }); expect(count).toBe(1);
});
