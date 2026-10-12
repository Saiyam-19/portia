import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { memoryOperation } from "./memoryValidators";
import {
  vConversationState,
  vFormField,
  vFormStatus,
  vFormValues,
  vFinishReason,
  vModelAlias,
  vRunStatus,
} from "./validators";

export default defineSchema({
  memoryNamespaces: defineTable({
    ownerId: v.string(), epoch: v.number(), revision: v.number(), fence: v.number(),
    nextSequence: v.number(), appliedSequence: v.number(), blockedThrough: v.number(),
    appliedIndex: v.array(v.object({key:v.string(),hash:v.string(),sources:v.array(v.string())})),
    factIndex: v.array(v.object({key:v.string(),hash:v.string(),sources:v.array(v.string())})),
    snapshotId: v.optional(v.id("memorySnapshots")),
    lease: v.optional(v.object({token:v.string(),fence:v.number(),expiresAt:v.number(),through:v.number()})),
  }).index("by_owner",["ownerId"]),
  memorySnapshots: defineTable({namespaceId:v.id("memoryNamespaces"),image:v.string()}).index("by_namespace",["namespaceId"]),
  memoryOperations: defineTable({
    namespaceId:v.id("memoryNamespaces"),requestId:v.string(),hash:v.string(),sequence:v.number(),epoch:v.number(),
    status:v.union(v.literal("pending"),v.literal("done")),operation:v.optional(memoryOperation),
  }).index("by_namespace_and_request",["namespaceId","requestId"]).index("by_namespace_and_status_and_sequence",["namespaceId","status","sequence"]),
  memoryNoteReceipts: defineTable({ownerId:v.string(),conversationId:v.id("migrationConversations"),requestId:v.string(),hash:v.string(),revision:v.number()})
    .index("by_owner_and_request",["ownerId","requestId"]).index("by_owner",["ownerId"]).index("by_conversation",["conversationId"]),
  memoryScratchpads: defineTable({
    ownerId:v.string(),conversationId:v.id("migrationConversations"),epoch:v.number(),revision:v.number(),
    markdown:v.string(),requestId:v.string(),hash:v.string(),updatedAt:v.number(),
  }).index("by_conversation",["conversationId"]).index("by_owner_and_epoch",["ownerId","epoch"]),

  requestBudgets: defineTable({ ownerId: v.string(), kind: v.string(), timestamps: v.array(v.number()) }).index("by_owner_and_kind", ["ownerId", "kind"]),

  migrationConversations: defineTable({
    ownerId: v.string(),
    title: v.string(),
    agentThreadId: v.string(),
    revision: v.number(),
    nextFence: v.number(),
    state: vConversationState,
    activeRunId: v.optional(v.id("migrationRuns")),
    pendingFormId: v.optional(v.id("migrationForms")),
    lastError: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_owner_and_updated_at", ["ownerId", "updatedAt"])
    .index("by_owner_and_state", ["ownerId", "state"]),

  migrationRuns: defineTable({
    conversationId: v.id("migrationConversations"),
    ownerId: v.string(),
    requestId: v.string(),
    payloadHash: v.string(),
    modelAlias: vModelAlias,
    fence: v.number(),
    revision: v.number(),
    status: vRunStatus,
    leaseExpiresAt: v.number(),
    promptMessageId: v.string(),
    promptOrder: v.optional(v.number()),
    promptStepOrder: v.optional(v.number()),
    memoryEpoch: v.optional(v.number()),
    checkpointStep: v.optional(v.number()),
    checkpointHash: v.optional(v.string()),
    checkpointHasText: v.optional(v.boolean()),
    checkpointFinishReason: v.optional(vFinishReason),
    errorCode: v.optional(v.string()),
    startedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_and_request_id", ["ownerId", "requestId"])
    .index("by_conversation_and_status", ["conversationId", "status"])
    .index("by_conversation_and_prompt_message", ["conversationId", "promptMessageId"])
    .index("by_conversation_and_prompt_position", ["conversationId", "promptOrder", "promptStepOrder"])
    .index("by_owner_and_status", ["ownerId", "status"]),

  migrationForms: defineTable({
    conversationId: v.id("migrationConversations"),
    ownerId: v.string(),
    runId: v.id("migrationRuns"),
    fence: v.number(),
    toolCallId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    fields: v.array(vFormField),
    status: vFormStatus,
    values: v.optional(vFormValues),
    note: v.optional(v.string()),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_conversation_and_status", ["conversationId", "status"])
    .index("by_conversation_and_tool_call_id", ["conversationId", "toolCallId"]),
});
