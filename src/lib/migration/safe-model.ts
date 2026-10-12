import { wrapLanguageModel } from "ai";
import { reportMigrationStreamError } from "./error-reporting";

function safeError(error: unknown): Error {
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
    if ("name" in current && current.name === "AbortError") {
      return new DOMException("The request was cancelled.", "AbortError");
    }
    current = "cause" in current ? current.cause : null;
  }
  reportMigrationStreamError({ error });
  return new Error("The selected model is unavailable.");
}

/** ToolLoopAgent logs errors by default; redact rich provider errors upstream. */
export function withSafeModelErrors(model: Parameters<typeof wrapLanguageModel>[0]["model"]) {
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: "v4",
      wrapGenerate: async ({ doGenerate }) => {
        try {
          return await doGenerate();
        } catch (error) {
          throw safeError(error);
        }
      },
      wrapStream: async ({ doStream }) => {
        try {
          const result = await doStream();
          const reader = result.stream.getReader();
          let cancelled = false;
          return {
            ...result,
            stream: new ReadableStream({
              async pull(controller) {
                try {
                  const { done, value } = await reader.read();
                  if (cancelled) return;
                  if (done) {
                    reader.releaseLock();
                    controller.close();
                    return;
                  }
                  controller.enqueue(value.type === "error"
                    ? { ...value, error: safeError(value.error) }
                    : value);
                } catch (error) {
                  if (!cancelled) {
                    reader.releaseLock();
                    controller.error(safeError(error));
                  }
                }
              },
              async cancel(reason) {
                cancelled = true;
                try {
                  await reader.cancel(reason);
                } catch (error) {
                  throw safeError(error);
                } finally {
                  reader.releaseLock();
                }
              },
            }),
          };
        } catch (error) {
          throw safeError(error);
        }
      },
    },
  });
}
