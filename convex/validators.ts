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
export const vAuthorization = v.object({
  payload: v.string(),
  expiresAt: v.number(),
});
export const vQuoteApproval = v.object({
  quoteId: v.string(),
  revision: v.number(),
  digest: v.string(),
});
export const vOutcomeKind=v.union(v.literal("quotation"),v.literal("quotation_read"),v.literal("comparison"),v.literal("information"),v.literal("calculation"),v.literal("elapsed_time"),v.literal("vessel_lookup"),v.literal("memory_read"),v.literal("memory_write"),v.literal("notes_read"),v.literal("notes_write"));
export const vRemainingObligations=v.object({version:v.literal(1),outcomes:v.array(v.object({kind:vOutcomeKind,branches:v.array(v.object({disposition:v.union(v.literal("awaiting_input"),v.literal("awaiting_approval"),v.literal("unavailable"),v.literal("failed")),targets:v.array(v.string()),comparisonCurrency:v.optional(v.string()),verificationRequired:v.optional(v.literal(true)),operationId:v.optional(v.string()),questions:v.array(v.string()),detail:v.optional(v.string()),reportingView:v.optional(v.object({stage:v.union(v.literal("exact"),v.literal("line"),v.literal("total")),decimals:v.optional(v.number())})),quoteState:v.optional(v.object({quoteIds:v.array(v.string()),digest:v.string()}))}))}))});
