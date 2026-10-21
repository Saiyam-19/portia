import { memoryBridge } from "./memoryHttp";
import { httpRouter } from "convex/server";
import type { Message } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { readBoundedJsonBody } from "../src/lib/bounded-json-body";
import { MAX_REVIEW_CHARS } from "../src/lib/authority/contract";
import { remainingObligationsSchema } from "../src/lib/portia/remaining-obligations";
import {
  isAllowedEmail,
  isMigrationDevEnabled,
  requireMigrationDevEnabled,
} from "./lib/migrationGate";

const formFieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(["text", "number", "radio", "textarea"]),
  placeholder: z.string().optional(),
  options: z.array(z.string()).optional(),
  unit: z.string().optional(),
  required: z.boolean(),
  hint: z.string().optional(),
}).strict();

const modelAliasSchema = z.enum(["model-1", "model-2"]);
const finishReasonSchema = z.enum(["stop", "length", "content-filter", "tool-calls", "error", "other"]);
const idSchema = z.string().min(1).max(200);
const bridgeRequestSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("claim"),
    args: z.object({
      conversationId: idSchema.nullable(),
      requestId: idSchema,
      payloadHash: z.string().min(1).max(128),
      question: z.string().min(1).max(4_000),
      modelAlias: modelAliasSchema,
      expectedRevision: z.number().int().nonnegative().nullable(),
    }).strict(),
  }).strict(),
  z.object({
    op: z.literal("resolveForm"),
    args: z.object({
      conversationId: idSchema,
      requestId: idSchema,
      payloadHash: z.string().min(1).max(128),
      toolCallId: idSchema,
      values: z.record(z.string(), z.string()),
      cancelled: z.boolean(),
      note: z.string().max(2_000).optional(),
      modelAlias: modelAliasSchema,
      expectedRevision: z.number().int().nonnegative(),
    }).strict(),
  }).strict(),
  z.object({
    op: z.literal("context"),
    args: z.object({ runId: idSchema, fence: z.number().int().positive() }).strict(),
  }).strict(),
  z.object({
    op: z.literal("status"),
    args: z.object({ runId: idSchema, fence: z.number().int().positive() }).strict(),
  }).strict(),
  z.object({
    op: z.literal("checkpoint"),
    args: z.object({
      runId: idSchema,
      fence: z.number().int().positive(),
      stepNumber: z.number().int().min(0).max(11),
      payloadHash: z.string().min(1).max(128),
      responseMessages: z.array(z.unknown()).min(1).max(12),
      finishReason: finishReasonSchema.optional(),
    }).strict(),
  }).strict(),
  z.object({
    op: z.literal("complete"),
    args: z.object({
      runId: idSchema,
      fence: z.number().int().positive(),
      responseMessages: z.array(z.unknown()).max(12),
      finishReason: finishReasonSchema.optional(),
      incomplete: z.literal(true).optional(),
      form: z.object({
        toolCallId: idSchema,
        title: z.string().min(1).max(120),
        description: z.string().max(MAX_REVIEW_CHARS).optional(),
        fields: z.array(formFieldSchema).min(1).max(8),
      }).strict().nullable(),
      authorizationProposal: z.string().max(48_000).optional(),
      authorizationContinuation: z.array(z.object({payload:z.string().max(48_000),toolCallId:idSchema,title:z.string().max(120),description:z.string().max(MAX_REVIEW_CHARS).optional(),fields:z.array(formFieldSchema).min(1).max(8),reviewGroup:z.string().max(80)}).strict()).max(15).optional(),
      remainingObligations:remainingObligationsSchema.optional(),
    }).strict(),
  }).strict(),
  z.object({
    op: z.literal("fail"),
    args: z.object({
      runId: idSchema,
      fence: z.number().int().positive(),
      errorCode: z.string().min(1).max(80),
    }).strict(),
  }).strict(),
  z.object({
    op: z.literal("cancel"),
    args: z.object({ runId: idSchema }).strict(),
  }).strict(),
]);

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  });
}

function hasValidServerSecret(request: Request): boolean {
  const expected = process.env.PORTIA_SERVER_SECRET ?? "";
  const supplied = request.headers.get("x-portia-server-secret") ?? "";
  if (expected.length < 32 || supplied.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  }
  return mismatch === 0;
}

const bridge = httpAction(async (ctx, request) => {
  try {
    requireMigrationDevEnabled();
    if (!hasValidServerSecret(request)) return json({ error: "Unauthorized" }, 401);
    const user = await authComponent.getAuthUser(ctx);
    if (!isAllowedEmail(user.email)) {
      return json({ error: "Forbidden" }, 403);
    }
    const body=await readBoundedJsonBody(request,128_000);
    if(!body.ok)return json({error:body.reason==='too_large'?"Request too large":"Invalid bridge request"},body.reason==='too_large'?413:400);
    const parsed = bridgeRequestSchema.safeParse(body.value);
    if (!parsed.success) return json({ error: "Invalid bridge request" }, 400);
    const { op, args } = parsed.data;
    if (op === "claim") {
      return json(await ctx.runMutation(internal.migration.claimQuestion, {
        ownerId: user._id,
        ...args,
        conversationId: args.conversationId as Id<"migrationConversations"> | null,
      }));
    }
    if (op === "resolveForm") {
      return json(await ctx.runMutation(internal.migration.resolveFormAndClaim, {
        ownerId: user._id,
        ...args,
        conversationId: args.conversationId as Id<"migrationConversations">,
      }));
    }
    if (op === "context") {
      return json(await ctx.runQuery(internal.migration.getRunContext, {
        ownerId: user._id,
        ...args,
        runId: args.runId as Id<"migrationRuns">,
      }));
    }
    if (op === "status") {
      return json(await ctx.runQuery(internal.migration.getRunStatus, {
        ownerId: user._id,
        ...args,
        runId: args.runId as Id<"migrationRuns">,
      }));
    }
    if (op === "checkpoint") {
      return json(await ctx.runMutation(internal.migration.checkpointRun, {
        ownerId: user._id,
        ...args,
        runId: args.runId as Id<"migrationRuns">,
        responseMessages: args.responseMessages as Message[],
      }));
    }
    if (op === "complete") {
      return json(await ctx.runMutation(internal.migration.completeRun, {
        ownerId: user._id,
        ...args,
        runId: args.runId as Id<"migrationRuns">,
        responseMessages: args.responseMessages as Message[],
      }));
    }
    if (op === "fail") {
      return json(await ctx.runMutation(internal.migration.failRun, {
        ownerId: user._id,
        ...args,
        runId: args.runId as Id<"migrationRuns">,
      }));
    }
    return json(await ctx.runMutation(internal.migration.cancelRun, {
      ownerId: user._id,
      runId: args.runId as Id<"migrationRuns">,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bridge request failed";
    const status = /Unauthenticated/i.test(message) ? 401 : 409;
    return json({ error: status === 401 ? "Unauthenticated" : "Request rejected" }, status);
  }
});

const http = httpRouter();
if (isMigrationDevEnabled()) {
  authComponent.registerRoutes(http, createAuth);
  http.route({ path: "/migration/bridge", method: "POST", handler: bridge });
  if (process.env.PORTIA_MEMORY_ENABLED === "true") http.route({path:"/memory/bridge",method:"POST",handler:memoryBridge});
}

export default http;
