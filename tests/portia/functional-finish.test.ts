import { expect, it } from "vitest";
import { MockLanguageModelV4 } from "../helpers/portia-protocol-model";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";
import { QuoteSession } from "../../src/lib/portia/session";
import { lookupTariff, resolveTariffPort } from "../../src/lib/portia/tariffs";
import { PORT_ALIASES } from "../../src/lib/migration/port-identity";
import { SUPPORTED_PORTS } from "../../src/lib/migration/ports";
import Decimal from "decimal.js";

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } };
const generated = (content: LanguageModelV4GenerateResult["content"], finish: "stop" | "tool-calls" = "tool-calls"): LanguageModelV4GenerateResult => ({ content, finishReason: { unified: finish, raw: undefined }, usage, warnings: [] });
const call = (toolName: string, input: unknown, toolCallId = toolName) => ({ type: "tool-call" as const, toolCallId, toolName, input: JSON.stringify(toolName === "manage_quote" ? { action: "create", ...input as object } : input) });
const done = generated([{ type: "text", text: "Done, your estimate is complete: USD 999999." }], "stop");
const nsft = { port: "NSFT", charges: ["handling"], callDate: "12 November 2026", service: "foreign", containerSize: "20", ladenContainers: "120", emptyContainers: "80", cargoTraffic: "exim", specialCargo: false, handlingMode: "road" };
const rule = call("port_information", { mode: "rule", request: { port: "NSFT", charges: ["handling"] } });
async function run(prompt: string, sequence: LanguageModelV4GenerateResult[]) {
  const session = new QuoteSession("functional"), model = new MockLanguageModelV4({ doGenerate: sequence });
  const result = await createMigrationMainAgent({ alias: "model-1", mainModel: model, session }).generate({ prompt });
  return { session, model, result, text: await session.answer(result.text) };
}

it.each(SUPPORTED_PORTS)("resolves catalog aliases for %s", port => {
  for (const alias of [port, ...PORT_ALIASES[port]]) expect(resolveTariffPort(alias)).toBe(port);
});
it.each(["rule", "quote"] as const)("rejects Mumbai/GTI conflicts before any %s rates", async mode => {
  const r = await lookupTariff({ port: "Mumbai", terminal: "Gateway Terminals India (GTI)", charges: ["berth"], service: "foreign", gt: "28600", durationHours: "14", callDate: "12 November 2026" }, mode);
  expect(r.status).toBe("unresolved"); expect(r.questions.join(" ")).toMatch(/conflict/i);
  expect(r.sources).toBeUndefined(); expect(r.totals).toBeUndefined(); expect(r.body).not.toMatch(/0\.0137|Indira|Ballard/);
});
it("accepts the JNPA/GTI hierarchy and rejects unrelated terminal/operator neighbours", async () => {
  const q = { port: "JNPA", terminal: "Gateway Terminals India (GTI)", charges: ["berth"], service: "foreign", gt: "28600", durationHours: "14", callDate: "12 November 2026" };
  const r = await lookupTariff(q); expect(new Decimal(r.totals![0].amount).eq("2122.12")).toBe(true); expect(r.body).toContain("GTI general note");
  for (const extra of [{ operator: "Angre" }, { terminal: "Indira Dock" }, { operator: "JSW JNPT Liquid Terminal" }]) {
    const bad = await lookupTariff({ ...q, port: "GTI", ...extra }, "rule");
    expect(bad.status).toBe("unresolved"); expect(bad.sources).toBeUndefined();
  }
});
it("recognises JSW Jaigarh legal identity without conflating JSW JNPT or Angre", async () => {
  const q = { port: "JSW Jaigarh Port Limited", charges: ["port-dues"], callDate: "12 November 2026", cargoCategory: "mechanized-bulk", gt: "5000", callDays: "30" };
  expect((await lookupTariff(q)).totals?.[0].amount).toBe("2000");
  for (const operator of ["Angre", "JSW JNPT Liquid Terminal"]) expect((await lookupTariff({ ...q, operator })).totals).toBeUndefined();
});
it("NSFT rule then finish explicitly remains an incomplete calculation", async () => {
  const r = await run("Calculate NSFT road bundle for 120 laden and 80 empty normal EXIM 20ft boxes, before tax.", [generated([rule]), done]);
  expect(r.text).toContain("No quotation has been calculated"); expect(r.text).toContain("Rules only");
  expect(r.text).not.toMatch(/999999|estimate is complete/); expect(r.session.quotes.size).toBe(0);
  expect(JSON.stringify(r.model.doGenerateCalls[1].prompt)).toContain("calculation request still needs official_quote or supplied_quote");
});
it("NSFT rule then quotation produces and reloads the calculated amount", async () => {
  const { charges, ...particulars } = nsft;
  const r = await run("Calculate the NSFT road bundle", [generated([rule]), generated([call("manage_quote", { pricing: "official", services: charges, call: particulars })]), done]);
  expect(r.text).toContain("USD 17,967.20"); expect(r.text).not.toContain("No quotation has been calculated");
  expect(r.session.quotes.size).toBe(1);
  const reload = new QuoteSession("functional"); await reload.initialize(r.result.steps.flatMap(step => step.response.messages));
  expect([...reload.quotes.values()]).toEqual([...r.session.quotes.values()]);
  expect(new Decimal((await reload.calculate([...reload.quotes.values()][0])).totals![0].amount).eq("17967.20")).toBe(true);
});
it("GTI saved quote converts original duration without asking again", async () => {
  const s = new QuoteSession("gti"); await s.initialize([]);
  const r = await s.update({ pricing: "official", services: ["berth"], call: { port: "GTI", gt: "28600", occupancy: { hours: "14" }, service: "foreign", callDate: "12 November 2026" } });
  expect(r.questions).toEqual([]); expect(r.body).toContain("USD 2,122.12");
});
it("out-of-period source coverage is a limitation, not user intake", async () => {
  const r = await lookupTariff({ port: "GTI", charges: ["berth"], callDate: "1 May 2027", gt: "18400", durationHours: "8", service: "foreign" });
  expect(r.status).toBe("unresolved"); expect(r.questions).toEqual([]); expect(r.limitations?.join(" ")).toContain("2027-04-30"); expect(r.totals).toBeUndefined();
});
it("mixed asynchronous quotation and labelled arithmetic preserve dispatch order", async () => {
  const r = await run("Show First quote and two independent calculations", [generated([
    call("manage_quote", { name: "First quote", pricing: "supplied", lines: [{ name: "Berth", currency: "USD", billing: { kind: "flat", price: "41", basis: "user-stated-flat" } }], terms: { taxPercent: "0" } }),
    call("calculate_charges", { label: "A", expression: "7*13" }, "A"),
    call("calculate_charges", { label: "B", expression: "19*23" }, "B"),
  ]), done]);
  expect(r.result.steps[0].toolResults.find(result => result.toolName === "supplied_quote")?.output).toMatchObject({ approvalRequired: true });
  expect(r.text.indexOf("First quote")).toBeLessThan(r.text.indexOf("A: `7*13`"));
  expect(r.text).toContain("A: `7*13` = **91**"); expect(r.text).toContain("B: `19*23` = **437**");
});
it("genuine rule-only request needs no quotation or vessel intake", async () => {
  const r = await run("Explain the NSFT road handling rule only; no quotation.", [generated([rule]), done]);
  expect(r.text).toContain("Rules only"); expect(r.text).not.toContain("Details still needed"); expect(r.session.quotes.size).toBe(0);
});
it("JNPA preliminary GST source gap cannot become GST intake for a pre-tax quote", async () => {
  const r = await run("Calculate JNPA pilotage-cum-towage before tax for 10000GT, two ordinary foreign movements on 12 November 2026", [
    generated([call("port_information", { mode: "rule", request: { port: "JNPA", charges: ["pilotage", "towage", "gst"] } })]),
    generated([call("manage_quote", { pricing: "official", services: ["pilotage"], call: { port: "JNPA", gt: "10000", movements: "2", service: "foreign", callDate: "12 November 2026" } })]), done]);
  expect(r.text).toContain("USD 3,464.00"); expect(r.text).not.toContain("Details still needed"); expect(r.text).toContain("Source limitations");
});
it("tax-inclusive quote retains necessary tax questions", async () => {
  const r = await lookupTariff({ port: "Mumbai", terminal: "Indira Dock", charges: ["berth", "gst"], service: "coastal", gt: "8000" });
  expect(r.status).toBe("unresolved"); expect(r.questions.join(" ")).toMatch(/supplier|SEZ|registered/i);
});
it("preserves two explanations, arithmetic and elapsed results in tool order", async () => {
  const r = await run("Explain NSFT and GTI rules, compute 11+12 and 20*3, and the two elapsed intervals.", [generated([
    rule, call("port_information", { mode: "rule", request: { port: "GTI", charges: ["berth"] } }, "rule-2"),
    call("calculate_charges", { expression: "11+12" }, "math-1"), call("calculate_charges", { expression: "20*3" }, "math-2"),
    call("calculate_elapsed_time", { start: "12 November 2026 08:00 IST", end: "12 November 2026 10:00 IST" }, "time-1"),
    call("calculate_elapsed_time", { start: "12 November 2026 11:00 IST", end: "12 November 2026 14:00 IST" }, "time-2"),
  ]), done]);
  for (const text of ["94.78", "0.0053", "`11+12` = **23**", "`20*3` = **60**", "**2 hours**", "**3 hours**"]) expect(r.text).toContain(text);
  expect(r.text.indexOf("94.78")).toBeLessThan(r.text.indexOf("0.0053"));
});
it("comparison preserves unrelated outputs and repeated same-quote revisions show only the latest", async () => {
  const s = new QuoteSession("compound"); await s.initialize([{ role: "user", content: "Compare Alpha USD 100 and Beta USD 110." }]);
  s.recordAnswer("info", { body: "Independent explanation", questions: [] });
  const a = await s.update({ name: "Alpha", pricing: "supplied", lines: [{ name: "Berth", amount: "100", currency: "USD" }], terms: { taxPercent: "0" } });
  const b = await s.update({ name: "Beta", pricing: "supplied", lines: [{ name: "Berth", amount: "110", currency: "USD" }], terms: { taxPercent: "0" } });
  if (!("quoteId" in a) || !("quoteId" in b)) throw Error("missing quotes");
  await s.compare({ quoteIds: [a.quoteId, b.quoteId], currency: "USD" });
  expect(s.finalText("")).toContain("Independent explanation"); expect(s.finalText("")).toContain("Saved quotation comparison");
  s.beginStep(); await s.update({ quoteId: a.quoteId, lines: [{ name: "Berth", amount: "105" }] });
  const text = s.finalText(""); expect(text).toContain("105.00"); expect(text).not.toContain("Saved quotation comparison");
  expect((text.match(/\*\*Alpha/g) ?? [])).toHaveLength(1);
});
