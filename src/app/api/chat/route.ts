import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { berthwiseAgent } from "@/lib/agent/server";
import { authHelpers } from "@/lib/auth/server";
import { chatRequestSchema, type PublicEvent } from "@/lib/chat/contracts";
import { errorResponse, guard, json, ndjson } from "@/lib/chat/http";

export const runtime = "nodejs";
export const maxDuration = 300;

const encoder = new TextEncoder();
function events(...items: PublicEvent[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const item of items) controller.enqueue(encoder.encode(`${JSON.stringify(item)}\n`));
      controller.close();
    },
  });
}

/** Starts a turn and streams its public events as NDJSON. A retried request rejoins its turn. */
export async function POST(request: Request) {
  const rejected = guard(request, { mutation: true });
  if (rejected) return rejected;
  const parsed = chatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid request." }, 400);
  const body = parsed.data;
  try {
    const claim = await authHelpers().fetchAuthMutation(api.conversations.claimTurn, {
      conversationId: body.conversationId as Id<"conversations">,
      requestId: body.requestId,
      modelAlias: body.modelAlias,
      ...(body.message ? { message: body.message } : {}),
      ...(body.formResponse ? { formResponse: body.formResponse } : {}),
    });
    const agent = berthwiseAgent();
    if (claim.replayed) {
      if (claim.status === "running" && claim.fxSessionId) {
        return ndjson(agent.reconnect({ fxSessionId: claim.fxSessionId, requestId: claim.requestId, turnId: claim.turnId }));
      }
      const status = claim.status === "running" ? "error" : claim.status;
      return ndjson(events({ type: "start", requestId: claim.requestId }, { type: "end", status }));
    }
    return ndjson(await agent.start({
      turnId: claim.turnId,
      requestId: claim.requestId,
      conversationId: claim.conversationId,
      ownerId: claim.ownerId,
      fxSessionId: claim.fxSessionId,
      modelAlias: claim.modelAlias,
      message: claim.message,
      form: claim.form,
      formResponse: claim.formResponse,
      memoryContext: claim.memoryContext,
    }));
  } catch (error) {
    return errorResponse(error);
  }
}
