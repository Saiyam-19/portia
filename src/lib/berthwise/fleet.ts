import { z } from "zod";
import { statusSchema, vesselTypeSchema } from "./rulebook/schema";

/** "My fleet": a company types each ship's particulars once, from its tonnage
 * certificate, and estimates fill them in by name or IMO number afterwards.
 * Shared by the Convex functions and the chat tools. */

const decimal = z.preprocess(
  value => typeof value === "number" ? String(value) : typeof value === "string" ? value.replace(/,/g, "").trim() : value,
  z.string().regex(/^\d{1,7}(?:\.\d{1,3})?$/, "Use digits only, e.g. 32450 or 228.5."),
);
export const fleetShipSchema = z.object({
  name: z.string().trim().min(1).max(80),
  imo: z.string().trim().regex(/^\d{7}$/, "An IMO number has 7 digits.").optional(),
  grt: decimal.describe("Gross tonnage (GT/GRT) from the tonnage certificate."),
  nrt: decimal.optional().describe("Net tonnage (NT/NRT)."),
  loa: decimal.optional().describe("Length overall in metres."),
  type: vesselTypeSchema.optional(),
  status: statusSchema.optional().describe("foreign-going or coastal, if the ship always trades one way."),
}).strict();
export type FleetShipInput = z.infer<typeof fleetShipSchema>;
export type FleetShip = FleetShipInput & { id: string; updatedAt: number };

export const MAX_FLEET_SHIPS = 200;

/** "M.V. Ocean Star", "MV OCEAN STAR" and "ocean star" are the same ship. */
export function shipKey(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()
    .replace(/^(?:m ?v|m ?t|m ?s|s ?s|mv|mt|ms|ss)\s+/, "");
}

const PREFIXES = new Set(["m", "v", "t", "s", "mv", "mt", "ms", "ss"]);
/** "ocean star mv ocean star mv ocean s" is "ocean star" said several times, cut short. */
function repeats(key: string, name: string): boolean {
  const words = name.split(" ");
  return Boolean(name) && key.startsWith(`${name} `) && key.split(" ").every(word => PREFIXES.has(word) || words.some(part => part.startsWith(word)));
}

/** The saved ship a name or IMO number refers to, if any. */
export function findShip(ships: FleetShip[], query: { name?: string; imo?: string }): FleetShip | undefined {
  if (query.imo) { const byImo = ships.find(ship => ship.imo === query.imo); if (byImo) return byImo; }
  if (query.name) {
    const key = shipKey(query.name);
    // Models sometimes repeat a name ("MV Ocean Star MV Ocean Star MV Oc…"); a saved name it starts with still counts.
    return ships.find(ship => shipKey(ship.name) === key) ?? ships.find(ship => repeats(key, shipKey(ship.name)));
  }
  return undefined;
}

/** What the chat tools need from the fleet store; Convex in the app, a list in tests. */
export type FleetAccess = { list: () => Promise<FleetShip[]>; save: (ship: FleetShipInput) => Promise<{ id: string; created: boolean }> };
