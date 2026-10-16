import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";
import { conversationInputs, emptyConversation, currentConversationFact, reduceInterpretation, replayConversation, type Interpretation } from "../../src/lib/migration/conversation";
import { planConversationAnswer, renderConversationAnswer, verifyConversationAnswer } from "../../src/lib/migration/conversation-rules";
const binding = { runId: "run", conversationId: "chat", fence: 3, revision: 4 };
const user = (content: string): ModelMessage => ({ role: "user", content });
function proposal(messages: ModelMessage[], previous = emptyConversation()) {
  const inputs = conversationInputs(messages); const input = inputs.at(-1)!;
  const evidence = (quote: string) => ({ inputId: input.id, quote });
  const p: Interpretation = { version: 1, baseHash: previous.hash, inputIds: inputs.filter(i => !previous.consumed.includes(i.id)).map(i => i.id), scopes: previous.scopes.length ? [] : [{ id: "call", label: "Current call", kind: "call", parentId: null, evidence: evidence(input.text) }], operations: [], tasks: [{ id: "quote", scopeId: "call", kind: "quote", source: "supplied", charges: ["berth"], ruleScopeIds: ["berth-rule"], evidence: evidence(input.text) }], unresolved: [] };
  return { inputs, p, evidence, apply: () => reduceInterpretation(previous, p, inputs) };
}
function supplied() {
  const messages = [user("Check the supplied berth quote: GT 20000. Stay 20 hours. Berth USD 0.01 per GT per hour, exact time. No taxes or other charges apply.")];
  const draft = proposal(messages); const { p, evidence } = draft;
  p.scopes.push({ id: "berth-rule", label: "Berth terms", kind: "quotation-rule", parentId: "call", evidence: evidence("Berth USD 0.01 per GT per hour, exact time.") });
  for (const [scopeId, field, value, unit, quote] of [
    ["call", "gt", "20000", "GT", "GT 20000"], ["call", "durationHours", "20", "hours", "Stay 20 hours"], ["call", "taxPercent", "0", "percent", "No taxes or other charges apply."], ["call", "otherAdjustments", "false", "", "No taxes or other charges apply."],
    ["berth-rule", "charge", "berth", "", "Berth USD 0.01 per GT per hour, exact time."], ["berth-rule", "currency", "USD", "", "USD 0.01"], ["berth-rule", "rate", "0.01", "money", "USD 0.01"], ["berth-rule", "basis", "gt-period", "", "per GT per hour"], ["berth-rule", "periodHours", "1", "hours", "per GT per hour"], ["berth-rule", "rounding", "exact", "", "exact time"],
  ] as const) p.operations.push({ scopeId, field, operation: "assert", value, unit, evidence: evidence(quote) });
  return { ...draft, messages };
}
describe("shared conversation reducer and planner (code-aware proposals)", () => {
  it("binds supplied quotation, preserves facts on correction and invalidates prior answer", async () => {
    const d = supplied(); const first = d.apply(); const answer = await planConversationAnswer(first.state, binding);
    expect(renderConversationAnswer(answer)).toContain("USD 4,000.00");
    const messages = [...d.messages, user("Correction: GT 10000. Keep the quoted terms and time unchanged.")];
    const next = proposal(messages, first.state);
    next.p.operations = [{ scopeId: "call", field: "gt", value: "10000", unit: "GT", operation: "correct", evidence: next.evidence("GT 10000") }];
    const revised = next.apply().state;
    expect(currentConversationFact(revised, "call", "durationHours")?.value).toBe("20");
    expect(renderConversationAnswer(await planConversationAnswer(revised, binding))).toContain("USD 2,000.00");
    expect(await verifyConversationAnswer(answer, revised, binding)).toBe(false);
  });
  it("replays accepted receipts from persisted history without a model call", () => {
    const d = supplied(); const reduced = d.apply();
    const messages: ModelMessage[] = [...d.messages, { role: "tool", content: [{ type: "tool-result", toolName: "interpret_request", toolCallId: "i", output: { type: "json", value: JSON.parse(JSON.stringify(reduced.receipt)) } }] }];
    expect(replayConversation(messages).state).toEqual(reduced.state);
    expect(replayConversation(messages).pending).toHaveLength(0);
    messages[0] = user("Changed evidence");
    expect(() => replayConversation(messages)).toThrow();
  });
  it("asks only missing requirements and retains a separately answerable elapsed task", async () => {
    const d = proposal([user("Unknown port. From 2026-10-12 00:00 UTC to 2026-10-13 12:00 UTC; tell me elapsed time and official berth charge.")]);
    d.p.tasks = [{ ...d.p.tasks[0], source: "official", ruleScopeIds: [] }, { ...d.p.tasks[0], id: "time", kind: "elapsed", source: "none", charges: [], ruleScopeIds: [] }];
    d.p.operations = [
      { scopeId: "call", field: "intervalStart", value: "2026-10-12 00:00 UTC", unit: "timestamp", operation: "assert", evidence: d.evidence("From 2026-10-12 00:00 UTC") },
      { scopeId: "call", field: "intervalEnd", value: "2026-10-13 12:00 UTC", unit: "timestamp", operation: "assert", evidence: d.evidence("to 2026-10-13 12:00 UTC") },
    ];
    const answer = await planConversationAnswer(d.apply().state, binding);
    expect(answer.items.map(i => i.status)).toEqual(["unresolved", "calculated"]);
    expect(answer.items[0].pending).toEqual(["the requested port/terminal"]);
    expect(renderConversationAnswer(answer)).toContain("36 hours");
  });
  it.each(["GT 20000 kg", "GT 20000 DWT", "not GT 20000", "Previous GT 20000"])("rejects dimension/reference laundering: %s", raw => {
    const d = supplied(); d.messages[0] = user(raw); const inputs = conversationInputs(d.messages);
    d.p.inputIds = inputs.map(i => i.id); d.p.scopes = [{ ...d.p.scopes[0], evidence: { inputId: inputs[0].id, quote: raw } }];
    d.p.tasks = [{ ...d.p.tasks[0], source: "none", kind: "other", charges: [], ruleScopeIds: [], evidence: { inputId: inputs[0].id, quote: raw } }];
    d.p.operations = [{ scopeId: "call", field: "gt", operation: "assert", value: "20000", unit: "GT", evidence: { inputId: inputs[0].id, quote: raw } }];
    expect(currentConversationFact(reduceInterpretation(emptyConversation(), d.p, inputs).state, "call", "gt")).toBeUndefined();
  });
  it("does not let conflicting quantity values silently overwrite one another", () => {
    const d = supplied(); const state = d.apply().state;
    const next = proposal([...d.messages, user("GT 10000")], state); next.p.operations = [{ scopeId: "call", field: "gt", value: "10000", unit: "GT", operation: "assert", evidence: next.evidence("GT 10000") }];
    expect(currentConversationFact(next.apply().state, "call", "gt")).toBeUndefined();
  });
  it("rejects absent semantic evidence even when the cited span belongs to the user", () => {
    const d = supplied(); d.p.operations.push({ scopeId: "call", field: "coastalLicence", operation: "assert", value: "true", unit: "", evidence: d.evidence("GT 20000") });
    expect(currentConversationFact(d.apply().state, "call", "coastalLicence")).toBeUndefined();
  });
  it("rejects stale revisions and cross-call quotation rules", () => {
    const d = supplied(); d.p.baseHash = "a".repeat(64); expect(d.apply).toThrow(/stale/);
    d.p.baseHash = emptyConversation().hash; d.p.scopes[1].parentId = "absent"; expect(d.apply).toThrow(/parent/);
  });
  it("preserves scope isolation and does not inherit facts into a new call", () => {
    const d = supplied(); const prior = d.apply().state;
    const next = proposal([...d.messages, user("A new call for another vessel; GT 5000")], prior);
    next.p.scopes = [{ id: "second", label: "Another vessel", kind: "call", parentId: null, evidence: next.evidence("A new call for another vessel") }];
    next.p.operations = [{ scopeId: "second", field: "gt", operation: "assert", value: "5000", unit: "GT", evidence: next.evidence("GT 5000") }];
    next.p.tasks = [{ ...next.p.tasks[0], scopeId: "second", source: "official", ruleScopeIds: [] }];
    const state = next.apply().state;
    expect(currentConversationFact(state, "call", "gt")?.value).toBe("20000");
    expect(currentConversationFact(state, "second", "gt")?.value).toBe("5000");
    expect(currentConversationFact(state, "second", "durationHours")).toBeUndefined();
  });
  it("does not ask vessel particulars for a rule question", async () => {
    const d = proposal([user("Explain Mumbai berth rules.")]); d.p.tasks = [{ ...d.p.tasks[0], kind: "rule", source: "official", ruleScopeIds: [] }];
    d.p.operations = [{ scopeId: "call", field: "port", operation: "assert", value: "mumbai", unit: "", evidence: d.evidence("Mumbai") }];
    const answer = await planConversationAnswer(d.apply().state, binding);
    expect(answer.items[0].status).toBe("explained"); expect(answer.items[0].pending).toEqual([]); expect(answer.items[0].body).toContain("§2.17");
  });
  it("inherits only vessel particulars into an explicitly linked later call", () => {
    const first = supplied(); const before = first.apply().state;
    const messages = [...first.messages, user("Next leg for the same vessel. Keep its GT; new voyage times will follow.")];
    const next = proposal(messages, before); const gt = currentConversationFact(before, "call", "gt")!;
    next.p.scopes = [{ id: "leg-two", kind: "call", label: "Next leg", parentId: "call", evidence: next.evidence("Next leg for the same vessel") }];
    next.p.tasks = [{ ...next.p.tasks[0], scopeId: "leg-two", source: "official", ruleScopeIds: [] }];
    next.p.operations = [{ scopeId: "leg-two", field: "gt", operation: "inherit", fromFactId: gt.id, value: gt.value, unit: gt.unit, evidence: next.evidence("Next leg for the same vessel") }];
    const after = next.apply().state;
    expect(currentConversationFact(after, "leg-two", "gt")?.value).toBe("20000");
    expect(currentConversationFact(after, "leg-two", "durationHours")).toBeUndefined();
    next.p.operations[0] = { ...next.p.operations[0], field: "durationHours", fromFactId: currentConversationFact(before, "call", "durationHours")!.id, value: "20", unit: "hours" };
    expect(currentConversationFact(next.apply().state, "leg-two", "durationHours")).toBeUndefined();
  });
  it("does not let a numeric form value acquire a contradictory tonnage meaning", () => {
    const messages: ModelMessage[] = [user("Confirm vessel particulars."), { role: "assistant", content: [{ type: "tool-call", toolName: "ask_user_input", toolCallId: "form", input: { title: "Particulars", fields: [{ name: "size", label: "Deadweight tonnage (DWT), not GT", type: "text", required: true }] } }] }, { role: "tool", content: [{ type: "tool-result", toolName: "ask_user_input", toolCallId: "form", output: { type: "json", value: { values: { size: "12345" }, cancelled: false } } }] }];
    const d = proposal(messages); d.p.tasks = [{ ...d.p.tasks[0], kind: "facts", source: "none", charges: [], ruleScopeIds: [] }];
    d.p.operations = [{ scopeId: "call", field: "gt", operation: "assert", value: "12345", unit: "GT", evidence: d.evidence("12345") }];
    expect(currentConversationFact(d.apply().state, "call", "gt")).toBeUndefined();
    d.p.operations[0] = { ...d.p.operations[0], field: "dwt", unit: "tonnes" };
    expect(currentConversationFact(d.apply().state, "call", "dwt")?.value).toBe("12345");
  });
});
