import { ensureMemory, memoryEnabled, assertRunMemory, runMemoryCurrent, deleteConversationMemory, hashMemory } from "./lib/memoryLifecycle";
import {
  createThread,
  listMessages as listAgentMessages,
  saveMessages,
  vMessage,
} from "@convex-dev/agent";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { assertPublicationFits, PUBLICATION_LIMIT_MESSAGE } from "../src/lib/migration/publication-contract";
import { compactHistory } from "../src/lib/berthwise/history";
import { safeMessageParts, TOOL_NAME } from "../src/lib/berthwise/projection";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  internalQuery,
  type MutationCtx,
  query,
} from "./_generated/server";
import { authComponent } from "./auth";
import {
  isMigrationDevEnabled,
  isAllowedEmail,
  requireMigrationDevEnabled,
} from "./lib/migrationGate";
import {
  vConversationState,
  vFinishReason,
  vModelAlias,
  vRunStatus,
} from "./validators";

const MAX_QUESTION_CHARS = 4_000;
const MAX_CONTEXT_MESSAGES = 200;
const MAX_CONTEXT_CHARS = 200_000;
const RUN_LEASE_MS = 270_000;
const MAX_ACTIVE_RUNS_PER_USER = 2;
const initialIntentValidator=v.object({requestId:v.string(),question:v.string(),modelAlias:vModelAlias});

const claimResultValidator = v.object({
  conversationId: v.id("migrationConversations"),
  runId: v.id("migrationRuns"),
  threadId: v.string(),
  promptMessageId: v.string(),
  fence: v.number(),
  revision: v.number(),
  replayed: v.boolean(),
});

const conversationValidator = v.object({
  id: v.id("migrationConversations"),
  title: v.string(),
  revision: v.number(),
  state: vConversationState,
  updatedAt: v.number(),
  activeRunId: v.union(v.id("migrationRuns"), v.null()),
  modelAlias: v.optional(vModelAlias),
  initialIntent:v.optional(initialIntentValidator),
});

const messageProjectionValidator = v.object({
  id: v.string(),
  role: v.union(v.literal("user"), v.literal("assistant")),
  text: v.string(),
  parts: v.array(v.union(
    v.object({ type: v.literal("text"), text: v.string() }),
    v.object({
      type: v.literal("tool"),
      toolCallId: v.string(),
      toolName: v.string(),
      status: v.union(v.literal("called"), v.literal("completed"), v.literal("error")),
    }),
    v.object({ type: v.literal("card"), toolCallId: v.string(), toolName: v.string(), card: v.string() }),
  )),
  order: v.number(),
  stepOrder: v.number(),
  runId: v.union(v.id("migrationRuns"), v.null()),
  runStatus: v.union(vRunStatus, v.null()),
  completionDisposition: v.optional(v.literal("incomplete")),
  status: v.union(
    v.literal("pending"),
    v.literal("success"),
    v.literal("failed"),
  ),
});

function fail(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

function requireBoundedText(value: string, name: string, max: number): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) {
    fail("INVALID_INPUT", `${name} must contain 1-${max} characters.`);
  }
  return trimmed;
}

function titleFromQuestion(question: string): string {
  return question.replace(/\s+/g, " ").slice(0, 72);
}

/** Every saved tool call has exactly one later result with the same tool name. */
function validateToolHistory(messages: Array<{ role: string; content: unknown }>): void {
  const calls = new Map<string, { toolName: string; position: number }>();
  const results = new Map<string, { toolName: string; position: number }>();
  let position = 0;
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      position += 1;
      if (!part || typeof part !== "object") continue;
      const candidate = part as { type?: unknown; toolName?: unknown; toolCallId?: unknown };
      if (candidate.type !== "tool-call" && candidate.type !== "tool-result") continue;
      if (typeof candidate.toolCallId !== "string" || typeof candidate.toolName !== "string" || !TOOL_NAME.test(candidate.toolName)) {
        fail("INVALID_TOOL_PART", "Tool part is malformed.");
      }
      const seen = candidate.type === "tool-call" ? calls : results;
      if (seen.has(candidate.toolCallId)) fail("DUPLICATE_TOOL_PART", "Duplicate tool part in model output.");
      if (candidate.type === "tool-call" && message.role !== "assistant") fail("INVALID_TOOL_CALL", "Tool call is malformed.");
      seen.set(candidate.toolCallId, { toolName: candidate.toolName, position });
    }
  }
  for (const [toolCallId, result] of results) {
    const call = calls.get(toolCallId);
    if (!call) fail("ORPHAN_TOOL_RESULT", "Orphan tool result in model output.");
    if (call.toolName !== result.toolName || result.position <= call.position) fail("TOOL_RESULT_MISMATCH", "Tool result does not match its call.");
  }
  if ([...calls.keys()].some(toolCallId => !results.has(toolCallId))) fail("ORPHAN_TOOL_CALL", "Tool call has no matching result.");
}

async function publicOwner(ctx: Parameters<typeof authComponent.getAuthUser>[0]) {
  if (!isMigrationDevEnabled()) return null;
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user || !isAllowedEmail(user.email)) return null;
  return user._id;
}

async function requireConversation(
  ctx: { db: { get: (id: Id<"migrationConversations">) => Promise<Doc<"migrationConversations"> | null> } },
  conversationId: Id<"migrationConversations">,
  ownerId: string,
) {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation || conversation.ownerId !== ownerId) {
    fail("NOT_FOUND", "Conversation not found.");
  }
  return conversation;
}

function budgetLimit(name: string, fallback: number, ceiling: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? Math.min(value, ceiling) : fallback;
}
/** Atomic bounded rolling window. At most 120 timestamps/user/kind; deletion cannot reset usage. */
async function consumeBudget(ctx: MutationCtx, ownerId: string, kind: "run" | "create") {
  const minute = budgetLimit(kind === "run" ? "PORTIA_RUNS_PER_MINUTE" : "PORTIA_CREATES_PER_MINUTE", kind === "run" ? 8 : 6, 20);
  const hour = budgetLimit(kind === "run" ? "PORTIA_RUNS_PER_HOUR" : "PORTIA_CREATES_PER_HOUR", kind === "run" ? 60 : 30, 120);
  const now = Date.now();
  const row = await ctx.db.query("requestBudgets").withIndex("by_owner_and_kind", q => q.eq("ownerId", ownerId).eq("kind", kind)).unique();
  const timestamps = (row?.timestamps ?? []).filter(time => time > now - 3_600_000);
  if (timestamps.length >= hour || timestamps.filter(time => time > now - 60_000).length >= minute) fail("THROTTLED", "Request limit reached. Please wait before trying again.");
  timestamps.push(now);
  if (row) await ctx.db.patch(row._id, { timestamps });
  else await ctx.db.insert("requestBudgets", { ownerId, kind, timestamps });
}

export const createConversation = mutation({
  args: {initialIntent:v.optional(initialIntentValidator)}, returns: v.id("migrationConversations"),
  handler: async (ctx,args) => {
    const ownerId = await publicOwner(ctx);
    if (!ownerId) fail("UNAUTHENTICATED", "Sign in required.");
    const initialIntent=args.initialIntent?{...args.initialIntent,question:requireBoundedText(args.initialIntent.question,"question",MAX_QUESTION_CHARS)}:undefined;
    let creationPayloadHash:string|undefined;
    if(initialIntent){
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(initialIntent.requestId))fail("INVALID_INPUT","Invalid initial request ID.");
      creationPayloadHash=await hashMemory({question:initialIntent.question,modelAlias:initialIntent.modelAlias});
      const prior=await ctx.db.query("migrationConversations").withIndex("by_owner_and_creation_request",q=>q.eq("ownerId",ownerId).eq("creationRequestId",initialIntent.requestId)).unique();
      if(prior){
        if(prior.creationPayloadHash!==creationPayloadHash)fail("IDEMPOTENCY_CONFLICT","Request ID was already used for different input.");
        return prior._id;
      }
    }
    await consumeBudget(ctx, ownerId, "create");
    const threadId = await createThread(ctx, components.agent, { userId: ownerId, title: "New conversation" });
    return await ctx.db.insert("migrationConversations", { ownerId, title: "New conversation", agentThreadId: threadId, revision: 0, nextFence: 1, state: "idle", updatedAt: Date.now(),
      ...(initialIntent?{initialIntent,creationRequestId:initialIntent.requestId,creationPayloadHash}:{}) });
  },
});

export const deleteConversation = mutation({
  args: { conversationId: v.id("migrationConversations") }, returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await publicOwner(ctx);
    if (!ownerId) fail("UNAUTHENTICATED", "Sign in required.");
    const conversation = await requireConversation(ctx, args.conversationId, ownerId);
    if (conversation.activeRunId) {
      const run = await ctx.db.get(conversation.activeRunId);
      if (run) await ctx.db.patch(run._id, { status: "cancelled", updatedAt: Date.now() });
    }
    await deleteConversationMemory(ctx, ownerId, conversation._id);
    // Removing the owner-scoped root revokes reads and all future fenced writes immediately.
    await ctx.db.delete(conversation._id);
    await ctx.scheduler.runAfter(0, internal.migration.cleanupConversation, { conversationId: conversation._id });
    await ctx.scheduler.runAfter(0, components.agent.threads.deleteAllForThreadIdAsync, { threadId: conversation.agentThreadId, limit: 100 });
    return null;
  },
});

export const cleanupConversation = internalMutation({
  args: { conversationId: v.id("migrationConversations") }, returns: v.null(),
  handler: async (ctx, args) => {
    const runs = await ctx.db.query("migrationRuns").withIndex("by_conversation_and_status", q => q.eq("conversationId", args.conversationId)).take(100);
    for (const row of runs) await ctx.db.delete(row._id);
    if (runs.length === 100) await ctx.scheduler.runAfter(0, internal.migration.cleanupConversation, args);
    return null;
  },
});

async function assertUserRunCapacity(ctx: MutationCtx, ownerId: string) {
  const active = await ctx.db
    .query("migrationRuns")
    .withIndex("by_owner_and_status", (q) => q.eq("ownerId", ownerId).eq("status", "active"))
    .take(MAX_ACTIVE_RUNS_PER_USER);
  if (active.length >= MAX_ACTIVE_RUNS_PER_USER) {
    fail("THROTTLED", "Too many active requests.");
  }
}

export const listConversations = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(conversationValidator),
  handler: async (ctx, args) => {
    const ownerId = await publicOwner(ctx);
    if (!ownerId) return { page: [], isDone: true, continueCursor: "" };
    if (args.paginationOpts.numItems > 50) fail("INVALID_INPUT", "Page size exceeds 50.");
    const page = await ctx.db
      .query("migrationConversations")
      .withIndex("by_owner_and_updated_at", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map((conversation) => ({
        id: conversation._id,
        title: conversation.title,
        revision: conversation.revision,
        state: conversation.state,
        updatedAt: conversation.updatedAt,
        activeRunId: conversation.activeRunId ?? null,
      })),
    };
  },
});

export const getConversation = query({
  args: { conversationId: v.string() },
  returns: v.union(v.object({ conversation: conversationValidator }), v.null()),
  handler: async (ctx, args) => {
    const ownerId = await publicOwner(ctx);
    if (!ownerId) return null;
    const id = ctx.db.normalizeId("migrationConversations", args.conversationId);
    if (!id) return null;
    const conversation = await ctx.db.get(id);
    if (!conversation || conversation.ownerId !== ownerId) return null;
    const latestRun = await ctx.db.query("migrationRuns")
      .withIndex("by_conversation_and_prompt_position", q => q.eq("conversationId", id))
      .order("desc").first();
    return {
      conversation: {
        id: conversation._id,
        title: conversation.title,
        revision: conversation.revision,
        state: conversation.state,
        updatedAt: conversation.updatedAt,
        activeRunId: conversation.activeRunId ?? null,
        modelAlias: latestRun?.modelAlias ?? "model-1",
        ...(conversation.revision===0&&conversation.initialIntent?{initialIntent:conversation.initialIntent}:{}),
      },
    };
  },
});

export const listConversationMessages = query({
  args: {
    conversationId: v.id("migrationConversations"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(messageProjectionValidator),
  handler: async (ctx, args) => {
    const ownerId = await publicOwner(ctx);
    if (!ownerId) return { page: [], isDone: true, continueCursor: "" };
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.ownerId !== ownerId) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    if (args.paginationOpts.numItems > 50) fail("INVALID_INPUT", "Page size exceeds 50.");
    const result = await listAgentMessages(ctx, components.agent, {
      threadId: conversation.agentThreadId,
      paginationOpts: args.paginationOpts,
      excludeToolMessages: false,
    });
    return {
      ...result,
      page: (await Promise.all(result.page.map(async (doc) => {
        const message = doc.message;
        const role = message?.role;
        if (!message || (role !== "user" && role !== "assistant" && role !== "tool")) return [];
        const run = await ctx.db.query("migrationRuns").withIndex("by_conversation_and_prompt_position", q => q.eq("conversationId", args.conversationId).eq("promptOrder", doc.order).lte("promptStepOrder", doc.stepOrder)).order("desc").first();
        const parts = safeMessageParts(message.content);
        return [{
          id: doc._id,
          role: role === "user" ? "user" as const : "assistant" as const,
          text: parts.flatMap(part => part.type === "text" ? [part.text] : []).join("\n"),
          parts,
          order: doc.order,
          stepOrder: doc.stepOrder,
          status: doc.status,
          runId: run?._id ?? null,
          runStatus: run?.status ?? null,
          ...(run?.errorCode === "INCOMPLETE_WORK" ? { completionDisposition: "incomplete" as const } : {}),
        }];
      }))).flat(),
    };
  },
});

export const claimQuestion = internalMutation({
  args: {
    ownerId: v.string(),
    conversationId: v.union(v.id("migrationConversations"), v.null()),
    requestId: v.string(),
    payloadHash: v.string(),
    question: v.string(),
    modelAlias: vModelAlias,
    expectedRevision: v.union(v.number(), v.null()),
  },
  returns: claimResultValidator,
  handler: async (ctx, args) => {
    requireMigrationDevEnabled();
    const requestId = requireBoundedText(args.requestId, "requestId", 200);
    const payloadHash = requireBoundedText(args.payloadHash, "payloadHash", 128);
    const question = requireBoundedText(args.question, "question", MAX_QUESTION_CHARS);

    const prior = await ctx.db
      .query("migrationRuns")
      .withIndex("by_owner_and_request_id", (q) =>
        q.eq("ownerId", args.ownerId).eq("requestId", requestId),
      )
      .unique();
    if (prior) {
      if (prior.payloadHash !== payloadHash) {
        fail("IDEMPOTENCY_CONFLICT", "Request ID was already used for different input.");
      }
      const conversation = await requireConversation(ctx, prior.conversationId, args.ownerId);
      return {
        conversationId: conversation._id,
        runId: prior._id,
        threadId: conversation.agentThreadId,
        promptMessageId: prior.promptMessageId,
        fence: prior.fence,
        revision: conversation.revision,
        replayed: true,
      };
    }

    await assertUserRunCapacity(ctx, args.ownerId);
    await consumeBudget(ctx, args.ownerId, "run");
    const now = Date.now();
    let conversation: Doc<"migrationConversations">;
    if (args.conversationId) {
      conversation = await requireConversation(ctx, args.conversationId, args.ownerId);
      if (args.expectedRevision !== conversation.revision) {
        fail("REVISION_CONFLICT", "Conversation changed in another tab.");
      }
      const intent=conversation.initialIntent;
      if(intent&&(intent.requestId!==requestId||intent.question!==question||intent.modelAlias!==args.modelAlias)){
        fail("INITIAL_INTENT_CONFLICT","Retry the saved question with its original request ID and model.");
      }
      if (conversation.activeRunId || conversation.state === "running") {
        fail("RUN_ACTIVE", "A response is already running for this conversation.");
      }
    } else {
      if (args.expectedRevision !== null) {
        fail("REVISION_CONFLICT", "New conversations must not include a revision.");
      }
      await consumeBudget(ctx, args.ownerId, "create");
      const threadId = await createThread(ctx, components.agent, {
        userId: args.ownerId,
        title: titleFromQuestion(question),
      });
      const conversationId = await ctx.db.insert("migrationConversations", {
        ownerId: args.ownerId,
        title: titleFromQuestion(question),
        agentThreadId: threadId,
        revision: 0,
        nextFence: 1,
        state: "idle",
        updatedAt: now,
      });
      const created = await ctx.db.get(conversationId);
      if (!created) fail("INTERNAL", "Conversation creation failed.");
      conversation = created;
    }

    const saved = await saveMessages(ctx, components.agent, {
      threadId: conversation.agentThreadId,
      userId: args.ownerId,
      order: "next",
      messages: [{ role: "user", content: question }],
    });
    const promptMessageId = saved.messages[0]?._id;
    if (!promptMessageId) fail("INTERNAL", "Prompt persistence failed.");

    const fence = conversation.nextFence;
    const revision = conversation.revision + 1;
    const leaseExpiresAt = now + RUN_LEASE_MS;
    const runId = await ctx.db.insert("migrationRuns", {
      conversationId: conversation._id,
      ownerId: args.ownerId,
      requestId,
      payloadHash,
      modelAlias: args.modelAlias,
      fence,
      revision,
      status: "active",
      leaseExpiresAt,
      promptMessageId,
      promptOrder: saved.messages[0].order,
      promptStepOrder: saved.messages[0].stepOrder,
      memoryEpoch: memoryEnabled() ? (await ensureMemory(ctx, args.ownerId)).epoch : undefined,
      startedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(conversation._id, {
      title: conversation.revision === 0 ? titleFromQuestion(question) : conversation.title,
      revision,
      nextFence: fence + 1,
      state: "running",
      activeRunId: runId,
      initialIntent: undefined,
      lastError: undefined,
      updatedAt: now,
    });
    await ctx.scheduler.runAt(leaseExpiresAt, internal.migration.recoverRun, { runId, fence });
    return {
      conversationId: conversation._id,
      runId,
      threadId: conversation.agentThreadId,
      promptMessageId,
      fence,
      revision,
      replayed: false,
    };
  },
});

export const getRunContext = internalQuery({
  args: { ownerId: v.string(), runId: v.id("migrationRuns"), fence: v.number() },
  returns: v.object({
    conversationId: v.id("migrationConversations"),
    threadId: v.string(),
    modelAlias: vModelAlias,
    promptMessageId: v.string(),
    revision: v.number(),
    messages: v.array(vMessage),
  }),
  handler: async (ctx, args) => {
    requireMigrationDevEnabled();
    const run = await ctx.db.get(args.runId);
    if (!run || run.ownerId !== args.ownerId) fail("NOT_FOUND", "Run not found.");
    await assertRunMemory(ctx, run);
    if (run.status !== "active" || run.fence !== args.fence) {
      fail("STALE_RUN", "Run is no longer active.");
    }
    if (run.leaseExpiresAt <= Date.now()) fail("DEADLINE", "Run lease expired.");
    const conversation = await requireConversation(ctx, run.conversationId, args.ownerId);
    if (conversation.activeRunId !== run._id) fail("STALE_RUN", "Run lost its fence.");
    const result = await listAgentMessages(ctx, components.agent, {
      threadId: conversation.agentThreadId,
      paginationOpts: { cursor: null, numItems: MAX_CONTEXT_MESSAGES + 1 },
      excludeToolMessages: false,
    });
    if (!result.isDone || result.page.length > MAX_CONTEXT_MESSAGES) {
      fail("CONTEXT_LIMIT", `Conversation exceeds ${MAX_CONTEXT_MESSAGES} stored messages.`);
    }
    const messages = compactHistory([...result.page]
      .sort((a, b) => a.order - b.order || a.stepOrder - b.stepOrder)
      .flatMap((doc) => (doc.message ? [doc.message] : [])));
    if (messages.reduce((total, message) => total + JSON.stringify(message).length, 0) > MAX_CONTEXT_CHARS) {
      fail("CONTEXT_LIMIT", `Conversation exceeds ${MAX_CONTEXT_CHARS} serialized context characters.`);
    }
    return {
      conversationId: conversation._id,
      threadId: conversation.agentThreadId,
      modelAlias: run.modelAlias,
      promptMessageId: run.promptMessageId,
      revision: conversation.revision,
      messages,
    };
  },
});

export const checkpointRun = internalMutation({
  args: {
    ownerId: v.string(),
    runId: v.id("migrationRuns"),
    fence: v.number(),
    stepNumber: v.number(),
    payloadHash: v.string(),
    responseMessages: v.array(vMessage),
    finishReason: v.optional(vFinishReason),
  },
  returns: v.object({ replayed: v.boolean(), checkpointStep: v.number() }),
  handler: async (ctx, args) => {
    requireMigrationDevEnabled();
    if (!Number.isInteger(args.stepNumber) || args.stepNumber < 0 || args.stepNumber >= 12) {
      fail("INVALID_CHECKPOINT", "Checkpoint step is out of bounds.");
    }
    if (args.responseMessages.length < 1 || args.responseMessages.length > 12) {
      fail("INVALID_CHECKPOINT", "Checkpoint message count is out of bounds.");
    }
    requireBoundedText(args.payloadHash, "payloadHash", 128);
    validateToolHistory(args.responseMessages);
    const run = await ctx.db.get(args.runId);
    if (!run || run.ownerId !== args.ownerId) fail("NOT_FOUND", "Run not found.");
    await assertRunMemory(ctx, run);
    if (run.status !== "active" || run.fence !== args.fence) {
      fail("STALE_RUN", "Stale run cannot persist a checkpoint.");
    }
    if (run.leaseExpiresAt <= Date.now()) fail("DEADLINE", "Run lease expired.");
    const conversation = await requireConversation(ctx, run.conversationId, args.ownerId);
    if (conversation.activeRunId !== run._id || conversation.state !== "running") {
      fail("STALE_RUN", "Run lost its conversation fence.");
    }
    if (run.checkpointStep !== undefined) {
      if (args.stepNumber === run.checkpointStep) {
        if (run.checkpointHash !== args.payloadHash) {
          fail("CHECKPOINT_CONFLICT", "Checkpoint payload conflict.");
        }
        return { replayed: true, checkpointStep: run.checkpointStep };
      }
      if (args.stepNumber !== run.checkpointStep + 1) {
        fail("CHECKPOINT_GAP", "Checkpoint step is not contiguous.");
      }
    } else if (args.stepNumber !== 0) {
      fail("CHECKPOINT_GAP", "First checkpoint must be step zero.");
    }
    await saveMessages(ctx, components.agent, {
      threadId: conversation.agentThreadId,
      userId: args.ownerId,
      promptMessageId: run.promptMessageId,
      messages: args.responseMessages,
    });
    await ctx.db.patch(run._id, {
      checkpointStep: args.stepNumber,
      checkpointHash: args.payloadHash,
      checkpointFinishReason: args.finishReason,
      updatedAt: Date.now(),
    });
    return { replayed: false, checkpointStep: args.stepNumber };
  },
});

export const getRunStatus = internalQuery({
  args: { ownerId: v.string(), runId: v.id("migrationRuns"), fence: v.number() },
  returns: v.object({
    status: vRunStatus,
    active: v.boolean(),
    leaseExpiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    requireMigrationDevEnabled();
    const run = await ctx.db.get(args.runId);
    if (!run || run.ownerId !== args.ownerId) fail("NOT_FOUND", "Run not found.");
    await assertRunMemory(ctx, run);
    const conversation = await ctx.db.get(run.conversationId);
    const active =
      run.status === "active" &&
      run.fence === args.fence &&
      run.leaseExpiresAt > Date.now() &&
      conversation?.activeRunId === run._id &&
      conversation.state === "running" && await runMemoryCurrent(ctx, run);
    return { status: run.status, active, leaseExpiresAt: run.leaseExpiresAt };
  },
});

/** Saves the one checked written answer for the run and closes it. */
export const completeRun = internalMutation({
  args: {
    ownerId: v.string(),
    runId: v.id("migrationRuns"),
    fence: v.number(),
    responseMessages: v.array(vMessage),
    incomplete: v.optional(v.literal(true)),
  },
  returns: v.object({ state: vConversationState, revision: v.number() }),
  handler: async (ctx, args) => {
    requireMigrationDevEnabled();
    try {
      const wireArgs = Object.fromEntries(Object.entries(args).filter(([name]) => name !== "ownerId"));
      assertPublicationFits({ op: "complete", args: wireArgs });
    } catch {
      fail("PUBLICATION_LIMIT", PUBLICATION_LIMIT_MESSAGE);
    }
    const [answer] = args.responseMessages;
    if (args.responseMessages.length !== 1 || answer?.role !== "assistant" || typeof answer.content !== "string" || !answer.content.trim()) {
      fail("INVALID_ANSWER", "Completion requires one written answer.");
    }
    const run = await ctx.db.get(args.runId);
    if (!run || run.ownerId !== args.ownerId) fail("NOT_FOUND", "Run not found.");
    await assertRunMemory(ctx, run);
    if (run.status !== "active" || run.fence !== args.fence) {
      fail("STALE_RUN", "Stale run cannot persist output.");
    }
    if (run.leaseExpiresAt <= Date.now()) fail("DEADLINE", "Run lease expired.");
    const conversation = await requireConversation(ctx, run.conversationId, args.ownerId);
    if (conversation.activeRunId !== run._id || conversation.state !== "running") {
      fail("STALE_RUN", "Run lost its conversation fence.");
    }
    await saveMessages(ctx, components.agent, {
      threadId: conversation.agentThreadId,
      userId: args.ownerId,
      promptMessageId: run.promptMessageId,
      messages: args.responseMessages,
    });
    const now = Date.now();
    const revision = conversation.revision + 1;
    await ctx.db.patch(run._id, { status: "completed", ...(args.incomplete ? { errorCode: "INCOMPLETE_WORK" } : {}), updatedAt: now });
    await ctx.db.patch(conversation._id, { revision, state: "idle", activeRunId: undefined, updatedAt: now });
    return { state: "idle" as const, revision };
  },
});

export const failRun = internalMutation({
  args: {
    ownerId: v.string(),
    runId: v.id("migrationRuns"),
    fence: v.number(),
    errorCode: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    requireMigrationDevEnabled();
    const run = await ctx.db.get(args.runId);
    if (!run || run.ownerId !== args.ownerId || run.fence !== args.fence || run.status !== "active") {
      return false;
    }
    const conversation = await ctx.db.get(run.conversationId);
    if (!conversation || conversation.activeRunId !== run._id) return false;
    const now = Date.now();
    await ctx.db.patch(run._id, {
      status: "error",
      errorCode: args.errorCode.slice(0, 80),
      updatedAt: now,
    });
    await ctx.db.patch(conversation._id, {
      revision: conversation.revision + 1,
      state: "error",
      activeRunId: undefined,
      lastError: "The response failed. Please try again.",
      updatedAt: now,
    });
    return true;
  },
});

export const cancelRun = internalMutation({
  args: { ownerId: v.string(), runId: v.id("migrationRuns") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    requireMigrationDevEnabled();
    const run = await ctx.db.get(args.runId);
    if (!run || run.ownerId !== args.ownerId || run.status !== "active") return false;
    const conversation = await ctx.db.get(run.conversationId);
    if (!conversation || conversation.activeRunId !== run._id) return false;
    const now = Date.now();
    await ctx.db.patch(run._id, { status: "cancelled", updatedAt: now });
    await ctx.db.patch(conversation._id, {
      revision: conversation.revision + 1,
      state: "stopped",
      activeRunId: undefined,
      updatedAt: now,
    });
    return true;
  },
});

export const recoverRun = internalMutation({
  args: { runId: v.id("migrationRuns"), fence: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== "active" || run.fence !== args.fence || run.leaseExpiresAt > Date.now()) {
      return false;
    }
    const conversation = await ctx.db.get(run.conversationId);
    if (!conversation || conversation.activeRunId !== run._id) return false;
    const now = Date.now();
    await ctx.db.patch(run._id, { status: "expired", errorCode: "DEADLINE", updatedAt: now });
    await ctx.db.patch(conversation._id, {
      revision: conversation.revision + 1,
      state: "error",
      activeRunId: undefined,
      lastError: "The response took too long. Please try again.",
      updatedAt: now,
    });
    return true;
  },
});
