import { wrapLanguageModel } from "ai";
import type { LanguageModelV4Content, LanguageModelV4GenerateResult, LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { formInputSchema } from "./contracts";
import type { RequestEvidence } from "./request-evidence";

type Model = Parameters<typeof wrapLanguageModel>[0]["model"];
const MAX_STEP_BYTES = 1_000_000;
const zeroUsage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};
const textContent = (text: string): LanguageModelV4Content[] => [{ type: "text", text }];
const incomplete = () => new Error("Main-agent response is incomplete. Please retry explicitly.");

function normalizeForm(input: string): { input: string } | { questions: string[] } {
  let value: unknown;
  try { value = JSON.parse(input); } catch { return { questions: [] }; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { questions: [] };
  const form = { ...value } as Record<string, unknown>;
  if (form.description === null) delete form.description;
  if (Array.isArray(form.fields)) form.fields = form.fields.map(field => {
    if (!field || typeof field !== "object" || Array.isArray(field)) return field;
    const normalized = { ...field };
    // Only representation repairs: never invent a field name, label, type or option.
    for (const key of ["placeholder", "unit", "hint"]) if (normalized[key] === null) delete normalized[key];
    if (normalized.required === undefined || normalized.required === null) normalized.required = true;
    if (normalized.type !== "radio" && (normalized.options === null || Array.isArray(normalized.options) && !normalized.options.length)) delete normalized.options;
    return normalized;
  });
  const parsed = formInputSchema.safeParse(form);
  if (parsed.success) return { input: JSON.stringify(parsed.data) };
  const questions = Array.isArray(form.fields) ? form.fields.slice(0, 8).flatMap(field =>
    field && typeof field === "object" && typeof field.label === "string" && field.label.trim().length <= 160
      ? [field.label.trim()] : []) : [];
  return { questions };
}

/** Bounded, per-run boundary; preserves provider usage/errors and adds no retry. */
export function createGuardedMainModel(model: Model, evidence: RequestEvidence) {
  const transform = (content: LanguageModelV4Content[]) => {
    const calls = content.filter(part => part.type === "tool-call");
    const forms = calls.filter(part => part.toolName === "ask_user_input");
    if (evidence.forcedResponse) return textContent(evidence.forcedResponse);
    if (evidence.officialTariffActive) {
      if (calls.length === 1 && calls[0].toolName === "consult_port_agent") {
        try {
          const input = JSON.parse(calls[0].input);
          if (input && Object.keys(input).sort().join(",") === "port_name,query" && input.port_name === "mumbai" && typeof input.query === "string") return calls;
        } catch { /* No unsupported dispatch or unbound financial prose. */ }
      }
      evidence.forcedResponse = "The approved tariff calculation was not completed. No source-validated estimate was published.";
      return textContent(evidence.forcedResponse);
    }
    if (evidence.suppliedQuotationActive) {
      // Financial text on this path comes exclusively from the source-bound
      // ledger renderer. Discard any prose accompanying the dispatch.
      if (calls.length === 1 && calls[0].toolName === "calculate_supplied_quote") {
        try {
          const input = JSON.parse(calls[0].input);
          if (input && Object.keys(input).length === 1 && input.quote_id === evidence.suppliedQuotationId) return calls;
        } catch { /* Invalid dispatch cannot trigger another inference attempt. */ }
      }
      evidence.forcedResponse = "The supplied quotation was not calculated from its verified bindings. No quotation was published; please retry the current request.";
      return textContent(evidence.forcedResponse);
    }
    // A form cannot be persisted with executable tools. Let the ordinary next
    // agent step ask again after observing their results, avoiding a stale form.
    if (forms.length && calls.length > forms.length) return content.filter(part => part.type !== "text" && !(part.type === "tool-call" && part.toolName === "ask_user_input"));
    if (forms.length) {
      const normalized = forms.length === 1 ? normalizeForm(forms[0].input) : { questions: [] };
      if ("input" in normalized) {
        const form = formInputSchema.parse(JSON.parse(normalized.input));
        const facts = evidence.formFacts();
        if (facts) form.description = [facts, form.description].filter(Boolean).join("\n").slice(0, 500);
        return [{ ...forms[0], input: JSON.stringify(form) }];
      }
      return textContent(evidence.clarification(normalized.questions.length
        ? `Please confirm:\n${normalized.questions.map(label => `- ${label}`).join("\n")}`
        : "I could not present the requested clarification form. Please confirm the missing port/terminal and applicable tariff or supplied rate; I have not established a price."));
    }
    const text = content.filter(part => part.type === "text").map(part => part.text).join("");
    const replacement = evidence.guardAnswer(text);
    return replacement ? textContent(replacement) : content;
  };
  const synthetic = (): LanguageModelV4GenerateResult => ({ content: textContent(evidence.forcedResponse!), finishReason: { unified: "stop", raw: undefined }, usage: zeroUsage, warnings: [] });
  const streamText = (content: LanguageModelV4Content[]): LanguageModelV4StreamPart[] => content.flatMap((part, index): LanguageModelV4StreamPart[] => {
    if (part.type === "text") return [{ type: "text-start", id: `checked-${index}` }, { type: "text-delta", id: `checked-${index}`, delta: part.text }, { type: "text-end", id: `checked-${index}` }];
    if (part.type === "tool-call") return [part];
    return [];
  });
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: "v4",
      wrapGenerate: async ({ doGenerate, params }) => {
        params.abortSignal?.throwIfAborted();
        if (evidence.forcedResponse) return synthetic();
        const result = await doGenerate();
        if (!["stop", "tool-calls"].includes(result.finishReason.unified)) throw incomplete();
        if (JSON.stringify(result.content).length > MAX_STEP_BYTES) throw new Error("Main-agent output limit exceeded.");
        const content = transform(result.content);
        return { ...result, content, finishReason: { ...result.finishReason, unified: content.some(p => p.type === "tool-call") ? "tool-calls" : "stop" } };
      },
      wrapStream: async ({ doStream, params }) => {
        params.abortSignal?.throwIfAborted();
        if (evidence.forcedResponse) {
          const result = synthetic();
          return { stream: new ReadableStream({ start(c) {
            c.enqueue({ type: "stream-start", warnings: [] });
            for (const part of streamText(result.content)) c.enqueue(part);
            c.enqueue({ type: "finish", usage: result.usage, finishReason: result.finishReason }); c.close();
          } }) };
        }
        const result = await doStream();
        const bufferText = evidence.suppliedQuotationActive || evidence.officialTariffActive || evidence.needsAnswerValidation();
        const parts: LanguageModelV4StreamPart[] = [];
        let size = 0; let failed = false; let finished = false;
        return { ...result, stream: result.stream.pipeThrough(new TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart>({
          transform(part, controller) {
            params.abortSignal?.throwIfAborted();
            if (part.type === "error") { failed = true; parts.length = 0; controller.enqueue(part); return; }
            if (failed) return;
            if (part.type === "stream-start" || part.type === "response-metadata") { controller.enqueue(part); return; }
            if (part.type === "raw") return;
            if (finished) throw incomplete();
            size += JSON.stringify(part).length;
            if (size > MAX_STEP_BYTES) throw new Error("Main-agent output limit exceeded.");
            if (part.type !== "finish") {
              if (!bufferText && part.type.startsWith("text-")) controller.enqueue(part);
              parts.push(part); return;
            }
            if (!["stop", "tool-calls"].includes(part.finishReason.unified)) throw incomplete();
            const content: LanguageModelV4Content[] = [];
            const text = parts.filter(p => p.type === "text-delta").map(p => p.delta).join("");
            if (text) content.push({ type: "text", text });
            content.push(...parts.filter(p => p.type === "tool-call"));
            const startedCalls = parts.filter(p => p.type === "tool-input-start");
            if (startedCalls.some(p => !content.some(c => c.type === "tool-call" && c.toolCallId === p.id))) throw incomplete();
            const checked = transform(content);
            // Keep sources and reasoning metadata, but never leak unchecked text
            // or raw tool arguments before validation has completed.
            for (const p of parts) if (!evidence.suppliedQuotationActive && !evidence.officialTariffActive && !p.type.startsWith("text-") && !p.type.startsWith("tool-")) controller.enqueue(p);
            for (const p of streamText(checked)) {
              if (!bufferText && checked === content && p.type.startsWith("text-")) continue;
              controller.enqueue(p);
            }
            controller.enqueue({ ...part, finishReason: { ...part.finishReason, unified: checked.some(p => p.type === "tool-call") ? "tool-calls" : "stop" } });
            finished = true; parts.length = 0;
          },
          flush() { if (!failed && !finished) throw incomplete(); },
        })) };
      },
    },
  });
}
