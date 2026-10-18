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
