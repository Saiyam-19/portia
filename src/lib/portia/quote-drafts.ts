import { z } from "zod";
import { authorityDigest, canonical, quoteCore, quoteCoreSchema, type AuthorityPacket } from "../authority/contract";

const binding = z.object({ quoteId: z.string().min(1).max(100), revision: z.number().int().nonnegative(), digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const draftQuoteSchema = quoteCoreSchema.omit({ baseline: true }).strict();
export const quoteDraftSchema = z.object({
  version: z.literal(1), kind: z.literal("portia-quote-draft"), conversationId: z.string().min(1),
  base: binding.nullable(), beforeDraftRevision: z.number().int().min(-1), draftRevision: z.number().int().nonnegative(),
  quote: draftQuoteSchema, hash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type QuoteDraft = z.infer<typeof quoteDraftSchema>;
type Message = { content: unknown };

function outputs(messages: readonly Message[]): Array<{ draft?: unknown; record?: unknown }> {
  return messages.flatMap(message => Array.isArray(message.content) ? message.content.flatMap(part =>
    part?.type === "tool-result" && part.toolName === "manage_quote" && part.output?.type === "json" && part.output.value && typeof part.output.value === "object" ? [part.output.value] : []) : []);
}
export const hasQuoteDrafts = (messages: readonly Message[]) => outputs(messages).some(output => output.draft !== undefined);

/** Drafts are private, unapproved inputs. Replay never grants pricing authority.
 * Both runtimes use this strict, bounded, conversation-bound revision protocol. */
export async function replayQuoteDrafts(messages: readonly Message[], conversationId: string) {
  const drafts = new Map<string, QuoteDraft>(), saved = new Map<string, z.infer<typeof binding>>();
  for (const output of outputs(messages)) {
    if (output.draft !== undefined) {
      if (output.record !== undefined || JSON.stringify(output.draft).length > 48_000) throw new Error("INVALID_QUOTE_DRAFT");
      const receipt = quoteDraftSchema.parse(output.draft), { hash, ...unsigned } = receipt;
      const previous = drafts.get(receipt.quote.id), base = saved.get(receipt.quote.id) ?? null;
      if (receipt.conversationId !== conversationId || await authorityDigest(unsigned) !== hash
        || receipt.beforeDraftRevision !== (previous?.draftRevision ?? -1) || receipt.draftRevision !== receipt.beforeDraftRevision + 1
        || canonical(receipt.base) !== canonical(base) || previous && canonical(previous.base) !== canonical(receipt.base)
        || receipt.quote.revision !== (base?.revision ?? -1) + 1 || receipt.base && receipt.base.quoteId !== receipt.quote.id) throw new Error("INVALID_QUOTE_DRAFT");
      drafts.set(receipt.quote.id, receipt);
      if (drafts.size > 24) throw new Error("QUOTE_DRAFT_LIMIT");
    }
    const record = output.record as { version?: number; kind?: string; conversationId?: string; beforeRevision?: number; quote?: unknown; hash?: string } | undefined;
    if (record?.version !== 2 || record.kind !== "portia-quote" || record.conversationId !== conversationId) continue;
    const parsed = quoteCoreSchema.safeParse(record.quote);
    if (!parsed.success || typeof record.beforeRevision !== "number" || parsed.data.revision !== record.beforeRevision + 1) continue;
    const { hash, ...unsigned } = record;
    if (await authorityDigest(unsigned) !== hash) continue;
    const quote = parsed.data;
    saved.set(quote.id, { quoteId: quote.id, revision: quote.revision, digest: await authorityDigest(quoteCore(quote)) });
    drafts.delete(quote.id);
  }
  return drafts;
}

export function validateDraftBindings(drafts: ReadonlyMap<string, QuoteDraft>, packet: AuthorityPacket) {
  for (const operation of packet.operations) {
    if (operation.kind !== "quote") continue;
    const draft = drafts.get(operation.quote.id);
    if (!draft) continue; // Existing v2 callers and historical proposals remain valid.
    const candidate = { ...operation.quote }; delete candidate.baseline;
    if (canonical(draft.base) !== canonical(operation.before) || canonical(draft.quote) !== canonical(candidate)) throw new Error("STALE_QUOTE_DRAFT");
  }
}
