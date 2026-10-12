import { v } from "convex/values";

export const vModelAlias = v.union(v.literal("model-1"), v.literal("model-2"));
export const vConversationState = v.union(
  v.literal("idle"),
  v.literal("running"),
  v.literal("waiting"),
  v.literal("error"),
  v.literal("stopped"),
);
export const vRunStatus = v.union(
  v.literal("active"),
  v.literal("waiting"),
  v.literal("completed"),
  v.literal("error"),
  v.literal("cancelled"),
  v.literal("expired"),
);
export const vFinishReason = v.union(
  v.literal("stop"),
  v.literal("length"),
  v.literal("content-filter"),
  v.literal("tool-calls"),
  v.literal("error"),
  v.literal("other"),
);
export const vFormStatus = v.union(
  v.literal("pending"),
  v.literal("submitted"),
  v.literal("cancelled"),
);
export const vFormField = v.object({
  name: v.string(),
  label: v.string(),
  type: v.union(
    v.literal("text"),
    v.literal("number"),
    v.literal("radio"),
    v.literal("textarea"),
  ),
  placeholder: v.optional(v.string()),
  options: v.optional(v.array(v.string())),
  unit: v.optional(v.string()),
  required: v.boolean(),
  hint: v.optional(v.string()),
});
export const vFormInput = v.object({
  toolCallId: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  fields: v.array(vFormField),
});
export const vFormValues = v.record(v.string(), v.string());
