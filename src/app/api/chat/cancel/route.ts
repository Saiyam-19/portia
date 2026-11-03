import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { berthwiseAgent } from "@/lib/agent/server";
import { authHelpers } from "@/lib/auth/server";
import { conversationRequestSchema } from "@/lib/chat/contracts";
import { errorResponse, guard, json } from "@/lib/chat/http";

export const runtime = "nodejs";

/** Stops the running turn: the projection closes at once, then the libfx session is cancelled. */
export async function POST(request: Request) {
  const rejected = guard(request, { mutation: true });
  if (rejected) return rejected;
  const parsed = conversationRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid request." }, 400);
  try {
    const cancelled = await authHelpers().fetchAuthMutation(api.conversations.requestCancel, { conversationId: parsed.data.conversationId as Id<"conversations"> });
    if (cancelled?.fxSessionId) await berthwiseAgent().cancel(cancelled.fxSessionId);
    return json({ cancelled: Boolean(cancelled) });
  } catch (error) {
    return errorResponse(error);
  }
}
