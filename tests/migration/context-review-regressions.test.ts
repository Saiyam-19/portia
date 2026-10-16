import { runInterpreted } from "./conversation-harness";
import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";
import { buildCallContext, currentFacts, type CallContext, type FactField } from "../../src/lib/migration/call-context";
import { RequestEvidence } from "../../src/lib/migration/request-evidence";
import { formInputSchema } from "../../src/lib/migration/contracts";

const user = (content: string): ModelMessage => ({ role: "user", content });
function form(name: string, label: string, value: string, unit?: string): ModelMessage[] {
  const toolCallId = `details_${name}`;
  const definition = formInputSchema.parse({ title: "Confirm vessel/call details", description: "Update only this field.", fields: [{ name, label, type: "text", required: true, ...(unit ? { unit } : {}) }] });
  return [{ role: "assistant", content: [{ type: "tool-call", toolCallId, toolName: "ask_user_input", input: definition }] },
    { role: "tool", content: [{ type: "tool-result", toolCallId, toolName: "ask_user_input", output: { type: "json", value: { cancelled: false, values: { [name]: value }, note: "" } } }] }];
}
const established = (c: CallContext, field: FactField) => currentFacts(c).filter(f => f.field === field && f.status === "established");
const evidence = (messages: ModelMessage[]) => { const e = new RequestEvidence(); e.initialize(messages); return e; };
const berth = "All fast 14 October 2026 10:00 UTC; last line away 14 October 2026 12:00 UTC.";
const visit = `Arrived anchorage 14 October 2026 08:00 UTC; ${berth}`;
const corrected = [user(berth), user("Correction: last line away 14 October 2026 13:00 UTC, not last line away 14 October 2026 12:00 UTC.")];
const nextLeg = [user(`Vessel Alpha: GT 9000; NT 4000; LOA 150 m; draught 7 m; stay 2 hours; Mumbai; ${berth}`), user("Next leg for vessel Alpha: Jaigarh. What berth hire applies?")];

describe("review B1–B6 and positive neighbors", () => {
  it.each([
    ["Deadweight tonnage (DWT), not GT", "dwt", "gt"],
    ["Gross tonnage (GT), not DWT", "gt", "dwt"],
  ] as const)("B1 uses one interpretation for %s", (label, wanted, rejected) => {
    const c = buildCallContext(form("size", label, "12345"));
    expect(established(c, wanted)[0]?.value).toBe("12345"); expect(established(c, rejected)).toHaveLength(0);
  });
  it("B2 never establishes GT or DWT from a conflicting bound form value", () => {
    const c = buildCallContext([user("GT 9000; stay 10 hours."), ...form("gt", "Gross tonnage", "12000 DWT")]);
    expect(established(c, "gt")).toHaveLength(0); expect(established(c, "dwt")).toHaveLength(0);
    expect(c.issues.some(i => /UNIT|MEASUREMENT/.test(i.code))).toBe(true);
    expect(established(c, "durationHours")[0]?.value).toBe("10");
  });
  it.each([false, true])("B2 converts explicit feet exactly with provenance (form=%s)", useForm => {
    const c = buildCallContext(useForm ? [...form("loa", "LOA", "500 feet", "m"), ...form("draught", "Draught", "30 ft", "m")] : [user("LOA 500 feet; draught 30 ft; GT 9000.")]);
    for (const [field, value, raw] of [["loa", "152.4", "500 feet"], ["draught", "9.144", "30 ft"]] as const) {
      const f = established(c, field)[0]; expect(f).toMatchObject({ value, unit: "metre" });
      expect(f.origin.raw).toContain(raw); expect(f.normalizations.join(" ")).toContain("0.3048");
    }
  });
  it("B2 keeps compatible form units and flags unsupported length units", () => {
    expect(established(buildCallContext(form("gt", "Gross tonnage", "12000 GRT", "GT")), "gt")[0]?.value).toBe("12000");
    const c = buildCallContext([user("LOA 3 furlongs; GT 9000.")]);
    expect(established(c, "loa")).toHaveLength(0); expect(established(c, "gt")[0]?.value).toBe("9000");
    expect(c.issues.some(i => /UNIT/.test(i.code))).toBe(true);
  });
  it("B3 does not replace a duration with a negated assignment", () => {
    const e = evidence([user("GT 9000; stay 10 hours."), user("Do not use 30 hours. Keep the original stay.")]);
    expect(e.particulars()).toContain("10 hours"); expect(e.particulars()).not.toContain("30 hours");
  });
  it("B3 retains the affirmative timestamp correction and rejects the negated endpoint", () => {
    const e = evidence(corrected); expect(e.timeSummary()).toContain("3 hours");
    expect(e.timeSummary()).not.toContain("12:00");
    expect(e.timeInput({ start: "14 October 2026 10:00 UTC", end: "14 October 2026 12:00 UTC" })).toHaveProperty("error");
  });
  it("B3 permits positive replacements after a rejected value", () => {
    const c = buildCallContext([user("stay 10 hours"), user("Do not use 30 hours; use 20 hours instead.")]);
    expect(established(c, "durationHours")[0]?.value).toBe("20");
  });
  it("B4 gives the same vessel a fresh call scope, retaining only vessel particulars", () => {
    const first = buildCallContext(nextLeg.slice(0, 1)); const e = evidence(nextLeg);
    expect(e.context.activeScopeIds).not.toEqual(first.activeScopeIds);
    for (const f of ["gt", "nt", "loa"] as const) expect(established(e.context, f)).toHaveLength(1);
    for (const f of ["berthStart", "berthEnd", "durationHours", "draught"] as const) expect(established(e.context, f)).toHaveLength(0);
    expect(e.timeSummary()).toBe(""); expect(e.authorizePort("jaigarh")).toBe(true);
    expect(e.context.scopes.find(s => s.id === first.activeScopeIds[0])?.port?.candidates).toEqual(["mumbai"]);
  });
  it("B4 still updates a named same-call field without dropping timestamps", () => {
    const e = evidence([nextLeg[0], user("For vessel Alpha: correct GT to 9500; this is the same call.")]);
    expect(e.particulars()).toContain("9,500"); expect(e.timeSummary()).toContain("2 hours");
  });
  it("B5 form/prose anchorage corrections replace the same semantic fact", () => {
    const prose = evidence([user(visit), user("Correction: arrival at anchorage 14 October 2026 09:00 UTC.")]);
    const fromForm = evidence([user(visit), ...form("arrival", "Arrival at anchorage", "14 October 2026 09:00 UTC")]);
    for (const e of [prose, fromForm]) {
      expect(established(e.context, "anchorageArrival").map(f => f.value)).toEqual(["14 October 2026 09:00 UTC"]);
      expect(established(e.context, "intervalStart")).toHaveLength(0);
      expect(e.timeSummary()).toContain("Full recorded visit: 3 hours"); expect(e.timeSummary()).not.toContain("08:00");
    }
    expect(fromForm.timeSummary()).toBe(prose.timeSummary());
  });
  it.each([
    ["cargo_done", "Cargo completed", "cargoCompleted"], ["departure", "Departed port limits", "portDeparture"],
    ["arrival", "All fast at berth", "berthStart"], ["departure", "Last line away", "berthEnd"],
  ] as const)("B5 gives the complete %s form its canonical role", (name, label, field) => {
    const c = buildCallContext(form(name, label, "14 October 2026 11:00 UTC"));
    expect(established(c, field)[0]?.value).toBe("14 October 2026 11:00 UTC");
    expect(established(c, "unassignedTimestamp")).toHaveLength(0);
  });
  it("B5 never repairs reversed semantic events by sorting clock values", () => {
    const e = evidence([user("Arrived anchorage 14 October 2026 14:00 UTC; all fast 14 October 2026 10:00 UTC; last line away 14 October 2026 12:00 UTC.")]);
    expect(e.context.issues.some(i => /ORDER|REVERSED/.test(i.code))).toBe(true);
    expect(e.timeSummary()).not.toContain("Full recorded visit: 4 hours");
    expect(e.timeSummary()).not.toContain("14:00 UTC → 10:00 UTC");
  });
  it.each(["JSW JNPT Liquid Terminal", "Bharat Mumbai Container Terminals", "Nhava Sheva Gateway Terminal"])("B6 rejects all nested aliases inside %s", label => {
    const c = buildCallContext([user(`Use Jaigarh, not ${label}; explain berth hire rules.`)]);
    expect(c.scopes.find(s => c.activeScopeIds.includes(s.id))?.port).toMatchObject({ status: "identified", candidates: ["jaigarh"] });
  });
  it("B6 preserves positive nested terminal names", () => {
    const c = buildCallContext([user("Use JSW JNPT Liquid Terminal, not Jaigarh.")]);
    expect(c.scopes.find(s => c.activeScopeIds.includes(s.id))?.port).toMatchObject({ status: "identified", candidates: ["jsw-jnpt-liquid-terminal"] });
  });
  it("never classifies a form rate denominator as vessel GT", () => {
    const c = buildCallContext(form("gt", "Quoted rate per GT", "12"));
    expect(established(c, "gt")).toHaveLength(0);
  });
  it("does not revive a generic event key when its displayed meaning was negated", () => {
    const c = buildCallContext(form("arrival", "Not arrival at anchorage", "14 October 2026 09:00 UTC"));
    expect(established(c, "intervalStart")).toHaveLength(0); expect(established(c, "anchorageArrival")).toHaveLength(0);
  });
  it("does not add a blanket refusal for a new unit conflict with independent arithmetic", () => {
    const e = evidence([user("LOA 3 furlongs. Independently calculate 2 + 3.")]);
    expect(e.context.issues.some(i => i.code === "UNSUPPORTED_UNIT")).toBe(true);
    expect(e.forcedResponse).toBeUndefined(); expect(e.authorizeArithmetic()).toBe(true);
  });
  it("keeps valid berth occupancy visible alongside a contradictory visit event", () => {
    const e = evidence([user("Arrived anchorage 14 October 2026 14:00 UTC; all fast 14 October 2026 10:00 UTC; last line away 14 October 2026 12:00 UTC.")]);
    expect(e.forcedResponse).toContain("2 hours"); expect(e.forcedResponse).toMatch(/precedes|before/);
  });
  it("retracts an explicitly rejected current value without replacing unrelated fields", () => {
    const c = buildCallContext([user("GT 9000; stay 10 hours."), user("Do not use GT 9000.")]);
    expect(established(c, "gt")).toHaveLength(0); expect(established(c, "durationHours")[0]?.value).toBe("10");
    expect(c.issues.some(i => i.code === "FACT_RETRACTED")).toBe(true);
  });
});

// Preserve original projection and event/arithmetic requirements with mocked
// typed interpretation, rather than assertions on the retired prompt summary.
describe.each(["generate", "stream"] as const)("B repairs in the actual %s agent path", mode => {
  it.each([
    { id: "B1", messages: [user("Please confirm these particulars."), ...form("size", "Deadweight tonnage (DWT), not GT", "12345")], field: "dwt", value: "12345", absent: "gt" },
    { id: "B2", messages: [user("LOA 500 feet; draught 30 ft; GT 9000.")], field: "loa", value: "152.4" },
    { id: "B3", messages: corrected, field: "berthEnd", value: "14 October 2026 13:00 UTC" },
    { id: "B4", messages: nextLeg, field: "gt", value: "9000", absent: "berthStart" },
    { id: "B5", messages: [user(visit), ...form("arrival", "Arrival at anchorage", "14 October 2026 09:00 UTC")], field: "anchorageArrival", value: "14 October 2026 09:00 UTC" },
    { id: "B6", messages: [user("Use Jaigarh, not JSW JNPT Liquid Terminal; explain berth hire rules.")], port: "jaigarh" },
  ])("$id reaches bound execution with corrected scoped facts", async scenario => {
    const result = await runInterpreted(scenario.messages, mode);
    if (scenario.field) expect(result.currentFacts.find(f => f.field === scenario.field)?.value).toBe(scenario.value);
    if (scenario.absent) expect(result.currentFacts.some(f => f.field === scenario.absent)).toBe(false);
    if (scenario.port) expect(result.currentFacts.filter(f => f.field === "port").map(f => f.value)).toEqual([scenario.port]);
    expect(result.text).not.toContain("could not establish"); expect(result.calls).toBe(1);
  });
  it("executes elapsed time against a form-corrected canonical event", async () => {
    const result = await runInterpreted([user(visit), ...form("arrival", "Arrival at anchorage", "14 October 2026 09:00 UTC")], mode, { kind: "elapsed" });
    expect(result.text).toContain("3 hours"); expect(result.text).toContain("2 hours");
    expect(result.conversation.answer?.items[0].status).toBe("calculated");
  });
  it("completes independent arithmetic while a new unit conflict remains scoped", async () => {
    const result = await runInterpreted([user("LOA 3 furlongs. Independently calculate 2 + 3.")], mode, { kind: "arithmetic", expression: "2 + 3" });
    expect(result.text).toContain("**5**"); expect(result.currentFacts.some(f => f.field === "loa")).toBe(false);
    expect(result.conversation.state.facts.some(f => f.field === "loa" && f.status === "conflicting")).toBe(true);
  });
});
