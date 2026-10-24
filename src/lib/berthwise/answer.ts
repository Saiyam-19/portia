import type { ModelMessage } from "ai";
import { cardOf } from "./cards";
import { unsupportedNumbers } from "./number-guard";

type Part = Record<string, unknown>;
const parts = (message: ModelMessage): Part[] => Array.isArray(message.content) ? message.content as Part[] : [];

export function assistantText(messages: ModelMessage[]): string {
  return messages.filter(message => message.role === "assistant").map(message => typeof message.content === "string"
    ? message.content : parts(message).flatMap(part => part.type === "text" && typeof part.text === "string" ? [part.text] : []).join("")).join("\n").trim();
}

/** Narration written alongside tool calls is never published; only the final answer is. */
export function withoutNarration(messages: ModelMessage[]): ModelMessage[] {
  return messages.flatMap(message => {
    if (message.role !== "assistant" || typeof message.content === "string") return message.role === "assistant" ? [] : [message];
    const content = parts(message).filter(part => part.type !== "text" && part.type !== "reasoning");
    return content.length ? [{ ...message, content } as ModelMessage] : [];
  });
}

/** Figures the answer may use: the user's words, tool results and earlier checked answers. */
export function numberSources(messages: ModelMessage[]): unknown[] {
  return messages.flatMap(message => {
    if (message.role === "user") return [typeof message.content === "string" ? message.content : parts(message).map(part => part.text ?? "").join(" ")];
    if (message.role === "assistant") return [assistantText([message])];
    if (message.role === "tool") return parts(message).map(part => part.output);
    return [];
  });
}

export const hasCards = (messages: ModelMessage[]) =>
  messages.some(message => message.role === "tool" && parts(message).some(part => cardOf(part.output)));

export function repairRequest(unsupported: string[]): string {
  return `Your reply used these figures, which don't come from the user or a tool result: ${unsupported.join(", ")}. Rewrite the reply without them. Use only figures that appear in the user's messages or in tool results. If a figure is needed and no tool gave it, say it isn't available.`;
}

export const UNCHECKED_SUMMARY_WITH_CARDS = "The calculated figures are shown above. I left out my written summary because it included figures I couldn't check against the calculation.";
export const UNCHECKED_SUMMARY = "Sorry, I couldn't give a reliable answer to that. Please rephrase it, or ask for one specific estimate or comparison.";
export const OUT_OF_STEPS = "I ran out of steps before finishing. The results above are complete as far as they go. Ask me to continue and I'll pick up from there.";

export { unsupportedNumbers };
