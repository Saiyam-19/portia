import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assertRemainingObligations, type RemainingObligations } from "./remaining-obligations";
import { publicationFits, PUBLICATION_LIMIT_MESSAGE } from "../migration/publication-contract";

export function hasFinancialClaim(prose: string): boolean {
  const text = prose.normalize("NFKC");
  const quantity = String.raw`(?:\p{N}[\p{N},.]*|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|lakh|crore)\b)`;
  const currencyUnits = Intl.supportedValuesOf("currency").join("|");
  const moneyUnit = String.raw`(?:\p{Sc}|(?:USD|INR|EUR|GBP)(?![a-z])|\b(?:dollars?|rupees?|euros?|pounds?)\b)`;
  const currencyCode = String.raw`\b(?:${currencyUnits})\b`;
  // ISO codes are uppercase data. Case-insensitive matching would misclassify
  // ordinary words such as "try", "all" and "top" as currency claims.
  const currencyAmount = new RegExp(`${currencyCode}[^.!?\\n]{0,80}${quantity}|${quantity}[^.!?\\n]{0,80}${currencyCode}`, "u");
  const amount = new RegExp(`${moneyUnit}[^.!?\n]{0,80}${quantity}|${quantity}[^.!?\n]{0,80}${moneyUnit}|${quantity}\\s*%`, "iu");
  const financial = String.raw`\b(?:price|cost|charge|fee|total|payable|tax|discount|rebate|bill|invoice|amount)s?\b`;
  return amount.test(text) || currencyAmount.test(text) || new RegExp(`${financial}[^.!?\n]{0,80}${quantity}`, "iu").test(text)
    || /\b(?:tariff|GST|tax|berth[ -]hire|port[ -]dues)\b[^.!?\n]{0,100}\b(?:exempt\w*|waiv\w*|free|minimum|maximum|commenced|round\w*|applicable|valid\w*)\b/iu.test(text);
}

export const outcomeKindSchema = z.enum(["quotation", "quotation_read", "comparison", "information", "calculation", "elapsed_time", "vessel_lookup", "memory_read", "memory_write", "notes_read", "notes_write"]);
export type OutcomeKind = z.infer<typeof outcomeKindSchema>;
export type EvidenceDisposition = "completed" | "awaiting_input" | "awaiting_approval" | "unavailable" | "failed";
export const reportingViewSchema = z.object({
  stage: z.enum(["exact", "line", "total"]),
  decimals: z.number().int().min(0).max(8).optional(),
}).strict().superRefine((view, context) => {
  if (view.stage === "exact" ? view.decimals !== undefined : view.decimals === undefined) context.addIssue({ code: "custom", path: ["decimals"], message: "Exact views omit precision; line/total views require the returned decimal precision." });
});
export type ReportingView = z.infer<typeof reportingViewSchema>;
const reportingViewSet = (views: readonly ReportingView[]) => JSON.stringify([...new Set(views.map(view => `${view.stage}:${view.decimals ?? ""}`))].sort());
const reportingPairs = (targets: readonly string[], views: readonly ReportingView[]) =>
  targets.flatMap(target => views.map(view => JSON.stringify([target, view.stage, view.decimals ?? null])));
const outcomeSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),
  requestedOutcome: z.string().trim().min(1).max(400),
  kind: outcomeKindSchema,
  targets: z.array(z.string().min(1).max(120)).max(24).describe("Returned target IDs from the result evidence. Never invent IDs. Empty until actual targets are known; once declared, retain them on finish retries."),
  comparisonCurrency: z.string().regex(/^[A-Z]{3}$/).optional().describe("For a comparison, its requested target currency. Omit only while that currency is genuinely unknown."),
  reportingViews: z.array(reportingViewSchema).min(1).max(19).optional().describe("For quotation_read, list exactly the requested returned views across this outcome's evidence. Use stage exact without decimals for unformatted reads; line/total requires decimals. Separate outcomes or one combined view set are allowed. Omission means exact-only."),
  evidenceIds: z.array(z.string().min(1).max(100)).max(24),
}).strict();
export const finishTurnSchema = z.object({
  outcomes: z.array(outcomeSchema).max(24).describe("Every requested business outcome, including independent and unfinished work. Reuse outcome IDs and kinds when repairing a rejected finish; reads cannot substitute for calculation or comparison."),
  response: z.string().max(4000).optional().describe("Questions and general conversational explanation, preserved beside verified business results. Financial amounts and tariff claims must come from tools, not this prose."),
}).strict();
export type FinishTurnInput = z.infer<typeof finishTurnSchema>;
/** The model supplies conversation and honest pending intent only. Executed
 * operations, IDs, targets, revisions and views are derived from tool records. */
export const finishExecutedSchema = z.object({
  response: z.string().max(4000).optional().describe("Questions or explanation; amounts and status are rendered by the server."),
  pending: z.array(z.object({kind:outcomeKindSchema,reason:z.string().trim().min(1).max(400)}).strict()).max(24).optional()
    .describe("Requested work not attempted by any tool. State why it remains unfinished; never silently drop it."),
}).strict();
export type FinishExecutedInput = z.infer<typeof finishExecutedSchema>;
export type EvidenceRegistration = {
  toolName: string;
  kind: OutcomeKind;
  disposition: EvidenceDisposition;
  targets: string[];
  comparisonCurrency?: string;
  reportingView?: ReportingView;
  summary?: string;
  operationId?: string;
  questions?: string[];
  detail?: string;
  quoteState?: {quoteIds:string[];digest:string};
  /** Server-only operation dimensions; source revisions remain in quoteState. */
  comparisonBinding?: string;
  invalidated?: () => boolean;
  required?: boolean;
  current?: () => boolean;
};
type Evidence = EvidenceRegistration & { id: string; toolCallId: string };
type Outcome = z.infer<typeof outcomeSchema>;
type Issue = { outcomeId?: string; code: string; message: string; nextTools?: string[] };
const toolsFor: Record<OutcomeKind, string[]> = {
  quotation: ["supplied_quote", "official_quote"], quotation_read: ["read_quotes"], comparison: ["compare_quotes"],
  information: ["port_information"], calculation: ["calculate_charges"], elapsed_time: ["calculate_elapsed_time"],
  vessel_lookup: ["search_vessels", "get_vessel"], memory_read: ["recall_memory"], memory_write: ["remember_memory", "forget_memory"],
  notes_read: ["read_scratchpad"], notes_write: ["write_scratchpad"],
};
const INVALIDATED_COMPARISON = "An earlier comparison remains unfinished because its source quotations changed. Recompute its selected charges and exact terms before treating that comparison as complete.";

/** Per-run completion evidence. It tracks execution, not semantic understanding
 * of all human intent; it grants no financial or memory authority. */
export class CompletionSession {
  private readonly evidence = new Map<string, Evidence>();
  private readonly calls = new Map<string, string>();
  private readonly latest = new Map<string, string>();
  private readonly outcomes = new Map<string, Omit<Outcome, "evidenceIds">>();
  private readonly verifiedBindings = new Set<string>();
  private candidate?: { callId: string; input: FinishTurnInput };
  private accepted?: { response: string; outcomes: Array<Outcome & { disposition: EvidenceDisposition }> };
  private issues: Issue[] = [];
  private attempted = false;
  private readonly pendingIntent: NonNullable<FinishExecutedInput["pending"]> = [];

  constructor(private readonly renderPublication?: (response: string) => string) {}

  register(toolCallId: string, registration: EvidenceRegistration) {
    const prior = this.calls.get(toolCallId);
    if (prior) return this.publicEvidence(this.evidence.get(prior)!);
    if (this.evidence.size >= 256) throw new Error("Run evidence limit reached.");
    const evidence = { ...registration, targets: [...registration.targets], ...(registration.reportingView ? { reportingView: { ...registration.reportingView } } : {}), toolCallId, id: `result-${randomUUID()}` };
    this.evidence.set(evidence.id, evidence); this.calls.set(toolCallId, evidence.id); this.accepted = undefined;
    if (registration.kind === "quotation" && registration.required && registration.disposition !== "failed" && registration.targets.length) this.latest.set(this.signature(evidence), evidence.id);
    return this.publicEvidence(evidence);
  }
  private publicEvidence({ id, toolCallId, toolName, kind, disposition, targets, comparisonCurrency, reportingView, summary }: Evidence) { return { id, toolCallId, toolName, kind, disposition, targets, ...(comparisonCurrency ? { comparisonCurrency } : {}), ...(reportingView ? { reportingView: { ...reportingView } } : {}), ...(summary ? { summary } : {}) }; }
  private signature(evidence: Evidence) { return JSON.stringify([evidence.kind, [...evidence.targets].sort()]); }
  private isCurrent(evidence: Evidence) { try { const latest = evidence.kind === "quotation" && evidence.required && evidence.targets.length ? this.latest.get(this.signature(evidence)) : undefined; return (!latest || latest === evidence.id || evidence.disposition === "failed") && evidence.current?.() !== false; } catch { return false; } }
  private invalidatedComparisons() {
    const entries = [...this.evidence.values()];
    return entries.filter((entry,index) => {
      if (entry.kind !== "comparison" || entry.disposition === "failed" || this.isCurrent(entry)) return false;
      let invalidated: boolean;
      try { invalidated = entry.invalidated?.() ?? ["completed","awaiting_approval"].includes(entry.disposition); }
      catch { invalidated = true; }
      if (!invalidated) return false;
      // A different selection, FX relationship, tax basis or view cannot close
      // this branch. Source revision changes alone permit exact recomputation.
      return !entry.comparisonBinding || !entries.slice(index+1).some(next =>
        next.kind === "comparison" && next.comparisonBinding === entry.comparisonBinding
        && ["completed","awaiting_approval"].includes(next.disposition) && this.isCurrent(next));
    });
  }
  finishExecuted(input: FinishExecutedInput, callId: string) {
    for (const pending of input.pending ?? []) if (!this.pendingIntent.some(item=>item.kind===pending.kind && item.reason===pending.reason)) this.pendingIntent.push({...pending});
    // Each executed result keeps its own binding, even when another result has
    // the same kind/targets but a different currency, selection or view.
    const outcomes = [...this.evidence.values()].filter(item => this.isCurrent(item)).map(item => ({
      id: `work-${item.id.slice(7)}`, requestedOutcome: item.kind, kind: item.kind,
      targets: [...item.targets], evidenceIds: [item.id],
      ...(item.comparisonCurrency ? {comparisonCurrency:item.comparisonCurrency} : {}),
      ...(item.kind === "quotation_read" ? {reportingViews:[item.reportingView ?? {stage:"exact" as const}]} : {}),
    }));
    // Older superseded execution rows are historical, not model-declared intent.
    for (const id of this.outcomes.keys()) if (id.startsWith("work-") && !outcomes.some(row=>row.id===id)) this.outcomes.delete(id);
    const pendingText = [...this.pendingIntent.map(({reason})=>`Unfinished requested work: ${reason}`),...(this.invalidatedComparisons().length?[INVALIDATED_COMPARISON]:[])].join("\n");
    return this.finish({outcomes,response:[input.response,pendingText].filter(Boolean).join("\n\n")},callId);
  }
  finish(input: FinishTurnInput, callId: string) {
    this.attempted = true; this.accepted = undefined;
    const seen = new Set<string>(), issues: Issue[] = [];
    for (const outcome of input.outcomes) {
      if (seen.has(outcome.id)) { issues.push({ outcomeId: outcome.id, code: "duplicate_outcome", message: "Use one entry per requested outcome." }); continue; }
      seen.add(outcome.id);
      const previous = this.outcomes.get(outcome.id);
      if (previous && this.verifiedBindings.has(outcome.id) && outcome.kind === "quotation_read"
        && reportingViewSet(previous.reportingViews ?? [{ stage: "exact" }]) !== reportingViewSet(outcome.reportingViews ?? [{ stage: "exact" }])) {
        issues.push({ outcomeId: outcome.id, code: "changed_outcome", message: "Keep the verified requested reporting views while repairing this outcome." });
        continue;
      }
      if (previous && (previous.kind !== outcome.kind || previous.requestedOutcome !== outcome.requestedOutcome || this.verifiedBindings.has(outcome.id) && (previous.comparisonCurrency && previous.comparisonCurrency !== outcome.comparisonCurrency || previous.targets.length && JSON.stringify([...previous.targets].sort()) !== JSON.stringify([...outcome.targets].sort())))) issues.push({ outcomeId: outcome.id, code: "changed_outcome", message: "Keep the original requested outcome, kind, verified comparison currency and known targets while repairing its missing evidence." });
      else this.outcomes.set(outcome.id, { id: outcome.id, requestedOutcome: outcome.requestedOutcome, kind: outcome.kind, targets: [...outcome.targets], ...(outcome.comparisonCurrency ? { comparisonCurrency: outcome.comparisonCurrency } : {}), ...(outcome.reportingViews ? { reportingViews: outcome.reportingViews.map(view => ({ ...view })) } : {}) });
    }
    this.candidate = { callId, input: structuredClone(input) };
    const checked = this.validate(input);
    for (const outcome of checked.resolved) if (!issues.some(issue => issue.outcomeId === outcome.id)) this.verifiedBindings.add(outcome.id);
    this.issues = [...issues, ...checked.issues];
    return { status: this.issues.length ? "continue_work" : "ready_for_final_check", issues: this.issues, instruction: this.issues.length ? "Complete the listed missing work, then call finish_turn alone with the same outcomes and current evidence. Do not ask for approval yourself." : "The server will recheck these results after this tool step. Pending operations still require the user's exact approval." };
  }
  private validate(input: FinishTurnInput) {
    const issues: Issue[] = [], resolved: Array<Outcome & { disposition: EvidenceDisposition }> = [];
    if (!input.outcomes.length && !input.response?.trim()) issues.push({ code: "empty_response", message: "Provide a readable conversational reply, or perform the requested business work and cite its result evidence." });
    // Evidence does not authorize arbitrary monetary prose. Ask the same agent
    // to keep its questions while leaving amounts/rules to verified tool output.
    if (input.response && hasFinancialClaim(input.response)) issues.push({ code: "unsupported_financial_response", message: "Keep questions and general explanation in response; omit financial claims from prose. Declare the requested business outcomes with matching tool evidence. The server renders financial results." });
    if (this.renderPublication && !publicationFits(this.renderPublication(input.response ?? ""))) issues.push({ code: "publication_too_large", message: PUBLICATION_LIMIT_MESSAGE });
    const supplied = new Map(input.outcomes.map(item => [item.id, item]));
    for (const outcome of this.outcomes.values()) if (!supplied.has(outcome.id)) issues.push({ outcomeId: outcome.id, code: "dropped_outcome", message: "A previously declared unfinished outcome cannot disappear. Complete it or retain its genuine missing-input/source limitation.", nextTools: toolsFor[outcome.kind] });
    const covered = new Set<string>();
    for (const outcome of input.outcomes) {
      if (!outcome.evidenceIds.length) issues.push({ outcomeId: outcome.id, code: "missing_evidence", message: `Prepare the requested ${outcome.kind} using its business tool.`, nextTools: toolsFor[outcome.kind] });
      const entries: Evidence[] = [];
      for (const id of outcome.evidenceIds) {
        const result = this.evidence.get(id);
        if (!result) { issues.push({ outcomeId: outcome.id, code: "unknown_evidence", message: "Use a result evidence ID returned by a tool in this run." }); continue; }
        if (result.kind !== outcome.kind) { issues.push({ outcomeId: outcome.id, code: "wrong_operation", message: `${result.kind} cannot satisfy ${outcome.kind}. Perform the missing operation.`, nextTools: toolsFor[outcome.kind] }); continue; }
        if (result.comparisonCurrency !== outcome.comparisonCurrency) { issues.push({ outcomeId: outcome.id, code: "wrong_comparison_currency", message: "Use comparison evidence for the requested target currency.", nextTools: toolsFor[outcome.kind] }); continue; }
        if (!this.isCurrent(result)) { issues.push({ outcomeId: outcome.id, code: "stale_evidence", message: "The referenced result was superseded. Recompute or read the current target state.", nextTools: toolsFor[outcome.kind] }); continue; }
        if (result.disposition === "failed") { issues.push({ outcomeId: outcome.id, code: "failed_operation", message: result.summary ?? "Repair the rejected tool arguments, preserving the original human facts.", nextTools: toolsFor[outcome.kind] }); continue; }
        covered.add(id); entries.push(result);
      }
      if (entries.length === outcome.evidenceIds.length && entries.length) {
        const targets = [...new Set(entries.flatMap(entry => entry.targets))].sort();
        if (JSON.stringify(targets) !== JSON.stringify([...new Set(outcome.targets)].sort())) { issues.push({ outcomeId: outcome.id, code: "wrong_targets", message: "The result covers different targets. Perform the requested operation for these declared targets.", nextTools: toolsFor[outcome.kind] }); continue; }
        if (outcome.kind === "quotation_read") {
          const actual = entries.map(entry => entry.reportingView ?? { stage: "exact" as const });
          if (reportingViewSet(outcome.reportingViews ?? [{ stage: "exact" }]) !== reportingViewSet(actual)) {
            issues.push({ outcomeId: outcome.id, code: "wrong_reporting_views", message: "Cite actual read evidence for exactly the requested reporting stages and precisions, including an exact view only when requested.", nextTools: ["read_quotes"] });
            continue;
          }
          const expectedPairs = [...new Set(reportingPairs(outcome.targets, outcome.reportingViews ?? [{ stage: "exact" }]))].sort();
          const actualPairs = [...new Set(entries.flatMap(entry => reportingPairs(entry.targets, [entry.reportingView ?? { stage: "exact" }])))].sort();
          if (JSON.stringify(expectedPairs) !== JSON.stringify(actualPairs)) {
            issues.push({ outcomeId: outcome.id, code: "wrong_reporting_targets", message: "Every target needs every declared view. Use separate outcomes when different quotations request different views.", nextTools: ["read_quotes"] });
            continue;
          }
        } else if (outcome.reportingViews?.length) {
          issues.push({ outcomeId: outcome.id, code: "wrong_reporting_views", message: "Reporting views apply only to quotation_read outcomes." });
          continue;
        }
        const disposition = entries.some(item => item.disposition === "awaiting_input") ? "awaiting_input" : entries.some(item => item.disposition === "awaiting_approval") ? "awaiting_approval" : entries.some(item => item.disposition === "unavailable") ? "unavailable" : "completed";
        resolved.push({ ...outcome, disposition });
      }
    }
    for (const result of this.evidence.values()) if (result.required && this.isCurrent(result) && !covered.has(result.id)) issues.push({ code: "unreported_work", message: `Include the current ${result.kind} result ${result.id} in the requested outcomes; do not silently omit prepared, rejected or incomplete work.`, nextTools: toolsFor[result.kind] });
    return { issues, resolved };
  }
  acceptStep(toolCalls: readonly { toolCallId: string; toolName: string }[]) {
    this.accepted = undefined;
    if (!this.candidate || !toolCalls.some(call => call.toolCallId === this.candidate!.callId && call.toolName === "finish_turn")) return false;
    if (toolCalls.length !== 1) { this.issues = [{ code: "finish_must_be_alone", message: "Call finish_turn alone after all business tools finish, using their returned evidence." }]; return false; }
    const structural = this.issues.filter(issue => ["duplicate_outcome", "changed_outcome"].includes(issue.code));
    const checked = this.validate(this.candidate.input); this.issues = [...structural, ...checked.issues];
    if (this.issues.length) return false;
    this.accepted = { response: this.candidate.input.response ?? "", outcomes: checked.resolved }; return true;
  }
  completion() {
    if (!this.accepted || !this.candidate || this.validate(this.candidate.input).issues.length) return;
    return structuredClone(this.accepted);
  }
  remainingObligations():RemainingObligations {
    // Evidence is server-registered. This does not depend on an accepted
    // finish_turn, so interruption/step-cap paths preserve current unfinished work.
    const outcomes:RemainingObligations["outcomes"]=[...this.evidence.values()].flatMap(evidence=>{
      if(!this.isCurrent(evidence)||evidence.disposition==="completed")return [];
      const branch={disposition:evidence.disposition,targets:[...evidence.targets],...(evidence.comparisonCurrency?{comparisonCurrency:evidence.comparisonCurrency}:{}),...(evidence.operationId?{operationId:evidence.operationId}:{}),questions:[...evidence.questions??[]],...(evidence.detail!==undefined?{detail:evidence.detail}:{}),...(evidence.reportingView?{reportingView:{...evidence.reportingView}}:{}),...(evidence.quoteState?{quoteState:{quoteIds:[...evidence.quoteState.quoteIds],digest:evidence.quoteState.digest}}:{})};
      return [{kind:evidence.kind,branches:[branch]}];
    });
    for (const evidence of this.invalidatedComparisons()) outcomes.push({kind:"comparison",branches:[{
      disposition:"awaiting_input",verificationRequired:true,targets:[...evidence.targets],questions:[],detail:INVALIDATED_COMPARISON,
      ...(evidence.comparisonCurrency?{comparisonCurrency:evidence.comparisonCurrency}:{}),
      ...(evidence.quoteState?{quoteState:structuredClone(evidence.quoteState)}:{}),
    }]});
    // A rejected finish may declare work before any matching tool executes.
    // Keep its typed obligation, never its model-authored financial narrative.
    const resolved = this.candidate ? this.validate(this.candidate.input).resolved : [];
    const trustedTargets = new Set([...this.evidence.values()].filter(evidence => evidence.disposition !== "failed" && this.isCurrent(evidence)).flatMap(evidence => evidence.targets));
    for (const declared of this.outcomes.values()) {
      const matched = resolved.some(outcome => outcome.id === declared.id && outcome.kind === declared.kind
        && outcome.comparisonCurrency === declared.comparisonCurrency
        && JSON.stringify([...outcome.targets].sort()) === JSON.stringify([...declared.targets].sort())
        && reportingViewSet(outcome.reportingViews ?? [{ stage: "exact" }]) === reportingViewSet(declared.reportingViews ?? [{ stage: "exact" }]));
      if (matched) continue;
      const views = declared.kind === "quotation_read" ? declared.reportingViews ?? [{ stage: "exact" as const }] : [undefined];
      outcomes.push({ kind: declared.kind, branches: views.map(reportingView => ({
        disposition: "failed" as const, verificationRequired: true as const,
        targets: declared.targets.filter(target => trustedTargets.has(target)), questions: [],
        ...(declared.comparisonCurrency ? { comparisonCurrency: declared.comparisonCurrency } : {}),
        ...(reportingView ? { reportingView } : {}),
        detail: "No matching verified completion was established for this declared request. It remains unfinished; recheck the original request and current tool results before acting.",
      })) });
    }
    for (const {kind, reason} of this.pendingIntent) outcomes.push({kind,branches:[{disposition:"awaiting_input",verificationRequired:true,targets:[],questions:[reason]}]});
    const result={version:1 as const,outcomes};assertRemainingObligations(result);return result;
  }
  publicationLimitExceeded() { return this.issues.some(issue => issue.code === "publication_too_large"); }
  wasAttempted() { return this.attempted; }
  context() { return { unfinishedOutcomes: [...this.outcomes.values()], evidence: [...this.evidence.values()].map(item => ({ ...this.publicEvidence(item), current: this.isCurrent(item) })), completionIssues: this.issues }; }
  executionContext() {
    const work=[...this.evidence.values()].filter(item=>this.isCurrent(item)).map(({toolName,kind,disposition,targets,comparisonCurrency,reportingView})=>({toolName,kind,disposition,targets,comparisonCurrency,reportingView}));
    const invalidated=this.invalidatedComparisons().map(({toolName,kind,targets,comparisonCurrency})=>({toolName,kind,targets,comparisonCurrency,disposition:"awaiting_input" as const,invalidated:true,detail:INVALIDATED_COMPARISON}));
    return {work:[...work,...invalidated],pending:this.pendingIntent,issues:this.issues};
  }
}
