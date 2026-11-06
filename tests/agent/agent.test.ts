import { randomUUID } from "node:crypto";
import { memory } from "libfx/node";
import { afterAll, describe, expect, it } from "vitest";
import { BerthwiseAgent, type Claim } from "../../src/lib/agent/agent";
import { createMockFetch } from "../../src/lib/agent/mock-model";
import type { PublicEvent } from "../../src/lib/chat/contracts";
import { FakeStore } from "./fake-store";

const agents: BerthwiseAgent[] = [];
let agentCount = 0;

function setup(env: Record<string, string> = {}, upstream: typeof fetch | ReturnType<typeof createMockFetch> = createMockFetch()) {
  const store = new FakeStore();
  const pending: Promise<unknown>[] = [];
  const agent = new BerthwiseAgent({
    store,
    durability: memory(),
    upstream,
    waitUntil: work => { pending.push(work); },
    env: { PORTIA_MODEL_MODE: "mock", ...env },
    log: () => undefined,
    name: `test-${++agentCount}`,
  });
  agents.push(agent);
  return { store, agent, settle: () => Promise.all(pending) };
}

afterAll(async () => { await Promise.all(agents.map(agent => agent.fx.close())); });

async function collect(stream: ReadableStream<Uint8Array>) {
  const text = await new Response(stream).text();
  return text.trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as PublicEvent);
}

function claim(base: Partial<Claim> & { conversationId: string }): Claim {
  return {
    turnId: `turn-${randomUUID()}`, requestId: randomUUID(), ownerId: "owner-1", fxSessionId: null, modelAlias: "model-1",
    message: null, form: null, formResponse: null, memoryContext: { kind: "none", version: 0, files: [], removed: [], notes: null },
    ...base,
  };
}

/** Runs one turn to its end and returns the public events plus the recorded projection. */
async function turn(env: ReturnType<typeof setup>, input: Partial<Claim> & { conversationId: string }) {
  const c = claim(input);
  const events = await collect(await env.agent.start(c));
  await env.settle();
  const finished = env.store.finished.find(item => item.turnId === c.turnId);
  const fxSessionId = c.fxSessionId ?? env.store.sessions.get(c.turnId) ?? null;
  return { events, finished, fxSessionId, claim: c };
}

describe("BerthwiseAgent with the mock model", () => {
  it("streams a plain answer and records it", async () => {
    const env = setup();
    const { events, finished, fxSessionId } = await turn(env, { conversationId: "c1", message: "hello there" });
    expect(fxSessionId).toBeTruthy();
    expect(events[0]).toMatchObject({ type: "start" });
    expect(events.at(-1)).toEqual({ type: "end", status: "completed" });
    expect(events.filter(event => event.type === "text").map(event => event.type === "text" ? event.delta : "").join("")).toContain("hello there");
    expect(finished?.status).toBe("completed");
    expect(finished?.segments[0]).toMatchObject({ type: "text" });
    expect(finished?.usage?.modelCalls).toBe(1);
  });

  it("retries a provider that is rate-limited before it answers", async () => {
    const mock = createMockFetch();
    let calls = 0;
    const flaky: typeof mock = async (input, init) => {
      if (++calls > 1) return mock(input, init);
      const error = { id: "gen-x", provider: "Azure", choices: [], error: { code: 429, message: "rate-limited upstream" } };
      return new Response(`: OPENROUTER PROCESSING\n\ndata: ${JSON.stringify(error)}\n\n`, { headers: { "content-type": "text/event-stream" } });
    };
    const { events, finished } = await turn(setup({}, flaky), { conversationId: "c-retry", message: "hello there" });
    expect(calls).toBe(2);
    expect(events.at(-1)).toEqual({ type: "end", status: "completed" });
    expect(finished?.status).toBe("completed");
  });

  it("runs bash against the bundled tariffs", async () => {
    const env = setup();
    const { finished, events } = await turn(env, { conversationId: "c2", message: "Which port tariffs do you have?" });
    expect(events).toContainEqual(expect.objectContaining({ type: "tool", name: "bash", status: "done" }));
    expect(finished?.status).toBe("completed");
    const text = finished?.segments.filter(segment => segment.type === "text").map(segment => segment.type === "text" ? segment.text : "").join("");
    expect(text).toContain("jawahar-nehru-port-authority-jnpa");
    expect(finished?.usage?.modelCalls).toBe(2);
  });

  it('reads an attached Markdown file through the libfx tool loop without changing memory', async () => {
    const mock = createMockFetch();
    const upstream: typeof mock = async (input, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.messages.at(-1)?.role === 'tool') return mock(input, init);
      expect(body.messages.at(-1)?.content).toContain('/files/attachedfile.md');
      const events = [
        { id: 'attachment-generation', choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'read-attached-file', type: 'function', function: { name: 'bash', arguments: JSON.stringify({ command: 'cat /files/attachedfile.md' }) } }] }, finish_reason: null }] },
        { id: 'attachment-generation', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
      ];
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    };
    const env = setup({}, upstream);
    const file = { id: 'attachedfile', name: 'Contract.pdf', mimeType: 'application/pdf', size: 100, revision: 1 };
    const state = env.store.workspaceState.bind(env.store);
    env.store.workspaceState = async (...args) => ({ ...(await state(...args))!, artifacts: [{ ...file, markdownKey: 'private-markdown-key' }] });
    Object.assign(env.store, { artifactContent: async () => '# Contract\nAgreed pilotage: 12.50 USD per GRT.' });
    const { events, finished } = await turn(env, { conversationId: 'attachment-loop', message: 'Read my attachment', filesContext: { files: [file], removed: [] } });
    expect(events).toContainEqual(expect.objectContaining({ type: 'tool', name: 'bash', status: 'done' }));
    expect(finished?.status).toBe('completed');
    expect(finished?.segments.filter(segment => segment.type === 'text').map(segment => segment.type === 'text' ? segment.text : '').join('')).toContain('12.50 USD per GRT');
    expect(env.store.version).toBe(0);
  });

  it("saves and forgets memory files through the workspace", async () => {
    const env = setup();
    const first = await turn(env, { conversationId: "c3", message: "Please remember that my fleet sails under the Indian flag." });
    expect(first.finished?.status).toBe("completed");
    expect(env.store.memory.get("profile.md")).toContain("my fleet sails under the Indian flag");
    expect(env.store.version).toBe(1);
    await turn(env, { conversationId: "c3", fxSessionId: first.fxSessionId, message: "Forget what you saved about me." });
    expect(env.store.memory.has("profile.md")).toBe(false);
    expect(env.store.version).toBe(2);
  });

  it("rejects writes outside the writable mounts and reports them", async () => {
    const env = setup();
    const workspace = await (await import("../../src/lib/agent/workspace")).conversationWorkspace(env.store, "c4", "owner-1");
    const denied = await workspace.bash("echo x > /ports/new.md");
    expect(denied.exitCode).not.toBe(0);
    const badName = await workspace.bash("echo hi > /memories/Bad Name.txt");
    expect(badName.exitCode).not.toBe(0);
    expect(env.store.memory.size).toBe(0);
    const notes = await workspace.bash("printf '# Task\\nestimate\\n' > /notes/current.md");
    expect(notes.exitCode).toBe(0);
    expect(env.store.notes.get("c4")).toContain("estimate");
    const scratch = await workspace.bash("echo kept > /work/a.txt && cat /work/a.txt");
    expect(scratch.stdout).toContain("kept");
    expect((await workspace.bash("cat /work/a.txt")).stdout).toContain("kept");
  });

  it("asks for details with a form, then continues from the answers", async () => {
    const env = setup();
    const ask = await turn(env, { conversationId: "c5", message: "Estimate port charges for my vessel at Mumbai." });
    expect(ask.finished?.status).toBe("waiting");
    const form = ask.finished?.form;
    expect(form?.title).toBe("Voyage particulars");
    expect(ask.events).toContainEqual(expect.objectContaining({ type: "form" }));
    const answer = await turn(env, {
      conversationId: "c5", fxSessionId: ask.fxSessionId,
      form: form!, formResponse: { title: form!.title, values: { vessel: "MV Test", grt: "30000", trade: "Foreign" }, cancelled: false },
    });
    expect(answer.finished?.status).toBe("completed");
    const text = answer.finished?.segments.map(segment => segment.type === "text" ? segment.text : "").join("");
    expect(text).toContain("| total |");
    expect(text).toContain("18000");
  });

  it("reuses the cached prefix across turns of a conversation", async () => {
    const env = setup();
    const first = await turn(env, { conversationId: "c6", message: "hello" });
    const second = await turn(env, { conversationId: "c6", fxSessionId: first.fxSessionId, message: "and again" });
    const usage = second.finished!.usage!;
    expect(usage.cacheReadTokens).toBeGreaterThan(0);
    expect(usage.cacheReadTokens / usage.inputTokens).toBeGreaterThan(0.8);
  });

  it("compacts a long conversation and flags the memory refresh", async () => {
    const env = setup({ PORTIA_CONTEXT_WINDOW: "8000" });
    let fxSessionId: string | null = null;
    for (let index = 0; index < 8 && !env.store.compacted.length; index++) {
      const result = await turn(env, { conversationId: "c7", fxSessionId, message: `Give me a long answer, part ${index}.` });
      expect(result.finished?.status).toBe("completed");
      fxSessionId = result.fxSessionId;
    }
    expect(env.store.compacted).toContain(fxSessionId);
  });

  it("reconnects to a finished turn from the session stream", async () => {
    const env = setup();
    const first = await turn(env, { conversationId: "c8", message: "hello" });
    const replay = await collect(env.agent.reconnect({ fxSessionId: first.fxSessionId!, requestId: first.claim.requestId, turnId: first.claim.turnId }));
    expect(replay.at(-1)).toEqual({ type: "end", status: "completed" });
    expect(replay.filter(event => event.type === "text").length).toBeGreaterThan(0);
  });
});
