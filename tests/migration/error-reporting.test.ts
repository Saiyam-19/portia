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
