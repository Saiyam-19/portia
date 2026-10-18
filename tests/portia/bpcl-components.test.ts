import { expect, it } from "vitest";
import Decimal from "decimal.js";
import cases from "./fixtures/bpcl-oracles.json";
import { lookupTariff, type TariffInput } from "../../src/lib/portia/tariffs";

it.each(cases)("BPCL current publication: $id", async row => {
  const input = { port: "BPCL Liquid Cargo Jetty", callDate: "2026-10-18", charges: row.cargoLabel ? ["cargo"] : [row.service], cargoName: row.cargoLabel, cargoDirection: row.movement, cargoTraffic: row.cargoTraffic === "coastal" ? "coastal" : "exim", cargoTonnes: row.quantityMT, service: row.vesselService ?? row.cargoTraffic ?? "foreign", coastalLicence: true, serviceQuantities: row.service ? [{ service: row.service, quantity: row.quantity, unit: row.unit }] : undefined } as TariffInput;
  const result = await lookupTariff(input);
  if (!row.expectedComponent) { expect(result.status).toBe("unresolved"); return; }
  expect(result.status, JSON.stringify(result)).toBe("calculated");
  expect(result.totals![0].currency).toBe(row.currency);
  expect(new Decimal(result.totals![0].amount).eq(row.expectedComponent)).toBe(true);
  expect(result.body).toContain("indexation");
});
it("does not substitute unknown liquids or infer a current blank row", async () => {
  for (const cargoName of ["mystery liquid", "OTHER A/B/C CHEMICALS ON MPCB APPROVED LIST"]) {
    const result = await lookupTariff({ port: "BPCL Liquid Cargo Jetty", charges: ["cargo"], callDate: "2026-10-18", cargoName, cargoTonnes: "1000", cargoTraffic: "exim", cargoDirection: "import" } as TariffInput);
    expect(result.status).toBe("unresolved"); expect(result.totals).toBeUndefined();
  }
});
