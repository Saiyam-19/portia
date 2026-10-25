"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { documentFormat } from "../src/lib/berthwise/company-doc-rules";
import { extractPages, passages } from "../src/lib/berthwise/company-docs";

const BATCH = 200;

/** Reads an uploaded company document into searchable passages, in the background. */
export const read = internalAction({
  args: { documentId: v.id("companyDocuments") }, returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.runQuery(internal.companyDocs.forReading, { documentId: args.documentId });
    if (!doc) return null;
    const finish = (result: { error?: string; pages?: number; passages?: number }) =>
      ctx.runMutation(internal.companyDocs.finishReading, { documentId: args.documentId, storageId: doc.storageId, ...result });
    try {
      const blob = await ctx.storage.get(doc.storageId);
      const format = documentFormat(doc.fileName);
      if (!blob || !format) { await finish({ error: "The file could not be found. Upload it again." }); return null; }
      const pages = await extractPages(new Uint8Array(await blob.arrayBuffer()), format);
      const found = passages(pages);
      if (!found.length) {
        await finish({ error: format === "pdf" ? "No text was found. Scanned PDFs have no text layer; upload a text PDF or a Word copy." : "No text was found in this file." });
        return null;
      }
      for (let start = 0; start < found.length; start += BATCH) {
        const saved = await ctx.runMutation(internal.companyDocs.savePassages, { documentId: args.documentId, storageId: doc.storageId, passages: found.slice(start, start + BATCH) });
        if (!saved) return null;
      }
      await finish({ pages: pages.length, passages: found.length });
    } catch {
      await finish({ error: "This file couldn't be read. Check that it opens on your computer, then upload it again." });
    }
    return null;
  },
});
