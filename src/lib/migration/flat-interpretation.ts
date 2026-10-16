import Decimal from 'decimal.js';
import { operationAt } from './request-semantics';
import {resolveCatalogLocation} from './port-identity';
import { requiresLiteralGrounding, codeOwnedUnit, conversationDigest, expandCardinals, validateOperation, reduceInterpretation, type ConversationInput, type ConversationState, type ConversationField, type Interpretation } from './conversation';

export {flatInterpretationSchema,type FlatInterpretation} from './fact-contract';
import {readFlatFacts,type InternalFlatFact} from './fact-contract';
export const FLAT_INTERPRETATION_INSTRUCTIONS = `Call interpret_request alone with a flat facts list. Each row is {subject,item,field,value}.
Use a short human label as subject for each independent quotation, vessel or scenario. item is the charge name, or empty for facts shared by the subject. Unnamed amounts use item_1, item_2. Never merge comparison sides or scenarios.
Include request rows with item empty and value supplied-quote, official-quote, rule, elapsed, comparison, facts, or other. Include all requested work. For a comparison include quote requests for each side and a separate Comparison subject with the conversion/rounding facts. A correction refers to the saved subject and named item.
Return supplied facts only. No hashes, revisions, IDs, quote spans, units, totals, calculations or expression strings. Do not repeat saved facts; code retains them. Numeric values are the supplied number, without separators. Code grounds only arithmetic numbers and dates/times literally and supplies units. Semantic categories are strict enums, not quote spans. Timestamp values retain the user's original date/time text; never infer a date, year, zone or date order.
Quoted line items: charge, currency, rate, basis (amount for a stated amount, flat for per call, gt-period for per GT per period, time-period for time-only blocks, movement, cargo-tonne), periodHours, rounding (started/exact), minimum/maximum are enums none, amount, not_stated. When amount is stated, put the quoted number in minimumAmount/maximumAmount and scope in minimumScope/maximumScope (call/block). Never emit zero for no minimum or no cap. Do not invent missing terms. Call and block limits differ. Bare per GT means one GT. Tax uses tax=none for No tax, percentage with taxPercent for a quoted percentage, included, exempt, or not_stated. Never emit taxExemption or taxPercent=0 for No tax. otherAdjustments=none/present/not_stated. Keep these at subject level. Other yes/no fields use yes/no/not_stated. Use not_stated for missing terms; none only for an explicit exclusion. moneyRounding=line/quote/none/not_stated; after adding each quotation means quote, never prose. A bare per hour period is 1. A composite duration retains hours and minutes separately. Code calculates, never the model.
Official requested services use charge facts; never ask the user for official rates. No verified tariff is a code-owned gap. Negation, uncertainty and either/or dates must not be resolved by guessing. Do not emit a fact you cannot identify unambiguously.`;

const stableId = (parts: string[]) => 'f_'+conversationDigest(parts).slice(0,24);
const escaped=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function numericValue(field:ConversationField,value:string,text:string):string {
  const unit=codeOwnedUnit(field);if(!unit||unit==='timestamp')return value;
  const clean=value.normalize('NFKC').replace(/(?:USD|INR|EUR|GBP|US\$|[$₹€£])\s*/gi,'').replaceAll(',','').trim();
  if(!/^-?\d+(?:\.\d+)?$/.test(clean))throw new Error(`Invalid numeric ${field}.`);
  const normalized=new Decimal(clean).toString();
  const raw=expandCardinals(text.normalize('NFKC'));
  const numbers=[...raw.matchAll(/(?<![\w.])[-−]?\d[\d,]*(?:\.\d+)?(?!\w|\.\d)/g)].map(m=>new Decimal(m[0].replaceAll(',','').replace('−','-')).toString());
  // These are code-owned unit/exclusion conventions, not model arithmetic.
  const implied=field==='taxPercent'&&normalized==='0'&&/\b(?:no|without|zero)\b[^.!?]*\btax(?:es)?\b/i.test(raw)
    ||field==='periodHours'&&normalized==='1'&&/(?:per|\/)\s*hour\b/i.test(raw)
    ||field==='periodHours'&&normalized==='24'&&/(?:per|\/)\s*day\b/i.test(raw)
    ||field==='basisQuantity'&&normalized==='1'&&/(?:per|\/)\s*(?:GT|GRT|movement|tonne)\b/i.test(raw)
    ||field==='moneyDecimals'&&normalized==='2'&&/paise|cents/i.test(raw);
  if(!numbers.includes(normalized)&&!implied)throw new Error(`The ${field} number is not in the user's message.`);
  return normalized;
}
function subjectContext(subject:string,text:string) {
  const scenario=new RegExp(`(?:^|\\n)\\s*${escaped(subject)}[.)]\\s*[^\\n]+`,'i').exec(text)?.[0].trim();
  const quotation=new RegExp(`\\b${escaped(subject)}\\s+is\\s+[^!?;\\n]+`,'i').exec(text)?.[0];
  return {scenario,quotation:quotation?.split(/\.(?!\d)/)[0]};
}
function moneyAtoms(text:string){
  return [...text.matchAll(/(?:USD|INR|EUR|GBP|US\$|[$₹€£])\s*[0-9０-９][0-9０-９,，]*(?:[.．][0-9０-９]+)?/gi)].map(m=>({raw:m[0],at:m.index!,amount:new Decimal(m[0].normalize('NFKC').replace(/^(?:USD|INR|EUR|GBP|US\$|[$₹€£])\s*/i,'').replaceAll(',','')).toString()}));
}
function itemContext(item:string,rate:string|undefined,text:string):string {
  if(!rate)throw new Error(`The ${item} item has no supplied rate fact.`);
  const anonymous=/^item_\d+$/.test(item);
  if(anonymous){
    const atom=moneyAtoms(text)[Number(item.slice(5))-1];
    if(!atom||atom.amount!==rate)throw new Error('Numbered item amount does not match its position in this named quote.');
    // Prefix includes the quote name and occurrence, distinguishing equal amounts.
    return text.slice(0,atom.at+atom.raw.length);
  }
  const candidates=moneyAtoms(text).filter(m=>m.amount===rate);
  for(const m of candidates){
    const before=text.slice(0,m.at),after=text.slice(m.at+m.raw.length);
    const suffix=new RegExp(`^\\s*${escaped(item)}\\b`,'i').exec(after);
    const prefix=new RegExp(`\\b${escaped(item)}(?:\\s+(?:hire|charge|rate|is|at|now|of))?\\s*(?:(?:is|now|at)\\s*)?[:=]?\\s*$`,'i').exec(before);
    if(suffix)return m.raw+suffix[0];
    if(prefix){
      const start=prefix.index;const tail=text.slice(m.at).split(/\.(?!\d)|[!?;\n]/)[0];
      return text.slice(start,m.at)+tail;
    }
  }
  throw new Error(`Unable to ground the ${item} item amount in its subject.`);
}
function evidenceCandidates(text:string, value:string) {
  const pieces = [text,...text.split(/\n|[!?;]|\.(?!\d)/),...text.split(/\n|[!?;]|\.(?!\d)|,(?!\d)/)].map(s=>s.trim()).filter(Boolean);
  for(const money of text.matchAll(/(?:USD|INR|EUR|GBP|US\$|[$₹€£])\s*\d[\d,]*(?:\.\d+)?/gi)) pieces.push(money[0]);
  if(text.includes(value)) pieces.push(value);
  return [...new Set(pieces)].sort((a,b)=>a.length-b.length);
}
function ground(field:ConversationField,value:string,input:ConversationInput,scopeId:string,context=input.text):Interpretation['operations'][number] {
  const unit=codeOwnedUnit(field);
  if(field==='port'||field==='terminal')return {scopeId,field,value:resolveCatalogLocation(field,value,context),unit:'',operation:'assert',evidence:{inputId:input.id,quote:context}};
  if(!requiresLiteralGrounding(field)&&!['port','terminal'].includes(field)){
    const op={scopeId,field,value,unit,operation:'assert' as const,evidence:{inputId:input.id,quote:context}};
    if(!['minimumScope','maximumScope'].includes(field))validateOperation(op,input,true);
    return op;
  }
  for(const quote of evidenceCandidates(context,value)) {
    if(field==='basis'&&value==='gt-period'&&!/(?:per|\/)\s*(?:\d[\d,]*\s*)?(?:GT|GRT)\b/i.test(quote))continue;
    const op={scopeId,field,value,unit,operation:'assert' as const,evidence:{inputId:input.id,quote}};
    try {validateOperation(op,input);return op;}catch{/* Try a fuller role-bearing clause. */}
  }
  throw new Error(`Unable to ground ${field} in the supplied message.`);
}
export function compileFlatInterpretation(previous:ConversationState,unknown:unknown,inputs:readonly ConversationInput[]):Interpretation {
  const facts=readFlatFacts(unknown,inputs.filter(i=>!previous.consumed.includes(i.id)).map(i=>i.text).join("\n"));
  const pending=inputs.filter(i=>!previous.consumed.includes(i.id));
  if(pending.length>1)return compilePending(previous,facts,inputs,pending);
  return compileInput(previous,facts,inputs);
}
function compileInput(previous:ConversationState,facts:InternalFlatFact[],inputs:readonly ConversationInput[]):Interpretation {
  const pending=inputs.filter(i=>!previous.consumed.includes(i.id));
  if(pending.length!==1)throw new Error('No pending authored input is available.');
  const input=pending[0], evidence={inputId:input.id,quote:input.text};
  for(const row of facts){
    const short=row.subject.replace(/^(?:quote|quotation|scenario)\s+/i,'');
    if(short!==row.subject&&(subjectContext(short,input.text).quotation||subjectContext(short,input.text).scenario))row.subject=short;
    const ordinal=/^(?:item[_ -]?)?([1-9]\d*)$/i.exec(row.item);
    if(ordinal){row.item='item_'+ordinal[1];if(row.field==='charge')row.value=row.item;}
  }
  const itemKeys=[...new Set(facts.filter(f=>f.item).map(f=>JSON.stringify([f.subject,f.item])))];
  for(const key of itemKeys){
    const [subject,item]=JSON.parse(key) as [string,string];
    if(!facts.some(f=>f.subject===subject&&f.item===item&&f.field==='charge'))facts.push({subject,item,field:'charge',value:item});
  }
  for(const subject of new Set(facts.map(f=>f.subject))){
    const numbered=[...new Set(facts.filter(f=>f.subject===subject&&/^item_\d+$/.test(f.item)).map(f=>f.item))];
    if(!numbered.length)continue;
    const quote=subjectContext(subject,input.text).quotation;
    if(!quote)throw new Error('Numbered items require an unambiguous named quotation.');
    const count=moneyAtoms(quote).length;
    if(count!==numbered.length||numbered.some(item=>Number(item.slice(5))>count))throw new Error('Numbered items must cover every amount in their named quote exactly once.');
  }
  const saved=(row:typeof facts[number])=>{
    const subject=previous.scopes.find(s=>s.kind!=='quotation-rule'&&s.label.toLowerCase()===row.subject.toLowerCase());
    const scope=row.item?previous.scopes.find(s=>s.parentId===subject?.id&&s.label.toLowerCase()===row.item.toLowerCase()):subject;
    return previous.facts.find(f=>f.scopeId===scope?.id&&f.field===row.field&&f.status==='established'&&!previous.facts.some(c=>c.scopeId===f.scopeId&&c.field===f.field&&c.status==='conflicting'));
  };
  const kept=new Set<typeof facts[number]>();
  for(const row of facts)if(row.field!=='request'){
    if(/\b(?:keep|retain|preserve)\b/i.test(input.text)&&saved(row)?.value===row.value)kept.add(row);
    else row.value=numericValue(row.field,row.value,input.text);
  }
  const proposal:Interpretation={contract:"facts-v3",version:1,baseHash:previous.hash,inputIds:pending.map(i=>i.id),scopes:[],operations:[],tasks:[],unresolved:[]};
  const subjects=[...new Set(facts.map(f=>f.subject))];
  const scopeFor=new Map<string,string>();
  for(const subject of subjects){
    const prior=previous.scopes.find(s=>s.kind!=='quotation-rule'&&s.label.toLowerCase()===subject.toLowerCase());
    const id=prior?.id??stableId(['subject',subject]);scopeFor.set(subject,id);
    if(!prior)proposal.scopes.push({id,label:subject,kind:subjectContext(subject,input.text).scenario?'scenario':'call',parentId:null,evidence});
    for(const item of [...new Set(facts.filter(f=>f.subject===subject&&f.item).map(f=>f.item))]){
      const old=previous.scopes.find(s=>s.parentId===id&&s.label.toLowerCase()===item.toLowerCase());
      const rule=old?.id??stableId(['item',subject,item]);scopeFor.set(subject+'\0'+item,rule);
      if(!old)proposal.scopes.push({id:rule,label:item,kind:'quotation-rule',parentId:id,evidence});
    }
  }
  for(const row of facts.filter(f=>f.field!=='request')){
    if(kept.has(row))continue;
    const scopeId=scopeFor.get(row.subject+(row.item?'\0'+row.item:''))!;
    const local=subjectContext(row.subject,input.text);
    const rate=facts.find(f=>f.subject===row.subject&&f.item===row.item&&f.field==='rate')?.value;
    const context=row.item?itemContext(row.item,rate,local.quotation??input.text):(['durationHours','durationMinutes'].includes(row.field)?local.scenario:undefined)??input.text;
    // Ground each supplied component before combining a composite duration.
    if(row.field==='durationHours'&&facts.some(f=>f.subject===row.subject&&!f.item&&f.field==='durationMinutes'))continue;
    let op:Interpretation['operations'][number];
    if(row.field==='durationMinutes'){
      const hours=facts.find(f=>f.subject===row.subject&&!f.item&&f.field==='durationHours');
      const expanded=expandCardinals(context.normalize('NFKC')).replaceAll(',','');
      if(!new RegExp(`\\b${escaped(row.value)}\\s*(?:minutes?|mins?)\\b`,'i').test(expanded)||hours&&!new RegExp(`\\b${escaped(hours.value)}\\s*(?:hours?|hrs?)\\b`,'i').test(expanded))throw new Error('Duration components do not match this subject.');
      const total=new Decimal(hours?.value??0).mul(60).add(row.value).toString();
      op=ground('durationMinutes',total,input,scopeId,context);
    }else op=ground(row.field as ConversationField,row.value,input,scopeId,context);
    if(row.field==='charge'&&!/^item_\d+$/.test(row.value))op.evidence={inputId:input.id,quote:context};
    const old=saved(row);
    if(old&&old.value!==op.value&&row.item&&new RegExp(`\\b${escaped(row.item)}\\b`,'i').test(context)){
      const at=input.text.indexOf(op.evidence.quote)+Math.max(0,op.evidence.quote.search(/\d/));
      if(operationAt(input.text,at)==='replace'){
        op.operation='correct';op.evidence={inputId:input.id,quote:context};validateOperation(op,input,true);
      }
    }
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
      const charges=source==='official'?facts.filter(f=>f.subject===subject&&f.field==='charge').map(f=>f.value):ruleScopes.map(s=>proposal.operations.find(o=>o.scopeId===s.id&&o.field==='charge')?.value??previous.facts.find(f=>f.scopeId===s.id&&f.field==='charge'&&f.status==='established')?.value??s.label);
      proposal.tasks.push({id:stableId(['task',subject,request]),scopeId,kind:kind as Interpretation['tasks'][number]['kind'],source,charges,ruleScopeIds:ruleScopes.map(s=>s.id),evidence});
    }
  }
  for(const task of proposal.tasks.filter(t=>t.kind==='comparison')){
    task.source='supplied';task.comparisonMode='totals';task.comparisonTaskIds=proposal.tasks.filter(t=>t.kind==='quote').map(t=>t.id);
  }
  return proposal;
}

/** Recover only explicit named flat amounts; never infer an official rate or a
 * unit-price rule. This uses authored inputs, not a rejected model's output. */
function savedAmountFacts(input:ConversationInput,subject:string):InternalFlatFact[]{
  if(!/\b(?:add|sum|quote|quotation)\b/i.test(input.text)||/(?:per|\/)\s*(?:GT|GRT|hour|day|tonne|movement|call)|\b(?:started|commenced)\b/i.test(input.text))return [];
  const amounts=moneyAtoms(input.text),facts:InternalFlatFact[]=[];
  for(const [i,atom]of amounts.entries()){
    const tail=input.text.slice(atom.at+atom.raw.length,amounts[i+1]?.at??input.text.length);
    const name=/^\s+([\p{L}][\p{L} -]*?)(?:\s+and\s*|,\s*|[.;!?\n]|$)/u.exec(tail)?.[1]?.trim();
    if(!name||name.length>64||/^(?:per|for|plus|all-in)\b/i.test(name))return [];
    const token=/^(USD|INR|EUR|GBP|US\$|₹|€|£)/i.exec(atom.raw)?.[1];if(!token)return [];
    const currency=({'US$':'USD','₹':'INR','€':'EUR','£':'GBP'} as Record<string,string>)[token.toUpperCase()]??token.toUpperCase();
    for(const [field,value]of Object.entries({charge:name,currency,rate:atom.amount,basis:'amount'}))facts.push({subject,item:name,field:field as ConversationField,value});
  }
  if(!facts.length)return [];
  facts.push({subject,item:'',field:'request',value:'supplied-quote'});
  if(/\b(?:no|without)\b[^.!?\n]*\btax(?:es)?\b/i.test(input.text))facts.push({subject,item:'',field:'tax',value:'none'});
  return facts;
}
function interveningCorrections(input:ConversationInput,state:ConversationState):InternalFlatFact[]{
  const facts:InternalFlatFact[]=[];
  for(const atom of moneyAtoms(input.text)){
    if(operationAt(input.text,atom.at)!=='replace')continue;
    const targets=state.facts.filter(f=>f.field==='charge'&&f.status==='established').filter(f=>{
      try{itemContext(f.value,atom.amount,input.text);return true;}catch{return false;}
    });
    if(targets.length!==1)throw new Error('Recovery correction has no unique named line item.');
    const charge=targets[0],rule=state.scopes.find(s=>s.id===charge.scopeId)!,subject=state.scopes.find(s=>s.id===rule.parentId)!.label;
    facts.push({subject,item:charge.value,field:'rate',value:atom.amount});
  }
  return facts;
}
function compilePending(previous:ConversationState,facts:InternalFlatFact[],inputs:readonly ConversationInput[],pending:readonly ConversationInput[]):Interpretation {
  if(pending.slice(1).some(i=>/\b(?:new|another|different)\s+(?:vessel|ship|call)\b/i.test(i.text)))throw new Error('Recovery cannot merge a different vessel or call into saved details.');
  const subjects=[...new Set(facts.filter(f=>f.subject!=='Comparison').map(f=>f.subject))];
  const subject=subjects.length===1?subjects[0]:undefined;
  const destinations=facts.map(row=>{
    if(row.field==='request')return pending.length-1;
    if(requiresLiteralGrounding(row.field)){
      for(let i=pending.length-1;i>=0;i--){
        try{
          if(codeOwnedUnit(row.field)==='timestamp'){if(!pending[i].text.includes(row.value))continue;}
          else numericValue(row.field,row.value,pending[i].text);
          if(row.field==='rate'&&row.item)itemContext(row.item,row.value,subjectContext(row.subject,pending[i].text).quotation??pending[i].text);
          return i;
        }catch{/* Try earlier authenticated input; never an assistant answer. */}
      }
      throw new Error(`Recovery could not ground ${row.field} in pending inputs.`);
    }
    if(row.item){const rate=facts.find(f=>f.subject===row.subject&&f.item===row.item&&f.field==='rate');if(rate){for(let i=pending.length-1;i>=0;i--)try{itemContext(row.item,rate.value,pending[i].text);return i;}catch{/* Earlier item. */}}}
    return 0;
  });
  const combined:Interpretation={contract:'facts-v3',version:1,baseHash:previous.hash,inputIds:pending.map(i=>i.id),scopes:[],operations:[],tasks:[],unresolved:[]};
  let temporary=previous;
  for(const [index,input]of pending.entries()){
    const seeds=index===0&&subject?savedAmountFacts(input,subject):index<pending.length-1?interveningCorrections(input,temporary):[];
    const selected=facts.filter((_f,i)=>destinations[i]===index);
    const key=(f:InternalFlatFact)=>JSON.stringify([f.subject,f.item,f.field]);
    const selectedKeys=new Set(selected.map(key));
    const local=[...seeds.filter(f=>!selectedKeys.has(key(f))),...selected];
    if(!local.some(f=>f.field==='request')){
      const label=subject??temporary.scopes.find(s=>s.kind!=='quotation-rule')?.label;
      if(!label)throw new Error('Recovery cannot identify the pending call scope.');
      local.push({subject:label,item:'',field:'request',value:temporary.tasks.some(t=>t.source==='supplied')||seeds.length?'supplied-quote':'facts'});
    }
    const available=inputs.slice(0,inputs.findIndex(i=>i.id===input.id)+1);
    const part=compileInput(temporary,structuredClone(local),available);
    const reduced=reduceInterpretation(temporary,part,available);
    if(reduced.state.facts.some(f=>f.revision===reduced.state.revision&&f.status==='conflicting'))throw new Error('Recovery contains conflicting facts; nothing was committed.');
    temporary=reduced.state;
    for(const scope of part.scopes)if(!combined.scopes.some(s=>s.id===scope.id))combined.scopes.push(scope);
    combined.operations.push(...part.operations);combined.tasks=part.tasks;combined.unresolved=part.unresolved;
  }
  // One atomic, original-dispatch-bound receipt. Temporary reductions never
  // mutate the session; failure at any stage leaves all pending inputs intact.
  return combined;
}

export function savedFactSummary(state:ConversationState) {
  return state.facts.filter(f=>f.status==='established').map(f=>{
    const scope=state.scopes.find(s=>s.id===f.scopeId)!;
    return {subject:scope.parentId?state.scopes.find(s=>s.id===scope.parentId)?.label:scope.label,item:scope.kind==='quotation-rule'?scope.label:'',field:f.field,value:f.value};
  });
}
