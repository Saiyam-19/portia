import { expect, it } from "vitest";
import type { ModelMessage } from "ai";
import { calculateExactExpression } from "../../src/lib/portia/exact-expression";
import { QuoteSession } from "../../src/lib/portia/session";
import { calculateSupplied, type Quote } from "../../src/lib/portia/quotes";

it("preserves fractional billing through aggregation, tax, serialization and comparison", async () => {
  const session = new QuoteSession("exact-billing"); await session.initialize([]);
  const first = await session.update({ pricing: "supplied", lines: ["one", "two", "three"].map(name => ({ name, currency: "USD", rate: "1", unit: "quantity" as const, quantity: "1", quantityLabel: "job", perQuantity: "3" })), terms: { taxPercent: "0" } });
  expect("totals" in first && first.totals?.[0].amount).toBe("1");
  expect(first.body).toContain("USD 1/3 (exact)");
  const messages: ModelMessage[] = [{ role: "tool", content: [{ type: "tool-result", toolName: "manage_quote", toolCallId: "first", output: { type: "json", value: JSON.parse(JSON.stringify(first)) } }] }];
  const fresh = new QuoteSession("exact-billing"); await fresh.initialize(messages);
  const quote = [...fresh.quotes.values()][0];
  expect((await fresh.calculate(quote)).totals?.[0].amount).toBe("1");
  expect(calculateExactExpression("1/3+1/3+1/3")).toBe("1");
  expect(calculateExactExpression("round(-1/6,2)")).toBe("-0.17");
});

it("retains an independent line when another formula exceeds supported arithmetic bounds", () => {
  const quote: Quote = { id: "bounds", revision: 0, name: "Bounds", pricing: "supplied", call: {}, services: [], terms: {}, lines: [
    { name: "independent", currency: "USD", amount: "12" },
    { name: "excessive", currency: "USD", rate: "1000000000000000000", unit: "quantity", quantity: "2", quantityLabel: "jobs" },
  ] };
  const result = calculateSupplied(quote);
  expect(result.status).toBe("unresolved");
  expect(result.totals?.[0].amount).toBe("12");
  expect(result.questions).toEqual([expect.stringMatching(/excessive:.*bounds/)]);
});
