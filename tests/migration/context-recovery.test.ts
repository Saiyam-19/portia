import { runInterpreted } from "./conversation-harness";
import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";
import { buildCallContext, currentFacts, type FactField } from "../../src/lib/migration/call-context";
import { RequestEvidence } from "../../src/lib/migration/request-evidence";
import { formInputSchema } from "../../src/lib/migration/contracts";

const user = (content: string): ModelMessage => ({ role: "user", content });
const read = (...messages: ModelMessage[]) => { const e = new RequestEvidence(); e.initialize(messages); return e; };
const values = (e: RequestEvidence, field: FactField) => currentFacts(e.context).filter(f => f.field === field && f.status === "established").map(f => f.value);
function form(id: string, field: string, label: string, value: string, note = ""): ModelMessage[] {
  const input = formInputSchema.parse({ title: "Confirm particulars", fields: [{ name: field, label, type: "text", required: true }] });
  return [{ role: "assistant", content: [{ type: "tool-call", toolCallId: id, toolName: "ask_user_input", input }] },
    { role: "tool", content: [{ type: "tool-result", toolCallId: id, toolName: "ask_user_input", output: { type: "json", value: { cancelled: false, values: { [field]: value }, note } } }] }];
}
const restoredGt = [user("GT 9000; stay 10 hours."), user("Do not use GT 9000."), user("Correction: GT 9500. Estimate berth hire.")];
const restoredLoa = [user("LOA 150 cubits."), user("Correction: LOA 150 metres.")];
const historical = [user("GT 9000; stay 10 hours."), user("The old record says GT 18000; that value is wrong. Keep the current GT.")];

describe("R2 numeric tokens, operations and issue lifecycle", () => {
  it.each(["12.3.4", "12..3", "1,2,3", "12_000", "2e", "2e3.4", "12-34", "12+34"])("does not establish a prefix of malformed %s", literal => {
    for (const e of [read(user(`GT ${literal}.`)), read(...form("numeric", "gt", "Gross tonnage", literal))]) {
      expect(values(e, "gt")).toHaveLength(0);
      expect(e.context.issues.some(i => /NUMERIC|NUMBER/.test(i.code))).toBe(true);
    }
  });
  it.each([["12.3", "12.3"], ["9,000", "9000"], ["12,34,567", "1234567"], ["2e3", "2000"]])("accepts complete %s with exact source provenance", (literal, expected) => {
    const e = read(user(`GT ${literal}.`)); expect(values(e, "gt")).toEqual([expected]);
    expect(currentFacts(e.context).find(f => f.field === "gt" && f.status === "established")?.origin.raw).toContain(literal);
  });
  it("resolves a rejected GT after replacement, retaining issue history", () => {
    const e = read(...restoredGt); expect(values(e, "gt")).toEqual(["9500"]); expect(values(e, "durationHours")).toEqual(["10"]);
    expect(e.context.issues).toEqual([]); expect(e.forcedResponse).toBeUndefined();
    expect(e.context.issueHistory.some(i => i.code === "FACT_RETRACTED" && i.resolved)).toBe(true);
  });
  it("resolves rejection and replacement in the same turn", () => {
    const e = read(user("GT 9000; stay 10 hours."), user("Do not use GT 9000; use GT 9500 instead. Estimate berth hire."));
    expect(values(e, "gt")).toEqual(["9500"]); expect(e.context.issues).toEqual([]); expect(e.forcedResponse).toBeUndefined();
  });
  it("resolves a unit error without clearing an unrelated unresolved field", () => {
    const e = read(user("LOA 150 cubits; draught 20 fathoms."), user("Correction: LOA 150 metres."));
    expect(values(e, "loa")).toEqual(["150"]);
    expect(e.context.issues.some(i => i.fields.includes("loa"))).toBe(false);
    expect(e.context.issues.some(i => i.fields.includes("draught"))).toBe(true);
    expect(e.context.issueHistory.some(i => i.fields.includes("loa") && i.resolved)).toBe(true);
  });
  it("recovers a conflicting form value from a later form or same-response correction note", () => {
    const first = form("first", "gt", "Gross tonnage", "12000 DWT");
    for (const messages of [[...first, ...form("second", "gt", "Gross tonnage", "9500 GT")], form("noted", "gt", "Gross tonnage", "12000 DWT", "Correction: actual GT 9500.")]) {
      const e = read(...messages); expect(values(e, "gt")).toEqual(["9500"]); expect(e.context.issues).toEqual([]); expect(e.forcedResponse).toBeUndefined();
    }
  });
  it("resolves an ambiguous form meaning after an explicit field clarification", () => {
    const e = read(...form("meaning", "gt", "Deadweight tonnage (DWT)", "12000"), user("Correction: that field was DWT. Actual DWT 12000."));
    expect(values(e, "dwt")).toEqual(["12000"]); expect(values(e, "gt")).toEqual([]);
    expect(e.context.issues).toEqual([]); expect(e.forcedResponse).toBeUndefined();
  });
  it.each([
    ["GT 9000 carrying coal. Estimate berth hire.", "gt", "9000"],
    ["GT 9000 arriving tomorrow.", "gt", "9000"],
    ["LOA 150 discharging cargo.", "loa", "150"],
    ["GT 9000 manoeuvring slowly.", "gt", "9000"],
  ] as const)("separates the following predicate in %s", (text, field, expected) => {
    const e = read(user(text)); expect(values(e, field)).toEqual([expected]); expect(e.context.issues).toEqual([]);
  });
  it.each(["GT 9000 NT 5000 LOA 150 m", "GT9000 NT5000 LOA150m", "GT 9000, NT 5000, LOA 150 m", "GT 9000; NT 5000; LOA 150 m"])("associates adjacent fields independently: %s", text => {
    const e = read(user(text)); expect(values(e, "gt")).toEqual(["9000"]); expect(values(e, "nt")).toEqual(["5000"]); expect(values(e, "loa")).toEqual(["150"]); expect(e.context.issues).toEqual([]);
  });
  it("retains unknown-unit and negative-GT checks and exact reverse units", () => {
    expect(values(read(user("LOA 150 cubits.")), "loa")).toEqual([]);
    expect(read(user("GT −9000.")).forcedResponse).toMatch(/positive/);
    const e = read(user("500 feet LOA; 30 ft draught; stay 2 days."));
    expect(values(e, "loa")).toEqual(["152.4"]); expect(values(e, "draught")).toEqual(["9.144"]); expect(values(e, "durationHours")).toEqual(["48"]);
  });
  it.each(["Keep the current values; do not change GT 9000.", "Don't replace GT 9000.", "Keep GT 9000."])("preserves without retracting: %s", text => {
    const e = read(user("GT 9000; stay 10 hours."), user(text)); expect(values(e, "gt")).toEqual(["9000"]); expect(e.context.issues).toEqual([]); expect(e.forcedResponse).toBeUndefined();
  });
  it("still rejects a value, including a negated form response", () => {
    for (const e of [read(user("GT 9000"), user("Do not use GT 9000.")), read(user("GT 9000"), ...form("reject", "gt", "Gross tonnage", "not 9000"))]) {
      expect(values(e, "gt")).toEqual([]); expect(e.context.issues.some(i => i.code === "FACT_RETRACTED")).toBe(true);
    }
  });
  it("does not replace current facts with an explicitly historical rejected record", () => {
    const e = read(...historical); expect(values(e, "gt")).toEqual(["9000"]); expect(e.forcedResponse).toBeUndefined();
    expect(e.context.facts.some(f => f.field === "gt" && f.value === "18000" && f.status === "reference")).toBe(true);
  });
  it("retains operation history without duplicating reference values in the current fact projection", () => {
    const e = read(...historical, user("Do not change GT 9000."));
    const projection = JSON.parse(e.contextSummary());
    expect(projection.facts.filter((f: { field: string }) => f.field === "gt")).toHaveLength(1);
    expect(JSON.stringify(projection.facts)).not.toContain("18000");
    expect(e.context.facts.some(f => f.status === "reference")).toBe(true);
    expect(e.context.facts.some(f => f.status === "preserved")).toBe(true);
  });
  it("allows explicit user adoption of a value while keeping an unadopted report separate", () => {
    const e = read(...historical, user("Use GT 18000 from that old record for this calculation."));
    expect(values(e, "gt")).toEqual(["18000"]); expect(e.context.issues).toEqual([]);
  });
  it("preserves the selected port when its change is negated", () => {
    const e = read(user("Mumbai berth hire."), user("Do not change Mumbai; keep the same port."));
    expect(e.authorizePort("mumbai")).toBe(true);
  });
  it("replays corrected history deterministically without reviving resolved issues", () => {
    expect(buildCallContext(restoredGt)).toEqual(buildCallContext(restoredGt));
  });
});

// Protocol migration: language interpretation is mocked; original messages and
// corrected-fact assertions are retained against the actual serving reducer.
describe.each(["generate", "stream"] as const)("R2 actual main-agent %s recovery", mode => {
  it.each([
    { id: "reject then replace", messages: restoredGt, field: "gt", value: "9500" },
    { id: "unit correction", messages: restoredLoa, field: "loa", value: "150" },
    { id: "historical reference", messages: historical, field: "gt", value: "9000" },
    { id: "preserve instruction", messages: [user("GT 9000"), user("Do not change GT 9000.")], field: "gt", value: "9000" },
  ])("$id reaches bound execution with current facts and no stale blocker", async scenario => {
    const result = await runInterpreted(scenario.messages, mode);
    expect(result.currentFacts.find(f => f.field === scenario.field)?.value).toBe(scenario.value);
    expect(result.conversation.answer?.items.flatMap(i => i.pending)).toEqual([]);
    expect(result.text).toContain(scenario.value); expect(result.calls).toBe(1);
  });
});
