import {expect,it} from 'vitest';
import {ConversationSession} from '../../../src/lib/migration/conversation-session';
import {quoteFacts,texts,rows} from '../pass2/fixtures';
async function run(text:string,proposal:unknown){const s=new ConversationSession({runId:'numbered',fence:1,revision:1});s.initialize([{role:'user',content:text}]);s.interpretFacts(proposal,s.captureInterpretationDispatch());await s.prepare();return s;}
it('D24 builds numbered charges from item labels, without duplicate charge facts',async()=>{
  const p=quoteFacts('D24');p.facts=p.facts.filter(f=>f.field!=='charge');
  const s=await run(texts.D24[0],p);expect(s.answer?.complete).toBe(true);
  for(const amount of ['113,220.00','114,500.00','1,280.00'])expect(s.text()).toContain(amount);
});
it('supports Quote A / Quote B labels while retaining the named quote boundary',async()=>{
  const p=quoteFacts('D24');p.facts=p.facts.filter(f=>f.field!=='charge').map(f=>({...f,subject:f.subject==='Comparison'?f.subject:'Quote '+f.subject,item:f.item.replace('_',' ')}));
  const s=await run(texts.D24[0],p);expect(s.answer?.complete).toBe(true);expect(s.text()).toContain('113,220.00');
});
it('counts equal anonymous amounts as distinct supplied items',async()=>{
  const s=await run('A is USD 100 plus USD 100. No tax.',{facts:[...rows('A','',{request:'supplied-quote',tax:'none'}),...rows('A','item_1',{currency:'USD',rate:'100',basis:'amount'}),...rows('A','item_2',{currency:'USD',rate:'100',basis:'amount'})]});
  expect(s.answer?.complete).toBe(true);expect(s.text()).toContain('USD 200.00');expect(s.state.scopes.filter(s=>s.kind==='quotation-rule')).toHaveLength(2);
});
it('refuses omitted repeated amounts rather than treating one match as two items',async()=>{
  await expect(run('A is USD 100 plus USD 100. No tax.',{facts:[...rows('A','',{request:'supplied-quote',tax:'none'}),...rows('A','item_1',{currency:'USD',rate:'100',basis:'amount'})]})).rejects.toThrow(/item|amount|quote/);
});
it('rejects an amount from the other named quotation',async()=>{
  const p=quoteFacts('D24');p.facts.find(f=>f.subject==='A'&&f.item==='item_2'&&f.field==='rate')!.value='114500';
  await expect(run(texts.D24[0],p)).rejects.toThrow(/item|subject|quote|ground/);
});
