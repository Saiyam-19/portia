import { createHash } from "node:crypto";

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type Message = { role: string; content?: unknown; [key: string]: unknown };
type ChatBody = { model: string; messages: Message[]; [key: string]: unknown };

export type CallUsage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };

/**
 * libfx reports input and output tokens but not cached ones, so the transport reads
 * the provider's usage chunk itself and keeps it here, keyed by generation id, until
 * the `model.end` hook for that call collects it.
 */
export class UsageLedger {
  private readonly entries = new Map<string, CallUsage>();
  record(generationId: string, usage: CallUsage) {
    this.entries.set(generationId, usage);
    if (this.entries.size > 512) this.entries.delete(this.entries.keys().next().value!);
  }
  take(generationId: string | null | undefined): CallUsage | undefined {
    if (!generationId) return undefined;
    const usage = this.entries.get(generationId);
    this.entries.delete(generationId);
    return usage;
  }
}

function text(content: unknown): string {
  if (typeof content === "string") return content;
  return JSON.stringify(content ?? "");
}

/**
 * One key per conversation: the system prompt plus the first user message never
 * change for a session, so every request of a conversation routes to the same
 * provider cache. (It changes after compaction, when the old prefix is gone anyway.)
 */
export function stickyKey(messages: Message[]): string {
  const system = messages.find(message => message.role === "system");
  const firstUser = messages.find(message => message.role === "user");
  return createHash("sha256").update(text(system?.content)).update("\0").update(text(firstUser?.content)).digest("hex").slice(0, 32);
}

/** Models that cache only at explicit breakpoints. OpenAI and DeepSeek cache prefixes automatically. */
function needsBreakpoints(model: string) {
  return model.startsWith("anthropic/") || model.startsWith("qwen/");
}

function withBreakpoint(message: Message): Message {
  const parts = typeof message.content === "string"
    ? [{ type: "text", text: message.content }]
    : Array.isArray(message.content) ? [...message.content as Array<Record<string, unknown>>] : null;
  if (!parts?.length) return message;
  parts[parts.length - 1] = { ...parts[parts.length - 1], cache_control: { type: "ephemeral" } };
  return { ...message, content: parts };
}

/** Breakpoints after the system prompt and at the end of the history, the two prefixes later requests reuse. */
function addBreakpoints(messages: Message[]): Message[] {
  const last = messages.length - 1;
  return messages.map((message, index) => (index === 0 && message.role === "system") || index === last ? withBreakpoint(message) : message);
}

export function shapeRequest(body: ChatBody): ChatBody {
  return {
    ...body,
    messages: needsBreakpoints(body.model) ? addBreakpoints(body.messages) : body.messages,
    session_id: stickyKey(body.messages),
    reasoning: { effort: "low", exclude: true },
    usage: { include: true },
    provider: { allow_fallbacks: false, require_parameters: true, data_collection: "deny", zdr: true },
  };
}

function readUsage(chunk: Record<string, unknown>): CallUsage | null {
  const usage = chunk.usage as Record<string, unknown> | undefined;
  if (!usage) return null;
  const details = (usage.prompt_tokens_details ?? {}) as Record<string, unknown>;
  const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
  return {
    inputTokens: number(usage.prompt_tokens),
    outputTokens: number(usage.completion_tokens),
    cacheReadTokens: number(details.cached_tokens),
    cacheWriteTokens: number(details.cache_write_tokens),
  };
}

/** Passes the SSE body through unchanged while recording the usage chunk. */
function observeUsage(response: Response, ledger: UsageLedger): Response {
  if (!response.ok || !response.body) return response;
  const decoder = new TextDecoder();
  let buffer = "";
  const scan = (final: boolean) => {
    const lines = buffer.split("\n");
    buffer = final ? "" : lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ") || !line.includes("\"usage\"")) continue;
      try {
        const chunk = JSON.parse(line.slice(6)) as Record<string, unknown>;
        const usage = readUsage(chunk);
        if (usage && typeof chunk.id === "string") ledger.record(chunk.id, usage);
      } catch { /* not a JSON event */ }
    }
  };
  const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(bytes, controller) {
      buffer += decoder.decode(bytes, { stream: true });
      scan(false);
      controller.enqueue(bytes);
    },
    flush() { buffer += decoder.decode(); scan(true); },
  }));
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

/**
 * The fetch libfx uses for model requests. It shapes each chat completion for
 * OpenRouter (sticky cache routing, privacy-preserving provider preferences,
 * cache breakpoints) and hands it to `upstream`: the real network, or the mock.
 */
export function createTransport(options: { upstream: Fetch; ledger: UsageLedger }): Fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const raw = typeof init?.body === "string" ? init.body : init?.body instanceof Uint8Array ? new TextDecoder().decode(init.body) : null;
    if (!url.endsWith("/chat/completions") || raw === null) return options.upstream(input, init);
    const body = shapeRequest(JSON.parse(raw) as ChatBody);
    const response = await options.upstream(url, { ...init, body: JSON.stringify(body) });
    return observeUsage(response, options.ledger);
  };
}
