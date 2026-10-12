/// <reference types="vite/client" />
import agentTest from '@convex-dev/agent/test';
import betterAuthTest from '@convex-dev/better-auth/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, components, internal } from '../../convex/_generated/api';
import schema from '../../convex/schema';
const modules = import.meta.glob('../../convex/**/*.ts');
function setup() { const t = convexTest(schema, modules); agentTest.register(t); betterAuthTest.register(t); return t; }
async function account(t: ReturnType<typeof setup>, email: string) {
  const now = Date.now();
  const user = await t.mutation(components.betterAuth.adapter.create, { input: { model: 'user', data: { name: 'Test account', email, emailVerified: false, createdAt: now, updatedAt: now } } });
  const session = await t.mutation(components.betterAuth.adapter.create, { input: { model: 'session', data: { userId: user._id, token: crypto.randomUUID(), expiresAt: now + 3600000, createdAt: now, updatedAt: now } } });
  return { userId: user._id, client: t.withIdentity({ subject: user._id, sessionId: session._id }) };
}
async function run(t: ReturnType<typeof setup>, ownerId: string, requestId: string) {
  return t.mutation(internal.migration.claimQuestion, { ownerId, conversationId: null, requestId, payloadHash: requestId, question: 'Test request', modelAlias: 'model-1', expectedRevision: null });
}
beforeEach(() => { vi.stubEnv('MIGRATION_DEV_ENABLED','true'); vi.stubEnv('PORTIA_CONVEX_DEPLOYMENT','brilliant-whale-380'); vi.stubEnv('CONVEX_SITE_URL','https://brilliant-whale-380.convex.site'); vi.stubEnv('PORTIA_AUTH_MODE','basic'); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe('normal conversation lifecycle', () => {
  it('protects create/delete/read by live owner; deletion fences the running response', async () => {
    const t = setup(); const a = await account(t,'a@example.com'); const b = await account(t,'b@example.com');
    await expect(t.mutation(api.migration.createConversation,{})).rejects.toThrow(/Sign in/);
    const id = await a.client.mutation(api.migration.createConversation,{});
    expect(await b.client.query(api.migration.getConversation,{conversationId:id})).toBeNull();
    await expect(b.client.mutation(api.migration.deleteConversation,{conversationId:id})).rejects.toThrow(/not found/);
    const claimed = await t.mutation(internal.migration.claimQuestion,{ownerId:a.userId,conversationId:id,requestId:'first',payloadHash:'first',question:'Calculate',modelAlias:'model-1',expectedRevision:0});
    const history = await a.client.query(api.migration.listConversationMessages, {conversationId:id,paginationOpts:{cursor:null,numItems:10}});
    expect(history.page[0]).toMatchObject({runId:claimed.runId,runStatus:'active',role:'user'});
    await a.client.mutation(api.migration.deleteConversation,{conversationId:id});
    expect(await a.client.query(api.migration.getConversation,{conversationId:id})).toBeNull();
    await expect(t.mutation(internal.migration.completeRun,{ownerId:a.userId,runId:claimed.runId,fence:claimed.fence,responseMessages:[{role:'assistant',content:'Late write'}],form:null})).rejects.toThrow();
  });
  it('unknown and legacy UUID URLs are friendly missing conversations', async () => {
    const t=setup(); const a=await account(t,'a@example.com');
    expect(await a.client.query(api.migration.getConversation,{conversationId:'old-uuid-not-a-convex-id'})).toBeNull();
  });
  it('limits sequential requests and does not charge idempotency replays', async () => {
    vi.stubEnv('PORTIA_RUNS_PER_MINUTE','2');
    const t=setup(); const first=await run(t,'a','r1');
    await t.mutation(internal.migration.cancelRun,{ownerId:'a',runId:first.runId});
    const second=await run(t,'a','r2');
    await t.mutation(internal.migration.cancelRun,{ownerId:'a',runId:second.runId});
    expect((await run(t,'a','r1')).replayed).toBe(true);
    await expect(run(t,'a','r3')).rejects.toThrow(/Request limit/);
    expect((await run(t,'b','r3')).replayed).toBe(false);
  });
  it('limits empty conversation creation without private-mode bypass', async () => {
    vi.stubEnv('PORTIA_AUTH_MODE','private'); vi.stubEnv('MIGRATION_ALLOWED_EMAILS','a@example.com'); vi.stubEnv('PORTIA_CREATES_PER_MINUTE','1');
    const t=setup(); const a=await account(t,'a@example.com');
    const results=await Promise.allSettled([a.client.mutation(api.migration.createConversation,{}),a.client.mutation(api.migration.createConversation,{})]);
    expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    expect(results.filter(result=>result.status==='rejected')).toHaveLength(1);
  });
});
