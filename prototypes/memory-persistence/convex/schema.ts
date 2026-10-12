import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { operation, lease } from "./validators";
export default defineSchema({
  namespaces: defineTable({
    owner: v.string(), workspace: v.string(), deleted: v.boolean(),
    revision: v.number(), epoch: v.number(), fence: v.number(),
    nextSequence: v.number(), appliedSequence: v.number(),
    scratchpadKeys: v.array(v.string()),
    snapshot: v.optional(v.id("snapshots")), lease: v.optional(lease),
  }).index("by_owner_and_workspace", ["owner", "workspace"]),
  snapshots: defineTable({ namespace: v.id("namespaces"), bytes: v.bytes() })
    .index("by_namespace", ["namespace"]),
  operations: defineTable({
    namespace: v.id("namespaces"), requestId: v.string(), hash: v.string(), sequence: v.number(),
    status: v.union(v.literal("pending"), v.literal("done")),
    operation: v.optional(operation), revision: v.optional(v.number()),
  }).index("by_namespace_and_requestId", ["namespace", "requestId"])
    .index("by_namespace_and_status_and_sequence", ["namespace", "status", "sequence"])
    .index("by_namespace", ["namespace"]),
  tombstones: defineTable({ namespace: v.id("namespaces"), key: v.string() })
    .index("by_namespace_and_key", ["namespace", "key"]),
});
