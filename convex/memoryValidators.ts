import { v } from "convex/values";
export const memoryOperation = v.union(
  v.object({ kind: v.literal("remember"), key: v.string(), value: v.string(), source: v.string() }),
  v.object({ kind: v.literal("forget"), key: v.string() }),
  v.object({ kind: v.literal("delete_source"), source: v.string() }),
  v.object({ kind: v.literal("clear") }),
);
export const memoryActor = { ownerId: v.string(), runId: v.optional(v.id("migrationRuns")), runFence: v.optional(v.number()) };
export const workspaceResult = v.object({ stdout: v.string(), stderr: v.string(), exitCode: v.number() });
export const workspaceEnvelope = v.object({
  operations: v.array(memoryOperation), markdown: v.optional(v.string()),
  conversationId: v.id("migrationConversations"), runId: v.id("migrationRuns"), receiptId: v.id("workspaceReceipts"),
});
export const workspaceReplay = v.union(v.null(),
  v.object({ status: v.literal("pending"), epoch: v.number() }),
  v.object({ status: v.literal("done"), epoch: v.number(), result: workspaceResult }),
);
export const memoryState = v.object({ epoch: v.number(), revision: v.number(), pending: v.boolean(), blocked: v.boolean(), image: v.union(v.string(), v.null()), scratchpad: v.string(), scratchpadRevision: v.number() });
export const memoryClaim = v.union(v.null(), v.object({ token: v.string(), fence: v.number(), epoch: v.number(), baseRevision: v.number(), through: v.number(), image: v.union(v.string(), v.null()), operations: v.array(memoryOperation) }));
