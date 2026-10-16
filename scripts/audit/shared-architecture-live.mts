import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";
import { ConversationSession } from "../../src/lib/migration/conversation-session";
const require = createRequire(path.resolve("scripts/audit/shared-architecture-live.mts"));
const { createFreeTariffFetch } = require("./tariff-provider.cjs");
const root = path.resolve("output/shared-architecture-20261015");
const budgetDirectory = path.resolve(".local/shared-architecture-live-20261015");
const scenario = process.argv[2];
if (!["supplied", "mumbai"].includes(scenario)) throw new Error("Choose an approved regression control.");
mkdirSync(root, { recursive: true });
const file = path.join(root, `live-${scenario}.json`);
let perRun = 0;
const guarded = createFreeTariffFetch({ directory: root, budgetDirectory, maxDispatches: 4, upstream: globalThis.fetch });
globalThis.fetch = async (input, init) => {
  if (++perRun > 1) throw new Error("This run permits only one free interpretation dispatch; no implicit retry.");
  return guarded(input, init);
};
process.env.OPENROUTER_API_KEY = readFileSync("/private/tmp/portia-test-credential-20261015/openrouter.key", "utf8").trim();
Object.assign(process.env, { MIGRATION_TEST_MODE: "true", MIGRATION_MODEL_OVERRIDE: "nvidia/nemotron-3-super-120b-a12b:free", PORTIA_FREE_TEST_ALLOW_RETENTION: "true", PORTIA_LOCAL_BACKEND: "true", PORTIA_CONVEX_DEPLOYMENT: "local-memory-integration", NEXT_PUBLIC_CONVEX_URL: "http://127.0.0.1:3220", NEXT_PUBLIC_CONVEX_SITE_URL: "http://127.0.0.1:3221", SITE_URL: "http://127.0.0.1:3022" });
const question = scenario === "mumbai" ? JSON.parse(readFileSync("output/actual-tariff-20261015/independent/input-v1.json", "utf8")).user_message : JSON.parse(readFileSync("tests/acceptance/portia/development.json", "utf8")).cases.find((c: { id: string }) => c.id === "D01").steps[0].text;
const binding = { runId: `shared-${scenario}`, conversationId: `synthetic-${scenario}`, fence: 1, revision: 1 };
const session = new ConversationSession(binding);
const record: Record<string, unknown> = { boundary: "live provider + in-process real agent; no UI or database", startedAt: new Date().toISOString(), scenario, question, paidAllowanceUsd: 0, maxSuiteDispatches: 4, maxRunDispatches: 1 };
try {
  const result = await createMigrationMainAgent({ alias: "model-1", conversation: session, quoteBinding: binding }).generate({ prompt: question, timeout: { totalMs: 180000, stepMs: 180000 } });
  Object.assign(record, { response: result.text, finishReason: result.finishReason, usage: result.usage, state: session.state, answer: session.answer, steps: result.steps.map(s => ({ finishReason: s.finishReason, toolCalls: s.toolCalls, toolResults: s.toolResults })) });
  console.log(JSON.stringify({ scenario, dispatches: perRun, response: result.text, complete: session.answer?.complete }));
} catch (error) { record.error = error instanceof Error ? { name: error.name, message: error.message } : "unknown"; console.log(JSON.stringify({ scenario, error: record.error, dispatches: perRun })); process.exitCode = 1; }
finally { record.finishedAt = new Date().toISOString(); record.dispatches = perRun; writeFileSync(file, JSON.stringify(record, null, 2) + "\n"); }
