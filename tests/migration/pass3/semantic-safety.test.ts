import {expect,it} from 'vitest';
import {ConversationSession} from '../../../src/lib/migration/conversation-session';
import {quoteFacts,texts} from '../pass2/fixtures';
import {savedFactSummary,flatInterpretationSchema} from '../../../src/lib/migration/flat-interpretation';
async function run(text:string,proposal:unknown){const s=new ConversationSession({runId:'semantic-safety',fence:1,revision:1});s.initialize([{role:'user',content:text}]);s.interpretFacts(proposal,s.captureInterpretationDispatch());await s.prepare();return s;}
it('cannot invent a timezone after semantic fields stop literal matching',async()=>{
  await expect(run(texts.D02[0].replace(', both India time',''),quoteFacts('D02'))).rejects.toThrow(/zone|time|ground/i);
});
it.each(['minimum','maximum'] as const)('rejects simultaneous %s none and a positive quoted amount',async field=>{
  const p=quoteFacts('D11');p.facts.find(f=>f.field===field)!.value='none';
  const s=await run(texts.D11[0],p);expect(s.answer?.complete).toBe(false);expect(s.text()).not.toContain('USD 1,080.00');
});
it('saved model context uses the same semantic wire fields, never storage-only names',async()=>{
  const s=await run(texts.D11[0],quoteFacts('D11'));
  expect(flatInterpretationSchema.safeParse({facts:savedFactSummary(s.state)}).success).toBe(true);
});
it('none/not_stated do not become exact rounding or an invented scope',async()=>{
  const p=quoteFacts('D19');p.facts.push({subject:'Quote',item:'berth hire',field:'rounding',value:'none'},{subject:'Quote',item:'berth hire',field:'minimumScope',value:'none'});
  const s=await run(texts.D19[0],p);expect(s.answer?.complete).toBe(true);expect(s.text()).toContain('USD 1,280.00');
});
