import { MockLanguageModelV4 } from "ai/test";
import { afterEach, expect, it, vi } from "vitest";
import { withSafeModelErrors } from "../../src/lib/migration/safe-model";

afterEach(() => vi.restoreAllMocks());

it("preserves cancellation semantics without logging a rich provider abort", async () => {
  const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const model = withSafeModelErrors(new MockLanguageModelV4({
    doStream: async () => {
      throw { cause: new DOMException("Stopped", "AbortError"), requestBodyValues: { prompt: "private" } };
    },
  }));
  const error = await Promise.resolve(model.doStream({ prompt: [] })).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(DOMException);
  expect((error as Error).name).toBe("AbortError");
  expect(error).not.toHaveProperty("requestBodyValues");
  expect(log).not.toHaveBeenCalled();
});

it("preserves timeout identity through redaction for the public error classifier", async () => {
  const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const model = withSafeModelErrors(new MockLanguageModelV4({
    doStream: async () => { throw new DOMException("private provider context", "TimeoutError"); },
  }), { runId: "run-fixture", agent: "main" });
  const error = await Promise.resolve(model.doStream({ prompt: [] })).catch((caught: unknown) => caught);
  expect(error).toMatchObject({ name: "TimeoutError", message: "The model response timed out." });
  expect(log.mock.calls[0]?.[1]).toMatchObject({ errorType: "timeout", phase: "stream-start", runId: "run-fixture" });
  expect(JSON.stringify(log.mock.calls)).not.toContain("private");
});

it("redacts rich errors before ToolLoopAgent's default logger receives them", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const model = withSafeModelErrors(new MockLanguageModelV4({
    doStream: async () => { throw { statusCode: 402, requestBodyValues: { prompt: "private" } }; },
  }));
  const error = await Promise.resolve(model.doStream({ prompt: [] })).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(Error);
  expect(String(error)).toBe("Error: The selected model is unavailable.");
  expect(error).not.toHaveProperty("requestBodyValues");
});

it("redacts provider error chunks without changing normal stream text", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const model = withSafeModelErrors(new MockLanguageModelV4({
    doStream: async () => ({
      warnings: [],
      stream: new ReadableStream({ start(controller) {
        controller.enqueue({ type: "text-start", id: "text-1" });
        controller.enqueue({ type: "text-delta", id: "text-1", delta: "Visible answer" });
        controller.enqueue({ type: "error", error: { statusCode: 500, responseBody: "private" } });
        controller.close();
      } }),
    }),
  }));
  const result = await model.doStream({ prompt: [] });
  const reader = result.stream.getReader();
  await reader.read();
  expect((await reader.read()).value).toEqual({ type: "text-delta", id: "text-1", delta: "Visible answer" });
  const chunk = (await reader.read()).value;
  expect(chunk?.type).toBe("error");
  if (chunk?.type === "error") expect(chunk.error).not.toHaveProperty("responseBody");
});

it("redacts asynchronous stream read failures after provider setup succeeds", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const model = withSafeModelErrors(new MockLanguageModelV4({
    doStream: async () => ({
      warnings: [],
      stream: new ReadableStream({ start(controller) {
        controller.error({ statusCode: 500, responseBody: "private", requestBodyValues: { prompt: "private" } });
      } }),
    }),
  }));
  const result = await model.doStream({ prompt: [] });
  const error = await result.stream.getReader().read().catch((caught: unknown) => caught);
  expect(String(error)).toBe("Error: The selected model is unavailable.");
  expect(error).not.toHaveProperty("responseBody");
});

it("propagates consumer cancellation to the provider stream", async () => {
  const cancel = vi.fn();
  const source = new ReadableStream({ cancel });
  const model = withSafeModelErrors(new MockLanguageModelV4({
    doStream: async () => ({ warnings: [], stream: source }),
  }));
  const result = await model.doStream({ prompt: [] });
  await result.stream.cancel("stopped");
  expect(cancel).toHaveBeenCalledWith("stopped");
  expect(source.locked).toBe(false);
});
