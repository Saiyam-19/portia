import { expect,it } from 'vitest';
import { reserveDispatch,checkDispatch,checkSyntheticPayload,HEADLESS_POLICY } from '../../../scripts/audit/pass2-budget';
const request={model:HEADLESS_POLICY.model,reasoning:HEADLESS_POLICY.reasoning,stream:true,max_tokens:8192,provider:{allow_fallbacks:false,only:['openai']},tool_choice:{function:{name:'interpret_request'}},messages:[{role:'user',content:'test'}]};
it('reserves unreported/unfinished calls and refuses a dispatch before 80 percent',()=>{
  const first=reserveDispatch([],1000,8192);expect(first.reserveMicros).toBeGreaterThan(81920);
  expect(()=>reserveDispatch([{reserveMicros:750000}],1000,8192)).toThrow(/80 percent/);
  expect(()=>reserveDispatch([{reserveMicros:750000,actualMicros:0}],1000,8192)).not.toThrow();
});
it('allows one repair only; no fallback, repeated initial call or third dispatch',()=>{
  expect(checkDispatch(request,0)).toBe(false);
  expect(()=>checkDispatch(request,1)).toThrow(/one/);
  const repair={...request,messages:[...request.messages,{role:'system',content:'Invalid interpretation: malformed'}]};
  expect(checkDispatch(repair,1)).toBe(true);expect(()=>checkDispatch(repair,2)).toThrow(/one/);
  expect(()=>checkDispatch({...request,model:'another/model'},0)).toThrow(/settings/);
});
it('blocks unrelated user input and private context before sending',()=>{
  expect(()=>checkSyntheticPayload(request,new Set(['test']))).not.toThrow();
  expect(()=>checkSyntheticPayload(request,new Set(['different']))).toThrow(/frozen/);
  expect(()=>checkSyntheticPayload({...request,messages:[{role:'system',content:'HISTORICAL_MEMORY private'}]},new Set(['test']))).toThrow(/Private/);
});
