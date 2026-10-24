/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import { saveMessages } from "@convex-dev/agent";
import betterAuthTest from "@convex-dev/better-auth/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, components, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");
const ownerA = "owner-a";
const ownerB = "owner-b";

function setup() {
  const t = convexTest(schema, modules);
  agentTest.register(t);
  betterAuthTest.register(t);
  return t;
}

async function claim(t: ReturnType<typeof setup>, overrides: Record<string, unknown> = {}) {
  return await t.mutation(internal.migration.claimQuestion, {
    ownerId: ownerA,
    conversationId: null,
    requestId: "request-1",
    payloadHash: "hash-1",
    question: "Estimate berth hire at Mumbai",
    modelAlias: "model-1",
    expectedRevision: null,
    ...overrides,
  });
}

const toolStep = (toolCallId: string, toolName: string, value: unknown) => [
  { role: "assistant" as const, content: [{ type: "tool-call" as const, toolCallId, toolName, input: { expression: "1+1", unused: null } }] },
  { role: "tool" as const, content: [{ type: "tool-result" as const, toolCallId, toolName, output: { type: "json" as const, value } }] },
];

describe("migration Convex state machine", () => {
  beforeEach(() => {
    vi.stubEnv("MIGRATION_DEV_ENABLED", "true");
    vi.stubEnv("PORTIA_CONVEX_DEPLOYMENT", "brilliant-whale-380");
    vi.stubEnv("CONVEX_SITE_URL", "https://brilliant-whale-380.convex.site");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("saves tool steps, completes with one written answer and replays earlier tool results as summaries", async () => {
    const t = setup();
    const first = await claim(t);
    await t.mutation(internal.migration.checkpointRun, {
      ownerId: ownerA, runId: first.runId, fence: first.fence, stepNumber: 0, payloadHash: "step-0", finishReason: "tool-calls",
      responseMessages: toolStep("estimate-1", "estimate_port_call", { summary: "Mumbai berth hire USD 19,728", card: { kind: "estimate", total: "19728" }, detail: "x".repeat(4000) }),
    });
    expect(await t.mutation(internal.migration.completeRun, {
      ownerId: ownerA, runId: first.runId, fence: first.fence, responseMessages: [{ role: "assistant", content: "Berth hire comes to USD 19,728." }],
    })).toMatchObject({ state: "idle" });

    const next = await claim(t, { conversationId: first.conversationId, requestId: "follow-up", payloadHash: "follow-up", question: "And for 36 hours?", expectedRevision: first.revision + 1 });
    const context = await t.query(internal.migration.getRunContext, { ownerId: ownerA, runId: next.runId, fence: next.fence });
    const replay = JSON.stringify(context.messages);
    expect(replay).toContain("Mumbai berth hire USD 19,728");
    expect(replay).not.toContain("xxxx");
    expect(replay).not.toContain("unused");
    expect(context.messages.at(-1)).toMatchObject({ role: "user", content: "And for 36 hours?" });
  });

  it("requires exactly one non-empty written answer to complete", async () => {
    const t = setup();
    const run = await claim(t);
    for (const responseMessages of [
      [],
      [{ role: "assistant" as const, content: "   " }],
      [{ role: "assistant" as const, content: [{ type: "reasoning" as const, text: "Thinking" }] }],
      [{ role: "assistant" as const, content: "One" }, { role: "assistant" as const, content: "Two" }],
    ]) {
      await expect(t.mutation(internal.migration.completeRun, { ownerId: ownerA, runId: run.runId, fence: run.fence, responseMessages }))
        .rejects.toThrow(/one written answer/i);
    }
  });

  it("records an incomplete answer without failing the conversation", async () => {
    const t = setup();
    const run = await claim(t);
    expect(await t.mutation(internal.migration.completeRun, {
      ownerId: ownerA, runId: run.runId, fence: run.fence, incomplete: true, responseMessages: [{ role: "assistant", content: "I ran out of steps." }],
    })).toMatchObject({ state: "idle" });
    const saved = await t.run(async ctx => ctx.db.get(run.runId));
    expect(saved).toMatchObject({ status: "completed", errorCode: "INCOMPLETE_WORK" });
  });

  it("checks identical idempotency before revision and rejects changed payload", async () => {
    const t = setup();
    const first = await claim(t);
    const replay = await claim(t, { expectedRevision: 999 });
    expect(replay.replayed).toBe(true);
    expect(replay.runId).toBe(first.runId);
    await expect(claim(t, { payloadHash: "changed", expectedRevision: 999 }))
      .rejects.toThrow(/Request ID was already used/);
  });

  it("blocks a second question while a response is running", async () => {
    const t = setup();
    const first = await claim(t);
    await expect(claim(t, { conversationId: first.conversationId, requestId: "second", payloadHash: "second", expectedRevision: first.revision }))
      .rejects.toThrow(/already running/);
  });

  it("isolates owners and denies public reads without a live session", async () => {
    const t = setup();
    const run = await claim(t);
    await expect(t.query(internal.migration.getRunContext, { ownerId: ownerB, runId: run.runId, fence: run.fence })).rejects.toThrow(/Run not found/);
    await expect(t.query(api.migration.listConversations, { paginationOpts: { cursor: null, numItems: 10 } })).resolves.toMatchObject({ page: [], isDone: true });
    await expect(t.query(api.migration.getConversation, { conversationId: run.conversationId })).resolves.toBeNull();
    await expect(t.query(api.migration.listConversationMessages, { conversationId: run.conversationId, paginationOpts: { cursor: null, numItems: 10 } }))
      .resolves.toMatchObject({ page: [], isDone: true });
  });

  it("clears live read projections when the JWT outlives its revoked session", async () => {
    const t = setup();
    const run = await claim(t);
    const revoked = t.withIdentity({ subject: ownerA, sessionId: "deleted-session" });
    await expect(revoked.query(api.migration.getConversation, { conversationId: run.conversationId })).resolves.toBeNull();
    await expect(revoked.query(api.migration.listConversations, { paginationOpts: { cursor: null, numItems: 10 } })).resolves.toMatchObject({ page: [], isDone: true });
  });

  it("rejects completion after cancellation and after the lease expires", async () => {
    const t = setup();
    const cancelled = await claim(t);
    expect(await t.mutation(internal.migration.cancelRun, { ownerId: ownerA, runId: cancelled.runId })).toBe(true);
    await expect(t.mutation(internal.migration.completeRun, { ownerId: ownerA, runId: cancelled.runId, fence: cancelled.fence, responseMessages: [{ role: "assistant", content: "Late answer" }] }))
      .rejects.toThrow(/Stale run/);

    const expired = await claim(t, { requestId: "request-2", payloadHash: "hash-2" });
    await t.run(async (ctx) => { await ctx.db.patch(expired.runId, { leaseExpiresAt: Date.now() - 1 }); });
    await expect(t.query(internal.migration.getRunContext, { ownerId: ownerA, runId: expired.runId, fence: expired.fence })).rejects.toThrow(/lease expired/i);
    await expect(t.mutation(internal.migration.completeRun, { ownerId: ownerA, runId: expired.runId, fence: expired.fence, responseMessages: [{ role: "assistant", content: "Late" }] }))
      .rejects.toThrow(/lease expired/i);
  });

  it.each(["cancelled", "expired", "wrong-fence", "lost-root"] as const)("checkpoint replay rejects %s runs", async kind => {
    const t = setup(), run = await claim(t);
    const args = { ownerId: ownerA, runId: run.runId, fence: run.fence, stepNumber: 0, payloadHash: "same-checkpoint", responseMessages: toolStep("c-1", "calculate", { result: "2" }) };
    await t.mutation(internal.migration.checkpointRun, args);
    expect((await t.mutation(internal.migration.checkpointRun, args)).replayed).toBe(true);
    if (kind === "cancelled") await t.mutation(internal.migration.cancelRun, { ownerId: ownerA, runId: run.runId });
    if (kind === "expired") await t.run(async ctx => { await ctx.db.patch(run.runId, { leaseExpiresAt: Date.now() - 1 }); });
    if (kind === "wrong-fence") args.fence++;
    if (kind === "lost-root") await t.run(async ctx => { await ctx.db.patch(run.conversationId, { activeRunId: undefined, state: "idle" }); });
    await expect(t.mutation(internal.migration.checkpointRun, args)).rejects.toThrow();
  });

  it("checkpoints once per step and rejects a changed replay or a gap", async () => {
    const t = setup();
    const run = await claim(t);
    const step = { ownerId: ownerA, runId: run.runId, fence: run.fence, stepNumber: 0, payloadHash: "checkpoint-hash", responseMessages: toolStep("calc-1", "calculate", { result: "2" }), finishReason: "tool-calls" as const };
    expect((await t.mutation(internal.migration.checkpointRun, step)).replayed).toBe(false);
    expect((await t.mutation(internal.migration.checkpointRun, step)).replayed).toBe(true);
    await expect(t.mutation(internal.migration.checkpointRun, { ...step, payloadHash: "changed" })).rejects.toThrow(/checkpoint.*conflict/i);
    await expect(t.mutation(internal.migration.checkpointRun, { ...step, stepNumber: 2, payloadHash: "gap" })).rejects.toThrow(/not contiguous/i);
  });

  it("rejects orphan, duplicate, unanswered and malformed tool parts at checkpoint", async () => {
    const t = setup();
    const run = await claim(t);
    const base = { ownerId: ownerA, runId: run.runId, fence: run.fence, stepNumber: 0 };
    const [call, result] = toolStep("dup", "calculate", { result: "2" });
    await expect(t.mutation(internal.migration.checkpointRun, { ...base, payloadHash: "orphan", responseMessages: [result] })).rejects.toThrow(/orphan/i);
    await expect(t.mutation(internal.migration.checkpointRun, { ...base, payloadHash: "duplicate", responseMessages: [call, result, result] })).rejects.toThrow(/duplicate/i);
    await expect(t.mutation(internal.migration.checkpointRun, { ...base, payloadHash: "unanswered", responseMessages: [call] })).rejects.toThrow(/no matching result/i);
    await expect(t.mutation(internal.migration.checkpointRun, { ...base, payloadHash: "malformed", responseMessages: toolStep("bad", "Bad Tool!", {}) })).rejects.toThrow(/malformed/i);
  });

  it("loads more than forty stored messages without truncating history", async () => {
    const t = setup();
    const run = await claim(t);
    await t.run(async (ctx) => {
      await saveMessages(ctx, components.agent, {
        threadId: run.threadId,
        userId: ownerA,
        order: "next",
        messages: Array.from({ length: 45 }, (_, index) => ({ role: "assistant" as const, content: `Historical answer ${index}` })),
      });
    });
    const context = await t.query(internal.migration.getRunContext, { ownerId: ownerA, runId: run.runId, fence: run.fence });
    expect(context.messages).toHaveLength(46);
    expect(context.messages.at(-1)).toMatchObject({ content: "Historical answer 44" });
  });
});
