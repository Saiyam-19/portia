import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { berthwiseAgent } from "@/lib/agent/server";
import { authHelpers } from "@/lib/auth/server";
import { conversationRequestSchema } from "@/lib/chat/contracts";
import { errorResponse, guard, json, ndjson } from "@/lib/chat/http";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Rejoins a conversation's running turn, e.g. after a page reload. 204 when nothing is running. */
export async function GET(request: Request) {
  const rejected = guard(request, { mutation: false });
  if (rejected) return rejected;
  const parsed = conversationRequestSchema.safeParse({ conversationId: new URL(request.url).searchParams.get("conversationId") });
  if (!parsed.success) return json({ error: "Invalid request." }, 400);
  try {
    const target = await authHelpers().fetchAuthQuery(api.conversations.streamTarget, { conversationId: parsed.data.conversationId as Id<"conversations"> });
    if (!target) return new Response(null, { status: 204 });
    return ndjson((await berthwiseAgent()).reconnect(target));
  } catch (error) {
    return errorResponse(error);
  }
}
