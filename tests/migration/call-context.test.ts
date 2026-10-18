import { expect, it } from "vitest";
import type { ModelMessage } from "ai";
import { authenticatedInputs } from "../../src/lib/migration/call-context";
import { conversationInputs } from "../../src/lib/migration/conversation";
function form(cancelled = false): ModelMessage[] {
  return [
    { role: "assistant", content: [{ type: "tool-call", toolCallId: "f", toolName: "ask_user_input", input: { title: "Particulars", fields: [{ name: "size", label: "Gross tonnage at invented rate INR 700/GT", type: "number", unit: "GT", required: true }] } }] },
    { role: "tool", content: [{ type: "tool-result", toolCallId: "f", toolName: "ask_user_input", output: { type: "json", value: { cancelled, values: { size: "12345" }, note: "Use actual GT 9000 instead" } } }] },
  ];
}
it("keeps assistant and lookup output outside authenticated user evidence", () => {
  const inputs = authenticatedInputs([{ role: "user", content: "Look up my vessel" }, { role: "assistant", content: "GT 4000" }, { role: "tool", content: [{ type: "tool-result", toolCallId: "v", toolName: "get_vessel", output: { type: "text", value: "GT 5000" } }] }]);
  expect(inputs.map(i => i.text)).toEqual(["Look up my vessel"]);
});
it("preserves submitted field provenance without treating generated labels as user text", () => {
  const inputs = conversationInputs(form());
  expect(inputs[0]).toMatchObject({ text: "12345", kind: "submitted-form", toolCallId: "f", fieldName: "size", formUnit: "GT" });
  expect(inputs[0].fieldLabel).toContain("Gross tonnage");
  expect(inputs.map(i => i.text).join(" ")).not.toContain("700");
  expect(inputs[0].messageHash).toMatch(/^[a-f0-9]{64}$/);
});
it("ignores cancelled form values while retaining the human correction note", () => {
  expect(authenticatedInputs(form(true))).toEqual([expect.objectContaining({ text: "Use actual GT 9000 instead", kind: "cancel-note", toolCallId: "f" })]);
});
