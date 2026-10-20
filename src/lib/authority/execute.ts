import type { ModelMessage } from "ai";
import { QuoteSession } from "../portia/session";
import { parsePacket, comparisonCore } from "./contract";

/** Only the route's private authenticated RunContext may supply this grant.
 * No model is called, and no model-selected arguments are reused on approval. */
export async function executeAuthorizedOperations(options: {
  authorization: { payload: string; expiresAt: number };
  session: QuoteSession;
  drainMemory?: () => Promise<unknown>;
  signal: AbortSignal;
}) {
  options.signal.throwIfAborted();
  if (options.authorization.expiresAt <= Date.now()) throw new Error("Exact-operation approval expired.");
  const packet = parsePacket(options.authorization.payload), messages: ModelMessage[] = [];
  const memory = packet.operations.filter(op => op.kind === "remember" || op.kind === "forget");
  // Admission already occurred atomically with authenticated approval. Drain only;
  // never enqueue again on a replay or browser reconnect.
  if (memory.length) {
    if (!options.drainMemory) throw new Error("Approved memory work needs the memory runtime.");
    await options.drainMemory();
  }
  for (const op of packet.operations) {
    options.signal.throwIfAborted();
    const toolCallId = `approved-${op.id}`;
    let toolName: string, input: object, output: unknown;
    if (op.kind === "quote") {
      toolName = "manage_quote";
      input = { action: op.before ? "update" : "create", ...(op.before ? { quoteId: op.quote.id } : {}), name: op.quote.name, pricing: op.quote.pricing, call: op.quote.call, services: op.quote.services, lines: op.quote.lines, terms: op.quote.terms };
      output = await options.session.applyApprovedQuote(op);
    } else if (op.kind === "comparison") {
      toolName = "compare_quotes"; input = op.input;
      const compared = await options.session.applyApprovedComparison(op);
      if (compared.status !== "calculated") throw new Error("Approved comparison could not complete with the saved inputs.");
      output = {...compared,record:{version:1,kind:"portia-comparison",conversationId:options.session.conversationId,...comparisonCore(op)}};
    } else {
      toolName = op.kind === "remember" ? "remember_memory" : "forget_memory";
      input = { key: op.key, ...(op.kind === "remember" ? {value:op.value} : {}) };
      output = {saved:true};
      options.session.recordAnswer(toolCallId,{body:op.kind === "remember" ? "Requested memory saved." : "Requested memory forgotten.",questions:[]});
    }
    messages.push({role:"assistant",content:[{type:"tool-call",toolCallId,toolName,input}]}, {role:"tool",content:[{type:"tool-result",toolCallId,toolName,output:{type:"json",value:JSON.parse(JSON.stringify(output))}}]});
  }
  options.signal.throwIfAborted();
  const text = options.session.finalText("Approved operations applied.");
  messages.push({role:"assistant",content:text});
  return {messages,text};
}
