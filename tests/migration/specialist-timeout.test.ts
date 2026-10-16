import { afterEach, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";
import { MIGRATION_CHAT_TIMEOUT } from "../../src/lib/migration/agent-policy";
import { ConversationSession } from "../../src/lib/migration/conversation-session";
import { mumbaiProposal, mumbaiQuestion } from "./conversation-fixtures";
import { publicChatStream } from "../../src/lib/migration/public-stream";

vi.mock("../../src/lib/migration/ports", () => ({
  SUPPORTED_PORTS: ["mumbai"],
  loadPortTariffBundle: async () => "Synthetic tariff fixture",
}));

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};
function stream(parts: LanguageModelV4StreamPart[]) {
  return { warnings: [], stream: new ReadableStream<LanguageModelV4StreamPart>({
    start(controller) { for (const part of parts) controller.enqueue(part); controller.close(); },
  }) };
}

it("allows validated source work beyond the former 60-second main-stream idle limit", async () => {
  vi.useFakeTimers();
  let started!: () => void;
  const sourceWorkStarted = new Promise<void>(resolve => { started = resolve; });
  const binding = { runId: "slow-source", fence: 1, revision: 1 };
  const conversation = new ConversationSession(binding);
  const original = conversation.prepare.bind(conversation); let delayed = false;
  vi.spyOn(conversation, "prepare").mockImplementation(async () => {
    if (!conversation.pending.length && !delayed) { delayed = true; started(); await new Promise(resolve => setTimeout(resolve, 70_000)); }
    await original();
  });
  const main = new MockLanguageModelV4({ doStream: stream([
    { type: "stream-start", warnings: [] },
    { type: "tool-call", toolCallId: "interpret", toolName: "interpret_request", input: JSON.stringify(mumbaiProposal()) },
    { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
  ]) });
  const result = await createMigrationMainAgent({ alias: "model-1", mainModel: main, conversation, quoteBinding: binding }).stream({ prompt: mumbaiQuestion, timeout: MIGRATION_CHAT_TIMEOUT });
  const errors: unknown[] = []; let text = "";
  const consumed = (async () => { for await (const part of result.stream) { if (part.type === "error") errors.push(part.error); if (part.type === "text-delta") text += part.text; } })();
  const finished = Promise.resolve(result.finishReason).catch((error: unknown) => error);
  await sourceWorkStarted; await vi.advanceTimersByTimeAsync(70_001); await consumed;
  expect(await finished).toBe("stop"); expect(errors).toEqual([]); expect(main.doStreamCalls).toHaveLength(1); expect(text).toContain("51,094.00");
});

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
  await vi.advanceTimersByTimeAsync(60_001);
  await consumed;
  expect(parts.some(part => part.type === "error")).toBe(true);
  expect(onFailure).toHaveBeenCalled();
});
