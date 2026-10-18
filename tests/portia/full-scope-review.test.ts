import { expect, it } from "vitest";
import { QuoteSession } from "../../src/lib/portia/session";
import { lookupTariff } from "../../src/lib/portia/tariffs";
import { quoteInputSchema, quoteToolInputSchema } from "../../src/lib/portia/quotes";
import { supportsVesselCategory } from "../../src/lib/portia/category-evidence";
import type { ModelMessage } from "ai";

it("preserves human comparison labels attached to GRT, without using a quantity summary as a label", async () => {
  const session = new QuoteSession("human-labels");
  await session.initialize([{ role: "user", content: "Compare two BMCT calls: Amber is 10000 GRT; Blue is 20000 GRT." }]);
  const result = await session.update({ name: "Amber", pricing: "official", services: ["berth"], call: { port: "BMCT", gt: "10000", callDate: "18 October 2026", service: "foreign", occupancy: { hours: "1" } } });
  expect("record" in result && result.record?.quote.name).toBe("Amber");
  const bad = await session.update({ name: "10000 GRT", pricing: "supplied", lines: [{ name: "fee", currency: "USD", amount: "1" }] });
  expect("record" in bad && bad.record?.quote.name).toBe("Quotation 2");
});

it("preserves every name in an explicit quotation-name list", async () => {
  const session = new QuoteSession("listed-labels");
  await session.initialize([{ role: "user", content: "Compare two quotations named BMCT-call and NSIGT-call for 18 October 2026." }]);
  for (const name of ["BMCT-call", "NSIGT-call"]) {
    const result = await session.update({ name, pricing: "supplied", lines: [{ name: "fee", currency: "INR", amount: "1" }] });
    expect("record" in result && result.record?.quote.name).toBe(name);
  }
});

it("compares equivalent normal road handling across BMCT and NSIGT", async () => {
  const session = new QuoteSession("same-handling"); await session.initialize([]);
  const ids: string[] = [];
  for (const port of ["BMCT", "NSIGT"]) {
    session.beginStep();
    const result = await session.update({ pricing: "official", services: ["handling"], call: { port, callDate: "18 October 2026", service: "foreign", cargoTraffic: "exim", containerSize: "20", ladenContainers: "2", emptyContainers: "1", handlingMode: "road", specialCargo: false } });
    expect(result.status).toBe("calculated"); if ("quoteId" in result) ids.push(result.quoteId);
  }
  const result = await session.compare({ quoteIds: ids, currency: "INR" });
  expect(result.status).toBe("calculated");
  expect("difference" in result && result.difference).toBe("5203.13");
});

it("does not compare included-tug dock pilotage with a stream-only pilotage quote", async () => {
  const session = new QuoteSession("unlike-pilotage"); await session.initialize([{ role: "user", content: "DocksShip is a general-cargo vessel. StreamShip is a general-cargo vessel." }]);
  const ids: string[] = [];
  for (const pilotageArea of ["docks", "streamWithoutTugs"] as const) {
    session.beginStep();
    const vesselName = pilotageArea === "docks" ? "DocksShip" : "StreamShip";
    const result = await session.update({ pricing: "official", services: ["pilotage"], vesselCategoryEvidence: `${vesselName} is a general-cargo vessel.`, call: { vesselName, port: "Mumbai", callDate: "18 October 2026", service: "foreign", gt: "10000", movements: "2", selfPropelled: true, vesselCategory: "general-cargo", pilotageArea } });
    expect(result.status).toBe("calculated"); if ("quoteId" in result) ids.push(result.quoteId);
    if (pilotageArea === "streamWithoutTugs") expect(result.body).toMatch(/excludes tugs|without tugs/i);
  }
  const result = await session.compare({ quoteIds: ids, currency: "USD" });
  expect(result.status).toBe("error"); expect(result.body).toMatch(/different services/i);
  expect(await session.answer("Done")).toMatch(/different services/);
});

it("honours GTI's exact 00:01 commencement, and asks only when that event time is missing", async () => {
  const input = { port: "GTI", charges: ["handling"], cargoTraffic: "exim", containerSize: "20", ladenContainers: "1", emptyContainers: "0", handlingMode: "ship-yard", specialCargo: false, portCrane: true };
  for (const callDate of ["1 May 2026 00:01 IST", "1 May 2026 10:00 IST", "30 April 2026 18:31 UTC"]) {
    const result = await lookupTariff({ ...input, callDate });
    expect(result.status, result.body).toBe("calculated"); expect(result.totals?.[0].amount).toBe("3943.04");
  }
  expect((await lookupTariff({ ...input, callDate: "1 May 2026 00:00 IST" })).status).toBe("unresolved");
  const missing = await lookupTariff({ ...input, callDate: "1 May 2026" });
  expect(missing.status).toBe("unresolved"); expect(missing.questions.join(" ")).toMatch(/time/i);
});

it("rejects explanatory call-date annotations as tool arguments before persisting them", () => {
  const input = { pricing: "official", services: ["pilotage"], call: { port: "JNPA", callDate: "30 April 2026; arrival/inward movement" } };
  expect(quoteToolInputSchema.safeParse(input).success).toBe(false);
  expect(quoteToolInputSchema.safeParse({ ...input, call: { ...input.call, callDate: "30 April 2026" } }).success).toBe(true);
  expect(quoteInputSchema.safeParse(input).success).toBe(true); // Existing receipts remain recoverable for correction.
});

it("uses canonical charge families on the model wire while preserving older receipt aliases", () => {
  const input = { pricing: "official", services: ["container handling", "rail", "matching landside once"], call: { port: "NSFT", handlingMode: "rail" } };
  expect(quoteToolInputSchema.safeParse(input).success).toBe(false);
  expect(quoteToolInputSchema.safeParse({ ...input, services: ["handling"] }).success).toBe(true);
  expect(quoteInputSchema.safeParse(input).success).toBe(true);
});

it("normalizes the ordinary cargo-wharfage label without losing BPCL's requested cargo component", async () => {
  const result = await lookupTariff({ port: "BPCL Liquid Cargo Jetty", callDate: "18 October 2026", charges: ["cargo wharfage", "water"], cargoName: "LPG", cargoTonnes: "1000", cargoTraffic: "coastal", cargoDirection: "import", service: "coastal", coastalLicence: true, serviceQuantities: [{ service: "water", quantity: "100", unit: "MT" }] });
  expect(result.status).toBe("calculated"); expect(result.totals?.[0].amount).toBe("245692");
});

it("accepts a concrete quantified vessel classification without requiring the words for a", () => {
  const request = "Mumbai Port, docks movement area, 18 October 2026: 40000 GRT foreign-going general-cargo vessel under its own power, one inward and one outward movement. Price only ordinary pilotage.";
  expect(supportsVesselCategory("general-cargo", "general-cargo vessel", request)).toBe(true);
  expect(supportsVesselCategory("general-cargo", "general-cargo vessel", "Explain the rule for a 40000 GRT general-cargo vessel.")).toBe(false);
  expect(supportsVesselCategory("general-cargo", "general-cargo vessel", "Another 40000 GRT general-cargo vessel is elsewhere.")).toBe(false);
  expect(supportsVesselCategory("general-cargo", "general-cargo vessel", "My vessel type is unknown. The tariff example uses a 40000 GRT general-cargo vessel.")).toBe(false);
  expect(supportsVesselCategory("general-cargo", "general-cargo vessel", "The guide's example is a 40000 GRT general-cargo vessel; calculate my call")).toBe(false);
});

it("accepts directly stated category-before-tonnage and a category shared by explicitly named calls", () => {
  const one = "Mumbai docks: ordinary foreign general-cargo vessel 10000 GRT under own power, one inward and outward movement on 18 October 2026.";
  expect(supportsVesselCategory("general-cargo", "general-cargo vessel", one)).toBe(true);
  const both = "Compare quotations named Dock-call and Stream-call, both at Mumbai on 18 October 2026. Each is for a 10000 GRT foreign-going general-cargo vessel moving under its own power, one inward and one outward movement.";
  for (const name of ["Dock-call", "Stream-call"]) expect(supportsVesselCategory("general-cargo", "general-cargo vessel", both, name, false)).toBe(true);
  expect(supportsVesselCategory("general-cargo", "general-cargo vessel", "My vessel type is unknown. The guide has examples named Dock-call and Stream-call. Each is for a 10000 GRT general-cargo vessel.", "Dock-call", false)).toBe(false);
  expect(supportsVesselCategory("tanker", "tanker", "JSW JNPT Liquid Terminal ordinary foreign tanker, 16800 GT, discharging, 30-hour berth occupancy beginning 18 October 2026.")).toBe(true);
  expect(supportsVesselCategory("tanker", "tanker", "My vessel type is unknown. The guide's example is an ordinary foreign tanker, 16800 GT.")).toBe(false);
});

it.each([
  "Compare BMCT calls using my supplied USD/INR 80 dated 18 October 2026.",
  "SBI TT selling is unconfirmed; use my rate of 80.",
  "KLL requires SBI TT selling, but my supplied INR/USD 80 is only a generic planning rate.",
])("does not invent an SBI rate source from a generic or unconfirmed rate: %s", async request => {
  const session = new QuoteSession("fx-source");
  await session.initialize([{ role: "user", content: request }]);
  const result = await session.update({ pricing: "official", services: ["berth"], call: { port: "BMCT", gt: "10000", callDate: "18 October 2026", service: "foreign", occupancy: { hours: "1" }, fxBasis: "SBI-TT-selling", fxInrPerUsd: "80", fxDate: "18 October 2026" } });
  expect(result.status).toBe("error"); expect(session.quotes.size).toBe(0);
  expect(result.body).toMatch(/SBI|bank|source/i);
});

it("retains confirmed SBI provenance for a numeric correction but blocks replacing it with a generic planning rate", async () => {
  const human: ModelMessage = { role: "user", content: "Use supplied SBI TT selling INR100/USD dated 29 October 2026." };
  const session = new QuoteSession("fx-correction"); await session.initialize([human]);
  const first = await session.update({ pricing: "official", services: ["berth", "pilotage"], call: { port: "Konkan LNG", gt: "10000", callDate: "30 October 2026", scheduledBerthingDate: "30 October 2026", occupancy: { hours: "24" }, fxBasis: "SBI-TT-selling", fxInrPerUsd: "100", fxDate: "29 October 2026" } });
  expect(first.status).toBe("calculated"); if (!("record" in first) || !first.record) throw new Error("Expected saved source-backed quote");
  const saved: ModelMessage = { role: "tool", content: [{ type: "tool-result", toolName: "manage_quote", toolCallId: "saved-fx", output: { type: "json", value: JSON.parse(JSON.stringify(first)) } }] };
  for (const [content, rate, expected] of [["Correct only the rate to 101; keep its source and date.", "101", "calculated"], ["Replace that exchange rate with my generic planning rate of 80.", "80", "error"]]) {
    const reloaded = new QuoteSession("fx-correction"); await reloaded.initialize([human, saved, { role: "user", content }]);
    const result = await reloaded.update({ quoteId: first.quoteId, call: { fxInrPerUsd: rate } });
    expect(result.status).toBe(expected);
  }
});

it("does not persist inferred ICD eligibility from an ordinary NSFT rail bundle", async () => {
  for (const [content, expected] of [["NSFT normal foreign EXIM rail bundle.", "error"], ["NSFT normal foreign EXIM rail bundle on an actual ICD movement.", "calculated"]]) {
    const session = new QuoteSession("icd-evidence"); await session.initialize([{ role: "user", content }]);
    const result = await session.update({ pricing: "official", services: ["handling"], call: { port: "NSFT", callDate: "18 October 2026", containerSize: "40", ladenContainers: "2", emptyContainers: "1", cargoTraffic: "exim", handlingMode: "rail", specialCargo: false, icdRail: true } });
    expect(result.status).toBe(expected);
    if (expected === "error") expect(session.quotes.size).toBe(0);
  }
});

it("recognizes Mumbai docks for pilotage without choosing a specific berth", async () => {
  const result = await lookupTariff({ port: "Mumbai docks", charges: ["pilotage", "towage"], callDate: "18 October 2026", gt: "10000", service: "foreign", vesselCategory: "general-cargo", selfPropelled: true, movements: "2", pilotageArea: "docks" });
  expect(result.status).toBe("calculated"); expect(result.totals?.[0].amount).toBe("6322");
  const berth = await lookupTariff({ port: "Mumbai docks", charges: ["berth"], callDate: "18 October 2026", gt: "10000", service: "foreign", vesselCategory: "general-cargo", durationHours: "2" });
  expect(berth.status).toBe("unresolved"); expect(berth.questions.join(" ")).toMatch(/berth|Indira/i);
  expect((await lookupTariff({ port: "Mumbai docks", terminal: "GTI", charges: ["pilotage"] })).status).toBe("unresolved");
});

it("includes ordinary cruise towage once and does not invent requested invoice rounding", async () => {
  const call = { port: "Mumbai Cruise Terminal", callDate: "18 October 2026", gt: "10000", passengers: "100", durationHours: "12", rebate: false };
  const result = await lookupTariff({ ...call, charges: ["berth", "cruise", "passenger-fee", "pilotage", "towage", "port-dues"] });
  expect(result.status).toBe("calculated"); expect(result.totals?.[0].amount).toBe("1450");
  expect((await lookupTariff({ ...call, charges: ["cruise", "towage"], selfPropelled: false })).status).toBe("unresolved");
  for (const [content, expected] of [["Ordinary cruise scheme only, before tax.", "error"], ["Ordinary cruise scheme, without final invoice rounding.", "error"], ["Ordinary round trip cruise scheme.", "error"], ["Calculate the cruise scheme with final invoice rounding.", "unresolved"]]) {
    const session = new QuoteSession("cruise-rounding"); await session.initialize([{ role: "user", content }]);
    const quoted = await session.update({ pricing: "official", services: ["cruise", "rounding"], call: { port: call.port, callDate: call.callDate, gt: call.gt, passengers: call.passengers, rebate: false, occupancy: { hours: "12" } } });
    expect(quoted.status).toBe(expected);
  }
});

it("does not copy gross tonnage into net tonnage, while retaining an explicitly supplied NT", async () => {
  for (const [content, nt, expected] of [["Redi, 10000 GRT, berth hire only.", "10000", "error"], ["Redi, 10000 GRT; NT is unknown.", "10000", "error"], ["Redi, 10000 GRT and 4000 NT, berth hire only.", "4000", "unresolved"], ["Redi, 10000 GRT; net tonnage: 10,000.", "10000", "unresolved"]]) {
    const session = new QuoteSession("dimensional-evidence"); await session.initialize([{ role: "user", content }]);
    const result = await session.update({ pricing: "official", services: ["berth"], call: { port: "Redi", callDate: "18 October 2026", gt: "10000", nt, occupancy: { hours: "12" } } });
    expect(result.status).toBe(expected);
    if (expected === "error") expect(session.quotes.size).toBe(0);
    else expect("record" in result && result.record?.quote.call.nt).toBe(nt);
  }
});

it("retains an explicitly labelled NT form reply without requiring the unit to be typed twice", async () => {
  const session = new QuoteSession("net-form");
  await session.initialize([{ role: "user", content: "Record my vessel particulars." }, {role:"assistant",content:[{type:"tool-call",toolName:"ask_user_input",toolCallId:"nt-form",input:{title:"Particulars",fields:[{name:"nt",label:"Net tonnage",unit:"NT",type:"number",required:true}]}}]}, { role: "tool", content: [{ type: "tool-result", toolName: "ask_user_input", toolCallId: "nt-form", output: { type: "json", value: { values: { nt: "4000" }, note: "" } } }] }]);
  const result = await session.update({ pricing: "official", services: ["berth"], call: { port: "Redi", gt: "10000", nt: "4000" } });
  expect(result.status).toBe("unresolved"); expect("record" in result && result.record?.quote.call.nt).toBe("4000");
});

it("recognizes an explicitly booked Finolex jetty and asks for LOA for the dated reference", async () => {
  for (const port of ["Ranpar/Finolex chemical EDC jetty", "Finolex EDC jetty", "Finolex coal jetty"]) {
    const result = await lookupTariff({ port, charges: ["berth"], callDate: "18 October 2026", gt: "10000", durationHours: "12" });
    expect(result.facility).toBe("ranpar-finolex"); expect(result.status).toBe("unresolved");
    expect(result.questions.join(" ")).toMatch(/LOA/); expect(result.totals).toBeUndefined();
    expect(result.body).toMatch(/current applicability unconfirmed/i);
    expect(result.body).not.toMatch(/must be identified|No exact supported tariff identity|Please identify/);
  }
  const conflict = await lookupTariff({ port: "Finolex EDC jetty", terminal: "coal jetty", charges: ["berth"] });
  expect(conflict.status).toBe("unresolved"); expect(conflict.questions.join(" ")).toMatch(/conflict/i);
});
