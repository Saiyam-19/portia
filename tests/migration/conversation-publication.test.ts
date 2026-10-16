import { beforeEach, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { mumbaiProposal, mumbaiQuestion } from "./conversation-fixtures";
import type { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";
const mocks = vi.hoisted(() => ({ bridge: vi.fn(), agent: vi.fn(), stop: vi.fn() }));
vi.mock("../../src/lib/migration/config", () => ({ migrationPreviewEnabled: () => true }));
vi.mock("../../src/lib/migration/origin", () => ({ trustedMigrationOrigin: () => "https://portia.test" }));
vi.mock("../../src/lib/memory/session", () => ({ memoryFeatureEnabled: () => false }));
vi.mock("../../src/lib/migration/domain-agent", async original => ({ ...await original<object>(), createMigrationMainAgent: mocks.agent }));
vi.mock("../../src/lib/migration/bridge", () => ({ callMigrationBridge: mocks.bridge, MigrationTokenManager: class { initialize = async () => {}; refresh = async () => {}; stop = mocks.stop; } }));
import { POST } from "../../src/app/api/migration/chat/route";
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } };
let main: MockLanguageModelV4;
beforeEach(async () => {
  vi.clearAllMocks(); const actual = await vi.importActual<typeof import("../../src/lib/migration/domain-agent")>("../../src/lib/migration/domain-agent");
  main = new MockLanguageModelV4({ doStream: async () => ({ warnings: [], stream: new ReadableStream<LanguageModelV4StreamPart>({ start(c) {
    c.enqueue({ type: "stream-start", warnings: [] }); c.enqueue({ type: "text-start", id: "unbound" }); c.enqueue({ type: "text-delta", id: "unbound", delta: "Unbound INR 999999" }); c.enqueue({ type: "text-end", id: "unbound" });
    c.enqueue({ type: "tool-call", toolName: "interpret_request", toolCallId: "interpret", input: JSON.stringify(mumbaiProposal()) });
    c.enqueue({ type: "finish", usage, finishReason: { unified: "tool-calls", raw: undefined } }); c.close();
  } }) }) });
  mocks.agent.mockImplementation((options: Parameters<typeof createMigrationMainAgent>[0]) => actual.createMigrationMainAgent({ ...options, mainModel: main }));
});
it.each([false, true])("shared answer waits for fenced persistence; rejection=%s", async reject => {
  let release!: () => void, entered!: () => void;
  const enteredPromise = new Promise<void>(resolve => { entered = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; });
  mocks.bridge.mockImplementation(async (_manager, call) => {
    if (call.op === "claim") return { conversationId: "chat", runId: "run", fence: 1, revision: 1, threadId: "thread", promptMessageId: "prompt", replayed: false };
    if (call.op === "context") return { conversationId: "chat", revision: 1, messages: [{ role: "user", content: mumbaiQuestion }], modelAlias: "model-1" };
    if (call.op === "status") return { active: true };
    if (call.op === "complete") { entered(); await gate; if (reject) throw new Error("Stale run"); return { state: "idle", revision: 2 }; }
    return {};
  });
  const response = await POST(new Request("https://portia.test/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "question", question: mumbaiQuestion, conversationId: null, expectedRevision: null, requestId: "a122fbae-303b-45a5-90f3-7f112025dc50", modelAlias: "model-1" }) }));
  const reader = response.body!.getReader(); let wire = "";
  const consume = (async () => { while (true) { const part = await reader.read(); if (part.done) break; wire += new TextDecoder().decode(part.value); } })();
  await enteredPromise; expect(wire).not.toMatch(/51,094|51094|999999|factBindings|calculations/); release(); await consume;
  expect(main.doStreamCalls).toHaveLength(1);
  expect(wire).not.toContain("999999");
  if (reject) expect(wire).not.toContain("51,094");
  else { expect(wire).toContain("51,094.00"); expect(wire).toContain("cbic-gst.gov.in"); expect(wire).not.toContain('"type":"error"'); }
  const checkpoints = mocks.bridge.mock.calls.filter(([, c]) => c.op === "checkpoint");
  expect(JSON.stringify(checkpoints)).toContain("conversation-interpretation");
});
