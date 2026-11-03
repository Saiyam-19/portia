import { describe, expect, it } from "vitest";
import { calculateChargeBatch } from "../../src/lib/maritime/calculator-batch";

describe("batched tariff arithmetic", () => {
  it("computes line charges and their dependent total with the existing decimal engine", () => {
    expect(calculateChargeBatch([
      { id: "port_dues", expression: "20000 * 10.5366" },
      { id: "pilotage", expression: "20000 * 17.2897" },
      { id: "berth", expression: "20000 * 54 * 0.2165" },
      { id: "anchorage", expression: "20000 * 24 * 0.0867" },
      { id: "total", expression: "ceil($port_dues + $pilotage + $berth + $anchorage)" },
    ])).toEqual([
      { id: "port_dues", expression: "20000 * 10.5366", result: "210732.0000" },
      { id: "pilotage", expression: "20000 * 17.2897", result: "345794.0000" },
      { id: "berth", expression: "20000 * 54 * 0.2165", result: "233820.0000" },
      { id: "anchorage", expression: "20000 * 24 * 0.0867", result: "41616.0000" },
      { id: "total", expression: "ceil($port_dues + $pilotage + $berth + $anchorage)", result: "831962" },
    ]);
  });

  it("preserves decimal precision, reference precedence, rounding, caps and GST arithmetic", () => {
    const rows = calculateChargeBatch([
      { id: "net", expression: "0.1 + 0.2" },
      { id: "negative", expression: "-2" },
      { id: "squared", expression: "$negative ** 2" },
      { id: "berth", expression: "min(20000 * 0.1 * 90, 1000000)" },
      { id: "gst", expression: "round($berth * 0.18, 2)" },
      { id: "total", expression: "$berth + $gst" },
    ]);
    expect(rows.map(row => row.result)).toEqual(["0.3", "-2", "4", "180000.0", "32400.00", "212400.00"]);
  });

  it("fails closed for bad references or arithmetic rather than returning a partial total", () => {
    for (const calculations of [
      [{ id: "x", expression: "$missing + 1" }],
      [{ id: "x", expression: "$x + 1" }],
      [{ id: "x", expression: "$y" }, { id: "y", expression: "1" }],
      [{ id: "x", expression: "1" }, { id: "x", expression: "2" }],
      [{ id: "x", expression: "1 / 0" }, { id: "total", expression: "$x + 1" }],
      [{ id: "x", expression: "__import__('os')" }],
      [{ id: "__proto__", expression: "1" }],
      Array.from({ length: 25 }, (_, index) => ({ id: `x${index}`, expression: "1" })),
    ]) expect(() => calculateChargeBatch(calculations)).toThrow();
  });
});
