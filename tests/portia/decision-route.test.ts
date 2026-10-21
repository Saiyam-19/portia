/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import betterAuthTest from "@convex-dev/better-auth/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import type { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
const mocks = vi.hoisted(() => ({ bridge: vi.fn(), agent: vi.fn() }));
vi.mock("../../src/lib/migration/config", () => ({ migrationPreviewEnabled: () => true }));
vi.mock("../../src/lib/migration/origin", () => ({ trustedMigrationOrigin: () => "https://portia.test" }));
vi.mock("../../src/lib/memory/session", () => ({ memoryFeatureEnabled: () => false }));
vi.mock("../../src/lib/migration/domain-agent", async original => ({ ...await original<object>(), createMigrationMainAgent: mocks.agent }));
vi.mock("../../src/lib/migration/bridge", () => ({ callMigrationBridge: mocks.bridge, MigrationTokenManager: class { initialize = async () => {}; refresh = async () => {}; stop = () => {}; } }));
import { POST } from "../../src/app/api/migration/chat/route";
const modules = import.meta.glob("../../convex/**/*.ts");
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } };

beforeEach(() => {
  vi.clearAllMocks();
  for (const [key, value] of Object.entries({ MIGRATION_DEV_ENABLED: "true", PORTIA_CONVEX_DEPLOYMENT: "brilliant-whale-380", CONVEX_SITE_URL: "https://brilliant-whale-380.convex.site" })) vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());

it.each(["cap", "clarification", "finish"] as const)("persists and reloads the %s exit through the raw SDK loop and real Convex mutations", async mode => {
  const t = convexTest(schema, modules); agentTest.register(t); betterAuthTest.register(t);
  const ownerId = "decision-route-owner";
  const actual = await vi.importActual<typeof import("../../src/lib/migration/domain-agent")>("../../src/lib/migration/domain-agent");
  let calls = 0;
  let activeSession: Parameters<typeof createMigrationMainAgent>[0]["session"];
  const model = new MockLanguageModelV4({ doStream: async () => {
    const n = calls++;
    return { stream: new ReadableStream<LanguageModelV4StreamPart>({ start(c) {
      c.enqueue({ type: "stream-start", warnings: [] });
      if (mode === "clarification" && n === 1) c.enqueue({ type: "tool-call", toolCallId: "interval", toolName: "calculate_elapsed_time", input: JSON.stringify({ start: "2026-11-03 10:00", end: "2026-11-03 12:00" }) });
      else if (mode === "clarification" && n === 2) c.enqueue({ type: "tool-call", toolCallId: "question", toolName: "ask_user_input", input: JSON.stringify({ title: "Missing timezone", fields: [{ name: "zone", label: "Timezone", type: "text", required: true }] }) });
      else if (mode === "finish" && n === 1) {
        const result = activeSession!.completion.context().evidence[0];
        c.enqueue({ type: "tool-call", toolCallId: "done", toolName: "finish_turn", input: JSON.stringify({ outcomes: [{ id: "math", requestedOutcome: "Calculate 13*7", kind: "calculation", targets: result.targets, evidenceIds: [result.id] }] }) });
      } else c.enqueue({ type: "tool-call", toolCallId: `math-${n}`, toolName: "calculate_charges", input: JSON.stringify({ label: `Part ${n}`, expression: "13*7" }) });
      c.enqueue({ type: "finish", usage, finishReason: { unified: "tool-calls", raw: undefined } }); c.close();
    } }) };
  } });
  mocks.agent.mockImplementation((options: Parameters<typeof createMigrationMainAgent>[0]) => { activeSession = options.session; return actual.createMigrationMainAgent({ ...options, mainModel: model }); });
  mocks.bridge.mockImplementation(async (_manager, call) => {
    const args = { ownerId, ...call.args };
    if (call.op === "claim") return t.mutation(internal.migration.claimQuestion, args);
    if (call.op === "context") return t.query(internal.migration.getRunContext, args);
    if (call.op === "checkpoint") return t.mutation(internal.migration.checkpointRun, args);
    if (call.op === "complete") return t.mutation(internal.migration.completeRun, args);
    if (call.op === "fail") return t.mutation(internal.migration.failRun, args);
    if (call.op === "status") return { active: true };
    throw Error("Unexpected bridge operation");
  });
  const response = await POST(new Request("https://portia.test/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "question", question: "Calculate 13*7 and finish all requested work", conversationId: null, expectedRevision: null, requestId: "a122fbae-303b-45a5-90f3-7f112025dc50", modelAlias: "model-1" }) }));
  const wire = await response.text();
  expect(calls).toBe(mode === "cap" ? 12 : mode === "clarification" ? 3 : 2);
  const complete = mocks.bridge.mock.calls.find(([, call]) => call.op === "complete")![1];
  expect(wire).toContain("**91**");
  const saved = await t.run(ctx => ctx.db.get("migrationRuns", complete.args.runId));
  if (mode === "cap") {
    expect(complete.args).toMatchObject({ finishReason: "tool-calls", incomplete: true, form: null });
    expect(wire).toContain("remains incomplete");
    expect(saved).toMatchObject({ status: "error", errorCode: "INCOMPLETE_WORK", checkpointFinishReason: "tool-calls", checkpointStep: 11 });
  } else if (mode === "finish") {
    expect(complete.args).toMatchObject({ finishReason: "stop", form: null });
    expect(complete.args.incomplete).toBeUndefined();
    expect(saved).toMatchObject({ status: "completed", checkpointFinishReason: "tool-calls" });
  } else {
    expect(complete.args).toMatchObject({ form: { toolCallId: "question" } });
    expect(saved).toMatchObject({ status: "waiting" }); expect(activeSession!.completion.completion()).toBeUndefined();
    expect(wire).toContain("Missing timezone");
  }
  const conversation = await t.run(ctx => ctx.db.get("migrationConversations", saved!.conversationId));
  const next = mode === "clarification"
    ? await t.mutation(internal.migration.resolveFormAndClaim, { ownerId, conversationId: saved!.conversationId, requestId: "answer", payloadHash: "answer", toolCallId: "question", values: { zone: "UTC" }, cancelled: false, note: "", expectedRevision: conversation!.revision, modelAlias: "model-1" })
    : await t.mutation(internal.migration.claimQuestion, { ownerId, conversationId: saved!.conversationId, requestId: "next", payloadHash: "next", question: "Show what completed", modelAlias: "model-1", expectedRevision: conversation!.revision });
  const reloaded = await t.query(internal.migration.getRunContext, { ownerId, runId: next.runId, fence: next.fence });
  expect(JSON.stringify(reloaded.messages)).toContain("**91**");
  if (mode === "cap") expect(JSON.stringify(reloaded.messages)).toContain("remains incomplete");
  expect(mocks.bridge.mock.calls.some(([, call]) => call.op === "fail")).toBe(false);
});
