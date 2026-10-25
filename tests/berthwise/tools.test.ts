import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { businessTools } from "../../src/lib/berthwise/tools";
import { resolvePort } from "../../src/lib/berthwise/rulebook/books";

const tools = businessTools();
// Input goes through the tool's schema first, as it does when the model calls it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (name: string, input: unknown) => tools[name]!.execute!((tools[name]!.inputSchema as ZodType).parse(input) as never, { toolCallId: "t", messages: [], context: {} }) as Promise<any>;
const date = "2026-10-25";

describe("port names", () => {
  it("finds ports, terminals and berths by any name", () => {
    expect(resolvePort("Nhava Sheva")).toMatchObject({ port: { id: "jnpa" } });
    expect(resolvePort("NSICT")).toMatchObject({ port: { id: "jnpa" }, terminal: "nsict" });
    expect(resolvePort("Kandla")).toMatchObject({ port: { id: "deendayal" }, terminal: "kandla" });
    expect(resolvePort("Ennore port")).toMatchObject({ port: { id: "kamarajar" } });
    expect(resolvePort("Port of Paradeep")).toMatchObject({ port: { id: "paradip" } });
    expect(resolvePort("Colombo")).toBeUndefined();
  });
});

describe("estimate_port_call", () => {
  it("prices one call with its working, sources, assumptions and a summary", async () => {
    const result = await run("estimate_port_call", { ship: { grt: "32,450", type: "bulk" }, calls: [{ port: "Paradip", date, hoursAlongside: 48 }] });
    const call = result.card.calls[0];
    expect(result.card.kind).toBe("estimate");
    expect(call.estimate.port.id).toBe("paradip");
    expect(call.estimate.lines.map((line: { type: string }) => line.type)).toEqual(["port-dues", "pilotage-towage", "berth-hire"]);
    expect(call.estimate.lines.every((line: { working: string; source: { page: string } }) => line.working && line.source.page)).toBe(true);
    expect(call.estimate.assumptions).toContain("Assumed a foreign-going ship.");
    expect(result.summary).toContain(`Total before GST: USD ${call.estimate.totals[0].display}`);
  });

  it("prices a voyage for the same ship at both ports and adds it up", async () => {
    const result = await run("estimate_port_call", { ship: { grt: "40000" }, calls: [{ port: "Mundra", date, hoursAlongside: "36" }, { port: "Hazira", date, hoursAlongside: "30" }] });
    const [departure, arrival] = result.card.calls;
    expect([departure.role, arrival.role]).toEqual(["departure", "arrival"]);
    expect(result.card.ship).toMatchObject({ type: "bulk", status: "foreign" });
    const sum = Number(departure.estimate.totals[0].amount) + Number(arrival.estimate.totals[0].amount);
    expect(result.card.voyageTotals).toEqual([expect.objectContaining({ currency: "USD" })]);
    expect(Number(result.card.voyageTotals[0].amount)).toBeCloseTo(sum, 6);
    expect(result.summary).toContain("Voyage total before GST");
  });

  it("converts to rupees only with the user's exchange rate", async () => {
    const plain = await run("estimate_port_call", { ship: { grt: "20000", type: "container" }, calls: [{ port: "NSIGT", date, hoursAlongside: "20" }] });
    expect(plain.card.inRupees).toBeUndefined();
    expect(plain.card.calls[0].estimate.totals.map((total: { currency: string }) => total.currency).sort()).toEqual(["INR", "USD"]);
    const converted = await run("estimate_port_call", { ship: { grt: "20000", type: "container" }, calls: [{ port: "NSIGT", date, hoursAlongside: "20" }], usdToInr: "84.5" });
    const [inr, usd] = ["INR", "USD"].map(currency => Number(converted.card.calls[0].estimate.totals.find((total: { currency: string }) => total.currency === currency).amount));
    expect(Number(converted.card.inRupees.calls[0].total.amount)).toBeCloseTo(inr! + usd! * 84.5, 6);
  });

  it("asks for what it needs and says plainly when a port isn't covered", async () => {
    const noSize = await run("estimate_port_call", { ship: {}, calls: [{ port: "Chennai", date }] });
    expect(noSize.card.calls[0].estimate.questions).toContain("What is the ship's gross tonnage (GRT)?");
    expect(await run("estimate_port_call", { ship: { grt: "1000" }, calls: [{ port: "Colombo" }] })).toEqual({ error: expect.stringContaining("isn't one of the ports we cover") });
    const pier = await run("estimate_port_call", { ship: { grt: "1000" }, calls: [{ port: "Mumbai", berth: "Pier 99" }] });
    expect(pier.card.calls[0].estimate.assumptions).toEqual(expect.arrayContaining([expect.stringContaining('has no terminal or berth called "Pier 99" in our rule book, so it was left out')]));
  });

  it("assumes the berth a ship type makes obvious, and ignores anchorage the user never mentioned", async () => {
    const tools = businessTools();
    const tool = tools.estimate_port_call!;
    const said = (text: string) => ({ toolCallId: "t", messages: [{ role: "user" as const, content: text }], context: {} });
    const kandla = await tool.execute!((tool.inputSchema as ZodType).parse({ ship: { grt: "20000", type: "tanker" }, calls: [{ port: "Kandla", date, hoursAlongside: "36", anchorageHours: "24" }] }) as never,
      said("berth hire at kandla for a 20k GT liquid tanker, 36 hours") as never) as { card: { calls: Array<{ estimate: { berth?: string; assumptions: string[]; lines: Array<{ type: string }> } }> } };
    const call = kandla.card.calls[0]!.estimate;
    expect(call.berth).toBe("Liquid cargo berths");
    expect(call.assumptions).toContain("Assumed the liquid cargo berths, as for a tanker ship.");
    expect(call.lines.map(line => line.type)).not.toContain("anchorage");
    const bulk = await run("estimate_port_call", { ship: { grt: "20000", type: "bulk" }, calls: [{ port: "Kandla", date, hoursAlongside: "36" }] });
    expect(bulk.card.calls[0].estimate.questions[0]).toContain("Which berth");
  });

  it("treats placeholders and zeros from the model as not given", async () => {
    const result = await run("estimate_port_call", {
      ship: { name: "Unspecified bulk ship", imo: "0000000", grt: "40000", nrt: "0", loa: "0", type: "bulk", status: "foreign" },
      calls: [{ port: "Mundra", terminal: "Mundra", berth: "Unspecified berth", date, hoursAlongside: "24", anchorageHours: "0", tugs: 0, cargo: { class: "bulk cargo", tonnes: "0" } }],
    });
    const call = result.card.calls[0].estimate;
    expect(result.card.ship).toEqual({ grt: "40000", type: "bulk", status: "foreign" });
    expect(call.terminal).toBeUndefined();
    expect(call.lines.map((line: { type: string }) => line.type)).not.toContain("anchorage");
    expect(call.lines.map((line: { type: string }) => line.type)).not.toContain("wharfage");
    expect(call.assumptions.join(" ")).not.toContain("left out");
  });
});

describe("compare_ports", () => {
  it("ranks berth hire in one currency and keeps the same ship everywhere", async () => {
    const result = await run("compare_ports", { ports: ["Mumbai", "Paradip"], view: "berth-hire", ship: { grt: "30000", type: "general-cargo" }, hoursAlongside: "24", date });
    expect(result.card.kind).toBe("comparison");
    expect(result.card.rows.map((row: { key: string }) => row.key)).toEqual(["berth-hire"]);
    expect(result.card.ports[0].questions).toEqual(["Which berth will the ship use: Indira Dock & its Harbour walls, Ballard Pier and Ballard Pier Extension, Prince's & Victoria Docks and its harbour walls?"]);
    expect(result.card.ranking).toBeUndefined();
  });

  it("shows a charge a port doesn't publish as missing, not zero", async () => {
    const result = await run("compare_ports", { ports: ["Chennai", "Hazira"], view: "whole-bill", ship: { grt: "30000", type: "bulk" }, hoursAlongside: "24", date });
    const pilotage = result.card.rows.find((row: { key: string }) => row.key === "pilotage");
    expect(pilotage.cells.every(Boolean)).toBe(true);
    expect(result.card.ranking.map((item: { port: string }) => item.port)).toHaveLength(2);
  });

  it("compares tariffs without ship figures", async () => {
    const result = await run("compare_ports", { ports: ["JNPA", "Mundra"], view: "tariff", ship: { type: "container" }, date });
    expect(result.card.kind).toBe("tariff-comparison");
    expect(result.card.ports[0].charges.find((charge: { type: string }) => charge.type === "pilotage-towage").rates[0].text)
      .toBe("up to 30,000 GRT: USD 0.3464 per GRT; over 30,000 up to 60,000 GRT: USD 10,393 + USD 0.2776 per GRT above 30,000; over 60,000 GRT: USD 18,722 + USD 0.2429 per GRT above 60,000 (minimum USD 275.4)");
  });
});

describe("port_tariff and list_ports", () => {
  it("shows what changed since the previous schedule", async () => {
    const result = await run("port_tariff", { port: "Paradip", date, vesselType: "bulk", status: "foreign" });
    expect(result.card.version.effectiveFrom).toBe("2026-10-10");
    expect(result.card.changes.since.effectiveFrom).toBe("2026-05-01");
    expect(result.card.changes.items.map((item: { label: string }) => item.label)).toContain("Port dues");
  });

  it("lists all twelve ports with their checked dates", async () => {
    const result = await run("list_ports", {});
    expect(result.card.ports).toHaveLength(12);
    expect(result.card.ports.every((row: { checkedOn: string }) => /^\d{4}-\d{2}-\d{2}$/.test(row.checkedOn))).toBe(true);
  });
});
