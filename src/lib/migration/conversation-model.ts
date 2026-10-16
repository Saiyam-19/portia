import { wrapLanguageModel } from "ai";
import type { LanguageModelV4Content, LanguageModelV4GenerateResult, LanguageModelV4StreamPart, LanguageModelV4Usage } from "@ai-sdk/provider";
import type { ConversationSession } from "./conversation-session";
import { interpretationSchema, hasUnboundFinancialClaim } from "./conversation";
import { MIGRATION_PROVIDER_FIRST_OUTPUT_MS, MIGRATION_INTERPRETATION_REPAIR_ENABLED } from "./agent-policy";
type Model = Parameters<typeof wrapLanguageModel>[0]["model"];
const usage = { inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 0, text: 0, reasoning: 0 } };
const text = (value: string): LanguageModelV4Content[] => [{ type: "text", text: value }];
const incomplete = () => new Error("The response did not finish. Please retry explicitly.");
export class PortiaInterpretationError extends Error {
  readonly name = "PortiaInterpretationError";
  constructor(readonly validationError: string) { super("The request could not be interpreted reliably. Please clarify or retry explicitly; no estimate was published."); }
}
const add = (a: number | undefined, b: number | undefined) => a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);
function combinedUsage(a: LanguageModelV4Usage | undefined, b: LanguageModelV4Usage): LanguageModelV4Usage {
  if (!a) return b;
  return { ...b, inputTokens: { total: add(a.inputTokens.total,b.inputTokens.total), noCache: add(a.inputTokens.noCache,b.inputTokens.noCache), cacheRead: add(a.inputTokens.cacheRead,b.inputTokens.cacheRead), cacheWrite: add(a.inputTokens.cacheWrite,b.inputTokens.cacheWrite) }, outputTokens: { total: add(a.outputTokens.total,b.outputTokens.total), text: add(a.outputTokens.text,b.outputTokens.text), reasoning: add(a.outputTokens.reasoning,b.outputTokens.reasoning) } };
}

/** All interpretation text and tool arguments are buffered. The model cannot
 * publish financial claims through a general/nonfinancial response. */
export function createConversationModel(model: Model, session: ConversationSession, options: { repairEnabled?: boolean } = {}) {
  const repairEnabled = options.repairEnabled ?? MIGRATION_INTERPRETATION_REPAIR_ENABLED;
  const synthetic = (): LanguageModelV4GenerateResult | undefined => {
    let content: LanguageModelV4Content[] | undefined;
    if (session.failure || session.published) content = text(session.text()!);
    else if (session.answer && !session.needsAuxiliary) {
      const form = session.clarificationForm();
      content = [{ type: "tool-call", toolCallId: `answer-${session.answer.id.slice(0, 24)}`, toolName: form ? "ask_user_input" : "execute_conversation", input: JSON.stringify(form ?? { answer_id: session.answer.id }) }];
    }
    if (content) return { content, usage, warnings: [], finishReason: { unified: content[0].type === "tool-call" ? "tool-calls" : "stop", raw: undefined } };
  };
  const checked = (content: LanguageModelV4Content[]) => {
    const calls = content.filter(p => p.type === "tool-call");
    if (session.pending.length) {
      let issue = "Exactly one interpret_request tool call is required.";
      if (calls.length === 1 && calls[0].toolName === "interpret_request") {
        try {
          const parsed = interpretationSchema.safeParse(JSON.parse(calls[0].input));
          if (parsed.success) return calls;
          issue = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0,1000);
        } catch { issue = "Malformed JSON in interpret_request."; }
      }
      // A tool is required here. Plain text would violate the SDK contract.
      throw new PortiaInterpretationError(issue);
    }
    const prose = content.filter(p => p.type === "text").map(p => p.text).join("");
    if (session.needsAuxiliary) {
      if (calls.length) return calls.some(c=>c.toolName==="complete_auxiliary") && calls.length>1 ? calls.filter(c=>c.toolName!=="complete_auxiliary") : calls;
      // No model draft, financial or otherwise, bypasses the final fence.
      return [{type:"tool-call" as const,toolCallId:`aux-unresolved-${session.state.revision}`,toolName:"complete_auxiliary",input:JSON.stringify({outcomes:session.state.tasks.filter(t=>t.kind==="other").map(t=>({taskId:t.id,status:"unresolved",text:"The additional request did not finish with a validated outcome.",receiptIds:[]}))})}];
    }
    if (hasUnboundFinancialClaim(prose)) return text("That financial claim has no validated calculation record. Please identify the requested charge or rule so it can be checked against its governing evidence.");
    const forms = calls.filter(p => p.toolName === "ask_user_input");
    if (forms.length && calls.length > 1) return calls.filter(p => p.toolName !== "ask_user_input");
    return content;
  };
  const parts = (content: LanguageModelV4Content[]): LanguageModelV4StreamPart[] => content.flatMap((p, i): LanguageModelV4StreamPart[] => p.type === "tool-call" ? [p] : p.type === "text" ? [{ type: "text-start", id: `answer-${i}` }, { type: "text-delta", id: `answer-${i}`, delta: p.text }, { type: "text-end", id: `answer-${i}` }] : []);
  return wrapLanguageModel({ model, middleware: {
    specificationVersion: "v4",
    wrapGenerate: async ({ doGenerate, params }) => {
      params.abortSignal?.throwIfAborted(); const ready = synthetic(); if (ready) return ready;
      let totalUsage: LanguageModelV4Usage | undefined;
      for (let attempt = 0; ; attempt++) {
        try {
          params.abortSignal?.throwIfAborted();
          const result = await doGenerate(); params.abortSignal?.throwIfAborted();
          totalUsage = combinedUsage(totalUsage,result.usage);
          if (!["stop", "tool-calls"].includes(result.finishReason.unified)) throw incomplete();
          if (JSON.stringify(result.content).length > 1_000_000) throw new Error("Response size limit exceeded.");
          const content = checked(result.content);
          return { ...result, usage: totalUsage, content, finishReason: { ...result.finishReason, unified: content.some(p => p.type === "tool-call") ? "tool-calls" as const : "stop" as const } };
        } catch (error) {
          params.abortSignal?.throwIfAborted();
          if (!(error instanceof PortiaInterpretationError)) throw error;
          if (!repairEnabled || attempt >= 1) { session.failure = error.message; throw error; }
          params.prompt = [...params.prompt, {role:"system",content:`Invalid interpretation: ${error.validationError} Return one valid interpret_request call. Preserve the user's meaning; do not invent or coerce facts.`}];
        }
      }
    },
    wrapStream: async ({ doStream, params }) => {
      params.abortSignal?.throwIfAborted(); const ready = synthetic();
      if (ready) return { stream: new ReadableStream({ start(c) { c.enqueue({ type: "stream-start", warnings: [] }); for (const p of parts(ready.content)) c.enqueue(p); c.enqueue({ type: "finish", finishReason: ready.finishReason, usage: ready.usage }); c.close(); } }) };
      const outerSignal = params.abortSignal;
      let totalUsage: LanguageModelV4Usage | undefined;
      let attempts = 0;
      const openAttempt = async () => {
      // The SDK sees only validated output after this buffer. Measure provider
      // first content here, without publishing partial arguments or fake progress.
      const deadline = new AbortController();
      const signal = outerSignal ? AbortSignal.any([outerSignal, deadline.signal]) : deadline.signal;
      params.abortSignal = signal;
      let rejectAbort!: (reason: unknown) => void;
      const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
      const onAbort = () => rejectAbort(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => deadline.abort(new DOMException("The provider did not produce output within 60000ms.", "TimeoutError")), MIGRATION_PROVIDER_FIRST_OUTPUT_MS);
      const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", onAbort); };
      let result;
      try {
        result = await Promise.race([doStream().then(result => {
          if (signal.aborted) { void result.stream.cancel(signal.reason).catch(() => {}); signal.throwIfAborted(); }
          return result;
        }), aborted]);
      } catch (error) { cleanup(); throw error; }
      const buffered: LanguageModelV4StreamPart[] = []; let bytes = 0, finished = false, failed = false;
      const reader = result.stream.pipeThrough(new TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart>({
        transform(part, controller) {
          signal.throwIfAborted();
          if (((part.type === "text-delta" || part.type === "reasoning-delta" || part.type === "tool-input-delta") && part.delta.length > 0) || part.type === "tool-call" || part.type === "file" || part.type === "reasoning-file") clearTimeout(timer);
          if (part.type === "error") { failed = true; buffered.length = 0; controller.enqueue(part); return; }
          if (failed || part.type === "raw") return;
          if (part.type === "stream-start" || part.type === "response-metadata") { if (!attempts) controller.enqueue(part); return; }
          if (finished) throw incomplete();
          bytes += JSON.stringify(part).length; if (bytes > 1_000_000) throw new Error("Response size limit exceeded.");
          if (part.type !== "finish") { buffered.push(part); return; }
          if (!["stop", "tool-calls"].includes(part.finishReason.unified)) throw incomplete();
          const calls = buffered.filter(p => p.type === "tool-call");
          if (buffered.some(p => p.type === "tool-input-start" && !calls.some(c => c.toolCallId === p.id))) throw incomplete();
          totalUsage = combinedUsage(totalUsage,part.usage);
          const content = checked([...text(buffered.filter(p => p.type === "text-delta").map(p => p.delta).join("")), ...calls]);
          for (const p of parts(content)) controller.enqueue(p);
          controller.enqueue({ ...part, usage:totalUsage, finishReason: { ...part.finishReason, unified: content.some(p => p.type === "tool-call") ? "tool-calls" : "stop" } }); finished = true;
        }, flush() { if (!failed && !finished) throw incomplete(); },
      }), { signal }).getReader();
      return { result, reader, cleanup, deadline };
      };
      let active = await openAttempt();
      return { ...active.result, stream: new ReadableStream<LanguageModelV4StreamPart>({
        async pull(controller) {
          while (true) {
            try {
              const { done, value } = await active.reader.read();
              if (done) { active.cleanup(); active.reader.releaseLock(); controller.close(); }
              else controller.enqueue(value);
              return;
            } catch (error) {
              active.cleanup(); active.reader.releaseLock();
              if (error instanceof PortiaInterpretationError && repairEnabled && attempts === 0 && !outerSignal?.aborted) {
                attempts++;
                params.prompt = [...params.prompt,{role:"system",content:`Invalid interpretation: ${error.validationError} Return one valid interpret_request call. Preserve the user's meaning; do not invent or coerce facts.`}];
                try { active = await openAttempt(); continue; } catch (retryError) { error = retryError; }
              }
              if (error instanceof PortiaInterpretationError) session.failure = error.message;
              controller.enqueue({type:"error",error}); controller.close(); return;
            }
          }
        },
        async cancel(reason) {
          active.deadline.abort(reason); active.cleanup();
          try { await active.reader.cancel(reason); } finally { active.reader.releaseLock(); }
        },
      }) };
    },
  } });
}
