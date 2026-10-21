import { z } from "zod";
import { authorityDigest, canonical, quoteCore, quoteCoreSchema, type AuthorityPacket } from "../authority/contract";
import { isQuoteWriteTool } from "./tool-names";

const binding = z.object({ quoteId: z.string().min(1).max(100), revision: z.number().int().nonnegative(), digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const draftQuoteSchema = quoteCoreSchema.omit({ baseline: true }).strict();
export const quoteDraftSchema = z.object({
  version: z.literal(1), kind: z.literal("portia-quote-draft"), conversationId: z.string().min(1),
  base: binding.nullable(), beforeDraftRevision: z.number().int().min(-1), draftRevision: z.number().int().nonnegative(),
  quote: draftQuoteSchema, hash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type QuoteDraft = z.infer<typeof quoteDraftSchema>;
const discardedDraftsSchema = z.object({
  conversationId: z.string().min(1), reason: z.enum(["rejected", "cancelled"]),
  drafts: z.array(z.object({ quoteId: z.string().min(1), draftRevision: z.number().int().nonnegative(), hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(1).max(24),
}).strict();
type Message = { role?: string; content: unknown };
type DraftOutput = { draft?: unknown; record?: unknown; discardedQuoteDrafts?: unknown };

function outputs(messages: readonly Message[]): DraftOutput[] {
  return messages.flatMap(message => Array.isArray(message.content) ? message.content.flatMap<DraftOutput>(part => {
    if (part?.type !== "tool-result" || part.output?.type !== "json" || !part.output.value || typeof part.output.value !== "object") return [];
    if (isQuoteWriteTool(part.toolName)) return [{ draft: part.output.value.draft, record: part.output.value.record }];
    if (message.role === "tool" && part.toolName === "ask_user_input" && ["rejected", "cancelled"].includes(part.output.value.resolutionReason) && part.output.value.discardedQuoteDrafts !== undefined) {
      const discarded = discardedDraftsSchema.parse(part.output.value.discardedQuoteDrafts);
      if (discarded.reason !== part.output.value.resolutionReason) throw new Error("INVALID_DRAFT_DISCARD");
      return [{ discardedQuoteDrafts: discarded }];
    }
    return [];
  }) : []);
}
export const hasQuoteDrafts = (messages: readonly Message[]) => outputs(messages).some(output => output.draft !== undefined);

/** Drafts are private, unapproved inputs. Replay never grants pricing authority.
 * Both runtimes use this strict, bounded, conversation-bound revision protocol. */
export async function replayQuoteDrafts(messages: readonly Message[], conversationId: string) {
  const drafts = new Map<string, QuoteDraft>(), lineage = new Map<string, QuoteDraft>(), retired = new Set<string>(), saved = new Map<string, z.infer<typeof binding>>();
  for (const output of outputs(messages)) {
    if (output.discardedQuoteDrafts !== undefined) {
      const discarded = discardedDraftsSchema.parse(output.discardedQuoteDrafts);
      if (discarded.conversationId !== conversationId) throw new Error("INVALID_DRAFT_DISCARD");
      for (const ref of discarded.drafts) {
        const draft = drafts.get(ref.quoteId);
        if (draft?.draftRevision === ref.draftRevision && draft.hash === ref.hash) { drafts.delete(ref.quoteId); retired.add(ref.quoteId); }
      }
    }
    if (output.draft !== undefined) {
      if (output.record !== undefined || JSON.stringify(output.draft).length > 48_000) throw new Error("INVALID_QUOTE_DRAFT");
      const receipt = quoteDraftSchema.parse(output.draft), { hash, ...unsigned } = receipt;
      const active = drafts.get(receipt.quote.id), previous = active ?? (receipt.beforeDraftRevision !== -1 ? lineage.get(receipt.quote.id) : undefined), base = saved.get(receipt.quote.id) ?? null;
      if (receipt.conversationId !== conversationId || await authorityDigest(unsigned) !== hash
        || receipt.beforeDraftRevision !== (previous?.draftRevision ?? -1) || receipt.draftRevision !== receipt.beforeDraftRevision + 1
        || canonical(receipt.base) !== canonical(base) || previous && canonical(previous.base) !== canonical(receipt.base)
        || receipt.quote.revision !== (base?.revision ?? -1) + 1 || receipt.base && receipt.base.quoteId !== receipt.quote.id) throw new Error("INVALID_QUOTE_DRAFT");
      lineage.set(receipt.quote.id, receipt);
      // Pre-fix descendants may reference a rejected draft's revision. Validate
      // their historical chain, but do not revive its rejected terms as active
      // inputs. A fresh draft or exact approved receipt starts a new branch.
      if (receipt.beforeDraftRevision === -1) retired.delete(receipt.quote.id);
      if (!retired.has(receipt.quote.id)) drafts.set(receipt.quote.id, receipt);
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
    lineage.delete(quote.id); retired.delete(quote.id);
  }
  return drafts;
}

/** Only the authenticated native form resolution mints this private history
 * event. Generated checkpoints/completions reject the reserved field. */
export async function discardedDraftsForReview(messages: readonly Message[], conversationId: string, packets: readonly AuthorityPacket[], reason: "rejected" | "cancelled") {
  const current = await replayQuoteDrafts(messages, conversationId), discarded = new Map<string, { quoteId: string; draftRevision: number; hash: string }>();
  for (const operation of packets.flatMap(packet => packet.operations)) {
    if (operation.kind !== "quote") continue;
    const draft = current.get(operation.quote.id);
    const candidate = { ...operation.quote }; delete candidate.baseline;
    if (draft && canonical(draft.base) === canonical(operation.before) && canonical(draft.quote) === canonical(candidate)) {
      discarded.set(operation.quote.id, { quoteId: operation.quote.id, draftRevision: draft.draftRevision, hash: draft.hash });
    }
  }
  return discarded.size ? discardedDraftsSchema.parse({ conversationId, reason, drafts: [...discarded.values()] }) : undefined;
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
