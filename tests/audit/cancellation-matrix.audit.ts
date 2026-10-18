import {afterEach,expect,it,vi} from 'vitest';
import {createOpenRouter} from '@openrouter/ai-sdk-provider';
import {createMigrationMainAgent} from '../../src/lib/migration/domain-agent';
import {withSafeModelErrors} from '../../src/lib/migration/safe-model';
import {publicChatStream} from '../../src/lib/migration/public-stream';
import {withStreamFinalizer} from '../../src/lib/migration/stream-finalizer';
import {responseErrorMessage} from '../../src/lib/migration/response-errors';
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

it.each(['before-fetch','pending-body','after-token','after-buffered-token','consumer-disconnect','repeated-stop'] as const)('settles actual provider cancellation at %s without unhandled rejection',async stage=>{
  const outer=new AbortController();let started!:()=>void,token!:()=>void;
  const entered=new Promise<void>(r=>{started=r;}),written=new Promise<void>(r=>{token=r;});
  const encoder=new TextEncoder();
  let acceptedRequests=0;
  const network=vi.fn(async(_input:unknown,init?:RequestInit)=>{
    init?.signal?.throwIfAborted();acceptedRequests++;
    const response=new Response(new ReadableStream({start(controller){
      const error=()=>controller.error(init?.signal?.reason);
      if(init?.signal?.aborted)error();else init?.signal?.addEventListener('abort',error,{once:true});
      if(stage==='after-token'||stage==='after-buffered-token')controller.enqueue(encoder.encode('data: '+JSON.stringify({id:'synthetic',created:1,model:'synthetic',object:'chat.completion.chunk',choices:[{index:0,delta:{role:'assistant',content:'Partial answer'},finish_reason:null}]})+'\n\n'));
    }}),{headers:{'Content-Type':'text/event-stream'}});if(stage==='after-token'||stage==='after-buffered-token')token();started();return response;
  });
  const reason=new DOMException('Stopped','AbortError');
  if(stage==='before-fetch')outer.abort(reason);
  const adapter=createOpenRouter({apiKey:'synthetic',fetch:network}).chat('synthetic-model');
  const result=await createMigrationMainAgent({alias:'model-1',mainModel:withSafeModelErrors(adapter)}).stream({prompt:stage==='after-buffered-token'?'Estimate berth hire':'Synthetic',abortSignal:outer.signal});
  const finalized: string[]=[];
  const stream=withStreamFinalizer(publicChatStream(result.stream,{abortSignal:outer.signal,result,onFailure:()=>{}}),async event=>{finalized.push(event.kind);if(event.kind==='cancel')outer.abort(reason);});
  const reader=stream.getReader(),parts:string[]=[];
  const consume=(async()=>{while(true){const next=await reader.read();if(next.done)break;parts.push(next.value.type);if(next.value.type==='text-delta')token();}})();
  if(stage!=='before-fetch'){
    await entered;
    if(stage==='after-token'||stage==='after-buffered-token')await written;
    else await new Promise(resolve=>setTimeout(resolve,10));
    if(stage==='consumer-disconnect')await reader.cancel(reason);
    else{outer.abort(reason);outer.abort(reason);}
  }
  await consume;await new Promise(resolve=>setTimeout(resolve,25));
  expect(finalized).toHaveLength(1);
  if(stage==='before-fetch')expect(acceptedRequests).toBe(0);
});

it.each([15,25])('settles independent SDK first-chunk timeout versus user Stop at%s ms',async stopAt=>{
  const outer=new AbortController();let started!:()=>void;const entered=new Promise<void>(r=>{started=r;});
  const adapter=createOpenRouter({apiKey:'synthetic',fetch:async(_input,init)=>{
    const response=new Response(new ReadableStream({start(c){init?.signal?.addEventListener('abort',()=>c.error(init.signal?.reason),{once:true});}}),{headers:{'Content-Type':'text/event-stream'}});started();return response;
  }}).chat('synthetic-model');
  const result=await createMigrationMainAgent({alias:'model-1',mainModel:withSafeModelErrors(adapter)}).stream({prompt:'Race',abortSignal:outer.signal,timeout:{firstChunkMs:20,stepMs:200,totalMs:300}});
  let finalized=0;const reader=withStreamFinalizer(publicChatStream(result.stream,{abortSignal:outer.signal,result,onFailure:()=>{}}),async()=>{finalized++;}).getReader();
  const consumed=(async()=>{while(!(await reader.read()).done){/* drain protocol */}})();
  await entered;const timer=setTimeout(()=>outer.abort(new DOMException('Stopped','AbortError')),stopAt);
  try{await consumed;await new Promise(r=>setTimeout(r,40));expect(outer.signal.aborted).toBe(true);expect(finalized).toBe(1);}finally{clearTimeout(timer);outer.abort();}
});

it('preserves genuine provider failure while hiding private exception details',async()=>{
  const failures:unknown[]=[],outer=new AbortController();
  const model=createOpenRouter({apiKey:'synthetic',fetch:async()=>Response.json({error:{message:'PRIVATE_PROVIDER_BODY',code:503}},{status:503})}).chat('synthetic-model');
  const result=await createMigrationMainAgent({alias:'model-1',mainModel:withSafeModelErrors(model)}).stream({prompt:'Synthetic',abortSignal:outer.signal});
  const reader=publicChatStream(result.stream,{abortSignal:outer.signal,result,onFailure:error=>failures.push(error)}).getReader();
  const parts=[];while(true){const next=await reader.read();if(next.done)break;parts.push(next.value);}
  expect(failures.length).toBeGreaterThan(0);expect(responseErrorMessage(failures[0])).toContain('temporarily busy');expect(JSON.stringify(parts)).not.toContain('PRIVATE_PROVIDER_BODY');
});
