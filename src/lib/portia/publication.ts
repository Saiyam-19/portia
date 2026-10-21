import type { TextStreamPart, ToolSet } from "ai";
import type { FormDefinition } from "../migration/contracts";
import { BUSINESS_TOOLS } from "./session";

/** Answer content is emitted only after fenced persistence. A provider error
 * remains an error, but cannot hide partial output already saved by onEnd. */
export function persistedAnswerStream<T extends ToolSet>(source: ReadableStream<TextStreamPart<T>>, options: {
  isPersisted: () => boolean; text: () => string; form?: () => FormDefinition | null; abortSignal: AbortSignal;
}) {
  let finish: TextStreamPart<T> | undefined;
  const terminalEvents: TextStreamPart<T>[] = [];
  return source.pipeThrough(new TransformStream<TextStreamPart<T>, TextStreamPart<T>>({
    transform(part, controller) {
      if (part.type === "text-start" || part.type === "text-delta" || part.type === "text-end" || part.type === "reasoning-start" || part.type === "reasoning-delta" || part.type === "reasoning-end") return;
      if (part.type === "tool-input-delta" || part.type === "tool-input-end") return;
      if ((part.type === "tool-call" || part.type === "tool-result" || part.type === "tool-input-start" || part.type === "tool-error") && (BUSINESS_TOOLS.has(part.toolName) || part.toolName === "ask_user_input")) return;
      if (part.type === "finish") { finish = part; return; }
      if (part.type === "error" || part.type === "abort") { terminalEvents.push(part); return; }
      controller.enqueue(part);
    },
    flush(controller) {
      const cancelled = options.abortSignal.aborted || terminalEvents.some(part => part.type === "abort");
      if (!cancelled && options.isPersisted()) {
        const text = options.text();
        if (text) {
          controller.enqueue({ type: "text-start", id: "saved-answer" });
          controller.enqueue({ type: "text-delta", id: "saved-answer", text });
          controller.enqueue({ type: "text-end", id: "saved-answer" });
        }
        const form = options.form?.();
        if (form) { const { toolCallId, ...input } = form; controller.enqueue({ type: "tool-call", toolName: "ask_user_input", toolCallId, input } as TextStreamPart<T>); }
      } else if (!cancelled && !terminalEvents.length) {
        throw new Error("Answer persistence did not complete.");
      }
      for (const event of terminalEvents) controller.enqueue(event);
      if (finish && !cancelled) {
        // This is the public response disposition, not a rewritten provider
        // checkpoint. Never turn an interrupted stream into successful stop.
        controller.enqueue(terminalEvents.some(part => part.type === "error") && finish.type === "finish"
          ? { ...finish, finishReason: "error" } : finish);
      }
    },
  }));
}
