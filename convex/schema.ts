import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { memoryOperation } from "./memoryValidators";
import { vConversationState, vFinishReason, vModelAlias, vRunStatus } from "./validators";

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
    creationRequestId: v.optional(v.string()),
    creationPayloadHash: v.optional(v.string()),
    initialIntent: v.optional(v.object({requestId:v.string(),question:v.string(),modelAlias:vModelAlias})),
    lastError: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_owner_and_updated_at", ["ownerId", "updatedAt"])
    .index("by_owner_and_creation_request", ["ownerId", "creationRequestId"])
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

  // "My fleet": one login is one company in v1, so ships belong to the account.
  fleetShips: defineTable({
    ownerId: v.string(), name: v.string(), nameKey: v.string(), imo: v.optional(v.string()),
    grt: v.string(), nrt: v.optional(v.string()), loa: v.optional(v.string()),
    type: v.optional(v.string()), status: v.optional(v.string()), updatedAt: v.number(),
  }).index("by_owner_and_name", ["ownerId", "nameKey"]).index("by_owner_and_imo", ["ownerId", "imo"]),

  // Company documents: uploaded straight to storage, read by a background job into passages.
  companyDocuments: defineTable({
    ownerId: v.string(), title: v.string(), fileName: v.string(), format: v.string(), size: v.number(),
    storageId: v.id("_storage"), status: v.union(v.literal("processing"), v.literal("ready"), v.literal("failed")),
    error: v.optional(v.string()), pages: v.optional(v.number()), passages: v.optional(v.number()),
    createdAt: v.number(), updatedAt: v.number(),
  }).index("by_owner", ["ownerId", "createdAt"]),
  companyPassages: defineTable({
    ownerId: v.string(), documentId: v.id("companyDocuments"), storageId: v.id("_storage"), page: v.number(), order: v.number(), text: v.string(),
  }).index("by_document", ["documentId", "order"]).searchIndex("search_text", { searchField: "text", filterFields: ["ownerId"] }),

  // Rates a company has agreed with a port, shown beside the published ones.
  agreedRates: defineTable({
    ownerId: v.string(), portId: v.string(), chargeType: v.string(), kind: v.union(v.literal("discount"), v.literal("fixed")),
    percent: v.optional(v.string()), amount: v.optional(v.string()), currency: v.optional(v.string()), note: v.optional(v.string()), updatedAt: v.number(),
  }).index("by_owner_and_port", ["ownerId", "portId"]),

  // Monthly checks that each rate document we read is unchanged on the port's website.
  sourceChecks: defineTable({
    url: v.string(), portId: v.string(), documentId: v.string(), checkedAt: v.number(),
    status: v.union(v.literal("same"), v.literal("changed"), v.literal("unreachable")), httpStatus: v.optional(v.number()), sha256: v.optional(v.string()),
  }).index("by_url", ["url", "checkedAt"]),
});
