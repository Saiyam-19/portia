import { expect, it } from "vitest";
import { QuoteSession } from "../../src/lib/portia/session";

it("compares matching mixed-currency components without dropping or duplicating a currency", async () => {
  const session = new QuoteSession("mixed-currency"); await session.initialize([]);
  const ids: string[] = [];
  for (const gt of ["10000", "20000"]) {
    session.beginStep();
    const result = await session.update({ pricing: "official", services: ["berth", "pilotage"], call: { port: "BMCT", callDate: "2026-10-18", service: "foreign", selfPropelled: true, gt, movements: "2", occupancy: { hours: "1" } } });
    expect(result.status).toBe("calculated");
    if ("quoteId" in result) ids.push(result.quoteId);
  }
  const missing = await session.compare({ quoteIds: ids, currency: "INR" });
  expect(missing.body).toContain("USD to INR");
  const comparison = await session.compare({ quoteIds: ids, currency: "INR", exchangeRates: [{ from: "USD", to: "INR", rate: "80", date: "2026-10-18" }] });
  expect(comparison.status).toBe("calculated");
  expect("difference" in comparison && comparison.difference).toBe("300900");
  expect("converted" in comparison && comparison.converted.map(row => row.amount)).toEqual(["300900", "601800"]);
  const conflicting = await session.compare({ quoteIds: ids, currency: "INR", exchangeRates: [{ from: "USD", to: "INR", rate: "80", date: "2026-10-18" }, { from: "USD", to: "INR", rate: "90", date: "2026-10-18" }] });
  expect(conflicting.status).toBe("error");
});

it("line rounding includes legacy handling and newly sourced MUC", async () => {
  const session = new QuoteSession("mixed-decomposition"); await session.initialize([]);
  const ids: string[] = [];
  for (const ladenContainers of ["1", "2"]) {
    session.beginStep();
    const result = await session.update({ pricing: "official", services: ["handling", "muc"], call: { port: "NSIGT", callDate: "2026-10-18", service: "foreign", containerSize: "20", ladenContainers, emptyContainers: "0", handlingMode: "road", specialCargo: false, cargoTraffic: "exim" } });
    expect(result.status).toBe("calculated"); if ("quoteId" in result) ids.push(result.quoteId);
  }
  const compared = await session.compare({ quoteIds: ids, currency: "INR", rounding: { stage: "line", decimals: 0, scope: "all-comparison-amounts" } });
  expect(compared.status, compared.body).toBe("calculated");
  expect("converted" in compared && compared.converted.map(row => row.amount)).toEqual(["5878", "11756"]);
});
