import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { accountOwner, fail, requireAccount } from "./lib/account";
import { agreedRateSchema, MAX_AGREED_RATES } from "../src/lib/berthwise/agreed-rates";

/** Rates a company has agreed with a port: a discount on a charge, or a fixed amount per call. */

const vRate = v.object({
  id: v.string(), portId: v.string(), chargeType: v.string(), kind: v.string(), percent: v.optional(v.string()),
  amount: v.optional(v.string()), currency: v.optional(v.string()), note: v.optional(v.string()), updatedAt: v.number(),
});

export const listAgreedRates = query({
  args: {}, returns: v.array(vRate),
  handler: async (ctx) => {
    const ownerId = await accountOwner(ctx);
    if (!ownerId) return [];
    const rates = await ctx.db.query("agreedRates").withIndex("by_owner_and_port", q => q.eq("ownerId", ownerId)).take(MAX_AGREED_RATES);
    return rates.map(rate => ({
      id: rate._id, portId: rate.portId, chargeType: rate.chargeType, kind: rate.kind, updatedAt: rate.updatedAt,
      ...(rate.percent ? { percent: rate.percent } : {}), ...(rate.amount ? { amount: rate.amount } : {}),
      ...(rate.currency ? { currency: rate.currency } : {}), ...(rate.note ? { note: rate.note } : {}),
    }));
  },
});

/** Adds or replaces the agreed rate for one charge at one port. */
export const saveAgreedRate = mutation({
  args: { id: v.optional(v.id("agreedRates")), rate: v.any() }, returns: v.string(),
  handler: async (ctx, args) => {
    const ownerId = await requireAccount(ctx);
    const parsed = agreedRateSchema.safeParse(args.rate);
    if (!parsed.success) fail("INVALID_RATE", parsed.error.issues.map(issue => `${issue.path.join(".") || "rate"}: ${issue.message}`).join("; "));
    const rate = parsed.data!;
    // Editing one agreement (even to another port or charge) replaces it, not adds a second.
    const edited = args.id ? await ctx.db.get(args.id) : null;
    if (args.id && (!edited || edited.ownerId !== ownerId)) fail("NOT_FOUND", "Agreed rate not found.");
    const same = (await ctx.db.query("agreedRates").withIndex("by_owner_and_port", q => q.eq("ownerId", ownerId).eq("portId", rate.portId)).take(50))
      .find(item => item.chargeType === rate.chargeType);
    if (edited && same && same._id !== edited._id) await ctx.db.delete(same._id);
    const existing = edited ?? same;
    const fields = {
      ownerId, portId: rate.portId, chargeType: rate.chargeType, kind: rate.kind, updatedAt: Date.now(),
      percent: rate.kind === "discount" ? rate.percent : undefined, amount: rate.kind === "fixed" ? rate.amount : undefined,
      currency: rate.kind === "fixed" ? rate.currency : undefined, note: rate.note,
    };
    if (existing) { await ctx.db.replace(existing._id, fields); return existing._id; }
    const count = (await ctx.db.query("agreedRates").withIndex("by_owner_and_port", q => q.eq("ownerId", ownerId)).take(MAX_AGREED_RATES)).length;
    if (count >= MAX_AGREED_RATES) fail("TOO_MANY_RATES", `An account holds at most ${MAX_AGREED_RATES} agreed rates.`);
    return await ctx.db.insert("agreedRates", fields);
  },
});

export const deleteAgreedRate = mutation({
  args: { id: v.id("agreedRates") }, returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireAccount(ctx);
    const rate = await ctx.db.get(args.id);
    if (!rate || rate.ownerId !== ownerId) fail("NOT_FOUND", "Agreed rate not found.");
    await ctx.db.delete(args.id);
    return null;
  },
});
