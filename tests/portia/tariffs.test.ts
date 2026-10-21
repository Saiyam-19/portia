import { afterEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import Decimal from "decimal.js";
import { lookupTariff, resolveTariffPort, tariffInputSchema, type TariffInput } from "../../src/lib/portia/tariffs";
import { SUPPORTED_PORTS } from "../../src/lib/migration/ports";

vi.mock("node:fs/promises", async original => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});
afterEach(() => vi.mocked(readFile).mockClear());

const containers: TariffInput = { port: "NSFT", charges: ["handling"], callDate: "12 November 2026", service: "foreign", containerSize: "20", ladenContainers: "120", emptyContainers: "80", cargoTraffic: "exim", specialCargo: false, handlingMode: "road" };
const coastal: TariffInput = {
  port: "Mumbai", terminal: "Indira Dock", charges: ["berth", "gst", "rounding"], gt: "8000", service: "coastal", flag: "India", vesselCategory: "general-cargo", coastalLicence: true,
  berthStart: "10 October 2026 08:00 IST", berthEnd: "11 October 2026 03:40 IST", readinessTime: "11 October 2026 03:30 IST", cargoOperation: "discharging",
  berthAllotted: true, readinessValid: true, favourableConditions: true, idleTime: false, shifting: false, falseReadiness: false, priority: false, ousting: false, penalty: false, rebate: false,
  directBilling: true, registeredCustomer: true, privateCustomer: true, supplierState: "Maharashtra", supplyState: "Maharashtra", sez: false, taxExemption: false, standaloneBill: true,
};

it.each([
  ["NSFT", "road", "17967.20", "USD"], ["NSFT", "rail", "21757.60", "USD"],
  ["NSIGT", "road", "1065536.80", "INR"], ["NSIGT", "rail", "1408026.80", "INR"], ["NSIGT", "ship-yard", "913318.80", "INR"],
])("preserves %s %s handling arithmetic and service scope", async (port, handlingMode, amount, currency) => {
  const result = await lookupTariff({ ...containers, port, handlingMode, icdRail: true });
  expect(result.status).toBe("calculated"); expect(result.questions).toEqual([]);
  expect(new Decimal(result.totals![0].amount).eq(amount)).toBe(true); expect(result.totals![0].currency).toBe(currency);
  expect(result.body).toContain("not a complete bill"); expect(result.sources?.length).toBe(1);
  expect(result.applicability.currentTariffVerified).toBe(false);
});
it("retains NSICT port crane and component precision", async () => {
  const input = { ...containers, port: "NSICT", ladenContainers: "15", emptyContainers: "7", handlingMode: "ship-yard", portCrane: true };
  const result = await lookupTariff(input);
  expect(result.body).toContain("INR 139,656.45");
  expect(result.totals![0].chargeIds).toEqual(["container:20ft:normal-exim:ship-yard"]);
  expect((await lookupTariff({ ...input, portCrane: false })).status).toBe("unresolved");
  // Newly sourced 1(C) road leg: 22 boxes × INR1062.02, added once.
  expect((await lookupTariff({ ...input, handlingMode: "road" })).totals![0].amount).toBe("163020.89");
});
it.each([
  ["GTI", ["berth"], "28600", "14", "2122.12"],
  ["JSW JNPT Liquid Terminal", ["berth", "port-dues"], "16800", "30", "5288.64"],
  ["JNPA", ["pilotage", "towage"], "10000", "1", "3464"],
])("preserves ordinary JNPA family %s", async (port, charges, gt, durationHours, expected) => {
  const result = await lookupTariff({ port, charges, gt, durationHours, movements: "2", callDate: "12 November 2026", service: "foreign", vesselCategory: "tanker", cargoOperation: "discharging" });
  expect(result.status).toBe("calculated"); expect(new Decimal(result.totals![0].amount).eq(expected)).toBe(true);
  if (port === "JNPA") expect(result.totals![0].chargeIds).toEqual(["pilotage-towage:ordinary-foreign:inward-outward"]);
});
it.each([["Indira Dock", "4000.674"], ["Ballard Pier", "4000.674"], ["Princes Dock", "3183.018"], ["Victoria Dock", "3183.018"]])("preserves Mumbai foreign %s and unrounded component precision", async (terminal, expected) => {
  const result = await lookupTariff({ port: "Mumbai", terminal, charges: ["berth"], callDate: "3 November 2026", service: "foreign", vesselCategory: "general-cargo", gt: "14601", durationHours: "20" });
  expect(result.status).toBe("calculated"); expect(new Decimal(result.totals![0].amount).eq(expected)).toBe(true);
});
it("preserves NSIGT berth without container intake and Jaigarh monetary minimum", async () => {
  const berth = await lookupTariff({ port: "NSIGT", charges: ["berth"], callDate: "12 November 2026", service: "foreign", gt: "31200", durationHours: "18" });
  expect(berth.body).toContain("INR 1,149,932.16"); expect(berth.questions).toEqual([]);
  const dues = { port: "Jaigarh", operator: "JSW Jaigarh Port Limited", charges: ["port-dues"], callDate: "12 November 2026", cargoCategory: "mechanized-bulk", gt: "5000", callDays: "30" };
  expect((await lookupTariff(dues)).body).toContain("USD 2,000.00");
  expect((await lookupTariff({ ...dues, callDays: "31" })).status).toBe("unresolved");
  expect((await lookupTariff({ ...dues, operator: "Angre" })).status).toBe("unresolved");
});
it("calculates C1 and correction conditionally, without current October authority", async () => {
  for (const [gt, total, berth, cgst] of [["8000", "40876", "34640", "3117.6"], ["9600", "49051", "41568", "3741.12"]]) {
    const result = await lookupTariff({ ...coastal, gt });
    expect(result.status).toBe("calculated"); expect(result.questions).toEqual([]);
    expect(new Decimal(result.totals![0].amount).eq(total)).toBe(true);
    expect(result.totals![0].lineAmounts?.slice(0, 3).map(value => new Decimal(value).toString())).toEqual([berth, cgst, cgst]);
    expect(result.body).toContain("Current October tariff applicability is unverified");
    expect(result.applicability).toMatchObject({ currentTariffVerified: false, status: "conditional-retained-rule" });
    expect(result.sources).toHaveLength(5);
  }
});
it("asks only requested coastal prerequisites and withholds unsafe tax totals", async () => {
  const result = await lookupTariff({ port: "Mumbai", charges: ["berth"], service: "coastal", gt: "8000" });
  expect(result.status).toBe("unresolved"); expect(result.questions.join(" ")).not.toMatch(/GST|supplier|SEZ|official rate/i);
  const fractionalTax = await lookupTariff({ ...coastal, gt: "10001" });
  expect(fractionalTax.questions).toEqual([]);
  expect(fractionalTax.limitations?.join(" ")).toContain("Fractional-paise");
  expect((await lookupTariff({ ...coastal, readinessTime: "10 October 2026 20:00 IST" })).status).toBe("unresolved");
});
it.each(["BPCL Liquid Cargo Jetty", "ICTPL", "Konkan LNG", "Mumbai Cruise Terminal", "GTI", "NSFT", "NSIGT", "NSICT", "Jaigarh", "Finolex"])("preserves source explanations for %s without vessel intake", async port => {
  const charges = ["NSFT", "NSIGT", "NSICT"].includes(port) ? ["handling"] : port === "Jaigarh" ? ["port-dues"] : port === "Finolex" ? ["identity"] : ["berth"];
  const result = await lookupTariff({ port, charges }, "rule");
  expect(result.status).toBe("explained"); expect(result.sources?.length).toBeGreaterThan(0); expect(result.calculation).toBeUndefined();
});
it("C6 explains retained Mumbai rule with no quote intake", async () => {
  const result = await lookupTariff({ port: "Mumbai", terminal: "Indira Dock", charges: ["berth"], service: "coastal" }, "rule");
  expect(result.status).toBe("explained"); expect(result.questions).toEqual([]);
  for (const text of ["0.2165", "commenced hour", "1000-GRT", "INR 100 bill minimum", "May amendment"]) expect(result.body).toContain(text);
  expect(result.body).not.toContain("verified through 2026-10-15"); expect(result.calculation).toBeUndefined();
});
it("preserves all 16 catalog entries and truthful distinct source gaps", async () => {
  expect(SUPPORTED_PORTS).toHaveLength(16);
  for (const port of SUPPORTED_PORTS) expect(resolveTariffPort(port)).toBe(port);
  const result = await lookupTariff({ port: "BPCL Cargo Jetty", charges: ["berth"], gt: "7000", durationHours: "12", callDate: "10 October 2026" });
  expect(result.status).toBe("unresolved"); expect(result.totals).toBeUndefined(); expect(result.body).toContain("distinct label");
  for (const port of ["Gateway", "BPCL", "Mumbai Container Terminal", "Chennai"]) {
    expect(resolveTariffPort(port)).toBeUndefined(); expect((await lookupTariff({ port, charges: ["berth"] })).body).toContain("No other port or terminal has been substituted");
  }
});
it("validates source identity and direct domain input at the boundary", async () => {
  expect(tariffInputSchema.safeParse({ ...coastal, rate: "0.1" }).success).toBe(false);
  expect(tariffInputSchema.safeParse(coastal).success).toBe(true);
  expect((await lookupTariff({ ...containers, ladenContainers: "1.5" })).status).toBe("unresolved");
  expect((await lookupTariff({ ...coastal, gt: "1/0" })).status).toBe("unresolved");
  vi.mocked(readFile).mockResolvedValueOnce(Buffer.from("changed source"));
  const result = await lookupTariff(coastal);
  expect(result.status).toBe("error"); expect(result.totals).toBeUndefined();
  expect(result.issues).toContainEqual(expect.objectContaining({ kind: "source", code: "component-validation-failed" }));
});
