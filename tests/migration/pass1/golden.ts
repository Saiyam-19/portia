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
