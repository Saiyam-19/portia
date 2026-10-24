import type { TextStreamPart, ToolSet } from "ai";
import { modelErrorDetails } from "./error-reporting";

export function publicChatStream<TOOLS extends ToolSet>(
  source: ReadableStream<TextStreamPart<TOOLS>>,
  options: {
    abortSignal: AbortSignal;
    onFailure: (error: unknown) => void;
    result?: { finishReason: PromiseLike<unknown> };
  },
) {
  // The SDK may emit an abort without its reason when no model output arrived.
  // Observe its terminal promise as well: this retains the actual timeout and
  // prevents the otherwise-unhandled rejection after the HTTP stream closes.
  const failure = options.result
    ? Promise.resolve(options.result.finishReason).then(() => undefined, error => {
        options.onFailure(error);
        return error;
      })
    : Promise.resolve(undefined);
  return source.pipeThrough(new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
    async transform(part, controller) {
      if (part.type === "error") options.onFailure(part.error);
      if (part.type === "abort") {
        const error = options.abortSignal.reason ?? await failure ?? part.reason;
        options.onFailure(error);
        if (modelErrorDetails(error).errorType === "timeout") controller.enqueue({ type: "error", error });
        // Raw abort reasons can carry private exception text.
        controller.enqueue({ type: "abort" });
        return;
      }
      controller.enqueue(stripPrivateProviderData(part));
    },
  }));
}

export function stripPrivateProviderData<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripPrivateProviderData(item)) as T;
  }
  if (!value || typeof value !== "object") return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  const safe = Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "providerMetadata" && key !== "providerOptions")
      .map(([key, item]) => [key, stripPrivateProviderData(item)]),
  );
  return safe as T;
}
