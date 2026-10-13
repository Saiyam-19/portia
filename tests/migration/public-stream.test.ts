import { expect, it, vi } from "vitest";
import { toUIMessageStream, type TextStreamPart, type ToolSet } from "ai";
import { publicChatStream, stripPrivateProviderData } from "../../src/lib/migration/public-stream";
import { responseErrorMessage } from "../../src/lib/migration/response-errors";

async function drain<T>(stream: ReadableStream<T>) {
  const parts: T[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) return parts;
    parts.push(value);
  }
}

it("removes provider metadata recursively while preserving public tool identity", () => {
  const safe = stripPrivateProviderData({
    type: "tool-call",
    toolCallId: "tool-1",
    toolName: "ask_user_input",
    input: { title: "Details" },
    providerMetadata: { openrouter: { model: "private/model" } },
    nested: { providerOptions: { openrouter: { zdr: true } }, text: "public" },
  });
  expect(safe).toEqual({
    type: "tool-call",
    toolCallId: "tool-1",
    toolName: "ask_user_input",
    input: { title: "Details" },
    nested: { text: "public" },
  });
});

it("sends a useful timeout error through the actual UI stream without leaking the abort reason", async () => {
  const controller = new AbortController();
  const timeout = new DOMException("private timeout context", "TimeoutError");
  controller.abort(timeout);
  const onFailure = vi.fn();
  const source = new ReadableStream<TextStreamPart<ToolSet>>({ start(stream) {
    stream.enqueue({ type: "abort", reason: "private timeout context" });
    stream.close();
  } });
  const stream = toUIMessageStream({
    stream: publicChatStream(source, { abortSignal: controller.signal, onFailure }),
    onError: responseErrorMessage,
  });
  const parts = await drain(stream);
  expect(parts).toContainEqual({ type: "error", errorText: responseErrorMessage(timeout) });
  expect(parts).toContainEqual({ type: "abort" });
  expect(JSON.stringify(parts)).not.toContain("private");
  expect(onFailure).toHaveBeenCalledWith(timeout);
});

it("keeps an intentional stop as cancellation rather than reporting a timeout", async () => {
  const controller = new AbortController();
  controller.abort(new DOMException("User stopped", "AbortError"));
  const source = new ReadableStream<TextStreamPart<ToolSet>>({ start(stream) {
    stream.enqueue({ type: "abort", reason: "private cancellation" });
    stream.close();
  } });
  const parts = await drain(publicChatStream(source, { abortSignal: controller.signal, onFailure: () => undefined }));
  expect(parts).toEqual([{ type: "abort" }]);
});
