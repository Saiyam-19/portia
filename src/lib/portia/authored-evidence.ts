import type { AuthoredInput } from "../migration/call-context";
import { resolvePortIdentity } from "../migration/port-identity";

export type EvidenceTarget = {
  quoteId?: string;
  /** Exact human labels/references/vessel names, never generated display names. */
  names?: readonly string[];
  /** Only already validated catalog identities. */
  facilityIds?: readonly string[];
};
export type AuthoredEvidence = {
  text: string;
  sourceText: string;
  sourceMessageHash: string;
  sourceMessageIndex: number;
  sourceKind: AuthoredInput["kind"];
  toolCallId?: string;
  fieldName?: string;
  targetBinding: string;
};
type Clause = { text: string; source: AuthoredInput; clauseIndex: number };
const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
const split = (value: string) => value.split(/[!?;\n]+|\.(?=\s|$)/).map(value => value.trim()).filter(Boolean);

/** Lexical occurrence only. The caller supplies the field-specific assertion
 * and contradiction predicates; this helper does not infer user intent. */
export function containsAuthoredValue(text: string, value: string): boolean {
  const needle = normalize(value), haystack = normalize(text);
  if (!needle) return false;
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + 1)) {
    const before = haystack[at - 1], after = haystack[at + needle.length];
    if ((!before || !/[\p{L}\p{N}_]/u.test(before)) && (!after || !/[\p{L}\p{N}_]/u.test(after))) return true;
  }
  return false;
}
export function authoredTargetBinding(targets: readonly EvidenceTarget[]): string {
  return JSON.stringify(targets.map(target => ({
    quoteId: target.quoteId ?? null,
    names: [...new Set((target.names ?? []).map(normalize).filter(Boolean))].sort(),
    facilityIds: [...new Set(target.facilityIds ?? [])].sort(),
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}
function explicitlyBound(text: string, targets: readonly EvidenceTarget[], otherTargetNames: readonly string[]): boolean {
  if (!targets.length || otherTargetNames.some(name => containsAuthoredValue(text, name))) return false;
  const named = targets.every(target => [...target.names ?? [], ...(target.quoteId ? [target.quoteId] : [])].some(name => containsAuthoredValue(text, name)));
  if (named) return true;
  const facilities = [...new Set(targets.flatMap(target => target.facilityIds ?? []))];
  // Several quote targets at one facility cannot be distinguished by that
  // facility alone. Their exact quote labels are necessary.
  if (targets.length !== 1 || !facilities.length) return false;
  const selection = resolvePortIdentity(text);
  return selection?.status === "identified" && facilities.includes(selection.candidates[0]);
}
function noConflictingTarget(text: string, targets: readonly EvidenceTarget[], otherTargetNames: readonly string[]): boolean {
  if (otherTargetNames.some(name => containsAuthoredValue(text, name))) return false;
  const allowed = new Set(targets.flatMap(target => target.facilityIds ?? []));
  const selection = resolvePortIdentity(text);
  return !selection || (selection.status === "identified" || selection.status === "comparison")
    && selection.candidates.every(candidate => allowed.has(candidate));
}

/** Search authenticated input atoms separately, never concatenate history.
 * Evidence is returned with its exact source hash and target binding. The
 * complete containing clause is tested so an excerpt cannot omit negation.
 *
 * Earlier positive evidence must be explicitly scoped. An unscoped reply is
 * usable only in the current message when the caller has established a single
 * target. Newer relevant contradictions invalidate older positive evidence.
 * Subject/field semantics remain in the caller's predicates.
 */
export function findAuthoredEvidence(options: {
  inputs: readonly AuthoredInput[];
  targets: readonly EvidenceTarget[];
  otherTargetNames?: readonly string[];
  currentRequest: string;
  singleTarget: boolean;
  /** Explicit multi-target statement whose message must name every target and
   * no other saved target; useful for supplied-package scope equivalence. */
  allowMessageBinding?: boolean;
  excerpt?: string;
  /** Only an exact excerpt already bound by a verified saved application
   * record to these same targets. Never populate from fresh model arguments. */
  retainedExcerpt?: string;
  /** A bounded reply shape for this field, such as an exact requested enum or
   * a short scope directive. It must not contain a different named subject. */
  isUnscopedReply?: (clause: string, source: AuthoredInput) => boolean;
  asserts: (clause: string, source: AuthoredInput) => boolean;
  contradicts: (clause: string, source: AuthoredInput) => boolean;
}): AuthoredEvidence | undefined {
  const others = options.otherTargetNames ?? [];
  const clauses: Clause[] = options.inputs.flatMap(source => split(source.text).map((text, clauseIndex) => ({ text, source, clauseIndex })));
  const lastIndex = Math.max(-1, ...options.inputs.map(source => source.messageIndex));
  const isCurrent = (source: AuthoredInput) => source.messageIndex === lastIndex
    && (normalize(source.text) === normalize(options.currentRequest) || containsAuthoredValue(options.currentRequest, source.text));
  const scoped = ({ text, source }: Clause, allowUnscoped: boolean) => explicitlyBound(text, options.targets, others)
    || (options.allowMessageBinding || options.singleTarget && options.isUnscopedReply?.(text, source) === true)
      && explicitlyBound(source.text, options.targets, others) && noConflictingTarget(text, options.targets, others)
    || allowUnscoped && options.singleTarget && options.targets.length === 1
      && options.isUnscopedReply?.(text, source) === true && noConflictingTarget(source.text, options.targets, others);
  for (let index = clauses.length - 1; index >= 0; index--) {
    const candidate = clauses[index];
    // Clause splitting removes sentence terminators; a verbatim full sentence
    // remains valid evidence when its only omitted characters are terminators.
    const excerpt = options.excerpt?.trim().replace(/[.!?;]+$/, "").trim();
    if (excerpt && !containsAuthoredValue(candidate.text, excerpt)) continue;
    const retained = !!options.retainedExcerpt && !!options.excerpt
      && normalize(options.retainedExcerpt) === normalize(options.excerpt)
      && noConflictingTarget(candidate.source.text, options.targets, others);
    if (!(scoped(candidate, isCurrent(candidate.source)) || retained) || !options.asserts(candidate.text, candidate.source)) continue;
    const superseded = clauses.slice(index + 1).some(later => scoped(later, options.singleTarget)
      && options.contradicts(later.text, later.source));
    if (superseded) continue;
    return {
      text: candidate.text, sourceText: candidate.source.text,
      sourceMessageHash: candidate.source.messageHash, sourceMessageIndex: candidate.source.messageIndex,
      sourceKind: candidate.source.kind,
      ...(candidate.source.toolCallId ? { toolCallId: candidate.source.toolCallId } : {}),
      ...(candidate.source.fieldName ? { fieldName: candidate.source.fieldName } : {}),
      targetBinding: authoredTargetBinding(options.targets),
    };
  }
}
