/// <reference types="vite/client" />
import agentTest from '@convex-dev/agent/test';
import betterAuthTest from '@convex-dev/better-auth/test';
import {convexTest} from 'convex-test';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {api,components,internal} from '../../convex/_generated/api';
import schema from '../../convex/schema';
const modules=import.meta.glob('../../convex/**/*.ts');
function setup(){const t=convexTest(schema,modules);agentTest.register(t);betterAuthTest.register(t);return t;}
async function account(t:ReturnType<typeof setup>,email='intent@example.com'){
  const now=Date.now();const user=await t.mutation(components.betterAuth.adapter.create,{input:{model:'user',data:{name:'Intent',email,emailVerified:false,createdAt:now,updatedAt:now}}});
  const session=await t.mutation(components.betterAuth.adapter.create,{input:{model:'session',data:{userId:user._id,token:crypto.randomUUID(),expiresAt:now+3600000,createdAt:now,updatedAt:now}}});
  return{ownerId:user._id,client:t.withIdentity({subject:user._id,sessionId:session._id})};
}
beforeEach(()=>{for(const[k,v]of Object.entries({PORTIA_ENABLED:'true',PORTIA_CONVEX_DEPLOYMENT:'brilliant-whale-380',CONVEX_SITE_URL:'https://brilliant-whale-380.convex.site',PORTIA_AUTH_MODE:'basic'}))vi.stubEnv(k,v);});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
const intent=()=>({requestId:crypto.randomUUID(),question:'航'.repeat(4000),modelAlias:'model-2' as const});

it('deduplicates concurrent creation and a lost-response retry without exposing prompt in sidebar',async()=>{
  const t=setup(),a=await account(t),initialIntent=intent();
  const ids=await Promise.all([a.client.mutation(api.migration.createConversation,{initialIntent}),a.client.mutation(api.migration.createConversation,{initialIntent})]);
  expect(ids[0]).toBe(ids[1]);
  expect(await a.client.mutation(api.migration.createConversation,{initialIntent})).toBe(ids[0]);
  const saved=await a.client.query(api.migration.getConversation,{conversationId:ids[0]});
  expect(saved?.conversation.initialIntent).toEqual(initialIntent);
  const list=await a.client.query(api.migration.listConversations,{paginationOpts:{cursor:null,numItems:20}});
  expect(list.page).toHaveLength(1);expect(JSON.stringify(list)).not.toContain('航');
  await expect(a.client.mutation(api.migration.createConversation,{initialIntent:{...initialIntent,question:'changed'}})).rejects.toThrow(/different input/);
});

it('binds first claim to saved intent; consumes atomically; retries after claim recover same conversation',async()=>{
  const t=setup(),a=await account(t),initialIntent=intent();
  const id=await a.client.mutation(api.migration.createConversation,{initialIntent});
  const args={ownerId:a.ownerId,conversationId:id,requestId:initialIntent.requestId,payloadHash:'same',question:initialIntent.question,modelAlias:initialIntent.modelAlias,expectedRevision:0};
  for(const patch of [{question:'other'},{modelAlias:'model-1' as const},{requestId:crypto.randomUUID()}])await expect(t.mutation(internal.migration.claimQuestion,{...args,...patch})).rejects.toThrow(/saved question/);
  expect((await a.client.query(api.migration.getConversation,{conversationId:id}))?.conversation.initialIntent).toEqual(initialIntent);
  const results=await Promise.all([t.mutation(internal.migration.claimQuestion,args),t.mutation(internal.migration.claimQuestion,args)]);
  expect(results[0].runId).toBe(results[1].runId);
  expect(results.filter(r=>r.replayed)).toHaveLength(1);
  expect((await a.client.query(api.migration.getConversation,{conversationId:id}))?.conversation.initialIntent).toBeUndefined();
  expect(await a.client.mutation(api.migration.createConversation,{initialIntent})).toBe(id);
});

it('keeps creation identifiers and intents owner scoped and preserves old empty creates',async()=>{
  const t=setup(),a=await account(t),b=await account(t,'other@example.com'),initialIntent=intent();
  const first=await a.client.mutation(api.migration.createConversation,{initialIntent});
  const other=await b.client.mutation(api.migration.createConversation,{initialIntent});expect(first).not.toBe(other);
  expect(await b.client.query(api.migration.getConversation,{conversationId:first})).toBeNull();
  const empty=await a.client.mutation(api.migration.createConversation,{});
  expect((await a.client.query(api.migration.getConversation,{conversationId:empty}))?.conversation.initialIntent).toBeUndefined();
});
