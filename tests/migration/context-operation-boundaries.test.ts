import { runInterpreted } from "./conversation-harness";
import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";
import { RequestEvidence } from "../../src/lib/migration/request-evidence";
import { currentFacts } from "../../src/lib/migration/call-context";
import { normalizeQuantity, operationAt } from "../../src/lib/migration/request-semantics";
import { formInputSchema } from "../../src/lib/migration/contracts";

const user = (content: string): ModelMessage => ({ role: "user", content });
const read = (...messages: ModelMessage[]) => { const e = new RequestEvidence(); e.initialize(messages); return e; };
const gt = (e: RequestEvidence) => currentFacts(e.context).filter(f => f.field === "gt" && f.status === "established").map(f => f.value);
function form(value: string): ModelMessage[] {
  const input = formInputSchema.parse({ title: "Confirm GT", fields: [{ name: "gt", label: "Gross tonnage", type: "text", required: true }] });
  return [{ role: "assistant", content: [{ type: "tool-call", toolCallId: "gt-form", toolName: "ask_user_input", input }] },
    { role: "tool", content: [{ type: "tool-result", toolCallId: "gt-form", toolName: "ask_user_input", output: { type: "json", value: { cancelled: false, values: { gt: value } } } }] }];
}
const verbs = [
  { verb: "use", positive: "replace", negative: "reject" },
  { verb: "assert", positive: "assert", negative: "reject" },
  { verb: "keep", positive: "preserve", negative: "reject" },
  { verb: "retain", positive: "preserve", negative: "reject" },
  { verb: "change", positive: "replace", negative: "preserve" },
  { verb: "replace", positive: "replace", negative: "preserve" },
  { verb: "reject", positive: "reject", negative: "preserve" },
  { verb: "ignore", positive: "reject", negative: "preserve" },
] as const;
const polarity = ["", "Do not ", "Don't ", "Don’t ", "Never ", "No longer "];

describe("R3 operation composition matrix", () => {
  it.each(verbs.flatMap(v => polarity.map(prefix => ({ ...v, prefix, expected: prefix ? v.negative : v.positive }))))("$prefix$verb: prefix, postfix and form values", ({ prefix, verb, expected }) => {
    for (const message of [`${prefix}${verb} GT 9000.`, `${prefix}${verb} 9000 GT.`]) {
      expect(operationAt(message, message.indexOf("9000"))).toBe(expected);
      const e = read(user("GT 9000; stay 10 hours."), user(message));
      expect(gt(e)).toEqual(expected === "reject" ? [] : ["9000"]);
      expect(currentFacts(e.context).some(f => f.field === "durationHours" && f.value === "10" && f.status === "established")).toBe(true);
    }
    const e = read(user("GT 9000; stay 10 hours."), ...form(`${prefix}${verb} 9000`));
    expect(gt(e)).toEqual(expected === "reject" ? [] : ["9000"]);
  });
  it("does not negate a complete update by matching only its inner verb", () => {
    const e = read(user("GT 9000"), user("Do not change GT 9500."));
    expect(gt(e)).toEqual(["9000"]); expect(e.context.issues).toEqual([]);
  });
  it("preserves existing facts while adding an unrelated labelled field", () => {
    const e = read(user("GT 9000"), user("Keep GT 9000 and add NT 5000."));
    expect(gt(e)).toEqual(["9000"]); expect(currentFacts(e.context).find(f => f.field === "nt" && f.status === "established")?.value).toBe("5000");
    expect(e.context.issues).toEqual([]);
  });
});

describe("R3 complete expression boundary matrix", () => {
  it.each(["/", "*", "+", "-", "−", "×", "÷", "^", "**"])("keeps %s expressions unresolved in prefix/postfix/form positions", operator => {
    for (const expression of [`12${operator}34`, `12 ${operator}34`, `12${operator} 34`, `12 ${operator} 34`, `(12${operator}34)`]) {
      for (const e of [read(user(`GT ${expression}.`)), read(user(`${expression} GT.`)), read(...form(expression))]) {
        expect(gt(e), expression).toEqual([]);
        expect(e.context.issues.some(i => i.code === "INVALID_NUMERIC_TOKEN"), expression).toBe(true);
      }
    }
  });
  it.each(["GT 12/", "GT 12*", "GT (12/34)", "12/34GT", "12*34GT", "GT /34", "/34GT", "*34GT", "GT ×34", "GT **34"])("does not establish an operand fragment from %s", input => {
    const e = read(user(input)); expect(gt(e)).toEqual([]); expect(e.context.issues.some(i => i.code === "INVALID_NUMERIC_TOKEN")).toBe(true);
  });
  it.each(["GT 9000 / NT 5000", "GT9000/NT5000", "GT9000 / NT5000 / LOA150m"])("retains slash-separated field declarations: %s", input => {
    const e = read(user(input)); expect(gt(e)).toEqual(["9000"]);
    expect(currentFacts(e.context).find(f => f.field === "nt" && f.status === "established")?.value).toBe("5000"); expect(e.context.issues).toEqual([]);
  });
  it("does not confuse a supplied-rate denominator with another vessel quantity", () => {
    const e = read(user("GT 9000; rate INR 0.25 per GT per hour.")); expect(gt(e)).toEqual(["9000"]); expect(e.context.issues).toEqual([]);
  });
  it("requires a separate arithmetic request before treating a bad quantity as an arithmetic task", () => {
    const e = read(user("GT 12/34."));
    expect(e.context.tasks.some(t => t.kind === "arithmetic" && t.status === "ready")).toBe(false); expect(e.forcedResponse).toBeDefined();
  });
});

describe("R3 accepted sign positions", () => {
  const signCases = ["", "+", "-", "−"].flatMap(sign => ["", "+", "-", "−"].flatMap(exponent => ["e", "E"].map(letter => ({ sign, exponent, letter }))));
  it.each(signCases)("normalizes $sign 2 $letter $exponent 3 without throwing", ({ sign, exponent, letter }) => {
    const raw = `${sign}2${letter}${exponent}3`;
    const magnitude = exponent === "-" || exponent === "−" ? "0.002" : "2000";
    const negative = sign === "-" || sign === "−"; const expected = (negative ? "-" : "") + magnitude;
    expect(normalizeQuantity({ field: "gt", rawNumber: raw, start: 0, end: raw.length })).toMatchObject({ value: expected, unit: "GT" });
    for (const e of [read(user(`GT ${raw}.`)), read(user(`${raw} GT.`)), read(...form(raw))]) {
      expect(gt(e)).toEqual(negative ? [] : [magnitude]);
      if (negative) expect(e.context.issues.some(i => i.code === "INVALID_QUANTITY")).toBe(true);
    }
  });
  it.each(["2e", "−2e−", "12/34", "not-a-number", "2e99999999999999999"])("normalization returns a scoped error for %s", raw => {
    expect(normalizeQuantity({ field: "gt", rawNumber: raw, start: 0, end: raw.length })).toHaveProperty("error");
  });
});

describe.each(["generate", "stream"] as const)("R3 actual %s clarification and recovery", mode => {
  it("clarifies a retracted quantity after one interpretation and no extra inference", async () => {
    const result = await runInterpreted([user("GT 9000; stay 10 hours."), user("No longer use GT 9000.")], mode);
    expect(result.text).toMatch(/rejected|replacement/); expect(result.calls).toBe(1);
    expect(result.currentFacts.some(f => f.field === "gt")).toBe(false);
  });
  it("handles Unicode negative scientific GT without a route/model exception", async () => {
    const result = await runInterpreted([user("GT −2e−3.")], mode);
    expect(result.text).toMatch(/GT must be positive/); expect(result.calls).toBe(1);
  });
  it("recovers after withdrawal and after a malformed scalar expression", async () => {
    for (const messages of [[user("GT 9000"), user("Do not keep GT 9000.")], [user("GT 12/34.")]]) {
      const result = await runInterpreted([...messages, user("Correction: GT 9500.")], mode);
      expect(result.currentFacts.find(f => f.field === "gt")?.value).toBe("9500"); expect(result.text).toContain("9500");
      expect(result.conversation.answer?.items.flatMap(i => i.pending)).toEqual([]);
    }
  });
  it("evaluates a separately requested calculation without promoting the quantity expression", async () => {
    const result = await runInterpreted([user("GT 12/34. Independently calculate 6/2.")], mode, { kind: "arithmetic", expression: "6/2" });
    expect(result.text).toContain("**3**"); expect(result.text).toContain("GT remains unresolved");
    expect(result.currentFacts.some(f => f.field === "gt")).toBe(false); expect(result.calls).toBe(1);
  });
});
