/// <reference types="vite/client" />
import betterAuthTest from "@convex-dev/better-auth/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, components } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");
const SECRET = "s".repeat(40);

function setup() {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t);
  return t;
}

async function account(t: ReturnType<typeof setup>, email: string) {
  const now = Date.now();
  const user = await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: "Test", email, emailVerified: false, createdAt: now, updatedAt: now } } });
  const session = await t.mutation(components.betterAuth.adapter.create, { input: { model: "session", data: { userId: user._id, token: crypto.randomUUID(), expiresAt: now + 3_600_000, createdAt: now, updatedAt: now } } });
  return { ownerId: user._id as string, client: t.withIdentity({ subject: user._id, sessionId: session._id }) };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("PORTIA_ENABLED", "true");
  vi.stubEnv("PORTIA_CONVEX_DEPLOYMENT", "brilliant-whale-380");
  vi.stubEnv("CONVEX_SITE_URL", "https://brilliant-whale-380.convex.site");
  vi.stubEnv("PORTIA_AUTH_MODE", "basic");
  vi.stubEnv("PORTIA_SERVER_SECRET", SECRET);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

type Client = Awaited<ReturnType<typeof account>>["client"];
const ask = (client: Client, conversationId: Id<"conversations">, message: string, requestId = crypto.randomUUID()) =>
  client.mutation(api.conversations.claimTurn, { conversationId, requestId, modelAlias: "model-1", message });
const finish = (t: ReturnType<typeof setup>, turnId: Id<"turns">, status: "completed" | "waiting" | "error" = "completed", form?: { toolCallId: string; title: string; fields: Array<{ name: string; label: string; type: "text"; required: boolean }> }) =>
  t.mutation(api.agent.finishTurn, { secret: SECRET, turnId, status, segments: [{ type: "text", text: "done" }], ...(form ? { form } : {}) });
const commit = (t: ReturnType<typeof setup>, conversationId: Id<"conversations">, ownerId: string, expectedVersion: number, upserts: Array<{ path: string; content: string }>, deletes: string[] = []) =>
  t.mutation(api.agent.commitWorkspace, { secret: SECRET, conversationId, ownerId, expectedVersion, upserts, deletes });

it("claims a turn once per request id and refuses a second turn while one runs", async () => {
  const t = setup();
  const { client } = await account(t, "a@example.com");
  const conversationId = await client.mutation(api.conversations.create, {});
  const requestId = crypto.randomUUID();
  const first = await ask(client, conversationId, "Hello", requestId);
  expect(first.replayed).toBe(false);
  expect(first.memoryContext?.kind).toBe("full");
  const again = await ask(client, conversationId, "Hello", requestId);
  expect(again).toMatchObject({ replayed: true, turnId: first.turnId });
  await expect(ask(client, conversationId, "Another")).rejects.toThrow(/still running/);
  await finish(t, first.turnId);
  expect((await client.query(api.conversations.get, { conversationId }))?.state).toBe("idle");
  expect((await client.query(api.conversations.get, { conversationId }))?.title).toBe("Hello");
});

it("sends memory as a full snapshot first, then only what changed elsewhere", async () => {
  const t = setup();
  const { client, ownerId } = await account(t, "a@example.com");
  const one = await client.mutation(api.conversations.create, {});
  const two = await client.mutation(api.conversations.create, {});
  const start = await ask(client, one, "first");
  expect(start.memoryContext).toMatchObject({ kind: "full", files: [] });
  // This conversation writes memory itself: it must not be echoed back to it.
  expect(await commit(t, one, ownerId, 0, [{ path: "profile.md", content: "- Indian flag\n" }])).toEqual({ ok: true, version: 1 });
  await finish(t, start.turnId);
  expect((await ask(client, one, "second")).memoryContext?.kind).toBe("none");

  const other = await ask(client, two, "hello");
  expect(other.memoryContext).toMatchObject({ kind: "full", files: [{ path: "profile.md" }] });
  expect(await commit(t, two, ownerId, 1, [{ path: "vessels/mv-test.md", content: "- 30000 GRT\n" }], ["profile.md"])).toEqual({ ok: true, version: 2 });
  await finish(t, other.turnId);

  const turns = await client.query(api.conversations.turns, { conversationId: one, paginationOpts: { numItems: 5, cursor: null } });
  await finish(t, turns.page[0].id);
  const delta = await ask(client, one, "third");
  expect(delta.memoryContext).toMatchObject({ kind: "delta", files: [{ path: "vessels/mv-test.md" }], removed: ["profile.md"] });
});

it("rejects a stale memory write and invalid memory files", async () => {
  const t = setup();
  const { client, ownerId } = await account(t, "a@example.com");
  const conversationId = await client.mutation(api.conversations.create, {});
  await commit(t, conversationId, ownerId, 0, [{ path: "profile.md", content: "a" }]);
  expect(await commit(t, conversationId, ownerId, 0, [{ path: "profile.md", content: "b" }])).toMatchObject({ ok: false });
  expect(await commit(t, conversationId, ownerId, 1, [{ path: "Bad.txt", content: "b" }])).toMatchObject({ ok: false });
  expect(await commit(t, conversationId, ownerId, 1, [{ path: "big.md", content: "x".repeat(5000) }])).toMatchObject({ ok: false });
  expect(await t.run(ctx => ctx.db.query("memories").collect())).toMatchObject([{ ownerId, path: "profile.md", content: "a" }]);
});

it("refuses server functions without the secret and keeps owners apart", async () => {
  const t = setup();
  const a = await account(t, "a@example.com");
  const b = await account(t, "b@example.com");
  const conversationId = await a.client.mutation(api.conversations.create, {});
  await expect(t.mutation(api.agent.commitWorkspace, { secret: "x".repeat(40), conversationId, ownerId: a.ownerId, expectedVersion: 0, upserts: [], deletes: [] })).rejects.toThrow(/denied/);
  expect(await commit(t, conversationId, b.ownerId, 0, [{ path: "x.md", content: "y" }])).toMatchObject({ ok: false });
  expect(await b.client.query(api.conversations.get, { conversationId })).toBeNull();
  await expect(ask(b.client, conversationId, "hi")).rejects.toThrow(/not found/);
});

it("resolves a pending form with the next turn and refreshes memory after compaction", async () => {
  const t = setup();
  const { client } = await account(t, "a@example.com");
  const conversationId = await client.mutation(api.conversations.create, {});
  const first = await ask(client, conversationId, "Estimate charges");
  await t.mutation(api.agent.attachSession, { secret: SECRET, turnId: first.turnId, fxSessionId: "wrun_0123456789" });
  const form = { toolCallId: "call_1", title: "Voyage", fields: [{ name: "vessel", label: "Vessel", type: "text" as const, required: true }] };
  await finish(t, first.turnId, "waiting", form);
  expect((await client.query(api.conversations.get, { conversationId }))).toMatchObject({ state: "waiting", pendingForm: { toolCallId: "call_1" } });
  await expect(client.mutation(api.conversations.claimTurn, { conversationId, requestId: crypto.randomUUID(), modelAlias: "model-1", formResponse: { toolCallId: "call_1", values: {}, cancelled: false } })).rejects.toThrow(/required/);

  await t.mutation(api.agent.markCompacted, { secret: SECRET, fxSessionId: "wrun_0123456789" });
  const answer = await client.mutation(api.conversations.claimTurn, { conversationId, requestId: crypto.randomUUID(), modelAlias: "model-2", formResponse: { toolCallId: "call_1", values: { vessel: "MV Test" }, cancelled: false } });
  expect(answer).toMatchObject({ form: { title: "Voyage" }, formResponse: { values: { vessel: "MV Test" } }, fxSessionId: "wrun_0123456789", memoryContext: { kind: "full" } });
  expect((await client.query(api.conversations.get, { conversationId }))?.pendingForm).toBeNull();
});

it("cancels, expires and deletes turns", async () => {
  const t = setup();
  const { client } = await account(t, "a@example.com");
  const conversationId = await client.mutation(api.conversations.create, {});
  const first = await ask(client, conversationId, "hello");
  await client.mutation(api.conversations.requestCancel, { conversationId });
  await finish(t, first.turnId);
  const [cancelled] = (await client.query(api.conversations.turns, { conversationId, paginationOpts: { numItems: 5, cursor: null } })).page;
  expect(cancelled).toMatchObject({ status: "cancelled", segments: [{ type: "text", text: "done" }] });

  await ask(client, conversationId, "again");
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const [expired] = (await client.query(api.conversations.turns, { conversationId, paginationOpts: { numItems: 5, cursor: null } })).page;
  expect(expired.status).toBe("error");
  expect((await client.query(api.conversations.get, { conversationId }))?.state).toBe("error");

  await client.mutation(api.conversations.remove, { conversationId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await t.run(ctx => ctx.db.query("turns").collect())).toHaveLength(0);
});
