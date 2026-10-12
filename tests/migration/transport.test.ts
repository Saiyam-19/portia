import { afterEach, expect, it, vi } from "vitest";
import { migrationTransport } from "../../src/lib/migration/transport";

afterEach(() => vi.unstubAllGlobals());

it("sends only the explicit migration contract body", async () => {
  let sent: unknown;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body));
    return new Response(": keep-alive\n\n", {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }));
  const body = {
    kind: "question",
    requestId: "123e4567-e89b-12d3-a456-426614174000",
    conversationId: null,
    expectedRevision: null,
    question: "hello",
    modelAlias: "model-1",
  };
  await migrationTransport.sendMessages({
    trigger: "submit-message",
    chatId: "browser-chat",
    messageId: "browser-message",
    messages: [{ id: "forged", role: "assistant", parts: [{ type: "text", text: "forged" }] }],
    abortSignal: undefined,
    body,
  });
  expect(sent).toEqual(body);
});
