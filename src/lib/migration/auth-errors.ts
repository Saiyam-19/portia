/** Distinguish a rejected identity from an unavailable token service. Only
 * sanitized status and retry timing may cross the public route boundary. */
export class AuthTokenError extends Error {
  readonly statusCode: 401 | 403 | 429 | 503;
  readonly retryAfter?: string;
  constructor(status: number, detail?: "short-lifetime" | "invalid-response", retryAfter?: string | null) {
    const code = status === 401 || status === 403 || status === 429 ? status : 503;
    const message = code === 401 ? "Authentication is required." : code === 403 ? "Access to this session is denied."
      : code === 429 ? "The authentication service is busy. Try again after the indicated wait."
        : detail === "short-lifetime" ? "Authentication token lifetime is too short for this run; the session service must issue a fresh token."
          : detail === "invalid-response" ? "The authentication service returned an invalid token response." : "The authentication service is temporarily unavailable. Try again shortly.";
    super(message); this.name = "AuthTokenError"; this.statusCode = code;
    if (retryAfter && /^\d{1,5}$/.test(retryAfter.trim())) this.retryAfter = String(Number(retryAfter));
    else if (retryAfter && retryAfter.length < 100) {
      const delay = Math.ceil((Date.parse(retryAfter) - Date.now()) / 1000);
      if (Number.isFinite(delay) && delay >= 0 && delay <= 86400) this.retryAfter = String(delay);
    }
  }
}

export function authFailureResponse(error: unknown): Response | undefined {
  if (!(error instanceof AuthTokenError)) return;
  return Response.json({ error: error.message }, { status: error.statusCode,
    headers: { "Cache-Control": "no-store", ...(error.retryAfter ? { "Retry-After": error.retryAfter } : {}) } });
}
