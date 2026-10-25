import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ModelMessage } from "ai";
import { expect, it } from "vitest";
import { checkAnswer, withoutNarration } from "../../src/lib/berthwise/answer";
import { businessTools } from "../../src/lib/berthwise/tools";
import { berthwiseInstructions, createMigrationMainAgent } from "../../src/lib/migration/domain-agent";
import { berthwiseModelId, migrationLanguageModel } from "../../src/lib/migration/model";
import { EVERYDAY_QUESTIONS, type EverydayQuestion } from "./everyday-questions";

/** Paid end-to-end run of the everyday questions through the real model, the same
 * tools and the same answer check as the chat route. Run with:
 *   npx vitest run --config vitest.eval.config.ts
 * Writes docs/handover/evaluation/<model>-<date>.{json,md}. */

const fleetShips = [{ id: "s1", name: "MV Ocean Star", imo: "9876543", grt: "32450", nrt: "18966", type: "bulk" as const, status: "foreign" as const, updatedAt: 1 }];
const tools = () => businessTools({
  fleet: { list: async () => fleetShips, save: async () => ({ id: "s2", created: true }) },
  company: {
    agreedRates: async () => [{ id: "r1", portId: "hazira", chargeType: "berth-hire", kind: "discount", percent: "15", note: "Sample agreement", updatedAt: 1 }],
    search: async (question: string) => /laytime|demurrage|charter/i.test(question)
      ? [{ documentId: "d1", title: "Sample charter party 2026", fileName: "sample-charter-party.pdf", page: 3, text: "Clause 14. Laytime: 72 running hours, Sundays and holidays excepted. Demurrage: USD 18,000 per day pro rata." }]
      : [],
  },
  sources: async () => [],
});

async function key(): Promise<{ usage: number; limit: number | null }> {
  const response = await fetch("https://openrouter.ai/api/v1/key", { headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` } });
  const { data } = await response.json() as { data: { usage: number; limit: number | null } };
  return data;
}

type Outcome = {
  id: string; question: string; answer: string; tools: string[]; steps: number; inputTokens: number; outputTokens: number; ms: number;
  repaired: boolean; fallback: boolean; checks: Array<{ check: string; ok: boolean }>; error?: string;
  calls?: Array<{ tool: string; input: unknown; output: string }>;
};

async function ask(item: EverydayQuestion): Promise<Outcome> {
  const started = Date.now();
  const model = migrationLanguageModel("model-1", { agent: "main" });
  const agent = createMigrationMainAgent({ alias: "model-1", mainModel: model, tools: tools() });
  const history: ModelMessage[] = [{ role: "user", content: item.question }];
  const saved: ModelMessage[] = [];
  let final: ModelMessage[] = [];
  try {
    const result = await agent.generate({
      messages: history,
      onStepEnd: async step => {
        const messages = step.response.messages as ModelMessage[];
        if (!step.toolCalls.length) { final = messages; return; }
        saved.push(...withoutNarration(messages));
      },
    });
    const checked = await checkAnswer({ model, system: berthwiseInstructions(), history, steps: saved, final });
    const used = [...new Set(saved.flatMap(message => message.role === "assistant" && Array.isArray(message.content)
      ? message.content.flatMap(part => part.type === "tool-call" ? [part.toolName] : []) : []))];
    const text = checked.text.toLowerCase().replace(/[’‘]/g, "'");
    const results = new Map(saved.flatMap(message => message.role === "tool" && Array.isArray(message.content)
      ? message.content.flatMap(part => part.type === "tool-result" ? [[part.toolCallId, JSON.stringify(part.output)] as const] : []) : []));
    const calls = saved.flatMap(message => message.role === "assistant" && Array.isArray(message.content)
      ? message.content.flatMap(part => part.type === "tool-call" ? [{ tool: part.toolName, input: part.input, output: (results.get(part.toolCallId) ?? "").replace(/"card":\{.*?"summary"/, '"summary"').slice(0, 1500) }] : []) : []);
    const checks = [
      ...(item.tools ? [{ check: `uses ${item.tools.join(" or ")}`, ok: item.tools.some(name => used.includes(name)) }] : []),
      ...(item.noTools ? [{ check: "answers without tools", ok: used.length === 0 }] : []),
      ...(item.say ?? []).map(want => { const options = Array.isArray(want) ? want : [want]; return { check: `says ${options.join(" / ")}`, ok: options.some(option => text.includes(option.toLowerCase())) }; }),
      ...(item.avoid ?? []).map(word => ({ check: `doesn't say ${word}`, ok: !text.includes(word.toLowerCase()) })),
      { check: "every figure supported", ok: checked.unsupported.length === 0 },
      { check: "not a fallback", ok: !checked.text.startsWith("Sorry, I couldn't") && !checked.text.startsWith("The calculated figures are shown above") && !checked.incomplete },
    ];
    return {
      id: item.id, question: item.question, answer: checked.text, tools: used, steps: result.steps.length,
      inputTokens: result.steps.reduce((sum, step) => sum + (step.usage.inputTokens ?? 0), 0),
      outputTokens: result.steps.reduce((sum, step) => sum + (step.usage.outputTokens ?? 0), 0),
      ms: Date.now() - started, repaired: checked.repaired, fallback: checks.at(-1)!.ok === false, checks, calls,
    };
  } catch (error) {
    return { id: item.id, question: item.question, answer: "", tools: [], steps: 0, inputTokens: 0, outputTokens: 0, ms: Date.now() - started, repaired: false, fallback: true, checks: [{ check: "runs", ok: false }], error: error instanceof Error ? error.message : String(error) };
  }
}

it("answers the everyday questions", { timeout: 1_800_000 }, async () => {
  const only = process.env.EVAL_ONLY?.split(",");
  const questions = EVERYDAY_QUESTIONS.filter(item => !only || only.includes(item.id));
  const before = await key();
  const outcomes: Outcome[] = [];
  for (let start = 0; start < questions.length; start += 3) outcomes.push(...await Promise.all(questions.slice(start, start + 3).map(ask)));
  const after = await key();
  const modelId = berthwiseModelId(), date = new Date().toISOString().slice(0, 10);
  const passed = outcomes.filter(outcome => outcome.checks.every(check => check.ok)).length;
  const dir = path.resolve(__dirname, "../../docs/handover/evaluation");
  mkdirSync(dir, { recursive: true });
  const stem = `${modelId.replace(/\W+/g, "-")}-${date}`;
  const cost = Number((after.usage - before.usage).toFixed(4));
  // OpenRouter's spend figure can lag a few minutes; this is the same run priced from its tokens.
  const PRICE: Record<string, [number, number]> = { "openai/gpt-6-luna": [0.1, 0.5], "openai/gpt-6-sol": [2, 10] };
  const [input, output] = PRICE[modelId] ?? [0, 0];
  const estimated = Number((outcomes.reduce((sum, item) => sum + item.inputTokens * input + item.outputTokens * output, 0) / 1e6).toFixed(4));
  writeFileSync(path.join(dir, `${stem}.json`), JSON.stringify({ modelId, date, cost, estimated, spentSoFar: after.usage, limit: after.limit, passed, total: outcomes.length, outcomes }, null, 1));
  writeFileSync(path.join(dir, `${stem}.md`), [
    `# Everyday questions: ${modelId}, ${date}`, "",
    `${passed} of ${outcomes.length} answers passed every automatic check. Cost of this run: about US$ ${estimated} from token counts (OpenRouter showed US$ ${after.usage.toFixed(4)} spent of the US$ ${after.limit} limit when the run ended; its figure can lag).`, "",
    "Sample data used: one saved ship (MV Ocean Star), one charter-party passage and a 15% berth-hire discount at Hazira. Figures below come from the rule book; nothing was sent to anyone.", "",
    "| Question | Tools | Checks | Steps | Seconds |", "|---|---|---|---|---|",
    ...outcomes.map(outcome => `| ${outcome.id} | ${outcome.tools.join(", ") || "none"} | ${outcome.checks.every(check => check.ok) ? "pass" : "**" + outcome.checks.filter(check => !check.ok).map(check => check.check).join("; ") + "**"} | ${outcome.steps} | ${Math.round(outcome.ms / 1000)} |`),
    "", ...outcomes.flatMap(outcome => [`## ${outcome.id}`, "", `> ${outcome.question}`, "", outcome.error ? `Error: ${outcome.error}` : outcome.answer, ""]),
  ].join("\n"));
  expect(outcomes.length).toBe(questions.length);
});
