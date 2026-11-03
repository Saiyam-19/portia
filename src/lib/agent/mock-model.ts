/**
 * A stand-in for OpenRouter that speaks the same streaming Chat Completions
 * protocol, so everything above the network — libfx, tools, the workspace,
 * compaction, the projection — runs for real without paid inference.
 *
 * Replies follow simple keyword scripts. Prompt caching is simulated the way
 * providers do it: tokens in the longest prefix shared with the previous request
 * on the same sticky key count as cached, in 128-token blocks above 1024 tokens.
 */

type Message = { role: string; content?: unknown; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>; tool_call_id?: string };
type Body = { model: string; messages: Message[]; tools?: unknown[]; session_id?: string };
type ToolCall = { name: string; arguments: Record<string, unknown> };
type Reply = { text: string } | { tool: ToolCall };

const encoder = new TextEncoder();
const lastRequest = new Map<string, string>();
let generation = 0;

export const approxTokens = (chars: number) => Math.ceil(chars / 4);

function content(message: Message | undefined): string {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) return message.content.map(part => (part as { text?: string }).text ?? "").join("");
  return "";
}

/** The user's words, without the context envelope the host adds. */
function userText(message: Message | undefined) {
  return content(message).replace(/^<context>[\s\S]*?<\/context>\n*/, "").trim();
}

function cachedTokens(key: string, serialized: string) {
  const previous = lastRequest.get(key) ?? "";
  lastRequest.set(key, serialized);
  if (lastRequest.size > 256) lastRequest.delete(lastRequest.keys().next().value!);
  let shared = 0;
  const limit = Math.min(previous.length, serialized.length);
  while (shared < limit && previous.charCodeAt(shared) === serialized.charCodeAt(shared)) shared++;
  const tokens = Math.floor(shared / 4);
  return tokens >= 1024 ? tokens - (tokens % 128) : 0;
}

function words(text: string) {
  return text.toLowerCase();
}

function memoryFact(text: string) {
  const fact = text.replace(/^.*?\bremember\b\s*(that\s+)?/i, "").replace(/[.!]+$/, "").trim();
  return fact.slice(0, 200) || "the user asked to remember this conversation";
}

function scriptForUser(message: Message): Reply {
  const text = userText(message);
  const lower = words(text);
  if (lower.startsWith("[form response")) {
    const numbers = [...text.matchAll(/:\s*(\d+(?:\.\d+)?)\s*$/gm)].map(match => match[1]);
    const grt = numbers[0] ?? "25000";
    return { tool: { name: "calculate_charge_batch", arguments: { calculations: [
      { id: "port_dues", expression: `${grt} * 0.42` },
      { id: "pilotage", expression: `round(${grt} * 0.18, 2)` },
      { id: "total", expression: "$port_dues + $pilotage" },
    ] } } };
  }
  if (lower.startsWith("[form dismissed")) return { text: "No problem. Share the voyage details whenever you are ready and I will prepare the estimate." };
  if (/\bforget\b/.test(lower)) return { tool: { name: "bash", arguments: { command: "rm -f /memories/profile.md && ls /memories" } } };
  if (/\bremember\b/.test(lower)) {
    const fact = memoryFact(text).replace(/'/g, "");
    return { tool: { name: "bash", arguments: { command: `printf -- '- %s\\n' '${fact}' >> /memories/profile.md && cat /memories/profile.md` } } };
  }
  if (/\bnotes?\b/.test(lower)) {
    return { tool: { name: "bash", arguments: { command: `printf '# Task\\n%s\\n' '${text.slice(0, 160).replace(/'/g, "")}' > /notes/current.md && cat /notes/current.md` } } };
  }
  if (/\b(estimate|quote|cost|charges?)\b/.test(lower)) {
    return { tool: { name: "ask_user_input", arguments: {
      title: "Voyage particulars",
      description: "A few details I need before reading the tariff.",
      fields: [
        { name: "vessel", label: "Vessel name", type: "text", required: true },
        { name: "grt", label: "Gross tonnage", type: "number", unit: "GRT", required: true },
        { name: "trade", label: "Trade", type: "radio", options: ["Foreign", "Coastal"], required: true },
        { name: "stay", label: "Berth stay", type: "number", unit: "hours", required: false },
      ],
    } } };
  }
  const imo = text.match(/\b\d{7}\b/);
  if (imo) return { tool: { name: "get_vessel", arguments: { id: imo[0], id_type: "imo" } } };
  if (/\b(vessel|ship)\b/.test(lower)) return { tool: { name: "search_vessels", arguments: { query: text.replace(/.*\b(vessel|ship)\b\s*/i, "").slice(0, 80) || "ever given", limit: 3 } } };
  if (/\b(port|tariff|berth|jnpa|mumbai)\b/.test(lower)) {
    return { tool: { name: "bash", arguments: { command: "ls /ports && grep -ril 'berth hire' /ports | head -5" } } };
  }
  if (/\blong\b/.test(lower)) {
    return { text: `Here is a deliberately long mock answer.\n\n${Array.from({ length: 60 }, (_, index) => `${index + 1}. Mock paragraph about port operations, pilotage, berth hire and anchorage charges.`).join("\n")}` };
  }
  const memory = content(message).match(/<memory kind="(full|delta)"[^>]*>([\s\S]*?)<\/memory>/);
  const files = memory ? [...memory[2].matchAll(/<file path="([^"]+)">/g)].map(match => match[1]) : [];
  return { text: `**Mock reply.** You said: "${text.slice(0, 200)}".${files.length ? ` I can see saved memory in ${files.join(", ")}.` : ""}\n\nSet PORTIA_MODEL_MODE=openrouter for real answers.` };
}

function scriptAfterTools(messages: Message[]): Reply {
  const results: Array<{ name: string; output: string }> = [];
  for (let index = messages.length - 1; index >= 0 && messages[index].role === "tool"; index--) {
    const message = messages[index];
    const call = messages.flatMap(item => item.tool_calls ?? []).find(item => item.id === message.tool_call_id);
    results.unshift({ name: call?.function.name ?? "tool", output: content(message) });
  }
  const [first] = results;
  if (first?.name === "ask_user_input") return { text: "Please fill in the form above so I can prepare the estimate." };
  if (first?.name === "calculate_charge_batch") {
    try {
      const parsed = JSON.parse(first.output) as { calculations?: Array<{ id: string; expression: string; result: string }> };
      const rows = (parsed.calculations ?? []).map(item => `| ${item.id.replace(/_/g, " ")} | ${item.expression.replace(/\$/g, "")} | ${item.result} |`);
      return { text: `Basis: mock rates for illustration only.\n\n| Charge | Formula | Amount |\n| --- | --- | --- |\n${rows.join("\n")}\n\nThese figures come from the mock model, not a tariff.` };
    } catch {
      return { text: `The calculation failed: ${first.output.slice(0, 200)}` };
    }
  }
  const body = results.map(result => `**${result.name}**\n\n\`\`\`\n${result.output.slice(0, 600)}\n\`\`\``).join("\n\n");
  return { text: `Here is what the tools returned:\n\n${body}` };
}

function compactionSummary(messages: Message[]): string {
  const asks = messages.filter(message => message.role === "user").map(userText).filter(Boolean);
  return `Summary of the earlier conversation (mock compaction). The user asked:\n${asks.slice(-12).map(ask => `- ${ask.slice(0, 160)}`).join("\n")}`;
}

function chunks(body: Body, reply: Reply, usage: { prompt: number; cached: number }): unknown[] {
  const id = `gen-mock-${Date.now().toString(36)}-${++generation}`;
  const base = { id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: body.model };
  const events: unknown[] = [];
  let completion = 0;
  if ("tool" in reply) {
    const args = JSON.stringify(reply.tool.arguments);
    completion = approxTokens(args.length);
    events.push({ ...base, choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: `call_${id.slice(-10)}`, type: "function", function: { name: reply.tool.name, arguments: args } }] } }] });
    events.push({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] });
  } else {
    completion = approxTokens(reply.text.length);
    const pieces = reply.text.match(/[\s\S]{1,24}/g) ?? [""];
    pieces.forEach((piece, index) => events.push({ ...base, choices: [{ index: 0, delta: index ? { content: piece } : { role: "assistant", content: piece } }] }));
    events.push({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
  }
  events.push({ ...base, choices: [], usage: {
    prompt_tokens: usage.prompt,
    completion_tokens: completion,
    total_tokens: usage.prompt + completion,
    prompt_tokens_details: { cached_tokens: usage.cached, cache_write_tokens: 0 },
  } });
  return events;
}

export function mockReply(body: Body): Reply {
  const messages = body.messages;
  const last = messages.at(-1);
  if (!body.tools?.length) return { text: compactionSummary(messages) };
  if (last?.role === "tool") return scriptAfterTools(messages);
  return scriptForUser(last ?? { role: "user", content: "" });
}

/** A `fetch` that answers chat completions locally. */
export function createMockFetch(options: { chunkDelayMs?: number } = {}) {
  const delay = options.chunkDelayMs ?? 0;
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const signal = init?.signal ?? undefined;
    const body = JSON.parse(String(init?.body ?? "{}")) as Body;
    const serialized = JSON.stringify([body.tools ?? [], body.messages]);
    const usage = { prompt: approxTokens(serialized.length), cached: cachedTokens(body.session_id ?? "default", serialized) };
    const events = chunks(body, mockReply(body), usage);
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const event of events) {
          if (signal?.aborted) { controller.error(signal.reason); return; }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    void input;
    return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
  };
}
