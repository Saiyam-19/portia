import type { TextStreamPart, ToolSet } from "ai";
import { modelErrorDetails } from "./error-reporting";
import { INTERNAL_CONVERSATION_TOOLS } from "./contracts";

export function publicChatStream<TOOLS extends ToolSet>(
  source: ReadableStream<TextStreamPart<TOOLS>>,
  options: {
    abortSignal: AbortSignal;
    onFailure: (error: unknown) => void;
    result?: { finishReason: PromiseLike<unknown> };
    officialTariff?: boolean;
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
      // Interpretation receipts and bound ledgers are private checkpoint data.
      // Their user-facing answer follows successful fenced completion.
      if ((part.type === "tool-call" || part.type === "tool-result" || part.type === "tool-input-start") && INTERNAL_CONVERSATION_TOOLS.has(part.toolName)) return;
      if (options.officialTariff && part.type === "tool-call" && part.toolName === "consult_port_agent") {
        controller.enqueue(stripPrivateProviderData({ ...part, input: { port_name: "mumbai", query: "Current source-bound berth-hire request" } } as TextStreamPart<TOOLS>));
        return;
      }
      // The internal ledger is committed through the fenced backend before its
      // rendered text is published. A tool event must not expose it earlier.
      if (part.type === "tool-result" && (part.toolName === "calculate_supplied_quote" || part.toolName === "consult_port_agent" && part.output && typeof part.output === "object" && "ledger" in part.output)) {
        controller.enqueue(stripPrivateProviderData({ ...part, output: { status: "calculated" } } as TextStreamPart<TOOLS>));
        return;
      }
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
