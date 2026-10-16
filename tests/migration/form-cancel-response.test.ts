import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ bridge: vi.fn(), agent: vi.fn(), stop: vi.fn() }));
vi.mock("../../src/lib/migration/config", () => ({ migrationPreviewEnabled: () => true }));
vi.mock("../../src/lib/migration/origin", () => ({ trustedMigrationOrigin: () => "https://portia.test" }));
vi.mock("../../src/lib/memory/session", () => ({ memoryFeatureEnabled: () => false }));
vi.mock("../../src/lib/migration/domain-agent", () => ({ createMigrationMainAgent: mocks.agent }));
vi.mock("../../src/lib/migration/bridge", () => ({
  callMigrationBridge: mocks.bridge,
  MigrationTokenManager: class { initialize = async () => {}; refresh = async () => {}; stop = mocks.stop; },
}));
import { POST } from "../../src/app/api/migration/chat/route";

const claim = { conversationId: "chat", runId: "run", threadId: "thread", promptMessageId: "prompt", fence: 1, revision: 3, replayed: false };
const request = (note = "") => new Request("https://portia.test/api/chat", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ kind: "form", conversationId: "chat", requestId: "a122fbae-303b-45a5-90f3-7f112025dc50", expectedRevision: 2, modelAlias: "model-1", toolCallId: "details", values: {}, cancelled: true, note }),
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.agent.mockImplementation(() => { throw new Error("A provider should not be needed for an empty cancellation."); });
  mocks.bridge.mockImplementation(async (_manager, request) => {
    if (request.op === "resolveForm") return claim;
    if (request.op === "context") return { modelAlias: "model-1", messages: [], conversationId: "chat" };
    return { state: "idle", revision: 4 };
  });
});

describe("form cancellation response", () => {
  it("durably acknowledges an empty cancellation without starting paid inference", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    const stream = await response.text();
    expect(stream).toContain("Form cancelled");
    expect(stream).toContain('"type":"finish"');
    expect(mocks.agent).not.toHaveBeenCalled();
    expect(mocks.bridge.mock.calls.some(([, request]) => request.op === "context")).toBe(false);
    const completion = mocks.bridge.mock.calls.find(([, request]) => request.op === "complete")?.[1];
    expect(completion.args).toMatchObject({ runId: "run", fence: 1, form: null, finishReason: "stop", responseMessages: [{ role: "assistant", content: expect.stringContaining("Form cancelled") }] });
    expect(mocks.stop).toHaveBeenCalled();
  });

  it("does not claim cancellation success if durable completion fails", async () => {
    mocks.bridge.mockImplementation(async (_manager, request) => {
      if (request.op === "resolveForm") return claim;
      if (request.op === "complete") throw new Error("Persistence unavailable");
      return {};
    });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain("Form cancelled");
    expect(mocks.agent).not.toHaveBeenCalled();
    expect(mocks.bridge.mock.calls.some(([, request]) => request.op === "fail")).toBe(true);
  });

  it("preserves a cancellation note as real follow-up work rather than swallowing it", async () => {
    await POST(request("Correction: actual GT is 14860; extend the stay to 42 hours."));
    expect(mocks.agent).toHaveBeenCalledTimes(1);
    const resolution = mocks.bridge.mock.calls.find(([, request]) => request.op === "resolveForm")?.[1];
    expect(resolution.args.note).toBe("Correction: actual GT is 14860; extend the stay to 42 hours.");
  });

  it("does not replay a completed cancellation or start another model", async () => {
    mocks.bridge.mockResolvedValue({ ...claim, replayed: true });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(mocks.agent).not.toHaveBeenCalled();
    expect(mocks.bridge).toHaveBeenCalledTimes(1);
  });
});
