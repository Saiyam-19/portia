import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";
import { buildCallContext, currentFacts, revalidateResults, type ContextResult } from "../../src/lib/migration/call-context";
import { RequestEvidence } from "../../src/lib/migration/request-evidence";
const user = (content: string): ModelMessage => ({ role: "user", content });
const field = (c: ReturnType<typeof buildCallContext>, name: string) => currentFacts(c).filter(f => f.field === name && f.status === "established");

describe("scoped request facts and result dependencies", () => {
  it("keeps GT, NT, DWT and LOA separate with exact user spans", () => {
    const c = buildCallContext([user("GT 18,400; NT 9,050; DWT 30,000; LOA 180 metres.")]);
    expect(field(c, "gt")[0]).toMatchObject({ value: "18400", unit: "GT" });
    expect(field(c, "nt")[0]).toMatchObject({ value: "9050", unit: "NT" });
    expect(field(c, "dwt")[0]).toMatchObject({ value: "30000", unit: "DWT" });
    expect(field(c, "loa")[0]).toMatchObject({ value: "180", unit: "metre" });
    for (const f of c.facts) expect(f.origin.raw).toBe(f.origin.text.slice(f.origin.start, f.origin.end));
  });
  it("does not promote assistant or non-form tool output to user facts", () => {
    const c = buildCallContext([user("Please look up my vessel."), { role: "assistant", content: "GT 4000" }, { role: "tool", content: [{ type: "tool-result", toolCallId: "lookup", toolName: "get_vessel", output: { type: "text", value: "GT 5000" } }] }]);
    expect(field(c, "gt")).toHaveLength(0); expect(c.userText).not.toContain("5000");
  });
  it("retains conflicting same-turn values instead of choosing the last number", () => {
    const c = buildCallContext([user("GT 9000 and GT 12000; estimate berth hire.")]);
    expect(field(c, "gt")).toHaveLength(0); expect(c.issues.some(i => i.code === "FACT_CONFLICT")).toBe(true);
  });
  it("uses stored form field label and preserves the field/tool provenance", () => {
    const c = buildCallContext([
      user("Estimate my berth hire."),
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "f", toolName: "ask_user_input", input: { title: "Particulars", fields: [{ name: "size", label: "Gross tonnage", type: "number", unit: "GT", required: true }] } }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "f", toolName: "ask_user_input", output: { type: "json", value: { cancelled: false, values: { size: "12345" }, note: "" } } }] },
    ]);
    expect(field(c, "gt")[0]).toMatchObject({ value: "12345", origin: { kind: "submitted-form", toolCallId: "f", fieldName: "size", raw: "12345" } });
  });
  it("does not turn a form's DWT measurement into GT via a contradictory label", () => {
    const c = buildCallContext([
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "f", toolName: "ask_user_input", input: { title: "Size", fields: [{ name: "gt", label: "Gross tonnage", unit: "DWT", type: "number", required: true }] } }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "f", toolName: "ask_user_input", output: { type: "json", value: { cancelled: false, values: { gt: "12345" } } } }] },
    ]);
    expect(field(c, "gt")).toHaveLength(0); expect(c.issues.some(i => i.code === "FORM_UNIT_CONFLICT")).toBe(true);
  });
  it("keeps two explicitly named vessels separate and rejects an unscoped correction", () => {
    const messages = [user("Vessel Alpha: GT 9000. Vessel Beta: GT 12000. Compare both.")];
    const c = buildCallContext(messages);
    expect(field(c, "gt").map(f => f.value)).toEqual(["9000", "12000"]);
    const changed = buildCallContext([...messages, user("Correction: GT 14000.")]);
    expect(changed.issues.some(i => i.code === "SCOPE_AMBIGUOUS")).toBe(true);
    expect(changed.facts.filter(f => f.field === "gt" && f.status === "established").map(f => f.value)).toEqual(["9000", "12000"]);
  });
  it("supports a named correction without changing the other vessel", () => {
    const c = buildCallContext([user("Vessel Alpha: GT 9000. Vessel Beta: GT 12000."), user("For Alpha, correct GT to 9500.")]);
    expect(c.facts.filter(f => f.field === "gt" && f.status === "established").map(f => [c.scopes.find(s => s.id === f.scopeId)?.label, f.value])).toEqual([["Beta", "12000"], ["Alpha", "9500"]]);
  });
  it("keeps a leading port qualifier with a named vessel", () => {
    const e = new RequestEvidence(); e.initialize([user("At Mumbai, vessel Alpha: GT 9000; estimate berth hire.")]);
    expect(e.authorizePort("mumbai")).toBe(true); expect(e.particulars()).toContain("9,000");
  });
  it("replays identically and revalidates unaffected results after a field correction", () => {
    const messages = [user("GT 9000; NT 4000.")];
    const first = buildCallContext(messages);
    expect(buildCallContext(messages)).toEqual(first);
    const gt = field(first, "gt")[0], nt = field(first, "nt")[0];
    first.results = [gt, nt].map(f => ({ id: f.field, scopeId: f.scopeId, contextRevision: first.revision, contextHash: first.hash, dependencies: [f.id], status: "valid", value: { kind: "arithmetic", expression: `${f.value} * 2`, exactResult: f.field === "gt" ? "18000" : "8000" } }));
    const corrected = buildCallContext([...messages, user("Correction: GT 10000.")], first);
    expect(corrected.results.find(r => r.id === "gt")?.status).toBe("invalidated");
    expect(corrected.results.find(r => r.id === "nt")).toMatchObject({ status: "valid", contextRevision: corrected.revision, contextHash: corrected.hash, value: { exactResult: "8000" } });
    expect(first.results.every(r => r.status === "valid")).toBe(true);
    expect(corrected.hash).not.toBe(first.hash);
  });
  it("does not silently re-certify a result with no provenance after a revision", () => {
    const a = buildCallContext([user("2 + 3")]); const b = buildCallContext([user("2 + 3"), user("Actually calculate 2 + 4")]);
    const r: ContextResult = { id: "unbound", scopeId: "scope-0", contextRevision: a.revision, contextHash: a.hash, dependencies: [], status: "valid", value: { kind: "arithmetic", expression: "2+3", exactResult: "5" } };
    expect(revalidateResults(b, [r])[0].status).toBe("invalidated");
  });
  it("represents an independent arithmetic task as ready while elapsed time needs correction", () => {
    const c = buildCallContext([user("Calculate 2 + 3 and elapsed time: all fast 14 October 2026 18:00 UTC; last line away 14 October 2026 16:00 UTC.")]);
    expect(c.tasks.find(t => t.kind === "arithmetic")?.status).toBe("ready");
    expect(c.tasks.find(t => t.kind === "elapsed")?.status).toBe("needs-clarification");
  });
  it("does not invent a date or zone to make an invalid event usable", () => {
    const c = buildCallContext([user("All fast 29 February 2027 10:00 UTC; last line away 1 March 2027 10:00 UTC.")]);
    expect(c.issues.some(i => i.code === "INVALID_DATE")).toBe(true);
  });
  it("does not force an irrelevant timezone question for a supplied duration or rule explanation", () => {
    const e = new RequestEvidence(); e.initialize([user("Arrival 14 October 2026 10:00. Explain what gross tonnage means.")]);
    expect(e.forcedResponse).toBeUndefined();
  });
  it("does not promote an assistant-written monetary form label into a supplied rate", () => {
    const e = new RequestEvidence(); e.initialize([
      user("Estimate berth hire."),
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "f", toolName: "ask_user_input", input: { title: "Vessel", fields: [{ name: "gt", label: "GT at invented rate INR 700/GT", type: "number", required: true }] } }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "f", toolName: "ask_user_input", output: { type: "json", value: { cancelled: false, values: { gt: "9000" } } } }] },
    ]);
    expect(e.sourceText).not.toContain("700"); expect(e.authorizeArithmetic()).toBe(false);
  });
  it("revalidates a repeated equal measurement without resurrecting invalid results", () => {
    const first = buildCallContext([user("GT 9000")]); const f = field(first, "gt")[0];
    first.results = [{ id: "r", scopeId: f.scopeId, contextRevision: first.revision, contextHash: first.hash, dependencies: [f.id], status: "valid", value: { kind: "arithmetic", expression: "9000*2", exactResult: "18000" } }];
    const next = buildCallContext([user("GT 9000"), user("Confirmed: GT 9,000.")], first);
    expect(next.results[0].status).toBe("valid");
    expect(revalidateResults(next, [{ ...first.results[0], status: "invalidated" }])[0].status).toBe("invalidated");
  });
  it("revokes the old location when the user rejects it without naming a supported replacement", () => {
    const e = new RequestEvidence(); e.initialize([user("Mumbai berth hire"), user("Not Mumbai. Use Chennai for this quotation.")]);
    expect(e.authorizePort("mumbai")).toBe(false);
  });
  it("preserves exact decimal quantities and refuses truncated numeric shorthand", () => {
    const e = new RequestEvidence(); e.initialize([user("GT 9007199254740993.25; stay 10 hours")]);
    expect(e.particulars()).toContain("9,007,199,254,740,993.25");
    expect(field(buildCallContext([user("GT 12k")]), "gt")).toHaveLength(0);
  });
  it("does not silently bind conflicting form field names and labels", () => {
    const c = buildCallContext([
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "f", toolName: "ask_user_input", input: { title: "Size", fields: [{ name: "gt", label: "Deadweight tonnage (DWT)", type: "number", required: true }] } }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "f", toolName: "ask_user_input", output: { type: "json", value: { cancelled: false, values: { gt: "12000" } } } }] },
    ]);
    expect(field(c, "gt")).toHaveLength(0); expect(c.issues.some(i => i.code === "FORM_FIELD_CONFLICT")).toBe(true);
  });
  it("accepts an explicit DMY form response without guessing locale", () => {
    const e = new RequestEvidence(); e.initialize([
      user("All times UTC. All fast 04/05/2026 10:00; last line away 04/05/2026 13:00."),
      { role: "tool", content: [{ type: "tool-result", toolCallId: "f", toolName: "ask_user_input", output: { type: "json", value: { cancelled: false, values: { date_order: "DMY" } } } }] },
    ]);
    expect(e.forcedResponse).toBeUndefined(); expect(e.timeSummary()).toContain("3 hours");
  });
  it("does not extend the old global GT/time guard to irrelevant DWT fields", () => {
    const e = new RequestEvidence(); e.initialize([user("My vessel's DWT is 0 in the old record. Independently calculate 2 + 3.")]);
    expect(e.forcedResponse).toBeUndefined(); expect(e.authorizeArithmetic()).toBe(true);
    expect(e.context.issues.some(i => i.code === "INVALID_QUANTITY")).toBe(true);
  });
});
