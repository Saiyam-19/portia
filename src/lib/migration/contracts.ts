import { z } from "zod";

export const MAX_CHAT_REQUEST_BYTES = 32_000;
export const chatRequestByteLength = (value:unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

export const modelAliasSchema = z.enum(["model-1", "model-2"]);
export type ModelAlias = z.infer<typeof modelAliasSchema>;

export const migrationChatRequestSchema = z.object({
  kind: z.literal("question"),
  requestId: z.string().uuid(),
  modelAlias: modelAliasSchema,
  conversationId: z.string().min(1).max(200).nullable(),
  expectedRevision: z.number().int().nonnegative().nullable(),
  question: z.string().trim().min(1).max(4_000),
}).strict();

export const cancelRequestSchema = z.object({
  runId: z.string().min(1).max(200),
}).strict();

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
