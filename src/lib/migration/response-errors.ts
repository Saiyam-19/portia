import { modelErrorDetails } from "./error-reporting";
import { PublicationLimitError, PUBLICATION_LIMIT_MESSAGE } from "./publication-contract";

const messages = {
  publication: PUBLICATION_LIMIT_MESSAGE,
  timeout: "The response took too long. Your question is saved. Send a follow-up to continue.",
  billing: "The AI service has reached its spending limit. Please contact support. Your question is saved.",
  busy: "The AI service is busy right now. Please try again shortly. Your question is saved.",
  configuration: "The AI service is unavailable. Please contact support. Your question is saved.",
  failed: "Couldn’t finish the response. Anything already worked out is shown above. Please try again.",
} as const;

export function responseErrorMessage(error: unknown): string {
  if (error instanceof PublicationLimitError) return messages.publication;
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
