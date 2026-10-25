import { describe, expect, it } from "vitest";
import { estimate } from "../../src/lib/berthwise/rulebook/calculate";
import { portBookSchema } from "../../src/lib/berthwise/rulebook/schema";
import raw from "./fixtures/example-port.json";

const port = portBookSchema.parse(raw);
const ship = { date: "2026-10-18", grt: "32450", hours: "48", berth: "north-quay" };
const amounts = (result: ReturnType<typeof estimate>) => Object.fromEntries(result.lines.map(line => [line.chargeId, line.amount]));

describe("rule-book calculator (hand-checked against Example Port)", () => {
  it("prices a whole call with its working and sources", () => {
    const result = estimate(port, ship);
    expect(amounts(result)).toEqual({ "port-dues": "12980", "pilotage-towage": "19225", "berth-hire": "15576", mooring: "300" });
    expect(result.totals).toEqual([{ currency: "USD", amount: "48081", display: "48,081.00" }]);
    expect(result.lines.find(line => line.chargeId === "pilotage-towage")!.working).toBe("USD 18,000 for the first 30,000 GRT + 2,450 GRT × USD 0.5000");
    expect(result.lines.find(line => line.chargeId === "berth-hire")!.working).toBe("32,450 GRT × USD 0.0100 × 48 hours (each started period counts)");
    expect(result.lines[0]!.source).toEqual({ title: "Example Port Scale of Rates 2026-27", url: "https://example.org/sor-2026.pdf", page: "2", section: "2.1" });
    expect(result.assumptions).toEqual(["Assumed a foreign-going ship.", "Assumed a general cargo ship.", "Assumed 2 movements (arrival and departure)."]);
    expect(result.questions).toEqual([]);
  });

  it("asks only for what changes the price, and prices the rest", () => {
    const result = estimate(port, { date: "2026-10-18", grt: "32450" });
    expect(result.questions).toEqual(["Which berth will the ship use: North Quay, South Quay?"]);
    expect(result.lines.map(line => line.chargeId)).toEqual(["port-dues", "pilotage-towage", "mooring"]);
    const noHours = estimate(port, { date: "2026-10-18", grt: "32450", berth: "south-quay" });
    expect(noHours.questions).toEqual(["How many hours will the ship be alongside the berth?"]);
  });

  it("applies minimum tonnage, started hours, bands and minimum charges", () => {
    expect(amounts(estimate(port, { ...ship, grt: "500", hours: "47.2" }))).toMatchObject({ "pilotage-towage": "600", "berth-hire": "480", mooring: "200" });
    expect(amounts(estimate(port, { ...ship, grt: "70000" }))).toMatchObject({ "pilotage-towage": "37000" });
    const cargo = estimate(port, { ...ship, charges: ["wharfage"], cargo: { class: "coal", tonnes: "10" } });
    expect(cargo.lines[0]).toMatchObject({ amount: "1000", currency: "INR", display: "1,000.00" });
    expect(cargo.lines[0]!.working).toContain("minimum charge INR 1000 applies");
    expect(estimate(port, { ...ship, charges: ["wharfage"], cargo: { tonnes: "10" } }).questions).toEqual(["What cargo will be handled: coal, steel, or something else?"]);
  });

  it("uses rupees for coastal ships and reports charges it cannot price", () => {
    const coastal = estimate(port, { ...ship, status: "coastal" });
    expect(coastal.lines.find(line => line.chargeId === "port-dues")).toMatchObject({ currency: "INR", amount: "324500", display: "3,24,500.00" });
    expect(coastal.notCovered.map(item => item.type)).toEqual(["pilotage-towage", "berth-hire"]);
    expect(estimate(port, { ...ship, charges: ["anchorage"] }).notCovered).toEqual([{ type: "anchorage", reason: "Anchorage isn't in the Example Port Authority rate schedule we hold." }]);
  });

  it("answers a request for towage with the combined charge that includes it", () => {
    const result = estimate(port, { ...ship, charges: ["towage"] });
    expect(result.lines.map(line => line.chargeId)).toEqual(["pilotage-towage"]);
    expect(result.assumptions).toContain("Towage is included in pilotage and towage.");
    expect(result.notCovered).toEqual([]);
  });

  it("adds a separate surcharge of a type the combined charge includes", () => {
    const withSurcharge = portBookSchema.parse({ ...raw, versions: [{ ...raw.versions[0], charges: [...raw.versions[0]!.charges, {
      id: "fuel-surcharge", type: "pilotage", label: "Fuel surcharge on pilotage", basis: "grt",
      rates: [{ when: {}, currency: "USD", bands: [{ rate: "0.2" }] }], source: { document: "sor-2026", page: 4 } }] }] });
    const result = estimate(withSurcharge, ship);
    expect(amounts(result)).toMatchObject({ "pilotage-towage": "19225", "fuel-surcharge": "6490" });
  });

  it("scales a per-day or per-hour minimum with the stay", () => {
    const berthHire = raw.versions[0]!.charges.find(charge => charge.id === "berth-hire")!;
    const withMinimum = (minimumPer: "hour" | "day", minimumAmount: string) => portBookSchema.parse({ ...raw, versions: [{ ...raw.versions[0], charges: [{
      ...berthHire, minimumQuantity: undefined, timeRounding: "exact",
      rates: [{ when: {}, currency: "USD", bands: [{ rate: "0.0100" }], minimumAmount, minimumPer }] }] }] });
    // 2,000 GRT × 0.01 × 30 hours = 600, below 810 × 2 started days.
    const daily = estimate(withMinimum("day", "810"), { ...ship, grt: "2000", hours: "30" });
    expect(daily.lines[0]).toMatchObject({ amount: "1620" });
    expect(daily.lines[0]!.working).toBe("2,000 GRT × USD 0.0100 × 30 hours; minimum charge USD 810 per day × 2 days applies");
    expect(estimate(withMinimum("hour", "9.82"), { ...ship, grt: "500", hours: "10.5" }).lines[0]).toMatchObject({ amount: "103.11" });
    expect(estimate(withMinimum("day", "810"), { ...ship, grt: "32450", hours: "30" }).lines[0]).toMatchObject({ amount: "9735" });
    const shortStay = portBookSchema.parse({ ...raw, versions: [{ ...raw.versions[0], charges: [{ ...berthHire, minimumQuantity: undefined,
      rates: [{ when: {}, currency: "USD", bands: [{ rate: "0.0100" }], minimumHours: "24" }] }] }] });
    expect(estimate(shortStay, { ...ship, grt: "2000", hours: "10" }).lines[0]).toMatchObject({ amount: "480", working: "2,000 GRT × USD 0.0100 × 24 hours (each started period counts) (charged for at least 24 hours)" });
    expect(estimate(shortStay, { ...ship, grt: "2000", hours: "30" }).lines[0]).toMatchObject({ amount: "600" });
  });

  it("does not price a ship larger than the schedule's largest band", () => {
    const capped = portBookSchema.parse({ ...raw, versions: [{ ...raw.versions[0], charges: [{ ...raw.versions[0]!.charges[0], rates: [{ when: {}, currency: "USD", bands: [{ upTo: "60000", rate: "0.4" }] }] }] }] });
    expect(estimate(capped, { ...ship, grt: "60001" }).notCovered).toEqual([{ type: "port-dues", reason: "Port dues: the schedule's rates stop at 60,000 GRT." }]);
    expect(estimate(capped, { ...ship, grt: "60000" }).lines).toHaveLength(1);
  });

  it("refuses dates outside the schedules it holds", () => {
    const result = estimate(port, { ...ship, date: "2025-12-01" });
    expect(result.lines).toEqual([]);
    expect(result.notCovered[0]!.reason).toContain("2026-05-01 to 2027-04-30");
  });

  it("states the date it assumed", () => {
    expect(estimate(port, { grt: "32450", hours: "48", berth: "north-quay" }, "2026-10-25").assumptions).toContain("Call date assumed to be today, 25 October 2026.");
  });
});
