import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { accountOwner } from "./lib/account";
import { CHECK_EVERY_DAYS, watchList } from "../src/lib/berthwise/rulebook/watch";

/** Re-downloads each rate document we read, about monthly, and records whether it changed. */

const DAY = 86_400_000;
const PER_RUN = 8;
const vStatus = v.union(v.literal("same"), v.literal("changed"), v.literal("unreachable"));

export const latestChecks = internalQuery({
  args: {}, returns: v.array(v.object({ url: v.string(), checkedAt: v.number(), status: vStatus, sha256: v.optional(v.string()) })),
  handler: async (ctx) => {
    const latest = new Map<string, { url: string; checkedAt: number; status: "same" | "changed" | "unreachable"; sha256?: string }>();
    for (const check of await ctx.db.query("sourceChecks").withIndex("by_url").order("desc").take(2_000)) {
      if (!latest.has(check.url)) latest.set(check.url, { url: check.url, checkedAt: check.checkedAt, status: check.status, ...(check.sha256 ? { sha256: check.sha256 } : {}) });
    }
    return [...latest.values()];
  },
});

export const record = internalMutation({
  args: { url: v.string(), portId: v.string(), documentId: v.string(), status: vStatus, httpStatus: v.optional(v.number()), sha256: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => { await ctx.db.insert("sourceChecks", { ...args, checkedAt: Date.now() }); return null; },
});

/** Run daily by the cron; checks the documents whose last check is a month old. */
export const checkDue = internalAction({
  args: {}, returns: v.number(),
  handler: async (ctx): Promise<number> => {
    const checks: Array<{ url: string; checkedAt: number; status: "same" | "changed" | "unreachable"; sha256?: string }> = await ctx.runQuery(internal.sourceWatch.latestChecks, {});
    const last = new Map(checks.map(check => [check.url, check]));
    const due = watchList().filter(doc => {
      const check = last.get(doc.url);
      if (!check) return true;
      // A change stays flagged, unchecked, until the rule book holds the new file.
      if (check.status === "changed" && check.sha256 !== doc.sha256) return false;
      return Date.now() - check.checkedAt > CHECK_EVERY_DAYS * DAY;
    }).slice(0, PER_RUN);
    for (const doc of due) {
      let result: { status: "same" | "changed" | "unreachable"; httpStatus?: number; sha256?: string };
      try {
        const response = await fetch(doc.url, { headers: { "user-agent": "Mozilla/5.0 (compatible; Berthwise rate check)" }, signal: AbortSignal.timeout(45_000) });
        if (!response.ok) result = { status: "unreachable", httpStatus: response.status };
        else {
          const digest = await crypto.subtle.digest("SHA-256", await response.arrayBuffer());
          const sha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
          result = { status: sha256 === doc.sha256 ? "same" : "changed", httpStatus: response.status, sha256 };
        }
      } catch { result = { status: "unreachable" }; }
      await ctx.runMutation(internal.sourceWatch.record, { url: doc.url, portId: doc.portId, documentId: doc.documentId, ...result });
    }
    return due.length;
  },
});

/** Rate documents that changed on a port's website, or couldn't be reached twice running. */
export const sourceStatus = query({
  args: {},
  returns: v.array(v.object({ url: v.string(), portId: v.string(), documentId: v.string(), status: v.union(v.literal("changed"), v.literal("unreachable")), since: v.number() })),
  handler: async (ctx) => {
    if (!await accountOwner(ctx)) return [];
    const out = [];
    for (const doc of watchList()) {
      const recent = await ctx.db.query("sourceChecks").withIndex("by_url", q => q.eq("url", doc.url)).order("desc").take(2);
      const [latest, previous] = recent;
      if (latest?.status === "changed" && latest.sha256 !== doc.sha256) out.push({ url: doc.url, portId: doc.portId, documentId: doc.documentId, status: "changed" as const, since: latest.checkedAt });
      else if (latest?.status === "unreachable" && previous?.status === "unreachable") out.push({ url: doc.url, portId: doc.portId, documentId: doc.documentId, status: "unreachable" as const, since: previous.checkedAt });
    }
    return out;
  },
});
