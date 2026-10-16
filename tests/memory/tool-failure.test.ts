
import {MockLanguageModelV4} from "ai/test";
import type {LanguageModelV4GenerateResult} from "@ai-sdk/provider";
import {afterEach,expect,it,vi} from "vitest";
import {MemorySession} from "../../src/lib/memory/session";
import {MigrationTokenManager} from "../../src/lib/migration/bridge";
import {createMigrationMainAgent} from "../../src/lib/migration/domain-agent";
import { nonfinancialProposal } from "../migration/conversation-fixtures";
import {ChatMemoryRuntime} from "../../src/lib/memory/runtime";
const generated=(content:LanguageModelV4GenerateResult["content"],finish:"stop"|"tool-calls"):LanguageModelV4GenerateResult=>({
 content,finishReason:{unified:finish,raw:undefined},warnings:[],
 usage:{inputTokens:{total:1,noCache:1,cacheRead:undefined,cacheWrite:undefined},outputTokens:{total:1,text:1,reasoning:undefined}},
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});
it("a failed memory tool aborts the run before another provider call or checkpoint",async()=>{
 for(const [key,value] of Object.entries({PORTIA_ENABLED:"true",PORTIA_CONVEX_DEPLOYMENT:"brilliant-whale-380",NEXT_PUBLIC_CONVEX_URL:"https://brilliant-whale-380.convex.cloud",NEXT_PUBLIC_CONVEX_SITE_URL:"https://brilliant-whale-380.convex.site",PORTIA_SERVER_SECRET:"x".repeat(32),SITE_URL:"http://127.0.0.1:3022"}))vi.stubEnv(key,value);
 const controller=new AbortController();
 const manager=new MigrationTokenManager("synthetic","http://127.0.0.1:3022",controller);
 vi.spyOn(manager,"getToken").mockReturnValue("synthetic-jwt");
 const requested:string[]=[];
 vi.stubGlobal("fetch",vi.fn(async(_url,init)=>{
  const body=JSON.parse(String(init.body));requested.push(body.op);
  if(body.op==="enqueue")return Response.json({code:"MEMORY_UNAVAILABLE"},{status:409});
  if(body.op==="claim")return Response.json(null);
  return Response.json({epoch:0,revision:0,pending:false,blocked:false,image:null,scratchpad:"",scratchpadRevision:0});
 }));
 const model=new MockLanguageModelV4({doGenerate:[
  generated([{type:"tool-call",toolCallId:"interpret",toolName:"interpret_request",input:JSON.stringify(nonfinancialProposal("Remember my preference"))}],"tool-calls"),
  generated([{type:"tool-call",toolCallId:"save",toolName:"remember_memory",input:JSON.stringify({key:"preference",value:"INR"})}],"tool-calls"),
  generated([{type:"text",text:"Incorrectly claimed success"}],"stop"),
 ]});
 const memory=new MemorySession(manager,"chat_a",{runId:"run_a",runFence:1}).agent();
 const checkpoint=vi.fn();
 await expect(createMigrationMainAgent({alias:"model-1",mainModel:model,memory}).generate({
  prompt:"Remember my preference",abortSignal:controller.signal,
  onStepEnd:()=>{controller.signal.throwIfAborted();checkpoint();},
 })).rejects.toThrow();
 expect(controller.signal.aborted).toBe(true);
 expect(model.doGenerateCalls).toHaveLength(2);
 expect(checkpoint).toHaveBeenCalledTimes(1); // interpretation receipt only; failed memory step never checkpoints
 expect(requested).not.toContain("publish");
},15_000);
it("SQLite corruption with a valid manifest fails round-trip validation",async()=>{
 const runtime=await ChatMemoryRuntime.restore(null);
 await runtime.apply([{kind:"remember",key:"safe",value:"preserve",source:"chat_a"}]);
 const valid=await runtime.snapshot();
 const archive=JSON.parse(Buffer.from(valid,"base64").toString());
 const bytes=Buffer.alloc(4096);bytes.write("SQLite format 3\0");
 archive.sqlite=bytes.toString("base64");
 await expect(ChatMemoryRuntime.restore(Buffer.from(JSON.stringify(archive)).toString("base64"))).rejects.toThrow();
 expect(await (await ChatMemoryRuntime.restore(valid)).facts()).toEqual([{key:"safe",value:"preserve",sources:["chat_a"]}]);
},15_000);
