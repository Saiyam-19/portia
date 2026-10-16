import {expect,it} from 'vitest';
import {flatInterpretationSchema} from '../../../src/lib/migration/flat-interpretation';
import {ConversationSession} from '../../../src/lib/migration/conversation-session';
import {quoteFacts,texts} from '../pass2/fixtures';
const binding={runId:'pass3-enums',fence:1,revision:1};
export async function run(text:string,proposal:unknown){const s=new ConversationSession(binding);s.initialize([{role:'user',content:text}]);s.interpretFacts(proposal,s.captureInterpretationDispatch());await s.prepare();return s;}
export function semanticQuote(id:Parameters<typeof quoteFacts>[0]){
  return {facts:quoteFacts(id).facts.flatMap(row=>{
    if(row.field==='taxPercent'&&row.value==='0')return [{...row,field:'tax',value:'none'}];
    if((row.field==='minimum'||row.field==='maximum')&&/^\d/.test(row.value))return [{...row,value:'amount'},{...row,field:row.field+'Amount'}];
    if(row.field==='otherAdjustments'&&['yes','no'].includes(row.value))return [{...row,value:row.value==='no'?'none':'present'}];
    return [row];
  })};
}
it('No tax uses a semantic none, never a fabricated numeric zero or exemption',async()=>{
  const s=await run(texts.D19[0],semanticQuote('D19'));expect(s.answer?.complete).toBe(true);expect(s.text()).toContain('USD 1,280.00');
  expect(s.state.facts.some(f=>f.field==='taxPercent')).toBe(false);expect(s.state.facts.some(f=>String(f.field)==='tax'&&f.value==='none')).toBe(true);
});
it('No minimum/cap is an enum absence and cannot invent grounded zero amounts',async()=>{
  const p=semanticQuote('D11');p.facts=p.facts.filter(f=>!['minimumAmount','maximumAmount','minimumScope','maximumScope'].includes(f.field));
  for(const r of p.facts)if(r.field==='minimum'||r.field==='maximum')r.value='none';
  const input=texts.D11[0].replace('with a USD 1,100 minimum per call and a USD 1,800 cap per call','with no minimum or cap');
  const s=await run(input,p);expect(s.answer?.complete).toBe(true);expect(s.text()).toContain('USD 1,080.00');
  expect(s.state.facts.filter(f=>['minimum','maximum'].includes(f.field))).toHaveLength(0);
});
it('wire schema requires strict semantic enums and excludes taxExemption',()=>{
  const row={subject:'Quote',item:'',field:'tax',value:'none'};
  for(const value of ['none','not_stated','percentage','included'])expect(flatInterpretationSchema.safeParse({facts:[{...row,value}]}).success).toBe(true);
  for(const bad of [{...row,value:'zero tax'},{...row,field:'taxExemption',value:'yes'},{...row,field:'minimum',value:'0'},{...row,field:'moneyRounding',value:'only after adding each quotation'}])expect(flatInterpretationSchema.safeParse({facts:[bad]}).success).toBe(false);
});
it('not_stated does not mean none or erase prior terms',async()=>{
  const p=semanticQuote('D19');p.facts.find(f=>f.field==='tax')!.value='not_stated';
  const s=await run(texts.D19[0].replace('No tax.',''),p);expect(s.text()).toContain('No tax rate was supplied');expect(s.text()).not.toContain('Supplied tax 0%');
});
it('does not require enum names to occur literally in wording',async()=>{
  const p=semanticQuote('D11');const input=texts.D11[0].replace('started 12-hour block','commenced 12-hour block');
  const s=await run(input,p);expect(s.answer?.complete).toBe(true);expect(s.text()).toContain('USD 1,100.00');
});
it('still rejects an invented arithmetic number',async()=>{
  const p=semanticQuote('D19');p.facts.find(f=>f.field==='rate'&&f.item==='water supply')!.value='80';
  await expect(run(texts.D19[0],p)).rejects.toThrow(/number|ground/);
});
