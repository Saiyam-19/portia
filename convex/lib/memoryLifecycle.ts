import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Infer } from "convex/values";
import { memoryOperation } from "../memoryValidators";

export const memoryEnabled = () => process.env.PORTIA_MEMORY_ENABLED === "true";
export const memoryError = (code: string): never => { throw new ConvexError(code); };
export async function findMemory(ctx: QueryCtx | MutationCtx, ownerId: string) {
  return ctx.db.query("memoryNamespaces").withIndex("by_owner", q => q.eq("ownerId", ownerId)).unique();
}
export async function ensureMemory(ctx: MutationCtx, ownerId: string) {
  const existing = await findMemory(ctx, ownerId);
  if (existing) return existing;
  const id = await ctx.db.insert("memoryNamespaces", { ownerId, epoch: 0, revision: 0, fence: 0, nextSequence: 0, appliedSequence: 0, blockedThrough: 0, factIndex: [], appliedIndex: [] });
  return (await ctx.db.get(id))!;
}
export async function runMemoryCurrent(ctx: QueryCtx | MutationCtx, run: Doc<"migrationRuns">) {
  if (run.memoryEpoch === undefined) return true;
  const ns = await findMemory(ctx, run.ownerId);
  return Boolean(ns && run.memoryEpoch === ns.epoch);
}
export async function assertRunMemory(ctx: QueryCtx | MutationCtx, run: Doc<"migrationRuns">) {
  if (!await runMemoryCurrent(ctx, run)) memoryError("MEMORY_CHANGED");
}
export async function memoryRun(ctx: QueryCtx | MutationCtx, ownerId: string, runId: Id<"migrationRuns">, fence: number | undefined) {
  const run = await ctx.db.get(runId);
  if (!run || run.ownerId !== ownerId) return memoryError("NOT_FOUND");
  const conversation = await ctx.db.get(run.conversationId);
  if (!conversation || conversation.ownerId !== ownerId) return memoryError("NOT_FOUND");
  if (run.status !== "active" || run.fence !== fence || run.leaseExpiresAt <= Date.now() || conversation.activeRunId !== run._id) return memoryError("STALE_RUN");
  await assertRunMemory(ctx, run);
  return run;
}
export async function hashMemory(value: unknown) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2,"0")).join("");
}
export function memoryRowOperations(row: Doc<"memoryOperations">) {
  return row.workspace?.operations ?? (row.operation ? [row.operation] : []);
}
export async function projectMemory(index: Doc<"memoryNamespaces">["factIndex"], operations: Infer<typeof memoryOperation>[]) {
  let facts = [...index];
  for (const operation of operations) {
    if (operation.kind === "remember") {
      if (!/^[a-z][a-z0-9_]{0,79}$/.test(operation.key) || !operation.value.trim() || new TextEncoder().encode(operation.value).length > 1024 || operation.value.includes("\0") || !/^[a-zA-Z0-9_-]{1,100}$/.test(operation.source)) return memoryError("INVALID_MEMORY");
      const prior = facts.find(fact => fact.key === operation.key), hash = await hashMemory(operation.value);
      const sources = prior?.hash === hash ? [...new Set([...prior.sources, operation.source])] : [operation.source];
      if (sources.length > 8 || (!prior && facts.length >= 64)) return memoryError("MEMORY_LIMIT");
      facts = [...facts.filter(fact => fact.key !== operation.key), { key: operation.key, hash, sources }];
    } else if (operation.kind === "forget") {
      if (!/^[a-z][a-z0-9_]{0,79}$/.test(operation.key)) return memoryError("INVALID_MEMORY");
      facts = facts.filter(fact => fact.key !== operation.key);
    } else if (operation.kind === "clear") facts = [];
    else facts = facts.map(fact => ({ ...fact, sources: fact.sources.filter(source => source !== operation.source) })).filter(fact => fact.sources.length);
  }
  return facts;
}
export async function memoryBarrier(ctx: MutationCtx, ns: Doc<"memoryNamespaces">, epoch: number, initiatingRun?: Doc<"migrationRuns">) {
  const ownerId = ns.ownerId;
  const noteReceipts = await ctx.db.query("memoryNoteReceipts").withIndex("by_owner", q => q.eq("ownerId", ownerId)).take(128);
  for (const row of noteReceipts) await ctx.db.delete(row._id);
  if (initiatingRun) await ctx.db.patch(initiatingRun._id, { memoryEpoch: epoch });
  const stale = await ctx.db.query("memoryScratchpads").withIndex("by_owner_and_epoch", q => q.eq("ownerId", ownerId).lt("epoch", epoch)).take(50);
  for (const row of stale) await ctx.db.delete(row._id);
  if (stale.length === 50) await ctx.scheduler.runAfter(0, internal.memory.cleanupNotes, { ownerId, epoch });
  // Epoch checks hide every old output immediately. Physical redaction is
  // bounded; queued note payloads are also removed before any future publish.
  const pending = await ctx.db.query("memoryOperations").withIndex("by_namespace_and_status_and_sequence", q => q.eq("namespaceId", ns._id).eq("status", "pending")).take(96);
  for (const row of pending) if (row.epoch < epoch && row.workspace?.markdown !== undefined) await ctx.db.patch(row._id, { workspace: { ...row.workspace, markdown: undefined } });
  await ctx.scheduler.runAfter(0, internal.memory.redactWorkspaceReceipts, { ownerId, epoch });
}
export async function enqueueMemory(ctx: MutationCtx, ownerId: string, requestId: string, expectedEpoch: number, operation: Infer<typeof memoryOperation>, initiatingRun?: Doc<"migrationRuns">) {
  const ns = await ensureMemory(ctx, ownerId);
  if (requestId.length < 1 || requestId.length > 240) return memoryError("INVALID_REQUEST");
  const hash = await hashMemory(operation);
  const existing = await ctx.db.query("memoryOperations").withIndex("by_namespace_and_request", q => q.eq("namespaceId",ns._id).eq("requestId",requestId)).unique();
  if (existing) {
    if (existing.hash !== hash) return memoryError("MEMORY_REPLAY_CONFLICT");
    return { epoch: ns.epoch, sequence: existing.sequence };
  }
  if (ns.epoch !== expectedEpoch) return memoryError("MEMORY_CHANGED");
  // Deletion barriers must remain admissible even if ordinary writes filled their queue.
  const barrier = operation.kind !== "remember";
  if (ns.nextSequence - ns.appliedSequence >= (barrier ? 96 : 32)) return memoryError("MEMORY_BUSY");
  const factIndex = await projectMemory(ns.factIndex, [operation]);
  const sequence = ns.nextSequence + 1;
  const epoch = ns.epoch + Number(barrier);
  await ctx.db.insert("memoryOperations", { namespaceId: ns._id, requestId, hash, sequence, epoch, status: "pending", operation });
  await ctx.db.patch(ns._id, { nextSequence: sequence, factIndex,
    ...(barrier ? { epoch, blockedThrough: sequence, lease: undefined } : {}) });
  if (barrier) await memoryBarrier(ctx, ns, epoch, initiatingRun);
  return { epoch, sequence };
}
export async function deleteConversationMemory(ctx: MutationCtx, ownerId: string, conversationId: Id<"migrationConversations">) {
  const note = await ctx.db.query("memoryScratchpads").withIndex("by_conversation",q=>q.eq("conversationId",conversationId)).unique();
  if (note) await ctx.db.delete(note._id);
  const receipts=await ctx.db.query("memoryNoteReceipts").withIndex("by_conversation",q=>q.eq("conversationId",conversationId)).take(128);
  for(const row of receipts)await ctx.db.delete(row._id);
  const ns = await findMemory(ctx, ownerId);
  if (ns) await enqueueMemory(ctx, ownerId, "delete-source:"+conversationId, ns.epoch, {kind:"delete_source",source:conversationId});
  await ctx.scheduler.runAfter(0, internal.memory.cleanupWorkspaceConversation, { conversationId });
}
