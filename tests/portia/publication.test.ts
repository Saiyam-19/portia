import { expect, it } from "vitest";
import type { TextStreamPart, ToolSet } from "ai";
import { persistedAnswerStream } from "../../src/lib/portia/publication";
const text = { type: "text-delta", id: "draft", text: "Invented USD 999999" } as TextStreamPart<ToolSet>;
it("withholds model drafts and emits only saved deterministic text after completion", async () => {
  let saved = false;
  const source = new ReadableStream<TextStreamPart<ToolSet>>({ start(controller) { controller.enqueue(text); }, pull(controller) { saved = true; controller.close(); } });
  const output: TextStreamPart<ToolSet>[] = [];
  const reader = persistedAnswerStream(source, { isPersisted: () => saved, text: () => "Saved USD 1,020.00", abortSignal: new AbortController().signal }).getReader();
  while (true) { const item = await reader.read(); if (item.done) break; output.push(item.value); }
  expect(JSON.stringify(output)).toContain("Saved USD 1,020.00"); expect(JSON.stringify(output)).not.toContain("999999");
});
it("failed persistence publishes no financial text", async () => {
  const source = new ReadableStream<TextStreamPart<ToolSet>>({ start(controller) { controller.enqueue(text); controller.close(); } });
  const output: TextStreamPart<ToolSet>[] = [];
  await expect((async () => { const reader = persistedAnswerStream(source, { isPersisted: () => false, text: () => "USD 1,020.00", abortSignal: new AbortController().signal }).getReader(); while (true) { const item = await reader.read(); if (item.done) break; output.push(item.value); } })()).rejects.toThrow(/persistence/);
  expect(output).toEqual([]);
});

const nativeForm = { toolCallId: "exact-review", title: "Confirm exact operations", fields: [{ name: "decision", label: "Apply shown terms?", type: "radio" as const, options: ["Approve exactly as shown", "Reject"], required: true }] };
async function collectPublished(parts: TextStreamPart<ToolSet>[], persisted: boolean, signal = new AbortController().signal) {
  const source = new ReadableStream<TextStreamPart<ToolSet>>({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close(); } });
  const reader = persistedAnswerStream(source, { isPersisted: () => persisted, text: () => "Saved partial result.\n\nWhat is the missing price?", form: () => nativeForm, abortSignal: signal }).getReader();
  const output: TextStreamPart<ToolSet>[] = [];
  for (;;) { const next = await reader.read(); if (next.done) return output; output.push(next.value); }
}
it("emits fenced partial text and native review before retaining a provider error", async () => {
  const error = new Error("provider stopped after prior completed work");
  const output = await collectPublished([text, { type: "error", error }, { type: "finish", finishReason: "tool-calls" } as TextStreamPart<ToolSet>], true);
  const bodyAt = output.findIndex(part => part.type === "text-delta");
  const formAt = output.findIndex(part => part.type === "tool-call");
  const errorAt = output.findIndex(part => part.type === "error");
  expect(bodyAt).toBeGreaterThanOrEqual(0); expect(formAt).toBeGreaterThan(bodyAt); expect(errorAt).toBeGreaterThan(formAt);
  expect(output[bodyAt]).toMatchObject({ text: "Saved partial result.\n\nWhat is the missing price?" });
  expect(output[formAt]).toMatchObject({ toolCallId: nativeForm.toolCallId });
  expect(output[errorAt]).toMatchObject({ error });
  expect(output.at(-1)).toMatchObject({ type: "finish", finishReason: "error" });
  expect(JSON.stringify(output)).not.toContain("999999");
});
it("an error without fenced persistence cannot publish partial text or a native form", async () => {
  const output = await collectPublished([{ type: "error", error: new Error("failed") }, { type: "finish", finishReason: "tool-calls" } as TextStreamPart<ToolSet>], false);
  expect(output.some(part => part.type === "text-delta" || part.type === "tool-call")).toBe(false);
  expect(output.some(part => part.type === "error")).toBe(true);
  expect(output.at(-1)).toMatchObject({ finishReason: "error" });
});
it("cancellation publishes no new persisted answer or native form", async () => {
  const abort = new AbortController(); abort.abort(new DOMException("Stopped", "AbortError"));
  const output = await collectPublished([{ type: "abort" }, { type: "finish", finishReason: "tool-calls" } as TextStreamPart<ToolSet>], true, abort.signal);
  expect(output.some(part => part.type === "text-delta" || part.type === "tool-call" || part.type === "finish")).toBe(false);
  expect(output).toEqual([{ type: "abort" }]);
});
