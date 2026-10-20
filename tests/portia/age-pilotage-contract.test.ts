import { expect, it } from "vitest";
import { tariffInputSchema, tariffServiceSchema } from "../../src/lib/portia/tariff-input";
import { lookupTariff, type TariffInput } from "../../src/lib/portia/tariffs";

const base: TariffInput = {
  port: "JSW Jaigarh",
  charges: ["age-pilotage"],
  callDate: "18 October 2026",
  keelLaidDate: "1 June 2020",
  gt: "10000",
};

it("exposes canonical J-8 service and keel-laid intake", () => {
  expect(tariffServiceSchema.safeParse("age-pilotage").success).toBe(true);
  expect(tariffInputSchema.safeParse(base).success).toBe(true);
});

it.each([
  ["1 June 2026", "0", "0.0"],
  ["1 June 2020", "177.44", "0.017744"],
  ["1 June 2015", "266.16", "0.026616"],
  ["1 June 2010", "399.24", "0.039924"],
  ["1 June 2005", "532.32", "0.053232"],
  ["1 June 2000", "600", "0.0600"],
] as const)("prices the J-8 keel-laid row for %s", async (keelLaidDate, amount, rate) => {
  const result = await lookupTariff({ ...base, keelLaidDate });
  expect(result.status, JSON.stringify(result)).toBe("calculated");
  expect(result.questions).toEqual([]);
  expect(result.totals).toEqual([{ currency: "USD", amount, chargeIds: ["age-pilotage:jaigarh:keel-age"], lineAmounts: [amount], basis: "component" }]);
  expect(result.body).toContain(rate);
  expect(result.body).toMatch(/keel laid/i);
  expect(result.body).toMatch(/calendar anniversar/i);
  expect(result.body).not.toMatch(/365\.25/);
  expect(result.sources?.[0]).toMatchObject({ sha256: "98ae0d5f90ffa0c3dc725f3aee555ae3d20caee1a65b569fe37f7a12c6d60f0f" });
  expect(result.sources?.[0].reference).toMatch(/p2 J-8/i);
});

it.each([5, 10, 15, 20, 25])("keeps the exact %s-year printed overlap unresolved", async years => {
  const result = await lookupTariff({ ...base, keelLaidDate: `${2026 - years}-10-18` });
  expect(result.status).toBe("unresolved");
  expect(result.totals?.length ?? 0).toBe(0);
  expect([...(result.questions ?? []), ...(result.limitations ?? [])].join(" ")).toMatch(/overlap|exact/i);
});

it("uses calendar-anniversary sides of a boundary without a day-count approximation", async () => {
  const younger = await lookupTariff({ ...base, keelLaidDate: "19 October 2021" });
  const older = await lookupTariff({ ...base, keelLaidDate: "17 October 2021" });
  expect(younger.totals?.[0].amount).toBe("0");
  expect(older.totals?.[0].amount).toBe("177.44");
  for (const result of [younger, older]) expect(result.body).toMatch(/calendar anniversar/i);
});

it("keeps leap-day anniversary convention explicit", async () => {
  const result = await lookupTariff({ ...base, keelLaidDate: "29 February 2020" });
  expect(result.status).toBe("unresolved");
  expect(result.totals?.length ?? 0).toBe(0);
  expect((result.limitations ?? []).join(" ")).toMatch(/29 February.*anniversary convention/i);
});

it.each([
  ["missing keel date", { keelLaidDate: undefined }, /keel.*date/i],
  ["ambiguous keel date", { keelLaidDate: "03/04/2010" }, /unambiguous.*keel|keel.*unambiguous/i],
  ["future keel date", { keelLaidDate: "19 October 2026" }, /after.*call|future/i],
  ["missing call date", { callDate: undefined }, /call\/service date|call date/i],
  ["invalid call date", { callDate: "not-a-date" }, /call\/service date|unambiguous/i],
  ["pre-effective call", { callDate: "30 April 2026" }, /period|2026-05-01/i],
  ["nonpositive GT", { gt: "0" }, /positive.*quantity/i],
] as const)("rejects %s", async (_case, patch, message) => {
  const result = await lookupTariff({ ...base, ...patch });
  expect(result.status).toBe("unresolved");
  expect(result.totals?.length ?? 0).toBe(0);
  expect(`${result.body} ${result.questions.join(" ")} ${(result.limitations ?? []).join(" ")}`).toMatch(message);
});

it("treats 25-plus as one uncapped, once-per-component USD/GRT row", async () => {
  const result = await lookupTariff({ ...base, gt: "12345.5", keelLaidDate: "1 January 1990", movements: "9", service: "coastal", coastalLicence: false });
  expect(result.status).toBe("calculated");
  expect(result.totals?.[0].amount).toBe("740.73");
  expect(result.totals?.[0].chargeIds).toEqual(["age-pilotage:jaigarh:keel-age"]);
  expect(result.body).toMatch(/12345\.5 GRT × USD0\.0600/);
  expect(result.body).toMatch(/once|single/i);
  expect(result.body).toMatch(/No movement multiplier, minimum, cap, coastal discount, tax or currency conversion is inferred/i);
});

it.each(["age pilotage", "age-related pilotage", "vessel age additional pilotage", "additional pilotage as per vessel age in years", "additional pilotage charges as per vessel age"])("normalizes %s to J-8", async charge => {
  const result = await lookupTariff({ ...base, charges: [charge] });
  expect(result.status).toBe("calculated");
  expect(result.totals?.[0].chargeIds).toEqual(["age-pilotage:jaigarh:keel-age"]);
});

it("keeps J-2 and J-8 as distinct requested components", async () => {
  const mixed = await lookupTariff({
    ...base,
    keelLaidDate: "1 June 2005",
    charges: ["pilotage", "age-pilotage"],
    cargoCategory: "mechanized-bulk",
    movements: "2",
    selfPropelled: true,
  });
  expect(mixed.status).toBe("calculated");
  expect(mixed.totals?.[0]).toMatchObject({ amount: "16532.32", chargeIds: ["pilotage-towage:jaigarh:inward-outward", "age-pilotage:jaigarh:keel-age"] });

  const baseOnly = await lookupTariff({
    ...base,
    charges: ["pilotage"],
    cargoCategory: "mechanized-bulk",
    movements: "2",
    selfPropelled: true,
  });
  expect(baseOnly.totals?.[0]).toMatchObject({ amount: "16000", chargeIds: ["pilotage-towage:jaigarh:inward-outward"] });
});

it("requires confirmed JSW Jaigarh identity but no category, occupancy or movements", async () => {
  const confirmed = await lookupTariff(base);
  expect(confirmed.status).toBe("calculated");
  const unconfirmed = await lookupTariff({ ...base, port: "Jaigarh" });
  expect(unconfirmed.status).toBe("unresolved");
  expect(unconfirmed.questions.join(" ")).toMatch(/JSW Jaigarh/i);
});

it("explains the isolated J-8 schedule without quote intake", async () => {
  const result = await lookupTariff({ port: "JSW Jaigarh", charges: ["age-pilotage"] }, "rule");
  expect(result.status).toBe("explained");
  expect(result.questions).toEqual([]);
  expect(result.totals).toBeUndefined();
  for (const value of ["0.017744", "0.026616", "0.039924", "0.053232", "0.0600"]) expect(result.body).toContain(value);
  expect(result.body).toMatch(/keel laid/i);
});
