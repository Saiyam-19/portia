import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { artifactView, ownedArtifact, requireArtifactServer } from './lib/artifacts';
import { consumeBudget, currentOwner, fail, requireOwner } from './lib/chat';
import { uploadError } from '../src/lib/artifacts/shared';

export const list = query({
  args: { paginationOpts: paginationOptsValidator, search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const ownerId = await currentOwner(ctx);
    if (!ownerId) return { page: [], isDone: true, continueCursor: '' };
    if (args.paginationOpts.numItems > 50 || (args.search?.length ?? 0) > 180) fail('INVALID_INPUT', 'Invalid file query.');
    const search = args.search?.trim();
    const page = search
      ? await ctx.db.query('artifacts').withSearchIndex('by_name', q => q.search('name', search).eq('ownerId', ownerId)).paginate(args.paginationOpts)
      : await ctx.db.query('artifacts').withIndex('by_owner_and_updated_at', q => q.eq('ownerId', ownerId)).order('desc').paginate(args.paginationOpts);
    return { ...page, page: page.page.map(artifactView) };
  },
});

/** Upload middleware obtains ownership and replacement revision from a live user session. */
export const uploadTarget = query({
  args: { artifactId: v.optional(v.id('artifacts')) },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    const file = args.artifactId ? await ownedArtifact(ctx, args.artifactId, ownerId) : null;
    if (file && (file.status === 'processing' || file.status === 'deleting')) fail('BUSY', 'Wait for this file to finish processing.');
    return { ownerId, artifactId: file?._id ?? null, expectedRevision: file?.revision ?? 0 };
  },
});

/** Reserve ids before signing uploads, so a late completion cannot recreate a deleted file. */
export const reserveUploads = mutation({
  args: { files: v.array(v.object({ name: v.string(), mimeType: v.string(), size: v.number() })) },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    if (!args.files.length || args.files.length > 4) fail('INVALID_INPUT', 'Upload between one and four files.');
    for (const file of args.files) { const error = uploadError(file); if (error) fail('INVALID_INPUT', error); }
    await consumeBudget(ctx, ownerId, 'create');
    const now = Date.now();
    return await Promise.all(args.files.map(async file => ({
      artifactId: await ctx.db.insert('artifacts', { ...file, sourceName: file.name, ownerId, fileKey: '', revision: 0, status: 'uploading', createdAt: now, updatedAt: now }),
      expectedRevision: 0,
    })));
  },
});

export const get = query({
  args: { artifactId: v.id('artifacts') },
  handler: async (ctx, args) => {
    const file = await ownedArtifact(ctx, args.artifactId, await requireOwner(ctx));
    return { ...artifactView(file), fileKey: file.fileKey, markdownKey: file.markdownKey ?? null };
  },
});

export const rename = mutation({
  args: { artifactId: v.id('artifacts'), name: v.string() },
  handler: async (ctx, args) => {
    const file = await ownedArtifact(ctx, args.artifactId, await requireOwner(ctx));
    if (file.status === 'deleting') fail('BUSY', 'This file is being deleted.');
    const name = args.name.trim();
    if (!name || name.length > 180 || /[\x00-\x1f/\\]/.test(name)) fail('INVALID_INPUT', 'Use a filename of 1–180 characters without slashes.');
    await ctx.db.patch(file._id, { name, updatedAt: Date.now() });
  },
});

/** Only the signed UploadThing completion callback supplies storage keys. */
export const registerUpload = mutation({
  args: { secret: v.string(), ownerId: v.string(), artifactId: v.union(v.id('artifacts'), v.null()), expectedRevision: v.number(), name: v.string(), mimeType: v.string(), size: v.number(), fileKey: v.string() },
  handler: async (ctx, args) => {
    requireArtifactServer(args.secret);
    const invalid = uploadError(args);
    if (invalid) fail('INVALID_INPUT', invalid);
    const duplicate = await ctx.db.query('artifacts').withIndex('by_file_key', q => q.eq('fileKey', args.fileKey)).unique();
    if (duplicate) return { id: duplicate._id, revision: duplicate.revision, started: false };
    const now = Date.now();
    const fields = { name: args.name, sourceName: args.name, mimeType: args.mimeType, size: args.size, fileKey: args.fileKey, status: 'processing' as const, updatedAt: now, error: undefined, markdownKey: undefined };
    if (args.artifactId) {
      const file = await ctx.db.get(args.artifactId);
      if (!file || file.ownerId !== args.ownerId || file.revision !== args.expectedRevision || file.status === 'deleting') return null;
      const retiredKeys = [...(file.retiredKeys ?? []), file.fileKey, ...(file.markdownKey ? [file.markdownKey] : [])].filter(Boolean);
      await ctx.db.patch(file._id, { ...fields, revision: file.revision + 1, retiredKeys });
      return { id: file._id, revision: file.revision + 1, started: true };
    }
    const id = await ctx.db.insert('artifacts', { ...fields, ownerId: args.ownerId, revision: 1, createdAt: now });
    return { id, revision: 1, started: true };
  },
});

export const forServer = query({
  args: { secret: v.string(), artifactId: v.id('artifacts'), ownerId: v.string() },
  handler: async (ctx, args) => {
    requireArtifactServer(args.secret);
    return await ownedArtifact(ctx, args.artifactId, args.ownerId);
  },
});

export const conversionResult = mutation({
  args: { secret: v.string(), artifactId: v.id('artifacts'), ownerId: v.string(), revision: v.number(), markdownKey: v.optional(v.string()), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    requireArtifactServer(args.secret);
    const file = await ctx.db.get(args.artifactId);
    if (!file || file.ownerId !== args.ownerId || file.revision !== args.revision || file.status !== 'processing') return false;
    await ctx.db.patch(file._id, { status: args.markdownKey ? 'ready' : 'error', markdownKey: args.markdownKey, error: args.error?.slice(0, 500), updatedAt: Date.now() });
    return true;
  },
});

export const retry = mutation({
  args: { artifactId: v.id('artifacts') },
  handler: async (ctx, args) => {
    const file = await ownedArtifact(ctx, args.artifactId, await requireOwner(ctx));
    if (!file.fileKey) fail('INVALID_INPUT', 'The upload did not finish. Replace this file to upload it again.');
    // A timed-out callback can be retried after five minutes; its late result is fenced by the revision.
    if (file.status !== 'error' && !(file.status === 'processing' && file.updatedAt < Date.now() - 300_000)) fail('BUSY', 'This file is not ready to retry.');
    await ctx.db.patch(file._id, { status: 'processing', revision: file.revision + 1, error: undefined, updatedAt: Date.now() });
    return { ownerId: file.ownerId, revision: file.revision + 1 };
  },
});

export const beginDelete = mutation({
  args: { artifactId: v.id('artifacts') },
  handler: async (ctx, args) => {
    const file = await ownedArtifact(ctx, args.artifactId, await requireOwner(ctx));
    const revision = file.status === 'deleting' ? file.revision : file.revision + 1;
    await ctx.db.patch(file._id, { status: 'deleting', revision, updatedAt: Date.now() });
    return { ownerId: file.ownerId, revision, keys: [...(file.retiredKeys ?? []), file.fileKey, ...(file.markdownKey ? [file.markdownKey] : [])].filter(Boolean) };
  },
});

export const finishDelete = mutation({
  args: { secret: v.string(), artifactId: v.id('artifacts'), ownerId: v.string(), revision: v.number() },
  handler: async (ctx, args) => {
    requireArtifactServer(args.secret);
    const file = await ownedArtifact(ctx, args.artifactId, args.ownerId);
    if (file.status !== 'deleting' || file.revision !== args.revision) fail('CONFLICT', 'File changed before deletion finished.');
    await ctx.db.delete(file._id);
  },
});

export const cleanedUp = mutation({
  args: { secret: v.string(), artifactId: v.id('artifacts'), ownerId: v.string(), keys: v.array(v.string()) },
  handler: async (ctx, args) => {
    requireArtifactServer(args.secret);
    const file = await ctx.db.get(args.artifactId);
    if (file?.ownerId === args.ownerId) await ctx.db.patch(file._id, { retiredKeys: (file.retiredKeys ?? []).filter(key => !args.keys.includes(key)) });
  },
});
