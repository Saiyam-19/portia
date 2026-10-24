import type { TextStreamPart, ToolSet } from "ai";

/** Tool progress streams live. The written answer is published only after it
 * passed the number check and was saved, so the browser never shows a draft. */
export function publishedAnswerStream<T extends ToolSet>(source: ReadableStream<TextStreamPart<T>>, options: {
  isPersisted: () => boolean; text: () => string; abortSignal: AbortSignal;
}) {
  let finish: TextStreamPart<T> | undefined;
  const terminalEvents: TextStreamPart<T>[] = [];
  return source.pipeThrough(new TransformStream<TextStreamPart<T>, TextStreamPart<T>>({
    transform(part, controller) {
      if (part.type.startsWith("text-") || part.type.startsWith("reasoning-")) return;
      if (part.type === "tool-input-delta" || part.type === "tool-input-end") return;
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
      } else if (!cancelled && !terminalEvents.length) {
        throw new Error("Answer persistence did not complete.");
      }
      for (const event of terminalEvents) controller.enqueue(event);
      if (finish && !cancelled) {
        controller.enqueue(terminalEvents.some(part => part.type === "error") && finish.type === "finish"
          ? { ...finish, finishReason: "error" } : finish);
      }
    },
  }));
}
