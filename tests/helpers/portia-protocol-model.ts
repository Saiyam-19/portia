import { MockLanguageModelV4 as SDKMock } from "ai/test";
import type { LanguageModelV4CallOptions, LanguageModelV4GenerateResult, LanguageModelV4StreamPart, LanguageModelV4StreamResult } from "@ai-sdk/provider";

/** Migrates existing arithmetic/persistence fixture scripts to the current wire
 * protocol. It does NOT test semantic intent or make model-reliability claims.
 * Decision-loop tests use the unmodified SDK mock and explicit wrong/repair calls. */
type Settings = NonNullable<ConstructorParameters<typeof SDKMock>[0]>;
function context(options: LanguageModelV4CallOptions, key: string): unknown {
  for (const message of options.prompt) if (message.role === "system") {
    const line = message.content.split("\n").find(line => line.startsWith(key + "="));
    if (line) return JSON.parse(line.slice(key.length + 1));
  }
}
function migrateCall<T extends { toolName: string; input: string }>(part: T, options: LanguageModelV4CallOptions): T {
  if (part.toolName !== "manage_quote") return part;
  const input = JSON.parse(part.input) as Record<string, unknown>;
  if (input.action === "read") { delete input.action; return { ...part, toolName: "read_quotes", input: JSON.stringify(input) }; }
  const saved = context(options, "SAVED_QUOTES") as { quotes?: Array<{ id: string; pricing: string }>; drafts?: Array<{ quote: { id: string; pricing: string } }> } | undefined;
  const pricing = input.pricing ?? saved?.quotes?.find(quote => quote.id === input.quoteId)?.pricing ?? saved?.drafts?.find(draft => draft.quote.id === input.quoteId)?.quote.pricing;
  if (pricing === "supplied" || pricing === "official") delete input.pricing;
  return { ...part, toolName: pricing === "supplied" ? "supplied_quote" : "official_quote", input: JSON.stringify(input) };
}
function finalCall(options: LanguageModelV4CallOptions, text: string, id: number) {
  void options;
  return { type: "tool-call" as const, toolCallId: `fixture-finish-${id}`, toolName: "finish_turn", input: JSON.stringify({ response: text }) };
}
function migrateGenerated(result: LanguageModelV4GenerateResult, options: LanguageModelV4CallOptions, id: number): LanguageModelV4GenerateResult {
  const content = result.content.map(part => part.type === "tool-call" ? migrateCall(part, options) : part);
  if (result.finishReason.unified !== "stop" || content.some(part => part.type === "tool-call")) return { ...result, content };
  return { ...result, content: [...content, finalCall(options, content.flatMap(part => part.type === "text" ? [part.text] : []).join(""), id)], finishReason: { unified: "tool-calls", raw: undefined } };
}
export class MockLanguageModelV4 extends SDKMock {
  constructor(settings: Settings) {
    let generatedIndex = 0, streamedIndex = 0, lastGenerated: LanguageModelV4GenerateResult | undefined, lastStreamParts: LanguageModelV4StreamPart[] | undefined;
    super({ ...settings,
      ...(settings.doGenerate ? { doGenerate: async options => {
        const source = settings.doGenerate!;
        const result = lastGenerated ?? (typeof source === "function" ? await source(options) : Array.isArray(source) ? source[generatedIndex] : source);
        generatedIndex++;
        if (result.finishReason.unified === "stop" && !result.content.some(part => part.type === "tool-call")) lastGenerated = result;
        return migrateGenerated(result, options, generatedIndex);
      } } : {}),
      ...(settings.doStream ? { doStream: async options => {
        const source = settings.doStream!;
        const replay = lastStreamParts;
        const result: LanguageModelV4StreamResult = replay ? { stream: new ReadableStream({ start(controller) { for (const part of replay) controller.enqueue(part); controller.close(); } }) } : typeof source === "function" ? await source(options) : Array.isArray(source) ? source[streamedIndex] : source;
        const id = ++streamedIndex; let text = "", calls = 0; const parts: LanguageModelV4StreamPart[] = [];
        return { ...result, stream: result.stream.pipeThrough(new TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart>({ transform(part, controller) {
          parts.push(part);
          if (part.type === "text-delta") text += part.delta;
          if (part.type === "tool-call") { calls++; controller.enqueue(migrateCall(part, options)); return; }
          if (part.type === "finish" && part.finishReason.unified === "stop" && !calls) {
            lastStreamParts = [...parts]; controller.enqueue(finalCall(options, text, id)); controller.enqueue({ ...part, finishReason: { unified: "tool-calls", raw: undefined } }); return;
          }
          controller.enqueue(part);
        } })) };
      } } : {}),
    });
  }
}
