import { expect,it } from 'vitest';
import { generateText,streamText,tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { createConversationModel } from '../../../src/lib/migration/conversation-model';
import { ConversationSession } from '../../../src/lib/migration/conversation-session';
import { flatInterpretationSchema } from '../../../src/lib/migration/flat-interpretation';
import { createMigrationMainAgent } from '../../../src/lib/migration/domain-agent';
import {texts,quoteFacts,rows} from './fixtures';
const usage={inputTokens:{total:1,noCache:1,cacheRead:0,cacheWrite:0},outputTokens:{total:1,text:1,reasoning:0}};
async function attempt(mode:'generate'|'stream',outputs:unknown[]){
  const session=new ConversationSession({runId:'flat-repair',fence:1,revision:1});session.initialize([{role:'user',content:texts.D19[0]}]);
  let calls=0;const output=()=>({content:[{type:'tool-call' as const,toolName:'interpret_request',toolCallId:'i-'+calls,input:JSON.stringify(outputs[calls++]??quoteFacts('D19'))}],finishReason:{unified:'tool-calls' as const,raw:undefined},usage,warnings:[]});
  const model=new MockLanguageModelV4({doGenerate:async()=>output(),doStream:async()=>{const r=output();return {stream:new ReadableStream<LanguageModelV4StreamPart>({start(c){c.enqueue({type:'stream-start',warnings:[]});for(const p of r.content)c.enqueue(p);c.enqueue({type:'finish',finishReason:r.finishReason,usage});c.close();}})};}});
  const options={model:createConversationModel(model,session,{flatFacts:true}),messages:[{role:'user' as const,content:texts.D19[0]}],tools:{interpret_request:tool({inputSchema:flatInterpretationSchema})},toolChoice:{type:'tool' as const,toolName:'interpret_request' as const},maxRetries:0};
  let error:unknown,accepted=0;
  if(mode==='generate'){try{accepted=(await generateText(options)).toolCalls.length;}catch(e){error=e;}}
  else{const r=streamText(options);const end=Promise.resolve(r.finishReason).catch(e=>e);for await(const p of r.fullStream){if(p.type==='error')error=p.error;if(p.type==='tool-call')accepted++;}await end;}
  return {calls,error,accepted};
}
const malformed={facts:rows('Quote','',{otherAdjustments:'none'})};
it('yes/no fields have enum values and reject none/false/free text',()=>{
  for(const value of ['none','false','no extras'])expect(flatInterpretationSchema.safeParse({facts:rows('Quote','',{otherAdjustments:value})}).success).toBe(false);
  for(const value of ['yes','no'])expect(flatInterpretationSchema.safeParse({facts:rows('Quote','',{otherAdjustments:value})}).success).toBe(true);
});
it.each(['generate','stream'] as const)('%s repairs malformed output once internally by default',async mode=>{
  const r=await attempt(mode,[malformed]);expect(r.calls).toBe(2);expect(r.accepted).toBe(1);expect(r.error).toBeUndefined();
});
it.each(['generate','stream'] as const)('%s stops after one failed repair with a code-owned error',async mode=>{
  const r=await attempt(mode,[malformed,malformed]);expect(r.calls).toBe(2);expect(r.accepted).toBe(0);expect(r.error).toMatchObject({name:'PortiaInterpretationError'});
  expect((r.error as Error).message).not.toMatch(/clarify|provide|supply|what is/i);
});
it('does not ask the user to repeat facts the model omitted',async()=>{
  const p=quoteFacts('D19');p.facts=p.facts.filter(f=>f.field!=='rate');
  const model=new MockLanguageModelV4({doGenerate:async()=>({content:[{type:'tool-call',toolName:'interpret_request',toolCallId:'i',input:JSON.stringify(p)}],finishReason:{unified:'tool-calls',raw:undefined},usage,warnings:[]})});
  const r=await createMigrationMainAgent({alias:'model-1',mainModel:model}).generate({messages:[{role:'user',content:texts.D19[0]}]});
  expect(r.text).toMatch(/interpretation|interpret/i);expect(r.text).not.toMatch(/please clarify|provide|what.*rate|to resolve/i);
  expect(model.doGenerateCalls).toHaveLength(1);
});
