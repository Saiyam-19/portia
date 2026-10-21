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
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
  query,
} from "./_generated/server";
import { authComponent } from "./auth";
import { discardedDraftsForReview, hasQuoteDrafts } from "../src/lib/portia/quote-drafts";
import {
  APPROVE,
  REJECT,
  AUTHORITY_TTL_MS,
  MAX_REVIEW_CHARS,
  approvalForm,
  canonical,
  type AuthorityPacket,
} from "../src/lib/authority/contract";
import {
  authorityLedgerUpdates,
  checkedPacket,
  enqueueAuthorizedMemory,
  validateAuthorityBase,
  validateQuoteReceipts,
} from "./lib/authority";
import {
  isMigrationDevEnabled,
  isAllowedEmail,
  requireMigrationDevEnabled,
} from "./lib/migrationGate";
import {
  vConversationState,
  vFormField,
  vFormInput,
  vFormStatus,
  vFormValues,
  vFinishReason,
  vModelAlias,
  vAuthorization,
  vQuoteApproval,
  vRunStatus,
  vRemainingObligations,
} from "./validators";

const MAX_QUESTION_CHARS = 4_000;
const MAX_CONTEXT_MESSAGES = 200;
const MAX_CONTEXT_CHARS = 200_000;
function discardablePackets(payloads: string[]): AuthorityPacket[] {
  return payloads.flatMap(payload => {
    try { return [checkedPacket(payload)]; }
    catch { return []; } // A damaged/expired review must remain rejectable.
  });
}
/** Recover discard provenance for existing native rejections too. The form
 * record, never model-authored text, determines which proposals were declined.
 * History stays stored verbatim; both replay consumers receive the same view. */
async function restoreNativeDraftDiscards<T extends { role: string; content: unknown }>(ctx: Pick<QueryCtx, "db">, conversation: Doc<"migrationConversations">, messages: T[]): Promise<T[]> {
  const history: T[] = [];
  for (const message of messages) {
    if (message.role !== "tool" || !Array.isArray(message.content)) { history.push(message); continue; }
    const parts = [...message.content];
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index], body = part?.output?.value;
      if (part?.type !== "tool-result" || part.toolName !== "ask_user_input" || part.output?.type !== "json" || !body || typeof body !== "object" || body.discardedQuoteDrafts !== undefined || !["rejected", "cancelled"].includes(body.resolutionReason)) continue;
      const form = await ctx.db.query("migrationForms").withIndex("by_conversation_and_tool_call_id", q => q.eq("conversationId", conversation._id).eq("toolCallId", part.toolCallId)).unique();
      if (!form?.authorization || form.ownerId !== conversation.ownerId || !form.resolvedAt || form.resolutionReason !== body.resolutionReason || form.note?.trim()
        || canonical({ values: form.values ?? {}, cancelled: form.status === "cancelled", note: form.note ?? "" }) !== canonical({ values: body.values ?? {}, cancelled: body.cancelled, note: body.note ?? "" })) continue;
      const discardedQuoteDrafts = await discardedDraftsForReview(history, conversation._id, discardablePackets([form.authorization.payload, ...(form.continuation ?? []).map(item => item.payload)]), body.resolutionReason);
      if (discardedQuoteDrafts) parts[index] = { ...part, output: { ...part.output, value: { ...body, discardedQuoteDrafts } } };
    }
    history.push({ ...message, content: parts });
  }
  return history;
}

async function draftHistory(ctx: MutationCtx, conversation: Doc<"migrationConversations">) {
  const result = await listAgentMessages(ctx, components.agent, {
    threadId: conversation.agentThreadId,
    paginationOpts: { cursor: null, numItems: MAX_CONTEXT_MESSAGES + 1 }, excludeToolMessages: false,
  });
  if (!result.isDone || result.page.length > MAX_CONTEXT_MESSAGES) throw new ConvexError({ code: "CONTEXT_LIMIT", message: "Quotation draft history exceeds the conversation limit." });
  const messages = await restoreNativeDraftDiscards(ctx, conversation, [...result.page].sort((a, b) => a.order - b.order || a.stepOrder - b.stepOrder).flatMap(doc => doc.message ? [doc.message] : []));
  if (messages.reduce((sum, message) => sum + JSON.stringify(message).length, 0) > MAX_CONTEXT_CHARS) throw new ConvexError({ code: "CONTEXT_LIMIT", message: "Quotation draft history exceeds the context size limit." });
  return messages;
}
const MAX_FORM_FIELDS = 8;
const MAX_VALUE_CHARS = 2_000;
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
  authorizationExecution: v.optional(v.boolean()),
  authorizationDeclined: v.optional(v.boolean()),
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

const formProjectionValidator = v.object({
  id: v.id("migrationForms"),
  toolCallId: v.string(),
  title: v.string(),
  description: v.union(v.string(), v.null()),
  fields: v.array(vFormField),
  status: vFormStatus,
  values: v.union(vFormValues, v.null()),
  note: v.union(v.string(), v.null()),
  resolutionReason: v.union(v.string(), v.null()),
  resolvedAt: v.union(v.number(), v.null()),
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

type SafeMessagePart =
  | { type: "text"; text: string }
  | { type: "tool"; toolCallId: string; toolName: string; status: "called" | "completed" | "error" };

function safeMessageParts(content: unknown, allowArrayText = true): SafeMessagePart[] {
  if (typeof content === "string") {
    return content ? [{ type: "text" as const, text: content }] : [];
  }
  if (!Array.isArray(content)) return [];
  const safe: SafeMessagePart[] = [];
  for (const raw of content) {
    if (!raw || typeof raw !== "object") continue;
    const part = raw as Record<string, unknown>;
    if (part.type === "text" && typeof part.text === "string") {
      if (allowArrayText) safe.push({ type: "text", text: part.text });
      continue;
    }
    if (
      (part.type === "tool-call" || part.type === "tool-result") &&
      typeof part.toolCallId === "string" &&
      typeof part.toolName === "string" &&
      ALLOWED_MAIN_TOOLS.has(part.toolName) &&
      !PRIVATE_CONVERSATION_TOOLS.has(part.toolName)
    ) {
      const outputType = part.output && typeof part.output === "object"
        ? (part.output as { type?: unknown }).type
        : undefined;
      const errored = part.isError === true || outputType === "error-text" || outputType === "error-json";
      safe.push({
        type: "tool",
        toolCallId: part.toolCallId.slice(0, 200),
        toolName: part.toolName,
        status: part.type === "tool-call" ? "called" : errored ? "error" : "completed",
      });
    }
  }
  return safe;
}

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

function validateFormDefinition(form: {
  toolCallId: string;
  title: string;
  description?: string;
  fields: Array<{
    name: string;
    label: string;
    type: "text" | "number" | "radio" | "textarea";
    placeholder?: string;
    options?: string[];
    unit?: string;
    required: boolean;
    hint?: string;
  }>;
}, maxDescription = 500): void {
  requireBoundedText(form.toolCallId, "toolCallId", 200);
  requireBoundedText(form.title, "title", 120);
  if (form.description && form.description.length > maxDescription) {
    fail("INVALID_FORM", "Form description is too long.");
  }
  if (form.fields.length < 1 || form.fields.length > MAX_FORM_FIELDS) {
    fail("INVALID_FORM", `Form must contain 1-${MAX_FORM_FIELDS} fields.`);
  }
  const names = new Set<string>();
  for (const field of form.fields) {
    if (!/^[a-z][a-z0-9_]{0,39}$/i.test(field.name) || names.has(field.name)) {
      fail("INVALID_FORM", "Form field names must be unique identifiers.");
    }
    names.add(field.name);
    requireBoundedText(field.label, "field label", 160);
    if (field.type === "radio") {
      if (!field.options || field.options.length < 2 || field.options.length > 10) {
        fail("INVALID_FORM", "Radio fields require 2-10 options.");
      }
      for (const option of field.options) requireBoundedText(option, "radio option", 120);
    } else if (field.options !== undefined) {
      fail("INVALID_FORM", "Only radio fields may define options.");
    }
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function checkedApprovalProposal(payload: string, form: NonNullable<Parameters<typeof validateFormDefinition>[0]>): AuthorityPacket {
  const packet = checkedPacket(payload);
  let expected;
  try {
    expected = approvalForm(packet, form.toolCallId);
  } catch {
    fail("INVALID_AUTHORIZATION", "The complete approval review is too large; split the operations.");
  }
  if (canonical(expected) !== canonical(form)) {
    fail("AUTHORIZATION_DISPLAY_MISMATCH", "The displayed review differs from the private exact-operation packet.");
  }
  return packet;
}

const PRIVATE_CONVERSATION_TOOLS = new Set(["interpret_request", "execute_conversation", "complete_auxiliary", "port_information", "manage_quote", "supplied_quote", "official_quote", "read_quotes", "compare_quotes", "finish_turn"]);
const RETIRED_TOOLS = new Set(["interpret_request", "execute_conversation", "complete_auxiliary", "consult_port_agent", "calculate_supplied_quote"]);
const ALLOWED_MAIN_TOOLS = new Set([
  ...PRIVATE_CONVERSATION_TOOLS,
  "consult_port_agent",
  "calculate_charges",
  "calculate_charge_batch",
  "calculate_supplied_quote",
  "calculate_elapsed_time",
  "search_vessels",
  "get_vessel",
  "ask_user_input",
  "remember_memory", "recall_memory", "forget_memory", "write_scratchpad", "read_scratchpad",
]);

function validateToolHistory(
  messages: Array<{ role: string; content: unknown }>,
  historical = false,
): { unresolvedAsk: { toolCallId: string; input: unknown } | null } {
  const calls = new Map<string, { toolName: string; input: unknown; position: number }>();
  const results = new Map<string, { toolName: string; position: number }>();
  let position = 0;
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    const callsInMessage: string[] = [];
    for (const part of message.content) {
      position += 1;
      if (!part || typeof part !== "object") continue;
      const candidate = part as {
        type?: unknown;
        toolName?: unknown;
        toolCallId?: unknown;
        input?: unknown;
        output?: unknown;
      };
      if (candidate.type === "tool-result") {
        const output = candidate.output as { type?: unknown; value?: unknown } | undefined;
        if (!historical && output?.type === "json" && output.value && typeof output.value === "object" && "discardedQuoteDrafts" in output.value) {
          fail("UNTRUSTED_DRAFT_DISCARD", "Only a native review response can discard quotation drafts.");
        }
        if (typeof candidate.toolCallId !== "string" || typeof candidate.toolName !== "string") {
          fail("INVALID_TOOL_RESULT", "Tool result is malformed.");
        }
        if (results.has(candidate.toolCallId)) {
          fail("DUPLICATE_TOOL_RESULT", "Duplicate tool result in migration output.");
        }
        results.set(candidate.toolCallId, { toolName: candidate.toolName, position });
        continue;
      }
      if (candidate.type === "tool-call") {
        if (!historical && typeof candidate.toolName === "string" && RETIRED_TOOLS.has(candidate.toolName)) fail("RETIRED_TOOL", "Retired orchestration cannot write new messages.");
        if (typeof candidate.toolName !== "string" || !ALLOWED_MAIN_TOOLS.has(candidate.toolName)) {
          fail("UNEXPECTED_TOOL", "Unexpected tool call in migration output.");
        }
        if (message.role !== "assistant" || typeof candidate.toolCallId !== "string") {
          fail("INVALID_TOOL_CALL", "Input tool call is malformed.");
        }
        if (calls.has(candidate.toolCallId)) {
          fail("DUPLICATE_TOOL_CALL", "Duplicate tool call in migration output.");
        }
        calls.set(candidate.toolCallId, {
          toolName: candidate.toolName,
          input: candidate.input,
          position,
        });
        callsInMessage.push(candidate.toolName);
      }
    }
    if (callsInMessage.includes("ask_user_input") && callsInMessage.length > 1) {
      fail("MIXED_ASK", "ask_user_input must be the only tool call in its model step.");
    }
  }

  for (const [toolCallId, result] of results) {
    const call = calls.get(toolCallId);
    if (!call) fail("ORPHAN_TOOL_RESULT", "Orphan tool result in migration output.");
    if (call.toolName !== result.toolName || result.position <= call.position) {
      fail("TOOL_RESULT_MISMATCH", "Tool result does not match its call.");
    }
  }

  const unresolved = [...calls.entries()].filter(([toolCallId]) => !results.has(toolCallId));
  if (unresolved.length > 1) fail("UNRESOLVED_TOOLS", "Multiple unresolved tool calls are not allowed.");
  if (unresolved.length === 0) return { unresolvedAsk: null };
  const [toolCallId, call] = unresolved[0]!;
  if (call.toolName !== "ask_user_input") {
    fail("ORPHAN_TOOL_CALL", "Generated tool call has no matching result.");
  }
  return { unresolvedAsk: { toolCallId, input: call.input } };
}

function validateCompletionMessages(
  messages: Array<{ role: string; content: unknown }>,
  form: {
    toolCallId: string;
    title: string;
    description?: string;
    fields: Array<unknown>;
  } | null,
): void {
  const { unresolvedAsk } = validateToolHistory(messages);
  if (!form && unresolvedAsk) {
    fail("ORPHAN_TOOL_CALL", "Input tool call must be persisted as a pending form.");
  }
  if (form && !unresolvedAsk) {
    fail("FORM_MISMATCH", "Pending form requires exactly one matching input tool call.");
  }
  if (form && unresolvedAsk) {
    const call = unresolvedAsk;
    if (!call.input || typeof call.input !== "object" || Array.isArray(call.input)) {
      fail("FORM_MISMATCH", "Pending form does not match the model tool call.");
    }
    const expected = { ...(call.input as object), toolCallId: call.toolCallId };
    if (canonicalJson(expected) !== canonicalJson(form)) {
      fail("FORM_MISMATCH", "Pending form does not match the model tool call.");
    }
  }
}

function validateFormResponse(
  form: Doc<"migrationForms">,
  values: Record<string, string>,
  cancelled: boolean,
): void {
  const allowed = new Set(form.fields.map((field) => field.name));
  for (const [key, raw] of Object.entries(values)) {
    if (!allowed.has(key)) fail("INVALID_FORM_RESPONSE", "Unexpected form field.");
    if (raw.length > MAX_VALUE_CHARS) fail("INVALID_FORM_RESPONSE", "Form value is too long.");
  }
  if (cancelled) return;
  for (const field of form.fields) {
    const value = Object.hasOwn(values, field.name) ? values[field.name].trim() : "";
    if (field.required && !value) {
      fail("INVALID_FORM_RESPONSE", `${field.label} is required.`);
    }
    if (value && field.type === "number" && !Number.isFinite(Number(value))) {
      fail("INVALID_FORM_RESPONSE", `${field.label} must be a number.`);
    }
    if (value && field.type === "radio" && !field.options?.includes(value)) {
      fail("INVALID_FORM_RESPONSE", `${field.label} contains an invalid option.`);
    }
  }
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
      if (run) await ctx.db.patch(run._id, { status: "cancelled", authorization: undefined, authorizationDeclined: undefined, updatedAt: Date.now() });
    }
    if (conversation.pendingFormId) {
      const form = await ctx.db.get(conversation.pendingFormId);
      if (form) {
        const waitingRun = await ctx.db.get(form.runId);
        if (waitingRun) await ctx.db.patch(waitingRun._id, { status: "cancelled", authorization: undefined, authorizationDeclined: undefined, updatedAt: Date.now() });
        await ctx.db.delete(form._id);
      }
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
    const forms = await ctx.db.query("migrationForms").withIndex("by_conversation_and_status", q => q.eq("conversationId", args.conversationId)).take(100);
    for (const row of [...runs, ...forms]) await ctx.db.delete(row._id);
    if (runs.length === 100 || forms.length === 100) await ctx.scheduler.runAfter(0, internal.migration.cleanupConversation, args);
    return null;
  },
});

async function assertUserRunCapacity(
  ctx: MutationCtx,
  ownerId: string,
) {
  const active = await ctx.db
    .query("migrationRuns")
    .withIndex("by_owner_and_status", (q) => q.eq("ownerId", ownerId).eq("status", "active"))
    .take(MAX_ACTIVE_RUNS_PER_USER);
  if (active.length >= MAX_ACTIVE_RUNS_PER_USER) {
    fail("THROTTLED", "Too many active preview requests.");
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
  returns: v.union(v.object({
    conversation: conversationValidator,
    forms: v.array(formProjectionValidator),
  }), v.null()),
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
    const forms = await ctx.db
      .query("migrationForms")
      .withIndex("by_conversation_and_status", (q) => q.eq("conversationId", conversation._id))
      .order("desc")
      .take(200);
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
      forms: forms.map((form) => ({
        id: form._id,
        toolCallId: form.toolCallId,
        title: form.title,
        description: form.description ?? null,
        fields: form.fields,
        status: form.status,
        values: form.values ?? null,
        note: form.note ?? null,
        resolutionReason: form.resolutionReason ?? null,
        resolvedAt: form.resolvedAt ?? null,
      })),
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
        const parts = safeMessageParts(message.content, !(role === "assistant" && run?.publicTextVersion === 1));
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
      if (conversation.pendingFormId || conversation.state === "waiting") {
        fail("PENDING_FORM", "Resolve or cancel the pending form first.");
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
    await ctx.scheduler.runAt(leaseExpiresAt, internal.migration.recoverRun, {
      runId,
      fence,
    });
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

export const resolveFormAndClaim = internalMutation({
  args: {
    ownerId: v.string(),
    conversationId: v.id("migrationConversations"),
    requestId: v.string(),
    payloadHash: v.string(),
    toolCallId: v.string(),
    values: vFormValues,
    cancelled: v.boolean(),
    note: v.optional(v.string()),
    modelAlias: vModelAlias,
    expectedRevision: v.number(),
  },
  returns: claimResultValidator,
  handler: async (ctx, args) => {
    requireMigrationDevEnabled();
    const prior = await ctx.db
      .query("migrationRuns")
      .withIndex("by_owner_and_request_id", (q) =>
        q.eq("ownerId", args.ownerId).eq("requestId", args.requestId),
      )
      .unique();
    if (prior) {
      if (prior.payloadHash !== args.payloadHash) {
        fail("IDEMPOTENCY_CONFLICT", "Request ID was already used for different input.");
      }
      if (prior.conversationId !== args.conversationId) {
        fail("FORM_MISMATCH", "The replay belongs to another conversation.");
      }
      const replayConversation = await requireConversation(ctx, prior.conversationId, args.ownerId);
      let linkedAuthorizationForm = false;
      if (prior.authorization || prior.authorizationDeclined) {
        const sourceForm = await ctx.db
          .query("migrationForms")
          .withIndex("by_conversation_and_tool_call_id", (q) =>
            q.eq("conversationId", replayConversation._id).eq("toolCallId", args.toolCallId),
          )
          .unique();
        linkedAuthorizationForm = Boolean(
          sourceForm?.authorization &&
          sourceForm.ownerId === args.ownerId &&
          sourceForm.resolvedAt === prior.startedAt &&
          (!prior.authorization || sourceForm.authorization.payload === prior.authorization.payload),
        );
        if (!linkedAuthorizationForm) fail("FORM_MISMATCH", "The replay does not match the approved form.");
      }
      const live = prior.status === "active" && prior.leaseExpiresAt > Date.now() &&
        replayConversation.activeRunId === prior._id && replayConversation.state === "running" &&
        (!prior.authorization || prior.authorization.expiresAt > Date.now()) &&
        await runMemoryCurrent(ctx, prior);
      return {
        conversationId: replayConversation._id,
        runId: prior._id,
        threadId: replayConversation.agentThreadId,
        promptMessageId: prior.promptMessageId,
        fence: prior.fence,
        revision: replayConversation.revision,
        replayed: true,
        ...(live && prior.authorization && linkedAuthorizationForm ? { authorizationExecution: true } : {}),
        ...(live && prior.authorizationDeclined && linkedAuthorizationForm ? { authorizationDeclined: true } : {}),
      };
    }

    const conversation = await requireConversation(ctx, args.conversationId, args.ownerId);
    if (conversation.revision !== args.expectedRevision) {
      fail("REVISION_CONFLICT", "Conversation changed in another tab.");
    }
    if (!conversation.pendingFormId || conversation.state !== "waiting") {
      fail("NO_PENDING_FORM", "No pending form is available.");
    }
    const form = await ctx.db.get(conversation.pendingFormId);
    if (!form || form.ownerId !== args.ownerId || form.conversationId !== conversation._id || form.toolCallId !== args.toolCallId) {
      fail("FORM_MISMATCH", "Pending form does not match this response.");
    }
    if (form.status !== "pending") fail("FORM_CONSUMED", "Form was already resolved.");
    const waitingRun = await ctx.db.get(form.runId);
    if (!waitingRun || waitingRun.ownerId !== args.ownerId || waitingRun.conversationId !== conversation._id || waitingRun.status !== "waiting" || waitingRun.fence !== form.fence) {
      fail("STALE_AUTHORIZATION", "The form lost its waiting run fence.");
    }
    validateFormResponse(form, args.values, args.cancelled);
    if (args.note && args.note.length > MAX_VALUE_CHARS) {
      fail("INVALID_FORM_RESPONSE", "Form note is too long.");
    }
    let packet: AuthorityPacket | undefined;
    const blankNote = !(args.note ?? "").trim();
    const approved = Boolean(form.authorization && !args.cancelled && blankNote && args.values.decision === APPROVE);
    const declined = Boolean(form.authorization && blankNote && (args.cancelled || args.values.decision === REJECT));
    const resolutionReason = !blankNote ? "note" as const : approved ? "approved" as const : args.cancelled ? "cancelled" as const : declined ? "rejected" as const : "submitted" as const;
    if (form.authorization && approved) {
      if (form.authorization.expiresAt <= Date.now()) fail("AUTHORIZATION_EXPIRED", "The exact-operation review expired; request a fresh review.");
      packet = checkedApprovalProposal(form.authorization.payload, {
        toolCallId: form.toolCallId,
        title: form.title,
        description: form.description,
        fields: form.fields,
      });
      await validateAuthorityBase(ctx, conversation, packet, await draftHistory(ctx, conversation));
    }
    const discardedQuoteDrafts = declined && form.authorization
      ? await discardedDraftsForReview(await draftHistory(ctx, conversation), conversation._id,
        discardablePackets([form.authorization.payload, ...(form.continuation ?? []).map(item => item.payload)]),
        args.cancelled ? "cancelled" : "rejected")
      : undefined;
    await assertUserRunCapacity(ctx, args.ownerId);
    await consumeBudget(ctx, args.ownerId, "run");

    const now = Date.now();
    const saved = await saveMessages(ctx, components.agent, {
      threadId: conversation.agentThreadId,
      userId: args.ownerId,
      messages: [{
        role: "tool",
        content: [{
          type: "tool-result",
          toolCallId: form.toolCallId,
          toolName: "ask_user_input",
          output: {
            type: "json",
            value: { cancelled: args.cancelled, values: args.values, note: args.note ?? "", resolutionReason, ...(discardedQuoteDrafts ? { discardedQuoteDrafts } : {}) },
          },
        }],
      }],
    });
    const promptMessageId = saved.messages[0]?._id;
    if (!promptMessageId) fail("INTERNAL", "Form response persistence failed.");
    await ctx.db.patch(form._id, {
      status: args.cancelled ? "cancelled" : "submitted",
      values: args.values,
      note: args.note,
      resolutionReason,
      resolvedAt: now,
    });
    await ctx.db.patch(waitingRun._id, { status: "completed", updatedAt: now });

    const fence = conversation.nextFence;
    const revision = conversation.revision + 1;
    const leaseExpiresAt = now + RUN_LEASE_MS;
    const runId = await ctx.db.insert("migrationRuns", {
      conversationId: conversation._id,
      ownerId: args.ownerId,
      requestId: args.requestId,
      payloadHash: args.payloadHash,
      modelAlias: args.modelAlias,
      fence,
      revision,
      status: "active",
      leaseExpiresAt,
      promptMessageId,
      promptOrder: saved.messages[0].order,
      promptStepOrder: saved.messages[0].stepOrder,
      memoryEpoch: memoryEnabled() ? (await ensureMemory(ctx, args.ownerId)).epoch : undefined,
      ...(approved ? { authorization: form.authorization } : {}),
      ...(declined ? { authorizationDeclined: true } : {}),
      authorizationResolutionReason: resolutionReason,
      ...((approved || resolutionReason === "submitted") && form.continuation?.length ? {authorizationContinuation:form.continuation} : {}),
      ...(approved&&form.remainingObligations?{remainingObligations:form.remainingObligations}:{}),
      startedAt: now,
      updatedAt: now,
    });
    if (approved && packet) {
      await enqueueAuthorizedMemory(ctx, args.ownerId, conversation._id, form._id, runId, packet);
    }
    await ctx.db.patch(conversation._id, {
      revision,
      nextFence: fence + 1,
      state: "running",
      activeRunId: runId,
      pendingFormId: undefined,
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
      ...(approved ? { authorizationExecution: true } : {}),
      ...(declined ? { authorizationDeclined: true } : {}),
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
    authorization: v.optional(vAuthorization),
    authorizationDeclined: v.optional(v.boolean()),
    authorizationResolutionReason: v.optional(v.string()),
    authorizationContinuation: v.optional(v.array(v.object({payload:v.string(),toolCallId:v.string(),title:v.string(),description:v.optional(v.string()),fields:v.array(vFormField),reviewGroup:v.string()}))),
    remainingObligations:v.optional(vRemainingObligations),
    authorityContext: v.object({
      quotes: v.array(vQuoteApproval),
      comparisons: v.array(v.string()),
    }),
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
    const messages = await restoreNativeDraftDiscards(ctx, conversation, [...result.page]
      .sort((a, b) => a.order - b.order || a.stepOrder - b.stepOrder)
      .flatMap((doc) => (doc.message ? [doc.message] : [])));
    if (messages.reduce((total, message) => total + JSON.stringify(message).length, 0) > MAX_CONTEXT_CHARS) {
      fail("CONTEXT_LIMIT", `Conversation exceeds ${MAX_CONTEXT_CHARS} serialized context characters.`);
    }
    if (messages.length > 0 && validateToolHistory(messages, true).unresolvedAsk) {
      fail("CONTEXT_INVALID", "Conversation contains an unresolved historical form.");
    }
    return {
      conversationId: conversation._id,
      threadId: conversation.agentThreadId,
      modelAlias: run.modelAlias,
      promptMessageId: run.promptMessageId,
      revision: conversation.revision,
      messages,
      ...(run.authorization ? { authorization: run.authorization } : {}),
      ...(run.authorizationDeclined ? { authorizationDeclined: true } : {}),
      ...(run.authorizationResolutionReason ? { authorizationResolutionReason: run.authorizationResolutionReason } : {}),
      ...(run.authorizationContinuation ? { authorizationContinuation: run.authorizationContinuation } : {}),
      ...(run.remainingObligations?{remainingObligations:run.remainingObligations}:{}),
      authorityContext: {
        quotes: conversation.quoteApprovals ?? [],
        comparisons: conversation.comparisonApprovals ?? [],
      },
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
    if (validateToolHistory(args.responseMessages).unresolvedAsk) {
      fail("UNRESOLVED_TOOL_CALL", "Unresolved form calls must be persisted atomically at completion.");
    }
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
    if (run.authorization) fail("AUTHORIZATION_ATOMIC", "Approved operations must persist once, atomically at completion; intermediate checkpoints are forbidden.");
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
    await validateQuoteReceipts(args.responseMessages, conversation._id, undefined, false,
      hasQuoteDrafts(args.responseMessages) ? await draftHistory(ctx, conversation) : []);
    // Preserve model context and paired tools privately. A provider's plain
    // assistant string is normalized to the private array representation too.
    const privateMessages: typeof args.responseMessages = args.responseMessages.map(message => message.role === "assistant" && typeof message.content === "string"
      ? { ...message, content: [{ type: "text" as const, text: message.content }] } : message);
    await saveMessages(ctx, components.agent, {
      threadId: conversation.agentThreadId,
      userId: args.ownerId,
      promptMessageId: run.promptMessageId,
      messages: privateMessages,
    });
    await ctx.db.patch(run._id, {
      publicTextVersion: 1,
      checkpointStep: args.stepNumber,
      checkpointHash: args.payloadHash,
      checkpointHasText: false,
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

export const completeRun = internalMutation({
  args: {
    ownerId: v.string(),
    runId: v.id("migrationRuns"),
    fence: v.number(),
    responseMessages: v.array(vMessage),
    form: v.union(vFormInput, v.null()),
    finishReason: v.optional(vFinishReason),
    incomplete: v.optional(v.literal(true)),
    authorizationProposal: v.optional(v.string()),
    authorizationContinuation: v.optional(v.array(v.object({payload:v.string(),toolCallId:v.string(),title:v.string(),description:v.optional(v.string()),fields:v.array(vFormField),reviewGroup:v.string()}))),
    remainingObligations:v.optional(vRemainingObligations),
  },
  returns: v.object({ state: vConversationState, revision: v.number(), publicText: v.optional(v.string()) }),
  handler: async (ctx, args): Promise<{ state: "waiting" | "idle" | "error"; revision: number; publicText?: string }> => {
    requireMigrationDevEnabled();
    if (args.responseMessages.length > 12) {
      fail("INVALID_OUTPUT", "Generated message count is out of bounds.");
    }
    try {
      const wireArgs = Object.fromEntries(Object.entries(args).filter(([name]) => name !== "ownerId"));
      assertPublicationFits({ op: "complete", args: wireArgs });
    } catch {
      fail("PUBLICATION_LIMIT", PUBLICATION_LIMIT_MESSAGE);
    }
    let proposalPacket: AuthorityPacket | undefined;
    const stagedOperationIds=new Set<string>();
    if (args.authorizationProposal !== undefined) {
      if (!args.form) fail("INVALID_AUTHORIZATION", "An exact-operation proposal requires its complete review form.");
      validateFormDefinition(args.form, MAX_REVIEW_CHARS);
      proposalPacket = checkedApprovalProposal(args.authorizationProposal, args.form);
      for(const operation of proposalPacket.operations){if(stagedOperationIds.has(operation.id))fail("INVALID_AUTHORIZATION","Duplicate operation ID across review groups.");stagedOperationIds.add(operation.id);}
      if ((args.authorizationContinuation?.length ?? 0) > 15) fail("INVALID_AUTHORIZATION", "Too many staged review groups.");
      for (const successor of args.authorizationContinuation ?? []) {
        const form={toolCallId:successor.toolCallId,title:successor.title,description:successor.description,fields:successor.fields};
        validateFormDefinition(form, MAX_REVIEW_CHARS); const successorPacket=checkedApprovalProposal(successor.payload, form);
        for(const operation of successorPacket.operations){if(stagedOperationIds.has(operation.id))fail("INVALID_AUTHORIZATION","Duplicate operation ID across review groups.");stagedOperationIds.add(operation.id);}
      }
    } else if (args.form) validateFormDefinition(args.form);
    for(const outcome of args.remainingObligations?.outcomes??[])for(const branch of outcome.branches){
      if(branch.disposition==="awaiting_approval"&&!branch.operationId)fail("INVALID_OBLIGATIONS","Awaiting-review obligations require their server operation ID.");
      if(branch.operationId&&!stagedOperationIds.has(branch.operationId))fail("INVALID_OBLIGATIONS","Remaining obligation refers to an operation outside the staged review queue.");
    }
    if (args.authorizationContinuation?.length && !args.form) fail("INVALID_AUTHORIZATION", "Review continuation requires the active native form.");
    if(args.remainingObligations){
      if(new TextEncoder().encode(JSON.stringify(args.remainingObligations)).byteLength>64_000||args.remainingObligations.outcomes.length>256)fail("INVALID_OBLIGATIONS","Remaining obligations exceed the persisted bound.");
      for(const outcome of args.remainingObligations.outcomes){
        if(!outcome.branches.length||outcome.branches.length>256)fail("INVALID_OBLIGATIONS","Remaining obligation branch count is invalid.");
        for(const branch of outcome.branches)if(branch.comparisonCurrency!==undefined&&!/^[A-Z]{3}$/.test(branch.comparisonCurrency)||branch.targets.length>24||branch.targets.some(value=>!value||value.length>120)||branch.questions.some(value=>!value||new TextEncoder().encode(value).byteLength>128_000)||branch.detail!==undefined&&(!branch.detail||new TextEncoder().encode(branch.detail).byteLength>128_000)||branch.operationId!==undefined&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(branch.operationId)||branch.reportingView&&(branch.reportingView.stage==="exact"?branch.reportingView.decimals!==undefined:branch.reportingView.decimals===undefined||!Number.isInteger(branch.reportingView.decimals)||branch.reportingView.decimals<0||branch.reportingView.decimals>8)||branch.quoteState&&(branch.quoteState.quoteIds.length<1||branch.quoteState.quoteIds.length>24||branch.quoteState.quoteIds.some(id=>!id||id.length>100)||!/^[a-f0-9]{64}$/.test(branch.quoteState.digest)))fail("INVALID_OBLIGATIONS","Remaining obligation fields are invalid.");
      }
    }
    if(args.remainingObligations?.outcomes.length&&(!proposalPacket||!args.form))fail("INVALID_OBLIGATIONS","Remaining obligations require the active exact review.");
    if (args.authorizationContinuation?.length && args.authorizationProposal === undefined) for (const successor of args.authorizationContinuation) {
      const successorForm={toolCallId:successor.toolCallId,title:successor.title,description:successor.description,fields:successor.fields};
      validateFormDefinition(successorForm,MAX_REVIEW_CHARS);checkedApprovalProposal(successor.payload,successorForm);
    }
    validateCompletionMessages(args.responseMessages, args.form);
    const publicAnswers = args.responseMessages.filter(message => message.role === "assistant" && typeof message.content === "string");
    if (publicAnswers.length > 1) fail("INVALID_PUBLIC_ANSWER", "Completion requires one canonical public answer, not several independent reconstructions.");
    const finalHasText = publicAnswers.some(message => typeof message.content === "string" && message.content.trim().length > 0);
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
    let executionPacket: AuthorityPacket | undefined;
    const persisted = run.authorization || proposalPacket || hasQuoteDrafts(args.responseMessages) ? await draftHistory(ctx, conversation) : [];
    if (run.authorization) {
      if (args.authorizationProposal !== undefined || args.form) {
        fail("INVALID_AUTHORIZATION", "An approved execution cannot open or replace another review frame.");
      }
      if (run.authorization.expiresAt <= Date.now()) {
        fail("AUTHORIZATION_EXPIRED", "The exact-operation approval expired before execution.");
      }
      executionPacket = checkedPacket(run.authorization.payload);
      await validateQuoteReceipts(args.responseMessages, conversation._id, executionPacket, true, persisted);
    } else {
      await validateQuoteReceipts(args.responseMessages, conversation._id, undefined, false, persisted);
      if (proposalPacket) await validateAuthorityBase(ctx, conversation, proposalPacket, [...persisted, ...args.responseMessages]);
    }
    const terminalHasText = finalHasText;
    const terminalFinishReason = args.finishReason ?? run.checkpointFinishReason;
    // Incomplete work is an explicit server disposition, never a fabricated
    // successful model stop. Keep the raw checkpoint reason and failure state.
    if (args.incomplete && (run.authorization || !finalHasText || !["stop", "tool-calls", "length"].includes(terminalFinishReason ?? ""))) {
      fail("INVALID_INCOMPLETE_OUTPUT", "Incomplete work requires a readable partial answer and a bounded model exit, without approved execution.");
    }
    if (!args.form && (!terminalHasText || terminalFinishReason !== "stop" && !args.incomplete)) {
      fail("INCOMPLETE_OUTPUT", "Model returned no readable answer with a clean terminal stop.");
    }

    const ledger = executionPacket ? await authorityLedgerUpdates(conversation, executionPacket) : undefined;
    const appliedOperationIds = new Set(executionPacket?.operations.map(operation => operation.id) ?? []);
    const remainingAfterApproval = run.remainingObligations ? { ...run.remainingObligations, outcomes: run.remainingObligations.outcomes.flatMap(outcome => {
      const branches = outcome.branches.filter(branch => !(branch.disposition === "awaiting_approval" && branch.operationId && appliedOperationIds.has(branch.operationId)));
      return branches.length ? [{ ...outcome, branches }] : [];
    }) } : undefined;
    const successor = args.form ? undefined : run.authorizationContinuation?.[0];
    let successorDeferred = false;
    if (successor) {
      // Validate before publishing. Only validation is recoverable here; a
      // persistence error below must roll the whole mutation back.
      try {
        const packet = checkedApprovalProposal(successor.payload, { toolCallId: successor.toolCallId, title: successor.title, description: successor.description, fields: successor.fields });
        await validateAuthorityBase(ctx, { ...conversation, ...ledger }, packet, [...persisted, ...args.responseMessages]);
      } catch { successorDeferred = true; }
    }
    const deferredNotice = "Remaining exact-review work was deferred because its current saved base could not be validated. No successor review was opened; send a follow-up to restage it.";
    let publicText = publicAnswers.length ? String(publicAnswers[0].content) : undefined;
    if (successorDeferred) publicText = [publicText, deferredNotice].filter(Boolean).join("\n\n");
    const publicResult = publicText === undefined ? {} : { publicText };
    const responseMessages = args.responseMessages.map(message => message.role === "assistant" && typeof message.content === "string"
      ? { ...message, content: publicText ?? "" } : message);
    try { assertPublicationFits({ op: "complete", args: { ...Object.fromEntries(Object.entries(args).filter(([name]) => name !== "ownerId")), responseMessages } }); }
    catch { fail("PUBLICATION_LIMIT", PUBLICATION_LIMIT_MESSAGE); }

    // A final public answer is the server's canonical plain string. All model
    // arrays retained in this run remain context, not a second public answer.
    await ctx.db.patch(run._id, { publicTextVersion: 1 });
    if (args.responseMessages.length > 0) {
      await saveMessages(ctx, components.agent, {
        threadId: conversation.agentThreadId,
        userId: args.ownerId,
        promptMessageId: run.promptMessageId,
        messages: responseMessages,
      });
    }
    const now = Date.now();
    const revision = conversation.revision + 1;
    if (args.form) {
      const replay = await ctx.db
        .query("migrationForms")
        .withIndex("by_conversation_and_tool_call_id", (q) =>
          q.eq("conversationId", conversation._id).eq("toolCallId", args.form!.toolCallId),
        )
        .unique();
      if (replay) fail("TOOL_REPLAY", "Tool call was already consumed.");
      const formId = await ctx.db.insert("migrationForms", {
        conversationId: conversation._id,
        ownerId: args.ownerId,
        runId: run._id,
        fence: run.fence,
        toolCallId: args.form.toolCallId,
        title: args.form.title,
        description: args.form.description,
        fields: args.form.fields,
        status: "pending",
        ...(proposalPacket ? { authorization: { payload: args.authorizationProposal!, expiresAt: now + AUTHORITY_TTL_MS } } : {}),
        ...(args.authorizationContinuation?.length ? {continuation:args.authorizationContinuation} : {}),
        ...(args.remainingObligations?.outcomes.length?{remainingObligations:args.remainingObligations}:{}),
        createdAt: now,
      });
      await ctx.db.patch(run._id, { status: "waiting", ...(args.incomplete ? { errorCode: "INCOMPLETE_WORK" } : {}), updatedAt: now });
      await ctx.db.patch(conversation._id, {
        revision,
        state: "waiting",
        activeRunId: undefined,
        pendingFormId: formId,
        updatedAt: now,
      });
      return { state: "waiting", revision, ...publicResult };
    }

    if (successor) {
      if (!successorDeferred) {
        const rest=run.authorizationContinuation!.slice(1);
        await saveMessages(ctx,components.agent,{threadId:conversation.agentThreadId,userId:args.ownerId,promptMessageId:run.promptMessageId,messages:[{role:"assistant",content:[{type:"tool-call",toolName:"ask_user_input",toolCallId:successor.toolCallId,input:{title:successor.title,description:successor.description,fields:successor.fields}}]}]});
        const formId=await ctx.db.insert("migrationForms",{conversationId:conversation._id,ownerId:args.ownerId,runId:run._id,fence:run.fence,toolCallId:successor.toolCallId,title:successor.title,description:successor.description,fields:successor.fields,status:"pending",authorization:{payload:successor.payload,expiresAt:now+AUTHORITY_TTL_MS},...(rest.length?{continuation:rest}:{}),...(remainingAfterApproval?.outcomes.length?{remainingObligations:remainingAfterApproval}:{}),createdAt:now});
        await ctx.db.patch(run._id,{status:"waiting",authorization:undefined,authorizationContinuation:undefined,updatedAt:now});
        await ctx.db.patch(conversation._id,{revision,state:"waiting",activeRunId:undefined,pendingFormId:formId,...(ledger??{}),updatedAt:now});
        return {state:"waiting",revision,...publicResult};
      } else {
        await ctx.db.patch(run._id,{status:"completed",authorization:undefined,authorizationContinuation:undefined,updatedAt:now});
        await ctx.db.patch(conversation._id,{revision,state:"idle",activeRunId:undefined,...(ledger??{}),lastError:"Remaining exact-review work was deferred because its base changed; completed approved work was preserved.",updatedAt:now});
        return {state:"idle",revision,...publicResult};
      }
    }
    await ctx.db.patch(run._id, { status: args.incomplete ? "error" : "completed", ...(args.incomplete ? { errorCode: "INCOMPLETE_WORK" } : {}), updatedAt: now });
    await ctx.db.patch(conversation._id, {
      revision,
      state: args.incomplete ? "error" : "idle",
      activeRunId: undefined,
      ...(ledger ?? {}),
      ...(args.incomplete ? { lastError: "Some requested work remains incomplete. Tool-backed partial results were preserved; send a follow-up to continue." } : {}),
      updatedAt: now,
    });
    return { state: args.incomplete ? "error" : "idle", revision, ...publicResult };
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
      lastError: "The response failed. Retry explicitly when ready.",
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
      lastError: "The response deadline expired. Retry explicitly when ready.",
      updatedAt: now,
    });
    return true;
  },
});
