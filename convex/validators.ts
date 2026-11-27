import { v } from "convex/values";

export const vModelAlias = v.union(v.literal("model-1"), v.literal("model-2"));
export const vConversationState = v.union(
  v.literal("idle"),
  v.literal("running"),
  v.literal("waiting"),
  v.literal("error"),
  v.literal("stopped"),
);
export const vTurnStatus = v.union(
  v.literal("running"),
  v.literal("completed"),
  v.literal("waiting"),
  v.literal("cancelled"),
  v.literal("error"),
);
export const vFormField = v.object({
  name: v.string(),
  label: v.string(),
  type: v.union(v.literal("text"), v.literal("number"), v.literal("radio"), v.literal("textarea")),
  placeholder: v.optional(v.string()),
  options: v.optional(v.array(v.string())),
  unit: v.optional(v.string()),
  required: v.boolean(),
  hint: v.optional(v.string()),
});
export const vForm = v.object({
  toolCallId: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  fields: v.array(vFormField),
});
export const vFormValues = v.record(v.string(), v.string());
export const vFormResponse = v.object({
  toolCallId: v.string(),
  title: v.string(),
  values: vFormValues,
  note: v.optional(v.string()),
  cancelled: v.boolean(),
});
/** Display projection of one assistant response; the model-facing history lives in the libfx session. */
export const vSegment = v.union(
  v.object({ type: v.literal("text"), text: v.string() }),
  v.object({ type: v.literal("tool"), id: v.string(), name: v.string(), status: v.union(v.literal("done"), v.literal("error"), v.literal("running")) }),
  v.object({ type: v.literal("form"), form: vForm }),
);
export const vUsage = v.object({
  modelCalls: v.number(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  cacheReadTokens: v.number(),
  cacheWriteTokens: v.number(),
});
export const vMemoryFile = v.object({ path: v.string(), content: v.string() });
export const vArtifactRef = v.object({ id: v.string(), name: v.string(), mimeType: v.string(), size: v.number(), revision: v.number() });
export const vFilesContext = v.object({ files: v.array(vArtifactRef), removed: v.array(v.string()) });
/** What a turn's prompt carries about saved memory, chosen atomically with the claim. */
export const vMemoryContext = v.object({
  kind: v.union(v.literal("full"), v.literal("delta"), v.literal("none")),
  version: v.number(),
  files: v.array(vMemoryFile),
  removed: v.array(v.string()),
  notes: v.union(v.string(), v.null()),
});
