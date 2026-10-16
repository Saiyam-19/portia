import { mumbaiProposal } from "./conversation-fixtures";
import { readFileSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import type { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";
const mocks=vi.hoisted(()=>({bridge:vi.fn(),agent:vi.fn(),stop:vi.fn()}));
vi.mock("../../src/lib/migration/config",()=>({migrationPreviewEnabled:()=>true}));
vi.mock("../../src/lib/migration/origin",()=>({trustedMigrationOrigin:()=>"https://portia.test"}));
vi.mock("../../src/lib/memory/session",()=>({memoryFeatureEnabled:()=>false}));
vi.mock("../../src/lib/migration/domain-agent",async original=>({...await original<object>(),createMigrationMainAgent:mocks.agent}));
vi.mock("../../src/lib/migration/bridge",()=>({callMigrationBridge:mocks.bridge,MigrationTokenManager:class{initialize=async()=>{};refresh=async()=>{};stop=mocks.stop;}}));
import { POST } from "../../src/app/api/migration/chat/route";
const question=JSON.parse(readFileSync("output/actual-tariff-20261015/independent/input-v1.json","utf8")).user_message;
const usage={inputTokens:{total:1,noCache:1,cacheRead:undefined,cacheWrite:undefined},outputTokens:{total:1,text:1,reasoning:undefined}};
let main:MockLanguageModelV4,specialist:MockLanguageModelV4;
beforeEach(async()=>{
  vi.clearAllMocks();const actual=await vi.importActual<typeof import("../../src/lib/migration/domain-agent")>("../../src/lib/migration/domain-agent");
  main=new MockLanguageModelV4({doStream:async()=>({warnings:[],stream:new ReadableStream<LanguageModelV4StreamPart>({start(c){
    c.enqueue({type:"stream-start",warnings:[]});c.enqueue({type:"text-start",id:"bad"});c.enqueue({type:"text-delta",id:"bad",delta:"Unbound INR 999999"});c.enqueue({type:"text-end",id:"bad"});
    c.enqueue({type:"tool-call",toolName:"interpret_request",toolCallId:"interpret",input:JSON.stringify(mumbaiProposal())});
    c.enqueue({type:"finish",usage,finishReason:{unified:"tool-calls",raw:undefined}});c.close();
  }})})});
  specialist=new MockLanguageModelV4({doGenerate:async({prompt})=>{
    const system=prompt.filter(m=>m.role==="system").map(m=>m.content).join("\n");
    const request_id=/REQUEST_ID=([a-f0-9]{64})/.exec(system)![1];const rule_id=/APPROVED_RULE_ID=([^\n]+)/.exec(system)![1];
    expect(system).toContain("https://www.mumbaiport.gov.in");expect(system).toContain("0.2165");expect(system).not.toContain("51094");
    return {content:[{type:"tool-call",toolName:"calculate_approved_berth_hire",toolCallId:"calculate",input:JSON.stringify({request_id,rule_id})}],warnings:[],usage,finishReason:{unified:"tool-calls",raw:undefined}};
  }});
  mocks.agent.mockImplementation((options:Parameters<typeof createMigrationMainAgent>[0])=>actual.createMigrationMainAgent({ interpretationFormat: "legacy",...options,mainModel:main,specialistModelFactory:()=>specialist}));
});
it.each([false,true])("commits a verified official tariff ledger before monetary publication; reject=%s",async reject=>{
  let release!:()=>void,entered!:()=>void;const enteredPromise=new Promise<void>(r=>{entered=r;});const gate=new Promise<void>(r=>{release=r;});
  mocks.bridge.mockImplementation(async(_manager,call)=>{
    if(call.op==="claim")return{conversationId:"chat",runId:"run",fence:1,revision:1,threadId:"thread",promptMessageId:"prompt",replayed:false};
    if(call.op==="context")return{conversationId:"chat",revision:1,messages:[{role:"user",content:question}],modelAlias:"model-1"};
    if(call.op==="status")return{active:true};
    if(call.op==="complete"){entered();await gate;if(reject)throw new Error("Stale run");return{state:"idle",revision:2};}return{};
  });
  const response=await POST(new Request("https://portia.test/api/chat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:"question",question,conversationId:null,expectedRevision:null,requestId:"a122fbae-303b-45a5-90f3-7f112025dc50",modelAlias:"model-1"})}));
  expect(response.status).toBe(200);const reader=response.body!.getReader();let wire="";const consume=(async()=>{while(true){const p=await reader.read();if(p.done)break;wire+=new TextDecoder().decode(p.value);}})();
  await enteredPromise;expect(wire).not.toMatch(/51,094|51094|999999|factBindings|calculations/);release();await consume;
  expect(main.doStreamCalls).toHaveLength(1);expect(specialist.doGenerateCalls).toHaveLength(0); // source/rule execution is deterministic
  expect(mocks.bridge.mock.calls.filter(([,c])=>c.op==="complete")).toHaveLength(1);
  expect(wire).not.toContain("999999");if(reject)expect(wire).not.toContain("51,094");else{expect(wire).toContain("51,094.00");expect(wire).toContain("cbic-gst.gov.in");expect(wire).not.toContain('"type":"error"');}
});
