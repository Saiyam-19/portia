import { expect,it } from 'vitest';
import { ConversationSession } from '../../../src/lib/migration/conversation-session';
import { conversationInputs, currentConversationFact } from '../../../src/lib/migration/conversation';
import { d19,d19Correction } from '../pass1/golden';
import { quoteFacts,rows,texts } from './fixtures';
function initial(){
  const s=new ConversationSession({runId:'correction',fence:1,revision:1});s.initialize([{role:'user',content:texts.D19[0]}]);s.interpretFacts(quoteFacts('D19'),s.captureInterpretationDispatch());return s;
}
function pending(s:ConversationSession,text:string){s.inputs=conversationInputs([{role:'user',content:texts.D19[0]},{role:'user',content:text}]);s.pending=s.inputs.filter(i=>!s.state.consumed.includes(i.id));s.answer=undefined;}
it('D19 correction replaces water alone and retains 825,390 without model resupply',async()=>{
  const s=initial();const before=structuredClone(s.state.facts);pending(s,texts.D19[1]);
  s.interpretFacts({facts:rows('Quote','water supply',{rate:'80'})},s.captureInterpretationDispatch());await s.prepare();
  expect(s.answer?.complete).toBe(true);expect(s.text()).toContain('USD 1,295.00');
  const changed=s.state.facts.filter(f=>f.revision===s.state.revision);expect(changed).toHaveLength(1);expect(changed[0]).toMatchObject({field:'rate',value:'80',operation:'correct',status:'established'});
  for(const old of before.filter(f=>f.value==='825'||f.value==='390'))expect(s.state.facts.find(f=>f.id===old.id)).toEqual(old);
});
it('keep other charges is a no-op even if the model repeats their saved values',()=>{
  const s=initial(),before=structuredClone(s.state.facts);pending(s,'Keep the other charges.');
  s.interpretFacts({facts:[...rows('Quote','',{request:'supplied-quote'}),...rows('Quote','berth hire',{rate:'825'}),...rows('Quote','pilotage',{rate:'390'})]},s.captureInterpretationDispatch());
  expect(s.state.facts).toEqual(before);
});
it('legacy preserve cannot poison established rates by citing the current keep clause',()=>{
  const first=d19(),prior=first.apply().state,correction=d19Correction(prior,first.messages);
  for(const id of ['berth','pilotage']){
    const old=first.p.operations.find(o=>o.scopeId===id&&o.field==='rate')!;
    correction.p.operations.push({...old,operation:'preserve',evidence:correction.e('keep the other two charges')});
  }
  const after=correction.apply().state;
  expect(currentConversationFact(after,'berth','rate')?.value).toBe('825');expect(currentConversationFact(after,'pilotage','rate')?.value).toBe('390');
});
it('a stale flat dispatch cannot overwrite a newer result',()=>{
  const s=initial();pending(s,texts.D19[1]);const dispatch=s.captureInterpretationDispatch();
  const p={facts:rows('Quote','water supply',{rate:'80'})};s.interpretFacts(p,dispatch);
  expect(()=>s.interpretFacts(p,dispatch)).toThrow(/stale/);
});
it('a keep instruction cannot create or change a saved amount',()=>{
  const s=initial();pending(s,'Keep the other charges.');
  expect(()=>s.interpretFacts({facts:rows('Quote','berth hire',{rate:'999'})},s.captureInterpretationDispatch())).toThrow(/number|ground/);
});
