import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { vArtifactRef, vConversationState, vForm, vFormResponse, vModelAlias, vSegment, vTurnStatus, vUsage } from "./validators";

export default defineSchema({
  conversations: defineTable({
    ownerId: v.string(),
    title: v.string(),
    pinned: v.optional(v.boolean()),
    modelAlias: vModelAlias,
    /** libfx session holding the model-facing history; set once its first prompt is accepted. */
    fxSessionId: v.optional(v.string()),
    state: vConversationState,
    activeTurnId: v.optional(v.id("turns")),
    pendingForm: v.optional(vForm),
    nextOrder: v.number(),
    /** Memory files (path → content hash) this conversation's model context already contains. */
    memorySeen: v.array(v.object({ path: v.string(), hash: v.string() })),
    /** Set after compaction or a failed prompt: the next turn carries a full memory snapshot. */
    memoryRefresh: v.boolean(),
    artifactIds: v.optional(v.array(v.id("artifacts"))),
    artifactSeen: v.optional(v.array(vArtifactRef)),
    updatedAt: v.number(),
  })
    .index("by_owner_and_updated_at", ["ownerId", "updatedAt"])
    .index("by_fx_session", ["fxSessionId"]),

  turns: defineTable({
    conversationId: v.id("conversations"),
    ownerId: v.string(),
    requestId: v.string(),
    order: v.number(),
    prompt: v.string(),
    formResponse: v.optional(vFormResponse),
    attachments: v.optional(v.array(vArtifactRef)),
    segments: v.array(vSegment),
    status: vTurnStatus,
    error: v.optional(v.string()),
    usage: v.optional(vUsage),
    startedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_conversation_and_order", ["conversationId", "order"])
    .index("by_owner_and_request", ["ownerId", "requestId"]),

  /** Long-term, cross-conversation memory: small markdown files the agent sees under /memories. */
  memories: defineTable({
    ownerId: v.string(),
    path: v.string(),
    content: v.string(),
    hash: v.string(),
    conversationId: v.optional(v.id("conversations")),
    updatedAt: v.number(),
  }).index("by_owner_and_path", ["ownerId", "path"]),
  memoryHeads: defineTable({ ownerId: v.string(), version: v.number() }).index("by_owner", ["ownerId"]),

  /** Per-conversation working notes (/notes/current.md); they anchor long tasks across compaction. */
  notes: defineTable({
    conversationId: v.id("conversations"),
    ownerId: v.string(),
    content: v.string(),
    updatedAt: v.number(),
  }).index("by_conversation", ["conversationId"]),

  requestBudgets: defineTable({ ownerId: v.string(), kind: v.string(), timestamps: v.array(v.number()) })
    .index("by_owner_and_kind", ["ownerId", "kind"]),

  artifacts: defineTable({
    ownerId: v.string(), name: v.string(), sourceName: v.optional(v.string()), mimeType: v.string(), size: v.number(),
    fileKey: v.string(), markdownKey: v.optional(v.string()),
    retiredKeys: v.optional(v.array(v.string())),
    revision: v.number(),
    status: v.union(v.literal('uploading'), v.literal("processing"), v.literal("ready"), v.literal("error"), v.literal("deleting")),
    error: v.optional(v.string()), createdAt: v.number(), updatedAt: v.number(),
  })
    .index("by_owner_and_updated_at", ["ownerId", "updatedAt"])
    .index("by_file_key", ["fileKey"])
    .searchIndex("by_name", { searchField: "name", filterFields: ["ownerId"] }),
});
