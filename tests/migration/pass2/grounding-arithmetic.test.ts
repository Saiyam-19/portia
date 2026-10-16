import { expect,it } from 'vitest';
import { ConversationSession } from '../../../src/lib/migration/conversation-session';
import { quoteFacts,texts,rows,line } from './fixtures';
import type { FlatInterpretation } from '../../../src/lib/migration/flat-interpretation';

async function run(text:string,proposal:FlatInterpretation){
  const s=new ConversationSession({runId:'flat-grounding',fence:1,revision:1});s.initialize([{role:'user',content:text}]);
  s.interpretFacts(proposal,s.captureInterpretationDispatch());await s.prepare();return s;
}
it.each(['D19','D24','D02','original-19'] as const)('%s computes all supplied lines in code',async id=>{
  const s=await run(texts[id][0],quoteFacts(id));
  expect(s.answer?.complete).toBe(true);
  const expected={D19:['USD 1,280.00','USD 825.00','USD 390.00','USD 65.00'],D24:['INR 113,220.00','INR 114,500.00','INR 1,280.00'],D02:['30.5 hours','billable periods 6','INR 24,000.00'],'original-19':['INR 60,000.00','INR 62,500.00','INR 120,000.00','billable periods 25']}[id];
  for(const value of expected)expect(s.text()).toContain(value);
});
it('normalizes currency symbols, commas, full-width digits and sentence punctuation',async()=>{
  const text='Add US$１,２７５.３５ berth hire and ₹80 water supply. No tax.';
  const s=await run(text,{facts:[...rows('Quote','',{request:'supplied-quote',taxPercent:'0'}),...line('Quote','berth hire','1275.35'),...line('Quote','water supply','80','INR')]});
  expect(s.text()).toContain('USD 1,275.35');expect(s.text()).toContain('INR 80.00');
});
it('rejects a plausible invented number',async()=>{
  const p=quoteFacts('D19');p.facts.find(f=>f.item==='water supply'&&f.field==='rate')!.value='80';
  await expect(run(texts.D19[0],p)).rejects.toThrow(/ground|number|numeric/);
});
it('rejects numbers swapped between named line items even though both appear',async()=>{
  const p=quoteFacts('D19');p.facts.find(f=>f.item==='berth hire'&&f.field==='rate')!.value='390';p.facts.find(f=>f.item==='pilotage'&&f.field==='rate')!.value='825';
  await expect(run(texts.D19[0],p)).rejects.toThrow(/charge|item|ground/);
});
it('rejects a total or calculated duration supplied by the model',async()=>{
  const p=quoteFacts('original-19');p.facts=p.facts.filter(f=>!(f.subject==='B'&&f.field==='durationHours'));p.facts.find(f=>f.subject==='B'&&f.field==='durationMinutes')!.value='1441';
  await expect(run(texts['original-19'][0],p)).rejects.toThrow(/number|numeric|ground/);
});
it('never permits cross-quotation amounts',async()=>{
  const p=quoteFacts('D24');p.facts.find(f=>f.subject==='A'&&f.item==='item_2'&&f.field==='rate')!.value='114500';
  await expect(run(texts.D24[0],p)).rejects.toThrow(/scope|subject|ground|item|charge/);
});
