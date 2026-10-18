import type { TextStreamPart, ToolSet } from "ai";
import type { FormDefinition } from "../migration/contracts";
import { BUSINESS_TOOLS } from "./session";

/** Keep SSE/tool activity, but publish answer text only after fenced completion.
 * No model claim compiler: financial bodies come directly from business tools. */
export function persistedAnswerStream<T extends ToolSet>(source: ReadableStream<TextStreamPart<T>>, options: {
  isPersisted: () => boolean; text: () => string; form?: () => FormDefinition | null; abortSignal: AbortSignal;
}) {
  let finish: TextStreamPart<T> | undefined;
  let failed = false;
  return source.pipeThrough(new TransformStream<TextStreamPart<T>, TextStreamPart<T>>({
    transform(part, controller) {
      if (part.type === "text-start" || part.type === "text-delta" || part.type === "text-end" || part.type === "reasoning-start" || part.type === "reasoning-delta" || part.type === "reasoning-end") return;
      if (part.type === "tool-input-delta" || part.type === "tool-input-end") return;
      if ((part.type === "tool-call" || part.type === "tool-result" || part.type === "tool-input-start" || part.type === "tool-error") && BUSINESS_TOOLS.has(part.toolName)) return;
      if (part.type === "finish") { finish = part; return; }
      if (part.type === "error" || part.type === "abort") failed = true;
      controller.enqueue(part);
    },
    flush(controller) {
      if (failed || options.abortSignal.aborted) return;
      if (!options.isPersisted()) throw new Error("Answer persistence did not complete.");
      const text = options.text();
      if (text) {
        controller.enqueue({ type: "text-start", id: "saved-answer" });
        controller.enqueue({ type: "text-delta", id: "saved-answer", text });
        controller.enqueue({ type: "text-end", id: "saved-answer" });
      }
      const form = options.form?.();
      if (form) { const {toolCallId,...input} = form; controller.enqueue({type:"tool-call",toolName:"ask_user_input",toolCallId,input} as TextStreamPart<T>); }
      if (finish) controller.enqueue(finish);
    },
  }));
}
