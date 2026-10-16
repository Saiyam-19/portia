import {expect,it} from 'vitest';
import type {ModelMessage} from 'ai';
import {ConversationSession} from '../../../src/lib/migration/conversation-session';
import {quoteFacts,texts,rows} from '../pass2/fixtures';
const binding={runId:'failed-turn-recovery',fence:1,revision:1};
function setup(){
  const s=new ConversationSession(binding);s.initialize([{role:'user',content:texts.D19[0]}]);
  const bad=quoteFacts('D19');bad.facts.find(f=>f.field==='rate')!.value='999';
  expect(()=>s.interpretFacts(bad,s.captureInterpretationDispatch())).toThrow();expect(s.state.consumed).toEqual([]);return s;
}
it('recovers saved details after failure, applies only the named correction, and replays its receipt',async()=>{
  const s=setup(),messages:ModelMessage[]=[{role:'user',content:texts.D19[0]},{role:'user',content:texts.D19[1]}];s.initialize(messages);
  const receipt=s.interpretFacts({facts:rows('Quote','water supply',{rate:'80'})},s.captureInterpretationDispatch());await s.prepare();
  expect(s.pending).toEqual([]);expect(s.state.consumed).toHaveLength(2);expect(s.answer?.complete).toBe(true);
  for(const v of ['1,295.00','825.00','390.00','80.00'])expect(s.text()).toContain(v);
  const restored=new ConversationSession(binding);restored.initialize([...messages,{role:'tool',content:[{type:'tool-result',toolName:'interpret_request',toolCallId:'recover',output:{type:'json',value:JSON.parse(JSON.stringify(receipt))}}]}]);
  expect(restored.state.hash).toBe(s.state.hash);expect(restored.pending).toEqual([]);
});
it('supports more than two pending inputs in chronological order',async()=>{
  const s=setup();s.initialize([{role:'user',content:texts.D19[0]},{role:'user',content:texts.D19[1]},{role:'user',content:'The water supply is now USD 90. Keep the other charges.'}]);
  s.interpretFacts({facts:rows('Quote','water supply',{rate:'90'})},s.captureInterpretationDispatch());await s.prepare();expect(s.state.consumed).toHaveLength(3);expect(s.text()).toContain('USD 1,305.00');
});
it('also accepts merged model facts without reusing the superseded water amount',async()=>{
  const s=setup();s.initialize([{role:'user',content:texts.D19[0]},{role:'user',content:texts.D19[1]}]);const p=quoteFacts('D19');p.facts.find(f=>f.field==='rate'&&f.item==='water supply')!.value='80';
  s.interpretFacts(p,s.captureInterpretationDispatch());await s.prepare();expect(s.text()).toContain('USD 1,295.00');
});
it('does not merge a different vessel into the failed call',()=>{
  const s=setup();s.initialize([{role:'user',content:texts.D19[0]},{role:'user',content:'New vessel Beta: water supply is USD 80.'}]);
  expect(()=>s.interpretFacts({facts:rows('Beta','water supply',{rate:'80'})},s.captureInterpretationDispatch())).toThrow(/scope|call|recover|vessel/i);
});
it('does not silently retain an older amount when the latest correction was omitted',()=>{
  const s=setup();s.initialize([{role:'user',content:texts.D19[0]},{role:'user',content:texts.D19[1]}]);
  expect(()=>s.interpretFacts(quoteFacts('D19'),s.captureInterpretationDispatch())).toThrow(/correction|amount|term/i);
});
