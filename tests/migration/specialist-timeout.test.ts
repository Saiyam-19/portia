import { afterEach, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";
import { MIGRATION_CHAT_TIMEOUT } from "../../src/lib/migration/agent-policy";
import { publicChatStream } from "../../src/lib/migration/public-stream";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("still bounds a stalled response by the step deadline", async () => {
  vi.useFakeTimers();
  const model = new MockLanguageModelV4({ doStream: async () => ({
    warnings: [], stream: new ReadableStream<LanguageModelV4StreamPart>({ start(controller) {
      controller.enqueue({ type: "stream-start", warnings: [] });
      controller.enqueue({ type: "text-start", id: "stalled" });
      controller.enqueue({ type: "text-delta", id: "stalled", delta: "Partial work" });
    } }),
  }) });
  const result = await createMigrationMainAgent({ alias: "model-1", mainModel: model })
    .stream({ prompt: "Stall after partial text", timeout: MIGRATION_CHAT_TIMEOUT });
  const consumed = (async () => { for await (const part of result.stream) void part; })();
  const finished = Promise.resolve(result.finishReason).catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(180_001);
  await consumed;
  expect(await finished).toMatchObject({ name: "TimeoutError" });
  expect(model.doStreamCalls).toHaveLength(1);
});

it("reports a no-output provider timeout through the UI without an unhandled result rejection", async () => {
  vi.useFakeTimers();
  const model = new MockLanguageModelV4({ doStream: async () => ({
    warnings: [], stream: new ReadableStream<LanguageModelV4StreamPart>({ start(controller) {
      controller.enqueue({ type: "stream-start", warnings: [] });
    } }),
  }) });
  const outer = new AbortController();
  const result = await createMigrationMainAgent({ alias: "model-1", mainModel: model })
    .stream({ prompt: "No model output", abortSignal: outer.signal, timeout: MIGRATION_CHAT_TIMEOUT });
  const onFailure = vi.fn();
  const parts: Array<{ type: string }> = [];
  const consumed = (async () => {
    const reader = publicChatStream(result.stream, { abortSignal: outer.signal, onFailure, result }).getReader();
    while (true) { const part = await reader.read(); if (part.done) break; parts.push(part.value); }
  })();
  await vi.advanceTimersByTimeAsync(180_001);
  await consumed;
  expect(parts.some(part => part.type === "error")).toBe(true);
  expect(onFailure).toHaveBeenCalled();
});
