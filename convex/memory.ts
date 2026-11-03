import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { conversationNotes, currentOwner, fail, memoryFiles, memoryHead, ownedConversation, requireOwner } from "./lib/chat";
import { MEMORY_LIMITS } from "./lib/memory";

/** What the user can see and remove of their saved memory. Only the agent writes it, on request. */
export const view = query({
  args: {},
  returns: v.object({
    version: v.number(),
    limits: v.object({ files: v.number(), totalBytes: v.number() }),
    files: v.array(v.object({ path: v.string(), content: v.string(), updatedAt: v.number() })),
  }),
  handler: async (ctx) => {
    const limits = { files: MEMORY_LIMITS.files, totalBytes: MEMORY_LIMITS.totalBytes };
    const ownerId = await currentOwner(ctx);
    if (!ownerId) return { version: 0, limits, files: [] };
    const head = await memoryHead(ctx, ownerId);
    const files = (await memoryFiles(ctx, ownerId)).sort((a, b) => a.path.localeCompare(b.path));
    return {
      version: head?.version ?? 0,
      limits,
      files: files.map(file => ({ path: file.path, content: file.content, updatedAt: file.updatedAt })),
    };
  },
});

export const notes = query({
  args: { conversationId: v.id("conversations") },
  returns: v.union(v.object({ content: v.string(), updatedAt: v.number() }), v.null()),
  handler: async (ctx, args) => {
    const ownerId = await currentOwner(ctx);
    const conversation = ownerId ? await ctx.db.get(args.conversationId) : null;
    if (!conversation || conversation.ownerId !== ownerId) return null;
    const row = await conversationNotes(ctx, conversation._id);
    return row?.content ? { content: row.content, updatedAt: row.updatedAt } : null;
  },
});

async function bumpVersion(ctx: MutationCtx, ownerId: string) {
  const head = await memoryHead(ctx, ownerId);
  if (head) await ctx.db.patch(head._id, { version: head.version + 1 });
  else await ctx.db.insert("memoryHeads", { ownerId, version: 1 });
}

export const forget = mutation({
  args: { path: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    const row = await ctx.db.query("memories").withIndex("by_owner_and_path", q => q.eq("ownerId", ownerId).eq("path", args.path)).unique();
    if (!row) fail("NOT_FOUND", "That memory no longer exists.");
    await ctx.db.delete(row._id);
    await bumpVersion(ctx, ownerId);
    return null;
  },
});

export const clear = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx);
    const files = await memoryFiles(ctx, ownerId);
    for (const file of files) await ctx.db.delete(file._id);
    if (files.length) await bumpVersion(ctx, ownerId);
    return null;
  },
});

export const clearNotes = mutation({
  args: { conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const conversation = await ownedConversation(ctx, args.conversationId, await requireOwner(ctx));
    const row = await conversationNotes(ctx, conversation._id);
    if (row) await ctx.db.delete(row._id);
    return null;
  },
});
