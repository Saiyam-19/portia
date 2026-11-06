/// <reference types="vite/client" />
import betterAuthTest from '@convex-dev/better-auth/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api, components } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.ts');
const secret = 'a'.repeat(40);
beforeEach(() => {
  vi.stubEnv('PORTIA_ENABLED', 'true'); vi.stubEnv('PORTIA_CONVEX_DEPLOYMENT', 'brilliant-whale-380');
  vi.stubEnv('CONVEX_SITE_URL', 'https://brilliant-whale-380.convex.site'); vi.stubEnv('PORTIA_AUTH_MODE', 'basic'); vi.stubEnv('PORTIA_SERVER_SECRET', secret);
});
afterEach(() => vi.unstubAllEnvs());
function setup() { const t = convexTest(schema, modules); betterAuthTest.register(t); return t; }
async function account(t: ReturnType<typeof setup>, email: string) {
  const now = Date.now();
  const user = await t.mutation(components.betterAuth.adapter.create, { input: { model: 'user', data: { name: 'Test', email, emailVerified: false, createdAt: now, updatedAt: now } } });
  const session = await t.mutation(components.betterAuth.adapter.create, { input: { model: 'session', data: { userId: user._id, token: crypto.randomUUID(), expiresAt: now + 3_600_000, createdAt: now, updatedAt: now } } });
  return { ownerId: user._id as string, client: t.withIdentity({ subject: user._id, sessionId: session._id }) };
}
async function upload(t: ReturnType<typeof setup>, ownerId: string) {
  const file = await t.mutation(api.artifacts.registerUpload, { secret, ownerId, artifactId: null, expectedRevision: 0, name: 'contract.txt', mimeType: 'text/plain', size: 100, fileKey: crypto.randomUUID() });
  await t.mutation(api.artifacts.conversionResult, { secret, ownerId, artifactId: file!.id, revision: 1, markdownKey: 'markdown1' });
  return file!;
}

it('isolates artifact CRUD, attachment claims and workspace access by owner', async () => {
  const t = setup(); const a = await account(t, 'a@example.com'); const b = await account(t, 'b@example.com');
  const file = await upload(t, a.ownerId);
  await expect(b.client.query(api.artifacts.get, { artifactId: file.id })).rejects.toThrow(/not found/);
  await expect(b.client.mutation(api.artifacts.rename, { artifactId: file.id, name: 'stolen.txt' })).rejects.toThrow(/not found/);
  await expect(b.client.mutation(api.artifacts.beginDelete, { artifactId: file.id })).rejects.toThrow(/not found/);
  const conversationId = await b.client.mutation(api.conversations.create, {});
  await expect(b.client.mutation(api.conversations.claimTurn, { conversationId, requestId: crypto.randomUUID(), modelAlias: 'model-1', attachmentIds: [file.id] })).rejects.toThrow(/not found/);
  await expect(t.query(api.artifacts.forServer, { secret: 'bad', ownerId: a.ownerId, artifactId: file.id })).rejects.toThrow(/denied/);
});

it('persists attachment-only turns, sends only file changes and refreshes after deletion', async () => {
  const t = setup(); const a = await account(t, 'a@example.com'); const file = await upload(t, a.ownerId);
  const conversationId = await a.client.mutation(api.conversations.create, {});
  const first = await a.client.mutation(api.conversations.claimTurn, { conversationId, requestId: crypto.randomUUID(), modelAlias: 'model-1', attachmentIds: [file.id] });
  expect(first.filesContext?.files).toMatchObject([{ id: file.id, revision: 1 }]);
  const state = await t.query(api.agent.workspaceState, { secret, conversationId, ownerId: a.ownerId });
  expect(state?.artifacts).toMatchObject([{ id: file.id, markdownKey: 'markdown1' }]);
  await t.mutation(api.agent.finishTurn, { secret, turnId: first.turnId, status: 'completed', segments: [] });
  const next = await a.client.mutation(api.conversations.claimTurn, { conversationId, requestId: crypto.randomUUID(), modelAlias: 'model-1', message: 'continue' });
  expect(next.filesContext).toBeNull();
  await t.mutation(api.agent.finishTurn, { secret, turnId: next.turnId, status: 'completed', segments: [] });
  await a.client.mutation(api.artifacts.beginDelete, { artifactId: file.id });
  const deleted = await a.client.mutation(api.conversations.claimTurn, { conversationId, requestId: crypto.randomUUID(), modelAlias: 'model-1', message: 'continue' });
  expect(deleted.filesContext?.removed).toEqual([file.id]);
  expect((await t.query(api.agent.workspaceState, { secret, conversationId, ownerId: a.ownerId }))?.artifacts).toEqual([]);
});

it('rejects stale upload callbacks and conversion results after replacement/deletion', async () => {
  const t = setup(); const a = await account(t, 'a@example.com'); const file = await upload(t, a.ownerId);
  const args = { secret, ownerId: a.ownerId, artifactId: file.id, expectedRevision: 1, name: 'new.txt', mimeType: 'text/plain', size: 50, fileKey: 'new-original' };
  expect(await t.mutation(api.artifacts.registerUpload, args)).toMatchObject({ started: true, revision: 2 });
  expect(await t.mutation(api.artifacts.registerUpload, args)).toMatchObject({ started: false, revision: 2 });
  expect(await t.mutation(api.artifacts.registerUpload, { ...args, fileKey: 'stale-original' })).toBeNull();
  expect(await t.mutation(api.artifacts.conversionResult, { secret, ownerId: a.ownerId, artifactId: file.id, revision: 1, markdownKey: 'stale-markdown' })).toBe(false);
  const target = await a.client.mutation(api.artifacts.beginDelete, { artifactId: file.id });
  expect(target.keys).toContain('new-original'); expect(target.keys).toContain('markdown1');
  expect(await t.mutation(api.artifacts.conversionResult, { secret, ownerId: a.ownerId, artifactId: file.id, revision: 2, markdownKey: 'late-markdown' })).toBe(false);
});

it('cannot resurrect a reserved upload deleted before its completion callback', async () => {
  const t = setup(); const a = await account(t, 'a@example.com');
  const [slot] = await a.client.mutation(api.artifacts.reserveUploads, { files: [{ name: 'pending.txt', mimeType: 'text/plain', size: 10 }] });
  const target = await a.client.mutation(api.artifacts.beginDelete, { artifactId: slot.artifactId });
  expect(target.keys).toEqual([]);
  await t.mutation(api.artifacts.finishDelete, { secret, artifactId: slot.artifactId, ownerId: a.ownerId, revision: target.revision });
  expect(await t.mutation(api.artifacts.registerUpload, { secret, ownerId: a.ownerId, ...slot, name: 'pending.txt', mimeType: 'text/plain', size: 10, fileKey: 'late-key' })).toBeNull();
});
