import { expect, it } from "vitest";
import Decimal from "decimal.js";
import oracles from "./fixtures/full-scope-oracles.json";
import { lookupTariff, type TariffInput } from "../../src/lib/portia/tariffs";
import { QuoteSession } from "../../src/lib/portia/session";

type Case = { id: string; input: TariffInput; currency: string; amount: string };
const cases: Case[] = [];
const ordinary = { callDate: "18 October 2026", service: "foreign", movements: "2", selfPropelled: true, coastalLicence: true };
for (const row of oracles.jnpa) {
  if (row.id.startsWith("JNPA-PILOT")) {
    const r = row as typeof oracles.jnpa[0];
    cases.push({ id: r.id, input: { ...ordinary, port: "JNPA", charges: ["pilotage", "towage"], gt: String(r.GRT), service: r.status }, currency: r.currency!, amount: r.expectedUnrounded! });
  } else if (row.id.startsWith("BMCT-BERTH")) {
    cases.push({ id: row.id, input: { ...ordinary, port: "BMCT", charges: ["berth"], gt: String(row.GRT), durationMinutes: String(row.occupancyMinutes), service: row.status }, currency: "INR", amount: row.expectedUnroundedINR! });
  } else if (/^(BMCT|NSIGT)-NORMAL/.test(row.id)) {
    cases.push({ id: row.id, input: { ...ordinary, port: row.id.split("-")[0], charges: ["handling"], service: row.status, cargoTraffic: row.status === "coastal" ? "coastal" : "exim", containerSize: String(row.sizeFeet), ladenContainers: String(row.laden), emptyContainers: String(row.empty), specialCargo: false, handlingMode: row.mode === "shipYardOnly" ? "ship-yard" : row.mode === "ICDRail" ? "rail" : "road", icdRail: true }, currency: "INR", amount: row.expectedUnroundedINR! });
  } else if (row.id.startsWith("MUC") && !row.expectedDisposition && row.id !== "MUC-LOWER-RATE-AUTHORIZATION") {
    const traffic = row.traffic ?? row.cargoTraffic;
    cases.push({ id: row.id, input: { port: "GTI", charges: ["muc"], callDate: row.date, containerCount: String(row.containers), cargoTraffic: traffic === "foreignEXIM" ? "exim" : traffic } as TariffInput, currency: "INR", amount: row.expectedExGSTINR ?? row.expectedPublishedCeilingExGSTINR ?? row.expectedINR! });
  }
}
for (const row of oracles.mumbai) {
  if (row.rule === "mumbai-cargo-pilotage-towage") cases.push({ id: row.id, input: { ...ordinary, port: "Mumbai", charges: ["pilotage", "towage"], vesselCategory: "general-cargo", pilotageArea: row.location, service: row.currency === "INR" ? "coastal" : "foreign", gt: row.grt } as TariffInput, currency: row.currency!, amount: row.expectedUnrounded! });
}
for (const row of oracles.western) {
  if (row.id.startsWith("JG-J1")) cases.push({ id: row.id, input: { ...ordinary, port: "JSW Jaigarh", charges: ["port-dues"], gt: String(row.inputs.gt), cargoCategory: row.inputs.category, callDays: "30" }, currency: "USD", amount: row.expected.amountExact! });
  if (row.id.startsWith("JG-J2") && row.expected.amountExact) cases.push({ id: row.id, input: { ...ordinary, port: "JSW Jaigarh", charges: ["pilotage"], gt: String(row.inputs.gt), cargoCategory: row.inputs.category }, currency: "USD", amount: row.expected.amountExact });
  if (row.id.startsWith("JG-J3")) cases.push({ id: row.id, input: { ...ordinary, port: "JSW Jaigarh", charges: ["mooring"], gt: String(row.inputs.gt) }, currency: "USD", amount: row.expected.amountExact! });
  if (row.id.startsWith("JG-J4")) cases.push({ id: row.id, input: { ...ordinary, port: "JSW Jaigarh", charges: ["environment"], gt: String(row.inputs.gt) }, currency: "USD", amount: row.expected.amountExact! });
  if (row.id.startsWith("JG-J5")) cases.push({ id: row.id, input: { ...ordinary, port: "JSW Jaigarh", charges: ["pilot-attendance"], pilotAttendanceHours: String(row.inputs.pilotAttendanceHours) } as TariffInput, currency: "USD", amount: row.expected.amountExact! });
  if (row.id.startsWith("KLL26-COMBINED")) cases.push({ id: row.id, input: { port: "Konkan LNG", charges: ["berth", "pilotage"], callDate: row.inputs.callDate, gt: String(row.inputs.gt) }, currency: "USD", amount: row.expected.baseAmountExact! });
  // The original arithmetic oracle starts 36h on 31Oct, crossing the 1Nov
  // source revision. Keep its data unchanged; validate that rejected scope below.
  // This neighboring positive retains its exact arithmetic within one source period.
  if (row.id.startsWith("KLL25-CAP")) cases.push({ id: row.id + "-covered-interval", input: { port: "Konkan LNG", charges: ["berth", "pilotage", "gst"], callDate: "2026-10-30", berthStart: "30 October 2026 00:00 IST", berthEnd: "31 October 2026 12:00 IST", gt: String(row.inputs.gt), durationHours: "36", fxInrPerUsd: "100", fxDate: "2026-10-29", fxBasis: "SBI-TT-selling", scheduledBerthingDate: "2026-10-30" } as TariffInput, currency: "INR", amount: row.expected.total! });
}

it.each(cases)("matches independent original-source oracle $id", async ({ input, currency, amount }) => {
  const result = await lookupTariff(input);
  expect(result.questions, result.body).toEqual([]);
  expect(result.status, JSON.stringify(result)).toBe("calculated");
  expect(result.totals).toHaveLength(1);
  expect(result.totals![0].currency).toBe(currency);
  expect(new Decimal(result.totals![0].amount).eq(amount), JSON.stringify(result.totals)).toBe(true);
  expect(result.sources?.length).toBeGreaterThan(0);
});

it("keeps MUC intake independent of vessel details and rejects expired authority", async () => {
  const input = { port: "GTI", charges: ["muc"], callDate: "2026-10-18", containerCount: "10" } as TariffInput;
  const missing = await lookupTariff(input);
  expect(missing.questions.join(" ")).toMatch(/cargo|coastal|transshipment/i);
  expect(missing.questions.join(" ")).not.toMatch(/tonnage|GRT|berth|size/i);
  for (const callDate of ["2024-10-27", "2027-10-01"]) {
    const result = await lookupTariff({ ...input, callDate, cargoTraffic: "exim" });
    expect(result.status).toBe("unresolved"); expect(result.totals?.length ?? 0).toBe(0);
  }
});
it("never presents a partly covered mixed request as resolved", async () => {
  const result = await lookupTariff({ port: "BMCT", charges: ["berth", "gst"], callDate: "2026-10-18", gt: "10000", durationHours: "1", service: "foreign" });
  expect(result.status).toBe("unresolved");
  expect(result.body).toMatch(/subtotal|component/i);
  const session = new QuoteSession("partial-source");
  await session.initialize([]);
  const saved = await session.update({ pricing: "official", call: { port: "BMCT", callDate: "2026-10-18", gt: "10000", occupancy: { hours: "1" }, service: "foreign" }, services: ["berth", "gst"] });
  expect("record" in saved && saved.record?.quote.baseline).toBeUndefined();
});
it("prices the cruise scheme once and blocks fractional excess and unverified rebates", async () => {
  const input = { port: "Mumbai Cruise Terminal", charges: ["cruise", "berth", "pilotage", "port-dues"], callDate: "2026-10-18", gt: "10000", passengers: "100", durationHours: "12", rebate: false } as TariffInput;
  const result = await lookupTariff(input);
  expect(result.status).toBe("calculated"); expect(result.totals![0].amount).toBe("1450");
  expect((await lookupTariff({ ...input, durationHours: "18" })).totals![0].amount).toBe("2500");
  expect((await lookupTariff({ ...input, durationHours: "12.5" })).status).toBe("unresolved");
  expect((await lookupTariff({ ...input, rebate: true })).status).toBe("unresolved");
  expect((await lookupTariff({ ...input, vesselCategory: "tanker" })).status).toBe("unresolved");
  expect((await lookupTariff({ ...input, priority: true })).status).toBe("unresolved");
});
it("respects revised-rate boundaries, mixed status and actual tariff ambiguities", async () => {
  const bmct = { port: "BMCT", charges: ["berth"], callDate: "2026-04-05", gt: "10000", durationHours: "1", service: "foreign" };
  expect((await lookupTariff(bmct)).status).toBe("unresolved");
  expect((await lookupTariff({ ...bmct, callDate: "2026-04-06" })).status).toBe("calculated");
  expect((await lookupTariff({ ...ordinary, port: "JNPA", charges: ["pilotage"], gt: "30000.5" })).status).toBe("unresolved");
  expect((await lookupTariff({ ...ordinary, port: "JSW Jaigarh", charges: ["pilotage"], cargoCategory: "mechanized-bulk", gt: "45000" })).status).toBe("unresolved");
  expect((await lookupTariff({ ...bmct, callDate: "2026-10-18", berthStart: "31 March 2027 23:30 IST", berthEnd: "1 April 2027 00:30 IST" })).status).toBe("unresolved");
  expect((await lookupTariff({ ...bmct, callDate: "2027-03-31", berthStart: "31 March 2027 23:30 IST" })).status).toBe("unresolved");
  const kll = { port: "Konkan LNG", charges: ["berth", "pilotage"], gt: "10000", callDate: "2026-10-31", berthStart: "31 October 2026 23:00 IST", durationHours: "2", fxInrPerUsd: "100", fxBasis: "SBI-TT-selling", fxDate: "2026-10-30", scheduledBerthingDate: "2026-10-31" } as TariffInput;
  expect((await lookupTariff(kll)).status).toBe("unresolved");
  const old = await lookupTariff({ ...kll, callDate: "2026-11-01", berthStart: "31 October 2026 08:00 IST" });
  expect(old.totals?.[0]).toMatchObject({ currency: "INR", amount: "300000" });
});

it("does not tax or round only the berth when a mixed Mumbai invoice also requests pilotage", async () => {
  const result = await lookupTariff({ ...ordinary, port: "Mumbai", terminal: "Indira Dock", charges: ["berth", "pilotage", "gst", "rounding"], service: "coastal", gt: "8000", vesselCategory: "general-cargo", pilotageArea: "docks", flag: "India", durationHours: "20", berthAllotted: true, readinessValid: true, favourableConditions: true, directBilling: true, registeredCustomer: true, privateCustomer: true, supplierState: "Maharashtra", supplyState: "Maharashtra", sez: false, taxExemption: false, standaloneBill: true });
  expect(result.status).toBe("unresolved");
  expect(result.body).toMatch(/combined.*(?:GST|tax)|(?:GST|tax).*combined/i);
});

it.each(["JNPA", "BMCT", "GTI", "JSW JNPT Liquid Terminal"])("does not use berth dates to redate inward pilotage at %s", async port => {
  const input = { ...ordinary, selfPropelled: undefined, port, charges: ["pilotage", "towage"], gt: "30000", callDate: "30 April 2026", berthStart: "1 May 2026 02:00 IST", berthEnd: "2 May 2026 02:00 IST" };
  const crossing = await lookupTariff(input);
  expect(crossing.status, crossing.body).toBe("unresolved");
  expect(crossing.totals?.length ?? 0).toBe(0);
  expect((await lookupTariff({ ...input, callDate: "1 May 2026" })).status).toBe("calculated");
  const expiry = await lookupTariff({ ...input, callDate: "30 April 2027", berthStart: "30 April 2027 02:00 IST", berthEnd: "1 May 2027 02:00 IST" });
  expect(expiry.status).toBe("unresolved");
  expect(expiry.totals?.length ?? 0).toBe(0);
});

it("does not label a berth-only-taxed Mumbai total plus MUC as a complete mixed invoice", async () => {
  const result = await lookupTariff({ port: "Mumbai", terminal: "Indira Dock", callDate: "10 October 2026", charges: ["berth", "gst", "rounding", "muc"], service: "coastal", coastalLicence: true, gt: "8000", vesselCategory: "general-cargo", flag: "India", durationHours: "20", berthAllotted: true, readinessValid: true, favourableConditions: true, directBilling: true, registeredCustomer: true, privateCustomer: true, supplierState: "Maharashtra", supplyState: "Maharashtra", sez: false, taxExemption: false, standaloneBill: true, containerCount: "10", cargoTraffic: "exim" });
  expect(result.status).toBe("unresolved");
  expect(result.body).toMatch(/combined.*(?:GST|tax)|(?:GST|tax).*combined/i);
});

it.each([
  ["JNPA", "pilotage", ["0.3464", "10393", "18722", "9.0792"]],
  ["Mumbai", "pilotage", ["0.6322", "0.1144", "1.1399", "1000"]],
  ["BMCT", "handling", ["6538.65", "5281.24", "3923.22", "1.5"]],
  ["NSIGT", "handling", ["4947.13", "3995.79", "2968.27", "1.5"]],
  ["NSICT", "handling", ["6666.25", "9999.38", "13332.50", "1062.02"]],
  ["NSFT", "handling", ["94.78", "142.17", "189.56", "210.16"]],
  ["GTI", "handling", ["3943.04", "3943.05", "5914.57", "7886.08"]],
  ["Konkan LNG", "berth", ["0.0041", "0.359", "36 hours"]],
  ["Mumbai Cruise Terminal", "cruise", ["11–35", "36–70", "0.085", "0.0175"]],
  ["BPCL Liquid Cargo Jetty", "water", ["7.71", "/MT"]],
])("explains %s %s published size/band rows without quote intake", async (port, service, rates) => {
  const result = await lookupTariff({ port: port as string, charges: [service as string] }, "rule");
  expect(result.status).toBe("explained"); expect(result.questions).toEqual([]);
  expect(result.totals).toBeUndefined();
  for (const rate of rates) expect(result.body).toContain(rate);
});

it.each(oracles.western.filter(row=>row.id.startsWith("KLL25-CAP")))("keeps frozen $id arithmetic separate from invalid source-period applicability",async row=>{
 const result=await lookupTariff({port:"Konkan LNG",charges:["berth","pilotage","gst"],callDate:row.inputs.callDate,gt:String(row.inputs.gt),durationHours:"36",fxInrPerUsd:"100",fxDate:"2026-10-30",fxBasis:"SBI-TT-selling",scheduledBerthingDate:"2026-10-31"});
 expect(result.status).toBe("unresolved");expect(result.totals?.length??0).toBe(0);expect(result.questions.join(" ")).toMatch(/expiry|interval/i);
});
