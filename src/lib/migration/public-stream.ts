import type { TextStreamPart, ToolSet } from "ai";
import { modelErrorDetails } from "./error-reporting";

export function publicChatStream<TOOLS extends ToolSet>(
  source: ReadableStream<TextStreamPart<TOOLS>>,
  options: { abortSignal: AbortSignal; onFailure: (error: unknown) => void },
) {
  return source.pipeThrough(new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
    transform(part, controller) {
      if (part.type === "error") options.onFailure(part.error);
      if (part.type === "abort") {
        const error = options.abortSignal.reason ?? part.reason;
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
