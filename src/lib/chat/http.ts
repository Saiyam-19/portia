import "server-only";
import { ConvexError } from "convex/values";
import { trustedOrigin } from "../auth/origin";
import { portiaEnabled } from "../config";

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export const ndjson = (stream: ReadableStream<Uint8Array>) =>
  new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });

/** Rejects requests when the app is disabled or a state-changing request comes from another origin. */
export function guard(request: Request, options: { mutation: boolean }): Response | null {
  if (!portiaEnabled()) return json({ error: "Not found" }, 404);
  if (options.mutation && !trustedOrigin(request)) return json({ error: "Forbidden" }, 403);
  return null;
}

const STATUS: Record<string, number> = {
  UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, BUSY: 409, CONFLICT: 409,
  THROTTLED: 429, INVALID_INPUT: 400, INVALID_FORM: 400,
};

/** Maps an app error from Convex to a response; anything else is logged and reported generically. */
export function errorResponse(error: unknown): Response {
  const data = error instanceof ConvexError ? error.data as { code?: string; message?: string } : null;
  if (data?.code && STATUS[data.code]) return json({ error: data.message ?? "Request rejected.", code: data.code }, STATUS[data.code]);
  if (error instanceof Error && /unauthenticated|not authenticated/i.test(error.message)) return json({ error: "Sign in required.", code: "UNAUTHENTICATED" }, 401);
  console.error("[chat] request failed", error);
  return json({ error: "Something went wrong. Try again shortly." }, 500);
}
