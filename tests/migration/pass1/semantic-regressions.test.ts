import { expect,it } from 'vitest';
import { currentConversationFact } from '../../../src/lib/migration/conversation';
import { planConversationAnswer,renderConversationAnswer } from '../../../src/lib/migration/conversation-rules';
import { draft,d11 } from './golden';
const binding={runId:'offline-semantic-probes',fence:1,revision:1};
it('does not validate per-block minimum when its governing quote says per call',async()=>{
 const d=d11(),op=d.p.operations.find(o=>o.field==='minimumScope')!;
 op.value='block';op.evidence=d.p.scopes[1].evidence;
 const answer=await planConversationAnswer(d.apply().state,binding);
 expect(answer.complete).toBe(false);expect(answer.items[0].totals).toBeUndefined();
 expect(renderConversationAnswer(answer)).not.toContain('USD 1,800.00');
});
it.each(['minimumScope','maximumScope'] as const)('checks enumerated per-movement cue for %s instead of treating it as per call',async field=>{
 const source=field==='minimumScope'?'USD 1,100 minimum per call':'USD 1,800 cap per call';
 const original=d11();const text=original.inputs[0].text.replace(source,source.replace('per call','per movement'));
 const d=draft(text);d.p={...original.p};
 // Rebuild all references from the changed input, keeping semantic values uncorrected.
 const input=d.inputs[0];const remap=(e:{inputId:string;quote:string})=>({inputId:input.id,quote:e.quote.replace(source,source.replace('per call','per movement'))});
 d.p.inputIds=[input.id];d.p.scopes=d.p.scopes.map(s=>({...s,evidence:remap(s.evidence)}));d.p.tasks=d.p.tasks.map(t=>({...t,evidence:remap(t.evidence)}));d.p.operations=d.p.operations.map(o=>({...o,evidence:remap(o.evidence)}));
 const { reduceInterpretation,emptyConversation }=await import('../../../src/lib/migration/conversation');
 const answer=await planConversationAnswer(reduceInterpretation(emptyConversation(),d.p,d.inputs).state,binding);expect(answer.complete).toBe(false);
});
it('R1: unsupported metre-hour basis never becomes USD20',async()=>{
 const text='Berth USD 2/metre/hour, LOA 100 m, 10 hours';const d=draft(text);d.scope('call','Vessel',text);d.scope('rule','Berth',text,'call');d.quoteTask('quote','call',['berth'],['rule']);
 d.op('call','loa','100','m','LOA 100 m');d.op('call','durationHours','10','hours','10 hours');d.op('rule','charge','berth','',text);d.op('rule','currency','USD','','USD 2');d.op('rule','rate','2','money','USD 2');d.op('rule','basis','gt-period','',text);d.op('rule','periodHours','1','hours',text);d.op('rule','rounding','exact','',text);
 const answer=await planConversationAnswer(d.apply().state,binding);expect(answer.complete).toBe(false);expect(renderConversationAnswer(answer)).not.toMatch(/USD\s+20\.00/);
});
it.each(['GT 20000, not DWT 30000','DWT 30000'])('R1: negated DWT remains unestablished with evidence %s',quote=>{
 const text='GT 20000, not DWT 30000';const d=draft(text);d.scope('call','Vessel',text);d.p.tasks=[{id:'facts',scopeId:'call',kind:'facts',source:'none',charges:[],ruleScopeIds:[],evidence:d.e(text)}];d.op('call','dwt','30000','tonnes',quote);
 expect(currentConversationFact(d.apply().state,'call','dwt')).toBeUndefined();
});
it.each(['Berthed either 18 October 2026 at 22:45 or 19 October 2026 at 22:45','Berthed either 18 October 2026 at 22:45'])('R1: ambiguous berth date remains unresolved even with narrowed evidence: %s',quote=>{
 const text='Berthed either 18 October 2026 at 22:45 or 19 October 2026 at 22:45';const d=draft(text);d.scope('call','Vessel',text);d.p.tasks=[{id:'facts',scopeId:'call',kind:'facts',source:'none',charges:[],ruleScopeIds:[],evidence:d.e(text)}];d.op('call','berthStart','18 October 2026 at 22:45','timestamp',quote);
 expect(currentConversationFact(d.apply().state,'call','berthStart')).toBeUndefined();
});
