import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { authComponent } from "./auth";
import { isAllowedEmail, isMigrationDevEnabled } from "./lib/migrationGate";
import { MAX_FLEET_SHIPS, fleetShipSchema, shipKey } from "../src/lib/berthwise/fleet";

/** "My fleet": ships a company saves once and estimates fill in afterwards. */

const vShip = v.object({
  id: v.string(), name: v.string(), imo: v.optional(v.string()), grt: v.string(), nrt: v.optional(v.string()),
  loa: v.optional(v.string()), type: v.optional(v.string()), status: v.optional(v.string()), updatedAt: v.number(),
});

async function owner(ctx: QueryCtx) {
  if (!isMigrationDevEnabled()) return null;
  const user = await authComponent.safeGetAuthUser(ctx);
  return user && isAllowedEmail(user.email) ? String(user._id) : null;
}
const fail = (code: string, message: string): never => { throw new ConvexError({ code, message }); };

export const listShips = query({
  args: {}, returns: v.array(vShip),
  handler: async (ctx) => {
    const ownerId = await owner(ctx);
    if (!ownerId) return [];
    const ships = await ctx.db.query("fleetShips").withIndex("by_owner_and_name", q => q.eq("ownerId", ownerId)).take(MAX_FLEET_SHIPS);
    return ships.map(ship => ({
      id: ship._id, name: ship.name, grt: ship.grt, updatedAt: ship.updatedAt,
      ...(ship.imo ? { imo: ship.imo } : {}), ...(ship.nrt ? { nrt: ship.nrt } : {}), ...(ship.loa ? { loa: ship.loa } : {}),
      ...(ship.type ? { type: ship.type } : {}), ...(ship.status ? { status: ship.status } : {}),
    }));
  },
});

/** Adds a ship, or updates the one with the same id, IMO number or name. */
export const saveShip = mutation({
  args: { id: v.optional(v.id("fleetShips")), ship: v.any() }, returns: v.object({ id: v.string(), created: v.boolean() }),
  handler: async (ctx, args) => {
    const ownerId = await owner(ctx) ?? fail("UNAUTHENTICATED", "Sign in required.");
    const parsed = fleetShipSchema.safeParse(args.ship);
    if (!parsed.success) fail("INVALID_SHIP", parsed.error.issues.map(issue => `${issue.path.join(".") || "ship"}: ${issue.message}`).join("; "));
    const ship = parsed.data!;
    const nameKey = shipKey(ship.name);
    if (!nameKey) fail("INVALID_SHIP", "name: enter the ship's name.");
    let existing = args.id ? await ctx.db.get(args.id) : null;
    if (args.id && (!existing || existing.ownerId !== ownerId)) fail("NOT_FOUND", "Ship not found.");
    existing ??= ship.imo ? await ctx.db.query("fleetShips").withIndex("by_owner_and_imo", q => q.eq("ownerId", ownerId).eq("imo", ship.imo)).first() : null;
    existing ??= await ctx.db.query("fleetShips").withIndex("by_owner_and_name", q => q.eq("ownerId", ownerId).eq("nameKey", nameKey)).first();
    const clash = await ctx.db.query("fleetShips").withIndex("by_owner_and_name", q => q.eq("ownerId", ownerId).eq("nameKey", nameKey)).first();
    if (existing && clash && clash._id !== existing._id) fail("DUPLICATE_SHIP", `${clash.name} is already in your fleet.`);
    // Editing a ship by id replaces it (so a field can be cleared); saving by name or
    // IMO number, as the chat does, keeps saved details the new input leaves out.
    const kept = existing && !args.id ? existing : undefined;
    const fields = {
      ownerId, name: ship.name, nameKey, grt: ship.grt, updatedAt: Date.now(),
      imo: ship.imo ?? kept?.imo, nrt: ship.nrt ?? kept?.nrt, loa: ship.loa ?? kept?.loa, type: ship.type ?? kept?.type, status: ship.status ?? kept?.status,
    };
    if (existing) { await ctx.db.replace(existing._id, fields); return { id: existing._id, created: false }; }
    const count = (await ctx.db.query("fleetShips").withIndex("by_owner_and_name", q => q.eq("ownerId", ownerId)).take(MAX_FLEET_SHIPS)).length;
    if (count >= MAX_FLEET_SHIPS) fail("FLEET_FULL", `A fleet holds at most ${MAX_FLEET_SHIPS} ships.`);
    return { id: await ctx.db.insert("fleetShips", fields), created: true };
  },
});

export const deleteShip = mutation({
  args: { id: v.id("fleetShips") }, returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await owner(ctx) ?? fail("UNAUTHENTICATED", "Sign in required.");
    const ship = await ctx.db.get(args.id);
    if (!ship || ship.ownerId !== ownerId) fail("NOT_FOUND", "Ship not found.");
    await ctx.db.delete(args.id);
    return null;
  },
});
