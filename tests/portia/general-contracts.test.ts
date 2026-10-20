import { describe, expect, it, vi } from "vitest";
import type { ModelMessage } from "ai";
import { AuthoritySession } from "../../src/lib/authority/session";
import { QuoteSession } from "../../src/lib/portia/session";
import { reportQuote } from "../../src/lib/portia/reporting";
import type { QuoteResult } from "../../src/lib/portia/quotes";
import { lookupTariff } from "../../src/lib/portia/tariffs";
import * as tariffModule from "../../src/lib/portia/tariffs";

const result = (amounts: string[], status: QuoteResult["status"] = "calculated"): QuoteResult => ({
  status, sourceClass: "official-tariff", body: "Exact source derivation retained.", questions: status === "unresolved" ? ["Unpriced requested service"] : [],
  totals: [{ currency: "USD", amount: "20.01", lineAmounts: amounts, chargeIds: ["a", "b"], basis: "component" }],
});

describe("derived reporting, separate from monetary authority", () => {
  it("keeps exact totals/baselines while line and total reports differ", () => {
    const original = result(["10.005", "10.005"]), before = structuredClone(original);
    const perLine = reportQuote(original, { stage: "line", decimals: 2 });
    const perTotal = reportQuote(original, { stage: "total", decimals: 2 });
    expect(perLine.reporting?.totals[0].amount).toBe("20.02");
    expect(perTotal.reporting?.totals[0].amount).toBe("20.01");
    expect(perLine.totals).toEqual(original.totals); expect(perTotal.totals).toEqual(original.totals);
    expect(original).toEqual(before); expect(perLine.body).toContain(original.body);
  });
  it("does not silently drop a source-total adjustment in a line report", () => {
    const original = result(["10", "10"]);
    const report = reportQuote(original, { stage: "line", decimals: 2 });
    expect(report.status).toBe("calculated"); expect(report.reporting?.status).toBe("unavailable");
    expect(report.totals).toEqual(original.totals); expect(report.reporting?.issues?.join(" ")).toMatch(/unallocated/i);
  });
  it("retains partial-scope status and zero-decimal precision", () => {
    const original = result(["10.005", "10.005"], "unresolved");
    const report = reportQuote(original, { stage: "total", decimals: 0 });
    expect(report.reporting?.totals[0].amount).toBe("20");
    expect(report.status).toBe("unresolved"); expect(report.questions).toEqual(original.questions);
    expect(report.body).toMatch(/scope incomplete/);
  });
  it("reports an official quote without saving display settings or changing its exact baseline", async () => {
    const session = new QuoteSession("report-replay"); await session.initialize([]);
    const input = { action: "create" as const, pricing: "official" as const, call: { port: "JSW Jaigarh", gt: "12222", callDate: "2026-10-20", cargoCategory: "mechanized-bulk" as const, callDays: "3" }, services: ["port-dues" as const] };
    const saved = await session.executeCommand(input); expect(saved).toHaveProperty("record");
    if (!("record" in saved) || !saved.record) throw Error("missing receipt");
    expect(saved.totals?.[0].amount).toBe("4033.26"); expect(saved.reporting).toBeUndefined();
    expect(saved.record.quote.baseline?.totals?.[0].amount).toBe("4033.26"); expect(saved.record.quote.services).toEqual(["port-dues"]);
    const fresh = new QuoteSession("report-replay"); await fresh.initialize(history(input, saved));
    const before = structuredClone(fresh.quotes.get(saved.quoteId));
    const read = await fresh.executeCommand({ action: "read", readScope: "current-chat", reporting: { stage: "total", decimals: 0 } });
    expect(read.body).toContain("USD 4033"); expect(read.body).toContain("USD 4,033.26");
    expect(fresh.quotes.get(saved.quoteId)).toEqual(before); expect(read).not.toHaveProperty("record");
  });
  it("an unavailable line report cannot invalidate the exact source baseline or comparison", async () => {
    const source = { ...result(["10", "10"]), sourceClass: "official-tariff" as const, applicability: { status: "conditional-retained-rule" as const, currentTariffVerified: false as const, message: "Source-total invoice adjustment included." } };
    const lookup = vi.spyOn(tariffModule, "lookupTariff").mockResolvedValue(source);
    try {
      const session = new QuoteSession("unallocated-report"), authority = new AuthoritySession(); session.bindAuthority(authority); await session.initialize([]);
      const a = await session.executeCommand({ action: "create", pricing: "official", call: { port: "First source" }, services: ["berth"] });
      const b = await session.executeCommand({ action: "create", pricing: "official", call: { port: "Second source" }, services: ["berth"] });
      if (!("quoteId" in a) || !("quoteId" in b)) throw Error("missing source quotes");
      const before = structuredClone([...session.quotes.values()]);
      const report = await session.executeCommand({ action: "read", readScope: "current-chat", quoteId: a.quoteId, reporting: { stage: "line", decimals: 2 } });
      expect(report.body).toContain("Requested report unavailable"); expect(authority.hasPending()).toBe(false);
      expect([...session.quotes.values()]).toEqual(before); expect(session.quotes.get(a.quoteId)?.baseline?.totals?.[0].amount).toBe("20.01");
      expect((await session.compare({ quoteIds: [a.quoteId, b.quoteId] })).status).toBe("calculated");
    } finally { lookup.mockRestore(); }
  });
});

describe("dated explanations and input guidance", () => {
  it.each([
    ["JSW Jaigarh", "port-dues", "2026-04-17"],
    ["BPCL Liquid Cargo Jetty", "water", "2026-04-17"],
    ["JSW JNPT Liquid Terminal", "handling", "2025-11-17"],
    ["Finolex", "berth", "2023-08-17"],
    ["JNPA", "berth", "2026-04-17"],
  ])("checks a supplied historical date for %s without requesting vessel quantities", async (port, charge, callDate) => {
    const explained = await lookupTariff({ port, charges: [charge], callDate }, "rule");
    expect(explained.status).toBe("explained"); expect(explained.questions).toEqual([]);
    expect(explained.limitations?.join(" ")).toMatch(/does not (?:cover|establish)|not.*requested/i);
    expect(explained.totals).toBeUndefined();
    const undated = await lookupTariff({ port, charges: [charge] }, "rule");
    expect(undated.questions).toEqual([]); expect(undated.limitations?.join(" ") ?? "").not.toMatch(/provide.*(?:date|tonnage)/i);
  });
  it("returns tool-backed next inputs without creating a quote or inventing unknown conditions", async () => {
    const session = new QuoteSession("requirements"); await session.initialize([]);
    const answer = await session.requirements(undefined, { port: "JSW Jaigarh", charges: ["port-dues"], callDate: "2026-10-20" });
    expect(answer.questions.join(" ")).toMatch(/tonnage|GRT/i);
    expect(answer).not.toHaveProperty("totals"); expect(answer).not.toHaveProperty("record");
    expect(session.quotes.size).toBe(0);
  });
  it("checks the supplied end of a bounded legacy berth-rule interval", async () => {
    const answer = await lookupTariff({ port: "BPCL Liquid Cargo Jetty", charges: ["berth"], berthStart: "2027-04-30", berthEnd: "2027-05-01" }, "rule");
    expect(answer.limitations?.join(" ")).toMatch(/does not cover.*berth end|complete berth interval/i);
    expect(answer.questions).toEqual([]);
  });
  it("keeps stored material conditions and raw unsupported scope in input guidance", async () => {
    const session = new QuoteSession("retained-requirements"); await session.initialize([]);
    const saved = await session.executeCommand({ action: "create", pricing: "official", call: { port: "JSW Jaigarh", gt: "12222", callDate: "2026-10-20", cargoCategory: "mechanized-bulk", callDays: "3" }, services: ["port-dues", "other"], terms: { unresolvedTerms: ["Special eligibility not established"], unsupportedServices: ["evening escort levy"] } });
    if (!("quoteId" in saved)) throw Error("missing retained quote");
    const before = structuredClone(session.quotes.get(saved.quoteId));
    const guidance = await session.requirements(saved.quoteId);
    expect(guidance.questions.join(" ")).toContain("Special eligibility not established"); expect(guidance.questions.join(" ")).toContain("evening escort levy");
    expect(guidance.body).not.toContain("particulars support the retained calculation"); expect(guidance).not.toHaveProperty("totals");
    expect(session.quotes.get(saved.quoteId)).toEqual(before);
  });
});

let historySequence = 0;
function history(input: object, output: unknown): ModelMessage[] {
  const toolCallId = `save-${historySequence++}`;
  return [{ role: "assistant", content: [{ type: "tool-call", toolName: "manage_quote", toolCallId, input }] }, { role: "tool", content: [{ type: "tool-result", toolName: "manage_quote", toolCallId, output: { type: "json", value: JSON.parse(JSON.stringify(output)) } }] }];
}

it("restores separate unresolved work in context and shows draft questions/subtotals on a pure read", async () => {
  const session = new QuoteSession("work-context"); session.bindAuthority(new AuthoritySession()); await session.initialize([]);
  const unknownInput = { action: "create" as const, pricing: "official" as const, call: { port: "Unlisted Terminal" }, services: ["berth" as const] };
  const unknown = await session.executeCommand(unknownInput);
  const draftInput = { action: "create" as const, pricing: "supplied" as const, lines: [{ name: "known service", currency: "USD" as const, billing: { kind: "flat" as const, price: "19", basis: "user-stated-flat" as const } }, { name: "unpriced service", currency: "USD" as const }] };
  const draft = await session.executeCommand(draftInput);
  const fresh = new QuoteSession("work-context"); fresh.bindAuthority(new AuthoritySession()); await fresh.initialize([...history(unknownInput, unknown), ...history(draftInput, draft)]);
  const context = JSON.parse(fresh.context()); expect(context.workState).toHaveLength(2);
  expect(context.workState).toEqual(expect.arrayContaining([expect.objectContaining({ pricing: "official", status: "unresolved" }), expect.objectContaining({ approval: "unapproved", pricing: "supplied" })]));
  const read = await fresh.executeCommand({ action: "read", readScope: "current-chat" });
  expect(read.body).toContain("Unapproved"); expect(read.body).toContain("USD 19.00"); expect(read.body).toContain("unpriced service");
  expect(read).not.toHaveProperty("record"); expect(read).not.toHaveProperty("draft");
});

it("removes only the matching failed arithmetic attempt after a semantic repair", async () => {
  const session = new QuoteSession("arithmetic-repair"); await session.initialize([]);
  const failed = session.error("Invalid expression", [["expression"]]);
  session.observeTools([{ toolCallId: "bad", toolName: "calculate_charges", input: { label: "fuel", expression: "round_half_up(12.345,2)" }, output: failed }]);
  session.recordAnswer("unrelated", { body: "Stores: 81", questions: [], status: "calculated" });
  session.observeTools([{ toolCallId: "other", toolName: "calculate_charges", input: { label: "other", expression: "round(12.345,2)" }, output: { result: "12.35" } }]);
  expect(session.finalText("")).toContain("Invalid expression");
  session.recordAnswer("fixed", { body: "Fuel: 12.35", questions: [], status: "calculated" });
  session.observeTools([{ toolCallId: "fixed", toolName: "calculate_charges", input: { label: "fuel", expression: "round(12.345,2)", retryOf: failed.errorId }, output: { result: "12.35" } }]);
  const answer = session.finalText(""); expect(answer).toContain("Stores: 81"); expect(answer).toContain("Fuel: 12.35"); expect(answer).not.toMatch(/Invalid expression|tool call failed/);
});

it("an independent unlabeled calculation cannot erase earlier failed calculations", async () => {
  const session = new QuoteSession("distinct-arithmetic"); await session.initialize([]);
  const a = session.error("First invalid expression", [["expression"]]), b = session.error("Second invalid expression", [["expression"]]);
  session.observeTools([{ toolCallId: "a", toolName: "calculate_charges", input: { expression: "round_half_up(12.345,2)" }, output: a }, { toolCallId: "b", toolName: "calculate_charges", input: { expression: "square(7)" }, output: b }]);
  session.observeTools([{ toolCallId: "c", toolName: "calculate_charges", input: { expression: "2+2" }, output: { result: "4" } }]);
  expect(session.finalText("")).toContain("First invalid expression"); expect(session.finalText("")).toContain("Second invalid expression");
  session.observeTools([{ toolCallId: "d", toolName: "calculate_charges", input: { expression: "7**2", retryOf: b.errorId }, output: { result: "49" } }]);
  expect(session.finalText("")).toContain("First invalid expression"); expect(session.finalText("")).not.toContain("Second invalid expression");
});

it("updates in-session work disposition after exact supplied approval", async () => {
  const session = new QuoteSession("approved-work"), authority = new AuthoritySession(); session.bindAuthority(authority); await session.initialize([]);
  await session.executeCommand({ action: "create", pricing: "supplied", lines: [{ name: "fee", currency: "USD", billing: { kind: "flat", price: "23", basis: "user-stated-flat" } }] });
  const operation = authority.pendingOperations()[0]; if (operation.kind !== "quote") throw Error("missing quote operation");
  await session.applyApprovedQuote(operation);
  expect(JSON.parse(session.context()).workState[0].approval).toBe("approved");
});

it("limits clarification gating to work requested in the current run", async () => {
  const old = new QuoteSession("question-scope"); old.bindAuthority(new AuthoritySession()); await old.initialize([]);
  const input = { action: "create" as const, pricing: "supplied" as const, lines: [{ name: "older unpriced fee" }] };
  const draft = await old.executeCommand(input); expect(old.hasCurrentInputQuestions()).toBe(true);
  const fresh = new QuoteSession("question-scope"); fresh.bindAuthority(new AuthoritySession()); await fresh.initialize(history(input, draft));
  expect(fresh.hasCurrentInputQuestions()).toBe(false);
  await fresh.executeCommand({ action: "create", pricing: "supplied", lines: [{ name: "new complete fee", currency: "USD", billing: { kind: "flat", price: "17", basis: "user-stated-flat" } }] });
  expect(fresh.hasCurrentInputQuestions()).toBe(false);
  await fresh.executeCommand({ action: "read", readScope: "current-chat" });
  expect(fresh.hasCurrentInputQuestions()).toBe(true);
});

it("retires requirements by quotation identity after an omitted supplied fact is restored", async () => {
  const session = new QuoteSession("requirements-target"), authority = new AuthoritySession(); session.bindAuthority(authority);
  await session.initialize([{ role: "user", content: "JSW Jaigarh, 18000 GT, mechanized bulk, an 8-day call on 12 November 2026. A separate supplier fee is USD 17." }]);
  const draft = await session.executeCommand({ action: "create", pricing: "official", call: { port: "JSW Jaigarh", cargoCategory: "mechanized-bulk", callDays: "8", callDate: "12 November 2026" }, services: ["port-dues"] });
  if (!("quoteId" in draft)) throw Error("missing official quote");
  const guidance = await session.requirements(draft.quoteId);
  session.recordAnswer("requirements-call", guidance); expect(session.hasCurrentInputQuestions()).toBe(true);
  session.beginStep(); const completed = await session.executeCommand({ action: "update", quoteId: draft.quoteId, call: { gt: "18000" } });
  expect(completed.status).toBe("calculated"); expect(completed.questions).toEqual([]);
  await session.executeCommand({ action: "create", pricing: "supplied", lines: [{ name: "fee", currency: "USD", billing: { kind: "flat", price: "17", basis: "user-stated-flat" } }] });
  expect(authority.hasPending()).toBe(true); expect(session.hasCurrentInputQuestions()).toBe(false);
  for (const question of guidance.questions) expect(session.finalText("")).not.toContain(question);
});

it("an explicit interval retry retires only its own resolved question", async () => {
  const session = new QuoteSession("interval-target"); await session.initialize([]);
  session.recordAnswer("a", { status: "unresolved", body: "", questions: ["Which timezone for arrival?"] });
  session.recordAnswer("b", { status: "unresolved", body: "", questions: ["Which timezone for departure?"] });
  session.observeTools([{ toolCallId: "a", toolName: "calculate_elapsed_time", input: { label: "arrival", start: "x", end: "y" }, output: { status: "needs_clarification" } }, { toolCallId: "b", toolName: "calculate_elapsed_time", input: { label: "departure", start: "x", end: "y" }, output: { status: "needs_clarification" } }]);
  session.recordAnswer("c", { status: "calculated", body: "Arrival interval: 2 hours", questions: [] });
  session.observeTools([{ toolCallId: "c", toolName: "calculate_elapsed_time", input: { label: "arrival", start: "x", end: "y", timeZone: "UTC", retryOf: "a" }, output: { status: "ok" } }]);
  expect(session.hasCurrentInputQuestions()).toBe(true); expect(session.finalText("")).not.toContain("Which timezone for arrival?"); expect(session.finalText("")).toContain("Which timezone for departure?");
  session.recordAnswer("d", { status: "calculated", body: "Departure interval: 3 hours", questions: [] });
  session.observeTools([{ toolCallId: "d", toolName: "calculate_elapsed_time", input: { label: "departure", start: "x", end: "y", timeZone: "UTC", retryOf: "b" }, output: { status: "ok" } }]);
  expect(session.hasCurrentInputQuestions()).toBe(false);
});

it("successive interval clarifications replace their predecessor without retiring unrelated work", async () => {
  const session = new QuoteSession("interval-chain"); await session.initialize([]);
  const observe = (id: string, label: string, questions: string[], retryOf?: string) => {
    session.recordAnswer(id, { status: questions.length ? "unresolved" : "calculated", body: questions.length ? "" : `${label}: resolved`, questions });
    session.observeTools([{ toolCallId: id, toolName: "calculate_elapsed_time", input: { label, start: "x", end: "y", ...(retryOf ? { retryOf } : {}) }, output: { status: questions.length ? "needs_clarification" : "ok" } }]);
  };
  observe("a", "arrival", ["Arrival timezone?"]); observe("other", "departure", ["Departure timezone?"]);
  observe("b", "arrival", ["Arrival date order?"], "a");
  expect(session.finalText("")).not.toContain("Arrival timezone?"); expect(session.finalText("")).toContain("Arrival date order?");
  observe("c", "arrival", [], "b");
  expect(session.finalText("")).not.toMatch(/Arrival timezone\?|Arrival date order\?/);
  expect(session.finalText("")).toContain("Departure timezone?"); expect(session.hasCurrentInputQuestions()).toBe(true);
  observe("d", "departure", [], "other"); expect(session.hasCurrentInputQuestions()).toBe(false);
});
