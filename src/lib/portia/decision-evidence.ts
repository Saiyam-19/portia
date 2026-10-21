import type { AuthoritySession } from "../authority/session";
import { canonical } from "../authority/contract";
import type { EvidenceRegistration, OutcomeKind } from "./completion";
import { reportingViewSchema } from "./completion";
import type { QuoteSession } from "./session";
import { canonicalQuoteCommand, isQuoteWriteTool } from "./tool-names";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function outcomeKindForTool(toolName: string, raw: unknown): OutcomeKind | undefined {
  const input = object(canonicalQuoteCommand(toolName, raw));
  if (toolName === "read_quotes" || isQuoteWriteTool(toolName) && input.action === "read") return input.readScope === "cross-chat" ? "memory_read" : "quotation_read";
  if (isQuoteWriteTool(toolName)) return "quotation";
  return ({ compare_quotes: "comparison", port_information: "information", calculate_charges: "calculation", calculate_elapsed_time: "elapsed_time", search_vessels: "vessel_lookup", get_vessel: "vessel_lookup", remember_memory: "memory_write", forget_memory: "memory_write", recall_memory: "memory_read", write_scratchpad: "notes_write", read_scratchpad: "notes_read" } as Record<string, OutcomeKind>)[toolName];
}

/** Evidence is captured from executed tools and current server state. Model
 * prose and model-supplied evidence objects never enter this registry. */
export function recordDecisionEvidence(session: QuoteSession, authority: AuthoritySession | undefined, toolName: string, raw: unknown, output: unknown, toolCallId: string) {
  const kind = outcomeKindForTool(toolName, raw); if (!kind) return;
  const input = object(canonicalQuoteCommand(toolName, raw)), result = object(output);
  const intervalQuestion = toolName === "calculate_elapsed_time" && result.status === "clarification_required";
  const unavailableStatus = ["unavailable", "not_found", "invalid"].includes(String(result.availability));
  const failed = !intervalQuestion && (result.status === "error" || !unavailableStatus && ("error" in result || result.saved === false));
  const questions=Array.isArray(result.questions)?result.questions.filter((question):question is string=>typeof question==="string"):[];
  const reportingUnavailable = kind === "quotation_read" && Array.isArray(result.quotations)
    && result.quotations.some(row => object(object(object(row).result).reporting).status === "unavailable");
  const unavailableLookup = typeof output === "string" && /^Vessel (?:lookup|search) is (?:unavailable|not configured)/i.test(output);
  const disposition = failed ? "failed" : result.approvalRequired === true ? "awaiting_approval" : questions.length || intervalQuestion ? "awaiting_input" : reportingUnavailable || unavailableLookup || unavailableStatus || result.status === "unresolved" ? "unavailable" : "completed";
  const quoteIds = typeof result.quoteId === "string" ? [result.quoteId] : Array.isArray(input.quoteIds) ? input.quoteIds.filter((id): id is string => typeof id === "string") : typeof input.quoteId === "string" ? [input.quoteId] : Array.isArray(result.quotations) ? result.quotations.flatMap(row => typeof object(row).quoteId === "string" ? [String(object(row).quoteId)] : []) : [];
  const resultTargets=Array.isArray(result.targets)?result.targets.filter((target):target is string=>typeof target==="string"&&target.length>0&&target.length<=120):[];
  const targets = resultTargets.length ? [...new Set(resultTargets)] : quoteIds.length ? [...quoteIds] : typeof input.key === "string" ? [input.key] : typeof input.label === "string" ? [input.label] : [];
  const snapshot = (["quotation", "quotation_read", "comparison"].includes(kind) || kind === "information" && quoteIds.length > 0)
    ? session.evidenceState(quoteIds.length ? quoteIds : undefined) : undefined;
  const quoteState=snapshot===undefined||!quoteIds.length?undefined:{quoteIds:[...quoteIds].sort(),digest:session.evidenceStateDigest(quoteIds)};
  const supportSnapshot=["memory_read","memory_write","notes_read","notes_write"].includes(kind)?session.supportEvidenceSnapshot(kind as "memory_read"|"memory_write"|"notes_read"|"notes_write",output):undefined;
  const operationId = typeof result.operationId === "string" ? result.operationId : undefined;
  const operation = operationId ? authority?.pendingOperations().find(item => item.id === operationId) : undefined;
  const currency = result.currency ?? (operation?.kind === "comparison" ? operation.input.currency : undefined) ?? input.currency;
  const executedComparison = operation?.kind === "comparison" ? operation.input : object(result.executedComparison);
  // Only successful calculation/preparation establishes the dimensions that a
  // later recomputation can satisfy. Never match on kind/targets alone.
  const comparisonBinding = kind === "comparison" && Object.keys(executedComparison).length ? canonical({
    quoteIds: [...quoteIds].sort(), currency,
    selections: Array.isArray(executedComparison.selections) ? executedComparison.selections.map(value=>{
      const selection=object(value);return {quoteId:selection.quoteId,lineIds:Array.isArray(selection.lineIds)?[...selection.lineIds].sort():[]};
    }).sort((left,right)=>String(left.quoteId).localeCompare(String(right.quoteId))) : null,
    exchangeRates: Array.isArray(executedComparison.exchangeRates) ? [...executedComparison.exchangeRates].sort((left,right)=>canonical(left).localeCompare(canonical(right))) : [],
    taxBasis:executedComparison.taxBasis??"as-supplied",rounding:executedComparison.rounding??null,scopeEquivalence:executedComparison.scopeEquivalence??null,
  }) : undefined;
  const reporting = kind === "quotation_read" ? reportingViewSchema.safeParse(input.reporting ?? { stage: "exact" }) : undefined;
  const registration: EvidenceRegistration = {
    toolName, kind, disposition, targets,
    ...(operation?{operationId:operation.id}:{}),questions,
    ...((disposition==="unavailable"||disposition==="failed")&&typeof (failed?result.error:result.body)==="string"?{detail:String(failed?result.error:result.body)}:{}),
    ...(quoteState?{quoteState}:{}),
    ...(comparisonBinding?{comparisonBinding}:{}),
    ...(kind==="comparison"&&snapshot!==undefined?{invalidated:()=>snapshot!==session.evidenceState(quoteIds.length?quoteIds:undefined)}:{}),
    ...(kind === "comparison" && typeof currency === "string" ? { comparisonCurrency: currency } : {}),
    ...(reporting?.success ? { reportingView: reporting.data } : {}),
    required: !["quotation_read", "memory_read", "notes_read", "information", "vessel_lookup"].includes(kind) || failed,
    ...(failed ? { summary: typeof result.error === "string" ? result.error.slice(0, 800) : "Repair this rejected tool call using its returned error details and original human facts." } : {}),
    current: () => {
      if (failed) return session.hasUnresolvedToolFailure(toolCallId);
      if (snapshot !== undefined && snapshot !== session.evidenceState(quoteIds.length ? quoteIds : undefined)) return false;
      if(!session.supportEvidenceCurrent(supportSnapshot))return false;
      if (disposition === "awaiting_input" && ["comparison", "elapsed_time"].includes(kind) && !session.hasInputQuestion(toolCallId)) return false;
      if (disposition === "awaiting_input" && kind === "quotation_read" && !Array.isArray(result.quotations) && !session.hasInputQuestion(toolCallId)) return false;
      if (disposition === "awaiting_approval") return !!operationId && !!authority?.pendingOperations().some(operation => operation.id === operationId);
      return true;
    },
  };
  return session.completion.register(toolCallId, registration);
}
