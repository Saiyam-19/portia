import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  authorityDigest,
  canonical,
  comparisonCore,
  parsePacket,
  quoteCore,
  type AuthorityPacket,
  type QuoteBinding,
  type QuoteCore,
} from "../../src/lib/authority/contract";
import { enqueueMemory, ensureMemory, hashMemory, memoryEnabled } from "./memoryLifecycle";
import { hasQuoteDrafts, replayQuoteDrafts, validateDraftBindings } from "../../src/lib/portia/quote-drafts";
import { isQuoteWriteTool } from "../../src/lib/portia/tool-names";

const authorityError = (code: string, message: string): never => {
  throw new ConvexError({ code, message });
};

export function checkedPacket(payload: string): AuthorityPacket {
  try {
    return parsePacket(payload);
  } catch {
    return authorityError("INVALID_AUTHORIZATION", "The exact-operation approval payload is invalid.");
  }
}

function sameBinding(left: QuoteBinding, right: QuoteBinding): boolean {
  return left.quoteId === right.quoteId && left.revision === right.revision && left.digest === right.digest;
}

/** Validate every mutable base against server state. This is called both when the
 * server creates the review and again when the user accepts it. */
export async function validateAuthorityBase(
  ctx: MutationCtx,
  conversation: Doc<"migrationConversations">,
  packet: AuthorityPacket,
  persistedMessages: Array<{ content: unknown }> = [],
): Promise<void> {
  validateDraftBindings(await replayQuoteDrafts(persistedMessages, conversation._id), packet);
  const currentQuotes = new Map((conversation.quoteApprovals ?? []).map((item) => [item.quoteId, item]));
  const savedHeads = new Map<string,{binding:QuoteBinding;eligible:boolean}>();
  for (const receipt of quoteReceipts(persistedMessages)) {
    if (receipt.version !== 2 || receipt.kind !== "portia-quote" || receipt.conversationId !== conversation._id || typeof receipt.beforeRevision !== "number" || typeof receipt.hash !== "string" || !receipt.quote || typeof receipt.quote !== "object" || Array.isArray(receipt.quote)) continue;
    const candidate=receipt.quote as QuoteCore;
    if (candidate.revision!==receipt.beforeRevision+1) continue;
    const prior=savedHeads.get(candidate.id);
    if (receipt.beforeRevision>=0 && (!prior || prior.binding.revision!==receipt.beforeRevision)) continue;
    const unsigned={version:2,kind:"portia-quote",conversationId:conversation._id,beforeRevision:receipt.beforeRevision,quote:candidate};
    if (await authorityDigest(unsigned)!==receipt.hash) continue;
    savedHeads.set(candidate.id,{binding:{quoteId:candidate.id,revision:candidate.revision,digest:await authorityDigest(quoteCore(candidate))},eligible:candidate.pricing==="official"&&candidate.call.fxInrPerUsd===undefined});
  }
  for(const [id,head] of savedHeads){const approved=currentQuotes.get(id);if(head.eligible&&(!approved||head.binding.revision>approved.revision))currentQuotes.set(id,head.binding);}
  for (const operation of packet.operations) {
    if (operation.kind === "quote") {
      const current = currentQuotes.get(operation.quote.id);
      if (!operation.before) {
        if (current) authorityError("STALE_AUTHORIZATION", "The quotation already has a newer approved revision.");
      } else {
        if (!operation.previous || await authorityDigest(quoteCore(operation.previous)) !== operation.before.digest) {
          authorityError("INVALID_AUTHORIZATION", "The quotation's previous snapshot does not match its binding.");
        }
        if (current && !sameBinding(current, operation.before)) {
          authorityError("STALE_AUTHORIZATION", "The quotation changed after the review was created.");
        }
      }
      currentQuotes.set(operation.quote.id, {
        quoteId: operation.quote.id,
        revision: operation.quote.revision,
        digest: await authorityDigest(quoteCore(operation.quote)),
      });
      continue;
    }
    if (operation.kind === "comparison") {
      const ids = new Set<string>();
      for (const binding of operation.quotes) {
        if (ids.has(binding.quoteId)) authorityError("INVALID_AUTHORIZATION", "A comparison cannot repeat a quotation.");
        ids.add(binding.quoteId);
        const current = currentQuotes.get(binding.quoteId);
        if (!current) authorityError("STALE_AUTHORIZATION", "A comparison quotation is neither an approved saved quote nor a preceding quotation operation.");
        if (current && !sameBinding(current, binding)) {
          authorityError("STALE_AUTHORIZATION", "A comparison quotation changed after the review was created.");
        }
      }
    }
  }

  const memoryOperations = packet.operations.flatMap((operation) =>
    operation.kind === "remember" || operation.kind === "forget" ? [operation] : [],
  );
  if (!memoryOperations.length) return;
  if (!memoryEnabled()) authorityError("MEMORY_DISABLED", "Cross-chat memory is disabled.");
  const namespace = await ensureMemory(ctx, conversation.ownerId);
  if (namespace.nextSequence !== namespace.appliedSequence || namespace.blockedThrough > namespace.appliedSequence) {
    authorityError("MEMORY_BUSY", "Pending memory work must finish before reviewing another memory change.");
  }
  for (const operation of memoryOperations) {
    if (operation.memoryEpoch !== namespace.epoch || operation.memoryRevision > namespace.revision) {
      authorityError("STALE_AUTHORIZATION", "Memory epoch or revision is inconsistent with the review base.");
    }
    const current = namespace.factIndex.find((fact) => fact.key === operation.key);
    if (!current) {
      if (operation.previousValue !== null || operation.previousValueHash !== null) authorityError("STALE_AUTHORIZATION", "The prior memory value no longer exists.");
    } else if (operation.previousValueHash !== current.hash) {
      authorityError("STALE_AUTHORIZATION", "The prior memory value changed after the review was created.");
    } else if (operation.kind === "remember" && (operation.previousValue === null || await hashMemory(operation.previousValue) !== current.hash)) {
      authorityError("INVALID_AUTHORIZATION", "The displayed prior memory value does not match its server binding.");
    }
    // A newer namespace revision may come from an independently reviewed key.
    // Exact epoch plus this key's prior hash/value remains the authorization fence.
  }
}

export async function enqueueAuthorizedMemory(
  ctx: MutationCtx,
  ownerId: string,
  conversationId: Id<"migrationConversations">,
  formId: Id<"migrationForms">,
  runId: Id<"migrationRuns">,
  packet: AuthorityPacket,
): Promise<void> {
  for (const operation of packet.operations) {
    if (operation.kind !== "remember" && operation.kind !== "forget") continue;
    const namespace = await ensureMemory(ctx, ownerId);
    const run = await ctx.db.get(runId);
    if (!run) return authorityError("INTERNAL", "Approved memory admission lost its server state.");
    const memoryOperation = operation.kind === "remember"
      ? { kind: "remember" as const, key: operation.key, value: operation.value!, source: conversationId }
      : { kind: "forget" as const, key: operation.key };
    await enqueueMemory(ctx, ownerId, `authority:${formId}:${operation.id}`, namespace.epoch, memoryOperation, run);
  }
}

type Receipt = {
  version?: unknown;
  kind?: unknown;
  conversationId?: unknown;
  beforeRevision?: unknown;
  quote?: unknown;
  hash?: unknown;
  [key: string]: unknown;
};

function quoteReceipts(messages: Array<{ content: unknown }>, toolName = "manage_quote"): Receipt[] {
  const receipts: Receipt[] = [];
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const raw of message.content) {
      if (!raw || typeof raw !== "object") continue;
      const part = raw as { type?: unknown; toolName?: unknown; output?: unknown };
      if (part.type !== "tool-result" || !(toolName === "manage_quote" ? isQuoteWriteTool(part.toolName) : part.toolName === toolName) || !part.output || typeof part.output !== "object") continue;
      const output = part.output as { type?: unknown; value?: unknown };
      if (output.type !== "json" || !output.value || typeof output.value !== "object") continue;
      const record = (output.value as { record?: unknown }).record;
      if (record && typeof record === "object" && !Array.isArray(record)) receipts.push(record as Receipt);
    }
  }
  return receipts;
}

function priceSensitive(receipt: Receipt): boolean {
  if (!receipt.quote || typeof receipt.quote !== "object" || Array.isArray(receipt.quote)) return false;
  const quote = receipt.quote as { pricing?: unknown; call?: unknown };
  const call = quote.call && typeof quote.call === "object" && !Array.isArray(quote.call) ? quote.call as Record<string, unknown> : {};
  return quote.pricing === "supplied" || call.fxInrPerUsd !== undefined;
}

/** No model-provided approval flag or receipt checksum is authority. For approved
 * runs, the persisted packet is the sole allowlist and every quote receipt must
 * equal it byte-for-byte after canonicalization. */
export async function validateQuoteReceipts(
  messages: Array<{ content: unknown }>,
  conversationId: Id<"migrationConversations">,
  packet?: AuthorityPacket,
  requireAll = false,
  persistedMessages: Array<{ content: unknown }> = [],
): Promise<void> {
  try {
    if (hasQuoteDrafts(messages)) {
      if (packet) authorityError("AUTHORIZATION_RECEIPT_MISMATCH", "Approved execution cannot substitute an unapproved draft.");
      await replayQuoteDrafts([...persistedMessages, ...messages], conversationId);
    }
    if (packet) validateDraftBindings(await replayQuoteDrafts(persistedMessages, conversationId), packet);
  } catch {
    authorityError("INVALID_QUOTE_DRAFT", "The quotation draft has invalid identity, integrity, base or revision.");
  }
  const receipts = quoteReceipts(messages);
  if (!packet) {
    if (receipts.some(priceSensitive)) {
      authorityError("APPROVAL_REQUIRED", "Supplied prices and supplied FX require exact user approval.");
    }
    return;
  }
  const quoteOperations = packet.operations.filter((operation) => operation.kind === "quote");
  const seen = new Set<string>();
  for (const receipt of receipts) {
    if (canonical(Object.keys(receipt).sort()) !== canonical(["beforeRevision", "conversationId", "hash", "kind", "quote", "version"])) {
      authorityError("AUTHORIZATION_RECEIPT_MISMATCH", "The quotation receipt contains fields outside the approved record.");
    }
    if (receipt.version !== 2 || receipt.kind !== "portia-quote" || receipt.conversationId !== conversationId || typeof receipt.beforeRevision !== "number" || typeof receipt.hash !== "string" || !receipt.quote || typeof receipt.quote !== "object" || Array.isArray(receipt.quote)) {
      authorityError("AUTHORIZATION_RECEIPT_MISMATCH", "The quotation receipt is malformed.");
    }
    const quote = receipt.quote as Record<string, unknown>;
    const operation = quoteOperations.find((candidate) => candidate.quote.id === quote.id) ??
      authorityError("AUTHORIZATION_RECEIPT_MISMATCH", "A quotation receipt is absent from the approved packet.");
    if (seen.has(operation.id)) {
      authorityError("AUTHORIZATION_RECEIPT_MISMATCH", "A quotation receipt is absent from or duplicated in the approved packet.");
    }
    if (receipt.beforeRevision !== (operation.before?.revision ?? -1) || canonical(quote) !== canonical(operation.quote)) {
      authorityError("AUTHORIZATION_RECEIPT_MISMATCH", "The executed quotation differs from the exact approved candidate.");
    }
    const unsigned = { version: 2, kind: "portia-quote", conversationId, beforeRevision: receipt.beforeRevision, quote };
    if (await authorityDigest(unsigned) !== receipt.hash) {
      authorityError("AUTHORIZATION_RECEIPT_MISMATCH", "The quotation receipt checksum is invalid.");
    }
    seen.add(operation.id);
  }
  if (requireAll) {
    const comparisons = quoteReceipts(messages, "compare_quotes");
    const approved = packet.operations.filter(op => op.kind === "comparison");
    if (comparisons.length !== approved.length) authorityError("AUTHORIZATION_RECEIPT_MISMATCH", "Every approved comparison needs one exact completion receipt.");
    for (const op of approved) {
      const expected = {version:1,kind:"portia-comparison",conversationId,...comparisonCore(op)};
      const index = comparisons.findIndex(record => canonical(record) === canonical(expected));
      if (index < 0) authorityError("AUTHORIZATION_RECEIPT_MISMATCH", "The executed comparison differs from its approved input and quotation revisions.");
      comparisons.splice(index,1);
    }
  }
  if (requireAll && seen.size !== quoteOperations.length) {
    authorityError("AUTHORIZATION_RECEIPT_MISMATCH", "Every approved quotation needs one exact completion receipt.");
  }
}

export async function authorityLedgerUpdates(
  conversation: Doc<"migrationConversations">,
  packet: AuthorityPacket,
): Promise<{ quoteApprovals: QuoteBinding[]; comparisonApprovals: string[] }> {
  const quotes = new Map((conversation.quoteApprovals ?? []).map((item) => [item.quoteId, item]));
  const comparisons = new Set(conversation.comparisonApprovals ?? []);
  for (const operation of packet.operations) {
    if (operation.kind === "quote") {
      quotes.set(operation.quote.id, {
        quoteId: operation.quote.id,
        revision: operation.quote.revision,
        digest: await authorityDigest(quoteCore(operation.quote)),
      });
    } else if (operation.kind === "comparison") {
      comparisons.add(await authorityDigest(comparisonCore(operation)));
    }
  }
  if (quotes.size > 24 || comparisons.size > 24) {
    authorityError("AUTHORITY_LIMIT", "This conversation reached its approved-operation history limit.");
  }
  return { quoteApprovals: [...quotes.values()], comparisonApprovals: [...comparisons] };
}
