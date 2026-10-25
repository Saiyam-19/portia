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

  it("NSIGT berth hire in rupees for a foreign ship", () => {
    const totals = amount("jnpa", { terminal: "nsigt", vesselType: "container", grt: "31200", hours: "18", charges: ["berth-hire"] });
    expect(totals).toEqual([{ currency: "INR", amount: "1149932.16", display: "11,49,932.16" }]);
  });
});
