/** Earlier turns are replayed with their words intact, but their tool calls and
 * results shrink: null arguments are dropped and each result keeps only the
 * short summary its tool returned. The current turn is replayed unchanged. */

const MAX_FALLBACK_CHARS = 1_500;

type Message = { role: string; content: unknown };
type Part = Record<string, unknown>;

function withoutNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutNulls);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null).map(([key, item]) => [key, withoutNulls(item)]));
}

function compactOutput(output: unknown): unknown {
  if (!output || typeof output !== "object") return output;
  const { type, value } = output as { type?: unknown; value?: unknown };
  if (type !== "json") return output;
  if (value && typeof value === "object" && typeof (value as { summary?: unknown }).summary === "string") {
    return { type, value: { summary: (value as { summary: string }).summary } };
  }
  const text = JSON.stringify(value) ?? "";
  return text.length <= MAX_FALLBACK_CHARS ? output : { type, value: { summary: text.slice(0, MAX_FALLBACK_CHARS) + "…" } };
}

function compactPart(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const part = raw as Part;
  // Storage may also keep deprecated copies (args, result); replay needs neither.
  const { args: _args, result: _result, ...rest } = part;
  if (part.type === "tool-call") return { ...rest, input: withoutNulls(part.input ?? part.args) };
  if (part.type === "tool-result") return { ...rest, output: compactOutput(part.output) };
  return part;
}

export function compactHistory<T extends Message>(messages: T[]): T[] {
  let current = messages.length;
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]!.role === "user") { current = index; break; }
  }
  return messages.map((message, index) => index >= current || !Array.isArray(message.content)
    ? message
    : { ...message, content: message.content.map(compactPart) });
}
