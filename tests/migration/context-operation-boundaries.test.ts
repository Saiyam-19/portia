import { describe, expect, it } from "vitest";
import { normalizeQuantity, operationAt } from "../../src/lib/migration/request-semantics";
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

it.each(verbs.flatMap(v => polarity.map(prefix => ({ ...v, prefix, expected: prefix ? v.negative : v.positive }))))("$prefix$verb: prefix and postfix", ({ prefix, verb, expected }) => {
  for (const message of [`${prefix}${verb} GT 9000.`, `${prefix}${verb} 9000 GT.`]) expect(operationAt(message, message.indexOf("9000"))).toBe(expected);
});
describe("historical quantity normalization", () => {
  const signCases = ["", "+", "-", "−"].flatMap(sign => ["", "+", "-", "−"].flatMap(exponent => ["e", "E"].map(letter => ({ sign, exponent, letter }))));
  it.each(signCases)("normalizes $sign 2 $letter $exponent 3 without throwing", ({ sign, exponent, letter }) => {
    const raw = `${sign}2${letter}${exponent}3`;
    const magnitude = exponent === "-" || exponent === "−" ? "0.002" : "2000";
    const negative = sign === "-" || sign === "−"; const expected = (negative ? "-" : "") + magnitude;
    expect(normalizeQuantity({ field: "gt", rawNumber: raw, start: 0, end: raw.length })).toMatchObject({ value: expected, unit: "GT" });

  });
  it.each(["2e", "−2e−", "12/34", "not-a-number", "2e99999999999999999"])("normalization returns a scoped error for %s", raw => {
    expect(normalizeQuantity({ field: "gt", rawNumber: raw, start: 0, end: raw.length })).toHaveProperty("error");
  });
});
