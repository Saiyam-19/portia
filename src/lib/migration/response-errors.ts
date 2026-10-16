import { modelErrorDetails } from "./error-reporting";

const messages = {
  timeout: "The response timed out. Your submitted details are saved. Send a follow-up to continue; partial work is not a completed estimate.",
  billing: "The AI service has reached its billing limit. Please contact support; your submitted details are saved.",
  busy: "The AI service is temporarily busy. Please try again shortly; your submitted details are saved.",
  configuration: "The AI service is unavailable. Please contact support; your submitted details are saved.",
  failed: "Couldn’t complete the response. Saved steps remain below; review them before retrying.",
} as const;

export function responseErrorMessage(error: unknown): string {
  const { statusCode, errorType } = modelErrorDetails(error);
  if (errorType === "timeout" || statusCode === 408 || statusCode === 504) return messages.timeout;
  if (statusCode === 402) return messages.billing;
  if (statusCode === 401 || statusCode === 403) return messages.configuration;
  if (statusCode === 429 || (statusCode !== null && statusCode >= 500) || errorType === "network") return messages.busy;
  return messages.failed;
}

/** The browser never renders arbitrary server/provider exception text. */
export function clientResponseError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return Object.values(messages).some(value => value === message) ? message : messages.failed;
}
