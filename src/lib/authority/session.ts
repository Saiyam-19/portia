import { createHash, randomUUID } from "node:crypto";
import { canonical, comparisonCore, quoteCore, parsePacket, reviewPacket, approvalForm, ReviewCapacityError, type AuthorityOperation, type AuthorityContext, type QuoteCore } from "./contract";
const digest = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
/** Preserve logical review groups while splitting their ordered operations into
 * complete native packets that satisfy the existing count/display limits. */
function reviewBatches(operations: AuthorityOperation[]) {
  const payload = (entries: AuthorityOperation[]) => {
    const mixed = entries.some(op => op.kind === "quote") && entries.some(op => op.kind === "comparison");
    return canonical({ version: mixed ? 2 : 1, operations: entries });
  };
  const packet = (entries: AuthorityOperation[]) => parsePacket(payload(entries));
  const batches: ReturnType<typeof packet>[] = [];
  let current: AuthorityOperation[] = [];
  for (const operation of operations) {
    let trial = [...current, operation];
    if (current.length && (trial.length > 4 || new TextEncoder().encode(payload(trial)).byteLength > 48_000)) {
      batches.push(packet(current));
      current = [];
      trial = [operation];
    }
    const candidate = packet(trial); // Structural errors are never repaired by splitting.
    try { reviewPacket(candidate); current = trial; }
    catch (error) {
      if (!current.length) throw error;
      batches.push(packet(current));
      current = [operation];
      reviewPacket(packet(current)); // An individually oversized operation stays rejected.
    }
  }
  if (current.length) batches.push(packet(current));
  return batches;
}
export class AuthoritySession {
  private readonly operations: Array<{operation:AuthorityOperation;reviewGroup:string}> = [];
  private readonly groupOrder: string[] = [];
  readonly formId = `authorization-${randomUUID()}`;
  constructor(readonly context: AuthorityContext = { quotes: [], comparisons: [] }, continuation: Array<{payload:string;reviewGroup:string}> = []) { for(const item of continuation){const packet=parsePacket(item.payload);if(!this.groupOrder.includes(item.reviewGroup))this.groupOrder.push(item.reviewGroup);for(const operation of packet.operations)this.operations.push({operation:structuredClone(operation),reviewGroup:item.reviewGroup});} }
  approvedQuote(quote: QuoteCore) { return this.context.quotes.some(item => item.quoteId === quote.id && item.revision === quote.revision && item.digest === digest(quoteCore(quote))); }
  approvedComparison(op: Extract<AuthorityOperation, {kind:"comparison"}>) { return this.context.comparisons.includes(digest(comparisonCore(op))); }
  propose(operation: AuthorityOperation, reviewGroup?: string) {
    const unavailable = (body: string) => ({ status: "unresolved" as const, availability: "unavailable" as const,
      code: "review_capacity", approvalRequired: false as const, stagedForReview: false as const, operationId: undefined,
      invalidatedComparisons: 0, body, questions: [] as string[] });
    let invalidatedComparisons = 0;
    let candidate=this.operations.map(item=>({operation:structuredClone(item.operation),reviewGroup:item.reviewGroup}));
    const same=(item:{operation:AuthorityOperation;reviewGroup:string})=>operation.kind==="quote"?item.operation.kind==="quote"&&item.operation.quote.id===operation.quote.id:operation.kind==="comparison"?item.operation.kind==="comparison"&&canonical(comparisonCore(item.operation))===canonical(comparisonCore(operation)):(item.operation.kind==="remember"||item.operation.kind==="forget")&&item.operation.kind===operation.kind&&item.operation.key===operation.key;
    const targetGroup=reviewGroup??candidate.find(same)?.reviewGroup??"default";
    if (operation.kind === "quote") {
      const at=candidate.findIndex(item=>item.operation.kind==="quote"&&item.operation.quote.id===operation.quote.id);
      if(at>=0)candidate[at]={operation:structuredClone(operation),reviewGroup:targetGroup};else candidate.push({operation:structuredClone(operation),reviewGroup:targetGroup});
      candidate=candidate.filter(item=>{if(item.operation.kind!=="comparison"||!item.operation.quotes.some(binding=>binding.quoteId===operation.quote.id))return true;invalidatedComparisons++;return false;});
    } else if (operation.kind === "comparison") {
      const at=candidate.findIndex(item=>item.operation.kind==="comparison"&&canonical(comparisonCore(item.operation))===canonical(comparisonCore(operation)));
      if(at>=0)candidate[at]={operation:structuredClone(operation),reviewGroup:targetGroup};else candidate.push({operation:structuredClone(operation),reviewGroup:targetGroup});
    } else {
      const at=candidate.findIndex(item=>(item.operation.kind==="remember"||item.operation.kind==="forget")&&item.operation.kind===operation.kind&&item.operation.key===operation.key);
      if(at>=0)candidate[at]={operation:structuredClone(operation),reviewGroup:targetGroup};else candidate.push({operation:structuredClone(operation),reviewGroup:targetGroup});
    }
    if (candidate.length > 16) return unavailable("This operation could not be staged because the current review queue contains 16 operations. Finish those exact reviews, then continue the remaining request. No pending operation was removed or approved.");
    const group = candidate.filter(item => item.reviewGroup === targetGroup).map(item => item.operation);
    try { reviewBatches(group); }
    catch (error) { if (error instanceof ReviewCapacityError) return unavailable(error.message); throw error; }
    this.operations.splice(0,this.operations.length,...candidate); if(!this.groupOrder.includes(targetGroup))this.groupOrder.push(targetGroup);
    return { status: "unresolved" as const, approvalRequired: true, stagedForReview: true, operationId: operation.id, invalidatedComparisons, body: `Operation staged for exact review.${invalidatedComparisons ? ` ${invalidatedComparisons} dependent comparison${invalidatedComparisons === 1 ? " was" : "s were"} invalidated and must be prepared again.` : ""} Continue any other requested work before the final review form.`, questions: [] as string[] };
  }
  withdrawQuote(quoteId:string) { const before=this.operations.length; this.operations.splice(0,this.operations.length,...this.operations.filter(item=>item.operation.kind!=="quote"||item.operation.quote.id!==quoteId).filter(item=>item.operation.kind!=="comparison"||!item.operation.quotes.some(binding=>binding.quoteId===quoteId))); return before-this.operations.length; }
  pendingQuote(quoteId:string) { const item=[...this.operations].reverse().find(entry=>entry.operation.kind==="quote"&&entry.operation.quote.id===quoteId); return item?.operation.kind==="quote" ? structuredClone(item.operation.quote) : undefined; }
  pendingOperations() { return this.operations.map(item=>structuredClone(item.operation)); }
  // Only the deterministic server executor calls these after authenticated approval.
  acceptQuote(quote: QuoteCore) { this.context.quotes = [...this.context.quotes.filter(q => q.quoteId !== quote.id), AuthoritySession.binding(quote)]; }
  acceptComparison(op: Extract<AuthorityOperation, {kind:"comparison"}>) { this.context.comparisons.push(digest(comparisonCore(op))); }
  proposedQuoteCount() { return this.operations.filter(item => item.operation.kind === "quote" && !item.operation.before).length; }
  hasPending() { return this.operations.length > 0; }
  pendingQueue() {
    const groups = this.groupOrder.filter(group => this.operations.some(item => item.reviewGroup === group));
    const packets = groups.flatMap(reviewGroup => reviewBatches(this.operations.filter(item => item.reviewGroup === reviewGroup).map(item => item.operation)).map(packet => ({ packet, reviewGroup })));
    return packets.map(({ packet, reviewGroup }, index) => ({ payload: canonical(packet), form: approvalForm(packet, `${this.formId}:${index}`), reviewGroup }));
  }
  pending() { return this.pendingQueue()[0]; }
  static binding(quote: QuoteCore) { return { quoteId: quote.id, revision: quote.revision, digest: digest(quoteCore(quote)) }; }
}
