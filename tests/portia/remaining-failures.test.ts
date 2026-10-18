import { expect, it } from "vitest";
import { QuoteSession } from "../../src/lib/portia/session";
import { lookupTariff } from "../../src/lib/portia/tariffs";
import type { ModelMessage } from "ai";
import { supportsVesselCategory } from "../../src/lib/portia/category-evidence";

const saved = (value: unknown): ModelMessage => ({ role: "tool", content: [{ type: "tool-result", toolName: "manage_quote", toolCallId: "saved", output: { type: "json", value: JSON.parse(JSON.stringify(value)) } }] });
it.each(["Mumbai Indira Dock", "Mumbai, Indira Dock", "Indira Dock, Mumbai", "Mumbai Port Authority — Indira Dock"])("recognises a combined booked berth %s for rules and quotes", async port => {
  const rule = await lookupTariff({ port, terminal: port, charges: ["berth"], service: "coastal" }, "rule");
  expect(rule.status).toBe("explained"); expect(rule.body).toContain("0.2165"); expect(rule.questions).toEqual([]);
  const quote = await lookupTariff({ port, terminal: port, charges: ["berth", "gst"], service: "coastal", gt: "8000" });
  expect(quote.questions.join(" ")).toMatch(/supplier|GST|SEZ/i); expect(quote.body).not.toContain("No exact supported");
});
it("rejects clipped, negated and competing category evidence", () => {
  expect(supportsVesselCategory("tanker", "tanker", "Our vessel is not a tanker.")).toBe(false);
  expect(supportsVesselCategory("tanker", "Our vessel is not a tanker", "Our vessel is not a tanker.")).toBe(false);
  expect(supportsVesselCategory("tanker", "Another vessel is a tanker", "Another vessel is a tanker.")).toBe(false);
  expect(supportsVesselCategory("tanker", "The tanker and general-cargo ship arrived", "The tanker and general-cargo ship arrived.")).toBe(false);
  expect(supportsVesselCategory("general-cargo", "Our vessel is general-cargo", "Our vessel is general-cargo.")).toBe(true);
  expect(supportsVesselCategory("container", "Our vessel needs container handling", "Our vessel needs container handling.")).toBe(false);
  expect(supportsVesselCategory("tanker", "MV Blue is a tanker", "MV Amber has unspecified category. MV Blue is a tanker.", "MV Amber")).toBe(false);
  expect(supportsVesselCategory("tanker", "MV Bluebird is a tanker", "MV Bluebird is a tanker.", "MV Blue")).toBe(false);
  expect(supportsVesselCategory("general-cargo", "MV Blue loaded general cargo", "MV Blue loaded general cargo.", "MV Blue")).toBe(false);
});
it("retains the explicit unnamed vessel classification in the frozen tax-intake neighbor", () => {
  const clause = "Using the retained May 2026 Mumbai Indira Dock rules, estimate berth hire including GST for a fictional ordinary Indian-flag general-cargo ship, 8000 GT, on a dedicated coastal service with a valid coastal licence throughout";
  expect(supportsVesselCategory("general-cargo", clause, clause + ".")).toBe(true);
  expect(supportsVesselCategory("general-cargo", "The rule is for a general-cargo ship", "The rule is for a general-cargo ship.")).toBe(false);
});
it("does not turn quoted cargo text into a stable quotation label", async () => {
  const s = new QuoteSession("quoted-cargo"); await s.initialize([{ role: "user", content: "The cargo description is called '23 laden'. Total berth hire USD 20, no tax." }]);
  await s.update({ name: "23 laden", pricing: "supplied", lines: [{ name: "Berth", amount: "20", currency: "USD" }] });
  expect([...s.quotes.values()][0].name).toBe("Quotation 1");
});
it("keeps unknown compound identities unresolved and explicit berth conflicts closed", async () => {
  for (const port of ["Mumbai unknown dock", "Mumbai Container Terminal"]) {
    const result = await lookupTariff({ port, charges: ["berth"], service: "coastal" }, "rule");
    expect(result.status).toBe("unresolved"); expect(result.body).not.toContain("0.2165");
  }
  const result = await lookupTariff({ port: "Mumbai Indira Dock", terminal: "Victoria Dock", charges: ["berth"] });
  expect(result.questions.join(" ")).toContain("conflict");
});
it.each([
  { port: "Mumbai Indira Dock", terminal: "Mumbai Cruise Terminal" },
  { port: "Mumbai Indira Dock", terminal: "ICTPL" },
  { port: "Mumbai", terminal: "Indira Dock", operator: "ICTPL" },
])("does not replace an explicit berth with an unproven parent-port child: %j", async identity => {
  const result = await lookupTariff({ ...identity, charges: ["berth"] }, "rule");
  expect(result.status).toBe("unresolved"); expect(result.questions.join(" ")).toMatch(/conflict|unverified/i); expect(result.sources).toBeUndefined();
});
it("keeps combined-berth conflicts closed and equivalent GTI labels unambiguous", async () => {
  const bad = await lookupTariff({ port: "Mumbai Indira Dock", terminal: "GTI", charges: ["berth"] }, "rule");
  expect(bad.status).toBe("unresolved"); expect(bad.questions.join(" ")).toMatch(/conflict/i); expect(bad.sources).toBeUndefined();
  const good = await lookupTariff({ port: "GTI, Gateway Terminals India", charges: ["berth"], gt: "18400", durationMinutes: "430", callDate: "18 November 2026", service: "foreign" });
  expect(good.body).toContain("USD 780.16");
});
it("never makes a generated quantity summary the persistent current quote label", async () => {
  const prompt = "Calculate the NSFT road bundle for 23 laden and 7 empty normal 20-foot foreign EXIM containers on 18 November 2026. No special cargo, no tax.";
  const s = new QuoteSession("labels"); await s.initialize([{ role: "user", content: prompt }]);
  const first = await s.update({ name: "NSFT road bundle — 23 laden normal 20-foot foreign EXIM containers", pricing: "official", services: ["handling"], call: { port: "NSFT", service: "foreign", cargoTraffic: "exim", containerSize: "20", ladenContainers: "23", emptyContainers: "7", handlingMode: "road", specialCargo: false, callDate: "18 November 2026" } });
  const id = [...s.quotes.keys()][0]; s.beginStep();
  const final = await s.update({ quoteId: id, call: { ladenContainers: "24" } });
  expect(final.body).toContain("USD 2,851.66"); expect(s.quotes.get(id)?.name).not.toContain("23");
  expect(final.body.split("\n")[0]).not.toContain("23");
  const reload = new QuoteSession("labels"); await reload.initialize([{ role: "user", content: prompt }, saved(first), saved(final)]);
  expect(reload.quotes.get(id)?.name).toBe(s.quotes.get(id)?.name);
});
it("preserves explicit quotation labels and relevant supplied quantities without importing a separate rule's tariff facts", async () => {
  const prompt = "Create supplied quotations Amber USD 950 and Blue EUR 900, flat berth-hire, no tax. Separately explain the Mumbai Indira Dock coastal rule.";
  const s = new QuoteSession("scope"); await s.initialize([{ role: "user", content: prompt }]);
  const result = await s.update({ name: "Amber", pricing: "supplied", call: { port: "Mumbai Indira Dock", terminal: "Mumbai Indira Dock", service: "coastal", gt: "7000" }, lines: [{ name: "Berth hire", amount: "950", currency: "USD" }], terms: { taxPercent: "0" } });
  const q = [...s.quotes.values()][0]; expect(q.name).toBe("Amber"); expect(q.call).not.toHaveProperty("port"); expect(q.call).not.toHaveProperty("terminal"); expect(q.call).not.toHaveProperty("service");
  expect(q.call.gt).toBe("7000"); expect(result.body).toContain("USD 950.00");
});
it("does not persist an inferred vessel category for an untyped Jaigarh vessel", async () => {
  const s = new QuoteSession("category"); await s.initialize([{ role: "user", content: "JSW Jaigarh Port Limited, J-1 mechanized-bulk. A fictional 8000 GT vessel, 17 days from 18 November 2026. Port dues only." }]);
  const result = await s.update({ pricing: "official", call: { port: "Jaigarh", operator: "JSW Jaigarh Port Limited", vesselCategory: "general-cargo", cargoCategory: "mechanized-bulk", gt: "8000", callDays: "17", callDate: "18 November 2026" }, services: ["port-dues"] });
  expect(result.body).toContain("USD 2,640.00"); expect([...s.quotes.values()][0].call.vesselCategory).toBeUndefined();
});
it("retains an actually supplied category across an unrelated correction", async () => {
  const s = new QuoteSession("category-explicit"); await s.initialize([{ role: "user", content: "Our tanker at JSW Jaigarh Port Limited, J-1 mechanized-bulk, is 8000 GT.17 days from 18 November 2026. Port dues only." }]);
  const first = await s.update({ pricing: "official", vesselCategoryEvidence: "Our tanker at JSW Jaigarh Port Limited, J-1 mechanized-bulk, is 8000 GT", call: { port: "Jaigarh", operator: "JSW Jaigarh Port Limited", vesselCategory: "tanker", cargoCategory: "mechanized-bulk", gt: "8000", callDays: "17", callDate: "18 November 2026" }, services: ["port-dues"] });
  const id = [...s.quotes.keys()][0], next = new QuoteSession("category-explicit");
  await next.initialize([{ role: "user", content: "Our tanker at JSW Jaigarh Port Limited, J-1 mechanized-bulk, is 8000 GT." }, saved(first), { role: "user", content: "Change only GT to 9000." }]);
  await next.update({ quoteId: id, call: { gt: "9000" } }); expect(next.quotes.get(id)?.call.vesselCategory).toBe("tanker");
});
it("associates a category correction with the saved user label among two quotes", async () => {
  const s = new QuoteSession("named-category"); await s.initialize([{ role: "user", content: "Create quotation named Alpha and quotation named Beta for JSW Jaigarh port dues." }]);
  const a = await s.update({ name: "Alpha", pricing: "official", call: { port: "Jaigarh", operator: "JSW Jaigarh Port Limited", cargoCategory: "mechanized-bulk", gt: "8000", callDays: "17", callDate: "18 November 2026" }, services: ["port-dues"] });
  const b = await s.update({ name: "Beta", pricing: "official", call: { port: "Jaigarh", operator: "JSW Jaigarh Port Limited", cargoCategory: "mechanized-bulk", gt: "9000", callDays: "17", callDate: "18 November 2026" }, services: ["port-dues"] });
  const next = new QuoteSession("named-category"); await next.initialize([saved(a), saved(b), { role: "user", content: "Alpha is a tanker." }]);
  const alpha = [...next.quotes.values()].find(q => q.name === "Alpha")!;
  await next.update({ quoteId: alpha.id, call: { vesselCategory: "tanker" }, vesselCategoryEvidence: "Alpha is a tanker." });
  expect(next.quotes.get(alpha.id)?.call.vesselCategory).toBe("tanker");
  expect([...next.quotes.values()].find(q => q.name === "Beta")?.call.vesselCategory).toBeUndefined();
});
it("accepts an exact category reply only for one saved quote awaiting that field", async () => {
  const s = new QuoteSession("pending-category"); await s.initialize([{ role: "user", content: "Estimate Mumbai Indira Dock coastal berth hire." }]);
  const first = await s.update({ pricing: "official", call: { port: "Mumbai", terminal: "Indira Dock", service: "coastal" }, services: ["berth"] });
  const next = new QuoteSession("pending-category"); await next.initialize([saved(first), { role: "user", content: "general-cargo" }]);
  const id = [...next.quotes.keys()][0]; await next.update({ quoteId: id, call: { vesselCategory: "general-cargo" }, vesselCategoryEvidence: "general-cargo" });
  expect(next.quotes.get(id)?.call.vesselCategory).toBe("general-cargo");
  expect(supportsVesselCategory("general-cargo", "general-cargo", "general-cargo")).toBe(false);
});

it("retains the actual frozen JNPA tanker phrase using its full human clause", () => {
 const request = "Please put a number on the ordinary pilotage including routine towage for a fictional 12,500 GT foreign-going tanker discharging at Jawaharlal Nehru Port Authority on 18 November 2026.";
 expect(supportsVesselCategory("tanker", "fictional 12,500 GT foreign-going tanker discharging at Jawaharlal Nehru Port Authority on 18 November 2026.", request)).toBe(true);
 expect(supportsVesselCategory("tanker", "tanker", "Explain the rule for a tanker. Quote an untyped Jaigarh vessel.")).toBe(false);
});
