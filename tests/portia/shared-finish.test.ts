import { expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { CompletionSession } from "../../src/lib/portia/completion";
import { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";

const shared = (business: string) => [{ toolName: "supplied_quote", toolCallId: business }, { toolName: "finish_turn", toolCallId: "finish" }];

it("accepts a finish sent beside a business call that is prepared for review", () => {
  const session = new CompletionSession();
  // The SDK runs a step's calls concurrently: the finish may execute first.
  session.finishExecuted({}, "finish");
  session.register("create", { toolName: "supplied_quote", kind: "quotation", targets: ["q"], disposition: "awaiting_approval", required: true });
  expect(session.acceptStep(shared("create"))).toBe(true);
  expect(session.completion()?.outcomes).toEqual([expect.objectContaining({ kind: "quotation", targets: ["q"], disposition: "awaiting_approval" })]);
});

it.each(["awaiting_input", "unavailable", "failed"] as const)("returns a shared finish for review when a sibling is %s", disposition => {
  const session = new CompletionSession();
  session.finishExecuted({}, "finish");
  session.register("create", { toolName: "supplied_quote", kind: "quotation", targets: ["q"], disposition, required: true, questions: disposition === "awaiting_input" ? ["What is the GT?"] : [] });
  expect(session.acceptStep(shared("create"))).toBe(false);
  expect(session.context().completionIssues).toEqual([expect.objectContaining({ code: "review_step_results" })]);
  expect(session.completion()).toBeUndefined();
});

it("returns a shared finish when a sibling produced no server result", () => {
  const session = new CompletionSession();
  session.finishExecuted({}, "finish");
  expect(session.acceptStep([{ toolName: "ask_user_input", toolCallId: "form" }, { toolName: "finish_turn", toolCallId: "finish" }])).toBe(false);
});

it("does not rebind earlier evidence that went stale during the shared step", () => {
  const session = new CompletionSession(); let current = true;
  session.register("compare", { toolName: "compare_quotes", kind: "comparison", targets: ["a", "b"], comparisonCurrency: "USD", disposition: "completed", required: true, current: () => current });
  session.finishExecuted({}, "finish"); current = false;
  session.register("create", { toolName: "supplied_quote", kind: "quotation", targets: ["q"], disposition: "awaiting_approval", required: true });
  expect(session.acceptStep(shared("create"))).toBe(false);
});

it("keeps the legacy finish protocol alone in its step", () => {
  const session = new CompletionSession();
  session.register("create", { toolName: "supplied_quote", kind: "quotation", targets: ["q"], disposition: "awaiting_approval", required: true });
  session.finish({ outcomes: [] , response: "Done." }, "finish");
  expect(session.acceptStep(shared("create"))).toBe(false);
  expect(session.context().completionIssues).toEqual([expect.objectContaining({ code: "finish_must_be_alone" })]);
});

type ScriptedCall = { toolName: string; input: unknown | ((errorId?: string) => unknown) };
function scriptedModel(steps: ScriptedCall[][]) {
  let index = 0;
  return new MockLanguageModelV4({ doGenerate: async options => {
    const errorId = JSON.stringify(options.prompt).match(/error:[0-9a-f-]{36}/)?.[0];
    const calls = steps[Math.min(index, steps.length - 1)].map((call, position) => ({ type: "tool-call" as const, toolCallId: `call-${index}-${position}`, toolName: call.toolName,
      input: JSON.stringify(typeof call.input === "function" ? call.input(errorId) : call.input) }));
    index++;
    return { content: calls, finishReason: { unified: "tool-calls" as const, raw: undefined }, warnings: [],
      usage: { inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 0, text: 0, reasoning: undefined } } };
  } });
}

it("ends a clean turn after one model call", async () => {
  const model = scriptedModel([[{ toolName: "calculate_charges", input: { expression: "2*3" } }, { toolName: "finish_turn", input: {} }]]);
  await createMigrationMainAgent({ alias: "model-1", mainModel: model }).generate({ prompt: "What is 2 times 3?" });
  expect(model.doGenerateCalls).toHaveLength(1);
});

it("spends a second call only when the shared step needs review", async () => {
  const model = scriptedModel([
    [{ toolName: "calculate_charges", input: { expression: "2*" } }, { toolName: "finish_turn", input: {} }],
    // A repair cites the returned errorId, as the tool contract requires.
    [{ toolName: "calculate_charges", input: (errorId?: string) => ({ expression: "2*3", retryOf: errorId }) }, { toolName: "finish_turn", input: {} }],
  ]);
  await createMigrationMainAgent({ alias: "model-1", mainModel: model }).generate({ prompt: "What is 2 times 3?" });
  expect(model.doGenerateCalls).toHaveLength(2);
});
