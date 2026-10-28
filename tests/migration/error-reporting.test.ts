import { afterEach, expect, it, vi } from "vitest";
import { reportMigrationStreamError } from "../../src/lib/migration/error-reporting";

afterEach(() => vi.restoreAllMocks());

it("keeps provider prompts, headers, response bodies and identifiers out of logs", () => {
  const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  reportMigrationStreamError({ error: {
    statusCode: 402,
    requestBodyValues: { prompt: "private prompt", model: "private model" },
    responseHeaders: { authorization: "secret" },
    responseBody: "private response",
  } });
  expect(log.mock.calls).toEqual([["migration_inference_error", { statusCode: 402 }]]);
  reportMigrationStreamError({ error: new Error("private stack and message") });
  expect(log.mock.calls[1]).toEqual(["migration_inference_error", { statusCode: null }]);
});

it("records HTTP-equivalent codes from streamed OpenRouter errors and nested causes", () => {
  const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  reportMigrationStreamError({ error: { code: 503, message: "private provider detail" } });
  expect(log.mock.calls[0]?.[1]).toMatchObject({ statusCode: 503 });
  reportMigrationStreamError({ error: new Error("private wrapper", { cause: { code: "402" } }) });
  expect(log.mock.calls[1]?.[1]).toMatchObject({ statusCode: 402 });
  expect(JSON.stringify(log.mock.calls)).not.toContain("private");
});

it("distinguishes timeouts without recording their potentially private message", () => {
  const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  reportMigrationStreamError({ error: new DOMException("private details", "TimeoutError"), phase: "generate", agent: "main", runId: "run-fixture" });
  expect(log.mock.calls).toEqual([["migration_inference_error", {
    statusCode: null, errorType: "timeout", phase: "generate", agent: "main", runId: "run-fixture",
  }]]);
});

it("bounds cause traversal and rejects arbitrary codes and error names", () => {
  const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const error: Record<string, unknown> = { name: "private name", code: "private code", statusCode: 23 };
  error.cause = error;
  reportMigrationStreamError({ error });
  expect(log.mock.calls).toEqual([["migration_inference_error", { statusCode: null }]]);
});
