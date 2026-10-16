import { MockLanguageModelV4 } from "ai/test";
import type { ModelMessage } from "ai";
import type { LanguageModelV4GenerateResult, LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";
import { ConversationSession } from "../../src/lib/migration/conversation-session";
import type { Interpretation } from "../../src/lib/migration/conversation";
import { projectionProposal } from "./conversation-fixtures";
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } };
export async function runInterpreted(messages: ModelMessage[], mode: "generate" | "stream", options: { proposal?: Interpretation; kind?: "facts" | "elapsed" | "arithmetic" | "quote"; expression?: string; ordinaryAnswer?: string } = {}) {
  const proposal = options.proposal ?? await projectionProposal(messages, options.kind ?? "facts", options.expression);
  let calls = 0;
  const generated = (): LanguageModelV4GenerateResult => calls++ === 0
    ? { content: [{ type: "tool-call", toolCallId: "interpret", toolName: "interpret_request", input: JSON.stringify(proposal) }], finishReason: { unified: "tool-calls", raw: undefined }, usage, warnings: [] }
    : { content: [{ type: "text", text: options.ordinaryAnswer ?? "Unexpected extra model request" }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] };
  const model = new MockLanguageModelV4({ doGenerate: async () => generated(), doStream: async () => {
    const r = generated(); return { stream: new ReadableStream<LanguageModelV4StreamPart>({ start(c) {
      c.enqueue({ type: "stream-start", warnings: [] }); for (const part of r.content) {
        if (part.type === "tool-call") c.enqueue(part);
        else if (part.type === "text") { c.enqueue({ type: "text-start", id: "text" }); c.enqueue({ type: "text-delta", id: "text", delta: part.text }); c.enqueue({ type: "text-end", id: "text" }); }
      } c.enqueue({ type: "finish", finishReason: r.finishReason, usage }); c.close();
    } }) };
  } });
  const binding = { runId: "code-aware-projection", fence: 1, revision: 1 };
  const conversation = new ConversationSession(binding);
  const agent = createMigrationMainAgent({ interpretationFormat: "legacy", alias: "model-1", mainModel: model, conversation, quoteBinding: binding });
  let text = "";
  if (mode === "generate") text = (await agent.generate({ messages })).text;
  else { const result = await agent.stream({ messages }); for await (const part of result.stream) { if (part.type === "text-delta") text += part.text; if (part.type === "error") throw part.error; } }
  const scopes = new Set(conversation.state.tasks.map(t => t.scopeId));
  return { text, model, calls, conversation, currentFacts: conversation.state.facts.filter(f => scopes.has(f.scopeId) && f.status === "established") };
}
