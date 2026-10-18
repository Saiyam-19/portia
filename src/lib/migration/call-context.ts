import { createHash } from "node:crypto";
import type { ModelMessage } from "ai";

// Historical receipt compatibility: authenticated input and lexical timestamps only.
export type AuthoredInput = { text: string; kind: "user" | "submitted-form" | "cancel-note"; messageIndex: number; messageHash: string; toolCallId?: string; fieldName?: string; fieldLabel?: string; formUnit?: string };
type Input = AuthoredInput;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const month = "(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
const date = `(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\s+${month}\\s+\\d{4}|\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{4})`;
const zone = "(?:Asia/Kolkata|India(?:n)?(?: Standard)? time|UTC|GMT|IST|Z|[+-]\\d{2}:?\\d{2})";
const timestamp = new RegExp(`\\b${date}(?:T|[, ]+(?:at\\s+)?)(?:\\d{1,2}:\\d{2})(?::\\d{2}(?:\\.\\d{1,3})?)?(?:\\s*${zone})?`, "gi");
/** Lexical timestamp atoms only; no event roles, scope or date-order inference. */
export function timestampAtoms(text: string): string[] {
  return [...text.matchAll(new RegExp(timestamp))].map(m => m[0].trim());
}
/** Only authenticated user history and the persisted ask_user_input responses are
 * input evidence. Assistant/lookup/memory text is never promoted to user facts. */
export function authenticatedInputs(messages: readonly ModelMessage[]): Input[] {
  const result: Input[] = [];
  const forms = new Map<string, Array<{ name: string; label?: string; unit?: string }>>();
  messages.forEach((message, messageIndex) => {
    const messageHash = hash(message);
    if (message.role === "user") {
      const text = typeof message.content === "string" ? message.content : message.content.filter(p => p.type === "text").map(p => p.text).join("\n");
      result.push({ text, kind: "user", messageIndex, messageHash });
    }
    if (message.role === "assistant" && Array.isArray(message.content)) for (const part of message.content) {
      if (part.type !== "tool-call" || part.toolName !== "ask_user_input" || !part.input || typeof part.input !== "object") continue;
      const fields = (part.input as { fields?: unknown }).fields;
      if (Array.isArray(fields)) forms.set(part.toolCallId, fields.filter((f): f is { name: string; label?: string; unit?: string } => !!f && typeof f === "object" && typeof f.name === "string"));
    }
    if (message.role === "tool") for (const part of message.content) {
      if (part.type !== "tool-result" || part.toolName !== "ask_user_input" || part.output.type !== "json") continue;
      const value = part.output.value;
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const body = value as { cancelled?: unknown; note?: unknown; values?: unknown };
      const common = { messageIndex, messageHash, toolCallId: part.toolCallId };
      if (body.cancelled !== true && body.values && typeof body.values === "object" && !Array.isArray(body.values)) {
        for (const [fieldName, text] of Object.entries(body.values)) if (typeof text === "string") {
          const definition = forms.get(part.toolCallId)?.find(f => f.name === fieldName);
          result.push({ ...common, text, kind: "submitted-form", fieldName, fieldLabel: definition?.label, formUnit: definition?.unit });
        }
      }
      if (typeof body.note === "string" && body.note.trim()) result.push({ ...common, text: body.note, kind: body.cancelled === true ? "cancel-note" : "submitted-form" });
    }
  });
  return result.filter(i => i.text.trim());
}
