import type { AuthoredInput } from "../migration/call-context";
import { findAuthoredEvidence, type EvidenceTarget } from "./authored-evidence";

const base = /\b(?:unadjusted[ -]base|base[ -]only|only\s+(?:the\s+)?(?:unadjusted\s+)?base)\b/i;
const request = /\b(?:show|calculate|quote|estimate|give|compare|use|want|need|request|provide|price|return)\b/i;
const reference = /\b(?:example|illustration|template|definition|manual|guide|hypothetical|might|maybe|possibly)\b/i;
const negated = /\b(?:not|never|no|don't|do not|isn't|is not|without)\s+(?:(?:want|need|use|show|calculate|quote|estimate|the|an?|just|only)\s+){0,5}(?:unadjusted[ -]base|base[ -]only|only\s+(?:the\s+)?base)\b/i;

/** This proves an explicit scope exclusion, never a rebate entitlement/waiver
 * or a general tariff interpretation. Unknown language stays unproven. */
export function authoredUnadjustedBase(options: {
  inputs: readonly AuthoredInput[];
  targets: readonly EvidenceTarget[];
  otherTargetNames?: readonly string[];
  currentRequest: string;
  singleTarget: boolean;
  excerpt?: string;
  retainedExcerpt?: string;
}) {
  return findAuthoredEvidence({
    ...options,
    isUnscopedReply: clause => /^(?:(?:please|actually|instead)\s+)*(?:(?:show|calculate|quote|estimate|give|compare|use|want|need|provide|return|include|apply|restore)\s+(?:me\s+)?(?:the\s+)?)?(?:unadjusted[ -]base(?:\s+only)?|base[ -]only|only\s+(?:the\s+)?(?:unadjusted\s+)?base|(?:all|the|known|applicable|price)\s+(?:adjustments?|rebates?))(?:\s+please)?$/i.test(clause.trim()),
    asserts: clause => base.test(clause) && !reference.test(clause) && !negated.test(clause)
      && (request.test(clause) || /^(?:please\s+)?(?:unadjusted[ -]base(?:\s+only)?|base[ -]only|only\s+(?:the\s+)?base)(?:\s+please)?$/i.test(clause.trim())),
    contradicts: clause => negated.test(clause)
      || /\b(?:include|apply|restore|account for|with)\s+(?:(?:all|the|known|applicable|price)\s+)*(?:adjustments?|rebates?)\b/i.test(clause)
      || /\b(?:adjusted|complete|full)\s+(?:quotation|quote|invoice|bill|total)\b/i.test(clause) && !/\b(?:not|no|without|don't|do not)\b/i.test(clause),
  });
}
