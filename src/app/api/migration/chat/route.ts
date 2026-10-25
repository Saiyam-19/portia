import { MemorySession, memoryFeatureEnabled } from "@/lib/memory/session";
import { createUIMessageStreamResponse, toUIMessageStream, type ModelMessage } from "ai";
import { createHash } from "node:crypto";
import { migrationChatRequestSchema, type ClaimResult, MAX_CHAT_REQUEST_BYTES } from "@/lib/migration/contracts";
import { readBoundedJsonBody } from "@/lib/bounded-json-body";
import { callMigrationBridge, MigrationTokenManager } from "@/lib/migration/bridge";
import { registerMigrationRun, unregisterMigrationRun } from "@/lib/migration/run-registry";
import { migrationPreviewEnabled } from "@/lib/migration/config";
import { trustedMigrationOrigin } from "@/lib/migration/origin";
import { publicChatStream } from "@/lib/migration/public-stream";
import { berthwiseInstructions, createMigrationMainAgent } from "@/lib/migration/domain-agent";
import { migrationLanguageModel } from "@/lib/migration/model";
import { assertPublicationFits, PublicationLimitError, PUBLICATION_LIMIT_MESSAGE } from "@/lib/migration/publication-contract";
import { MIGRATION_CHAT_TIMEOUT } from "@/lib/migration/agent-policy";
import { modelErrorDetails } from "@/lib/migration/error-reporting";
import { responseErrorMessage } from "@/lib/migration/response-errors";
import { authFailureResponse } from "@/lib/migration/auth-errors";
import { createRunFinalizer, withStreamFinalizer, type RunFinalization } from "@/lib/migration/stream-finalizer";
import { publishedAnswerStream } from "@/lib/berthwise/answer-stream";
import { businessTools } from "@/lib/berthwise/tools";
import { convexAccount } from "@/lib/berthwise/account-access";
import {
  checkAnswer, withoutNarration,
} from "@/lib/berthwise/answer";

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

async function parseBody(request: Request) {
  const body = await readBoundedJsonBody(request, MAX_CHAT_REQUEST_BYTES);
  return body.ok ? migrationChatRequestSchema.safeParse(body.value) : null;
}

export async function POST(request: Request): Promise<Response> {
  const requestStartedAt = Date.now();
  if (!migrationPreviewEnabled()) return new Response("Not found", { status: 404 });
  const origin = trustedMigrationOrigin(request);
  if (!origin) return Response.json({ error: "Cross-origin request denied." }, { status: 403 });
  const parsed = await parseBody(request);
  if (!parsed?.success) return Response.json({ error: "Invalid chat request." }, { status: 400 });

  const controller = new AbortController();
  const manager = new MigrationTokenManager(request.headers.get("cookie") ?? "", origin, controller);
  let claim: ClaimResult | null = null;
  let persisted = false;
  let statusTimer: ReturnType<typeof setInterval> | null = null;
  let statusPollingEnabled = false;
  let finalMessages: ModelMessage[] = [];
  const savedSteps: ModelMessage[] = [];
  let checkpointFailure: unknown;
  let responseFailure: unknown;
  let publishedText = "";
  const finalizeRun = createRunFinalizer({
    isPersisted: () => persisted,
    abort: (event) => {
      if (!controller.signal.aborted) {
        controller.abort(new DOMException(event.kind === "cancel" ? "The browser disconnected." : "The response stream failed.", "AbortError"));
      }
    },
    failRun: async (event: RunFinalization) => {
      if (!claim) return;
      const failure = responseFailure ?? checkpointFailure ?? ("error" in event ? event.error : undefined);
      const details = modelErrorDetails(failure);
      const errorCode = details.errorType === "timeout" ? "MODEL_TIMEOUT"
        : details.statusCode !== null ? `MODEL_HTTP_${details.statusCode}`
        : event.kind === "cancel" ? "ABORTED"
        : event.kind === "route-error" ? "ROUTE_ERROR"
        : event.kind === "error" ? "STREAM_ERROR" : "INCOMPLETE";
      console.warn("berthwise_run_failed", { runId: claim.runId, errorCode, ...details, phase: checkpointFailure ? "persistence" : "response" });
      await callMigrationBridge(manager, { op: "fail", args: { runId: claim.runId, fence: claim.fence, errorCode } }, { ignoreAbort: true }).catch(() => undefined);
    },
    cleanup: async () => {
      statusPollingEnabled = false;
      if (statusTimer) { clearInterval(statusTimer); statusTimer = null; }
      manager.stop();
      if (claim) unregisterMigrationRun(claim.runId);
    },
  });

  try {
    await manager.initialize();
    const body = parsed.data;
    claim = await callMigrationBridge<ClaimResult>(manager, {
      op: "claim",
      args: {
        conversationId: body.conversationId, requestId: body.requestId, payloadHash: requestHash(body),
        question: body.question, modelAlias: body.modelAlias, expectedRevision: body.expectedRevision,
      },
    });
    if (claim.replayed) {
      manager.stop();
      return Response.json({
        error: "Already submitted. Reload or open the saved conversation; no new inference was started.",
        recovery: "open_saved_conversation", conversationId: claim.conversationId, runId: claim.runId, revision: claim.revision,
      }, { status: 409 });
    }

    registerMigrationRun(claim.runId, controller);
    const context = await callMigrationBridge<RunContext>(manager, { op: "context", args: { runId: claim.runId, fence: claim.fence } });
    let statusCheckPending = false;
    statusPollingEnabled = true;
    statusTimer = setInterval(() => {
      if (!statusPollingEnabled || statusCheckPending || controller.signal.aborted) return;
      statusCheckPending = true;
      void callMigrationBridge<{ active: boolean; status: string }>(manager, { op: "status", args: { runId: claim!.runId, fence: claim!.fence } })
        .then((state) => { if (statusPollingEnabled && !state.active) controller.abort(new DOMException("The run is no longer active.", "AbortError")); })
        .catch((pollError) => { if (statusPollingEnabled) controller.abort(pollError); })
        .finally(() => { statusCheckPending = false; });
    }, 2_000);

    const memorySession = memoryFeatureEnabled() ? new MemorySession(manager, context.conversationId, { runId: claim.runId, runFence: claim.fence }) : undefined;
    const model = migrationLanguageModel(context.modelAlias, { runId: claim.runId, agent: "main" });
    const agent = createMigrationMainAgent({
      alias: context.modelAlias, runId: claim.runId, mainModel: model, memory: memorySession?.agent(), tools: businessTools(convexAccount(manager)),
      assertCanContinue: () => { if (checkpointFailure) throw checkpointFailure; },
    });

    const deadline = AbortSignal.timeout(MIGRATION_CHAT_TIMEOUT.totalMs);
    const abortSignal = AbortSignal.any([controller.signal, request.signal, deadline]);
    let checkpointStep = 0;
    const result = await agent.stream({
      messages: context.messages,
      abortSignal,
      timeout: MIGRATION_CHAT_TIMEOUT,
      onStepEnd: async (step) => {
        try {
          abortSignal.throwIfAborted();
          const stepMessages = step.response.messages as ModelMessage[];
          if (!step.toolCalls.length) { finalMessages = stepMessages; return; }
          const kept = withoutNarration(stepMessages);
          savedSteps.push(...kept);
          await callMigrationBridge(manager, {
            op: "checkpoint",
            args: { runId: claim!.runId, fence: claim!.fence, stepNumber: checkpointStep++, payloadHash: requestHash(kept), responseMessages: kept, finishReason: step.finishReason },
          });
        } catch (error) {
          console.warn("berthwise_checkpoint_rejected", { runId: claim!.runId, stepNumber: step.stepNumber, toolNames: step.toolCalls.map(call => call.toolName) });
          checkpointFailure = error;
          controller.abort(error);
        }
      },
      onEnd: async ({ steps }) => {
        statusPollingEnabled = false;
        if (statusTimer) { clearInterval(statusTimer); statusTimer = null; }
        if (abortSignal.aborted) return;
        try {
          await manager.refresh();
          if (abortSignal.aborted) return;
          const checked = await checkAnswer({ model, system: berthwiseInstructions(), history: context.messages, steps: savedSteps, final: finalMessages, abortSignal });
          const { text, incomplete } = checked;
          if (checked.repaired) console.info("berthwise_answer_repaired", { runId: claim!.runId, stillUnsupported: checked.unsupported.length });
          const completionRequest = {
            op: "complete",
            args: { runId: claim!.runId, fence: claim!.fence, responseMessages: [{ role: "assistant", content: text }], ...(incomplete ? { incomplete: true } : {}) },
          };
          assertPublicationFits(completionRequest);
          await callMigrationBridge(manager, completionRequest);
          persisted = true;
          publishedText = text;
          console.info("berthwise_run_completed", {
            runId: claim!.runId, modelAlias: context.modelAlias, elapsedMs: Date.now() - requestStartedAt, modelSteps: steps.length,
            inputTokens: steps.reduce((sum, step) => sum + (step.usage.inputTokens ?? 0), 0),
            outputTokens: steps.reduce((sum, step) => sum + (step.usage.outputTokens ?? 0), 0),
            state: incomplete ? "incomplete" : "completed",
          });
        } catch (error) {
          if (!abortSignal.aborted) { checkpointFailure = error; controller.abort(error); }
        }
      },
    });

    const stream = toUIMessageStream({
      stream: publicChatStream(publishedAnswerStream(result.stream, { isPersisted: () => persisted, text: () => publishedText, abortSignal }), {
        abortSignal, result, onFailure: error => { responseFailure = error; },
      }),
      sendReasoning: false,
      generateMessageId: () => claim!.runId,
      messageMetadata: ({ part }) => part.type === "start" ? { conversationId: claim!.conversationId, runId: claim!.runId, revision: claim!.revision } : undefined,
      onError: responseErrorMessage,
    });
    return createUIMessageStreamResponse({
      stream: withStreamFinalizer(stream, finalizeRun),
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    await finalizeRun({ kind: "route-error", error });
    const serviceFailure = authFailureResponse(error); if (serviceFailure) return serviceFailure;
    const status = error instanceof Error && /Unauthenticated|Authentication/i.test(error.message) ? 401 : 409;
    return Response.json(
      { error: error instanceof PublicationLimitError ? PUBLICATION_LIMIT_MESSAGE : status === 401 ? "Unauthenticated." : "Unable to start the response." },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
