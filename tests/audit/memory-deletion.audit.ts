/// <reference types="vite/client" />
import agentTest from '@convex-dev/agent/test';
import { createThread } from '@convex-dev/agent';
import betterAuthTest from '@convex-dev/better-auth/test';
import { convexTest } from 'convex-test';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { api, components, internal } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import type {Id} from '../../convex/_generated/dataModel';
import {ChatMemoryRuntime} from '../../src/lib/memory/runtime';
import {enqueueMemory,MAX_PENDING_MEMORY_OPERATIONS} from '../../convex/lib/memoryLifecycle';
const modules = import.meta.glob('../../convex/**/*.ts');
function setup() { const t=convexTest(schema,modules);agentTest.register(t);betterAuthTest.register(t);return t; }
// Exercise the trusted queue machinery directly. The agent-facing mutation now
// requires exact approval; these fixtures intentionally isolate lifecycle limits.
async function seed(t:ReturnType<typeof setup>,args:{ownerId:string;runId:Id<"migrationRuns">;runFence:number;requestId:string;expectedEpoch:number;operation:import("../../src/lib/memory/contracts").MemoryOperation}) {
 return t.run(async ctx=>enqueueMemory(ctx,args.ownerId,args.requestId,args.expectedEpoch,args.operation,(await ctx.db.get(args.runId))!));
}
async function account(t:ReturnType<typeof setup>) {
  const now=Date.now();
  const user=await t.mutation(components.betterAuth.adapter.create,{input:{model:'user',data:{name:'Audit',email:'audit@example.com',emailVerified:false,createdAt:now,updatedAt:now}}});
  const session=await t.mutation(components.betterAuth.adapter.create,{input:{model:'session',data:{userId:user._id,token:crypto.randomUUID(),expiresAt:now+3600000,createdAt:now,updatedAt:now}}});
  return {ownerId:user._id,client:t.withIdentity({subject:user._id,sessionId:session._id})};
}
beforeEach(()=>{for(const [key,value] of Object.entries({PORTIA_ENABLED:'true',PORTIA_CONVEX_DEPLOYMENT:'brilliant-whale-380',CONVEX_SITE_URL:'https://brilliant-whale-380.convex.site',PORTIA_AUTH_MODE:'basic',PORTIA_MEMORY_ENABLED:'true'}))vi.stubEnv(key,value);});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});

it('preserves unrelated working notes when deleting an empty chat',async()=>{
  const t=setup(),a=await account(t);
  const run=await t.mutation(internal.migration.claimQuestion,{ownerId:a.ownerId,conversationId:null,requestId:'a',payloadHash:'a',question:'Keep progress',modelAlias:'model-1',expectedRevision:null});
  await t.mutation(internal.memory.writeNotes,{ownerId:a.ownerId,runId:run.runId,runFence:run.fence,expectedEpoch:0,requestId:'note',markdown:'Independent chat progress'});
  const empty=await a.client.mutation(api.migration.createConversation,{});
  await a.client.mutation(api.migration.deleteConversation,{conversationId:empty});
  const state=await t.mutation(internal.memory.open,{ownerId:a.ownerId,conversationId:run.conversationId});
  expect(state.scratchpad).toBe('Independent chat progress');
});

it('does not fence an independent active run after empty-chat deletion',async()=>{
  const t=setup(),a=await account(t);
  const run=await t.mutation(internal.migration.claimQuestion,{ownerId:a.ownerId,conversationId:null,requestId:'a',payloadHash:'a',question:'Keep running',modelAlias:'model-1',expectedRevision:null});
  const empty=await a.client.mutation(api.migration.createConversation,{});
  await a.client.mutation(api.migration.deleteConversation,{conversationId:empty});
  await expect(t.mutation(internal.migration.completeRun,{ownerId:a.ownerId,runId:run.runId,fence:run.fence,responseMessages:[{role:'assistant',content:'Independent result'}],form:null,finishReason:'stop'})).resolves.toBeDefined();
});

it.each(['true','false'])('deletion revokes root under saturated memory queue (enabled=%s)',async enabled=>{
  const t=setup(),a=await account(t);
  const id=await a.client.mutation(api.migration.createConversation,{});
  await t.mutation(internal.memory.open,{ownerId:a.ownerId});
  for(let i=0;i<96;i++)await t.mutation(internal.memory.enqueue,{ownerId:a.ownerId,requestId:'clear-'+i,expectedEpoch:i,operation:{kind:'clear'}});
  vi.stubEnv('PORTIA_MEMORY_ENABLED',enabled);
  const result=await a.client.mutation(api.migration.deleteConversation,{conversationId:id}).then(()=>({deleted:true}),error=>({deleted:false,error:String(error)}));
  expect(result).toEqual({deleted:true});
  expect(await a.client.query(api.migration.getConversation,{conversationId:id})).toBeNull();
});

async function claim(t:ReturnType<typeof setup>,ownerId:string,id:string){return t.mutation(internal.migration.claimQuestion,{ownerId,conversationId:null,requestId:id,payloadHash:id,question:'Memory fixture',modelAlias:'model-1',expectedRevision:null});}
async function drain(t:ReturnType<typeof setup>,ownerId:string){
  for(let i=0;i<50;i++){
    const job=await t.mutation(internal.memory.claim,{ownerId});if(!job)return;
    const runtime=await ChatMemoryRuntime.restore(job.image);await runtime.apply(job.operations);
    await t.mutation(internal.memory.publish,{ownerId,token:job.token,fence:job.fence,epoch:job.epoch,baseRevision:job.baseRevision,through:job.through,image:await runtime.snapshot()});
  }
  throw new Error('Memory did not drain');
}

it.each(['true','false'])('admits an effective source deletion at queue96, fences old writer and eventually purges (enabled=%s)',async enabled=>{
  const t=setup(),a=await account(t),run=await claim(t,a.ownerId,'source');
  await seed(t,{ownerId:a.ownerId,runId:run.runId,runFence:run.fence,requestId:'secret',expectedEpoch:0,operation:{kind:'remember',key:'private',value:'DELETE_ME',source:run.conversationId}});
  for(let i=0;i<95;i++)await t.mutation(internal.memory.enqueue,{ownerId:a.ownerId,requestId:'barrier-'+i,expectedEpoch:i,operation:{kind:'forget',key:'absent_'+i}});
  const stale=(await t.mutation(internal.memory.claim,{ownerId:a.ownerId}))!;
  vi.stubEnv('PORTIA_MEMORY_ENABLED',enabled);
  await a.client.mutation(api.migration.deleteConversation,{conversationId:run.conversationId});
  expect(await a.client.query(api.migration.getConversation,{conversationId:run.conversationId})).toBeNull();
  vi.stubEnv('PORTIA_MEMORY_ENABLED','true');
  expect(await t.mutation(internal.memory.open,{ownerId:a.ownerId})).toMatchObject({blocked:true,image:null});
  await expect(t.mutation(internal.memory.publish,{ownerId:a.ownerId,token:stale.token,fence:stale.fence,epoch:stale.epoch,baseRevision:stale.baseRevision,through:stale.through,image:'e30='})).rejects.toThrow('STALE_WRITER');
  await drain(t,a.ownerId);
  const state=await t.mutation(internal.memory.open,{ownerId:a.ownerId});expect(state.blocked).toBe(false);
  expect(await(await ChatMemoryRuntime.restore(state.image)).facts()).toEqual([]);
},30_000);

it.each([false,true])('detects source overwritten in projection, including queued-only provenance (applied=%s)',async applied=>{
  const t=setup(),a=await account(t),first=await claim(t,a.ownerId,'first'),second=await claim(t,a.ownerId,'second');
  await seed(t,{ownerId:a.ownerId,runId:first.runId,runFence:first.fence,requestId:'first-fact',expectedEpoch:0,operation:{kind:'remember',key:'shared',value:'old private',source:first.conversationId}});
  if(applied)await drain(t,a.ownerId);
  await seed(t,{ownerId:a.ownerId,runId:second.runId,runFence:second.fence,requestId:'replacement',expectedEpoch:0,operation:{kind:'remember',key:'shared',value:'new retained',source:second.conversationId}});
  await a.client.mutation(api.migration.deleteConversation,{conversationId:first.conversationId});
  expect(await t.mutation(internal.memory.open,{ownerId:a.ownerId})).toMatchObject({epoch:1,blocked:true,image:null});
  await drain(t,a.ownerId);
  const state=await t.mutation(internal.memory.open,{ownerId:a.ownerId});expect(await(await ChatMemoryRuntime.restore(state.image)).facts()).toEqual([{key:'shared',value:'new retained',sources:[second.conversationId]}]);
},15_000);

it('rejects externally supplied source deletion and retains ordinary queue quotas',async()=>{
  const t=setup(),a=await account(t),run=await claim(t,a.ownerId,'quota');
  await expect(t.mutation(internal.memory.enqueue,{ownerId:a.ownerId,requestId:'forged',expectedEpoch:0,operation:{kind:'delete_source',source:run.conversationId}})).rejects.toThrow('INVALID_OPERATION');
  for(let i=0;i<32;i++)await seed(t,{ownerId:a.ownerId,runId:run.runId,runFence:run.fence,requestId:'r'+i,expectedEpoch:0,operation:{kind:'remember',key:'key'+i,value:'value',source:run.conversationId}});
  await expect(seed(t,{ownerId:a.ownerId,runId:run.runId,runFence:run.fence,requestId:'overflow',expectedEpoch:0,operation:{kind:'remember',key:'extra',value:'value',source:run.conversationId}})).rejects.toThrow('MEMORY_BUSY');
});

it('keeps worst-case trusted deletion admission within640 queued operations',async()=>{
  const t=setup(),a=await account(t);await t.mutation(internal.memory.open,{ownerId:a.ownerId});
  // Seed valid-sized index metadata to isolate the queue bound without512 paid/agent runs.
  const ids=await t.run(async ctx=>{
    const ids:Id<'migrationConversations'>[]=[];for(let i=0;i<544;i++){
      const agentThreadId=await createThread(ctx,components.agent,{userId:a.ownerId});
      ids.push(await ctx.db.insert('migrationConversations',{ownerId:a.ownerId,title:'Source',agentThreadId,revision:0,nextFence:1,state:'idle',updatedAt:Date.now()}));
    }
    const ns=(await ctx.db.query('memoryNamespaces').withIndex('by_owner',q=>q.eq('ownerId',a.ownerId)).unique())!;
    const applied=Array.from({length:64},(_,i)=>({key:'key'+i,hash:'old',sources:ids.slice(i*8,i*8+8)}));
    const projected=applied.map((f,i)=>i<32?{...f,hash:'new',sources:[ids[512+i]]}:f);
    await ctx.db.patch(ns._id,{appliedIndex:applied,factIndex:projected,nextSequence:96,epoch:64,blockedThrough:96});
    for(let i=0;i<96;i++)await ctx.db.insert('memoryOperations',{namespaceId:ns._id,requestId:'fixture'+i,hash:'fixture',sequence:i+1,epoch:Math.max(0,i-31),status:'pending',operation:i<32?{kind:'remember',key:'key'+i,value:'new',source:ids[512+i]}:{kind:'forget',key:'absent'+i}});
    return ids;
  });
  for(const id of ids)await a.client.mutation(api.migration.deleteConversation,{conversationId:id});
  const ns=await t.run(ctx=>ctx.db.query('memoryNamespaces').withIndex('by_owner',q=>q.eq('ownerId',a.ownerId)).unique());
  expect(ns!.nextSequence-ns!.appliedSequence).toBe(MAX_PENDING_MEMORY_OPERATIONS);
  await expect(a.client.mutation(api.migration.deleteConversation,{conversationId:ids[0]})).rejects.toThrow();
  const untouched=await a.client.mutation(api.migration.createConversation,{});
  await expect(a.client.mutation(api.migration.deleteConversation,{conversationId:untouched})).resolves.toBeNull();
},30_000);

it('retains deletion admission and ordinary quotas across partial drains and refilling',async()=>{
  const t=setup(),a=await account(t),source=await claim(t,a.ownerId,'partial-source');
  await seed(t,{ownerId:a.ownerId,runId:source.runId,runFence:source.fence,requestId:'private',expectedEpoch:0,operation:{kind:'remember',key:'private',value:'OLD_SNAPSHOT',source:source.conversationId}});
  for(let i=0;i<95;i++)await t.mutation(internal.memory.enqueue,{ownerId:a.ownerId,requestId:'old'+i,expectedEpoch:i,operation:{kind:'forget',key:'absent'+i}});
  const job=(await t.mutation(internal.memory.claim,{ownerId:a.ownerId}))!;
  const runtime=await ChatMemoryRuntime.restore(job.image);await runtime.apply(job.operations);
  await t.mutation(internal.memory.publish,{ownerId:a.ownerId,token:job.token,fence:job.fence,epoch:job.epoch,baseRevision:job.baseRevision,through:job.through,image:await runtime.snapshot()});
  const other=await claim(t,a.ownerId,'partial-other');
  await expect(seed(t,{ownerId:a.ownerId,runId:other.runId,runFence:other.fence,requestId:'blocked',expectedEpoch:95,operation:{kind:'remember',key:'new',value:'value',source:other.conversationId}})).rejects.toThrow('MEMORY_BUSY');
  for(let i=0;i<16;i++)await t.mutation(internal.memory.enqueue,{ownerId:a.ownerId,requestId:'refill'+i,expectedEpoch:95+i,operation:{kind:'forget',key:'missing'+i}});
  await a.client.mutation(api.migration.deleteConversation,{conversationId:source.conversationId});
  expect(await t.mutation(internal.memory.open,{ownerId:a.ownerId})).toMatchObject({blocked:true,image:null});
  await drain(t,a.ownerId);const state=await t.mutation(internal.memory.open,{ownerId:a.ownerId});
  expect(state.blocked).toBe(false);expect(await(await ChatMemoryRuntime.restore(state.image)).facts()).toEqual([]);
},30_000);
