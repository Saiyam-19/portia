import { MemorySession, memoryFeatureEnabled } from "@/lib/memory/session";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type ModelMessage,
} from "ai";
import { createHash } from "node:crypto";
import {
  formDefinitionSchema,
  formInputSchema,
  migrationChatRequestSchema,
  type ClaimResult,
  type FormDefinition,
  MAX_CHAT_REQUEST_BYTES,
} from "@/lib/migration/contracts";
import { readBoundedJsonBody } from "@/lib/bounded-json-body";
import {
  callMigrationBridge,
  MigrationTokenManager,
} from "@/lib/migration/bridge";
import {
  registerMigrationRun,
  unregisterMigrationRun,
} from "@/lib/migration/run-registry";
import { migrationPreviewEnabled } from "@/lib/migration/config";
import { trustedMigrationOrigin } from "@/lib/migration/origin";
import { publicChatStream } from "@/lib/migration/public-stream";
import { createMigrationMainAgent } from "@/lib/migration/domain-agent";
import { ConversationSession } from "@/lib/migration/conversation-session";
import { renderConversationAnswer, type ConversationAnswer } from "@/lib/migration/conversation-rules";
import { MIGRATION_CHAT_TIMEOUT } from "@/lib/migration/agent-policy";
import { modelErrorDetails } from "@/lib/migration/error-reporting";
import { responseErrorMessage } from "@/lib/migration/response-errors";
import {
  createRunFinalizer,
  withStreamFinalizer,
  type RunFinalization,
} from "@/lib/migration/stream-finalizer";

export const runtime = "nodejs";
export const maxDuration = 300;

type RunContext = {
  conversationId: string;
  threadId: string;
  modelAlias: "model-1" | "model-2";
  promptMessageId: string;
  revision: number;
  messages: ModelMessage[];
};

function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function pendingForm(messages: ReadonlyArray<{ content: unknown }>): FormDefinition | null {
  for (const message of [...messages].reverse()) {
    if (!Array.isArray(message.content)) continue;
    for (const part of [...message.content].reverse()) {
      if (part.type !== "tool-call" || part.toolName !== "ask_user_input") continue;
      const input = formInputSchema.safeParse(part.input);
      if (!input.success) {
        console.warn("portia_invalid_form_output", {
          issues: input.error.issues.map(issue => ({ code: issue.code, path: issue.path })),
        });
        throw new Error("The model returned an invalid input form.");
      }
      const parsed = formDefinitionSchema.safeParse({
        ...input.data,
        toolCallId: part.toolCallId,
      });
      if (!parsed.success) throw new Error("The model returned an invalid input form.");
      return parsed.data;
    }
  }
  return null;
}

async function parseBody(request: Request) {
  const body=await readBoundedJsonBody(request,MAX_CHAT_REQUEST_BYTES);
  return body.ok?migrationChatRequestSchema.safeParse(body.value):null;
}

export async function POST(request: Request): Promise<Response> {
  const requestStartedAt = Date.now();
  if (!migrationPreviewEnabled()) return new Response("Not found", { status: 404 });
  const origin = trustedMigrationOrigin(request);
  if (!origin) {
    return Response.json({ error: "Cross-origin request denied." }, { status: 403 });
  }
  const parsed = await parseBody(request);
  if (!parsed?.success) {
    return Response.json({ error: "Invalid chat request." }, { status: 400 });
  }

  const controller = new AbortController();
  const manager = new MigrationTokenManager(
    request.headers.get("cookie") ?? "",
    origin,
    controller,
  );
  let claim: ClaimResult | null = null;
  let persisted = false;
  let statusTimer: ReturnType<typeof setInterval> | null = null;
  let statusPollingEnabled = false;
  let pendingStepMessages: ModelMessage[] = [];
  let pendingStepForm: FormDefinition | null = null;
  let checkpointFailure: unknown;
  let responseFailure: unknown;
  let quotationCommitted = false;
  const finalizeRun = createRunFinalizer({
    isPersisted: () => persisted,
    abort: (event) => {
      if (!controller.signal.aborted) {
        controller.abort(new DOMException(
          event.kind === "cancel" ? "The browser disconnected." : "The response stream failed.",
          "AbortError",
        ));
      }
    },
    failRun: async (event: RunFinalization) => {
      if (!claim) return;
      const failure = responseFailure ?? checkpointFailure ?? ("error" in event ? event.error : undefined);
      const details = modelErrorDetails(failure);
      const errorCode = details.errorType === "timeout" ? "MODEL_TIMEOUT"
        : details.statusCode !== null ? `MODEL_HTTP_${details.statusCode}`
        : event.kind === "cancel"
        ? "ABORTED"
        : event.kind === "route-error"
          ? "ROUTE_ERROR"
          : event.kind === "error"
            ? "STREAM_ERROR"
            : "INCOMPLETE";
      console.warn("portia_run_failed", {
        runId: claim.runId, errorCode, ...details,
        phase: checkpointFailure ? "persistence" : "response",
      });
      await callMigrationBridge(
        manager,
        {
          op: "fail",
          args: { runId: claim.runId, fence: claim.fence, errorCode },
        },
        { ignoreAbort: true },
      ).catch(() => undefined);
    },
    cleanup: async () => {
      statusPollingEnabled = false;
      if (statusTimer) {
        clearInterval(statusTimer);
        statusTimer = null;
      }
      manager.stop();
      if (claim) unregisterMigrationRun(claim.runId);
    },
  });

  try {
    await manager.initialize();
    const body = parsed.data;
    const payloadHash = requestHash(body);
    claim = body.kind === "question"
      ? await callMigrationBridge<ClaimResult>(manager, {
          op: "claim",
          args: {
            conversationId: body.conversationId,
            requestId: body.requestId,
            payloadHash,
            question: body.question,
            modelAlias: body.modelAlias,
            expectedRevision: body.expectedRevision,
          },
        })
      : await callMigrationBridge<ClaimResult>(manager, {
          op: "resolveForm",
          args: {
            conversationId: body.conversationId,
            requestId: body.requestId,
            payloadHash,
            toolCallId: body.toolCallId,
            values: body.values,
            cancelled: body.cancelled,
            note: body.note,
            modelAlias: body.modelAlias,
            expectedRevision: body.expectedRevision,
          },
        });

    if (claim.replayed) {
      manager.stop();
      return Response.json(
        {
          error: "Already submitted. Reload or open the saved conversation; no new inference was started.",
          recovery: "open_saved_conversation",
          conversationId: claim.conversationId,
          runId: claim.runId,
          revision: claim.revision,
        },
        { status: 409 },
      );
    }

    // Cancelling an empty form is a UI action, not a request for more inference.
    // Persist through the same owner/fence checks before acknowledging success.
    if (body.kind === "form" && body.cancelled && !body.note?.trim()) {
      const text = "Form cancelled. You can send a correction or ask another question.";
      await callMigrationBridge(manager, {
        op: "complete",
        args: {
          runId: claim.runId, fence: claim.fence, form: null, finishReason: "stop",
          responseMessages: [{ role: "assistant", content: text }],
        },
      });
      persisted = true;
      await finalizeRun({ kind: "done" });
      const completedClaim = claim;
      return createUIMessageStreamResponse({
        stream: createUIMessageStream({
          execute: ({ writer }) => {
            writer.write({ type: "start", messageId: completedClaim.runId, messageMetadata: { conversationId: completedClaim.conversationId, runId: completedClaim.runId, revision: completedClaim.revision } });
            writer.write({ type: "text-start", id: completedClaim.runId });
            writer.write({ type: "text-delta", id: completedClaim.runId, delta: text });
            writer.write({ type: "text-end", id: completedClaim.runId });
            writer.write({ type: "finish", finishReason: "stop" });
            writer.setOutcome({ status: "completed" });
          },
        }),
        headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
      });
    }

    registerMigrationRun(claim.runId, controller);
    const context = await callMigrationBridge<RunContext>(manager, {
      op: "context",
      args: { runId: claim.runId, fence: claim.fence },
    });
    let statusCheckPending = false;
    statusPollingEnabled = true;
    statusTimer = setInterval(() => {
      if (!statusPollingEnabled || statusCheckPending || controller.signal.aborted) return;
      statusCheckPending = true;
      void callMigrationBridge<{ active: boolean; status: string }>(manager, {
        op: "status",
        args: { runId: claim!.runId, fence: claim!.fence },
      })
        .then((state) => {
          if (statusPollingEnabled && !state.active) {
            controller.abort(new DOMException("The run is no longer active.", "AbortError"));
          }
        })
        .catch((pollError) => {
          if (statusPollingEnabled) controller.abort(pollError);
        })
        .finally(() => { statusCheckPending = false; });
    }, 2_000);

    const memory = memoryFeatureEnabled() ? new MemorySession(manager, context.conversationId, {runId:claim.runId,runFence:claim.fence}).agent() : undefined;
    const quoteBinding = { runId: claim.runId, fence: claim.fence, revision: context.revision, conversationId: context.conversationId };
    const conversation = new ConversationSession(quoteBinding);
    const agent = createMigrationMainAgent({
      memory,
      alias: context.modelAlias,
      runId: claim.runId,
      quoteBinding,
      conversation,
      assertCanContinue: () => {
        if (checkpointFailure) throw checkpointFailure;
      },
    });

    const deadline = AbortSignal.timeout(MIGRATION_CHAT_TIMEOUT.totalMs);
    const abortSignal = AbortSignal.any([controller.signal, request.signal, deadline]);
    const result = await agent.stream({
      messages: context.messages,
      abortSignal,
      timeout: MIGRATION_CHAT_TIMEOUT,
      onStepEnd: async (step) => {
        try {
          abortSignal.throwIfAborted();
          if (quotationCommitted) return;
          const stepMessages = step.response.messages as ModelMessage[];
          const quoted = step.toolResults.find(item => item.toolName === "execute_conversation");
          if (quoted && quoted.output && typeof quoted.output === "object" && "ledger" in quoted.output) {
            if (!await conversation.verify(quoted.output.ledger)) throw new Error("Conversation publication validation failed.");
            const answer = renderConversationAnswer(quoted.output.ledger as ConversationAnswer);
            await manager.refresh();
            abortSignal.throwIfAborted();
            // Atomic owner/fence/lease/revision/epoch checks in completeRun are
            // the publication boundary. No monetary text has streamed yet.
            await callMigrationBridge(manager, {
              op: "complete", args: { runId: claim!.runId, fence: claim!.fence, form: null, finishReason: "stop",
                responseMessages: [...stepMessages, { role: "assistant", content: answer }] },
            });
            persisted = true; quotationCommitted = true; statusPollingEnabled = false;
            if (statusTimer) { clearInterval(statusTimer); statusTimer = null; }
            return;
          }
          const stepForm = pendingForm(stepMessages);
          if (stepForm) {
            if (step.toolCalls.length !== 1 || step.toolCalls[0]?.toolName !== "ask_user_input" || step.toolResults.length !== 0) {
              throw new Error("ask_user_input must be the only unresolved tool in its step.");
            }
            pendingStepMessages = stepMessages;
            pendingStepForm = stepForm;
            return;
          }
          await callMigrationBridge(manager, {
            op: "checkpoint",
            args: {
              runId: claim!.runId,
              fence: claim!.fence,
              stepNumber: step.stepNumber,
              payloadHash: requestHash(stepMessages),
              responseMessages: stepMessages,
              finishReason: step.finishReason,
            },
          });
        } catch (error) {
          console.warn("portia_checkpoint_rejected", {
            runId: claim!.runId,
            stepNumber: step.stepNumber,
            toolNames: step.toolCalls.map(call => call.toolName),
            toolResultCount: step.toolResults.length,
            reason: error instanceof Error && [
              "The model returned an invalid input form.",
              "ask_user_input must be the only unresolved tool in its step.",
              "Migration request was rejected.",
            ].includes(error.message) ? error.message : "checkpoint failed",
          });
          checkpointFailure = error;
          controller.abort(error);
        }
      },
      onEnd: async ({ finishReason, steps }) => {
        statusPollingEnabled = false;
        if (statusTimer) {
          clearInterval(statusTimer);
          statusTimer = null;
        }
        if (abortSignal.aborted) return;
        if (quotationCommitted) return;
        try {
          await manager.refresh();
          if (abortSignal.aborted) return;
          await callMigrationBridge(manager, {
            op: "complete",
            args: {
              runId: claim!.runId,
              fence: claim!.fence,
              responseMessages: pendingStepMessages,
              form: pendingStepForm,
              finishReason,
            },
          });
          persisted = true;
          console.info("portia_run_completed", {
            runId: claim!.runId,
            modelAlias: context.modelAlias,
            elapsedMs: Date.now() - requestStartedAt,
            modelSteps: steps.length,
            state: pendingStepForm ? "waiting" : "completed",
          });
        } catch (error) {
          if (!abortSignal.aborted) {
            checkpointFailure = error;
            controller.abort(error);
          }
        }
      },
    });

    const stream = toUIMessageStream({
      stream: publicChatStream(result.stream, {
        abortSignal,
        result,
        onFailure: error => { responseFailure = error; },
      }),
      sendReasoning: false,
      generateMessageId: () => claim!.runId,
      messageMetadata: ({ part }) =>
        part.type === "start"
          ? {
              conversationId: claim!.conversationId,
              runId: claim!.runId,
              revision: claim!.revision,
            }
          : undefined,
      onError: responseErrorMessage,
    });

    const finalizedStream = withStreamFinalizer(stream, finalizeRun);

    return createUIMessageStreamResponse({
      stream: finalizedStream,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    await finalizeRun({ kind: "route-error", error });
    const status = error instanceof Error && /Unauthenticated|Authentication/i.test(error.message) ? 401 : 409;
    return Response.json(
      { error: status === 401 ? "Unauthenticated." : "Unable to start the migration response." },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
