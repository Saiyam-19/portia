import { expect, it } from "vitest";
import type { ModelMessage } from "ai";
import { lookupTariff, type TariffInput } from "../../src/lib/portia/tariffs";
import { QuoteSession } from "../../src/lib/portia/session";
import { quoteToolInputSchema } from "../../src/lib/portia/quotes";

// Development regressions derived from the retained publications. These are
// deliberately not the later independently authored blind evaluation set.
const date = "18 October 2026";
const steel = { port: "ICTPL", callDate: date, charges: ["cargo"], cargoCategory: "iron-steel", cargoName: "steel coils", cargoTonnes: "10.1", cargoItems: [{ grossTonnes: "10.1" }], cargoHandling: "direct" };

it.each([
  ["exim", "import", "4084.5"], ["coastal", "import", "2446.5"],
  ["exim", "export", "2719.5"], ["coastal", "export", "1638"],
])("prices directly handled OCT steel %s %s with the included convenience fee", async (cargoTraffic, cargoDirection, amount) => {
  const result = await lookupTariff({ ...steel, cargoTraffic, cargoDirection } as TariffInput);
  expect(result.status, result.body).toBe("calculated");
  expect(result.totals).toMatchObject([{ currency: "INR", amount }]);
  expect(result.body).toMatch(/30%.*included/i);
  expect(result.sources?.some(s => s.url.endsWith("1778833452.pdf"))).toBe(true);
});

it.each([
  { cargoName: "steel scrap" }, { cargoName: "iron ore" }, { cargoHandling: "overside" },
  { cargoCategory: "other", cargoName: "sugar" }, { callDate: "8 May 2026" },
])("does not extend the OCT steel row to unsupported cargo, handling or dates: %j", async patch => {
  const result = await lookupTariff({ ...steel, cargoTraffic: "exim", cargoDirection: "import", ...patch } as TariffInput);
  expect(result.status).toBe("unresolved");
  expect(result.totals?.length ?? 0).toBe(0);
});

it("marks future OCT pricing beyond the source check as an estimate, not verified future rates", async () => {
  const result = await lookupTariff({ ...steel, callDate: "20 May 2027", cargoTraffic: "exim", cargoDirection: "import" } as TariffInput);
  expect(result.status).toBe("estimated");
  expect(result.body).toMatch(/future|after.*checked/i);
});

it("shows the OCT 130% berth scenario with its minimum, commenced hour and unresolved authority", async () => {
  const result = await lookupTariff({ port: "ICTPL", callDate: date, charges: ["berth"], cargoCategory: "iron-steel", cargoName: "steel coils", vesselCategory: "general-cargo", service: "foreign", gt: "999.5", durationHours: "1.01" });
  expect(result.status, result.body).toBe("estimated");
  expect(result.totals).toMatchObject([{ currency: "USD", amount: "35.62", basis: "reference" }]);
  expect(result.body).toMatch(/130%/);
  expect(result.body).toMatch(/100%/);
  expect(result.body).toMatch(/expired|expiry/i);
});

it("keeps special vessel categories outside the ordinary OCT berth scenario", async () => {
  const result = await lookupTariff({ port: "ICTPL", callDate: date, charges: ["berth"], cargoCategory: "iron-steel", vesselCategory: "naval", service: "coastal", coastalLicence: true, gt: "2000", durationHours: "2" });
  expect(result.status).toBe("unresolved"); expect(result.totals?.length ?? 0).toBe(0);
});

it("prices Finolex's dated LOA-based reference without substituting GT or rounding time", async () => {
  const input = { port: "Finolex", callDate: date, charges: ["berth"], loa: "137.25", durationHours: "3" } as TariffInput;
  const result = await lookupTariff(input);
  expect(result.status, result.body).toBe("estimated");
  expect(result.totals).toMatchObject([{ currency: "INR", amount: "30881.25", basis: "reference" }]);
  expect(result.body).toMatch(/2023-09-07/); expect(result.body).toMatch(/current.*unconfirmed/i);
  const missing = await lookupTariff({ ...input, loa: undefined, gt: "20000" } as TariffInput);
  expect(missing.questions.join(" ")).toMatch(/LOA/); expect(missing.totals?.length ?? 0).toBe(0);
  expect((await lookupTariff({ ...input, durationHours: "1.2" })).status).toBe("unresolved");
});

it("uses Finolex service quantities and units instead of inferring a full movement cycle", async () => {
  const input = { port: "Finolex", callDate: date, charges: ["pilotage", "towage", "mooring", "towage-standby"], portStayHours: "3", serviceQuantities: [
    { service: "pilotage", quantity: "2", unit: "berthing" }, { service: "towage", quantity: "2", unit: "berthing" },
    { service: "mooring", quantity: "2", unit: "activity" }, { service: "towage-standby", quantity: "3", unit: "hour" },
  ] } as TariffInput;
  const result = await lookupTariff(input);
  expect(result.status, result.body).toBe("estimated"); expect(result.totals?.[0].amount).toBe("1004500");
  const absent = await lookupTariff({ ...input, portStayHours: undefined, serviceQuantities: undefined, movements: "2" } as TariffInput);
  expect(absent.status).toBe("unresolved"); expect(absent.totals?.length ?? 0).toBe(0);
});

it("assesses OCT item weights separately and never assumes an aggregate is one item", async () => {
  const input = { ...steel, cargoTraffic: "exim", cargoDirection: "import" } as TariffInput;
  const itemized = await lookupTariff({ ...input, cargoTonnes: "10.5", cargoItems: [{ grossTonnes: "4.1" }, { grossTonnes: "6.4" }] } as TariffInput);
  expect(itemized.status).toBe("calculated"); expect(itemized.totals?.[0].amount).toBe("4279");
  expect(itemized.body).toMatch(/11.*assessed|assessed.*11/i);
  const aggregate = await lookupTariff({ ...input, cargoItems: undefined } as TariffInput);
  expect(aggregate.status).toBe("estimated"); expect(aggregate.totals?.[0].amount).toBe("3928.9");
  expect(aggregate.body).toMatch(/unassessed|item.weight/i);
  const ambiguous = await lookupTariff({ ...input, cargoTonnes: "10.5", cargoItems: [{ grossTonnes: "10.5" }] } as TariffInput);
  expect(ambiguous.status).toBe("unresolved"); expect(ambiguous.totals?.length ?? 0).toBe(0);
  expect(ambiguous.body + ambiguous.limitations?.join(" ")).toMatch(/0.5.*overlap|overlap.*0.5/i);
  const inconsistent = await lookupTariff({ ...input, cargoTonnes: "11", cargoItems: [{ grossTonnes: "10.1" }] } as TariffInput);
  expect(inconsistent.status).toBe("unresolved"); expect(inconsistent.totals?.length ?? 0).toBe(0);
});

it("uses total port stay for Finolex standby, not actual tug-attendance hours", async () => {
  const input = { port: "Finolex", callDate: date, charges: ["towage-standby"], serviceQuantities: [{ service: "towage-standby", quantity: "3", unit: "hour" }] } as TariffInput;
  const missing = await lookupTariff(input);
  expect(missing.status).toBe("unresolved"); expect(missing.totals?.length ?? 0).toBe(0);
  expect(missing.questions.join(" ")).toMatch(/port.*stay|stay.*port/i);
  const result = await lookupTariff({ ...input, portStayHours: "24" } as TariffInput);
  expect(result.status).toBe("estimated"); expect(result.totals?.[0].amount).toBe("36000");
  expect(result.body).toMatch(/24.*port.stay|port.stay.*24/i);
});

it("keeps valid sibling amounts regardless of requested-service order", async () => {
  const input = { ...steel, charges: ["cargo", "berth"], cargoHandling: "overside", vesselCategory: "general-cargo", service: "foreign", gt: "1000", durationHours: "1", cargoTraffic: "exim", cargoDirection: "import" } as TariffInput;
  const left = await lookupTariff(input), right = await lookupTariff({ ...input, charges: ["berth", "cargo"] });
  expect(left.status).toBe("unresolved"); expect(left.totals).toEqual(right.totals);
  expect(left.totals?.[0].amount).toBe("17.81");
  const finolex = { port: "Finolex", callDate: "6 September 2023", berthStart: "7 September 2023 10:00 IST", charges: ["pilotage", "berth"], loa: "100", durationHours: "1", serviceQuantities: [{ service: "pilotage", quantity: "1", unit: "berthing" }] } as TariffInput;
  expect((await lookupTariff(finolex)).totals).toEqual((await lookupTariff({ ...finolex, charges: ["berth", "pilotage"] })).totals);
});

it("keeps each dated service on its own event instead of re-dating it from the berth", async () => {
  const finolex = await lookupTariff({ port: "Finolex", callDate: "6 September 2023", berthStart: "7 September 2023 10:00 IST", charges: ["berth", "pilotage"], loa: "100", durationHours: "1", serviceQuantities: [{ service: "pilotage", quantity: "1", unit: "berthing" }] } as TariffInput);
  expect(finolex.status).toBe("unresolved");
  expect(finolex.totals?.[0].amount).toBe("7500");
  expect(finolex.totals?.[0].chargeIds).toEqual(["berth:finolex:reference"]);
  const oct = await lookupTariff({ ...steel, callDate: "8 May 2026", berthStart: "9 May 2026 10:00 IST", charges: ["berth", "cargo"], vesselCategory: "general-cargo", service: "foreign", gt: "1000", durationHours: "1", cargoTraffic: "exim", cargoDirection: "import" } as TariffInput);
  expect(oct.status).toBe("unresolved");
  expect(oct.totals?.some(total => total.chargeIds.includes("cargo:oct:steel-direct"))).toBe(false);
});

it("supports the ordinary RoRo conditional scenario without extending it to passengers", async () => {
  const input = { port: "ICTPL", callDate: date, charges: ["berth"], vesselCategory: "ro-ro", service: "coastal", coastalLicence: true, gt: "2000", durationHours: "2" };
  expect((await lookupTariff(input)).totals).toMatchObject([{ currency: "INR", amount: "1125.8" }]);
  expect((await lookupTariff({ ...input, vesselCategory: "passenger" })).totals?.length ?? 0).toBe(0);
});

it("does not price JSW idling as ordinary stay or invent fractional time billing", async () => {
  const input = { port: "JSW JNPT Liquid Terminal", callDate: date, charges: ["idling"], durationHours: "12", serviceQuantities: [{ service: "idling", quantity: "2", unit: "hour" }] } as TariffInput;
  expect((await lookupTariff(input)).totals?.length ?? 0).toBe(0);
  const confirmed = await lookupTariff({ ...input, userCausedDelay: true } as TariffInput);
  expect(confirmed.status).toBe("estimated"); expect(confirmed.totals?.[0].amount).toBe("40000");
  expect(confirmed.body).toMatch(/beyond the two-hour grace/);
  expect((await lookupTariff({ ...input, userCausedDelay: true, serviceQuantities: [{ service: "idling", quantity: "2.1", unit: "hour" }] } as TariffInput)).status).toBe("unresolved");
});

it("keeps Redi anchorage distinct from berth hire and statutory port dues", async () => {
  const result = await lookupTariff({ port: "Redi", callDate: date, charges: ["anchorage", "pilotage", "port-services", "launch"], gt: "6100", durationHours: "24.001" });
  expect(result.status, result.body).toBe("estimated"); expect(result.totals?.[0].amount).toBe("366000");
  expect(result.body).toMatch(/2023-11-20/); expect(result.body).toMatch(/2024-05-11/);
  for (const charge of ["berth", "port-dues"]) {
    const unsupported = await lookupTariff({ port: "Redi", callDate: date, charges: [charge], gt: "6100", durationHours: "24" });
    expect(unsupported.status).toBe("unresolved"); expect(unsupported.totals?.length ?? 0).toBe(0);
  }
});

it.each([
  ["Base Oil", "exim", "3958.5"], ["Base Oil", "coastal", "3958.5"],
  ["EDC", "coastal", "2900.1"], ["Edible Oil", "coastal", "2637.6"],
])("uses JSW's December cargo and infrastructure rows for %s %s", async (cargoName, cargoTraffic, amount) => {
  const result = await lookupTariff({ port: "JSW JNPT Liquid Terminal", callDate: date, charges: ["cargo", "handling", "infrastructure"], cargoName, cargoTraffic, cargoTonnes: "10.5" });
  expect(result.status, result.body).toBe("estimated"); expect(result.totals?.[0].amount).toBe(amount);
  expect(result.body).toMatch(/2025-12-05/); expect(result.body).toMatch(/indexed|search-index/i);
  expect(result.totals?.[0].chargeIds).toHaveLength(2); // cargo + handling must not double charge.
});

it("does not transplant JSW's old expiry or use its successor before commencement", async () => {
  const input = { port: "JSW JNPT Liquid Terminal", charges: ["infrastructure"], cargoName: "Base Oil", cargoTonnes: "8" };
  expect((await lookupTariff({ ...input, callDate: "4 December 2025" })).totals?.length ?? 0).toBe(0);
  expect((await lookupTariff({ ...input, callDate: "5 December 2025" })).totals?.[0].amount).toBe("1000");
  const unknown = await lookupTariff({ ...input, callDate: date, cargoName: "unidentified chemical" });
  expect(unknown.status).toBe("unresolved"); expect(unknown.totals?.length ?? 0).toBe(0);
});

it("prices JSW actual ancillary usage and does not infer usage from a cargo call", async () => {
  const input = { port: "JSW JNPT Liquid Terminal", callDate: date, charges: ["liquid-nitrogen", "loading-arm"], serviceQuantities: [
    { service: "liquid-nitrogen", quantity: "20", unit: "Nm3" }, { service: "loading-arm", quantity: "10", unit: "MT" },
  ] } as TariffInput;
  const result = await lookupTariff(input);
  expect(result.status, result.body).toBe("estimated"); expect(result.totals?.[0].amount).toBe("750");
  expect((await lookupTariff({ ...input, serviceQuantities: undefined })).totals?.length ?? 0).toBe(0);
});

it("carries uncertainty through mixed JSW marine/cargo requests and blocks tax on a partial base", async () => {
  const input = { port: "JSW JNPT Liquid Terminal", callDate: date, charges: ["berth", "cargo"], service: "foreign", gt: "10000", durationHours: "2", cargoName: "HSD", cargoTraffic: "exim", cargoTonnes: "10" };
  const result = await lookupTariff(input);
  expect(result.status, result.body).toBe("estimated"); expect(result.sourceClass).toBe("published-reference");
  expect(result.totals?.map(t => t.currency).sort()).toEqual(["INR", "USD"]);
  const withTax = await lookupTariff({ ...input, charges: [...input.charges, "gst"] });
  expect(withTax.status).toBe("unresolved"); expect(withTax.body).toMatch(/combined.*tax|tax.*combined/i);
});

it.each(["Finolex", "Redi", "JSW JNPT Liquid Terminal", "ICTPL"])("explains %s evidence without asking voyage questions", async port => {
  const service = port === "Redi" ? "anchorage" : port.startsWith("JSW") ? "infrastructure" : "berth";
  const result = await lookupTariff({ port, charges: [service] }, "rule");
  expect(result.status).toBe("explained"); expect(result.questions).toEqual([]); expect(result.totals).toBeUndefined();
  expect(result.sources?.length).toBeGreaterThan(0); expect(result.body).toMatch(/2023|2025|130%/);
});

it("persists and recomputes dated estimates without authoritative baselines, rankings or model prose", async () => {
  const session = new QuoteSession("public-reference"); await session.initialize([]);
  const saved = await session.update({ pricing: "official", services: ["berth"], call: { port: "Finolex", callDate: date, loa: "137.25", occupancy: { hours: "3" } } });
  expect(saved.status, saved.body).toBe("estimated");
  if (!("record" in saved) || !saved.record) throw Error("Expected saved reference receipt");
  expect(saved.record.quote.baseline).toBeUndefined();
  session.beginStep();
  const second = await session.update({ pricing: "official", services: ["berth"], call: { port: "Finolex", callDate: date, loa: "140", occupancy: { hours: "3" } } });
  if (!("quoteId" in second)) throw Error("Expected second reference");
  const comparison = await session.compare({ quoteIds: [saved.quoteId, second.quoteId], currency: "INR" });
  expect(comparison.status).toBe("error"); expect(comparison.body).toMatch(/reference|unconfirmed|conditional/i);
  const restored = new QuoteSession("public-reference");
  await restored.initialize([{ role: "tool", content: [{ type: "tool-result", toolName: "manage_quote", toolCallId: "saved", output: { type: "json", value: saved } }] }] as ModelMessage[]);
  expect(restored.quotes.get(saved.quoteId)?.baseline).toBeUndefined();
  expect(await restored.answer("Confirmed current bill INR 1")).toMatch(/30,881.25/);
  expect(await restored.answer("Confirmed current bill INR 1")).toMatch(/current.*unconfirmed/i);
});

it("exposes ordinary evidence quantities through the real tool schema without authority inputs", () => {
  const result = quoteToolInputSchema.safeParse({ pricing: "official", services: ["anchorage", "infrastructure", "towage-standby"], call: { port: "Redi", cargoCategory: "iron-steel", cargoHandling: "direct", serviceQuantities: [{ service: "towage-standby", quantity: "3", unit: "hour" }] } });
  expect(result.success).toBe(true);
});
