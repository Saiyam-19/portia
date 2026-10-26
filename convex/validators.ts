import { v } from "convex/values";

export const vModelAlias = v.union(v.literal("model-1"), v.literal("model-2"));
// "waiting" (on a form) is no longer set; it stays valid only for chats saved before Berthwise v1.
export const vConversationState = v.union(
  v.literal("idle"),
  v.literal("running"),
  v.literal("error"),
  v.literal("stopped"),
  v.literal("waiting"),
);
export const vRunStatus = v.union(
  v.literal("active"),
  v.literal("completed"),
  v.literal("error"),
  v.literal("cancelled"),
  v.literal("expired"),
  v.literal("waiting"),
);
export const vFinishReason = v.union(
  v.literal("stop"),
  v.literal("length"),
  v.literal("content-filter"),
  v.literal("tool-calls"),
  v.literal("error"),
  v.literal("other"),
);
