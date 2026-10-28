/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import betterAuthTest from "@convex-dev/better-auth/test";
import {convexTest} from "convex-test";
import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {api,components,internal} from "../../convex/_generated/api";
import schema from "../../convex/schema";
import {ChatMemoryRuntime} from "../../src/lib/memory/runtime";
const modules=import.meta.glob("../../convex/**/*.ts");
function setup(){const t=convexTest(schema,modules);agentTest.register(t);betterAuthTest.register(t);return t;}
async function account(t:ReturnType<typeof setup>,email:string){
  const now=Date.now();
  const user=await t.mutation(components.betterAuth.adapter.create,{input:{model:"user",data:{name:"Synthetic account",email,emailVerified:false,createdAt:now,updatedAt:now}}});
  const session=await t.mutation(components.betterAuth.adapter.create,{input:{model:"session",data:{userId:user._id,token:crypto.randomUUID(),expiresAt:now+3600000,createdAt:now,updatedAt:now}}});
  return {ownerId:user._id,client:t.withIdentity({subject:user._id,sessionId:session._id})};
}
async function claim(t:ReturnType<typeof setup>,ownerId:string,id:string){
  return t.mutation(internal.migration.claimQuestion,{ownerId,conversationId:null,requestId:id,payloadHash:id,question:"Synthetic memory test",modelAlias:"model-1",expectedRevision:null});
}
async function publishMemory(t:ReturnType<typeof setup>,ownerId:string) {
  const job=(await t.mutation(internal.memory.claim,{ownerId}))!;
  const runtime=await ChatMemoryRuntime.restore(job.image);await runtime.apply(job.operations);
  await t.mutation(internal.memory.publish,{ownerId,token:job.token,fence:job.fence,epoch:job.epoch,baseRevision:job.baseRevision,through:job.through,image:await runtime.snapshot()});
  return job;
}
beforeEach(()=>{vi.stubEnv("MIGRATION_DEV_ENABLED","true");vi.stubEnv("PORTIA_CONVEX_DEPLOYMENT","brilliant-whale-380");vi.stubEnv("CONVEX_SITE_URL","https://brilliant-whale-380.convex.site");vi.stubEnv("PORTIA_AUTH_MODE","basic");vi.stubEnv("PORTIA_MEMORY_ENABLED","true");});
afterEach(()=>vi.unstubAllEnvs());
it("keeps a deletion barrier closed across batches and rejects the stale run",async()=>{
  const t=setup();const a=await account(t,"a@example.com");
  const run=await claim(t,a.ownerId,"a"),other=await claim(t,a.ownerId,"other");
  for(let i=0;i<17;i++)await t.mutation(internal.memory.enqueue,{ownerId:a.ownerId,runId:run.runId,runFence:run.fence,requestId:"put"+i,expectedEpoch:0,operation:{kind:"remember",key:"key"+i,value:"value"+i,source:run.conversationId}});
  const stale=(await t.mutation(internal.memory.claim,{ownerId:a.ownerId}))!;
  await t.mutation(internal.memory.enqueue,{ownerId:a.ownerId,runId:run.runId,runFence:run.fence,requestId:"forget",expectedEpoch:0,operation:{kind:"forget",key:"key0"}});
  const publish=async(item:typeof stale)=>{
    const runtime=await ChatMemoryRuntime.restore(item.image);await runtime.apply(item.operations);
    return t.mutation(internal.memory.publish,{ownerId:a.ownerId,token:item.token,fence:item.fence,epoch:item.epoch,baseRevision:item.baseRevision,through:item.through,image:await runtime.snapshot()});
  };
  await expect(publish(stale)).rejects.toThrow("STALE_WRITER");
  const first=(await t.mutation(internal.memory.claim,{ownerId:a.ownerId}))!;
  await publish(first);
  expect(await t.mutation(internal.memory.open,{ownerId:a.ownerId})).toMatchObject({blocked:true,image:null,pending:true});
  await expect(t.mutation(internal.memory.open,{ownerId:a.ownerId,runId:other.runId,runFence:other.fence})).rejects.toThrow("MEMORY_CHANGED");
  await expect(t.mutation(internal.migration.completeRun,{ownerId:a.ownerId,runId:other.runId,fence:other.fence,responseMessages:[{role:"assistant",content:"Late secret"}],form:null,finishReason:"stop"})).rejects.toThrow("MEMORY_CHANGED");
  const second=(await t.mutation(internal.memory.claim,{ownerId:a.ownerId}))!;
  expect(second.operations.at(-1)).toEqual({kind:"forget",key:"key0"});
  await publish(second);
  expect(await t.mutation(internal.memory.open,{ownerId:a.ownerId})).toMatchObject({blocked:false,pending:false});
  await expect(t.mutation(internal.memory.enqueue,{ownerId:a.ownerId,runId:run.runId,runFence:run.fence,requestId:"explicit-new-save",expectedEpoch:1,operation:{kind:"remember",key:"key0",value:"New explicit value",source:run.conversationId}})).resolves.toMatchObject({epoch:1});
},30_000);
it("isolates notes and makes chat deletion remove notes plus source-derived memory",async()=>{
  const t=setup();const a=await account(t,"a@example.com"),b=await account(t,"b@example.com");
  const run=await claim(t,a.ownerId,"a"),second=await claim(t,a.ownerId,"a2");
  await t.mutation(internal.memory.writeNotes,{ownerId:a.ownerId,runId:run.runId,runFence:run.fence,expectedEpoch:0,requestId:"notes",markdown:"PRIVATE_NOTES"});
  await t.mutation(internal.memory.workspaceAccept,{ownerId:a.ownerId,runId:run.runId,runFence:run.fence,toolCallId:"private-output",commandHash:"a".repeat(64),expectedEpoch:0,baseRevision:0,baseScratchpadRevision:1,operations:[],result:{stdout:"PRIVATE_OUTPUT",stderr:"",exitCode:0}});
  expect(await t.mutation(internal.memory.open,{ownerId:a.ownerId,conversationId:second.conversationId})).toMatchObject({scratchpad:""});
  await expect(t.mutation(internal.memory.open,{ownerId:b.ownerId,conversationId:run.conversationId})).rejects.toThrow("NOT_FOUND");
  await expect(t.mutation(internal.memory.writeNotes,{ownerId:b.ownerId,runId:run.runId,runFence:run.fence,expectedEpoch:0,requestId:"evil",markdown:"cross-user"})).rejects.toThrow("NOT_FOUND");
  await t.mutation(internal.memory.enqueue,{ownerId:a.ownerId,runId:run.runId,runFence:run.fence,expectedEpoch:0,requestId:"remember",operation:{kind:"remember",key:"call_sign",value:"NORTHSTAR",source:run.conversationId}});
  await a.client.mutation(api.migration.deleteConversation,{conversationId:run.conversationId});
  const state=await t.query(internal.memory.inspect,{ownerId:a.ownerId});
  expect(state).toMatchObject({blocked:true,notes:0,noteReceipts:0,epoch:1});
  await expect(t.mutation(internal.memory.workspaceReplay,{ownerId:a.ownerId,runId:run.runId,runFence:run.fence,toolCallId:"private-output",commandHash:"a".repeat(64)})).rejects.toThrow("NOT_FOUND");
  await expect(t.mutation(internal.memory.writeNotes,{ownerId:a.ownerId,runId:run.runId,runFence:run.fence,expectedEpoch:0,requestId:"late",markdown:"resurrection"})).rejects.toThrow();
  const job=(await t.mutation(internal.memory.claim,{ownerId:a.ownerId}))!;
  expect(job.operations.at(-1)).toEqual({kind:"delete_source",source:run.conversationId});
});
it("removes only deleted-source provenance and securely restores remaining SQLite facts",async()=>{
  const runtime=await ChatMemoryRuntime.restore(null);
  const marker="DELETED_MEMORY_67243";
  await runtime.apply([{kind:"remember",key:"shared",value:"Both chats support this",source:"a"},{kind:"remember",key:"shared",value:"Both chats support this",source:"b"},{kind:"remember",key:"private",value:marker,source:"a"}]);
  await runtime.apply([{kind:"delete_source",source:"a"}]);
  const image=await runtime.snapshot();
  const restored=await ChatMemoryRuntime.restore(image);
  expect(await restored.facts()).toEqual([{key:"shared",value:"Both chats support this",sources:["b"]}]);
  const archive=JSON.parse(Buffer.from(image,"base64").toString());
  expect(Buffer.from(archive.sqlite,"base64").includes(Buffer.from(marker))).toBe(false);
  expect(archive.summary).not.toContain(marker);
},15_000);
it("rejects client-chosen memory source, oversized values and stale note epochs",async()=>{
  const t=setup();const run=await claim(t,"owner","first");
  await expect(t.mutation(internal.memory.enqueue,{ownerId:"owner",runId:run.runId,runFence:run.fence,requestId:"bad",expectedEpoch:0,operation:{kind:"remember",key:"note",value:"valid",source:"another-chat"}})).rejects.toThrow("RUN_REQUIRED");
  await expect(t.mutation(internal.memory.enqueue,{ownerId:"owner",runId:run.runId,runFence:run.fence,requestId:"big",expectedEpoch:0,operation:{kind:"remember",key:"note",value:"x".repeat(1025),source:run.conversationId}})).rejects.toThrow("INVALID_MEMORY");
  await expect(t.mutation(internal.memory.workspaceAccept,{ownerId:"owner",runId:run.runId,runFence:run.fence,toolCallId:"forged",commandHash:"a".repeat(64),expectedEpoch:0,baseRevision:0,baseScratchpadRevision:0,operations:[{kind:"remember",key:"note",value:"valid",source:"another-chat"}],result:{stdout:"",stderr:"",exitCode:0}})).rejects.toThrow("INVALID_OPERATION");
  await t.mutation(internal.memory.enqueue,{ownerId:"owner",requestId:"clear",expectedEpoch:0,operation:{kind:"clear"}});
  await expect(t.mutation(internal.memory.writeNotes,{ownerId:"owner",runId:run.runId,runFence:run.fence,expectedEpoch:0,requestId:"late",markdown:"old context"})).rejects.toThrow("MEMORY_CHANGED");
});

it("replays a completed deletion before checking its former epoch",async()=>{
  const t=setup();await t.mutation(internal.memory.open,{ownerId:"owner"});
  const request={ownerId:"owner",requestId:"clear-once",expectedEpoch:0,operation:{kind:"clear" as const}};
  const first=await t.mutation(internal.memory.enqueue,request);
  expect(await t.mutation(internal.memory.enqueue,request)).toEqual(first);
  expect((await t.query(internal.memory.inspect,{ownerId:"owner"})).epoch).toBe(1);
  await expect(t.mutation(internal.memory.enqueue,{...request,operation:{kind:"forget",key:"changed"}})).rejects.toThrow("MEMORY_REPLAY_CONFLICT");
});
it("out-of-order scratchpad retry cannot replace newer notes",async()=>{
  const t=setup();const run=await claim(t,"owner","run");
  const base={ownerId:"owner",runId:run.runId,runFence:run.fence,expectedEpoch:0};
  const old={...base,requestId:"old",markdown:"Old notes"};
  await t.mutation(internal.memory.writeNotes,old);
  await t.mutation(internal.memory.writeNotes,{...base,requestId:"new",markdown:"New notes"});
  expect(await t.mutation(internal.memory.writeNotes,old)).toEqual({revision:1});
  expect(await t.mutation(internal.memory.open,{ownerId:"owner",conversationId:run.conversationId})).toMatchObject({scratchpad:"New notes",scratchpadRevision:2});
});
it("rejects a corrupt snapshot without replacing the current version",async()=>{
  const t=setup();const run=await claim(t,"owner","corruption");
  await t.mutation(internal.memory.enqueue,{ownerId:"owner",runId:run.runId,runFence:run.fence,expectedEpoch:0,requestId:"first",operation:{kind:"remember",key:"safe",value:"keep",source:run.conversationId}});
  const job=(await t.mutation(internal.memory.claim,{ownerId:"owner"}))!;
  const args={ownerId:"owner",token:job.token,fence:job.fence,epoch:job.epoch,baseRevision:job.baseRevision,through:job.through};
  await expect(t.mutation(internal.memory.publish,{...args,image:"e30="})).rejects.toThrow("INVALID_SNAPSHOT");
  expect(await t.mutation(internal.memory.open,{ownerId:"owner"})).toMatchObject({revision:0,image:null,pending:true});
  const runtime=await ChatMemoryRuntime.restore(null);await runtime.apply(job.operations);
  const image=await runtime.snapshot(),archive=JSON.parse(Buffer.from(image,"base64").toString());
  archive.facts[0].sources=[{}];
  await expect(ChatMemoryRuntime.restore(Buffer.from(JSON.stringify(archive)).toString("base64"))).rejects.toThrow("INVALID_MEMORY");
  archive.facts[0].sources=[run.conversationId];archive.facts[0].value="wrong";
  await expect(t.mutation(internal.memory.publish,{...args,image:Buffer.from(JSON.stringify(archive)).toString("base64")})).rejects.toThrow();
  await t.mutation(internal.memory.publish,{...args,image});
  expect(await t.mutation(internal.memory.open,{ownerId:"owner"})).toMatchObject({revision:1,pending:false});
},15_000);

it("publishes facts, notes and durable workspace receipts as one envelope",async()=>{
  const t=setup(),ownerId="workspace-owner",run=await claim(t,ownerId,"workspace"),other=await claim(t,ownerId,"other-workspace");
  const base={ownerId,runId:run.runId,runFence:run.fence,toolCallId:"batch",commandHash:"a".repeat(64),expectedEpoch:0,baseRevision:0,baseScratchpadRevision:0};
  const lookup={ownerId,runId:run.runId,runFence:run.fence,toolCallId:base.toolCallId,commandHash:base.commandHash};
  const request={...base,operations:[{kind:"remember" as const,key:"alpha",value:"one",source:run.conversationId},{kind:"remember" as const,key:"beta",value:"two",source:run.conversationId}],markdown:"Both facts committed",result:{stdout:"Saved",stderr:"",exitCode:0}};
  const accepted=await t.mutation(internal.memory.workspaceAccept,request);
  expect(accepted).toMatchObject({status:"pending",sequence:1});
  expect(await t.mutation(internal.memory.workspaceAccept,request)).toEqual(accepted);
  expect(await t.mutation(internal.memory.workspaceReplay,lookup)).toMatchObject({status:"pending"});
  await expect(t.mutation(internal.memory.workspaceAccept,{...request,result:{...request.result,stdout:"changed payload"}})).rejects.toThrow("MEMORY_REPLAY_CONFLICT");
  await expect(t.mutation(internal.memory.workspaceReplay,{...lookup,commandHash:"b".repeat(64)})).rejects.toThrow("MEMORY_REPLAY_CONFLICT");
  await expect(t.mutation(internal.memory.workspaceAccept,{...request,runId:other.runId,runFence:other.fence,toolCallId:"race",operations:[]})).rejects.toThrow("MEMORY_BUSY");
  await expect(t.mutation(internal.memory.writeNotes,{ownerId,runId:run.runId,runFence:run.fence,expectedEpoch:0,requestId:"racing-notes",markdown:"Lost update"})).rejects.toThrow("MEMORY_BUSY");
  expect(await t.mutation(internal.memory.open,{ownerId,conversationId:run.conversationId})).toMatchObject({pending:true,revision:0,scratchpad:""});
  const stale=(await t.mutation(internal.memory.claim,{ownerId}))!;
  await t.run(async ctx=>{
    const ns=(await ctx.db.query("memoryNamespaces").withIndex("by_owner",q=>q.eq("ownerId",ownerId)).unique())!;
    await ctx.db.patch(ns._id,{lease:{...ns.lease!,expiresAt:Date.now()-1}});
  });
  const staleRuntime=await ChatMemoryRuntime.restore(stale.image);await staleRuntime.apply(stale.operations);
  const job=(await t.mutation(internal.memory.claim,{ownerId}))!;
  await expect(t.mutation(internal.memory.publish,{ownerId,token:stale.token,fence:stale.fence,epoch:stale.epoch,baseRevision:stale.baseRevision,through:stale.through,image:await staleRuntime.snapshot()})).rejects.toThrow("STALE_WRITER");
  expect(job.operations).toHaveLength(2);
  const runtime=await ChatMemoryRuntime.restore(job.image);await runtime.apply(job.operations);
  await t.mutation(internal.memory.publish,{ownerId,token:job.token,fence:job.fence,epoch:job.epoch,baseRevision:job.baseRevision,through:job.through,image:await runtime.snapshot()});
  const state=await t.mutation(internal.memory.open,{ownerId,conversationId:run.conversationId});
  expect(state).toMatchObject({revision:1,pending:false,scratchpad:"Both facts committed",scratchpadRevision:1});
  expect((await (await ChatMemoryRuntime.restore(state.image)).facts()).map(f=>f.key)).toEqual(["alpha","beta"]);
  expect(await t.mutation(internal.memory.workspaceReplay,lookup)).toMatchObject({status:"done",result:request.result});
  const read={...base,toolCallId:"read",baseRevision:1,baseScratchpadRevision:1,operations:[],result:{stdout:"one",stderr:"",exitCode:0}};
  expect(await t.mutation(internal.memory.workspaceAccept,read)).toMatchObject({status:"done",sequence:null});
  expect(await t.mutation(internal.memory.claim,{ownerId})).toBeNull();
  await expect(t.mutation(internal.memory.workspaceAccept,{...read,toolCallId:"old-notes",baseScratchpadRevision:0})).rejects.toThrow("MEMORY_BUSY");
  await expect(t.mutation(internal.memory.workspaceAccept,{...read,toolCallId:"old-revision",baseRevision:0})).rejects.toThrow("MEMORY_BUSY");
  await expect(t.mutation(internal.memory.workspaceAccept,{...read,toolCallId:"old-fence",runFence:run.fence+1})).rejects.toThrow("STALE_RUN");
  await t.mutation(internal.memory.workspaceAccept,{...read,toolCallId:"accepted-notes",markdown:"Accepted before cancellation"});
  await t.run(ctx=>ctx.db.patch(run.runId,{status:"cancelled"}));
  await publishMemory(t,ownerId);
  expect(await t.mutation(internal.memory.open,{ownerId,conversationId:run.conversationId})).toMatchObject({scratchpad:"Accepted before cancellation",pending:false});
},30_000);

it("privacy barriers invalidate queued notes and pending or completed workspace output",async()=>{
  const t=setup(),ownerId="privacy-owner",run=await claim(t,ownerId,"privacy");
  const base={ownerId,runId:run.runId,runFence:run.fence,toolCallId:"private",commandHash:"a".repeat(64),expectedEpoch:0,baseRevision:0,baseScratchpadRevision:0};
  const lookup={ownerId,runId:run.runId,runFence:run.fence,toolCallId:base.toolCallId,commandHash:base.commandHash};
  await t.mutation(internal.memory.workspaceAccept,{...base,operations:[{kind:"remember",key:"secret",value:"OLD_VALUE",source:run.conversationId}],markdown:"OLD_NOTES",result:{stdout:"OLD_OUTPUT",stderr:"",exitCode:0}});
  await t.mutation(internal.memory.claim,{ownerId});
  await t.mutation(internal.memory.enqueue,{ownerId,runId:run.runId,runFence:run.fence,requestId:"clear",expectedEpoch:0,operation:{kind:"clear"}});
  await expect(t.mutation(internal.memory.workspaceReplay,lookup)).rejects.toThrow("MEMORY_CHANGED");
  const queued=await t.run(ctx=>ctx.db.query("memoryOperations").withIndex("by_namespace_and_status_and_sequence").take(16));
  expect(queued.find(row=>row.workspace)?.workspace?.markdown).toBeUndefined();
  await publishMemory(t,ownerId);
  const state=await t.mutation(internal.memory.open,{ownerId,conversationId:run.conversationId});
  expect(state).toMatchObject({epoch:1,scratchpad:"",pending:false});
  expect(await (await ChatMemoryRuntime.restore(state.image)).facts()).toEqual([]);
  await t.mutation(internal.memory.redactWorkspaceReceipts,{ownerId,epoch:1});
  const invalidated=await t.run(ctx=>ctx.db.query("workspaceReceipts").withIndex("by_run",q=>q.eq("runId",run.runId)).unique());
  expect(invalidated?.status).toBe("invalidated");expect(invalidated?.result).toBeUndefined();
  const fresh={...base,toolCallId:"fresh",expectedEpoch:1,baseRevision:1,operations:[],result:{stdout:"NEW_OUTPUT",stderr:"",exitCode:0}};
  await t.mutation(internal.memory.workspaceAccept,fresh);
  await t.mutation(internal.memory.enqueue,{ownerId,runId:run.runId,runFence:run.fence,requestId:"forget",expectedEpoch:1,operation:{kind:"forget",key:"secret"}});
  await expect(t.mutation(internal.memory.workspaceReplay,{...lookup,toolCallId:"fresh"})).rejects.toThrow("MEMORY_CHANGED");
  await publishMemory(t,ownerId);
  expect(await t.mutation(internal.memory.open,{ownerId,runId:run.runId,runFence:run.fence})).toMatchObject({epoch:2,scratchpad:"",pending:false});
},30_000);
