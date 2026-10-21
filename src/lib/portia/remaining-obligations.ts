import { z } from "zod";
const outcomeKindSchema=z.enum(["quotation","quotation_read","comparison","information","calculation","elapsed_time","vessel_lookup","memory_read","memory_write","notes_read","notes_write"]);
type OutcomeKind=z.infer<typeof outcomeKindSchema>;
const literal=(value:string)=>value.replace(/\\/g,"\\\\").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/([|`*_[\]{}()#+\-.!>])/g,"\\$1");
export const MAX_REMAINING_OBLIGATIONS_SERIALIZED_BYTES=64_000;
export const MAX_REMAINING_OBLIGATION_TEXT_BYTES=128_000;
export const REMAINING_OBLIGATIONS_LIMIT_MESSAGE="Remaining requested work exceeds the 64 KB review-continuation limit. No exact review was opened; split the request without omitting any outcome.";
export class RemainingObligationsLimitError extends Error{constructor(){super(REMAINING_OBLIGATIONS_LIMIT_MESSAGE);this.name="RemainingObligationsLimitError";}}

const pendingDispositionSchema=z.enum(["awaiting_input","awaiting_approval","unavailable","failed"]);
const exactText=z.string().min(1).refine(value=>new TextEncoder().encode(value).byteLength<=MAX_REMAINING_OBLIGATION_TEXT_BYTES,"Obligation text exceeds 128 KB.");
const reportingViewSchema=z.object({stage:z.enum(["exact","line","total"]),decimals:z.number().int().min(0).max(8).optional()}).strict().superRefine((view,context)=>{
  if(view.stage==="exact"?view.decimals!==undefined:view.decimals===undefined)context.addIssue({code:"custom",path:["decimals"],message:"Exact views omit precision; line/total views require decimal precision."});
});
const quoteStateSchema=z.object({quoteIds:z.array(z.string().min(1).max(100)).min(1).max(24),digest:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const remainingBranchSchema=z.object({
  disposition:pendingDispositionSchema,
  targets:z.array(z.string().min(1).max(120)).max(24),
  comparisonCurrency:z.string().regex(/^[A-Z]{3}$/).optional(),
  verificationRequired:z.literal(true).optional(),
  operationId:z.string().uuid().optional(),
  questions:z.array(exactText),
  detail:exactText.optional(),
  reportingView:reportingViewSchema.optional(),
  quoteState:quoteStateSchema.optional(),
}).strict();
const remainingOutcomeSchema=z.object({kind:outcomeKindSchema,branches:z.array(remainingBranchSchema).min(1).max(256)}).strict();
export const remainingObligationsSchema=z.object({version:z.literal(1),outcomes:z.array(remainingOutcomeSchema).max(256)}).strict().refine(value=>new TextEncoder().encode(JSON.stringify(value)).byteLength<=MAX_REMAINING_OBLIGATIONS_SERIALIZED_BYTES,REMAINING_OBLIGATIONS_LIMIT_MESSAGE);
export type RemainingObligations=z.infer<typeof remainingObligationsSchema>;
export type RemainingBranch=z.infer<typeof remainingBranchSchema>;
export function assertRemainingObligations(value:unknown):asserts value is RemainingObligations{const parsed=remainingObligationsSchema.safeParse(value);if(!parsed.success||new TextEncoder().encode(JSON.stringify(parsed.data)).byteLength>MAX_REMAINING_OBLIGATIONS_SERIALIZED_BYTES)throw new RemainingObligationsLimitError();}

const labels:Record<OutcomeKind,string>={quotation:"Quotation",quotation_read:"Quotation read",comparison:"Comparison",information:"Information request",calculation:"Calculation",elapsed_time:"Elapsed-time calculation",vessel_lookup:"Vessel lookup",memory_read:"Memory read",memory_write:"Memory change",notes_read:"Scratchpad read",notes_write:"Scratchpad change"};
export function renderRemainingObligations(value:RemainingObligations|undefined,options:{applied:ReadonlySet<string>;quoteStateDigest:(quoteIds:readonly string[])=>string}){
  if(!value)return "";
  const rows=value.outcomes.flatMap(outcome=>outcome.branches.flatMap(branch=>{
    if(branch.disposition==="awaiting_approval"&&branch.operationId&&options.applied.has(branch.operationId))return [];
    const stale=!!branch.quoteState&&options.quoteStateDigest(branch.quoteState.quoteIds)!==branch.quoteState.digest;
    const status=branch.verificationRequired?"Declared request remains unfinished; execution and completion need verification."
      :stale?"Needs recomputation because saved quotation state changed during approval."
      :branch.disposition==="awaiting_input"?"Needs input."
      :branch.disposition==="unavailable"?"Unavailable with current authority or service."
      :branch.disposition==="failed"?"Rejected or failed; repair remains required.":"Awaits a separate exact review.";
    const targets=branch.targets.length?` Targets: ${branch.targets.map(literal).join(", ")}.`:"";
    const view=(branch.comparisonCurrency?` Comparison currency: ${branch.comparisonCurrency}.`:"")+(branch.reportingView?` View: ${branch.reportingView.stage}${branch.reportingView.decimals===undefined?"":` ${branch.reportingView.decimals} decimals`}.`:"");
    const questionLabel=stale?"Earlier question":"Question",detailLabel=stale?"Earlier detail":"Detail";
    const details=[...branch.questions.map(question=>`${questionLabel}: ${literal(question)}`),...(branch.detail?[`${detailLabel}: ${literal(branch.detail)}`]:[])];
    return [`- ${literal(labels[outcome.kind])}.${targets}${view} ${status}${details.length?" "+details.join(" "):""}`];
  }));
  return rows.length?"Remaining requested work recorded before this approval; revalidate before acting:\n"+rows.join("\n"):"";
}
