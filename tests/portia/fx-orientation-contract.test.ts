import { expect, it } from "vitest";
import type { ModelMessage } from "ai";
import { AuthoritySession } from "../../src/lib/authority/session";
import { authorityDigest, comparisonCore, parsePacket, quoteCore, type AuthorityOperation } from "../../src/lib/authority/contract";
import { executeAuthorizedOperations } from "../../src/lib/authority/execute";
import { comparisonSchema, QuoteSession } from "../../src/lib/portia/session";

const receipt = (result: unknown, id: string): ModelMessage => ({ role: "tool", content: [{ type: "tool-result", toolName: "manage_quote", toolCallId: id, output: { type: "json", value: JSON.parse(JSON.stringify(result)) } }] });

async function suppliedPair(id: string, leftCurrency: string, leftAmounts: string[], rightCurrency: string, rightAmounts: string[]) {
  const session = new QuoteSession(id); await session.initialize([]);
  const lines = (currency: string, amounts: string[]) => amounts.map((amount, index) => ({ name: `fee ${index + 1}`, currency, amount }));
  const left = await session.update({ pricing: "supplied", lines: lines(leftCurrency, leftAmounts) });
  const right = await session.update({ pricing: "supplied", lines: lines(rightCurrency, rightAmounts) });
  if (!("quoteId" in left) || !("quoteId" in right)) throw new Error("Missing quote pair");
  return { session, left, right, quoteIds: [left.quoteId, right.quoteId] };
}

it("uses a supplied FX relationship in either original orientation without deriving a reciprocal", async () => {
  const direct = await suppliedPair("fx-direct", "USD", ["100"], "EUR", ["40"]);
  const directResult = await direct.session.compare({ quoteIds: direct.quoteIds, currency: "USD", exchangeRates: [{ from: "EUR", to: "USD", rate: "2" }] });
  expect("converted" in directResult ? directResult.converted.map((row) => row.amount) : undefined).toEqual(["100", "80"]);

  const reverse = await suppliedPair("fx-reverse", "USD", ["100"], "EUR", ["40"]);
  const reverseResult = await reverse.session.compare({ quoteIds: reverse.quoteIds, currency: "USD", exchangeRates: [{ from: "USD", to: "EUR", rate: "0.5" }] });
  expect("converted" in reverseResult ? reverseResult.converted.map((row) => row.amount) : undefined).toEqual(["100", "80"]);
  expect(reverseResult.body).toContain("Supplied FX: USD 1 = EUR 0.5");
});

it("keeps nonterminating reverse conversion and ranking exact without fake monetary rounding", async () => {
  const { session, quoteIds } = await suppliedPair("fx-repeating", "USD", ["40"], "EUR", ["100"]);
  const result = await session.compare({ quoteIds, currency: "USD", exchangeRates: [{ from: "USD", to: "EUR", rate: "3" }] });
  expect(result.status).toBe("calculated");
  if (!("converted" in result)) throw new Error("Missing comparison rows");
  expect(result.converted[1]).toMatchObject({ exactAmount: { numerator: "100", denominator: "3" } });
  expect(result.converted[1]).not.toHaveProperty("amount");
  expect(result).toMatchObject({ exactDifference: { numerator: "20", denominator: "3" } });
  expect(result.difference).toBeUndefined();
  expect(result.body).toContain("USD 100/3 (exact; non-terminating decimal)");
  expect(result.body).toContain("USD 20/3 (exact; non-terminating decimal)");
  expect(result.body).not.toMatch(/USD 33\.3/);
});

it("preserves line-before-sum versus total-after-sum rounding for reverse FX", async () => {
  const lineCase = await suppliedPair("fx-line-rounding", "USD", ["35", "35"], "EUR", ["100", "100"]);
  const line = await lineCase.session.compare({ quoteIds: lineCase.quoteIds, currency: "USD", exchangeRates: [{ from: "USD", to: "EUR", rate: "3" }], rounding: { stage: "line", decimals: 2 } });
  expect("converted" in line ? line.converted[1]?.amount : undefined).toBe("66.66");

  const totalCase = await suppliedPair("fx-total-rounding", "USD", ["35", "35"], "EUR", ["100", "100"]);
  const total = await totalCase.session.compare({ quoteIds: totalCase.quoteIds, currency: "USD", exchangeRates: [{ from: "USD", to: "EUR", rate: "3" }], rounding: { stage: "total", decimals: 2 } });
  expect("converted" in total ? total.converted[1]?.amount : undefined).toBe("66.67");
});

it.each([
  ["same direction duplicate", [{ from: "JPY", to: "CAD", rate: "0.01" }, { from: "JPY", to: "CAD", rate: "0.02" }]],
  ["opposite direction duplicate", [{ from: "JPY", to: "CAD", rate: "0.01" }, { from: "CAD", to: "JPY", rate: "100" }]],
  ["self relationship", [{ from: "JPY", to: "JPY", rate: "1" }, { from: "JPY", to: "CAD", rate: "0.01" }]],
] as const)("rejects %s FX relationships", async (_case, exchangeRates) => {
  const { session, quoteIds } = await suppliedPair(`fx-invalid-${_case}`, "CAD", ["90"], "JPY", ["10000"]);
  const result = await session.compare({ quoteIds, currency: "CAD", exchangeRates: [...exchangeRates] });
  expect(result.status).toBe("error");
  expect(result.body).toMatch(/relationship|pair|duplicate|same currency/i);
});

it("rejects unused relationships and does not infer a triangulated cross-rate", async () => {
  const unused = await suppliedPair("fx-unused", "CAD", ["90"], "JPY", ["10000"]);
  const unusedResult = await unused.session.compare({ quoteIds: unused.quoteIds, currency: "CAD", exchangeRates: [{ from: "JPY", to: "CAD", rate: "0.01" }, { from: "CHF", to: "USD", rate: "1.2" }] });
  expect(unusedResult.status).toBe("error"); expect(unusedResult.body).toMatch(/unused|not used/i);

  const cross = await suppliedPair("fx-cross", "CAD", ["90"], "JPY", ["10000"]);
  const crossResult = await cross.session.compare({ quoteIds: cross.quoteIds, currency: "CAD", exchangeRates: [{ from: "JPY", to: "USD", rate: "0.007" }, { from: "USD", to: "CAD", rate: "1.4" }] });
  expect(crossResult.status).toBe("error"); expect(crossResult.body).toMatch(/direct.*JPY.*CAD|JPY.*CAD.*direct/i);
});

it("requires a date for a reverse-oriented supplied FX relationship on official quotes", async () => {
  const session = new QuoteSession("official-reverse-fx"); await session.initialize([]);
  const ids: string[] = [];
  for (const gt of ["8100", "9200"]) {
    const result = await session.update({ pricing: "official", services: ["berth"], call: { port: "BMCT", callDate: "2026-10-18", service: "foreign", gt, occupancy: { hours: "1" } } });
    if ("quoteId" in result) ids.push(result.quoteId);
  }
  const missing = await session.compare({ quoteIds: ids, currency: "USD", exchangeRates: [{ from: "USD", to: "INR", rate: "80" }] });
  expect(missing.status).toBe("unresolved"); expect(missing.body).toMatch(/date/i);
  expect(missing.questions).toEqual([expect.stringMatching(/date/i)]);
  expect(missing).toHaveProperty("clarificationId");
  const dated = await session.compare({ quoteIds: ids, currency: "USD", exchangeRates: [{ from: "USD", to: "INR", rate: "80", date: "2026-10-18" }] });
  expect(dated.status).toBe("calculated");
});

it("binds the original reverse FX orientation through exact approval and fresh-session replay", async () => {
  const prepared = await suppliedPair("fx-authorized", "USD", ["40"], "EUR", ["100"]);
  const context = { quotes: [...prepared.session.quotes.values()].map((quote) => AuthoritySession.binding(quoteCore(quote))), comparisons: [] };
  const authority = new AuthoritySession(context); prepared.session.bindAuthority(authority);
  const staged = await prepared.session.compare({ quoteIds: prepared.quoteIds, currency: "USD", exchangeRates: [{ from: "USD", to: "EUR", rate: "3", date: "2026-12-09" }] });
  expect(staged).toHaveProperty("approvalRequired", true);
  const pending = authority.pending()!, operation = parsePacket(pending.payload).operations[0];
  if (operation.kind !== "comparison") throw new Error("Expected comparison operation");
  expect(operation.input.exchangeRates).toEqual([{ from: "USD", to: "EUR", rate: "3", date: "2026-12-09" }]);
  expect(pending.form.description).toMatch(/from: USD/); expect(pending.form.description).toMatch(/to: EUR/);

  const fresh = new QuoteSession("fx-authorized"); fresh.bindAuthority(new AuthoritySession(context));
  await fresh.initialize([receipt(prepared.left, "left"), receipt(prepared.right, "right")]);
  const executed = await executeAuthorizedOperations({ authorization: { payload: pending.payload, expiresAt: Date.now() + 60_000 }, session: fresh, signal: new AbortController().signal });
  expect(executed.text).toContain("USD 100/3 (exact; non-terminating decimal)");
  expect(executed.messages.some((message) => message.role === "tool" && JSON.stringify(message).includes('"from":"USD"') && JSON.stringify(message).includes('"to":"EUR"'))).toBe(true);
});

it("preserves the historical direct-oriented comparison digest", async () => {
  const operation = {
    id: "00000000-0000-4000-8000-000000000099", kind: "comparison" as const,
    input: { quoteIds: ["left", "right"], currency: "USD", exchangeRates: [{ from: "EUR", to: "USD", rate: "1.1" }], rounding: null },
    quotes: [{ quoteId: "left", revision: 0, digest: "a".repeat(64), name: "Left" }, { quoteId: "right", revision: 0, digest: "b".repeat(64), name: "Right" }],
  } satisfies Extract<AuthorityOperation, { kind: "comparison" }>;
  expect(await authorityDigest(comparisonCore(operation))).toBe("5eed3dd5385beb04d1a212f76c697b304162bae85d909ce0e5bb33b4bfdfd6a8");
});

it("retains both original FX quantities through review, authorized execution and reload", async () => {
  const prepared = await suppliedPair("fx-original-ratio", "CZK", ["34"], "HUF", ["537.20"]);
  const context = { quotes: [...prepared.session.quotes.values()].map(quote => AuthoritySession.binding(quoteCore(quote))), comparisons: [] };
  const authority = new AuthoritySession(context); prepared.session.bindAuthority(authority);
  const fx = { from: "CZK", to: "HUF", fromAmount: "17", toAmount: "268.60" };
  await prepared.session.compare({ quoteIds: prepared.quoteIds, currency: "HUF", exchangeRates: [fx] });
  const review = authority.pending()!;
  const operation = parsePacket(review.payload).operations[0];
  expect(operation.kind === "comparison" && operation.input.exchangeRates).toEqual([fx]);
  expect(review.form.description).toContain("from amount: 17");
  expect(review.form.description).toContain("to amount: 268.60");
  const fresh = new QuoteSession("fx-original-ratio"); fresh.bindAuthority(new AuthoritySession(context));
  await fresh.initialize([receipt(prepared.left, "left"), receipt(prepared.right, "right")]);
  const result = await executeAuthorizedOperations({ authorization: { payload: review.payload, expiresAt: Date.now() + 60_000 }, session: fresh, signal: new AbortController().signal });
  expect(result.text).toContain("The totals are equal.");
  expect(result.text).toContain("CZK 17 = HUF 268.60");
  expect(result.text).toContain("HUF 537.20");
  expect(comparisonSchema.safeParse({ quoteIds: prepared.quoteIds, exchangeRates: [{ ...fx, rate: "268.60" }] }).success).toBe(false);
  expect(comparisonSchema.safeParse({ quoteIds: prepared.quoteIds, exchangeRates: [{ from: "CZK", to: "HUF", fromAmount: "17" }] }).success).toBe(false);
});

it("rounds only converted amounts unless all comparison amounts are explicitly selected", async () => {
  const prepared = await suppliedPair("fx-rounding-scope", "USD", ["0.334"], "EUR", ["1"]);
  const input = { quoteIds: prepared.quoteIds, currency: "USD", exchangeRates: [{ from: "USD", to: "EUR", fromAmount: "1", toAmount: "3" }] };
  const converted = await prepared.session.compare({ ...input, rounding: { stage: "total", decimals: 2 } });
  expect("converted" in converted && converted.converted.map(row => row.amount)).toEqual(["0.334", "0.33"]);
  expect("difference" in converted && converted.difference).toBe("0.004");
  const all = await prepared.session.compare({ ...input, rounding: { stage: "total", decimals: 2, scope: "all-comparison-amounts" } });
  expect("converted" in all && all.converted.map(row => row.amount)).toEqual(["0.33", "0.33"]);
  expect(all.body).toContain("The totals are equal.");
});
