import { afterEach, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";
import { MIGRATION_CHAT_TIMEOUT } from "../../src/lib/migration/agent-policy";
import { publicChatStream } from "../../src/lib/migration/public-stream";

vi.mock("../../src/lib/migration/ports", () => ({
  SUPPORTED_PORTS: ["mumbai"],
  loadPortTariffBundle: async () => "Synthetic tariff fixture",
}));

afterEach(() => vi.useRealTimers());
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};
function stream(parts: LanguageModelV4StreamPart[]) {
  return { warnings: [], stream: new ReadableStream<LanguageModelV4StreamPart>({
    start(controller) { for (const part of parts) controller.enqueue(part); controller.close(); },
  }) };
}

it("allows a healthy tariff specialist to run longer than the main stream's former 60-second idle limit", async () => {
  vi.useFakeTimers();
  let started!: () => void;
  const specialistStarted = new Promise<void>(resolve => { started = resolve; });
  const delay = async (abortSignal?: AbortSignal) => {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 35_000);
      const abort = () => { clearTimeout(timer); reject(abortSignal?.reason); };
      if (abortSignal?.aborted) abort();
      else abortSignal?.addEventListener("abort", abort, { once: true });
    });
  };
  let specialistStep = 0;
  const specialist = new MockLanguageModelV4({ doGenerate: async ({ abortSignal }) => {
    if (specialistStep === 0) started();
    await delay(abortSignal);
    if (specialistStep++ === 0) return {
      content: [{ type: "tool-call" as const, toolCallId: "calc", toolName: "calculate_charges", input: '{"expression":"2 + 2"}' }],
      finishReason: { unified: "tool-calls" as const, raw: undefined }, usage, warnings: [],
    };
    return { content: [{ type: "text" as const, text: "Verified tariff calculation: 4" }],
      finishReason: { unified: "stop" as const, raw: undefined }, usage, warnings: [] };
  } });
  const main = new MockLanguageModelV4({ doStream: [
    stream([
      { type: "stream-start", warnings: [] },
      { type: "tool-call", toolCallId: "consult-1", toolName: "consult_port_agent", input: JSON.stringify({ port_name: "mumbai", query: "Compute vessel charges" }) },
      { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
    ]),
    stream([
      { type: "stream-start", warnings: [] },
      { type: "text-start", id: "answer" },
      { type: "text-delta", id: "answer", delta: "Completed estimate" },
      { type: "text-end", id: "answer" },
      { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
    ]),
  ] });
  const result = await createMigrationMainAgent({
    alias: "model-1", mainModel: main, specialistModelFactory: () => specialist,
  }).stream({ prompt: "Estimate Mumbai call", timeout: MIGRATION_CHAT_TIMEOUT });
  const errors: unknown[] = [];
  const consumed = (async () => { for await (const part of result.stream) if (part.type === "error") errors.push(part.error); })();
  const finished = Promise.resolve(result.finishReason).catch((error: unknown) => error);
  await specialistStarted;
  await vi.advanceTimersByTimeAsync(70_001);
  await consumed;
  expect(await finished).toBe("stop");
  expect(errors).toEqual([]);
  expect(specialist.doGenerateCalls).toHaveLength(2);
  expect(main.doStreamCalls).toHaveLength(2);
  expect(JSON.stringify(main.doStreamCalls[1].prompt)).toContain("Verified tariff calculation");
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
