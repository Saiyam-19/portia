/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import betterAuthTest from "@convex-dev/better-auth/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import type { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";
import { api, components, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import type { Id } from "../../convex/_generated/dataModel";

const mocks = vi.hoisted(() => ({ bridge: vi.fn(), agent: vi.fn(), stop: vi.fn() }));
vi.mock("../../src/lib/migration/config", () => ({ migrationPreviewEnabled: () => true }));
vi.mock("../../src/lib/migration/origin", () => ({ trustedMigrationOrigin: () => "https://portia.test" }));
vi.mock("../../src/lib/memory/session", () => ({ memoryFeatureEnabled: () => false }));
vi.mock("../../src/lib/migration/domain-agent", async original => ({ ...await original<object>(), createMigrationMainAgent: mocks.agent }));
vi.mock("../../src/lib/migration/bridge", () => ({
  callMigrationBridge: mocks.bridge,
  MigrationTokenManager: class { initialize = async () => {}; refresh = async () => {}; stop = mocks.stop; },
}));
import { POST } from "../../src/app/api/migration/chat/route";

const modules = import.meta.glob("../../convex/**/*.ts");
function setup() { const t = convexTest(schema, modules); agentTest.register(t); betterAuthTest.register(t); return t; }
async function account(t: ReturnType<typeof setup>) {
  const now = Date.now();
  const user = await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: "Publication owner", email: "publication@example.com", emailVerified: false, createdAt: now, updatedAt: now } } });
  const session = await t.mutation(components.betterAuth.adapter.create, { input: { model: "session", data: { userId: user._id, token: crypto.randomUUID(), expiresAt: now + 3_600_000, createdAt: now, updatedAt: now } } });
  return { ownerId: user._id, client: t.withIdentity({ subject: user._id, sessionId: session._id }) };
}
let t: ReturnType<typeof setup>;
let owner: Awaited<ReturnType<typeof account>>;
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("MIGRATION_DEV_ENABLED", "true");
  vi.stubEnv("PORTIA_CONVEX_DEPLOYMENT", "brilliant-whale-380");
  vi.stubEnv("CONVEX_SITE_URL", "https://brilliant-whale-380.convex.site");
  vi.stubEnv("PORTIA_AUTH_MODE", "basic");
  vi.stubEnv("PORTIA_MEMORY_ENABLED", "false");
  vi.stubEnv("LLM_ALLOW_PAID", "false");
  t = setup(); owner = await account(t);
  mocks.bridge.mockImplementation(async (_manager, request) => {
    const args = { ...request.args, ownerId: owner.ownerId };
    if (request.op === "claim") return t.mutation(internal.migration.claimQuestion, args);
    if (request.op === "context") return t.query(internal.migration.getRunContext, args);
    if (request.op === "status") return t.query(internal.migration.getRunStatus, args);
    if (request.op === "checkpoint") return t.mutation(internal.migration.checkpointRun, args);
    if (request.op === "complete") return t.mutation(internal.migration.completeRun, args);
    if (request.op === "fail") return t.mutation(internal.migration.failRun, args);
    throw new Error("Unexpected bridge operation: " + request.op);
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } };
async function claim() {
  const requestId = crypto.randomUUID();
  return t.mutation(internal.migration.claimQuestion, { ownerId: owner.ownerId, conversationId: null, requestId, payloadHash: requestId, question: "Publication contract", modelAlias: "model-1", expectedRevision: null });
}
async function history(conversationId: Awaited<ReturnType<typeof claim>>["conversationId"]) {
  return owner.client.query(api.migration.listConversationMessages, { conversationId, paginationOpts: { cursor: null, numItems: 50 } });
}

it("preserves an accepted question through route, exact review, persistence and public history without leaking model drafts", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/migration/domain-agent")>("../../src/lib/migration/domain-agent");
  const question = "What is the certificate price?";
  const privateDraft = "UNVERIFIED_MODEL_PROSE: total RON 999999.";
  let step = 0;
  const model = new MockLanguageModelV4({ doStream: async () => {
    const n = step++;
    return { stream: new ReadableStream<LanguageModelV4StreamPart>({ start(controller) {
      controller.enqueue({ type: "stream-start", warnings: [] });
      controller.enqueue({ type: "text-start", id: "draft" });
      controller.enqueue({ type: "text-delta", id: "draft", delta: privateDraft });
      controller.enqueue({ type: "text-end", id: "draft" });
      if (!n) {
        controller.enqueue({ type: "tool-call", toolCallId: "fee", toolName: "supplied_quote", input: JSON.stringify({ action: "create", lines: [{ name: "Fee", currency: "CAD", billing: { kind: "flat", price: "20", basis: "user-stated-flat" } }] }) });
        controller.enqueue({ type: "tool-call", toolCallId: "sum", toolName: "calculate_charges", input: JSON.stringify({ label: "sum", expression: "7+8" }) });
      } else {
        controller.enqueue({ type: "tool-call", toolCallId: "finish", toolName: "finish_turn", input: JSON.stringify({
          response: question,
        }) });
      }
      controller.enqueue({ type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage });
      controller.close();
    } }) };
  } });
  mocks.agent.mockImplementation((options: Parameters<typeof createMigrationMainAgent>[0]) => {
    return actual.createMigrationMainAgent({ ...options, mainModel: model });
  });
  const response = await POST(new Request("https://portia.test/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    kind: "question", requestId: crypto.randomUUID(), conversationId: null, expectedRevision: null, modelAlias: "model-1",
    question: "Prepare the supplied flat Fee of CAD 20 for approval. Calculate 7+8 and ask for the certificate price.",
  }) }));
  const wire = await response.text();
  expect(response.status).toBe(200); expect(step).toBe(2);
  const complete = mocks.bridge.mock.calls.find(([, request]) => request.op === "complete")![1];
  const canonical = complete.args.responseMessages.filter((message: { role: string; content: unknown }) => message.role === "assistant" && typeof message.content === "string").map((message: { content: string }) => message.content);
  expect(canonical).toHaveLength(1); expect(canonical[0]).toContain(question); expect(canonical[0]).toContain("**15**");
  expect(complete.args.authorizationProposal).toBeDefined();
  expect(wire).toContain(question); expect(wire).not.toContain(privateDraft); expect(wire).toContain("Confirm exact operations");

  const claimed = await t.run(ctx => ctx.db.get(complete.args.runId as Id<"migrationRuns">));
  const publicHistory = await history(claimed!.conversationId);
  expect(publicHistory.page.some(message => message.text === canonical[0])).toBe(true);
  expect(JSON.stringify(publicHistory)).not.toContain("UNVERIFIED_MODEL_PROSE");
  expect(JSON.stringify(publicHistory)).not.toContain("999999");

  // Native cancellation opens an authenticated continuation so private context
  // can be checked without approving or executing the proposed quotation.
  const saved = await owner.client.query(api.migration.getConversation, { conversationId: claimed!.conversationId });
  const form = saved!.forms.find(item => item.status === "pending")!;
  const requestId = crypto.randomUUID();
  const resumed = await t.mutation(internal.migration.resolveFormAndClaim, { ownerId: owner.ownerId, conversationId: claimed!.conversationId, requestId, payloadHash: requestId, toolCallId: form.toolCallId, values: {}, cancelled: true, note: "", modelAlias: "model-1", expectedRevision: saved!.conversation.revision });
  const privateContext = await t.query(internal.migration.getRunContext, { ownerId: owner.ownerId, runId: resumed.runId, fence: resumed.fence });
  expect(JSON.stringify(privateContext.messages)).toContain(privateDraft);
  expect(JSON.stringify(privateContext.messages)).toContain("calculate_charges");
  await t.mutation(internal.migration.cancelRun, { ownerId: owner.ownerId, runId: resumed.runId });
});

it("reloaded canonical text beyond 32k retains its final question and full Markdown", async () => {
  const run = await claim();
  const canonical = "# Verified result\n\n" + "Retained evidence. ".repeat(2100) + "\n\n**Final limitation remains visible.**\n\nWhat is the missing price?";
  expect(canonical.length).toBeGreaterThan(32_000);
  await t.mutation(internal.migration.completeRun, { ownerId: owner.ownerId, runId: run.runId, fence: run.fence, responseMessages: [{ role: "assistant", content: canonical }], form: null, finishReason: "stop" });
  const loaded = await history(run.conversationId);
  const answer = loaded.page.find(message => message.role === "assistant" && message.text)!;
  expect(answer.text).toBe(canonical);
  expect(answer.parts).toEqual([{ type: "text", text: canonical }]);
});

it("retains both string and array checkpoint prose privately while publishing only the canonical answer", async () => {
  const run = await claim();
  await t.mutation(internal.migration.checkpointRun, {
    ownerId: owner.ownerId, runId: run.runId, fence: run.fence, stepNumber: 0, payloadHash: "private-prose", finishReason: "tool-calls",
    responseMessages: [
      { role: "assistant", content: "PRIVATE_STRING_PROSE" },
      { role: "assistant", content: [{ type: "text", text: "PRIVATE_ARRAY_PROSE" }, { type: "tool-call", toolCallId: "calc", toolName: "calculate_charges", input: { expression: "1+1" } }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "calc", toolName: "calculate_charges", output: { type: "json", value: { result: "2" } } }] },
    ],
  });
  const context = await t.query(internal.migration.getRunContext, { ownerId: owner.ownerId, runId: run.runId, fence: run.fence });
  expect(JSON.stringify(context.messages)).toContain("PRIVATE_STRING_PROSE");
  expect(JSON.stringify(context.messages)).toContain("PRIVATE_ARRAY_PROSE");
  await expect(t.mutation(internal.migration.completeRun, { ownerId: owner.ownerId, runId: run.runId, fence: run.fence, responseMessages: [], form: null, finishReason: "stop" })).rejects.toThrow(/readable answer/);
  await t.mutation(internal.migration.completeRun, { ownerId: owner.ownerId, runId: run.runId, fence: run.fence, responseMessages: [{ role: "assistant", content: "Verified result: 2." }], form: null, finishReason: "stop" });
  const loaded = await history(run.conversationId);
  expect(JSON.stringify(loaded)).not.toMatch(/PRIVATE_STRING_PROSE|PRIVATE_ARRAY_PROSE/);
  expect(loaded.page.some(message => message.text === "Verified result: 2.")).toBe(true);
  expect(loaded.page.flatMap(message => message.parts).some(part => part.type === "tool" && part.toolName === "calculate_charges")).toBe(true);
});

it("allows a validated form-only completion without pretending hidden prose is its answer", async () => {
  const run = await claim();
  const form = { toolCallId: "needed", title: "Missing input", fields: [{ name: "value", label: "Value", type: "text" as const, required: true }] };
  const saved = await t.mutation(internal.migration.completeRun, { ownerId: owner.ownerId, runId: run.runId, fence: run.fence,
    responseMessages: [{ role: "assistant", content: [{ type: "text", text: "PRIVATE_FORM_PREAMBLE" }, { type: "tool-call", toolName: "ask_user_input", toolCallId: form.toolCallId, input: { title: form.title, fields: form.fields } }] }],
    form,
  });
  expect(saved.state).toBe("waiting");
  const loaded = await history(run.conversationId);
  expect(JSON.stringify(loaded)).not.toContain("PRIVATE_FORM_PREAMBLE");
  expect(loaded.page.flatMap(message => message.parts).some(part => part.type === "tool" && part.toolCallId === form.toolCallId)).toBe(true);
});

it("fails an oversized complete payload explicitly without publishing a truncated answer", async () => {
  const run = await claim();
  await expect(t.mutation(internal.migration.completeRun, { ownerId: owner.ownerId, runId: run.runId, fence: run.fence, responseMessages: [{ role: "assistant", content: "é".repeat(70_000) }], form: null, finishReason: "stop" })).rejects.toThrow(/publication limit/i);
  const loaded = await history(run.conversationId);
  expect(loaded.page.filter(message => message.role === "assistant" && message.text)).toEqual([]);
  await t.mutation(internal.migration.cancelRun, { ownerId: owner.ownerId, runId: run.runId });
});
