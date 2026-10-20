import { expect, it } from "vitest";
import { AuthoritySession } from "../../src/lib/authority/session";
import { parsePacket, quoteCore } from "../../src/lib/authority/contract";
import { calculateSupplied, quoteCommandSchema, type Quote, type QuoteCommand } from "../../src/lib/portia/quotes";
import { comparisonSchema, QuoteSession } from "../../src/lib/portia/session";
import { nullableToolSchema } from "../../src/lib/portia/tool-schema";

const command = (value: unknown) => value as QuoteCommand;

it.each(["line", "total"] as const)("unscoped uncertainty withholds every derived effect, including %s rounding", stage => {
  const quote: Quote = { id: "uncertain", revision: 0, name: "Independent terms", pricing: "supplied", call: {}, services: [], terms: { unresolvedTerms: ["A governing supplier condition is unresolved."], taxPercent: "5", rounding: { stage, decimals: 0 } }, lines: [
    { name: "first", currency: "CAD", amount: "10.49", unit: "amount", amountBasis: "user-stated-flat" },
    { name: "second", currency: "CAD", amount: "20.25", unit: "amount", amountBasis: "user-stated-flat" },
    { name: "bounded", currency: "CAD", amount: "4", unit: "amount", amountBasis: "user-stated-flat", minimum: { amount: "9", per: "call" } },
    { name: "watch", currency: "CAD", rate: "7.25", unit: "time", periodHours: "1", commenced: false, duration: { hours: "2" } },
    { name: "levy", currency: "CAD", unit: "percentage", percent: "12", baseLines: ["first", "second"] },
  ] };
  const before = structuredClone(quote), result = calculateSupplied(quote);
  expect(result.status).toBe("unresolved"); expect(result.totals?.[0]).toMatchObject({ amount: "34.74", chargeIds: ["bounded", "first", "second"], lineAmounts: ["10.49", "20.25", "4"] });
  expect(result.body).toMatch(/derived.*withheld/i); expect(result.body).not.toMatch(/tax 5% included|monetary rounding per/);
  expect(quote).toEqual(before);
  const clarified = calculateSupplied({ ...quote, terms: { ...quote.terms, unresolvedTerms: [] } });
  expect(clarified.status).toBe("calculated"); expect(clarified.totals?.[0].chargeIds).toContain("levy"); expect(clarified.totals?.[0].chargeIds).toContain("supplied-tax");
});

it("preserves catalog currencies and leaves unknown three-letter codes unresolved", async () => {
  for (const currency of ["CAD", "JPY", "CHF", "SGD"]) {
    expect(quoteCommandSchema.safeParse({ action: "create", pricing: "supplied", lines: [{ name: "fee", currency, billing: { kind: "flat", price: "17.25", basis: "user-stated-flat" } }] }).success).toBe(true);
  }
  const session = new QuoteSession("unknown-currency"); await session.initialize([]);
  const result = await session.executeCommand(command({ action: "create", pricing: "supplied", lines: [{ name: "agency", currency: "ZZZ", billing: { kind: "flat", price: "41", basis: "user-stated-flat" } }] }));
  expect(result.status).toBe("unresolved");
  expect(result.questions.join(" ")).toMatch(/agency.*ZZZ.*(?:unknown|recognized|supported).*currency/i);
  if (!("quoteId" in result)) throw new Error("Missing preserved draft");
  expect(session.quotes.get(result.quoteId)?.lines[0]?.currency).toBe("ZZZ");
});

it("reviews, approves, and reloads a supplied quote with five valid currencies", async () => {
  const authority = new AuthoritySession(), session = new QuoteSession("five-currencies"); session.bindAuthority(authority); await session.initialize([]);
  const currencies = ["CAD", "JPY", "CHF", "SGD", "USD"];
  const staged = await session.executeCommand(command({ action: "create", pricing: "supplied", lines: currencies.map((currency, index) => ({ name: `fee ${index + 1}`, currency, billing: { kind: "flat", price: String(11 + index), basis: "user-stated-flat" } })) }));
  expect(staged).toHaveProperty("approvalRequired", true);
  const pending = authority.pending()!, operation = parsePacket(pending.payload).operations[0]; if (operation.kind !== "quote") throw new Error("Expected quote");
  expect(operation.preview?.totals).toHaveLength(5);
  const applied = await session.applyApprovedQuote(operation);
  const reload = new QuoteSession("five-currencies");
  await reload.initialize([{ role: "tool", content: [{ type: "tool-result", toolName: "manage_quote", toolCallId: "five-currency-receipt", output: { type: "json", value: JSON.parse(JSON.stringify(applied)) } }] }]);
  expect(reload.quotes.get(applied.quoteId)?.lines.map((line) => line.currency)).toEqual(currencies);
  reload.beginStep();
  const read = await reload.executeCommand({ action: "read", readScope: "current-chat", quoteId: applied.quoteId });
  expect("quotations" in read ? read.quotations?.[0]?.result.totals?.map((total) => total.currency) : undefined).toEqual(currencies);
});

it("validates comparison and FX currency codes without guessing conversion", async () => {
  const session = new QuoteSession("currency-comparison"); await session.initialize([]);
  const cad = await session.executeCommand(command({ action: "create", pricing: "supplied", lines: [{ name: "package", currency: "CAD", billing: { kind: "flat", price: "101", basis: "user-stated-flat" } }] }));
  const jpy = await session.executeCommand(command({ action: "create", pricing: "supplied", lines: [{ name: "package", currency: "JPY", billing: { kind: "flat", price: "11200", basis: "user-stated-flat" } }] }));
  if (!("quoteId" in cad) || !("quoteId" in jpy)) throw new Error("Missing quotes");
  expect((await session.compare({ quoteIds: [cad.quoteId, jpy.quoteId], currency: "CAD" })).body).toMatch(/JPY to CAD conversion rate/i);
  const compared = await session.compare({ quoteIds: [cad.quoteId, jpy.quoteId], currency: "CAD", exchangeRates: [{ from: "JPY", to: "CAD", rate: "0.0091", date: "2026-12-03" }] });
  expect(compared.status).toBe("calculated");
  expect("converted" in compared ? compared.converted.map((row) => row.amount) : undefined).toEqual(["101", "101.92"]);
  expect((await session.compare(comparisonSchema.parse({ quoteIds: [cad.quoteId, jpy.quoteId], currency: "ZZZ" }))).body).toMatch(/ZZZ.*(?:unknown|recognized|supported).*currency/i);
  expect((await session.compare(comparisonSchema.parse({ quoteIds: [cad.quoteId, jpy.quoteId], currency: "CAD", exchangeRates: [{ from: "ZZZ", to: "CAD", rate: "2" }] }))).body).toMatch(/ZZZ.*(?:unknown|recognized|supported).*currency/i);
});

it("calculates independent resource quantity times duration with a duration floor and line rounding", async () => {
  const session = new QuoteSession("resource-time"); await session.initialize([]);
  const result = await session.executeCommand(command({
    action: "create", pricing: "supplied", terms: { rounding: { stage: "line", decimals: 2 } },
    lines: [{ name: "crane watch", currency: "CAD", billing: { kind: "time", price: "12.345", periodHours: "2", commenced: true, duration: { hours: "4", minutes: "10" }, resourceQuantity: "3", resourceLabel: "cranes" }, minimumDurationHours: "6" }],
  }));
  expect(result.status).toBe("calculated");
  expect("totals" in result ? result.totals?.[0] : undefined).toMatchObject({ currency: "CAD", amount: "111.11", lineAmounts: ["111.11"] });
  expect(result.body).toMatch(/3 cranes.*minimum billable duration 6 hours/i);
});

it("requires monetary-bound basis for multiple resources and applies unit versus line bounds distinctly", async () => {
  const unresolved = new QuoteSession("resource-bound-unresolved"); await unresolved.initialize([]);
  const missingBasis = await unresolved.executeCommand(command({ action: "create", pricing: "supplied", lines: [{ name: "guards", currency: "SGD", billing: { kind: "time", price: "10", periodHours: "1", commenced: false, duration: { hours: "1" }, resourceQuantity: "3", resourceLabel: "guards" }, minimum: { amount: "15", per: "block" } }] }));
  expect(missingBasis.status).toBe("unresolved");
  expect(missingBasis.questions.join(" ")).toMatch(/guards.*minimum.*unit.*line.*basis/i);

  const resolved = new QuoteSession("resource-bound-resolved"); await resolved.initialize([]);
  const result = await resolved.executeCommand(command({ action: "create", pricing: "supplied", lines: [
    { name: "unit floor", currency: "SGD", billing: { kind: "time", price: "10", periodHours: "1", commenced: false, duration: { hours: "1" }, resourceQuantity: "3", resourceLabel: "guards" }, minimum: { amount: "15", per: "block", basis: "unit" }, maximum: { amount: "17", per: "block", basis: "unit" } },
    { name: "line floor", currency: "SGD", billing: { kind: "time", price: "10", periodHours: "1", commenced: false, duration: { hours: "1" }, resourceQuantity: "3", resourceLabel: "guards" }, minimum: { amount: "15", per: "block", basis: "line" }, maximum: { amount: "50", per: "block", basis: "line" } },
  ] }));
  expect("totals" in result ? result.totals?.[0] : undefined).toMatchObject({ amount: "75", lineAmounts: ["45", "30"] });
});

it("applies default line-basis call bounds for one resource, including a rate denominator", async () => {
  const session = new QuoteSession("single-resource-default-bound"); await session.initialize([]);
  const result = await session.executeCommand(command({ action: "create", pricing: "supplied", lines: [
    { name: "minimum", currency: "USD", billing: { kind: "time", price: "10", periodHours: "1", commenced: false, duration: { hours: "1" }, resourceQuantity: "1", resourceLabel: "guard" }, minimum: { amount: "15", per: "call" } },
    { name: "maximum", currency: "USD", billing: { kind: "time", price: "10", periodHours: "1", commenced: false, duration: { hours: "1" }, resourceQuantity: "1", resourceLabel: "guard" }, maximum: { amount: "7", per: "call" } },
    { name: "denominated", currency: "USD", billing: { kind: "time", price: "10", periodHours: "1", commenced: false, duration: { hours: "1" }, resourceQuantity: "1", resourceLabel: "guard", perResourceQuantity: "2" }, minimum: { amount: "8", per: "call" } },
  ] }));
  expect("totals" in result ? result.totals?.[0] : undefined).toMatchObject({ amount: "30", lineAmounts: ["15", "7", "8"] });
});

it("normalizes a denominated resource rate before unit-basis block and call bounds", async () => {
  const session = new QuoteSession("resource-denominator-bounds"); await session.initialize([]);
  const result = await session.executeCommand(command({ action: "create", pricing: "supplied", lines: [
    { name: "block minimum", currency: "USD", billing: { kind: "time", price: "100", periodHours: "1", commenced: false, duration: { hours: "1" }, resourceQuantity: "4", resourceLabel: "guards", perResourceQuantity: "2" }, minimum: { amount: "60", per: "block", basis: "unit" } },
    { name: "block maximum", currency: "USD", billing: { kind: "time", price: "100", periodHours: "1", commenced: false, duration: { hours: "1" }, resourceQuantity: "4", resourceLabel: "guards", perResourceQuantity: "2" }, maximum: { amount: "40", per: "block", basis: "unit" } },
    { name: "call minimum", currency: "USD", billing: { kind: "time", price: "100", periodHours: "1", commenced: false, duration: { hours: "2" }, resourceQuantity: "4", resourceLabel: "guards", perResourceQuantity: "2" }, minimum: { amount: "120", per: "call", basis: "unit" } },
    { name: "call maximum", currency: "USD", billing: { kind: "time", price: "100", periodHours: "1", commenced: false, duration: { hours: "2" }, resourceQuantity: "4", resourceLabel: "guards", perResourceQuantity: "2" }, maximum: { amount: "80", per: "call", basis: "unit" } },
  ] }));
  expect("totals" in result ? result.totals?.[0] : undefined).toMatchObject({ amount: "1200", lineAmounts: ["240", "160", "480", "320"] });
});

it("validates patch-only unit bounds against merged approved and draft resource-time lines", async () => {
  const approvedAuthority = new AuthoritySession(), approvedSession = new QuoteSession("merged-bound-approved"); approvedSession.bindAuthority(approvedAuthority); await approvedSession.initialize([]);
  const staged = await approvedSession.executeCommand(command({ action: "create", pricing: "supplied", lines: [{ name: "watch", currency: "USD", billing: { kind: "time", price: "10", periodHours: "1", commenced: false, duration: { hours: "1" }, resourceQuantity: "2", resourceLabel: "guards" } }] }));
  expect(staged).toHaveProperty("approvalRequired", true);
  const createOperation = parsePacket(approvedAuthority.pending()!.payload).operations[0]; if (createOperation.kind !== "quote") throw new Error("Expected quote");
  await approvedSession.applyApprovedQuote(createOperation);
  const updateAuthority = new AuthoritySession({ quotes: [AuthoritySession.binding(quoteCore(createOperation.quote))], comparisons: [] }); approvedSession.bindAuthority(updateAuthority); approvedSession.beginStep();
  const patch = { action: "update", quoteId: createOperation.quote.id, lines: [{ name: "watch", minimum: { amount: "12", per: "call", basis: "unit" } }] };
  expect(quoteCommandSchema.safeParse(patch).success).toBe(true);
  const updated = await approvedSession.executeCommand(command(patch)); expect(updated).toHaveProperty("approvalRequired", true);
  const updateOperation = parsePacket(updateAuthority.pending()!.payload).operations[0]; if (updateOperation.kind !== "quote") throw new Error("Expected quote update");
  expect(updateOperation.quote.lines[0]).toMatchObject({ rate: "10", resourceQuantity: "2", resourceLabel: "guards", minimum: { amount: "12", per: "call", basis: "unit" } });
  expect((await approvedSession.applyApprovedQuote(updateOperation)).totals?.[0].amount).toBe("24");

  const draftAuthority = new AuthoritySession(), draftSession = new QuoteSession("merged-bound-draft"); draftSession.bindAuthority(draftAuthority); await draftSession.initialize([]);
  const incomplete = await draftSession.executeCommand(command({ action: "create", pricing: "supplied", lines: [{ name: "watch", currency: "USD", billing: { kind: "time", price: "9", duration: { hours: "2" }, resourceQuantity: "3", resourceLabel: "crews" } }] }));
  if (!("quoteId" in incomplete)) throw new Error("Expected draft");
  draftSession.beginStep();
  const bounded = await draftSession.executeCommand(command({ action: "update", quoteId: incomplete.quoteId, lines: [{ name: "watch", minimum: { amount: "20", per: "call", basis: "unit" } }] }));
  expect(bounded.status).toBe("unresolved");
  expect("draft" in bounded ? bounded.draft.quote.lines[0] : undefined).toMatchObject({ rate: "9", duration: { hours: "2" }, resourceQuantity: "3", resourceLabel: "crews", minimum: { amount: "20", per: "call", basis: "unit" } });
  draftSession.beginStep();
  const completed = await draftSession.executeCommand(command({ action: "update", quoteId: incomplete.quoteId, lines: [{ name: "watch", billing: { kind: "time", periodHours: "1", commenced: false } }] }));
  expect(completed).toHaveProperty("approvalRequired", true);
  const completedOperation = parsePacket(draftAuthority.pending()!.payload).operations[0]; if (completedOperation.kind !== "quote") throw new Error("Expected completed draft quote");
  expect(completedOperation.quote.lines[0]).toMatchObject({ rate: "9", periodHours: "1", commenced: false, duration: { hours: "2" }, resourceQuantity: "3", resourceLabel: "crews", minimum: { amount: "20", per: "call", basis: "unit" } });
  expect(completedOperation.preview?.totals[0].amount).toBe("60");
});

it("preserves resource count and time constraints across price-only correction", async () => {
  const session = new QuoteSession("resource-correction"); await session.initialize([]);
  const created = await session.executeCommand(command({ action: "create", pricing: "supplied", terms: { rounding: { stage: "line", decimals: 2 } }, lines: [{ name: "launch crews", currency: "CHF", billing: { kind: "time", price: "8.125", periodHours: "3", commenced: true, duration: { hours: "5" }, resourceQuantity: "4", resourceLabel: "crews", perResourceQuantity: "2" }, minimumDurationHours: "6", maximum: { amount: "70", per: "call", basis: "line" } }] }));
  if (!("quoteId" in created)) throw new Error("Missing quote");
  session.beginStep();
  const changed = await session.executeCommand(command({ action: "update", quoteId: created.quoteId, lines: [{ name: "launch crews", price: "9.375" }] }));
  expect("totals" in changed ? changed.totals?.[0].amount : undefined).toBe("37.5");
  expect(session.quotes.get(created.quoteId)?.lines[0]).toMatchObject({ currency: "CHF", rate: "9.375", unit: "time", periodHours: "3", commenced: true, duration: { hours: "5" }, resourceQuantity: "4", resourceLabel: "crews", perResourceQuantity: "2", minimumDurationHours: "6", maximum: { amount: "70", per: "call", basis: "line" } });
  expect(session.quotes.get(created.quoteId)?.terms.rounding).toEqual({ stage: "line", decimals: 2 });
});

it("supports resource quantity on GT-time billing without conflating it with GT denominator", async () => {
  const session = new QuoteSession("resource-gt-time"); await session.initialize([]);
  const result = await session.executeCommand(command({ action: "create", pricing: "supplied", call: { gt: "1000" }, lines: [{ name: "tug watch", currency: "USD", billing: { kind: "gt-time", price: "2", perQuantity: "100", periodHours: "1", commenced: false, duration: { hours: "2" }, resourceQuantity: "2", resourceLabel: "tugs" } }] }));
  expect("totals" in result ? result.totals?.[0].amount : undefined).toBe("80");
  expect(result.body).toMatch(/1000 GT \/ 100.*2 tugs/i);
});

it("calculates ordered percentage dependencies and recomputes after a base correction", async () => {
  const session = new QuoteSession("percentage-order"); await session.initialize([]);
  const created = await session.executeCommand(command({ action: "create", pricing: "supplied", lines: [
    { name: "secondary levy", currency: "CAD", billing: { kind: "percentage", percent: "20", baseLines: ["admin levy"] } },
    { name: "admin levy", currency: "CAD", billing: { kind: "percentage", percent: "10", baseLines: ["dock fee", "launch jobs"] } },
    { name: "dock fee", currency: "CAD", billing: { kind: "flat", price: "100", basis: "user-stated-flat" } },
    { name: "launch jobs", currency: "CAD", billing: { kind: "quantity", price: "25", quantity: "2", quantityLabel: "jobs" } },
  ] }));
  expect("totals" in created ? created.totals?.[0].amount : undefined).toBe("168");
  if (!("quoteId" in created)) throw new Error("Missing quote");
  session.beginStep();
  const corrected = await session.executeCommand(command({ action: "update", quoteId: created.quoteId, lines: [{ name: "dock fee", price: "140" }] }));
  expect("totals" in corrected ? corrected.totals?.[0].amount : undefined).toBe("212.8");
  expect(session.quotes.get(created.quoteId)?.lines[1]).toMatchObject({ unit: "percentage", percent: "10", baseLines: ["dock fee", "launch jobs"] });
});

it("keeps percentage dependency rules in the exact review and approved quote record", async () => {
  const authority = new AuthoritySession(), session = new QuoteSession("percentage-review"); session.bindAuthority(authority); await session.initialize([]);
  const staged = await session.executeCommand(command({ action: "create", pricing: "supplied", lines: [
    { name: "wharf fee", currency: "SGD", billing: { kind: "flat", price: "88", basis: "user-stated-flat" } },
    { name: "service levy", currency: "SGD", billing: { kind: "percentage", percent: "6.75", baseLines: ["wharf fee"] } },
  ] }));
  expect(staged).toHaveProperty("approvalRequired", true);
  const pending = authority.pending()!, operation = parsePacket(pending.payload).operations[0];
  expect(pending.form.description).toMatch(/percent: 6\.75/i);
  expect(pending.form.description).toMatch(/base lines 1: wharf fee/i);
  if (operation.kind !== "quote") throw new Error("Expected quote operation");
  expect(operation.quote.lines[1]).toMatchObject({ unit: "percentage", percent: "6.75", baseLines: ["wharf fee"] });
  const applied = await session.applyApprovedQuote(operation);
  expect(applied.record.quote.lines[1]).toMatchObject({ unit: "percentage", percent: "6.75", baseLines: ["wharf fee"] });
});

it("rejects a monetary-price correction on a percentage recipe without mutating its saved terms", async () => {
  const session = new QuoteSession("percentage-price"); await session.initialize([]);
  const created = await session.executeCommand(command({ action: "create", pricing: "supplied", lines: [
    { name: "base", currency: "CAD", billing: { kind: "flat", price: "80", basis: "user-stated-flat" } },
    { name: "fee", currency: "CAD", billing: { kind: "percentage", percent: "5", baseLines: ["base"] } },
  ] }));
  if (!("quoteId" in created)) throw new Error("Missing quote");
  const before = structuredClone(session.quotes.get(created.quoteId)); session.beginStep();
  const badInput = command({ action: "update", quoteId: created.quoteId, lines: [{ name: "fee", price: "7" }] });
  const rejected = await session.executeCommand(badInput);
  session.observeTools([{ toolCallId: "bad-price", toolName: "manage_quote", input: badInput, output: rejected }]);
  expect(rejected.status).toBe("error"); expect(rejected.body).toMatch(/percentage.*percent/i);
  expect(session.quotes.get(created.quoteId)).toEqual(before);
  session.beginStep();
  const correctedInput = command({ action: "update", quoteId: created.quoteId, lines: [{ name: "fee", billing: { kind: "percentage", percent: "7" } }] });
  const corrected = await session.executeCommand(correctedInput);
  session.observeTools([{ toolCallId: "corrected-percent", toolName: "manage_quote", input: correctedInput, output: corrected }]);
  expect("totals" in corrected ? corrected.totals?.[0].amount : undefined).toBe("85.6");
  expect(session.quotes.get(created.quoteId)?.lines[1]).not.toHaveProperty("rate");
  expect(session.finalText("")).not.toMatch(/no monetary price|tool call failed/);
});

it("retains percentage bases on same-kind correction and rejects missing, mixed-currency, and cyclic bases", async () => {
  const retained = new QuoteSession("percentage-correction"); await retained.initialize([]);
  const created = await retained.executeCommand(command({ action: "create", pricing: "supplied", lines: [
    { name: "base", currency: "JPY", billing: { kind: "flat", price: "8000", basis: "user-stated-flat" } },
    { name: "fee", currency: "JPY", billing: { kind: "percentage", percent: "7.5", baseLines: ["base"] } },
  ] }));
  if (!("quoteId" in created)) throw new Error("Missing quote");
  retained.beginStep();
  const corrected = await retained.executeCommand(command({ action: "update", quoteId: created.quoteId, lines: [{ name: "fee", billing: { kind: "percentage", percent: "8.25" } }] }));
  expect("totals" in corrected ? corrected.totals?.[0].amount : undefined).toBe("8660");
  expect(retained.quotes.get(created.quoteId)?.lines[1]).toMatchObject({ percent: "8.25", baseLines: ["base"] });

  const invalid = new QuoteSession("percentage-invalid"); await invalid.initialize([]);
  const result = await invalid.executeCommand(command({ action: "create", pricing: "supplied", lines: [
    { name: "CAD base", currency: "CAD", billing: { kind: "flat", price: "20", basis: "user-stated-flat" } },
    { name: "JPY base", currency: "JPY", billing: { kind: "flat", price: "3000", basis: "user-stated-flat" } },
    { name: "unpriced", currency: "CAD", billing: { kind: "flat", basis: "user-stated-flat" } },
    { name: "missing base fee", currency: "CAD", billing: { kind: "percentage", percent: "5", baseLines: ["absent"] } },
    { name: "unpriced base fee", currency: "CAD", billing: { kind: "percentage", percent: "5.5", baseLines: ["unpriced"] } },
    { name: "mixed fee", currency: "CAD", billing: { kind: "percentage", percent: "6", baseLines: ["CAD base", "JPY base"] } },
    { name: "cycle A", currency: "CAD", billing: { kind: "percentage", percent: "2", baseLines: ["cycle B"] } },
    { name: "cycle B", currency: "CAD", billing: { kind: "percentage", percent: "3", baseLines: ["cycle A"] } },
  ] }));
  expect(result.status).toBe("unresolved");
  expect(result.questions.join(" ")).toMatch(/missing base fee.*absent/i);
  expect(result.questions.join(" ")).toMatch(/unpriced base fee.*unpriced.*unresolved/i);
  expect(result.questions.join(" ")).toMatch(/mixed fee.*same currency/i);
  expect(result.questions.join(" ")).toMatch(/cycle A.*cyclic|cycle B.*cyclic/i);
  expect("totals" in result ? result.totals?.map((total) => total.currency).sort() : undefined).toEqual(["CAD", "JPY"]);
});

it("normalizes strict wire nulls for resource-time and percentage recipes without oneOf", async () => {
  const schema = nullableToolSchema(quoteCommandSchema), json = await schema.jsonSchema;
  const serialized = JSON.stringify(json);
  expect(serialized).not.toContain('"oneOf"');
  const parsed = await schema.validate!({ action: "create", quoteId: null, name: null, pricing: "supplied", call: null, services: null, removeLines: null, terms: null, readScope: null, reference: null, reporting: null, removeServices: null, removeUnsupportedServices: null, clearCallFields: null, scopeChangeEvidence: null, reviewGroup: null, lines: [
    { name: "watch", currency: "CAD", billing: { kind: "time", price: "5", periodHours: "1", commenced: false, duration: { hours: "2", minutes: null }, resourceQuantity: "3", resourceLabel: "teams", perResourceQuantity: null }, price: null, minimumDurationHours: null, removeMinimumDuration: null, statedExtension: null, removeStatedExtension: null, minimum: null, maximum: null, removeMinimum: null, removeMaximum: null },
    { name: "levy", currency: "CAD", billing: { kind: "percentage", price: null, percent: "4.5", baseLines: ["watch"] }, price: null, minimumDurationHours: null, removeMinimumDuration: null, statedExtension: null, removeStatedExtension: null, minimum: null, maximum: null, removeMinimum: null, removeMaximum: null },
  ] });
  expect(parsed.success).toBe(true);
  if (parsed.success) expect(parsed.value.lines?.map((line) => line.billing)).toEqual([
    { kind: "time", price: "5", periodHours: "1", commenced: false, duration: { hours: "2" }, resourceQuantity: "3", resourceLabel: "teams" },
    { kind: "percentage", percent: "4.5", baseLines: ["watch"] },
  ]);
});
