import { expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";
import { AuthoritySession } from "../../src/lib/authority/session";
import { quoteCore } from "../../src/lib/authority/contract";
import { QuoteSession } from "../../src/lib/portia/session";

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } };
const call = (toolName: string, input: unknown, toolCallId: string): LanguageModelV4GenerateResult => ({ content: [{ type: "tool-call", toolName, toolCallId, input: JSON.stringify(input) }], finishReason: { unified: "tool-calls", raw: undefined }, usage, warnings: [] });
async function pair() {
  const session = new QuoteSession("decision-pair"); await session.initialize([]);
  for (const [name, currency, amount] of [["Maple", "CAD", "240"], ["Birch", "USD", "150"]]) await session.update({ name, pricing: "supplied", lines: [{ name: "service", currency, amount }] });
  const authority = new AuthoritySession(); for (const quote of session.quotes.values()) authority.acceptQuote(quoteCore(quote));
  return { session, authority, ids: [...session.quotes.keys()] };
}
const evidence = (session: QuoteSession, kind: string) => session.completion.context().evidence.filter(item => item.kind === kind && item.current).at(-1)!;
const finish = (session: QuoteSession, kind: "quotation" | "quotation_read" | "comparison" | "elapsed_time" | "calculation", id = "done") => {
  const result = evidence(session, kind);
  return call("finish_turn", { outcomes: [{ id: "requested", requestedOutcome: "Complete the requested result", kind, targets: result.targets, ...(result.comparisonCurrency ? { comparisonCurrency: result.comparisonCurrency } : {}), ...(result.reportingView ? { reportingViews: [result.reportingView] } : {}), evidenceIds: [result.id] }] }, id);
};

it("recovers from quote-read-as-comparison and prepares the actual inverse-FX comparison in the same loop", async () => {
  const { session, authority, ids } = await pair(); let step = 0;
  const model = new MockLanguageModelV4({ doGenerate: async options => {
    expect(options.toolChoice?.type).toBe("required");
    const n = step++;
    if (n === 0) return call("read_quotes", { readScope: "current-chat" }, "read");
    if (n === 1) return call("finish_turn", { outcomes: [{ id: "requested", requestedOutcome: "Complete the requested result", kind: "comparison", targets: ids, comparisonCurrency: "USD", evidenceIds: [evidence(session, "quotation_read").id] }] }, "premature");
    if (n === 2) return call("compare_quotes", { quoteIds: ids, currency: "USD", exchangeRates: [{ from: "USD", to: "CAD", rate: "2" }], rounding: { stage: "total", decimals: 2 } }, "compare");
    return finish(session, "comparison");
  } });
  const run = await createMigrationMainAgent({ alias: "model-1", mainModel: model, session, authority }).generate({ prompt: "Compare those offers in USD using the supplied relation 1 USD = 2 CAD; round converted totals to cents." });
  expect(model.doGenerateCalls).toHaveLength(4);
  expect(run.steps[1].toolResults[0].output).toMatchObject({ status: "continue_work", issues: expect.arrayContaining([expect.objectContaining({ code: "wrong_operation" })]) });
  expect(session.completion.completion()?.outcomes[0].disposition).toBe("awaiting_approval");
  const operation = authority.pendingOperations()[0]; expect(operation.kind).toBe("comparison"); if (operation.kind !== "comparison") throw Error("Missing comparison");
  expect(operation.input.exchangeRates).toEqual([{ from: "USD", to: "CAD", rate: "2" }]);
  const approved = await session.applyApprovedComparison(operation);
  expect(approved).toMatchObject({ status: "calculated", difference: "30", currency: "USD" });
  expect(approved.body).toContain("USD 120.00"); expect(approved.body).toContain("USD 150.00");
});

it("repairs an omitted supplied FX fact and retires the obsolete input question", async () => {
  const { session, authority, ids } = await pair(); let step = 0;
  const model = new MockLanguageModelV4({ doGenerate: async () => {
    const n = step++;
    if (n === 0) return call("compare_quotes", { quoteIds: ids, currency: "USD" }, "missing-fx");
    if (n === 1) return call("compare_quotes", { quoteIds: ids, currency: "USD", exchangeRates: [{ from: "USD", to: "CAD", rate: "2" }], retryOf: "missing-fx" }, "fixed-fx");
    return finish(session, "comparison");
  } });
  await createMigrationMainAgent({ alias: "model-1", mainModel: model, session, authority }).generate({ prompt: "The supplied rate is 1 USD to 2 CAD. Compare the saved quotations in USD." });
  expect(model.doGenerateCalls).toHaveLength(3); expect(session.hasCurrentInputQuestions()).toBe(false);
  expect(session.completion.completion()?.outcomes[0].disposition).toBe("awaiting_approval");
  expect(session.finalText("")).not.toContain("Provide one direct");
});

it("ends a genuinely ambiguous interval as awaiting input rather than a failed operation", async () => {
  const session = new QuoteSession("decision-interval"); let step = 0;
  const model = new MockLanguageModelV4({ doGenerate: async () => step++ === 0 ? call("calculate_elapsed_time", { start: "2026-11-03 10:00", end: "2026-11-03 12:00", label: "stay" }, "interval") : finish(session, "elapsed_time") });
  await createMigrationMainAgent({ alias: "model-1", mainModel: model, session }).generate({ prompt: "How long from 2026-11-03 10:00 until 12:00? I have not specified the timezone." });
  expect(model.doGenerateCalls).toHaveLength(2); expect(session.completion.completion()?.outcomes[0].disposition).toBe("awaiting_input");
  expect(session.hasCurrentInputQuestions()).toBe(true); expect(session.finalText("")).not.toContain("business tool call failed");
});

it("renders a tool-backed unavailable lookup when finish carries no prose", async () => {
  vi.stubEnv("VESSEL_API_KEY", "");
  try {
    const session = new QuoteSession("lookup-only"); let step = 0;
    const model = new MockLanguageModelV4({ doGenerate: async () => {
      if (step++ === 0) return call("search_vessels", { query: "Maple" }, "lookup");
      const result = evidence(session, "vessel_lookup");
      return call("finish_turn", { outcomes: [{ id: "lookup", requestedOutcome: "Look up Maple", kind: "vessel_lookup", targets: result.targets, evidenceIds: [result.id] }] }, "done");
    } });
    await createMigrationMainAgent({ alias: "model-1", mainModel: model, session }).generate({ prompt: "Look up Maple." });
    expect(session.completion.completion()?.outcomes[0].disposition).toBe("unavailable");
    expect(await session.answer("")).toMatch(/Vessel lookup is not configured/);
  } finally { vi.unstubAllEnvs(); }
});

it("finishes unavailable cross-chat recall without looping on a feature that is disabled", async () => {
  const session = new QuoteSession("memory-unavailable"); let step = 0;
  const model = new MockLanguageModelV4({ doGenerate: async () => {
    if (step++ === 0) return call("read_quotes", { readScope: "cross-chat" }, "recall");
    const result = evidence(session, "memory_read");
    return call("finish_turn", { outcomes: [{ id: "recall", requestedOutcome: "Read saved facts", kind: "memory_read", targets: result.targets, evidenceIds: [result.id] }] }, "done");
  } });
  await createMigrationMainAgent({ alias: "model-1", mainModel: model, session }).generate({ prompt: "Read my saved facts." });
  expect(model.doGenerateCalls).toHaveLength(2);
  expect(session.completion.completion()?.outcomes[0].disposition).toBe("unavailable");
  expect(session.finalText("")).toContain("Cross-chat memory is unavailable");
});

it("repairs an empty or unsupported finish inside the same loop", async () => {
  const session = new QuoteSession("finish-repair"); let step = 0;
  const model = new MockLanguageModelV4({ doGenerate: async () => {
    const n = step++;
    if (n === 0) return call("finish_turn", { outcomes: [] }, "empty");
    if (n === 1) return call("finish_turn", { outcomes: [], response: "Total USD 120." }, "unsupported");
    if (n === 2) return call("calculate_charges", { expression: "40*3" }, "math");
    return finish(session, "calculation");
  } });
  const run = await createMigrationMainAgent({ alias: "model-1", mainModel: model, session }).generate({ prompt: "Calculate 40*3." });
  expect(model.doGenerateCalls).toHaveLength(4);
  expect(run.steps[0].toolResults[0].output).toMatchObject({ status: "continue_work" });
  expect(run.steps[1].toolResults[0].output).toMatchObject({ status: "continue_work" });
  expect(session.completion.completion()?.outcomes[0].disposition).toBe("completed");
  expect(await session.answer("")).toContain("`40*3` = **120**");
});

it.each(["cargoTonnes", "movements"] as const)("retains and corrects supported supplied %s through the smaller tool", async field => {
  const session = new QuoteSession("supplied-particulars"); await session.initialize([]);
  await session.update({ name: "Cargo offer", pricing: "supplied", call: { [field]: "10", flag: "India" }, lines: [{ name: "Service", currency: "USD", rate: "2", unit: field === "cargoTonnes" ? "tonne" : "movement" }] });
  const original = [...session.quotes.values()][0];
  original.call.flag = "India"; // Retained saved metadata, omitted by the legacy setup helper.
  const authority = new AuthoritySession(); authority.acceptQuote(quoteCore(original));
  let step = 0;
  const model = new MockLanguageModelV4({ doGenerate: async () => step++ === 0
    ? call("supplied_quote", { action: "update", quoteId: original.id, call: { [field]: "12" }, clearCallFields: ["flag"], scopeChangeEvidence: "Remove flag; it was entered incorrectly." }, "correct")
    : finish(session, "quotation") });
  await createMigrationMainAgent({ alias: "model-1", mainModel: model, session, authority }).generate({ prompt: `Correct ${field} to 12. Remove flag; it was entered incorrectly.` });
  expect(model.doGenerateCalls).toHaveLength(2);
  expect(session.completion.completion()?.outcomes[0].disposition).toBe("awaiting_approval");
  const operation = authority.pendingOperations()[0];
  expect(operation).toMatchObject({ kind: "quote", quote: { call: { [field]: "12" } } });
  if (operation.kind !== "quote") throw Error("Expected quote");
  expect(operation.quote.call.flag).toBeUndefined();
  expect(session.quotes.get(original.id)?.call[field]).toBe("10");
});

it("can repair a malformed finish without inventing a failed business operation", async () => {
  const session = new QuoteSession("invalid-finish"); let step = 0;
  const model = new MockLanguageModelV4({ doGenerate: async () => step++ === 0
    ? call("finish_turn", { outcomes: null }, "invalid")
    : call("finish_turn", { outcomes: [], response: "Hello." }, "valid") });
  await createMigrationMainAgent({ alias: "model-1", mainModel: model, session }).generate({ prompt: "Hello." });
  expect(model.doGenerateCalls).toHaveLength(2);
  expect(session.hasUnresolvedToolFailure("invalid")).toBe(false);
  expect(await session.answer("")).toBe("Hello.");
});

it("finishes missing package equivalence as awaiting input without claiming a comparison", async () => {
  const session = new QuoteSession("scope-question"); await session.initialize([]);
  await session.update({ name: "First", pricing: "supplied", lines: [{ name: "Package A", currency: "USD", amount: "80" }] });
  await session.update({ name: "Second", pricing: "supplied", lines: [{ name: "Package B", currency: "USD", amount: "90" }] });
  const authority = new AuthoritySession(); for (const q of session.quotes.values()) authority.acceptQuote(quoteCore(q));
  const ids = [...session.quotes.keys()]; let step = 0;
  const model = new MockLanguageModelV4({ doGenerate: async () => step++ === 0
    ? call("compare_quotes", { quoteIds: ids, currency: "USD" }, "compare")
    : finish(session, "comparison") });
  await createMigrationMainAgent({ alias: "model-1", mainModel: model, session, authority }).generate({ prompt: "Compare these packages. I have not said their services match." });
  expect(model.doGenerateCalls).toHaveLength(2);
  expect(session.completion.completion()?.outcomes[0].disposition).toBe("awaiting_input");
  expect(session.finalText("")).toContain("scope equivalence");
  expect(authority.hasPending()).toBe(false);
});

it("retains a genuinely missing FX pair after repairing a failed comparison", async () => {
  const { session, authority, ids } = await pair();
  const extra = await session.update({ name: "Elm", pricing: "supplied", lines: [{ name: "service", currency: "EUR", amount: "110" }] });
  expect(extra.status).toBe("calculated");
  const third = [...session.quotes.values()].at(-1)!; authority.acceptQuote(quoteCore(third)); ids.push(third.id);
  let step = 0;
  const model = new MockLanguageModelV4({ doGenerate: async () => {
    const n = step++;
    if (n === 0) return call("compare_quotes", { quoteIds: ids, currency: "USD", exchangeRates: [{ from: "USD", to: "USD", rate: "1" }] }, "invalid");
    if (n === 1) return call("compare_quotes", { quoteIds: ids, currency: "USD", exchangeRates: [{ from: "USD", to: "CAD", rate: "2" }], retryOf: "invalid" }, "missing-eur");
    return finish(session, "comparison");
  } });
  await createMigrationMainAgent({ alias: "model-1", mainModel: model, session, authority }).generate({ prompt: "Compare in USD; 1 USD is 2 CAD. I do not know the EUR rate." });
  expect(model.doGenerateCalls).toHaveLength(3);
  expect(session.hasUnresolvedToolFailure("invalid")).toBe(false);
  expect(session.completion.completion()?.outcomes[0].disposition).toBe("awaiting_input");
  expect(session.finalText("")).toContain("EUR to USD");
});

it("corrects an invalid comparison currency without retaining its rejected predecessor", async () => {
  const { session, authority, ids } = await pair(); let step = 0;
  const model = new MockLanguageModelV4({ doGenerate: async () => {
    const n = step++;
    if (n === 0) return call("compare_quotes", { quoteIds: ids, currency: "ZZZ" }, "invalid");
    if (n === 1) return finish(session, "comparison", "premature");
    if (n === 2) return call("compare_quotes", { quoteIds: ids, currency: "USD", exchangeRates: [{ from: "USD", to: "CAD", rate: "2" }], retryOf: "invalid" }, "correct");
    return finish(session, "comparison");
  } });
  await createMigrationMainAgent({ alias: "model-1", mainModel: model, session, authority }).generate({ prompt: "Compare in USD using 1 USD = 2 CAD." });
  expect(model.doGenerateCalls).toHaveLength(4);
  expect(session.hasUnresolvedToolFailure("invalid")).toBe(false);
  expect(session.completion.completion()?.outcomes[0].disposition).toBe("awaiting_approval");
});

it.each(["schema", "rounding"] as const)("repairs a %s rejection without dropping unchanged quote facts", async kind => {
  const session = new QuoteSession("quote-repair"); let step = 0;
  const official = { action: "create", services: ["berth"], call: { port: "BMCT", callDate: "2026-10-18", service: "foreign", gt: "8100", occupancy: { hours: "1" } } };
  const supplied = { action: "create", lines: [{ name: "Fee", currency: "USD", billing: { kind: "flat", price: "17.234", basis: "user-stated-flat" } }] };
  const model = new MockLanguageModelV4({ doGenerate: async () => {
    const n = step++;
    if (n < 2) return call(kind === "schema" ? "official_quote" : "supplied_quote", {
      ...(kind === "schema" ? official : supplied),
      ...(n === 0 ? { terms: kind === "schema" ? { taxPercent: "0" } : { rounding: { stage: "total", decimals: 2 } } } : kind === "rounding" ? { terms: { removeRounding: true } } : {}),
    }, n ? "corrected" : "rejected");
    return finish(session, "quotation");
  } });
  await createMigrationMainAgent({ alias: "model-1", mainModel: model, session }).generate({ prompt: "Use the given details before tax, with no monetary rounding." });
  expect(model.doGenerateCalls).toHaveLength(3);
  expect(session.hasUnresolvedToolFailure("rejected")).toBe(false);
  expect(session.completion.completion()).toBeDefined();
  expect(session.finalText("")).not.toContain("business tool call failed");
});

it("resolves an ambiguous read with a returned matching ID and retires its question", async () => {
  const session = new QuoteSession("read-repair"); await session.initialize([{ role: "user", content: "Quotations named First and Second, each reference PO-1." }]);
  for (const name of ["First", "Second"]) await session.executeCommand({ action: "create", name, pricing: "supplied", call: { reference: "PO-1" }, lines: [{ name: "Fee", currency: "USD", billing: { kind: "flat", price: "19", basis: "user-stated-flat" } }] });
  expect([...session.quotes.values()].map(q => q.call.reference)).toEqual(["PO-1", "PO-1"]);
  const selected = [...session.quotes.keys()][0]; let step = 0;
  const model = new MockLanguageModelV4({ doGenerate: async () => {
    const n = step++;
    if (n === 0) return call("read_quotes", { readScope: "current-chat", reference: "PO-1" }, "ambiguous");
    if (n === 1) return call("read_quotes", { readScope: "current-chat", quoteId: selected }, "selected");
    const result = evidence(session, "quotation_read");
    return call("finish_turn", { outcomes: [{ id: "read", requestedOutcome: "Read First", kind: "quotation_read", targets: result.targets, evidenceIds: [result.id] }] }, "done");
  } });
  await createMigrationMainAgent({ alias: "model-1", mainModel: model, session }).generate({ prompt: "Read First from PO-1." });
  expect(model.doGenerateCalls).toHaveLength(3);
  expect(session.hasUnresolvedToolFailure("ambiguous")).toBe(false);
  expect(session.hasCurrentInputQuestions()).toBe(false);
  expect(session.finalText("")).not.toContain("matches multiple");
  expect(session.completion.completion()?.outcomes[0].disposition).toBe("completed");
});

it("finishes a source-proven unavailable comparison without inventing a definitive ranking", async () => {
  const session = new QuoteSession("reference-comparison"); await session.initialize([]);
  for (const hours of ["2", "3"]) await session.update({ pricing: "official", services: ["berth"], call: { port: "Finolex", callDate: "2026-10-18", loa: "137.25", occupancy: { hours } } });
  const ids = [...session.quotes.keys()]; expect(ids).toHaveLength(2); let step = 0;
  const model = new MockLanguageModelV4({ doGenerate: async () => step++ === 0
    ? call("compare_quotes", { quoteIds: ids, currency: "INR" }, "compare")
    : finish(session, "comparison") });
  await createMigrationMainAgent({ alias: "model-1", mainModel: model, session }).generate({ prompt: "Compare the saved estimates definitively in INR." });
  expect(model.doGenerateCalls).toHaveLength(2);
  expect(session.completion.completion()?.outcomes[0].disposition).toBe("unavailable");
  expect(session.finalText("")).toContain("cannot support a definitive price ranking");
  expect(session.finalText("")).not.toContain("lower total");
});

it("repairs rejected read precision without changing the selected quote", async () => {
  const { session, authority, ids } = await pair(); let step = 0;
  const model = new MockLanguageModelV4({ doGenerate: async () => {
    const n = step++;
    if (n < 2) return call("read_quotes", { readScope: "current-chat", quoteId: ids[0], reporting: { stage: "total", decimals: n ? 2 : 9 } }, n ? "fixed" : "invalid");
    return finish(session, "quotation_read");
  } });
  await createMigrationMainAgent({ alias: "model-1", mainModel: model, session, authority }).generate({ prompt: "Show the first saved quote to two decimals." });
  expect(model.doGenerateCalls).toHaveLength(3);
  expect(session.hasUnresolvedToolFailure("invalid")).toBe(false);
  expect(session.completion.completion()?.outcomes[0].targets).toEqual([ids[0]]);
  expect(authority.hasPending()).toBe(false);
});

it.each([false, true])("rounding repair preserves other requested services (replace=%s)", async replace => {
  const session = new QuoteSession("rounding-scope"); let step = 0;
  const model = new MockLanguageModelV4({ doGenerate: async () => {
    const n = step++;
    if (n < 2) return call("official_quote", { action: "create", services: n ? [replace ? "pilotage" : "berth"] : ["berth", "rounding"], call: { port: "BMCT", callDate: "2026-10-18", service: "foreign", gt: "8100", movements: "2", occupancy: { hours: "1" } } }, n ? "retry" : "rejected");
    return finish(session, "quotation");
  } });
  const run = await createMigrationMainAgent({ alias: "model-1", mainModel: model, session }).generate({ prompt: "Estimate berth hire only. No monetary rounding." });
  expect(run.steps[1].toolResults[0].output).toMatchObject({ status: "calculated" });
  expect(session.hasUnresolvedToolFailure("rejected")).toBe(replace);
  expect(!!session.completion.completion()).toBe(!replace);
  expect(model.doGenerateCalls).toHaveLength(replace ? 12 : 3);
});
