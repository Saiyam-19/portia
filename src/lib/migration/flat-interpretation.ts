import { z } from 'zod';
import { FIELD_NAMES, codeOwnedUnit, conversationDigest, validateOperation, type ConversationInput, type ConversationState, type ConversationField, type Interpretation } from './conversation';

const fields = [...FIELD_NAMES.filter(f=>f!=='arithmeticExpression'), 'request'] as const;
/** Only semantic facts cross the provider boundary. All receipt structure is local. */
export const flatInterpretationSchema = z.object({facts:z.array(z.object({
  subject:z.string().min(1).max(100), item:z.string().max(64),
  field:z.enum(fields), value:z.string().min(1).max(200),
}).strict()).min(1).max(256)}).strict();
export type FlatInterpretation = z.infer<typeof flatInterpretationSchema>;
export const FLAT_INTERPRETATION_INSTRUCTIONS = `Call interpret_request alone with a flat facts list. Each row is {subject,item,field,value}.
Use a short human label as subject for each independent quotation, vessel or scenario. item is the charge name, or empty for facts shared by the subject. Unnamed amounts use item_1, item_2. Never merge comparison sides or scenarios.
Include request rows with item empty and value supplied-quote, official-quote, rule, elapsed, comparison, facts, or other. Include all requested work. For a comparison include quote requests for each side and a separate Comparison subject with the conversion/rounding facts. A correction refers to the saved subject and named item.
Return supplied facts only. No hashes, revisions, IDs, quote spans, units, totals, calculations or expression strings. Do not repeat saved facts; code retains them. Numeric values are the supplied number, without separators. Code grounds every fact against the user's message and supplies units. Timestamp values retain the user's original date/time text; never infer a date, year, zone or date order.
Quoted line items: charge, currency, rate, basis (amount for a stated amount, flat for per call, gt-period for per GT per period, movement, cargo-tonne), periodHours, rounding (started/exact), minimum/maximum, minimumScope/maximumScope (call/block). Do not invent missing terms. Call and block limits differ. Bare per GT means one GT. Keep no-tax and no-other-charges facts at subject level; yes/no values are true/false. A bare per hour period is 1. A composite duration retains hours and minutes separately. Code calculates, never the model.
Official requested services use charge facts; never ask the user for official rates. No verified tariff is a code-owned gap. Negation, uncertainty and either/or dates must not be resolved by guessing. Do not emit a fact you cannot identify unambiguously.`;

const stableId = (parts: string[]) => 'f_'+conversationDigest(parts).slice(0,24);
function evidenceCandidates(text:string, value:string) {
  const pieces = [text,...text.split(/\n|[!?;]|\.(?!\d)/),...text.split(/\n|[!?;]|\.(?!\d)|,(?!\d)/)].map(s=>s.trim()).filter(Boolean);
  for(const money of text.matchAll(/(?:USD|INR|EUR|GBP|US\$|[$₹€£])\s*\d[\d,]*(?:\.\d+)?/gi)) pieces.push(money[0]);
  if(text.includes(value)) pieces.push(value);
  return [...new Set(pieces)].sort((a,b)=>a.length-b.length);
}
function ground(field:ConversationField,value:string,input:ConversationInput,scopeId:string):Interpretation['operations'][number] {
  const unit=codeOwnedUnit(field);
  for(const quote of evidenceCandidates(input.text,value)) {
    if(field==='basis'&&value==='gt-period'&&!/(?:per|\/)\s*(?:\d[\d,]*\s*)?(?:GT|GRT)\b/i.test(quote))continue;
    const op={scopeId,field,value,unit,operation:'assert' as const,evidence:{inputId:input.id,quote}};
    try {validateOperation(op,input);return op;}catch{/* Try a fuller role-bearing clause. */}
  }
  throw new Error(`Unable to ground ${field} in the supplied message.`);
}
export function compileFlatInterpretation(previous:ConversationState,unknown:unknown,inputs:readonly ConversationInput[]):Interpretation {
  const {facts}=flatInterpretationSchema.parse(unknown);
  const pending=inputs.filter(i=>!previous.consumed.includes(i.id));
  if(pending.length!==1)throw new Error('Flat interpretation requires one pending authored input.');
  const input=pending[0], evidence={inputId:input.id,quote:input.text};
  const proposal:Interpretation={version:1,baseHash:previous.hash,inputIds:pending.map(i=>i.id),scopes:[],operations:[],tasks:[],unresolved:[]};
  const subjects=[...new Set(facts.map(f=>f.subject))];
  const scopeFor=new Map<string,string>();
  for(const subject of subjects){
    const prior=previous.scopes.find(s=>s.kind!=='quotation-rule'&&s.label.toLowerCase()===subject.toLowerCase());
    const id=prior?.id??stableId(['subject',subject]);scopeFor.set(subject,id);
    if(!prior)proposal.scopes.push({id,label:subject,kind:'call',parentId:null,evidence});
    for(const item of [...new Set(facts.filter(f=>f.subject===subject&&f.item).map(f=>f.item))]){
      const old=previous.scopes.find(s=>s.parentId===id&&s.label.toLowerCase()===item.toLowerCase());
      const rule=old?.id??stableId(['item',subject,item]);scopeFor.set(subject+'\0'+item,rule);
      if(!old)proposal.scopes.push({id:rule,label:item,kind:'quotation-rule',parentId:id,evidence});
    }
  }
  for(const row of facts.filter(f=>f.field!=='request')){
    const scopeId=scopeFor.get(row.subject+(row.item?'\0'+row.item:''))!;
    const op=ground(row.field as ConversationField,row.value,input,scopeId);
    // Charge evidence encloses its governing terms; monetary validation still
    // checks currency, role, number and the full input's existing cue checks.
    if(row.field==='charge'&&!/^item_\d+$/.test(row.value))op.evidence=evidence;
    proposal.operations.push(op);
  }
  for(const subject of subjects){
    const scopeId=scopeFor.get(subject)!;
    const requests=facts.filter(f=>f.subject===subject&&f.field==='request').map(f=>f.value);
    if(!requests.length)requests.push(previous.tasks.find(t=>t.scopeId===scopeId)?.source==='supplied'?'supplied-quote':'facts');
    for(const request of requests){
      const source=request==='supplied-quote'?'supplied':request==='official-quote'||request==='rule'?'official':'none';
      const kind=request.endsWith('-quote')?'quote':request;
      if(!['quote','rule','elapsed','comparison','facts','other'].includes(kind))throw new Error('Invalid requested work.');
      const ruleScopes=[...previous.scopes,...proposal.scopes].filter(s=>s.parentId===scopeId&&s.kind==='quotation-rule');
      const charges=ruleScopes.map(s=>proposal.operations.find(o=>o.scopeId===s.id&&o.field==='charge')?.value??previous.facts.find(f=>f.scopeId===s.id&&f.field==='charge'&&f.status==='established')?.value??s.label);
      proposal.tasks.push({id:stableId(['task',subject,request]),scopeId,kind:kind as Interpretation['tasks'][number]['kind'],source,charges,ruleScopeIds:ruleScopes.map(s=>s.id),evidence});
    }
  }
  for(const task of proposal.tasks.filter(t=>t.kind==='comparison')){
    task.source='supplied';task.comparisonMode='totals';task.comparisonTaskIds=proposal.tasks.filter(t=>t.kind==='quote').map(t=>t.id);
  }
  return proposal;
}

export function savedFactSummary(state:ConversationState) {
  return state.facts.filter(f=>f.status==='established').map(f=>{
    const scope=state.scopes.find(s=>s.id===f.scopeId)!;
    return {subject:scope.parentId?state.scopes.find(s=>s.id===scope.parentId)?.label:scope.label,item:scope.kind==='quotation-rule'?scope.label:'',field:f.field,value:f.value};
  });
}
