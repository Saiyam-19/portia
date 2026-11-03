import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { authComponent } from "../auth";
import { isAllowedEmail, portiaEnabled } from "./gate";
import { contentHash } from "./memory";

export function fail(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

export async function currentOwner(ctx: QueryCtx | MutationCtx): Promise<string | null> {
  if (!portiaEnabled()) return null;
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user || !isAllowedEmail(user.email)) return null;
  return user._id;
}

export async function requireOwner(ctx: QueryCtx | MutationCtx): Promise<string> {
  const ownerId = await currentOwner(ctx);
  if (!ownerId) fail("UNAUTHENTICATED", "Sign in required.");
  return ownerId;
}

export async function ownedConversation(ctx: QueryCtx | MutationCtx, conversationId: Id<"conversations">, ownerId: string) {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation || conversation.ownerId !== ownerId) fail("NOT_FOUND", "Conversation not found.");
  return conversation;
}

function budgetLimit(name: string, fallback: number, ceiling: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? Math.min(value, ceiling) : fallback;
}

/** Atomic bounded rolling window. At most 120 timestamps/user/kind; deletion cannot reset usage. */
export async function consumeBudget(ctx: MutationCtx, ownerId: string, kind: "run" | "create") {
  const minute = budgetLimit(kind === "run" ? "PORTIA_RUNS_PER_MINUTE" : "PORTIA_CREATES_PER_MINUTE", kind === "run" ? 8 : 6, 20);
  const hour = budgetLimit(kind === "run" ? "PORTIA_RUNS_PER_HOUR" : "PORTIA_CREATES_PER_HOUR", kind === "run" ? 60 : 30, 120);
  const now = Date.now();
  const row = await ctx.db.query("requestBudgets").withIndex("by_owner_and_kind", q => q.eq("ownerId", ownerId).eq("kind", kind)).unique();
  const timestamps = (row?.timestamps ?? []).filter(time => time > now - 3_600_000);
  if (timestamps.length >= hour || timestamps.filter(time => time > now - 60_000).length >= minute) {
    fail("THROTTLED", "Request limit reached. Please wait before trying again.");
  }
  timestamps.push(now);
  if (row) await ctx.db.patch(row._id, { timestamps });
  else await ctx.db.insert("requestBudgets", { ownerId, kind, timestamps });
}

export async function memoryHead(ctx: QueryCtx | MutationCtx, ownerId: string) {
  return await ctx.db.query("memoryHeads").withIndex("by_owner", q => q.eq("ownerId", ownerId)).unique();
}

export async function memoryFiles(ctx: QueryCtx | MutationCtx, ownerId: string) {
  return await ctx.db.query("memories").withIndex("by_owner_and_path", q => q.eq("ownerId", ownerId)).take(64);
}

export async function conversationNotes(ctx: QueryCtx | MutationCtx, conversationId: Id<"conversations">) {
  return await ctx.db.query("notes").withIndex("by_conversation", q => q.eq("conversationId", conversationId)).unique();
}

/**
 * Chooses what the next prompt says about saved memory. Memory never lives in the
 * system prompt: the first turn (or the first after compaction) carries a full
 * snapshot, later turns carry only changes made elsewhere. The model-facing
 * history therefore stays append-only and its cached prefix stays valid.
 */
export async function claimMemoryContext(ctx: MutationCtx, conversation: Doc<"conversations">) {
  const head = await memoryHead(ctx, conversation.ownerId);
  const files = (await memoryFiles(ctx, conversation.ownerId)).sort((a, b) => a.path.localeCompare(b.path));
  const digest = files.map(file => ({ path: file.path, hash: file.hash }));
  const full = conversation.nextOrder === 0 || conversation.memoryRefresh;
  const seen = new Map(conversation.memorySeen.map(entry => [entry.path, entry.hash]));
  const changed = full ? files : files.filter(file => seen.get(file.path) !== file.hash);
  const current = new Set(files.map(file => file.path));
  const removed = full ? [] : [...seen.keys()].filter(path => !current.has(path)).sort();
  const notes = conversation.memoryRefresh && conversation.nextOrder > 0
    ? (await conversationNotes(ctx, conversation._id))?.content || null
    : null;
  await ctx.db.patch(conversation._id, { memorySeen: digest, memoryRefresh: false });
  return {
    kind: full ? "full" as const : changed.length || removed.length ? "delta" as const : "none" as const,
    version: head?.version ?? 0,
    files: changed.map(file => ({ path: file.path, content: file.content })),
    removed,
    notes,
  };
}

/** Marks the latest digest for paths this conversation wrote itself, so they are not echoed back to it. */
export function seenAfterWrite(seen: Doc<"conversations">["memorySeen"], upserts: Array<{ path: string; content: string }>, deletes: string[]) {
  const map = new Map(seen.map(entry => [entry.path, entry.hash]));
  for (const file of upserts) map.set(file.path, contentHash(file.content));
  for (const path of deletes) map.delete(path);
  return [...map].map(([path, hash]) => ({ path, hash })).sort((a, b) => a.path.localeCompare(b.path));
}
