export type StreamFinalization =
  | { kind: "done" }
  | { kind: "error"; error: unknown }
  | { kind: "cancel"; reason: unknown };

export type RunFinalization = StreamFinalization | { kind: "route-error"; error: unknown };

export function createRunFinalizer(options: {
  isPersisted: () => boolean;
  failRun: (event: RunFinalization) => void | Promise<void>;
  abort: (event: RunFinalization) => void;
  cleanup: () => void | Promise<void>;
}) {
  let finalization: Promise<void> | null = null;
  return (event: RunFinalization): Promise<void> => {
    if (!finalization) {
      finalization = (async () => {
        try {
          if (event.kind !== "done") options.abort(event);
          if (!options.isPersisted()) await options.failRun(event);
        } catch {
          // Run cleanup is mandatory even when durable failure persistence fails.
        } finally {
          await options.cleanup();
        }
      })();
    }
    return finalization;
  };
}

export function withStreamFinalizer<T>(
  source: ReadableStream<T>,
  onFinalize: (event: StreamFinalization) => void | Promise<void>,
): ReadableStream<T> {
  const reader = source.getReader();
  let cancelled = false;
  let released = false;
  let finalization: Promise<void> | null = null;

  const release = () => {
    if (released) return;
    released = true;
    reader.releaseLock();
  };

  const finalize = (event: StreamFinalization) => {
    if (!finalization) {
      finalization = Promise.resolve()
        .then(() => onFinalize(event))
        .then(() => undefined)
        .catch(() => undefined);
    }
    return finalization;
  };

  return new ReadableStream<T>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (cancelled) return;
        if (done) {
          await finalize({ kind: "done" });
          release();
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        if (cancelled) return;
        await finalize({ kind: "error", error });
        release();
        controller.error(error);
      }
    },
    async cancel(reason) {
      cancelled = true;
      const finalized = finalize({ kind: "cancel", reason });
      try {
        await reader.cancel(reason);
      } catch {
        // Cleanup must still run when the provider's cancel handler fails.
      } finally {
        release();
        await finalized;
      }
    },
  });
}
