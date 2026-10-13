import "server-only";
import { randomUUID } from "node:crypto";
import { wrapLanguageModel } from "ai";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";

type Model = Parameters<typeof wrapLanguageModel>[0]["model"];
const PUBLICATION_TOOL = "publish_report";
const REVIEW_INSTRUCTIONS = `A completed specialist report is available. Review it against the CURRENT user's scope and facts, computed amounts, citations, effective dates, static-source limitations, rounding, GST/FX and uncertainties.
If it is complete, correct and ready to show unchanged, call publish_report with its report_id ALONE, without text or any other tool call. This publishes the reviewed answer verbatim instead of rewriting it.
If correction, synthesis, additional calculations or actions are needed, perform them or write a normal answer. Never approve an incomplete report just to save time.`;
const invalidApproval = () => new Error("The report approval was incomplete or invalid. Please retry.");

/** Retain model review, then publish the completed specialist report verbatim. */
export function createReviewedReportModel(model: Model) {
  const reports = new Map<string, string>();
  const nonce = randomUUID().slice(0, 8);
  const approve = (input: string): string => {
    let parsed: unknown;
    try { parsed = JSON.parse(input); } catch { throw invalidApproval(); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
        Object.keys(parsed).length !== 1 || !("report_id" in parsed) || typeof parsed.report_id !== "string") throw invalidApproval();
    const report = reports.get(parsed.report_id);
    if (report === undefined) throw invalidApproval();
    return report;
  };
  return {
    offer(report: string): string {
      if (!report.trim() || reports.size >= 3) throw invalidApproval();
      const reportId = `${nonce}_${reports.size + 1}`;
      reports.set(reportId, report);
      return JSON.stringify({ report_id: reportId, report });
    },
    model: wrapLanguageModel({
      model,
      middleware: {
        specificationVersion: "v4",
        transformParams: async ({ params }) => {
          // Multiple reports require normal synthesis rather than selecting one.
          if (reports.size !== 1 || (params.toolChoice && params.toolChoice.type !== "auto")) return params;
          const [first, ...rest] = params.prompt;
          const prompt = first?.role === "system"
            ? [{ ...first, content: `${first.content}\n\n${REVIEW_INSTRUCTIONS}` }, ...rest]
            : [{ role: "system" as const, content: REVIEW_INSTRUCTIONS }, ...params.prompt];
          return { ...params, prompt, tools: [...(params.tools ?? []), {
            type: "function" as const,
            name: PUBLICATION_TOOL,
            description: "After reviewing a completed specialist report against the user's request, publish it unchanged only if correct, complete and ready for the user. Call alone, without accompanying text. Otherwise correct/consult or answer normally.",
            inputSchema: { type: "object", properties: { report_id: { type: "string", enum: [...reports.keys()] } }, required: ["report_id"], additionalProperties: false },
          }] };
        },
        wrapGenerate: async ({ doGenerate, params }) => {
          const result = await doGenerate();
          const publications = result.content.filter(part => part.type === "tool-call" && part.toolName === PUBLICATION_TOOL);
          if (!publications.length) return result;
          if (!params.tools?.some(tool => tool.type === "function" && tool.name === PUBLICATION_TOOL) ||
              publications.length !== 1 || !["stop", "tool-calls"].includes(result.finishReason.unified) ||
              result.content.some(part => part.type !== "reasoning" && part !== publications[0])) throw invalidApproval();
          const publication = publications[0];
          if (publication.type !== "tool-call") throw invalidApproval();
          return { ...result,
            content: [...result.content.filter(part => part.type === "reasoning"), { type: "text" as const, text: approve(publication.input) }],
            finishReason: { ...result.finishReason, unified: "stop" as const },
          };
        },
        wrapStream: async ({ doStream, params }) => {
          const result = await doStream();
          const publicationIds = new Set<string>();
          let publication: { id: string; input: string } | undefined;
          let otherContent = false;
          let failed = false;
          let finished = false;
          return { ...result, stream: result.stream.pipeThrough(new TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart>({
            transform(part, controller) {
              // Raw provider chunks can contain the private publication arguments.
              if (part.type === "raw" && reports.size) return;
              if (part.type === "error") {
                failed = true;
                controller.enqueue(part);
                return;
              }
              if (part.type === "tool-input-start" && part.toolName === PUBLICATION_TOOL) {
                publicationIds.add(part.id);
                return;
              }
              if ((part.type === "tool-input-delta" || part.type === "tool-input-end") && publicationIds.has(part.id)) return;
              if (part.type === "tool-call" && part.toolName === PUBLICATION_TOOL) {
                if (publication) throw invalidApproval();
                publicationIds.add(part.toolCallId);
                publication = { id: part.toolCallId, input: part.input };
                return;
              }
              if (part.type === "finish") {
                finished = true;
                if (!failed && publicationIds.size) {
                  if (!params.tools?.some(tool => tool.type === "function" && tool.name === PUBLICATION_TOOL) ||
                      !publication || publicationIds.size !== 1 || otherContent || !["stop", "tool-calls"].includes(part.finishReason.unified)) throw invalidApproval();
                  const report = approve(publication.input);
                  const id = `report-${publication.id}`;
                  controller.enqueue({ type: "text-start", id });
                  controller.enqueue({ type: "text-delta", id, delta: report });
                  controller.enqueue({ type: "text-end", id });
                  controller.enqueue({ ...part, finishReason: { ...part.finishReason, unified: "stop" } });
                  return;
                }
              }
              if (part.type === "tool-call" || part.type === "tool-input-start" || part.type === "tool-result" ||
                  part.type === "tool-approval-request" || part.type === "custom" || part.type === "file" || part.type === "source" ||
                  (part.type === "text-delta" && part.delta.trim())) otherContent = true;
              controller.enqueue(part);
            },
            flush() { if (!failed && !finished && publicationIds.size) throw invalidApproval(); },
          })) };
        },
      },
    }),
  };
}
