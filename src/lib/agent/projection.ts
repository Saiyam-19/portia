import { formInputSchema, type FormDefinition, type PublicEvent } from "../chat/contracts";
import type { FinishedTurn, Segment } from "./store";
import { FORM_TOOL } from "./tools";

/** A line of `turn.readable` or `session.stream()`; see libfx's StreamLine. */
export type StreamLine = {
  type: string;
  messageId?: string;
  cursor?: number;
  epoch?: number;
  delta?: string;
  id?: string;
  name?: string;
  input?: unknown;
  isError?: boolean;
  stopReason?: string;
  error?: { message?: string; code?: string | number };
};

const STOP_ERRORS: Record<string, string> = {
  max_output_tokens: "The response reached its length limit. Ask a narrower question or send a follow-up to continue.",
  max_model_turns: "The response used too many steps. Send a follow-up to continue.",
  refused: "The model declined to answer this request.",
  unknown: "The response was interrupted. Send a follow-up to continue.",
  error: "Couldn't complete the response. Try again shortly.",
};

/**
 * Folds one turn's stream lines into the display projection and the public events
 * the browser receives. Reasoning, tool inputs and tool outputs stay server-side;
 * only a successfully shown form is published, because the user has to answer it.
 */
export class TurnFold {
  readonly segments: Segment[] = [];
  form: FormDefinition | undefined;
  end: Omit<FinishedTurn, "turnId" | "segments" | "usage"> | undefined;
  private readonly formInputs = new Map<string, unknown>();
  private epoch = 0;

  constructor(readonly messageId: string) {}

  push(line: StreamLine): PublicEvent[] {
    if (line.messageId !== this.messageId || this.end) return [];
    // Lines from a worker that lost the session are superseded by its successor's.
    if (typeof line.epoch === "number") {
      if (line.epoch < this.epoch) return [];
      this.epoch = line.epoch;
    }
    switch (line.type) {
      case "text_delta": {
        if (!line.delta) return [];
        const last = this.segments.at(-1);
        if (last?.type === "text") last.text += line.delta;
        else this.segments.push({ type: "text", text: line.delta });
        return [{ type: "text", delta: line.delta }];
      }
      case "tool_start": {
        if (!line.id || !line.name) return [];
        if (line.name === FORM_TOOL) this.formInputs.set(line.id, line.input);
        if (this.segments.some(segment => segment.type === "tool" && segment.id === line.id)) return [];
        this.segments.push({ type: "tool", id: line.id, name: line.name, status: "running" });
        return [{ type: "tool", id: line.id, name: line.name, status: "running" }];
      }
      case "tool_end": {
        if (!line.id || !line.name) return [];
        const status = line.isError ? "error" as const : "done" as const;
        const segment = this.segments.find(item => item.type === "tool" && item.id === line.id);
        if (segment?.type === "tool") segment.status = status;
        else this.segments.push({ type: "tool", id: line.id, name: line.name, status });
        const events: PublicEvent[] = [{ type: "tool", id: line.id, name: line.name, status }];
        if (line.name === FORM_TOOL && !line.isError) {
          const parsed = formInputSchema.safeParse(this.formInputs.get(line.id));
          if (parsed.success) {
            this.form = { ...parsed.data, toolCallId: line.id };
            this.segments.push({ type: "form", form: this.form });
            events.push({ type: "form", form: this.form });
          }
        }
        return events;
      }
      case "turn_end": {
        const reason = line.stopReason ?? "unknown";
        this.end = reason === "end_turn"
          ? this.form ? { status: "waiting", form: this.form } : { status: "completed" }
          : reason === "cancelled" ? { status: "cancelled" } : { status: "error", error: STOP_ERRORS[reason] ?? STOP_ERRORS.error };
        // Tools still marked running never finished.
        for (const segment of this.segments) if (segment.type === "tool" && segment.status === "running") segment.status = "error";
        return [{ type: "end", status: this.end.status, ...(this.end.error ? { error: this.end.error } : {}) }];
      }
      default:
        return [];
    }
  }
}

/** Splits an NDJSON byte stream into parsed lines. */
export async function* ndjsonLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<StreamLine> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = done ? "" : lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try { yield JSON.parse(line) as StreamLine; } catch { /* skip a malformed line */ }
      }
      if (done) return;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
