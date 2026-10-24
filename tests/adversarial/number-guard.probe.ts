import { expect, it } from "vitest";
import { unsupportedNumbers } from "../../src/lib/berthwise/number-guard";

const tool = { lines: [{ amount: "21339.12" }, { amount: "20205.21" }], total: "41544.33", gt: "32450" };

it.each([
  ["currency glued to the figure", "USD999999 in total"],
  ["figure glued to the currency", "999999USD in total"],
  ["rupee symbol and Indian grouping", "about ₹9,99,999"],
  ["inside a markdown table", "| Total | 999,999 |"],
  ["in parentheses", "(999999)"],
  ["as a percentage", "plus 18% GST"],
  ["Indian rupee suffix", "Rs. 4,04,722/-"],
  ["invented extra precision", "USD 21,339.125"],
  ["a near miss that is not rounding", "USD 21,340"],
  ["a negative figure", "a saving of -999 USD"],
])("blocks an invented figure %s", (_label, text) => {
  expect(unsupportedNumbers(text, [tool])).not.toEqual([]);
});

it("does not block correct figures in the same hostile formats", () => {
  expect(unsupportedNumbers("USD21,339.12 + USD 20,205.21 = USD41,544.33 for 32,450 GRT", [tool])).toEqual([]);
});
