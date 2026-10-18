import { expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";
import { QuoteSession } from "../../src/lib/portia/session";
import { quoteInputSchema } from "../../src/lib/portia/quotes";
import { PORT_ALIASES } from "../../src/lib/migration/ports";

const prompt = "Using the retained 2026 schedule at JSW Jaigarh Port Limited, J-1 mechanized-bulk, calculate only port dues for a fictional 5000 GT ship with a 30-day call beginning 12 November 2026.";
const valid = { pricing: "official", call: { port: "JSW Jaigarh Port Limited", cargoCategory: "mechanized-bulk", gt: "5000", callDays: "30", callDate: "12 November 2026" }, services: ["port-dues"] };
const invalid = { ...valid, call: { ...valid.call, terminal: "J-1" } };
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } };
const step = (content: LanguageModelV4GenerateResult["content"], stop = false): LanguageModelV4GenerateResult => ({ content, finishReason: { unified: stop ? "stop" : "tool-calls", raw: undefined }, usage, warnings: [] });
const call = (input: unknown, id: string) => step([{ type: "tool-call", toolName: "manage_quote", toolCallId: id, input: JSON.stringify(input) }]);
const done = step([{ type: "text", text: "Done." }], true);
function streaming(sequence: LanguageModelV4GenerateResult[]) {
  let index = 0;
  return new MockLanguageModelV4({ doStream: async () => {
    const next = sequence[index++];
    return { stream: new ReadableStream({ start(controller) {
      for (const part of next.content) if (part.type === "text") {
        controller.enqueue({ type: "text-start", id: "t" }); controller.enqueue({ type: "text-delta", id: "t", delta: part.text }); controller.enqueue({ type: "text-end", id: "t" });
      } else if (part.type === "tool-call") controller.enqueue(part);
      else throw new Error("Unsupported test content");
      controller.enqueue({ type: "finish", finishReason: next.finishReason, usage }); controller.close();
    } }) };
  } });
}

it.each(PORT_ALIASES.jaigarh)("rejects a tariff item as a physical terminal before saving: %s", port => {
  const result = quoteInputSchema.safeParse({ ...invalid, call: { ...invalid.call, port } });
  expect(result.success).toBe(false);
  if (!result.success) expect(result.error.message).toMatch(/J-1.*tariff|tariff.*J-1/i);
});
it("allows the SDK to repair invalid input into one quote without a stale public error", async () => {
  const session = new QuoteSession("j1-repair"), model = streaming([call(invalid, "bad"), call({ ...valid, call: { ...valid.call, terminal: null } }, "good"), done]);
  const result = await createMigrationMainAgent({ alias: "model-1", mainModel: model, session }).stream({ prompt });
  const prose = await result.text;
  expect((await result.steps)[0].toolCalls[0]).toMatchObject({ invalid: true });
  expect(session.quotes.size).toBe(1);
  const quote = [...session.quotes.values()][0]; expect(quote.revision).toBe(0); expect(quote.call.terminal).toBeUndefined();
  const text = await session.answer(prose); expect(text).toContain("USD 2,000.00"); expect(text).not.toMatch(/cannot be validated|terminal:null|input.*invalid|Details still needed/);
});
it("a rejected-only SDK call cannot publish Done or save an invalid receipt", async () => {
  const session = new QuoteSession("j1-invalid"), model = streaming([call(invalid, "bad"), done]);
  const result = await createMigrationMainAgent({ alias: "model-1", mainModel: model, session }).stream({ prompt });
  const prose = await result.text;
  expect((await result.steps)[0].toolCalls[0]).toMatchObject({ invalid: true }); expect(session.quotes.size).toBe(0);
  expect(await session.answer(prose)).toMatch(/No tool-backed.*completed/i);
});
it("a blank reserved answer cannot mask rejected business input", async () => {
  const session = new QuoteSession("j1-blank"); await session.initialize([]); session.reserveAnswer("blank");
  session.observeTools([], [{ toolName: "manage_quote", invalid: true }]);
  expect(await session.answer("Done.")).toMatch(/No tool-backed.*completed/i);
});
it("preserves memory acknowledgement alongside rejected-only business input", async () => {
  const session = new QuoteSession("j1-memory"); await session.initialize([]);
  session.observeTools([{ toolCallId: "memory", toolName: "remember_memory", output: { saved: true } }], [{ toolName: "manage_quote", invalid: true }]);
  const text = await session.answer("Done."); expect(text).toContain("Requested memory saved"); expect(text).toMatch(/No tool-backed.*completed/i);
});
it("does not silently reinterpret other explicitly supplied physical terminal names", () => {
  const input = { ...invalid, call: { ...invalid.call, terminal: "Unverified booked jetty J-9" } };
  expect(quoteInputSchema.parse(input).call?.terminal).toBe(input.call.terminal);
});
