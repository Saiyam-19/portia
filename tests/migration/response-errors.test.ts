import { expect, it } from "vitest";
import { clientResponseError, responseErrorMessage } from "../../src/lib/migration/response-errors";

it("distinguishes a timeout from an exhausted provider balance", () => {
  expect(responseErrorMessage(new DOMException("private timeout context", "TimeoutError"))).toContain("timed out");
  expect(responseErrorMessage({ code: 402, message: "private account details" })).toContain("billing limit");
  expect(responseErrorMessage({ code: 429 })).toContain("busy");
});

it("passes only known safe error messages to the chat UI", () => {
  const safe = responseErrorMessage({ code: 503 });
  expect(clientResponseError(new Error(safe))).toBe(safe);
  expect(clientResponseError(new Error("private provider response"))).not.toContain("private");
  expect(responseErrorMessage({ name: "private", message: "private" })).not.toContain("private");
});
