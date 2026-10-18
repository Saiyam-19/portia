import { expect, it } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { createMigrationMainAgent } from '../../src/lib/migration/domain-agent';
import { withSafeModelErrors } from '../../src/lib/migration/safe-model';
import { publicChatStream } from '../../src/lib/migration/public-stream';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

it('aborts a pending provider body without an unhandled result rejection', async () => {
  const outer = new AbortController();
  let started!: () => void;
  const providerStarted = new Promise<void>(resolve => { started = resolve; });
  const model = withSafeModelErrors(new MockLanguageModelV4({ doStream: async ({ abortSignal }) => ({
    warnings: [], stream: new ReadableStream<LanguageModelV4StreamPart>({start(controller) {
      controller.enqueue({type:'stream-start',warnings:[]});
      abortSignal?.addEventListener('abort',()=>controller.error(abortSignal.reason),{once:true});
      started();
    }}),
  }) }));
  const result = await createMigrationMainAgent({alias:'model-1',mainModel:model}).stream({prompt:'Pending',abortSignal:outer.signal});
  const reader=publicChatStream(result.stream,{abortSignal:outer.signal,result,onFailure:()=>{}}).getReader();
  const parts: string[]=[];
  const consume=(async()=>{while(true){const value=await reader.read();if(value.done)break;parts.push(value.value.type);}})();
  await providerStarted;
  outer.abort(new DOMException('Stopped by user.','AbortError'));
  await consume;
  await new Promise(resolve=>setTimeout(resolve,50));
  expect(parts).toContain('abort');
});

it('aborts the actual provider adapter while its response body is pending', async () => {
  const outer=new AbortController();
  let started!:()=>void;
  const providerStarted=new Promise<void>(resolve=>{started=resolve;});
  const adapter=createOpenRouter({apiKey:'synthetic',fetch:async(_input,init)=>{
    const response=new Response(new ReadableStream({start(controller){
      init?.signal?.addEventListener('abort',()=>controller.error(init.signal?.reason),{once:true});
    }}),{headers:{'Content-Type':'text/event-stream'}});
    started();return response;
  }}).chat('synthetic-model');
  const result=await createMigrationMainAgent({alias:'model-1',mainModel:withSafeModelErrors(adapter)}).stream({prompt:'Pending',abortSignal:outer.signal});
  const reader=publicChatStream(result.stream,{abortSignal:outer.signal,result,onFailure:()=>{}}).getReader();
  const parts:string[]=[];
  const consume=(async()=>{while(true){const next=await reader.read();if(next.done)break;parts.push(next.value.type);}})();
  await providerStarted;
  await new Promise(resolve=>setTimeout(resolve,10));
  outer.abort(new DOMException('Stopped by user.','AbortError'));
  await consume;
  await new Promise(resolve=>setTimeout(resolve,50));
  expect(parts).toContain('abort');
});
