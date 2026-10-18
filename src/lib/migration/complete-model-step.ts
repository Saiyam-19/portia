import { wrapLanguageModel } from "ai";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";

/** A provider may stop emitting tokens while keeping its HTTP stream alive.
 * Buffer one step so an interrupted attempt can never execute partial/duplicate
 * tools. Recovery stays inside the original run deadline and provider policy. */
export function withCompleteModelSteps(model: Parameters<typeof wrapLanguageModel>[0]["model"]) {
  let recoveriesLeft = 2;
  return wrapLanguageModel({ model, middleware: {
    specificationVersion: "v4",
    wrapStream: async ({ model: underlying, params }) => {
      for (;;) {
        params.abortSignal?.throwIfAborted();
        const attempt = new AbortController();
        const signal = params.abortSignal ? AbortSignal.any([params.abortSignal, attempt.signal]) : attempt.signal;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let retryable = false;
        // A trickle can continually reset the idle clock without ever finishing.
        // Bound the whole attempt inside the caller's unchanged step deadline.
        const attemptTimer = setTimeout(() => {
          retryable = true;
          attempt.abort(new DOMException("The provider did not complete the model step within its attempt deadline.", "TimeoutError"));
        }, 90_000);
        let reader: ReadableStreamDefaultReader<LanguageModelV4StreamPart> | undefined;
        let rejectAbort: (reason: unknown) => void = () => {};
        const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
        const onAbort = () => rejectAbort(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
        const arm = (milliseconds: number) => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            retryable = true;
            attempt.abort(new DOMException("The provider stopped producing a complete model step.", "TimeoutError"));
          }, milliseconds);
        };
        // Includes response headers. Stream-start/metadata/raw heartbeat traffic
        // is deliberately not progress and cannot extend this deadline.
        arm(60_000);
        try {
          const opening = Promise.resolve(underlying.doStream({ ...params, abortSignal: signal }));
          void opening.then(result => { if (signal.aborted && !result.stream.locked) return result.stream.cancel(signal.reason); }).catch(() => {});
          const result = await Promise.race([opening, aborted]);
          signal.throwIfAborted();
          reader = result.stream.getReader();
          const parts: LanguageModelV4StreamPart[] = [];
          let bytes = 0, complete = false;
          for (;;) {
            const next = await Promise.race([reader.read(), aborted]);
            signal.throwIfAborted();
            if (next.done) break;
            const part = next.value;
            bytes += new TextEncoder().encode(JSON.stringify(part)).byteLength;
            if (bytes > 2 * 1024 * 1024 || parts.length >= 8192) throw new Error("Model step exceeded the buffering limit.");
            if (part.type === "error") throw part.error;
            if (part.type === "finish") {
              if (complete || !["stop", "tool-calls"].includes(part.finishReason.unified)) throw new Error("Model step did not finish successfully.");
              complete = true;
              arm(15_000); // A finish alone is insufficient: require clean EOF.
            } else if (part.type === "tool-call" || ((part.type === "text-delta" || part.type === "reasoning-delta" || part.type === "tool-input-delta") && part.delta.length)) {
              if (complete) throw new Error("Model produced content after its finish.");
              arm(15_000);
            }
            parts.push(part);
          }
          if (!complete) { retryable = true; throw new Error("Model stream ended before its finish."); }
          reader.releaseLock(); reader = undefined;
          return { ...result, stream: new ReadableStream<LanguageModelV4StreamPart>({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close(); } }) };
        } catch (error) {
          clearTimeout(timer);
          clearTimeout(attemptTimer);
          const canRecover = retryable;
          // Abort and release the failed attempt before another dispatch. No
          // buffered part has escaped to the agent or side-effecting tools.
          attempt.abort(error);
          if (reader) {
            let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
            try { await Promise.race([reader.cancel(error).catch(() => {}), new Promise<void>(resolve => { cleanupTimer = setTimeout(resolve, 1000); })]); }
            finally { clearTimeout(cleanupTimer); reader.releaseLock(); reader = undefined; }
          }
          params.abortSignal?.throwIfAborted();
          if (!canRecover || recoveriesLeft === 0) throw error;
          recoveriesLeft--;
        } finally {
          clearTimeout(timer);
          clearTimeout(attemptTimer);
          signal.removeEventListener("abort", onAbort);
        }
      }
    },
  } });
}
