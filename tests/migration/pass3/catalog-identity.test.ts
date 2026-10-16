import {expect,it} from 'vitest';
import {ConversationSession} from '../../../src/lib/migration/conversation-session';
import {quoteFacts,texts} from '../pass2/fixtures';
async function run(value:string,text=texts.D11[0]){
  const s=new ConversationSession({runId:'catalog',fence:1,revision:1});s.initialize([{role:'user',content:text}]);
  const p=quoteFacts('D11');p.facts.push({subject:'Quote',item:'',field:'terminal',value});s.interpretFacts(p,s.captureInterpretationDispatch());await s.prepare();return s;
}
it.each(['NSICT','nhava-sheva-international-container-terminal','NHAVA — SHEVA INTERNATIONAL CONTAINER TERMINAL'])('resolves %s through the catalog without literal identity equality',async value=>{
  const s=await run(value);expect(s.answer?.complete).toBe(true);expect(s.text()).toContain('USD 1,100.00');
  expect(s.state.facts.find(f=>f.field==='terminal')?.value).toBe('nhava-sheva-international-container-terminal');
});
it('rejects a different known catalog identity',async()=>{await expect(run('Jaigarh')).rejects.toThrow(/identity|catalog|location/i);});
it('does not guess an ambiguous catalog name',async()=>{await expect(run('NSICT',texts.D11[0].replace('Nhava Sheva International Container Terminal','Nhava Sheva'))).rejects.toThrow(/ambiguous|identity|catalog/i);});
it('retains a reviewed berth display identity from catalog aliases',async()=>{
  const s=new ConversationSession({runId:'catalog-berth',fence:1,revision:1});s.initialize([{role:'user',content:'Explain berth hire at Mumbai Indira Dock'}]);
  s.interpretFacts({facts:[{subject:'Call',item:'',field:'request',value:'rule'},{subject:'Call',item:'',field:'port',value:'MBPT'},{subject:'Call',item:'',field:'terminal',value:'indira-dock'},{subject:'Call',item:'',field:'charge',value:'berth'}]},s.captureInterpretationDispatch());
  expect(s.state.facts.find(f=>f.field==='port')?.value).toBe('mumbai');expect(s.state.facts.find(f=>f.field==='terminal')?.value).toBe('Indira Dock');
});
