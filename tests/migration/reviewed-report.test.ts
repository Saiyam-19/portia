import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";
import { expect, it, vi } from "vitest";
import { createReviewedReportModel } from "../../src/lib/migration/reviewed-report";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};
const report = "Total INR 831962, GST excluded. tariffs.md §2.16. Static schedule; dates and exclusions apply.";
const finish = (unified: "stop" | "tool-calls" | "length" = "tool-calls"): LanguageModelV4StreamPart =>
  ({ type: "finish", finishReason: { unified, raw: undefined }, usage });
async function drain(stream: ReadableStream<LanguageModelV4StreamPart>) {
  const parts: LanguageModelV4StreamPart[] = [];
  const reader = stream.getReader();
  try { while (true) { const next = await reader.read(); if (next.done) break; parts.push(next.value); } }
  finally { reader.releaseLock(); }
  return parts;
}

it("offers publication only after a completed report and replaces an approval with that exact report", async () => {
  let input = "";
  const raw = new MockLanguageModelV4({ doGenerate: async () => ({
    content: [{ type: "tool-call", toolCallId: "approve", toolName: "publish_report", input }],
    finishReason: { unified: "tool-calls", raw: undefined }, usage, warnings: [],
  }) });
  const handoff = createReviewedReportModel(raw);
  const offered = JSON.parse(handoff.offer(report));
  input = JSON.stringify({ report_id: offered.report_id });
  const result = await handoff.model.doGenerate({ prompt: [], tools: [] });
  expect(raw.doGenerateCalls[0].tools?.some(tool => tool.type === "function" && tool.name === "publish_report")).toBe(true);
  expect(result.content).toEqual([{ type: "text", text: report }]);
  expect(result.finishReason.unified).toBe("stop");
  expect(result.usage).toEqual(usage);
});

it("keeps ordinary answers and original tool choices unchanged", async () => {
  const content = [{ type: "text" as const, text: "A corrected or synthesized answer" }];
  const raw = new MockLanguageModelV4({ doGenerate: { content, finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] } });
  const handoff = createReviewedReportModel(raw);
  expect((await handoff.model.doGenerate({ prompt: [] })).content).toEqual(content);
  expect(raw.doGenerateCalls[0].tools).toBeUndefined();
  expect(raw.doGenerateCalls[0].prompt).toEqual([]);
  handoff.offer(report);
  expect((await handoff.model.doGenerate({ prompt: [], toolChoice: { type: "none" } })).content).toEqual(content);
  expect(raw.doGenerateCalls[1].tools).toBeUndefined();
});

it("does not publish a stream that ends before approval finishes or that reports an error", async () => {
  for (const providerError of [false, true]) {
    const sourceError = new Error("sanitized provider failure");
    const raw = new MockLanguageModelV4({ doStream: async () => ({ warnings: [], stream: new ReadableStream({ start(controller) {
      controller.enqueue({ type: "tool-input-start", id: "pending", toolName: "publish_report" });
      controller.enqueue({ type: "tool-input-delta", id: "pending", delta: '{"report_id":' });
      if (providerError) controller.enqueue({ type: "error", error: sourceError });
      controller.close();
    } }) }) });
    const handoff = createReviewedReportModel(raw); handoff.offer(report);
    const output = drain((await handoff.model.doStream({ prompt: [] })).stream);
    if (providerError) expect(await output).toEqual([{ type: "error", error: sourceError }]);
    else await expect(output).rejects.toThrow(/report approval/i);
  }
});

it("never publishes unknown, incomplete or mixed-tool approvals", async () => {
  for (const scenario of ["unknown", "length", "mixed", "extra-argument"] as const) {
    let input = "";
    const raw = new MockLanguageModelV4({ doGenerate: async () => ({
      content: [
        { type: "tool-call" as const, toolCallId: "approve", toolName: "publish_report", input },
        ...(scenario === "mixed" ? [{ type: "tool-call" as const, toolCallId: "other", toolName: "remember_memory", input: "{}" }] : []),
      ],
      finishReason: { unified: scenario === "length" ? "length" : "tool-calls", raw: undefined }, usage, warnings: [],
    }) });
    const handoff = createReviewedReportModel(raw);
    const offered = JSON.parse(handoff.offer(report));
    input = JSON.stringify({ report_id: scenario === "unknown" ? "other-run-report" : offered.report_id, ...(scenario === "extra-argument" ? { text: "fabricated total" } : {}) });
    await expect(handoff.model.doGenerate({ prompt: [] })).rejects.toThrow(/report approval/i);
  }
});

it("expands fragmented streamed approval only after a clean finish; protocol parts never reach the SDK", async () => {
  let reportId = "";
  const raw = new MockLanguageModelV4({ doStream: async () => ({ warnings: [], stream: new ReadableStream({ start(controller) {
    controller.enqueue({ type: "stream-start", warnings: [] });
    controller.enqueue({ type: "tool-input-start", id: "approval", toolName: "publish_report" });
    controller.enqueue({ type: "tool-input-delta", id: "approval", delta: '{"report_id":' });
    controller.enqueue({ type: "tool-input-delta", id: "approval", delta: JSON.stringify(reportId) + '}' });
    controller.enqueue({ type: "tool-input-end", id: "approval" });
    controller.enqueue({ type: "tool-call", toolCallId: "approval", toolName: "publish_report", input: JSON.stringify({ report_id: reportId }) });
    controller.enqueue(finish()); controller.close();
  } }) }) });
  const handoff = createReviewedReportModel(raw);
  reportId = JSON.parse(handoff.offer(report)).report_id;
  const parts = await drain((await handoff.model.doStream({ prompt: [] })).stream);
  expect(parts.filter(part => part.type === "text-delta")).toEqual([{ type: "text-delta", id: "report-approval", delta: report }]);
  expect(parts.at(-1)).toMatchObject({ type: "finish", finishReason: { unified: "stop" } });
  expect(JSON.stringify(parts)).not.toContain(reportId);
  expect(parts.some(part => part.type.startsWith("tool-"))).toBe(false);
});

it("withholds truncated streamed reports and propagates cancellation", async () => {
  let reportId = "";
  const raw = new MockLanguageModelV4({ doStream: async () => ({ warnings: [], stream: new ReadableStream({ start(controller) {
    controller.enqueue({ type: "tool-call", toolCallId: "approval", toolName: "publish_report", input: JSON.stringify({ report_id: reportId }) });
    controller.enqueue(finish("length")); controller.close();
  } }) }) });
  const handoff = createReviewedReportModel(raw);
  reportId = JSON.parse(handoff.offer(report)).report_id;
  await expect(drain((await handoff.model.doStream({ prompt: [] })).stream)).rejects.toThrow(/report approval/i);
  const cancel = vi.fn();
  const waiting = createReviewedReportModel(new MockLanguageModelV4({ doStream: async () => ({ warnings: [], stream: new ReadableStream({ cancel }) }) }));
  await (await waiting.model.doStream({ prompt: [] })).stream.cancel("stopped");
  expect(cancel).toHaveBeenCalledWith("stopped");
});

it("cannot publish a report from another run", async () => {
  let input = "";
  const raw = new MockLanguageModelV4({ doGenerate: async () => ({
    content: [{ type: "tool-call", toolCallId: "approve", toolName: "publish_report", input }],
    finishReason: { unified: "tool-calls", raw: undefined }, usage, warnings: [],
  }) });
  const otherRun = createReviewedReportModel(raw);
  const thisRun = createReviewedReportModel(raw);
  thisRun.offer("This run's answer");
  input = JSON.stringify({ report_id: JSON.parse(otherRun.offer("Other user's answer")).report_id });
  await expect(thisRun.model.doGenerate({ prompt: [] })).rejects.toThrow(/report approval/i);
});

it("leaves multi-report synthesis to the main agent", async () => {
  const raw = new MockLanguageModelV4({ doGenerate: {
    content: [{ type: "text", text: "Combined answer" }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [],
  } });
  const handoff = createReviewedReportModel(raw);
  handoff.offer("First port"); handoff.offer("Second port");
  await handoff.model.doGenerate({ prompt: [], tools: [] });
  expect(raw.doGenerateCalls[0].tools).toEqual([]);
});
