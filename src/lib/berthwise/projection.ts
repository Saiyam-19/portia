import { cardOf } from "./cards";

export const TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_CARD_CHARS = 60_000;

type SafeMessagePart =
  | { type: "text"; text: string }
  | { type: "tool"; toolCallId: string; toolName: string; status: "called" | "completed" | "error" }
  | { type: "card"; toolCallId: string; toolName: string; card: string };

/** The browser sees text, tool progress and cards built from tool results. */
export function safeMessageParts(content: unknown): SafeMessagePart[] {
  if (typeof content === "string") {
    return content ? [{ type: "text" as const, text: content }] : [];
  }
  if (!Array.isArray(content)) return [];
  const safe: SafeMessagePart[] = [];
  for (const raw of content) {
    if (!raw || typeof raw !== "object") continue;
    const part = raw as Record<string, unknown>;
    if (part.type === "text" && typeof part.text === "string") {
      safe.push({ type: "text", text: part.text });
      continue;
    }
    if ((part.type === "tool-call" || part.type === "tool-result") && typeof part.toolCallId === "string" && typeof part.toolName === "string" && TOOL_NAME.test(part.toolName)) {
      const outputType = part.output && typeof part.output === "object" ? (part.output as { type?: unknown }).type : undefined;
      const errored = part.isError === true || outputType === "error-text" || outputType === "error-json";
      const toolCallId = part.toolCallId.slice(0, 200);
      safe.push({ type: "tool", toolCallId, toolName: part.toolName, status: part.type === "tool-call" ? "called" : errored ? "error" : "completed" });
      const card = part.type === "tool-result" && !errored ? cardOf(part.output) : undefined;
      const serialized = card ? JSON.stringify(card) : "";
      if (card && serialized.length <= MAX_CARD_CHARS) safe.push({ type: "card", toolCallId, toolName: part.toolName, card: serialized });
    }
  }
  return safe;
}

