import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { conversationNotes, memoryFiles, memoryHead, seenAfterWrite } from "./lib/chat";
import { hasServerSecret, portiaEnabled } from "./lib/gate";
import { contentHash, memorySetError, notesError } from "./lib/memory";
import { vForm, vMemoryFile, vSegment, vUsage } from "./validators";
import { vArtifactRef } from './validators';
import { artifactRef, conversationArtifacts } from './lib/artifacts';

/**
 * Functions the agent runtime calls from the Next server: tool executions, hooks
 * and queue deliveries run without a user session, so each call carries the
 * deployment's server secret instead.
 */
function requireServer(secret: string) {
  if (!portiaEnabled() || !hasServerSecret(secret)) throw new ConvexError({ code: "FORBIDDEN", message: "Server access denied." });
}

async function ownedBy(ctx: QueryCtx | MutationCtx, conversationId: Id<"conversations">, ownerId: string) {
  const conversation = await ctx.db.get(conversationId);
  return conversation && conversation.ownerId === ownerId ? conversation : null;
}

export const attachSession = mutation({
  args: { secret: v.string(), turnId: v.id("turns"), fxSessionId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServer(args.secret);
    const turn = await ctx.db.get(args.turnId);
    const conversation = turn && await ctx.db.get(turn.conversationId);
    if (conversation && !conversation.fxSessionId) await ctx.db.patch(conversation._id, { fxSessionId: args.fxSessionId });
    return null;
  },
});

/**
 * Records how a turn ended. Only a running turn changes; a turn the user cancelled
 * keeps its status but receives the partial output, and repeats are no-ops, so the
 * route, a reconnecting reader and a queue worker can all report the same end.
 */
export const finishTurn = mutation({
  args: {
    secret: v.string(),
    turnId: v.id("turns"),
    status: v.union(v.literal("completed"), v.literal("waiting"), v.literal("cancelled"), v.literal("error")),
    segments: v.array(vSegment),
    form: v.optional(vForm),
    error: v.optional(v.string()),
    usage: v.optional(vUsage),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServer(args.secret);
    const turn = await ctx.db.get(args.turnId);
    if (!turn) return null;
    const now = Date.now();
    if (turn.status === "cancelled" && !turn.segments.length) {
      await ctx.db.patch(turn._id, { segments: args.segments, ...(args.usage ? { usage: args.usage } : {}), updatedAt: now });
      return null;
    }
    if (turn.status !== "running") return null;
    await ctx.db.patch(turn._id, {
      status: args.status, segments: args.segments, updatedAt: now,
      ...(args.error ? { error: args.error.slice(0, 500) } : {}),
      ...(args.usage ? { usage: args.usage } : {}),
    });
    const conversation = await ctx.db.get(turn.conversationId);
    if (!conversation || conversation.activeTurnId !== turn._id) return null;
    const state = ({ completed: "idle", waiting: "waiting", cancelled: "stopped", error: "error" } as const)[args.status];
    await ctx.db.patch(conversation._id, {
      state, activeTurnId: undefined, updatedAt: now,
      ...(args.status === "waiting" && args.form ? { pendingForm: args.form } : {}),
      // The session may not hold what this turn's prompt carried; resend it next turn.
      ...(args.status === "error" ? { memoryRefresh: true } : {}),
    });
    return null;
  },
});

/** Compaction replaced the session's history with a summary: the next prompt carries memory and notes again. */
export const markCompacted = mutation({
  args: { secret: v.string(), fxSessionId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServer(args.secret);
    const conversation = await ctx.db.query("conversations").withIndex("by_fx_session", q => q.eq("fxSessionId", args.fxSessionId)).unique();
    if (conversation) await ctx.db.patch(conversation._id, { memoryRefresh: true });
    return null;
  },
});

/** The running turn of a session, for reconciling a turn another process finished. */
export const runningTurn = query({
  args: { secret: v.string(), fxSessionId: v.string() },
  returns: v.union(v.object({ turnId: v.id("turns"), requestId: v.string() }), v.null()),
  handler: async (ctx, args) => {
    requireServer(args.secret);
    const conversation = await ctx.db.query("conversations").withIndex("by_fx_session", q => q.eq("fxSessionId", args.fxSessionId)).unique();
    const turn = conversation?.activeTurnId ? await ctx.db.get(conversation.activeTurnId) : null;
    return turn && turn.status === "running" ? { turnId: turn._id, requestId: turn.requestId } : null;
  },
});

export const workspaceState = query({
  args: { secret: v.string(), conversationId: v.id("conversations"), ownerId: v.string() },
  returns: v.union(v.object({ version: v.number(), files: v.array(vMemoryFile), notes: v.string(), artifacts: v.array(v.object({ ...vArtifactRef.fields, markdownKey: v.string() })) }), v.null()),
  handler: async (ctx, args) => {
    requireServer(args.secret);
    const conversation = await ownedBy(ctx, args.conversationId, args.ownerId);
    if (!conversation) return null;
    const head = await memoryHead(ctx, args.ownerId);
    const files = await memoryFiles(ctx, args.ownerId);
    const notes = await conversationNotes(ctx, conversation._id);
    return {
      version: head?.version ?? 0,
      files: files.map(file => ({ path: file.path, content: file.content })),
      notes: notes?.content ?? "",
      artifacts: (await conversationArtifacts(ctx, conversation)).map(file => ({ ...artifactRef(file), markdownKey: file.markdownKey! })),
    };
  },
});

/**
 * Applies what one bash command changed under /memories and /notes. Memory writes
 * compare-and-set on the owner's memory version, so a concurrent write from another
 * conversation (or the memory panel) is reported instead of silently overwritten.
 */
export const commitWorkspace = mutation({
  args: {
    secret: v.string(),
    conversationId: v.id("conversations"),
    ownerId: v.string(),
    expectedVersion: v.number(),
    upserts: v.array(vMemoryFile),
    deletes: v.array(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), version: v.number() }),
    v.object({ ok: v.literal(false), reason: v.string() }),
  ),
  handler: async (ctx, args) => {
    requireServer(args.secret);
    const conversation = await ownedBy(ctx, args.conversationId, args.ownerId);
    if (!conversation) return { ok: false as const, reason: "This conversation was deleted." };
    const now = Date.now();
    if (args.notes !== undefined) {
      const error = notesError(args.notes);
      if (error) return { ok: false as const, reason: error };
      const existing = await conversationNotes(ctx, conversation._id);
      if (existing) await ctx.db.patch(existing._id, { content: args.notes, updatedAt: now });
      else await ctx.db.insert("notes", { conversationId: conversation._id, ownerId: args.ownerId, content: args.notes, updatedAt: now });
    }
    const head = await memoryHead(ctx, args.ownerId);
    const version = head?.version ?? 0;
    if (!args.upserts.length && !args.deletes.length) return { ok: true as const, version };
    if (version !== args.expectedVersion) {
      return { ok: false as const, reason: "Saved memory changed elsewhere since this workspace loaded it. Re-read /memories and apply the change again." };
    }
    const files = await memoryFiles(ctx, args.ownerId);
    const byPath = new Map(files.map(file => [file.path, file]));
    const next = new Map(files.map(file => [file.path, file.content]));
    for (const path of args.deletes) next.delete(path);
    for (const file of args.upserts) next.set(file.path, file.content);
    const error = memorySetError([...next].map(([path, content]) => ({ path, content })));
    if (error) return { ok: false as const, reason: error };

    for (const path of args.deletes) {
      const row = byPath.get(path);
      if (row) await ctx.db.delete(row._id);
    }
    for (const file of args.upserts) {
      const row = byPath.get(file.path);
      const fields = { content: file.content, hash: contentHash(file.content), conversationId: conversation._id, updatedAt: now };
      if (row) await ctx.db.patch(row._id, fields);
      else await ctx.db.insert("memories", { ownerId: args.ownerId, path: file.path, ...fields });
    }
    if (head) await ctx.db.patch(head._id, { version: version + 1 });
    else await ctx.db.insert("memoryHeads", { ownerId: args.ownerId, version: 1 });
    // The writing conversation already has these changes in its own history.
    await ctx.db.patch(conversation._id, { memorySeen: seenAfterWrite(conversation.memorySeen, args.upserts, args.deletes) });
    return { ok: true as const, version: version + 1 };
  },
});

export const expireTurn = internalMutation({
  args: { turnId: v.id("turns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const turn = await ctx.db.get(args.turnId);
    if (!turn || turn.status !== "running") return null;
    const now = Date.now();
    await ctx.db.patch(turn._id, { status: "error", error: "The response did not finish in time.", updatedAt: now });
    const conversation = await ctx.db.get(turn.conversationId);
    if (conversation?.activeTurnId === turn._id) {
      await ctx.db.patch(conversation._id, { state: "error", activeTurnId: undefined, memoryRefresh: true, updatedAt: now });
    }
    return null;
  },
});

export const purgeConversation = internalMutation({
  args: { conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const turns = await ctx.db.query("turns").withIndex("by_conversation_and_order", q => q.eq("conversationId", args.conversationId)).take(100);
    for (const turn of turns) await ctx.db.delete(turn._id);
    const notes = await conversationNotes(ctx, args.conversationId);
    if (notes) await ctx.db.delete(notes._id);
    if (turns.length === 100) await ctx.scheduler.runAfter(0, internal.agent.purgeConversation, args);
    return null;
  },
});
