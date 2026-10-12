import { v } from "convex/values";
export const operation = v.union(
  v.object({ kind: v.literal("put"), key: v.string(), value: v.string(), source: v.string() }),
  v.object({ kind: v.literal("forget"), key: v.string() }),
  v.object({ kind: v.literal("scratchpad"), key: v.string(), value: v.string() }),
);
export const lease = v.object({ token: v.string(), fence: v.number(), expiresAt: v.number(), through: v.number() });
export const receipt = v.object({ status: v.union(v.literal("pending"), v.literal("done")), sequence: v.number(), revision: v.union(v.number(), v.null()) });
export const snapshotView = v.object({ revision: v.number(), epoch: v.number(), pending: v.boolean(), bytes: v.union(v.bytes(), v.null()) });
export const claimView = v.union(v.null(), v.object({
  token: v.string(), fence: v.number(), through: v.number(), baseRevision: v.number(),
  expiresAt: v.number(), bytes: v.union(v.bytes(), v.null()), operations: v.array(operation),
}));
