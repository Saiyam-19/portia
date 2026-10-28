
import {MockLanguageModelV4} from "ai/test";
import type {LanguageModelV4GenerateResult} from "@ai-sdk/provider";
import {afterEach,expect,it,vi} from "vitest";
import {MemorySession} from "../../src/lib/memory/session";
import {MigrationTokenManager} from "../../src/lib/migration/bridge";
import {createMigrationMainAgent} from "../../src/lib/migration/domain-agent";
import {ChatMemoryRuntime} from "../../src/lib/memory/runtime";
import type {WorkspaceResult} from "../../src/lib/memory/contracts";
const generated=(content:LanguageModelV4GenerateResult["content"],finish:"stop"|"tool-calls"):LanguageModelV4GenerateResult=>({
 content,finishReason:{unified:finish,raw:undefined},warnings:[],
 usage:{inputTokens:{total:1,noCache:1,cacheRead:undefined,cacheWrite:undefined},outputTokens:{total:1,text:1,reasoning:undefined}},
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});
it("a failed bash publication aborts the run before another provider call or checkpoint",async()=>{
 for(const [key,value] of Object.entries({PORTIA_ENABLED:"true",PORTIA_CONVEX_DEPLOYMENT:"brilliant-whale-380",NEXT_PUBLIC_CONVEX_URL:"https://brilliant-whale-380.convex.cloud",NEXT_PUBLIC_CONVEX_SITE_URL:"https://brilliant-whale-380.convex.site",PORTIA_SERVER_SECRET:"x".repeat(32),SITE_URL:"http://127.0.0.1:3022"}))vi.stubEnv(key,value);
 const controller=new AbortController();
 const manager=new MigrationTokenManager("synthetic","http://127.0.0.1:3022",controller);
 vi.spyOn(manager,"getToken").mockReturnValue("synthetic-jwt");
 const requested:string[]=[];
 vi.stubGlobal("fetch",vi.fn(async(_url,init)=>{
  const body=JSON.parse(String(init.body));requested.push(body.op);
  if(body.op==="workspaceAccept")return Response.json({code:"MEMORY_UNAVAILABLE"},{status:409});
  if(body.op==="workspaceReplay")return Response.json(null);
  if(body.op==="claim")return Response.json(null);
  return Response.json({epoch:0,revision:0,pending:false,blocked:false,image:null,scratchpad:"",scratchpadRevision:0});
 }));
 const model=new MockLanguageModelV4({doGenerate:[
  generated([{type:"tool-call",toolCallId:"save",toolName:"bash",input:JSON.stringify({command:"sqlite3 /memory/long_term.sqlite \"INSERT INTO facts VALUES ('preference','INR','[]');\""})}],"tool-calls"),
  generated([{type:"text",text:"Incorrectly claimed success"}],"stop"),
 ]});
 const session=new MemorySession(manager,"chat_a",{runId:"run_a",runFence:1});
 const workspace=await session.workspace();
 const checkpoint=vi.fn();
 await expect(createMigrationMainAgent({alias:"model-1",mainModel:model,memory:session.context(),workspace}).generate({
  prompt:"Remember my preference",abortSignal:controller.signal,
  onStepEnd:()=>{controller.signal.throwIfAborted();checkpoint();},
 })).rejects.toThrow();
 expect(controller.signal.aborted).toBe(true);
 expect(model.doGenerateCalls).toHaveLength(1);
 expect(checkpoint).not.toHaveBeenCalled();
 expect(requested).not.toContain("publish");
},15_000);
it("workspace shell errors recover, while failed publication aborts the shared run",async()=>{
 for(const [key,value] of Object.entries({PORTIA_ENABLED:"true",PORTIA_CONVEX_DEPLOYMENT:"brilliant-whale-380",NEXT_PUBLIC_CONVEX_URL:"https://brilliant-whale-380.convex.cloud",NEXT_PUBLIC_CONVEX_SITE_URL:"https://brilliant-whale-380.convex.site",PORTIA_SERVER_SECRET:"x".repeat(32),SITE_URL:"http://127.0.0.1:3022"}))vi.stubEnv(key,value);
 const controller=new AbortController(),manager=new MigrationTokenManager("synthetic","http://127.0.0.1:3022",controller);
 vi.spyOn(manager,"getToken").mockReturnValue("synthetic-jwt");
 const receipts=new Map<string,WorkspaceResult>();let fail=false;
 vi.stubGlobal("fetch",vi.fn(async(_url,init)=>{
  const body=JSON.parse(String(init.body));
  if(body.op==="claim")return Response.json(null);
  if(body.op==="workspaceReplay")return Response.json(receipts.has(body.args.toolCallId)?{status:"done",epoch:0,result:receipts.get(body.args.toolCallId)}:null);
  if(body.op==="workspaceAccept"){
   if(fail)return Response.json({code:"MEMORY_UNAVAILABLE"},{status:409});
   receipts.set(body.args.toolCallId,body.args.result);return Response.json({epoch:0});
  }
  return Response.json({epoch:0,revision:0,pending:false,blocked:false,image:null,scratchpad:"",scratchpadRevision:0});
 }));
 const workspace=await new MemorySession(manager,"chat_a",{runId:"run_a",runFence:1}).workspace();
 expect((await workspace.bash({command:"false"},"recoverable")).exitCode).toBe(1);
 expect(controller.signal.aborted).toBe(false);
 fail=true;
 await expect(workspace.bash({command:"printf progress > /scratchpad/current.md"},"fatal")).rejects.toThrow("WORKSPACE_PERSISTENCE_FAILED");
 expect(controller.signal.aborted).toBe(true);
 await expect(workspace.bash({command:"true"},"after-failure")).rejects.toThrow();
 const requests=vi.mocked(fetch).mock.calls.length;
 const temporaryController=new AbortController(),temporaryManager=new MigrationTokenManager("synthetic","http://127.0.0.1:3022",temporaryController);
 const ephemeral=new MemorySession(temporaryManager,"chat_b",{runId:"run_b",runFence:1},false);
 expect(await ephemeral.context().instructions()).toContain("memory is unavailable");
 const temporary=await ephemeral.workspace();
 expect((await temporary.bash({command:"head -c 20 /ports/mumbai/tariffs.md; printf kept > /work/progress"},"tariff")).exitCode).toBe(0);
 expect((await temporary.bash({command:"cat /work/progress"},"temp")).stdout).toBe("kept");
 await expect(temporary.bash({command:"printf unavailable > /scratchpad/current.md"},"disabled-save")).rejects.toThrow("WORKSPACE_PERSISTENCE_FAILED");
 expect(temporaryController.signal.aborted).toBe(true);
 expect(vi.mocked(fetch).mock.calls.length).toBe(requests);
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
