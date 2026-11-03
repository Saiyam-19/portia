import { describe, expect, it } from "vitest";
import { calculateTariffExpression } from "../../src/lib/maritime/calculator";

describe("tariff calculator Python parity", () => {
  const fixtures: Array<[string, string]> = [
    ["round(15000 * 0.125 * ceil(25/24) * 1.18, 2)", "4425.00"],
    ["0.1 + 0.2", "0.3"],
    ["round(2.675, 2)", "2.68"],
    ["round(-2.675, 2)", "-2.68"],
    ["max(500, 100 * 0.5) + min(12, 20)", "512"],
    ["-2**2", "-4"],
    ["(-2)**2", "4"],
    ["2**3**2", "512"],
    ["2**-2", "0.25"],
    ["1/3", "0.3333333333333333333333333333333333333333"],
    ["1/7", "0.1428571428571428571428571428571428571429"],
    ["1.00+2.00", "3.00"],
    ["1.20*3.0", "3.600"],
    ["ceil(-1.2)", "-1"],
    ["floor(-1.2)", "-2"],
    ["0e100", "0"],
    ["0e-100", `0.${"0".repeat(99)}0`],
    ["1.00/2", "0.50"],
    ["0.00/2", "0.00"],
    ["(1/7)*7", `1.${"0".repeat(39)}`],
    ["round(-0.001,2)", "-0.00"],
    ["ceil(1,)", "1"],
    ["0.12345678901234567890**6", "0.000003540705970274021332663243141429351262304"],
    ["(1+1e-100)*1e-10", "0.0000000001000000000000000000000000000000000000000"],
    ["round((-0.1234567890123456789012345678901234567890123456789+0.1234567890123456789012345678901234567890)*1e18*1e18*1e8,2)", "0.00"],
  ];

  for (const [expression, output] of fixtures) {
    it(`${expression} = ${output}`, () => {
      expect(calculateTariffExpression(expression)).toBe(output);
    });
  }

  it("rejects code, invalid arithmetic, excessive scale, range and complexity", () => {
    for (const expression of [
      "__import__('os').environ", "open('/etc/passwd')", "(1).__class__",
      "[1]*100000000", "2**100000", "1e999", "True", "x + 1", "1/0",
      "round(1, 100000)", "1e-101", "0e-101", `${"1+".repeat(1000)}1`,
      "999999999999999999 + 2",
      "0**0",
      "01",
      Array.from({ length: 60 }, () => "1").join("+"),
    ]) {
      expect(() => calculateTariffExpression(expression), expression).toThrow();
    }
  });
});

// Python Decimal permits all-zero integer spellings and normalizes unary-minus zero.
it("preserves zero literal and unary-minus parity", () => {
  expect(calculateTariffExpression("00")).toBe("0");
  expect(calculateTariffExpression("0_0")).toBe("0");
  expect(calculateTariffExpression("-0.0")).toBe("0.0");
  expect(calculateTariffExpression("round(-0.001, 2)")).toBe("-0.00");
});
