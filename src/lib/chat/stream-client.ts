import type { PublicEvent } from "./contracts";

/** Reads a turn's NDJSON events until the server closes the stream or `signal` aborts. */
export async function readEvents(response: Response, onEvent: (event: PublicEvent) => void, signal?: AbortSignal) {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const abort = () => void reader.cancel().catch(() => undefined);
  signal?.addEventListener("abort", abort, { once: true });
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = done ? "" : lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try { onEvent(JSON.parse(line) as PublicEvent); } catch { /* ignore a malformed line */ }
      }
      if (done) return;
    }
  } catch {
    // An aborted or dropped stream ends the read; the caller decides whether to rejoin.
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}

/** The error message a failed chat request carries, if any. */
export async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? fallback;
}
