import { createHash, randomUUID } from "node:crypto";
import { canonical, comparisonCore, quoteCore, authorityPacketSchema, parsePacket, reviewPacket, approvalForm, type AuthorityOperation, type AuthorityContext, type QuoteCore } from "./contract";
const digest = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
export class AuthoritySession {
  private readonly operations: AuthorityOperation[] = [];
  readonly formId = `authorization-${randomUUID()}`;
  constructor(readonly context: AuthorityContext = { quotes: [], comparisons: [] }) {}
  approvedQuote(quote: QuoteCore) { return this.context.quotes.some(item => item.quoteId === quote.id && item.revision === quote.revision && item.digest === digest(quoteCore(quote))); }
  approvedComparison(op: Extract<AuthorityOperation, {kind:"comparison"}>) { return this.context.comparisons.includes(digest(comparisonCore(op))); }
  propose(operation: AuthorityOperation) {
    if (operation.kind === "comparison" && this.operations.some(op => op.kind === "quote") || operation.kind === "quote" && this.operations.some(op => op.kind === "comparison")) throw new Error("Confirm the quotation changes before comparing their new revisions.");
    const packet = parsePacket(canonical({ version: 1, operations: [...this.operations, structuredClone(operation)] }));
    reviewPacket(packet); this.operations.push(structuredClone(operation));
    return { status: "unresolved" as const, approvalRequired: true, body: "This operation is awaiting your confirmation. No quoted price was accepted and no cross-chat memory change was made.", questions: [] as string[] };
  }
  // Only the deterministic server executor calls these after authenticated approval.
  acceptQuote(quote: QuoteCore) { this.context.quotes = [...this.context.quotes.filter(q => q.quoteId !== quote.id), AuthoritySession.binding(quote)]; }
  acceptComparison(op: Extract<AuthorityOperation, {kind:"comparison"}>) { this.context.comparisons.push(digest(comparisonCore(op))); }
  proposedQuoteCount() { return this.operations.filter(op => op.kind === "quote" && !op.before).length; }
  hasPending() { return this.operations.length > 0; }
  pending() { if (!this.operations.length) return; const packet = authorityPacketSchema.parse({ version: 1, operations: this.operations }); return { payload: canonical(packet), form: approvalForm(packet, this.formId) }; }
  static binding(quote: QuoteCore) { return { quoteId: quote.id, revision: quote.revision, digest: digest(quoteCore(quote)) }; }
}
