import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { accountOwner, fail, requireAccount } from "./lib/account";
import { MAX_DOCUMENTS, MAX_DOCUMENT_BYTES, documentFormat } from "../src/lib/berthwise/company-doc-rules";

/** Company documents: one account's files, never visible to another account. */

const vDocument = v.object({
  id: v.string(), title: v.string(), fileName: v.string(), format: v.string(), size: v.number(),
  status: v.string(), error: v.optional(v.string()), pages: v.optional(v.number()), createdAt: v.number(), updatedAt: v.number(),
});

export const generateUploadUrl = mutation({
  args: {}, returns: v.string(),
  handler: async (ctx) => { await requireAccount(ctx); return await ctx.storage.generateUploadUrl(); },
});

/** Records an uploaded file (or replaces an earlier one) and starts reading it. */
export const addDocument = mutation({
  args: { storageId: v.id("_storage"), fileName: v.string(), replaceId: v.optional(v.id("companyDocuments")) },
  returns: v.string(),
  handler: async (ctx, args) => {
    const ownerId = await requireAccount(ctx);
    const stored = await ctx.db.system.get(args.storageId);
    if (!stored) fail("NOT_FOUND", "The upload was not found. Try again.");
    const format = documentFormat(args.fileName);
    const problem = !format ? "Only PDF, Word (.docx), Excel (.xlsx), CSV and text files can be uploaded."
      : stored.size > MAX_DOCUMENT_BYTES ? "The file is larger than 20 MB." : stored.size === 0 ? "The file is empty." : undefined;
    if (problem) { await ctx.storage.delete(args.storageId); fail("INVALID_DOCUMENT", problem); }
    const title = args.fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 120) || args.fileName.slice(0, 120);
    const now = Date.now();
    if (args.replaceId) {
      const old = await ctx.db.get(args.replaceId);
      if (!old || old.ownerId !== ownerId) { await ctx.storage.delete(args.storageId); fail("NOT_FOUND", "Document not found."); }
      await removeContent(ctx, old._id, old.storageId);
      await ctx.db.patch(old._id, { fileName: args.fileName.slice(0, 200), title, format: format!, size: stored.size, storageId: args.storageId, status: "processing", error: undefined, pages: undefined, passages: undefined, updatedAt: now });
      await ctx.scheduler.runAfter(0, internal.companyDocsNode.read, { documentId: old._id });
      return old._id;
    }
    const count = (await ctx.db.query("companyDocuments").withIndex("by_owner", q => q.eq("ownerId", ownerId)).take(MAX_DOCUMENTS)).length;
    if (count >= MAX_DOCUMENTS) { await ctx.storage.delete(args.storageId); fail("TOO_MANY_DOCUMENTS", `An account holds at most ${MAX_DOCUMENTS} documents.`); }
    const id = await ctx.db.insert("companyDocuments", { ownerId, title, fileName: args.fileName.slice(0, 200), format: format!, size: stored.size, storageId: args.storageId, status: "processing", createdAt: now, updatedAt: now });
    await ctx.scheduler.runAfter(0, internal.companyDocsNode.read, { documentId: id });
    return id;
  },
});

export const listDocuments = query({
  args: {}, returns: v.array(vDocument),
  handler: async (ctx) => {
    const ownerId = await accountOwner(ctx);
    if (!ownerId) return [];
    const documents = await ctx.db.query("companyDocuments").withIndex("by_owner", q => q.eq("ownerId", ownerId)).order("desc").take(MAX_DOCUMENTS);
    return documents.map(doc => ({
      id: doc._id, title: doc.title, fileName: doc.fileName, format: doc.format, size: doc.size, status: doc.status,
      createdAt: doc.createdAt, updatedAt: doc.updatedAt, ...(doc.error ? { error: doc.error } : {}), ...(doc.pages !== undefined ? { pages: doc.pages } : {}),
    }));
  },
});

export const deleteDocument = mutation({
  args: { id: v.id("companyDocuments") }, returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireAccount(ctx);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.ownerId !== ownerId) fail("NOT_FOUND", "Document not found.");
    await removeContent(ctx, doc._id, doc.storageId);
    await ctx.db.delete(doc._id);
    return null;
  },
});

async function removeContent(ctx: MutationCtx, documentId: Id<"companyDocuments">, storageId: Id<"_storage">) {
  for (const passage of await ctx.db.query("companyPassages").withIndex("by_document", q => q.eq("documentId", documentId)).collect()) await ctx.db.delete(passage._id);
  await ctx.storage.delete(storageId).catch(() => undefined);
}

/** Passages that match a question, best first, from the signed-in account's ready documents. */
export const searchDocuments = query({
  args: { question: v.string() },
  returns: v.array(v.object({ documentId: v.string(), title: v.string(), fileName: v.string(), page: v.number(), text: v.string() })),
  handler: async (ctx, args) => {
    const ownerId = await accountOwner(ctx);
    const question = args.question.trim().slice(0, 300);
    if (!ownerId || !question) return [];
    const hits = await ctx.db.query("companyPassages").withSearchIndex("search_text", q => q.search("text", question).eq("ownerId", ownerId)).take(12);
    const out = [];
    const seen = new Set<string>();
    for (const hit of hits) {
      const doc = await ctx.db.get(hit.documentId);
      if (!doc || doc.ownerId !== ownerId || doc.status !== "ready" || doc.storageId !== hit.storageId) continue;
      const key = `${hit.documentId}#${hit.page}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ documentId: hit.documentId, title: doc.title, fileName: doc.fileName, page: hit.page, text: hit.text });
      if (out.length >= 5) break;
    }
    return out;
  },
});

export const forReading = internalQuery({
  args: { documentId: v.id("companyDocuments") },
  returns: v.union(v.null(), v.object({ storageId: v.id("_storage"), fileName: v.string(), ownerId: v.string() })),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    return doc && doc.status === "processing" ? { storageId: doc.storageId, fileName: doc.fileName, ownerId: doc.ownerId } : null;
  },
});

/** Saves a batch of passages, unless the document was deleted or replaced meanwhile. */
export const savePassages = internalMutation({
  args: { documentId: v.id("companyDocuments"), storageId: v.id("_storage"), passages: v.array(v.object({ page: v.number(), order: v.number(), text: v.string() })) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.storageId !== args.storageId) return false;
    for (const passage of args.passages) await ctx.db.insert("companyPassages", { ownerId: doc.ownerId, documentId: doc._id, storageId: args.storageId, ...passage });
    return true;
  },
});

export const finishReading = internalMutation({
  args: { documentId: v.id("companyDocuments"), storageId: v.id("_storage"), error: v.optional(v.string()), pages: v.optional(v.number()), passages: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.storageId !== args.storageId) return null;
    if (args.error) for (const passage of await ctx.db.query("companyPassages").withIndex("by_document", q => q.eq("documentId", doc._id)).collect()) await ctx.db.delete(passage._id);
    await ctx.db.patch(doc._id, args.error
      ? { status: "failed", error: args.error, updatedAt: Date.now() }
      : { status: "ready", pages: args.pages, passages: args.passages, updatedAt: Date.now() });
    return null;
  },
});
