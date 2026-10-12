import { expect, it } from "vitest";
import { stripPrivateProviderData } from "../../src/lib/migration/public-stream";

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
