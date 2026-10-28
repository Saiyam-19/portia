export type ModelErrorContext = {
  runId?: string;
  modelAlias?: "model-1" | "model-2";
  agent?: "main";
  phase?: "generate" | "stream-start" | "stream-read";
};

/** Inspect bounded causes, never serialize provider messages, bodies or headers. */
export function modelErrorDetails(error: unknown) {
  // streamText serializes its internally owned timeout signal into an abort
  // part; the route's outer AbortSignal is still active for these deadlines.
  if (typeof error === "string" && /^(?:First chunk|Chunk|Step|Total) timeout of \d+ms exceeded$/.test(error)) {
    return { statusCode: null, errorType: "timeout" as const };
  }
  let current = error;
  let statusCode: number | null = null;
  let errorType: "timeout" | "cancelled" | "invalid_response" | "network" | undefined;
  for (let depth = 0; depth < 6 && current && typeof current === "object"; depth += 1) {
    const item = current as Record<string, unknown>;
    for (const value of [item.statusCode, item.code]) {
      const code = typeof value === "string" && /^\d{3}$/.test(value) ? Number(value) : value;
      if (statusCode === null && typeof code === "number" && Number.isInteger(code) && code >= 400 && code <= 599) statusCode = code;
    }
    if (item.name === "TimeoutError" || ["ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"].includes(String(item.code))) errorType = "timeout";
    else if (item.name === "AbortError" && !errorType) errorType = "cancelled";
    else if (["AI_TypeValidationError", "AI_JSONParseError", "AI_InvalidResponseDataError"].includes(String(item.name))) errorType = "invalid_response";
    else if (["ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ENOTFOUND", "UND_ERR_SOCKET"].includes(String(item.code))) errorType = "network";
    current = item.cause;
  }
  return { statusCode, ...(errorType ? { errorType } : {}) };
}

export function reportMigrationStreamError({ error, ...context }: { error: unknown } & ModelErrorContext): void {
  console.warn("migration_inference_error", { ...modelErrorDetails(error), ...context });
}
