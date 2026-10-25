import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { estimate, type EstimateRequest } from "../../src/lib/berthwise/rulebook/calculate";
import { portBookSchema } from "../../src/lib/berthwise/rulebook/schema";

/** Figures the earlier, separately reviewed tariff engine produced for the same
 * calls (tests/portia/tariffs.test.ts before it was retired), priced again from
 * the rule book. */
const book = (id: string) => portBookSchema.parse(JSON.parse(readFileSync(path.resolve(__dirname, "../../data/rulebook", `${id}.json`), "utf8")));
const amount = (port: string, request: EstimateRequest) => estimate(book(port), { date: "2026-10-25", status: "foreign", ...request }).totals;

describe("rule book against the earlier reviewed engine", () => {
  it.each<[string, string, EstimateRequest, string]>([
    ["GTI berth hire", "jnpa", { terminal: "gti", vesselType: "tanker", grt: "28600", hours: "14", charges: ["berth-hire"] }, "2122.12"],
    ["JSW JNPT Liquid berth hire and port dues", "jnpa", { terminal: "jsw-jnpt-liquid", vesselType: "tanker", grt: "16800", hours: "30", charges: ["berth-hire", "port-dues"] }, "5288.64"],
    ["JNPA pilotage with towage", "jnpa", { vesselType: "tanker", grt: "10000", charges: ["pilotage", "towage"] }, "3464"],
    ["Mumbai Indira Dock berth hire", "mumbai", { berth: "indira-dock", vesselType: "general-cargo", grt: "14601", hours: "20", charges: ["berth-hire"] }, "4000.674"],
    ["Mumbai Princes Dock berth hire", "mumbai", { berth: "princes-victoria-docks", vesselType: "general-cargo", grt: "14601", hours: "20", charges: ["berth-hire"] }, "3183.018"],
    ["Jaigarh port dues minimum", "jaigarh", { berth: "mechanized-bulk", vesselType: "bulk", grt: "5000", charges: ["port-dues"] }, "2000"],
  ])("%s", (_, port, request, expected) => {
    const totals = amount(port, request);
    expect(totals.map(total => [total.currency, Number(total.amount)])).toEqual([["USD", Number(expected)]]);
  });

  it("adds Kattupalli's 10% surcharge on port dues", () => {
    const result = estimate(book("kattupalli"), { date: "2026-10-25", grt: "30000", charges: ["port-dues"] });
    expect(result.lines.map(line => [line.chargeId, line.currency, line.amount])).toEqual([["port-dues", "INR", "312000"], ["port-dues-surcharge", "INR", "31200"]]);
    expect(result.lines[1]!.working).toBe("10% of port dues (payable to tamil nadu maritime board) (INR 3,12,000.00)");
  });

  it("uses Chennai's VLCC berth hire, and tanker rates elsewhere for a VLCC", () => {
    const chennai = estimate(book("chennai"), { date: "2026-10-25", status: "foreign", vesselType: "vlcc", grt: "150000", hours: "24", charges: ["berth-hire", "port-dues"] });
    expect(chennai.lines.map(line => [line.label, line.amount])).toEqual([["Port dues", "75675"], ["Berth hire", "28800"]]);
    const paradip = estimate(book("paradip"), { date: "2026-10-25", status: "foreign", vesselType: "vlcc", grt: "150000", charges: ["port-dues"] });
    expect(paradip.lines).toHaveLength(1);
  });

  it("prices container berth hire at Kamarajar from the container terminal's tariff since 1 April 2026", () => {
    const now = estimate(book("kamarajar"), { date: "2026-10-25", status: "foreign", vesselType: "container", grt: "50000", hours: "24", charges: ["berth-hire"] });
    expect(now.lines.map(line => [line.chargeId, line.amount])).toEqual([["berth-hire-aectpl", "24480"]]);
    expect(estimate(book("kamarajar"), { date: "2026-03-01", status: "foreign", vesselType: "container", grt: "50000", hours: "24", charges: ["berth-hire"] }).lines).toEqual([]);
  });

  it("charges port dues again for each validity period started (Codex finding 7)", () => {
    const hazira = (hours: string) => estimate(book("hazira"), { date: "2026-10-25", status: "foreign", vesselType: "bulk", grt: "30000", hours, charges: ["port-dues"] }).lines[0]!;
    expect(hazira("384")).toMatchObject({ amount: "1789.2" });
    expect(hazira("384").working).toContain("charged 2 times, once for each 15 days or part of them in port");
    expect(hazira("360").amount).toBe("894.6");
    // Chennai: once in thirty days; Paradip charges once per entry however long the stay.
    expect(estimate(book("chennai"), { date: "2026-10-25", status: "foreign", vesselType: "bulk", grt: "30000", hours: "721", charges: ["port-dues"] }).lines[0]!.amount).toBe("23130");
    expect(estimate(book("paradip"), { date: "2026-10-25", status: "foreign", vesselType: "bulk", grt: "30000", hours: "721", charges: ["port-dues"] }).lines[0]!.amount).toBe("12240");
  });

  it("says cargo charges aren't included when a cargo is given (Codex finding 2)", () => {
    const result = estimate(book("paradip"), { date: "2026-10-25", status: "foreign", vesselType: "bulk", grt: "30000", hours: "24", cargo: { class: "salt", tonnes: "10000" } });
    expect(result.totals).toEqual([expect.objectContaining({ amount: "40858.32" })]);
    expect(result.notCovered).toContainEqual({ type: "wharfage", reason: "Cargo charges (wharfage) at Paradip Port Authority aren't in our rule book yet, so they aren't included." });
  });

  it("NSIGT berth hire in rupees for a foreign ship", () => {
    const totals = amount("jnpa", { terminal: "nsigt", vesselType: "container", grt: "31200", hours: "18", charges: ["berth-hire"] });
    expect(totals).toEqual([{ currency: "INR", amount: "1149932.16", display: "11,49,932.16" }]);
  });
});
