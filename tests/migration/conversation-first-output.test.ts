import { afterEach, expect, it, vi } from "vitest";
import { streamText, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { createConversationModel } from "../../src/lib/migration/conversation-model";
import { interpretationProposalSchema } from "../../src/lib/migration/conversation";
import type { ConversationSession } from "../../src/lib/migration/conversation-session";
import { MIGRATION_CHAT_TIMEOUT } from "../../src/lib/migration/agent-policy";
const usage = { inputTokens:{total:1,noCache:1,cacheRead:0,cacheWrite:0},outputTokens:{total:1,text:1,reasoning:0} };
const evidence={inputId:"input-1",quote:"hello"};
const proposal={version:1,baseHash:"a".repeat(64),inputIds:["input-1"],scopes:[{id:"call",label:"Call",kind:"call",parentId:null,evidence}],operations:[],tasks:[{id:"hello",scopeId:"call",kind:"other",source:"none",charges:[],ruleScopeIds:[],evidence}],unresolved:[]};
const session = () => ({pending:[{}],failure:undefined,answer:undefined,published:false} as unknown as ConversationSession);
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
function start(events:Array<[number,LanguageModelV4StreamPart]>, outer?:AbortSignal, timeout=MIGRATION_CHAT_TIMEOUT) {
 const cancel=vi.fn();let providerSignal:AbortSignal|undefined;const timers:ReturnType<typeof setTimeout>[]=[];
 const model=new MockLanguageModelV4({doStream:async options=>{providerSignal=options.abortSignal;return {stream:new ReadableStream<LanguageModelV4StreamPart>({start(c){c.enqueue({type:"stream-start",warnings:[]});for(const [delay,p] of events)timers.push(setTimeout(()=>{c.enqueue(p);if(p.type==="finish")c.close();},delay));},cancel(reason){for(const t of timers)clearTimeout(t);cancel(reason);}})};}});
 const result=streamText({model:createConversationModel(model,session()),prompt:"hello",tools:{interpret_request:tool({inputSchema:interpretationProposalSchema})},timeout,abortSignal:outer,maxRetries:0});
 const parts:Array<{type:string;error?:unknown}>=[];const consumed=(async()=>{for await(const p of result.fullStream)parts.push(p);})();
 const finish=Promise.resolve(result.finishReason).catch((e:unknown)=>e);
 return {result,parts,consumed,finish,cancel,signal:()=>providerSignal};
}
it("allows real tool output before 60s to remain private until a valid finish after 60s",async()=>{
 vi.useFakeTimers();const r=start([[1000,{type:"tool-input-start",id:"i",toolName:"interpret_request"}],[10000,{type:"tool-input-delta",id:"i",delta:"{"}],[90000,{type:"tool-call",toolCallId:"i",toolName:"interpret_request",input:JSON.stringify(proposal)}],[90000,{type:"finish",finishReason:{unified:"tool-calls",raw:undefined},usage}]]);
 await vi.advanceTimersByTimeAsync(60001);expect(r.parts.some(p=>["tool-call","tool-input-delta","text-delta","error","abort"].includes(p.type))).toBe(false);expect(r.signal()?.aborted).toBe(false);
 await vi.advanceTimersByTimeAsync(30000);await r.consumed;expect(await r.finish).toBe("tool-calls");expect(r.parts.filter(p=>p.type==="tool-call")).toHaveLength(1);expect(vi.getTimerCount()).toBe(0);
});
it("aborts silent provider at 60s despite metadata and empty deltas",async()=>{
 vi.useFakeTimers();const r=start([[5000,{type:"response-metadata",id:"metadata"}],[10000,{type:"text-start",id:"empty"}],[20000,{type:"text-delta",id:"empty",delta:""}]]);await vi.advanceTimersByTimeAsync(59999);expect(r.signal()?.aborted).toBe(false);await vi.advanceTimersByTimeAsync(2);await r.consumed;expect(r.signal()?.aborted).toBe(true);expect(r.signal()?.reason).toMatchObject({name:"TimeoutError"});expect(r.cancel).toHaveBeenCalled();expect(r.parts.some(p=>p.type==="error"||p.type==="abort")).toBe(true);
});
it("keeps the 180s step bound after first output",async()=>{
 vi.useFakeTimers();const r=start([[1000,{type:"text-delta",id:"x",delta:"Unbound INR 999"}]]);await vi.advanceTimersByTimeAsync(60001);expect(r.signal()?.aborted).toBe(false);await vi.advanceTimersByTimeAsync(120000);await r.consumed;expect(await r.finish).toMatchObject({name:"TimeoutError"});expect(r.signal()?.aborted).toBe(true);expect(r.parts.some(p=>p.type==="text-delta")).toBe(false);
});
it("Stop cancels pending buffered output and clears the provider timer",async()=>{
 vi.useFakeTimers();const outer=new AbortController();const r=start([[1000,{type:"text-delta",id:"x",delta:"Unbound INR 999"}]],outer.signal);await vi.advanceTimersByTimeAsync(2000);outer.abort(new DOMException("Stopped","AbortError"));await vi.advanceTimersByTimeAsync(0);await r.consumed;expect(r.signal()?.aborted).toBe(true);expect(r.cancel).toHaveBeenCalled();expect(r.parts.some(p=>p.type==="text-delta")).toBe(false);
});

it("bounds a provider that never returns stream headers",async()=>{
 vi.useFakeTimers();let signal:AbortSignal|undefined;
 const model=new MockLanguageModelV4({doStream:options=>{signal=options.abortSignal;return new Promise(()=>{});}});
 const result=streamText({model:createConversationModel(model,session()),prompt:"hello",timeout:MIGRATION_CHAT_TIMEOUT,maxRetries:0});
 const parts:Array<{type:string}>=[];const consumed=(async()=>{for await(const p of result.fullStream)parts.push(p);})();
 const finished=Promise.resolve(result.finishReason).catch(e=>e);
 await vi.advanceTimersByTimeAsync(60001);await consumed;await finished;
 expect(signal?.aborted).toBe(true);expect(signal?.reason).toMatchObject({name:"TimeoutError"});expect(parts.some(p=>p.type==="error")).toBe(true);expect(vi.getTimerCount()).toBe(0);
});
