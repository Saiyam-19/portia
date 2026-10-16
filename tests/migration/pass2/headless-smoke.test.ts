import {expect,it} from 'vitest';
import {MockLanguageModelV4} from 'ai/test';
import type {LanguageModelV4StreamPart} from '@ai-sdk/provider';
import type {ModelMessage} from 'ai';
import {ConversationSession} from '../../../src/lib/migration/conversation-session';
import {createMigrationMainAgent} from '../../../src/lib/migration/domain-agent';
import {quoteFacts,rows,texts} from './fixtures';
it('headless streaming carries only code receipts into the D19 correction',async()=>{
  let calls=0;const messages:ModelMessage[]=[];
  const model=new MockLanguageModelV4({doStream:async()=>{const proposal=calls++?{facts:rows('Quote','water supply',{rate:'80'})}:quoteFacts('D19');return {stream:new ReadableStream<LanguageModelV4StreamPart>({start(c){c.enqueue({type:'stream-start',warnings:[]});c.enqueue({type:'tool-call',toolName:'interpret_request',toolCallId:'i-'+calls,input:JSON.stringify(proposal)});c.enqueue({type:'finish',finishReason:{unified:'tool-calls',raw:undefined},usage:{inputTokens:{total:1,noCache:1,cacheRead:0,cacheWrite:0},outputTokens:{total:1,text:1,reasoning:0}}});c.close();}})};}});
  for(const [index,input]of texts.D19.entries()){
    messages.push({role:'user',content:input});const s=new ConversationSession({runId:'headless-smoke',fence:1,revision:index+1});
    const r=await createMigrationMainAgent({alias:'model-1',mainModel:model,conversation:s}).stream({messages});let text='';
    for await(const part of r.stream){if(part.type==='text-delta')text+=part.text;if(part.type==='error')throw part.error;}
    messages.push(...await r.responseMessages);expect(s.answer?.complete).toBe(true);expect(text).toContain(index?'USD 1,295.00':'USD 1,280.00');
  }
  expect(calls).toBe(2);
});
