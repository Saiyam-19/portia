import { z } from "zod";
import { MAX_TURN_ATTACHMENTS } from "../artifacts/shared";

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

/** What `ask_user_input` accepts from the model. */
export const formInputSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  fields: z.array(formFieldSchema).min(1).max(8),
}).strict().superRefine((form, context) => {
  const names = new Set<string>();
  for (const field of form.fields) {
    if (names.has(field.name)) context.addIssue({ code: "custom", message: "Field names must be unique." });
    names.add(field.name);
  }
});

export type FormInput = z.infer<typeof formInputSchema>;
export type FormField = z.infer<typeof formFieldSchema>;
export type FormDefinition = FormInput & { toolCallId: string };

export const chatRequestSchema = z.object({
  conversationId: z.string().min(1).max(200),
  requestId: z.string().uuid(),
  modelAlias: modelAliasSchema,
  message: z.string().trim().max(4_000).optional(),
  attachmentIds: z.array(z.string().min(1).max(100)).max(MAX_TURN_ATTACHMENTS).optional(),
  formResponse: z.object({
    toolCallId: z.string().min(1).max(200),
    values: z.record(z.string(), z.string().max(2_000)),
    note: z.string().max(2_000).optional(),
    cancelled: z.boolean(),
  }).strict().optional(),
}).strict().refine(request => Boolean(request.message) || Boolean(request.formResponse) || Boolean(request.attachmentIds?.length), "Write a message or attach a file first.");

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const conversationRequestSchema = z.object({ conversationId: z.string().min(1).max(200) }).strict();

/**
 * The NDJSON events the browser receives for one turn: answer text and tool
 * activity only. Reasoning, tool inputs and tool outputs stay on the server.
 */
export type PublicEvent =
  | { type: "start"; requestId: string }
  | { type: "text"; delta: string }
  | { type: "tool"; id: string; name: string; status: "running" | "done" | "error" }
  | { type: "form"; form: FormDefinition }
  | { type: "end"; status: "completed" | "waiting" | "cancelled" | "error"; error?: string };
