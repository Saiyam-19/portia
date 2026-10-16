import { expect,it } from 'vitest';
import { generateText,streamText,tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { createConversationModel } from '../../../src/lib/migration/conversation-model';
import { ConversationSession } from '../../../src/lib/migration/conversation-session';
import { interpretationProposalSchema } from '../../../src/lib/migration/conversation';
import { d11 } from './golden';
const usage={inputTokens:{total:1,noCache:1,cacheRead:0,cacheWrite:0},outputTokens:{total:1,text:1,reasoning:0}};
async function attempt(mode:'generate'|'stream',outputs:string[],repairEnabled?:boolean,abort?:AbortController){
 const d=d11(),session=new ConversationSession({runId:'offline-repair',fence:1,revision:1});session.initialize(d.messages);
 let calls=0;const prompts:unknown[]=[];
 const result=(options:{prompt:unknown})=>{prompts.push(structuredClone(options.prompt));const input=outputs[calls++]??JSON.stringify(d.p);if(abort)abort.abort(new DOMException('Stopped','AbortError'));return {content:[{type:'tool-call' as const,toolName:'interpret_request',toolCallId:`i-${calls}`,input}],finishReason:{unified:'tool-calls' as const,raw:undefined},usage,warnings:[]};};
 const model=new MockLanguageModelV4({doGenerate:async options=>result(options),doStream:async options=>{const r=result(options);return {stream:new ReadableStream<LanguageModelV4StreamPart>({start(c){c.enqueue({type:'stream-start',warnings:[]});for(const p of r.content)c.enqueue(p);c.enqueue({type:'finish',finishReason:r.finishReason,usage});c.close();}})};}});
 const options={model:createConversationModel(model,session,{repairEnabled}),messages:d.messages,tools:{interpret_request:tool({inputSchema:interpretationProposalSchema})},toolChoice:{type:'tool' as const,toolName:'interpret_request' as const},maxRetries:0,abortSignal:abort?.signal};
 let error:unknown,text='',toolCalls=0;
 if(mode==='generate'){try{const r=await generateText(options);text=r.text;toolCalls=r.toolCalls.length;}catch(e){error=e;}}
 else {const r=streamText(options);const finished=Promise.resolve(r.finishReason).catch(e=>e);for await(const p of r.fullStream){if(p.type==='error')error=p.error;if(p.type==='text-delta')text+=p.text;if(p.type==='tool-call')toolCalls++;}await finished;}
 return {calls,prompts,error,text,toolCalls};
}
it.each(['generate','stream'] as const)('%s: malformed required call becomes a code-owned error with repair OFF',async mode=>{const r=await attempt(mode,['{']);expect(r.calls).toBe(1);expect(r.error).toMatchObject({name:'PortiaInterpretationError'});expect(r.text).toBe('');expect(r.toolCalls).toBe(0);});
it.each(['generate','stream'] as const)('%s: explicit repair permits one re-ask carrying validation feedback',async mode=>{const r=await attempt(mode,['{'],true);expect(r.calls).toBe(2);expect(JSON.stringify(r.prompts[1])).toContain('Invalid interpretation');expect(r.error).toBeUndefined();expect(r.toolCalls).toBe(1);expect(r.text).toBe('');});
it.each(['generate','stream'] as const)('%s: two malformed attempts stop, never a third call',async mode=>{const r=await attempt(mode,['{','{'],true);expect(r.calls).toBe(2);expect(r.error).toMatchObject({name:'PortiaInterpretationError'});expect(r.text).toBe('');});
it('cancellation prevents a repair dispatch',async()=>{const r=await attempt('generate',['{'],true,new AbortController());expect(r.calls).toBe(1);expect(r.error).toMatchObject({name:'AbortError'});});
it.each(['generate','stream'] as const)('%s: a captured-style invalid scope enum carries schema feedback, not coercion',async mode=>{
 const malformed={...d11().p,scopes:[{...d11().p.scopes[0],kind:'rule'}]};
 const r=await attempt(mode,[JSON.stringify(malformed)],true);expect(r.calls).toBe(2);expect(JSON.stringify(r.prompts[1])).toContain('scopes.0.kind');expect(r.toolCalls).toBe(1);expect(r.error).toBeUndefined();
});
