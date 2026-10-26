import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { estimate, type EstimateRequest } from "../../src/lib/berthwise/rulebook/calculate";
import { cargoKind, namesCargo } from "../../src/lib/berthwise/rulebook/cargo";
import { portBookSchema } from "../../src/lib/berthwise/rulebook/schema";
import { keepStay, readConversation } from "../../src/lib/berthwise/user-input";

/** Wharfage figures worked out by hand from each port's printed table. */
const book = (id: string) => portBookSchema.parse(JSON.parse(readFileSync(path.resolve(__dirname, "../../data/rulebook", `${id}.json`), "utf8")));
const wharfage = (port: string, request: EstimateRequest) => estimate(book(port), { date: "2026-10-25", status: "foreign", vesselType: "bulk", grt: "30000", hours: "24", charges: ["wharfage"], ...request });
const lines = (port: string, request: EstimateRequest) => wharfage(port, request).lines.map(line => [line.chargeId, line.amount]);

describe("wharfage", () => {
  it("prices a tonne of cargo at the port's printed rate", () => {
    // Paradip coal import, foreign cargo: 50,000 t × Rs 60.43.
    expect(lines("paradip", { cargo: { class: "coal", tonnes: "50000", direction: "import" } })).toEqual([["wharfage-coal", "3021500"]]);
    // Mumbai steel export, coastal cargo: 8,000 t × Rs 120.
    expect(lines("mumbai", { status: "coastal", cargo: { class: "steel", tonnes: "8000", direction: "export" } })).toEqual([["wharfage-steel", "960000"]]);
    // Mundra coking coal has its own row (Rs 90); Pipavav prices it as coal (Rs 60).
    expect(lines("mundra", { cargo: { class: "coking-coal", tonnes: "1000" } })).toEqual([["wharfage-coking-coal", "90000"]]);
    expect(lines("pipavav", { cargo: { class: "coking-coal", tonnes: "1000" } })).toEqual([["wharfage-coal", "60000"]]);
    // Deendayal crude: Rs 28.38 at Vadinar's SPM, Rs 36.50 at Kandla's oil jetties.
    expect(lines("deendayal", { terminal: "vadinar", vesselType: "tanker", cargo: { class: "crude-oil", tonnes: "100000" } })).toEqual([["wharfage-crude-oil", "2838000"]]);
    expect(lines("deendayal", { terminal: "kandla", vesselType: "tanker", cargo: { class: "crude-oil", tonnes: "100000" } })).toEqual([["wharfage-crude-oil", "3650000"]]);
  });

  it("prices containers per 20-foot and 40-foot box", () => {
    // Chennai, foreign: 500 TEU of which 100 are 40-foot = 300 × Rs 1,324 + 100 × Rs 1,986.
    expect(lines("chennai", { vesselType: "container", cargo: { class: "containers", teu: "500", fortyFoot: "100" } }))
      .toEqual([["wharfage-containers-20", "397200"], ["wharfage-containers-40", "198600"]]);
    // Without a split, every TEU is taken as a 20-foot box, and the estimate says so.
    const plain = wharfage("chennai", { vesselType: "container", cargo: { class: "containers", teu: "200" } });
    expect(plain.lines.map(line => line.amount)).toEqual(["264800"]);
    expect(plain.assumptions).toContain("Assumed all 200 TEU are 20-foot containers; 40-foot containers are charged at their own rate.");
    // Paradip charges the box and the cargo inside it separately: 10 × Rs 95.55 + 10 × Rs 621.08.
    expect(lines("paradip", { vesselType: "container", cargo: { class: "containers", teu: "10" } }))
      .toEqual([["wharfage-container-box-20", "955.5"], ["wharfage-container-cargo-20", "6210.8"]]);
  });

  it("asks what the cargo is, once, and which product when the port splits oil products", () => {
    const unknown = wharfage("mundra", { cargo: { tonnes: "1000" } });
    expect(unknown.lines).toEqual([]);
    expect(unknown.questions).toHaveLength(1);
    expect(unknown.questions[0]).toMatch(/^What cargo will be handled: coal, coking coal, iron ore, .*, or something else\?$/);
    expect(wharfage("kamarajar", { cargo: { class: "petroleum-products", tonnes: "1000" } }).questions)
      .toEqual([expect.stringMatching(/^Which product is it: .*diesel.*naphtha.*\?$/)]);
    expect(wharfage("paradip", { cargo: { class: "coal", tonnes: "1000" } }).questions).toEqual(["Is the cargo being discharged here (import) or loaded here (export)?"]);
  });

  it("says why wharfage isn't included instead of leaving it out", () => {
    expect(wharfage("jnpa", { vesselType: "container", cargo: { class: "containers", teu: "100" } }).notCovered)
      .toEqual([{ type: "wharfage", reason: "At JNPA, wharfage on containers is part of each container terminal's handling charge, which this estimate doesn't include." }]);
    expect(wharfage("mumbai", { vesselType: "tanker", cargo: { class: "diesel", tonnes: "1000" } }).notCovered[0]!.reason).toMatch(/Jawahar Dweep and Pir Pau/);
    // Kamarajar prints a coal rate for coastal cargo only.
    expect(wharfage("kamarajar", { cargo: { class: "coal", tonnes: "1000" } }).notCovered[0]!.reason).toBe("We hold no wharfage rate for coal at Kamarajar Port (Ennore), so wharfage isn't included.");
    expect(lines("kamarajar", { status: "coastal", cargo: { class: "coal", tonnes: "1000" } })).toEqual([["wharfage-coal", "146920"]]);
  });

  it("follows the settlement with Codex's second reading", () => {
    // Pipavav's "tonne" for light liquids is 1,000 litres, so a weight can't price it.
    expect(wharfage("pipavav", { vesselType: "tanker", cargo: { class: "diesel", tonnes: "1000" } }).notCovered[0]!.reason).toMatch(/per 1,000 litres/);
    expect(lines("pipavav", { cargo: { class: "fertilizer-raw-materials", tonnes: "1000" } })).toEqual([["wharfage-fertilizer-raw", "60000"]]);
    // Mumbai: export containers pay per box on the cargo inside; import containers by commodity.
    expect(lines("mumbai", { vesselType: "container", cargo: { class: "containers", teu: "30", fortyFoot: "10", direction: "export" } }))
      .toEqual([["wharfage-container-cargo-20", "24890"], ["wharfage-container-cargo-40", "37330"]]);
    expect(wharfage("mumbai", { vesselType: "container", cargo: { class: "containers", teu: "30", direction: "import" } }).notCovered[0]!.reason).toMatch(/import containers pay wharfage on the cargo inside/);
    expect(wharfage("mumbai", { vesselType: "tanker", cargo: { class: "crude-oil", tonnes: "1000" } }).notCovered[0]!.reason).toMatch(/docks only/);
    // Hazira prices named oil products only, so "oil products" asks which.
    expect(wharfage("hazira", { cargo: { class: "petroleum-products", tonnes: "1000" } }).questions).toEqual([expect.stringMatching(/^Which product is it: /)]);
    expect(wharfage("jnpa", { terminal: "jsw-jnpt-liquid", vesselType: "tanker", cargo: { class: "chemicals", tonnes: "1000" } }).notCovered[0]!.reason).toMatch(/31 March 2025/);
  });

  it("is part of the whole bill when a cargo is given", () => {
    const bill = estimate(book("hazira"), { date: "2026-10-25", status: "foreign", vesselType: "bulk", grt: "30000", hours: "24", cargo: { class: "coal", tonnes: "40000" } });
    expect(bill.lines.find(line => line.type === "wharfage")).toMatchObject({ amount: "2640000", currency: "INR" });
    expect(bill.lines.some(line => line.type === "port-dues")).toBe(true);
    expect(bill.assumptions).toContain("Wharfage is charged on the cargo, usually to the cargo owner, at the foreign cargo rate.");
  });
});

describe("cargo words", () => {
  it("names the cargo kind from everyday words", () => {
    expect(["steam coal", "crude palm oil", "coking coal", "HSD", "iron ore pellets", "HR coils", "urea", "rock phosphate", "LPG", "wheat"].map(cargoKind))
      .toEqual(["coal", "edible-oil", "coking-coal", "diesel", "iron-ore", "steel", "fertilizer", "fertilizer-raw-materials", "lpg", "food-grains"]);
    expect(cargoKind("salt")).toBeUndefined();
    expect(namesCargo("petroleum-products", "we're discharging diesel")).toBe(true);
  });

  it("keeps only the cargo the user gave", () => {
    const heard = readConversation([{ role: "user", content: "Paradip, 32,000 GRT bulk carrier, 2 days, discharging 50,000 tonnes of coal" }]);
    expect(keepStay({ hoursAlongside: "48", cargo: { class: "coal", tonnes: "50000", direction: "import" } }, heard).cargo).toEqual({ class: "coal", tonnes: "50000", direction: "import" });
    // The ship's GRT isn't cargo, and a kind the user never named is dropped.
    expect(keepStay({ hoursAlongside: "48", cargo: { class: "steel", tonnes: "32000" } }, heard).cargo).toBeUndefined();
    expect(keepStay({ hoursAlongside: "48", cargo: { class: "steel", tonnes: "50000" } }, heard).cargo).toEqual({ tonnes: "50000" });
    // A bare reply to "How many tonnes of cargo?" counts.
    const reply = readConversation([{ role: "user", content: "Cost of a call at Hazira with coal" }, { role: "assistant", content: "How many tonnes of cargo will be handled?" }, { role: "user", content: "40000" }]);
    expect(keepStay({ cargo: { class: "coal", tonnes: "40000" } }, reply).cargo).toEqual({ class: "coal", tonnes: "40000" });
  });
});
