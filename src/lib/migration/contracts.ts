import { z } from "zod";

export const MAX_CHAT_REQUEST_BYTES = 32_000;
export const FORM_VALUE_MAX_CHARS = 2_000;
export const INTERNAL_CONVERSATION_TOOLS = new Set(["interpret_request", "execute_conversation", "complete_auxiliary"]);
export const chatRequestByteLength = (value:unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

export const modelAliasSchema = z.enum(["model-1", "model-2"]);
export type ModelAlias = z.infer<typeof modelAliasSchema>;

const formFieldProperties = {
  name: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/i),
  label: z.string().min(1).max(160),
  placeholder: z.string().max(160).optional(),
  unit: z.string().max(40).optional(),
  required: z.boolean(),
  hint: z.string().max(240).optional(),
};

export const formFieldSchema = z.union([
  z.object({ ...formFieldProperties, type: z.literal("text") }).strict(),
  z.object({ ...formFieldProperties, type: z.literal("number") }).strict(),
  z.object({ ...formFieldProperties, type: z.literal("textarea") }).strict(),
  z.object({
    ...formFieldProperties,
    type: z.literal("radio"),
    options: z.array(z.string().min(1).max(120)).min(2).max(10),
  }).strict(),
]);

const baseFormSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  fields: z.array(formFieldSchema).min(1).max(8),
}).strict();

function validateFieldNames(form: { fields: Array<{ name: string }> }, context: z.RefinementCtx) {
  const names = new Set<string>();
  for (const field of form.fields) {
    if (names.has(field.name)) {
      context.addIssue({ code: "custom", message: "Field names must be unique." });
    }
    names.add(field.name);
  }
}

export const formInputSchema = baseFormSchema.superRefine(validateFieldNames);
export const formDefinitionSchema = baseFormSchema.extend({
  toolCallId: z.string().min(1).max(200),
}).superRefine(validateFieldNames);

const baseRequest = {
  requestId: z.string().uuid(),
  modelAlias: modelAliasSchema,
};

export const migrationChatRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("question"),
    ...baseRequest,
    conversationId: z.string().min(1).max(200).nullable(),
    expectedRevision: z.number().int().nonnegative().nullable(),
    question: z.string().trim().min(1).max(4_000),
  }).strict(),
  z.object({
    kind: z.literal("form"),
    ...baseRequest,
    conversationId: z.string().min(1).max(200),
    expectedRevision: z.number().int().nonnegative(),
    toolCallId: z.string().min(1).max(200),
    values: z.record(z.string(), z.string().max(FORM_VALUE_MAX_CHARS)),
    cancelled: z.boolean(),
    note: z.string().max(FORM_VALUE_MAX_CHARS).optional(),
  }).strict(),
]);

export const cancelRequestSchema = z.object({
  runId: z.string().min(1).max(200),
}).strict();

export type FormDefinition = z.infer<typeof formDefinitionSchema>;
export type MigrationChatRequest = z.infer<typeof migrationChatRequestSchema>;

export type ClaimResult = {
  conversationId: string;
  runId: string;
  threadId: string;
  promptMessageId: string;
  fence: number;
  revision: number;
  replayed: boolean;
};
