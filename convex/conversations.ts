import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { claimMemoryContext, consumeBudget, currentOwner, fail, ownedConversation, requireOwner } from "./lib/chat";
import { vConversationState, vForm, vFormResponse, vMemoryContext, vModelAlias, vSegment, vTurnStatus, vUsage } from "./validators";
import { vArtifactRef, vFilesContext } from './validators';
import { artifactRef, ownedArtifact } from './lib/artifacts';
import { MAX_CONVERSATION_FILES, MAX_TURN_ATTACHMENTS } from '../src/lib/artifacts/shared';

const MAX_MESSAGE_CHARS = 4_000;
const MAX_VALUE_CHARS = 2_000;
/** A turn the projection never heard back about is closed after this long. */
export const TURN_EXPIRY_MS = 15 * 60_000;

const conversationView = v.object({
  id: v.id("conversations"),
  title: v.string(),
  pinned: v.boolean(),
  modelAlias: vModelAlias,
  state: vConversationState,
  pendingForm: v.union(vForm, v.null()),
  updatedAt: v.number(),
});

const turnView = v.object({
  id: v.id("turns"),
  requestId: v.string(),
  order: v.number(),
  prompt: v.string(),
  formResponse: v.union(vFormResponse, v.null()),
  attachments: v.array(vArtifactRef),
  segments: v.array(vSegment),
  status: vTurnStatus,
  error: v.union(v.string(), v.null()),
  usage: v.union(vUsage, v.null()),
});

function viewConversation(conversation: Doc<"conversations">) {
  return {
    id: conversation._id,
    title: conversation.title,
    pinned: conversation.pinned ?? false,
    modelAlias: conversation.modelAlias,
    state: conversation.state,
    pendingForm: conversation.pendingForm ?? null,
    updatedAt: conversation.updatedAt,
  };
}

function titleFrom(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 72) || "New conversation";
}

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(conversationView),
  handler: async (ctx, args) => {
    const ownerId = await currentOwner(ctx);
    if (!ownerId) return { page: [], isDone: true, continueCursor: "" };
    if (args.paginationOpts.numItems > 50) fail("INVALID_INPUT", "Page size exceeds 50.");
    const page = await ctx.db.query("conversations")
      .withIndex("by_owner_and_updated_at", q => q.eq("ownerId", ownerId))
      .order("desc")
      .paginate(args.paginationOpts);
    return { ...page, page: page.page.map(viewConversation) };
  },
});

export const get = query({
  args: { conversationId: v.string() },
  returns: v.union(conversationView, v.null()),
  handler: async (ctx, args) => {
    const ownerId = await currentOwner(ctx);
    const id = ctx.db.normalizeId("conversations", args.conversationId);
    if (!ownerId || !id) return null;
    const conversation = await ctx.db.get(id);
    return conversation && conversation.ownerId === ownerId ? viewConversation(conversation) : null;
  },
});

/** Newest first; the client reverses each page for display. */
export const turns = query({
  args: { conversationId: v.id("conversations"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(turnView),
  handler: async (ctx, args) => {
    const ownerId = await currentOwner(ctx);
    const conversation = ownerId ? await ctx.db.get(args.conversationId) : null;
    if (!conversation || conversation.ownerId !== ownerId) return { page: [], isDone: true, continueCursor: "" };
    if (args.paginationOpts.numItems > 50) fail("INVALID_INPUT", "Page size exceeds 50.");
    const page = await ctx.db.query("turns")
      .withIndex("by_conversation_and_order", q => q.eq("conversationId", conversation._id))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map(turn => ({
        id: turn._id,
        requestId: turn.requestId,
        order: turn.order,
        prompt: turn.prompt,
        formResponse: turn.formResponse ?? null,
        attachments: turn.attachments ?? [],
        segments: turn.segments,
        status: turn.status,
        error: turn.error ?? null,
        usage: turn.usage ?? null,
      })),
    };
  },
});

export const create = mutation({
  args: { modelAlias: v.optional(vModelAlias) },
  returns: v.id("conversations"),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    await consumeBudget(ctx, ownerId, "create");
    return await ctx.db.insert("conversations", {
      ownerId,
      title: "New conversation",
      modelAlias: args.modelAlias ?? "model-1",
      state: "idle",
      nextOrder: 0,
      memorySeen: [],
      memoryRefresh: false,
      updatedAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: { conversationId: v.id("conversations"), title: v.optional(v.string()), pinned: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const conversation = await ownedConversation(ctx, args.conversationId, await requireOwner(ctx));
    const patch: { title?: string; pinned?: boolean } = {};
    if (args.title !== undefined) {
      const title = args.title.trim();
      if (!title || title.length > 120) fail("INVALID_INPUT", "Use a title between 1 and 120 characters.");
      patch.title = title;
    }
    if (args.pinned !== undefined) patch.pinned = args.pinned;
    await ctx.db.patch(conversation._id, patch);
    return null;
  },
});

/**
 * Removes the conversation and its projection. Saved memories are the user's and
 * survive. The libfx session cannot be deleted through its API; dropping the only
 * reference to its id makes it unreachable from this app.
 */
export const remove = mutation({
  args: { conversationId: v.id("conversations") },
  returns: v.union(v.object({ fxSessionId: v.string(), running: v.boolean() }), v.null()),
  handler: async (ctx, args) => {
    const conversation = await ownedConversation(ctx, args.conversationId, await requireOwner(ctx));
    await ctx.db.delete(conversation._id);
    await ctx.scheduler.runAfter(0, internal.agent.purgeConversation, { conversationId: conversation._id });
    return conversation.fxSessionId ? { fxSessionId: conversation.fxSessionId, running: conversation.state === "running" } : null;
  },
});

const claimResult = v.object({
  replayed: v.boolean(),
  turnId: v.id("turns"),
  requestId: v.string(),
  conversationId: v.id("conversations"),
  ownerId: v.string(),
  fxSessionId: v.union(v.string(), v.null()),
  modelAlias: vModelAlias,
  status: vTurnStatus,
  message: v.union(v.string(), v.null()),
  form: v.union(vForm, v.null()),
  formResponse: v.union(vFormResponse, v.null()),
  memoryContext: v.union(vMemoryContext, v.null()),
  filesContext: v.union(vFilesContext, v.null()),
});

/**
 * Starts a turn: one atomic step that checks ownership, state and budgets,
 * resolves a pending form, records the display row, and decides which saved
 * memory the prompt must carry. Retrying with the same requestId returns the
 * original claim instead of starting a second turn.
 */
export const claimTurn = mutation({
  args: {
    conversationId: v.id("conversations"),
    requestId: v.string(),
    modelAlias: vModelAlias,
    message: v.optional(v.string()),
    attachmentIds: v.optional(v.array(v.id('artifacts'))),
    formResponse: v.optional(v.object({
      toolCallId: v.string(),
      values: v.record(v.string(), v.string()),
      note: v.optional(v.string()),
      cancelled: v.boolean(),
    })),
  },
  returns: claimResult,
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    if (!/^[0-9a-f-]{36}$/.test(args.requestId)) fail("INVALID_INPUT", "Invalid request id.");
    const conversation = await ownedConversation(ctx, args.conversationId, ownerId);
    const prior = await ctx.db.query("turns").withIndex("by_owner_and_request", q => q.eq("ownerId", ownerId).eq("requestId", args.requestId)).unique();
    if (prior) {
      if (prior.conversationId !== conversation._id) fail("CONFLICT", "Request id already used.");
      return {
        replayed: true, turnId: prior._id, requestId: prior.requestId, conversationId: conversation._id, ownerId,
        fxSessionId: conversation.fxSessionId ?? null, modelAlias: conversation.modelAlias, status: prior.status,
        message: null, form: null, formResponse: prior.formResponse ?? null, memoryContext: null, filesContext: null,
      };
    }
    if (conversation.state === "running") fail("BUSY", "A response is still running in this conversation.");

    const attachmentIds = [...new Set(args.attachmentIds ?? [])];
    if (attachmentIds.length > MAX_TURN_ATTACHMENTS) fail('INVALID_INPUT', `Attach at most ${MAX_TURN_ATTACHMENTS} files per message.`);
    const attachments = await Promise.all(attachmentIds.map(id => ownedArtifact(ctx, id, ownerId)));
    if (attachments.some(file => file.status !== 'ready' || !file.markdownKey)) fail('INVALID_INPUT', 'Wait until attached files are ready. Retry failed files from Artifacts.');
    const artifactIds = [...new Set([...(conversation.artifactIds ?? []), ...attachmentIds])];
    const available = (await Promise.all(artifactIds.map(id => ctx.db.get(id)))).filter(file => file && file.ownerId === ownerId && file.status !== 'deleting');
    if (available.length > MAX_CONVERSATION_FILES) fail('INVALID_INPUT', `Use at most ${MAX_CONVERSATION_FILES} files per conversation. Start a new chat for more files.`);
    const ready = available.filter(file => file!.status === 'ready' && file!.markdownKey).map(file => artifactRef(file!));
    const seen = conversation.artifactSeen ?? [];
    const full = conversation.memoryRefresh;
    const changed = ready.filter(file => full || !seen.some(old => old.id === file.id && old.revision === file.revision && old.name === file.name));
    const removed = seen.filter(old => !ready.some(file => file.id === old.id)).map(file => file.id);
    const filesContext = changed.length || removed.length ? { files: changed, removed } : null;
    const message = args.message?.trim() || (attachments.length ? 'Please review the attached files.' : undefined);
    if (message && message.length > MAX_MESSAGE_CHARS) fail("INVALID_INPUT", `Messages are limited to ${MAX_MESSAGE_CHARS} characters.`);
    const form = conversation.pendingForm ?? null;
    let formResponse: Doc<"turns">["formResponse"];
    if (args.formResponse) {
      if (!form || form.toolCallId !== args.formResponse.toolCallId) fail("CONFLICT", "That form is no longer open.");
      const known = new Set(form.fields.map(field => field.name));
      const values: Record<string, string> = {};
      for (const [name, value] of Object.entries(args.formResponse.values)) {
        if (!known.has(name)) fail("INVALID_FORM", `Unknown form field '${name}'.`);
        if (value.length > MAX_VALUE_CHARS) fail("INVALID_FORM", "A form value is too long.");
        if (value.trim()) values[name] = value.trim();
      }
      if (!args.formResponse.cancelled) {
        for (const field of form.fields) {
          if (field.required && !values[field.name]) fail("INVALID_FORM", `${field.label} is required.`);
          if (field.type === "radio" && values[field.name] && !field.options?.includes(values[field.name])) fail("INVALID_FORM", `Choose a listed option for ${field.label}.`);
        }
      }
      const note = args.formResponse.note?.trim() || message;
      if (note && note.length > MAX_VALUE_CHARS) fail("INVALID_FORM", "The note is too long.");
      formResponse = { toolCallId: form.toolCallId, title: form.title, values, cancelled: args.formResponse.cancelled, ...(note ? { note } : {}) };
    } else if (form) {
      // Typing instead of filling the form dismisses it; the message still goes through.
      formResponse = { toolCallId: form.toolCallId, title: form.title, values: {}, cancelled: true };
    }
    if (!message && !formResponse) fail("INVALID_INPUT", "Write a message first.");

    await consumeBudget(ctx, ownerId, "run");
    const memoryContext = await claimMemoryContext(ctx, conversation);
    const now = Date.now();
    const prompt = message ?? (formResponse!.cancelled ? `Dismissed: ${formResponse!.title}` : `Submitted: ${formResponse!.title}`);
    const turnId = await ctx.db.insert("turns", {
      conversationId: conversation._id, ownerId, requestId: args.requestId, order: conversation.nextOrder,
      prompt, ...(formResponse ? { formResponse } : {}), segments: [], status: "running", startedAt: now, updatedAt: now,
      ...(attachments.length ? { attachments: attachments.map(artifactRef) } : {}),
    });
    await ctx.db.patch(conversation._id, {
      state: "running",
      activeTurnId: turnId,
      pendingForm: undefined,
      modelAlias: args.modelAlias,
      nextOrder: conversation.nextOrder + 1,
      updatedAt: now,
      artifactIds: available.map(file => file!._id),
      artifactSeen: ready,
      ...(conversation.nextOrder === 0 && message ? { title: titleFrom(message) } : {}),
    });
    await ctx.scheduler.runAfter(TURN_EXPIRY_MS, internal.agent.expireTurn, { turnId });
    return {
      replayed: false, turnId, requestId: args.requestId, conversationId: conversation._id, ownerId,
      fxSessionId: conversation.fxSessionId ?? null, modelAlias: args.modelAlias, status: "running" as const,
      message: message ?? null, form: formResponse ? form : null, formResponse: formResponse ?? null, memoryContext, filesContext,
    };
  },
});

/** Where a client reconnects to the running turn's stream, if there is one. */
export const streamTarget = query({
  args: { conversationId: v.id("conversations") },
  returns: v.union(v.object({ fxSessionId: v.string(), requestId: v.string(), turnId: v.id("turns") }), v.null()),
  handler: async (ctx, args) => {
    const conversation = await ownedConversation(ctx, args.conversationId, await requireOwner(ctx));
    const turn = conversation.activeTurnId ? await ctx.db.get(conversation.activeTurnId) : null;
    if (!turn || turn.status !== "running" || !conversation.fxSessionId) return null;
    return { fxSessionId: conversation.fxSessionId, requestId: turn.requestId, turnId: turn._id };
  },
});

/** Closes the running turn in the projection at once; the caller then cancels the libfx session. */
export const requestCancel = mutation({
  args: { conversationId: v.id("conversations") },
  returns: v.union(v.object({ fxSessionId: v.union(v.string(), v.null()) }), v.null()),
  handler: async (ctx, args) => {
    const conversation = await ownedConversation(ctx, args.conversationId, await requireOwner(ctx));
    const turn = conversation.activeTurnId ? await ctx.db.get(conversation.activeTurnId) : null;
    if (!turn || turn.status !== "running") return null;
    const now = Date.now();
    await ctx.db.patch(turn._id, { status: "cancelled", updatedAt: now });
    await ctx.db.patch(conversation._id, { state: "stopped", activeTurnId: undefined, updatedAt: now });
    return { fxSessionId: conversation.fxSessionId ?? null };
  },
});
