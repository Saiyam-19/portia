/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import betterAuthTest from "@convex-dev/better-auth/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";
import { api, components } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { shipKey, type FleetAccess, type FleetShip } from "../../src/lib/berthwise/fleet";
import { businessTools } from "../../src/lib/berthwise/tools";

const modules = import.meta.glob("../../convex/**/*.ts");
function setup() { const t = convexTest(schema, modules); agentTest.register(t); betterAuthTest.register(t); return t; }
async function account(t: ReturnType<typeof setup>, email: string) {
  const now = Date.now();
  const user = await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: "Synthetic account", email, emailVerified: false, createdAt: now, updatedAt: now } } });
  const session = await t.mutation(components.betterAuth.adapter.create, { input: { model: "session", data: { userId: user._id, token: crypto.randomUUID(), expiresAt: now + 3600000, createdAt: now, updatedAt: now } } });
  return t.withIdentity({ subject: user._id, sessionId: session._id });
}
beforeEach(() => { vi.stubEnv("MIGRATION_DEV_ENABLED", "true"); vi.stubEnv("PORTIA_CONVEX_DEPLOYMENT", "brilliant-whale-380"); vi.stubEnv("CONVEX_SITE_URL", "https://brilliant-whale-380.convex.site"); vi.stubEnv("PORTIA_AUTH_MODE", "basic"); });
afterEach(() => vi.unstubAllEnvs());

describe("My fleet in Convex", () => {
  it("saves a ship once and updates it by name or IMO number", async () => {
    const t = setup(); const a = await account(t, "a@example.com");
    const first = await a.mutation(api.fleet.saveShip, { ship: { name: "M.V. Ocean Star", imo: "9876543", grt: "32,450", type: "bulk" } });
    expect(first.created).toBe(true);
    expect(await a.mutation(api.fleet.saveShip, { ship: { name: "Ocean Star", grt: "32450", nrt: "18966" } })).toEqual({ id: first.id, created: false });
    expect(await a.mutation(api.fleet.saveShip, { ship: { name: "Ocean Star II", imo: "9876543", grt: "32450" } })).toEqual({ id: first.id, created: false });
    expect(await a.query(api.fleet.listShips, {})).toEqual([expect.objectContaining({ name: "Ocean Star II", imo: "9876543", grt: "32450" })]);
  });

  it("rejects bad figures and keeps each account's fleet to itself", async () => {
    const t = setup(); const a = await account(t, "a@example.com"); const b = await account(t, "b@example.com");
    await expect(a.mutation(api.fleet.saveShip, { ship: { name: "Bad", grt: "lots" } })).rejects.toThrow("grt");
    const { id } = await a.mutation(api.fleet.saveShip, { ship: { name: "Coastal Pride", grt: "4500", status: "coastal" } });
    expect(await b.query(api.fleet.listShips, {})).toEqual([]);
    await expect(b.mutation(api.fleet.deleteShip, { id: id as never })).rejects.toThrow("Ship not found");
    await expect(b.mutation(api.fleet.saveShip, { id: id as never, ship: { name: "Coastal Pride", grt: "1" } })).rejects.toThrow("Ship not found");
    await a.mutation(api.fleet.deleteShip, { id: id as never });
    expect(await a.query(api.fleet.listShips, {})).toEqual([]);
    expect(await t.query(api.fleet.listShips, {})).toEqual([]);
  });

  it("treats MV, M.V. and plain names as the same ship", () => {
    expect(shipKey("M.V. Ocean Star")).toBe("ocean star");
    expect(shipKey("MT  OCEAN-STAR")).toBe("ocean star");
  });
});

describe("My fleet in the chat", () => {
  const saved: FleetShip[] = [{ id: "s1", name: "MV Ocean Star", imo: "9876543", grt: "32450", nrt: "18966", type: "bulk", status: "foreign", updatedAt: 1 }];
  const fleet: FleetAccess = { list: async () => saved, save: async () => ({ id: "s2", created: true }) };
  const tools = businessTools({ fleet });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = (name: string, input: unknown) => tools[name]!.execute!((tools[name]!.inputSchema as ZodType).parse(input) as never, { toolCallId: "t", messages: [], context: {} }) as Promise<any>;

  it("fills an estimate in from the saved ship when the user names it", async () => {
    const result = await run("estimate_port_call", { ship: { name: "ocean star" }, calls: [{ port: "Paradip", date: "2026-10-25", hoursAlongside: "24" }] });
    expect(result.card.ship).toMatchObject({ name: "MV Ocean Star", grt: "32450", type: "bulk", status: "foreign" });
    expect(result.card.fromFleet).toEqual(["IMO number", "GRT", "NRT", "ship type", "trade"]);
    expect(result.card.calls[0].estimate.assumptions).not.toContain("Assumed a foreign-going ship.");
    expect(result.summary).toContain("From the user's fleet");
  });

  it("lets what the user says now win over the saved figure", async () => {
    const result = await run("estimate_port_call", { ship: { name: "Ocean Star", status: "coastal" }, calls: [{ port: "Paradip", date: "2026-10-25" }] });
    expect(result.card.ship.status).toBe("coastal");
  });

  it("finds, lists and saves ships", async () => {
    expect((await run("find_ship", { imo: "9876543" })).card).toMatchObject({ kind: "ship", ship: { name: "MV Ocean Star" } });
    expect(await run("find_ship", { name: "Sea Breeze" })).toEqual({ found: false, summary: "Sea Breeze isn't in the user's fleet." });
    expect((await run("find_ship", {})).card).toMatchObject({ kind: "fleet", ships: [{ name: "MV Ocean Star" }] });
    const saved = await run("save_ship", { name: "Sea Breeze", grt: "12000", type: "general-cargo" });
    expect(saved.card).toMatchObject({ kind: "ship", saved: "created", ship: { name: "Sea Breeze", grt: "12000" } });
    expect(saved.summary).toBe("Saved in the user's fleet: Sea Breeze, 12,000 GRT, general cargo.");
  });

  it("has no fleet tools when no fleet is connected", () => {
    expect(Object.keys(businessTools())).not.toContain("save_ship");
  });
});
