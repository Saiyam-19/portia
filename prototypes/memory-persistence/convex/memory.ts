import { v, ConvexError } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel";
import { operation, receipt, snapshotView, claimView } from "./validators";

const MAX_OPERATIONS = 64;
const MAX_PENDING = 32;
const fail = (message: string): never => { throw new ConvexError(message); };
function identifier(value: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value)) fail("INVALID_IDENTIFIER");
}
function text(value: string, max: number) {
  if (new TextEncoder().encode(value).length > max || value.includes("\0")) fail("INVALID_TEXT");
}
async function owner(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return fail("UNAUTHENTICATED");
  return identity.tokenIdentifier;
}
async function namespace(ctx: QueryCtx | MutationCtx, id: Id<"namespaces">) {
  const identity = await owner(ctx);
  const ns = await ctx.db.get(id);
  if (!ns || ns.owner !== identity || ns.deleted) return fail("NOT_FOUND");
  return ns;
}
function worker(secret: string) {
  const expected = process.env.MEMORY_PROTOTYPE_WORKER_SECRET;
  if (!expected || secret !== expected) fail("WORKER_REQUIRED");
}
function checkLease(ns: Doc<"namespaces">, token: string, fence: number, revision: number) {
  if (!ns.lease || ns.lease.token !== token || ns.lease.fence !== fence ||
      ns.lease.expiresAt <= Date.now() || ns.revision !== revision) fail("STALE_WRITER");
}
const receiptOf = (op: Doc<"operations">) => ({ status: op.status, sequence: op.sequence, revision: op.revision ?? null });

export const create = mutation({
  args: { workspace: v.string() }, returns: v.id("namespaces"),
  handler: async (ctx, { workspace }) => {
    identifier(workspace);
    const id = await owner(ctx);
    const existing = await ctx.db.query("namespaces").withIndex("by_owner_and_workspace", q => q.eq("owner", id).eq("workspace", workspace)).unique();
    if (existing?.deleted) return fail("NAMESPACE_DELETED");
    if (existing) return existing._id;
    return ctx.db.insert("namespaces", { owner: id, workspace, deleted: false, revision: 0, epoch: 0, fence: 0, nextSequence: 0, appliedSequence: 0, scratchpadKeys: [] });
  },
});
export const read = query({
  args: { namespaceId: v.id("namespaces") }, returns: snapshotView,
  handler: async (ctx, { namespaceId }) => {
    const ns = await namespace(ctx, namespaceId);
    const snap = ns.snapshot ? await ctx.db.get(ns.snapshot) : null;
    return { revision: ns.revision, epoch: ns.epoch, pending: ns.nextSequence > ns.appliedSequence, bytes: snap?.bytes ?? null };
  },
});
export const enqueue = mutation({
  args: { namespaceId: v.id("namespaces"), requestId: v.string(), expectedEpoch: v.number(), operation },
  returns: receipt,
  handler: async (ctx, args) => {
    const ns = await namespace(ctx, args.namespaceId);
    identifier(args.requestId); identifier(args.operation.key);
    if (args.operation.kind !== "forget") text(args.operation.value, args.operation.kind === "put" ? 1024 : 4096);
    if (args.operation.kind === "put") text(args.operation.source, 512);
    const op = args.operation;
    const canonical = JSON.stringify([op.kind, op.key, "value" in op ? op.value : null, "source" in op ? op.source : null]);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical)))).map(b => b.toString(16).padStart(2, "0")).join("");
    const existing = await ctx.db.query("operations").withIndex("by_namespace_and_requestId", q => q.eq("namespace", ns._id).eq("requestId", args.requestId)).unique();
    if (existing) {
      if (existing.hash !== hash) return fail("IDEMPOTENCY_CONFLICT");
      return receiptOf(existing);
    }
    if (args.expectedEpoch !== ns.epoch) return fail("STALE_EPOCH");
    if (ns.nextSequence >= MAX_OPERATIONS || ns.nextSequence - ns.appliedSequence >= MAX_PENDING) return fail("QUEUE_LIMIT");
    const tombstone = await ctx.db.query("tombstones").withIndex("by_namespace_and_key", q => q.eq("namespace", ns._id).eq("key", op.key)).unique();
    if (op.kind === "put" && tombstone) return fail("FORGOTTEN_KEY");
    if (op.kind === "forget" && !tombstone) await ctx.db.insert("tombstones", { namespace: ns._id, key: op.key });
    let scratchpadKeys = ns.scratchpadKeys;
    if (op.kind === "scratchpad" && !scratchpadKeys.includes(op.key)) {
      if (scratchpadKeys.length >= 16) return fail("SCRATCHPAD_LIMIT");
      scratchpadKeys = [...scratchpadKeys, op.key];
    }
    if (op.kind === "forget") scratchpadKeys = [];
    const sequence = ns.nextSequence + 1;
    await ctx.db.insert("operations", { namespace: ns._id, requestId: args.requestId, hash, sequence, status: "pending", operation: op });
    await ctx.db.patch(ns._id, { nextSequence: sequence, scratchpadKeys, ...(op.kind === "forget" ? { epoch: ns.epoch + 1, lease: undefined } : {}) });
    return { status: "pending" as const, sequence, revision: null };
  },
});
export const status = query({
  args: { namespaceId: v.id("namespaces"), requestId: v.string() }, returns: v.union(v.null(), receipt),
  handler: async (ctx, args) => {
    await namespace(ctx, args.namespaceId);
    const op = await ctx.db.query("operations").withIndex("by_namespace_and_requestId", q => q.eq("namespace", args.namespaceId).eq("requestId", args.requestId)).unique();
    return op ? receiptOf(op) : null;
  },
});
export const claim = mutation({
  args: { namespaceId: v.id("namespaces"), workerSecret: v.string(), leaseMs: v.number() }, returns: claimView,
  handler: async (ctx, args) => {
    worker(args.workerSecret);
    const ns = await namespace(ctx, args.namespaceId);
    if (args.leaseMs < 100 || args.leaseMs > 30_000 || !Number.isInteger(args.leaseMs)) return fail("INVALID_LEASE");
    if (ns.lease && ns.lease.expiresAt > Date.now()) return null;
    const ops = await ctx.db.query("operations").withIndex("by_namespace_and_status_and_sequence", q => q.eq("namespace", ns._id).eq("status", "pending")).take(16);
    if (!ops.length) return null;
    const lease = { token: crypto.randomUUID(), fence: ns.fence + 1, expiresAt: Date.now() + args.leaseMs, through: ops.at(-1)!.sequence };
    await ctx.db.patch(ns._id, { lease, fence: lease.fence });
    const snap = ns.snapshot ? await ctx.db.get(ns.snapshot) : null;
    return { ...lease, baseRevision: ns.revision, bytes: snap?.bytes ?? null, operations: ops.map(o => o.operation!) };
  },
});
export const renew = mutation({
  args: { namespaceId: v.id("namespaces"), workerSecret: v.string(), token: v.string(), fence: v.number(), baseRevision: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    worker(args.workerSecret);
    const ns = await namespace(ctx, args.namespaceId);
    checkLease(ns, args.token, args.fence, args.baseRevision);
    await ctx.db.patch(ns._id, { lease: { ...ns.lease!, expiresAt: Date.now() + 30_000 } });
    return null;
  },
});
export const publish = mutation({
  args: { namespaceId: v.id("namespaces"), workerSecret: v.string(), token: v.string(), fence: v.number(), baseRevision: v.number(), through: v.number(), bytes: v.bytes() },
  returns: v.number(),
  handler: async (ctx, args) => {
    worker(args.workerSecret);
    const ns = await namespace(ctx, args.namespaceId);
    checkLease(ns, args.token, args.fence, args.baseRevision);
    if (args.through !== ns.lease!.through || !args.bytes.byteLength || args.bytes.byteLength > 512 * 1024) return fail("INVALID_CHECKPOINT");
    const ops = await ctx.db.query("operations").withIndex("by_namespace_and_status_and_sequence", q => q.eq("namespace", ns._id).eq("status", "pending").lte("sequence", args.through)).take(16);
    if (!ops.length || ops[0].sequence !== ns.appliedSequence + 1 || ops.at(-1)!.sequence !== args.through) return fail("INVALID_BATCH");
    const revision = ns.revision + 1;
    const snapshot = await ctx.db.insert("snapshots", { namespace: ns._id, bytes: args.bytes });
    if (ns.snapshot) await ctx.db.delete(ns.snapshot);
    for (const op of ops) await ctx.db.patch(op._id, { status: "done", operation: undefined, revision });
    await ctx.db.patch(ns._id, { snapshot, revision, appliedSequence: args.through, lease: undefined });
    return revision;
  },
});
export const destroy = mutation({
  args: { namespaceId: v.id("namespaces") }, returns: v.null(),
  handler: async (ctx, args) => {
    const ns = await namespace(ctx, args.namespaceId);
    if (ns.snapshot) await ctx.db.delete(ns.snapshot);
    for (const row of await ctx.db.query("operations").withIndex("by_namespace", q => q.eq("namespace", ns._id)).take(MAX_OPERATIONS)) await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("tombstones").withIndex("by_namespace_and_key", q => q.eq("namespace", ns._id)).take(MAX_OPERATIONS)) await ctx.db.delete(row._id);
    await ctx.db.patch(ns._id, { deleted: true, epoch: ns.epoch + 1, revision: ns.revision + 1, lease: undefined, snapshot: undefined, scratchpadKeys: [] });
    return null;
  },
});
// Admin-only acceptance evidence. Not callable by normal clients, even with a user JWT.
export const inspect = internalQuery({
  args: { namespaceId: v.id("namespaces") },
  returns: v.object({ snapshots: v.number(), operations: v.number(), payloads: v.number(), tombstones: v.number() }),
  handler: async (ctx, args) => {
    const snaps = await ctx.db.query("snapshots").withIndex("by_namespace", q => q.eq("namespace", args.namespaceId)).take(2);
    const ops = await ctx.db.query("operations").withIndex("by_namespace", q => q.eq("namespace", args.namespaceId)).take(MAX_OPERATIONS);
    const tombs = await ctx.db.query("tombstones").withIndex("by_namespace_and_key", q => q.eq("namespace", args.namespaceId)).take(MAX_OPERATIONS);
    return { snapshots: snaps.length, operations: ops.length, payloads: ops.reduce((n, o) => n + Number(o.operation !== undefined), 0), tombstones: tombs.length };
  },
});
