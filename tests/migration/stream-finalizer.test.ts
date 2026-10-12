import { describe, expect, it, vi } from "vitest";
import { createRunFinalizer, withStreamFinalizer } from "../../src/lib/migration/stream-finalizer";

async function drain<T>(stream: ReadableStream<T>) {
  const values: T[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) return values;
    values.push(value);
  }
}

describe("withStreamFinalizer", () => {
  it("finalizes exactly once after a clean finish", async () => {
    const finalize = vi.fn();
    const source = new ReadableStream<number>({
      start(controller) {
        controller.enqueue(1);
        controller.enqueue(2);
        controller.close();
      },
    });
    expect(await drain(withStreamFinalizer(source, finalize))).toEqual([1, 2]);
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledWith({ kind: "done" });
  });

  it("finalizes exactly once when the source errors after a partial chunk", async () => {
    const finalize = vi.fn();
    let pulls = 0;
    const source = new ReadableStream<number>({
      pull(controller) {
        pulls += 1;
        if (pulls === 1) controller.enqueue(1);
        else controller.error(new Error("provider stream failed"));
      },
    });
    const reader = withStreamFinalizer(source, finalize).getReader();
    await expect(reader.read()).resolves.toEqual({ done: false, value: 1 });
    await expect(reader.read()).rejects.toThrow(/provider stream failed/);
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(finalize.mock.calls[0]?.[0]).toMatchObject({ kind: "error" });
  });

  it("cancels an underlying pending read and finalizes once", async () => {
    const finalize = vi.fn();
    const underlyingCancel = vi.fn();
    const source = new ReadableStream<number>({
      pull() {
        return new Promise<void>(() => undefined);
      },
      cancel: underlyingCancel,
    });
    const reader = withStreamFinalizer(source, finalize).getReader();
    const pending = reader.read();
    await reader.cancel("browser disconnected");
    await expect(pending).resolves.toMatchObject({ done: true });
    expect(underlyingCancel).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledWith({ kind: "cancel", reason: "browser disconnected" });
    await reader.cancel("again");
    expect(finalize).toHaveBeenCalledTimes(1);
  });
});

describe("createRunFinalizer", () => {
  it("fails an unpersisted run and cleans up exactly once under repeated signals", async () => {
    const failRun = vi.fn(async () => undefined);
    const abort = vi.fn();
    const cleanup = vi.fn();
    const finalize = createRunFinalizer({
      isPersisted: () => false,
      failRun,
      abort,
      cleanup,
    });
    await Promise.all([
      finalize({ kind: "error", error: new Error("provider") }),
      finalize({ kind: "cancel", reason: "browser" }),
      finalize({ kind: "done" }),
    ]);
    expect(failRun).toHaveBeenCalledTimes(1);
    expect(abort).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("preserves a persisted success while still cleaning up", async () => {
    const failRun = vi.fn();
    const cleanup = vi.fn();
    const finalize = createRunFinalizer({
      isPersisted: () => true,
      failRun,
      abort: vi.fn(),
      cleanup,
    });
    await finalize({ kind: "done" });
    expect(failRun).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
