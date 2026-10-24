import { describe, expect, it } from "vitest";
import { safeMessageParts } from "../../src/lib/berthwise/projection";

describe("message projection", () => {
  it("shows text, tool progress and cards from successful tool results only", () => {
    const parts = safeMessageParts([
      { type: "text", text: "Here is the estimate." },
      { type: "tool-call", toolCallId: "e1", toolName: "estimate_port_call", input: {} },
      { type: "tool-result", toolCallId: "e1", toolName: "estimate_port_call", output: { type: "json", value: { summary: "s", card: { kind: "estimate", total: "19728" }, private: "kept out" } } },
      { type: "tool-result", toolCallId: "e2", toolName: "estimate_port_call", output: { type: "error-json", value: { card: { kind: "estimate" } } } },
      { type: "tool-result", toolCallId: "e3", toolName: "Not A Tool", output: { type: "json", value: { card: { kind: "estimate" } } } },
    ]);
    expect(parts).toEqual([
      { type: "text", text: "Here is the estimate." },
      { type: "tool", toolCallId: "e1", toolName: "estimate_port_call", status: "called" },
      { type: "tool", toolCallId: "e1", toolName: "estimate_port_call", status: "completed" },
      { type: "card", toolCallId: "e1", toolName: "estimate_port_call", card: JSON.stringify({ kind: "estimate", total: "19728" }) },
      { type: "tool", toolCallId: "e2", toolName: "estimate_port_call", status: "error" },
    ]);
  });

  it("drops oversized cards rather than truncating them", () => {
    const parts = safeMessageParts([{ type: "tool-result", toolCallId: "big", toolName: "estimate_port_call", output: { type: "json", value: { card: { kind: "estimate", blob: "x".repeat(70_000) } } } }]);
    expect(parts.some(part => part.type === "card")).toBe(false);
  });
});
