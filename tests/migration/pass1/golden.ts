// Hand-authored from frozen user text. No model output or production parser creates these interpretations.
import type { ModelMessage } from 'ai';
import { conversationInputs, emptyConversation, reduceInterpretation, type ConversationState, type ConversationField, type Interpretation } from '../../../src/lib/migration/conversation';
import frozen from './inputs.json';
export const texts = frozen.inputs;
export function draft(text: string, previous = emptyConversation(), earlier: ModelMessage[] = []) {
  const messages: ModelMessage[] = [...earlier, {role:'user',content:text}];
  const inputs = conversationInputs(messages), input = inputs.at(-1)!;
  const e = (quote: string) => { if (!input.text.includes(quote)) throw new Error(`Golden evidence absent: ${quote}`); return {inputId:input.id,quote}; };
  const p: Interpretation = {version:1,baseHash:previous.hash,inputIds:inputs.filter(i=>!previous.consumed.includes(i.id)).map(i=>i.id),scopes:[],operations:[],tasks:[],unresolved:[]};
  const scope = (id:string,label:string,quote:string,parentId:string|null=null,kind:'call'|'scenario'|'quotation-rule'=parentId?'quotation-rule':'call') => p.scopes.push({id,label,kind,parentId,evidence:e(quote)});
  const op = (scopeId:string,field:ConversationField,value:string,unit:string,quote:string,operation:Interpretation['operations'][number]['operation']='assert') => p.operations.push({scopeId,field,value,unit,operation,evidence:e(quote)});
  const quoteTask = (id:string,scopeId:string,charges:string[],ruleScopeIds:string[],quote=text) => p.tasks.push({id,scopeId,charges,ruleScopeIds,kind:'quote',source:'supplied',evidence:e(quote)});
  return {p,e,op,scope,quoteTask,inputs,messages,apply:()=>reduceInterpretation(previous,p,inputs)};
}
export function d11() {
  const d=draft(texts.D11[0]);d.scope('call','MV Glass Petrel','MV Glass Petrel');
  const rule='berth hire is USD 0.04 per GT for each started 12-hour block, with a USD 1,100 minimum per call and a USD 1,800 cap per call';
  d.scope('berth','Berth hire',rule,'call');d.quoteTask('quote','call',['berth'],['berth']);
  d.op('call','gt','9000','GT','9,000 GT');d.op('call','durationHours','25','hours','25 hours');d.op('call','taxPercent','0','percent','No other charges or tax');d.op('call','otherAdjustments','false','','No other charges or tax');
  d.op('berth','charge','berth','',rule);d.op('berth','currency','USD','','USD 0.04');d.op('berth','rate','0.04','money','USD 0.04');d.op('berth','basis','gt-period','','per GT for each started 12-hour block');d.op('berth','periodHours','12','hours','12-hour block');d.op('berth','rounding','started','','each started 12-hour block');
  d.op('berth','minimum','1100','money','USD 1,100 minimum per call');d.op('berth','maximum','1800','money','USD 1,800 cap per call');d.op('berth','minimumScope','call','','USD 1,100 minimum per call');d.op('berth','maximumScope','call','','USD 1,800 cap per call');return d;
}
export function d02() {
  const d=draft(texts.D02[0]);d.scope('call','MV Cedar Kite','MV Cedar Kite');
  d.op('call','berthStart','18 October 2026 at 22:45','timestamp','alongside from 18 October 2026 at 22:45');d.op('call','berthEnd','20 October 2026 at 05:15','timestamp','to 20 October 2026 at 05:15');d.op('call','timeZone','India time','','both India time');d.op('call','taxPercent','0','percent','No tax');
  const rule='berth charge is INR 4,000 for each started six-hour block';d.scope('berth','Berth charge',rule,'call');d.op('berth','charge','berth','',rule);d.op('berth','currency','INR','','INR 4,000');d.op('berth','rate','4000','money','INR 4,000');d.op('berth','periodHours','6','hours','six-hour block');d.op('berth','rounding','started','','each started six-hour block');
  // No supported basis represents a pure time-block price. Omitting it is an explicit contract gap, never gt-period or flat-per-call coercion.
  d.quoteTask('quote','call',['berth'],['berth']);d.p.tasks.push({id:'elapsed',scopeId:'call',kind:'elapsed',source:'none',charges:[],ruleScopeIds:[],evidence:d.e('How long is that')});return d;
}
export function d19() {
  const d=draft(texts.D19[0]);d.scope('call','Fictional vessel quote','fictional vessel quote');d.op('call','taxPercent','0','percent','No tax');
  for(const [id,charge,amount] of [['berth','berth hire','825'],['pilotage','pilotage','390'],['water','water supply','65']]){
    const raw=`USD ${amount} ${charge}`;d.scope(id,charge,raw,'call');d.op(id,'charge',charge,'',raw);d.op(id,'currency','USD','',raw);d.op(id,'rate',amount,'money',raw);d.op(id,'basis','amount','',raw);
  }
  d.quoteTask('quote','call',['berth hire','pilotage','water supply'],['berth','pilotage','water']);return d;
}
export function d19Correction(previous:ConversationState,earlier:ModelMessage[]){
  const d=draft(texts.D19[1],previous,earlier);d.p.tasks=previous.tasks;
  d.op('water','rate','80','money','The water supply is now USD 80','correct');return d;
}
export function d24(){
  const d=draft(texts.D24[0]);
  for(const [id,label,raw,lines,currency] of [
    ['a','A','A is USD 1,275.35 plus USD 84.65',[['1275.35','USD 1,275.35'],['84.65','USD 84.65']],'USD'],
    ['b','B','B is INR 114,500 all-in',[['114500','INR 114,500']],'INR'],
  ] as const){
    d.scope(id,label,raw);d.op(id,'taxPercent','0','percent','No tax or other extras');d.op(id,'otherAdjustments','false','','No tax or other extras');
    const ids:string[]=[];const charges:string[]=[];
    for(const [i,[amount,atom]] of lines.entries()){
      const rule=`${id}_item_${i+1}`,charge=`item_${i+1}`;ids.push(rule);charges.push(charge);d.scope(rule,charge,atom,id);d.op(rule,'charge',charge,'',atom);d.op(rule,'currency',currency,'',atom);d.op(rule,'rate',amount,'money',atom);d.op(rule,'basis','amount','',atom);
    }d.quoteTask(id,id,charges,ids,raw);
  }
  const fx='my fixed USD/INR rate of 83.25';d.scope('comparison','Comparison','Compare them in INR');
  d.op('comparison','currency','INR','','Compare them in INR');d.op('comparison','fxRate','83.25','ratio',fx);d.op('comparison','fxFrom','USD','',fx);d.op('comparison','fxTo','INR','',fx);d.op('comparison','moneyRounding','quote','','round to paise only after adding each quotation');d.op('comparison','moneyDecimals','2','places','round to paise only after adding each quotation');
  d.p.tasks.push({id:'comparison',scopeId:'comparison',kind:'comparison',source:'supplied',charges:[],ruleScopeIds:[],comparisonTaskIds:['a','b'],comparisonMode:'totals',evidence:d.e(texts.D24[0])});return d;
}
export function original19(){
  const d=draft(texts['original-19'][0]);
  const term='Berth hire: INR 0.25 per GT per hour or part thereof';
  for(const [id,label,raw,hours,minutes] of [['a','A','A. 24 hours exactly','24',null],['b','B','B. 24 hours and 1 minute',null,'1441'],['c','C','C. 48 hours exactly','48',null]] as const){
    d.scope(id,label,raw,null,'scenario');d.op(id,'gt','10000','GT','GT: 10,000');
    if(minutes)d.op(id,'durationMinutes',minutes,'minutes',raw);else d.op(id,'durationHours',hours!,'hours',raw);
    d.op(id,'taxPercent','0','percent','No minimum charge, discounts, surcharges, or taxes apply to this exercise');d.op(id,'otherAdjustments','false','','No minimum charge, discounts, surcharges, or taxes apply to this exercise');
    const rule=id+'_berth';d.scope(rule,'Berth hire',term,id);d.op(rule,'charge','berth','',term);d.op(rule,'currency','INR','','INR 0.25');d.op(rule,'rate','0.25','money','INR 0.25');d.op(rule,'basis','gt-period','','per GT per hour');d.op(rule,'periodHours','1','hours','per hour');d.op(rule,'rounding','started','','Round the total berth stay up to the next whole hour');d.quoteTask(id,id,['berth'],[rule],raw);
  }return d;
}
export function mumbai(id:'MJ1'|'MJ2'){
  const messages:ModelMessage[]=texts[id].slice(0,id==='MJ2'?2:1).map(content=>({role:'user',content}));
  const d=draft(String(messages.at(-1)!.content),emptyConversation(),messages.slice(0,-1));
  const input=d.inputs[0],e=(quote:string)=>({inputId:input.id,quote});
  d.p.scopes=[{id:'call',label:id,kind:'call',parentId:null,evidence:e(input.text)}];
  d.p.operations=[{scopeId:'call',field:'port',value:'mumbai',unit:'',operation:'assert',evidence:e(id==='MJ1'?'Mumbai Port, Indira Dock':'Mumbai, Indira Dock')},{scopeId:'call',field:'service',value:'foreign',unit:'',operation:'assert',evidence:e('foreign-going')}];
  d.op('call','gt',id==='MJ1'?'23680':'18460','GT',id==='MJ1'?'23,680 GT':'gross tonnage is 18,460');
  d.p.tasks=[{id:'quote',scopeId:'call',kind:'quote',source:'official',charges:id==='MJ1'?['port-dues','pilotage','towage']:['port-dues'],ruleScopeIds:[],evidence:e(input.text)}];return d;
}
