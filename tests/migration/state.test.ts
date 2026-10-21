/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import { saveMessages } from "@convex-dev/agent";
import betterAuthTest from "@convex-dev/better-auth/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, components, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");
const ownerA = "owner-a";
const ownerB = "owner-b";

function setup() {
  const t = convexTest(schema, modules);
  agentTest.register(t);
  betterAuthTest.register(t);
  return t;
}

async function claim(t: ReturnType<typeof setup>, overrides: Record<string, unknown> = {}) {
  return await t.mutation(internal.migration.claimQuestion, {
    ownerId: ownerA,
    conversationId: null,
    requestId: "request-1",
    payloadHash: "hash-1",
    question: "Estimate a voyage with missing details",
    modelAlias: "model-1",
    expectedRevision: null,
    ...overrides,
  });
}

const form = {
  toolCallId: "tool-1",
  title: "Voyage details",
  fields: [{
    name: "grt",
    label: "Gross tonnage",
    type: "number" as const,
    required: true,
  }],
};

const formMessage = {
  role: "assistant" as const,
  content: [{
    type: "tool-call" as const,
    toolCallId: form.toolCallId,
    toolName: "ask_user_input",
    input: { title: form.title, fields: form.fields },
  }],
};

describe("migration Convex state machine", () => {
  beforeEach(() => {
    vi.stubEnv("MIGRATION_DEV_ENABLED", "true");
    vi.stubEnv("PORTIA_CONVEX_DEPLOYMENT", "brilliant-whale-380");
    vi.stubEnv("CONVEX_SITE_URL", "https://brilliant-whale-380.convex.site");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(["calculate_charges", "calculate_charge_batch", "calculate_elapsed_time"])("persists and restores the main-agent %s tool history", async toolName => {
    const t = setup();
    const first = await claim(t);
    await t.mutation(internal.migration.checkpointRun, {
      ownerId: ownerA, runId: first.runId, fence: first.fence,
      stepNumber: 0, payloadHash: "calculation-step", finishReason: "tool-calls",
      responseMessages: [
        { role: "assistant", content: [{ type: "tool-call", toolCallId: "calc-1", toolName, input: { expression: "1+1" } }] },
        { role: "tool", content: [{ type: "tool-result", toolCallId: "calc-1", toolName, output: { type: "json", value: { result: "2" } } }] },
      ],
    });
    await t.mutation(internal.migration.completeRun, { ownerId: ownerA, runId: first.runId, fence: first.fence, responseMessages: [{ role: "assistant", content: "Calculation complete." }], form: null, finishReason: "stop" });
    const next = await claim(t, { conversationId: first.conversationId, requestId: "follow-up", payloadHash: "follow-up", question: "Explain that calculation.", expectedRevision: first.revision + 1 });
    const context = await t.query(internal.migration.getRunContext, { ownerId: ownerA, runId: next.runId, fence: next.fence });
    expect(JSON.stringify(context.messages)).toContain(toolName);
  });

  it("does not complete a reasoning-only response as a blank successful answer", async () => {
    const t = setup();
    const run = await claim(t);
    await expect(t.mutation(internal.migration.completeRun, {
      ownerId: ownerA,
      runId: run.runId,
      fence: run.fence,
      responseMessages: [{ role: "assistant", content: [{ type: "reasoning", text: "Synthetic reasoning fixture" }] }],
      form: null,
    })).rejects.toThrow(/no readable answer/i);
  });

  it("checks identical idempotency before revision and rejects changed payload", async () => {
    const t = setup();
    const first = await claim(t);
    const replay = await claim(t, { expectedRevision: 999 });
    expect(replay.replayed).toBe(true);
    expect(replay.runId).toBe(first.runId);
    await expect(claim(t, { payloadHash: "changed", expectedRevision: 999 }))
      .rejects.toThrow(/Request ID was already used/);
  });

  it("isolates owners and denies public reads without a live session", async () => {
    const t = setup();
    const run = await claim(t);
    await expect(t.query(internal.migration.getRunContext, {
      ownerId: ownerB,
      runId: run.runId,
      fence: run.fence,
    })).rejects.toThrow(/Run not found/);
    await expect(t.query(api.migration.listConversations, {
      paginationOpts: { cursor: null, numItems: 10 },
    })).resolves.toMatchObject({ page: [], isDone: true });
    await expect(t.query(api.migration.getConversation, {
      conversationId: run.conversationId,
    })).resolves.toBeNull();
    await expect(t.query(api.migration.listConversationMessages, {
      conversationId: run.conversationId,
      paginationOpts: { cursor: null, numItems: 10 },
    })).resolves.toMatchObject({ page: [], isDone: true });
  });

  it("clears live read projections when the JWT outlives its revoked session", async () => {
    const t = setup();
    const run = await claim(t);
    const revoked = t.withIdentity({ subject: ownerA, sessionId: "deleted-session" });
    await expect(revoked.query(api.migration.getConversation, {
      conversationId: run.conversationId,
    })).resolves.toBeNull();
    await expect(revoked.query(api.migration.listConversations, {
      paginationOpts: { cursor: null, numItems: 10 },
    })).resolves.toMatchObject({ page: [], isDone: true });
  });

  it("persists a validated form, blocks new questions, and consumes it once", async () => {
    const t = setup();
    const run = await claim(t);
    const waiting = await t.mutation(internal.migration.completeRun, {
      ownerId: ownerA,
      runId: run.runId,
      fence: run.fence,
      responseMessages: [formMessage],
      form,
    });
    expect(waiting.state).toBe("waiting");
    await expect(claim(t, {
      conversationId: run.conversationId,
      requestId: "request-2",
      payloadHash: "hash-2",
      expectedRevision: waiting.revision,
    })).rejects.toThrow(/pending form/i);
    await expect(t.mutation(internal.migration.resolveFormAndClaim, {
      ownerId: ownerA,
      conversationId: run.conversationId,
      requestId: "form-request-bad",
      payloadHash: "form-hash-bad",
      toolCallId: form.toolCallId,
      values: { grt: "50000", injected: "yes" },
      cancelled: false,
      modelAlias: "model-1",
      expectedRevision: waiting.revision,
    })).rejects.toThrow(/Unexpected form field/);
    const continued = await t.mutation(internal.migration.resolveFormAndClaim, {
      ownerId: ownerA,
      conversationId: run.conversationId,
      requestId: "form-request",
      payloadHash: "form-hash",
      toolCallId: form.toolCallId,
      values: { grt: "50000" },
      cancelled: false,
      modelAlias: "model-1",
      expectedRevision: waiting.revision,
    });
    expect(continued.replayed).toBe(false);
    await expect(t.query(internal.migration.getRunContext, {
      ownerId: ownerA,
      runId: continued.runId,
      fence: continued.fence,
    })).resolves.toMatchObject({ conversationId: run.conversationId });
    await expect(t.mutation(internal.migration.resolveFormAndClaim, {
      ownerId: ownerA,
      conversationId: run.conversationId,
      requestId: "form-request-2",
      payloadHash: "form-hash-2",
      toolCallId: form.toolCallId,
      values: { grt: "50000" },
      cancelled: false,
      modelAlias: "model-1",
      expectedRevision: continued.revision,
    })).rejects.toThrow(/No pending form/);
  });

  it("rejects orphan forms and stale completion after cancellation", async () => {
    const t = setup();
    const run = await claim(t);
    await expect(t.mutation(internal.migration.completeRun, {
      ownerId: ownerA,
      runId: run.runId,
      fence: run.fence,
      responseMessages: [{ role: "assistant", content: "No tool call" }],
      form,
    })).rejects.toThrow(/exactly one matching input tool call/);
    expect(await t.mutation(internal.migration.cancelRun, {
      ownerId: ownerA,
      runId: run.runId,
    })).toBe(true);
    await expect(t.mutation(internal.migration.completeRun, {
      ownerId: ownerA,
      runId: run.runId,
      fence: run.fence,
      responseMessages: [{ role: "assistant", content: "Late answer" }],
      form: null,
    })).rejects.toThrow(/Stale run/);
  });

  it("rejects context reads and completion after the lease expires", async () => {
    const t = setup();
    const run = await claim(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(run.runId, { leaseExpiresAt: Date.now() - 1 });
    });
    await expect(t.query(internal.migration.getRunContext, {
      ownerId: ownerA,
      runId: run.runId,
      fence: run.fence,
    })).rejects.toThrow(/lease expired/i);
    await expect(t.mutation(internal.migration.completeRun, {
      ownerId: ownerA,
      runId: run.runId,
      fence: run.fence,
      responseMessages: [{ role: "assistant", content: "Late" }],
      form: null,
    })).rejects.toThrow(/lease expired/i);
  });

  it("rejects an ask tool call that already has a tool result", async () => {
    const t = setup();
    const run = await claim(t);
    await expect(t.mutation(internal.migration.completeRun, {
      ownerId: ownerA,
      runId: run.runId,
      fence: run.fence,
      responseMessages: [
        formMessage,
        {
          role: "tool",
          content: [{
            type: "tool-result",
            toolCallId: form.toolCallId,
            toolName: "ask_user_input",
            output: { type: "json", value: { values: { grt: "1" } } },
          }],
        },
      ],
      form,
    })).rejects.toThrow(/tool result|resolved|matching input tool call/i);
  });

  it("rejects an injected input toolCallId and unexpected tools", async () => {
    const t = setup();
    const injectedRun = await claim(t);
    await expect(t.mutation(internal.migration.completeRun, {
      ownerId: ownerA,
      runId: injectedRun.runId,
      fence: injectedRun.fence,
      responseMessages: [{
        role: "assistant",
        content: [{
          type: "tool-call",
          toolCallId: "authoritative-id",
          toolName: "ask_user_input",
          input: { toolCallId: "injected-id", title: form.title, fields: form.fields },
        }],
      }],
      form: { ...form, toolCallId: "injected-id" },
    })).rejects.toThrow(/does not match/i);

    const otherRun = await claim(t, {
      requestId: "request-other-tool",
      payloadHash: "hash-other-tool",
    });
    await expect(t.mutation(internal.migration.completeRun, {
      ownerId: ownerA,
      runId: otherRun.runId,
      fence: otherRun.fence,
      responseMessages: [{
        role: "assistant",
        content: [{
          type: "tool-call",
          toolCallId: "other-id",
          toolName: "unexpected_tool",
          input: {},
        }],
      }],
      form: null,
    })).rejects.toThrow(/unexpected tool/i);
  });

  it.each(["cancelled", "expired", "wrong-fence", "lost-root"] as const)("checkpoint replay rejects %s runs",async kind=>{
    const t=setup(),run=await claim(t);
    const args={ownerId:ownerA,runId:run.runId,fence:run.fence,stepNumber:0,payloadHash:"same-checkpoint",responseMessages:[{role:"assistant" as const,content:"Checkpoint"}]};
    await t.mutation(internal.migration.checkpointRun,args);
    expect((await t.mutation(internal.migration.checkpointRun,args)).replayed).toBe(true);
    if(kind==="cancelled")await t.mutation(internal.migration.cancelRun,{ownerId:ownerA,runId:run.runId});
    if(kind==="expired")await t.run(async ctx=>{await ctx.db.patch(run.runId,{leaseExpiresAt:Date.now()-1});});
    if(kind==="wrong-fence")args.fence++;
    if(kind==="lost-root")await t.run(async ctx=>{await ctx.db.patch(run.conversationId,{activeRunId:undefined,state:"idle"});});
    await expect(t.mutation(internal.migration.checkpointRun,args)).rejects.toThrow();
  });

  it("checkpoints closed tool history once and completes without duplicating messages", async () => {
    const t = setup();
    const run = await claim(t);
    const closed = [
      {
        role: "assistant" as const,
        content: [{
          type: "tool-call" as const,
          toolCallId: "lookup-1",
          toolName: "get_vessel",
          input: { id: "1234567", id_type: "imo" },
        }],
      },
      {
        role: "tool" as const,
        content: [{
          type: "tool-result" as const,
          toolCallId: "lookup-1",
          toolName: "get_vessel",
          output: { type: "text" as const, value: "GRT: 50000" },
        }],
      },
    ];
    const first = await t.mutation(internal.migration.checkpointRun, {
      ownerId: ownerA,
      runId: run.runId,
      fence: run.fence,
      stepNumber: 0,
      payloadHash: "checkpoint-hash",
      responseMessages: closed,
      finishReason: "tool-calls",
    });
    expect(first.replayed).toBe(false);
    const replay = await t.mutation(internal.migration.checkpointRun, {
      ownerId: ownerA,
      runId: run.runId,
      fence: run.fence,
      stepNumber: 0,
      payloadHash: "checkpoint-hash",
      responseMessages: closed,
      finishReason: "tool-calls",
    });
    expect(replay.replayed).toBe(true);
    await expect(t.mutation(internal.migration.checkpointRun, {
      ownerId: ownerA,
      runId: run.runId,
      fence: run.fence,
      stepNumber: 0,
      payloadHash: "changed",
      responseMessages: closed,
      finishReason: "tool-calls",
    })).rejects.toThrow(/checkpoint.*conflict/i);
    await t.mutation(internal.migration.checkpointRun, {
      ownerId: ownerA,
      runId: run.runId,
      fence: run.fence,
      stepNumber: 1,
      payloadHash: "final-hash",
      responseMessages: [{ role: "assistant", content: "Final cited answer" }],
      finishReason: "stop",
    });
    await expect(t.mutation(internal.migration.completeRun, {
      ownerId: ownerA,
      runId: run.runId,
      fence: run.fence,
      responseMessages: [],
      form: null,
      finishReason: "stop",
    })).rejects.toThrow(/readable answer/);
    expect(await t.mutation(internal.migration.completeRun, {
      ownerId: ownerA, runId: run.runId, fence: run.fence,
      responseMessages: [{ role: "assistant", content: "Final cited answer" }],
      form: null, finishReason: "stop",
    })).toMatchObject({ state: "idle" });
  });

  it("rejects orphan and duplicate tool results at checkpoint", async () => {
    const t = setup();
    const run = await claim(t);
    const orphan = {
      role: "tool" as const,
      content: [{
        type: "tool-result" as const,
        toolCallId: "missing",
        toolName: "get_vessel",
        output: { type: "text" as const, value: "forged" },
      }],
    };
    await expect(t.mutation(internal.migration.checkpointRun, {
      ownerId: ownerA,
      runId: run.runId,
      fence: run.fence,
      stepNumber: 0,
      payloadHash: "orphan",
      responseMessages: [orphan],
    })).rejects.toThrow(/orphan/i);
    const call = {
      role: "assistant" as const,
      content: [{
        type: "tool-call" as const,
        toolCallId: "duplicate-result",
        toolName: "search_vessels",
        input: { query: "Aurora", limit: 5 },
      }],
    };
    const result = {
      role: "tool" as const,
      content: [{
        type: "tool-result" as const,
        toolCallId: "duplicate-result",
        toolName: "search_vessels",
        output: { type: "text" as const, value: "Found" },
      }],
    };
    await expect(t.mutation(internal.migration.checkpointRun, {
      ownerId: ownerA,
      runId: run.runId,
      fence: run.fence,
      stepNumber: 0,
      payloadHash: "duplicate",
      responseMessages: [call, result, result],
    })).rejects.toThrow(/duplicate tool result/i);
  });

  it("rejects ask_user_input mixed with another tool in the same model step", async () => {
    const t = setup();
    const run = await claim(t);
    await expect(t.mutation(internal.migration.completeRun, {
      ownerId: ownerA,
      runId: run.runId,
      fence: run.fence,
      responseMessages: [{
        role: "assistant",
        content: [
          formMessage.content[0],
          {
            type: "tool-call",
            toolCallId: "lookup-mixed",
            toolName: "get_vessel",
            input: { id: "1234567", id_type: "imo" },
          },
        ],
      }],
      form,
    })).rejects.toThrow(/only tool call/i);
  });

  it("loads more than forty stored messages without truncating tool history", async () => {
    const t = setup();
    const run = await claim(t);
    await t.run(async (ctx) => {
      await saveMessages(ctx, components.agent, {
        threadId: run.threadId,
        userId: ownerA,
        order: "next",
        messages: Array.from({ length: 45 }, (_, index) => ({
          role: "assistant" as const,
          content: `Historical answer ${index}`,
        })),
      });
    });
    const context = await t.query(internal.migration.getRunContext, {
      ownerId: ownerA,
      runId: run.runId,
      fence: run.fence,
    });
    expect(context.messages).toHaveLength(46);
    expect(context.messages.at(-1)).toMatchObject({ content: "Historical answer 44" });
  });

  it("does not treat an earlier preamble as a terminal answer after a final tool-only step", async () => {
    const t = setup();
    const run = await claim(t);
    await t.mutation(internal.migration.checkpointRun, {
      ownerId: ownerA,
      runId: run.runId,
      fence: run.fence,
      stepNumber: 0,
      payloadHash: "preamble",
      responseMessages: [{ role: "assistant", content: "I will calculate that now." }],
      finishReason: "tool-calls",
    });
    await t.mutation(internal.migration.checkpointRun, {
      ownerId: ownerA,
      runId: run.runId,
      fence: run.fence,
      stepNumber: 1,
      payloadHash: "tool-only",
      responseMessages: [
        {
          role: "assistant",
          content: [{
            type: "tool-call",
            toolCallId: "calc-final",
            toolName: "port_information",
            input: { port_name: "mumbai", query: "calculate" },
          }],
        },
        {
          role: "tool",
          content: [{
            type: "tool-result",
            toolCallId: "calc-final",
            toolName: "port_information",
            output: { type: "text", value: "tool output without final answer" },
          }],
        },
      ],
      finishReason: "tool-calls",
    });
    await expect(t.mutation(internal.migration.completeRun, {
      ownerId: ownerA,
      runId: run.runId,
      fence: run.fence,
      responseMessages: [],
      form: null,
      finishReason: "tool-calls",
    })).rejects.toThrow(/terminal|readable answer|incomplete/i);
  });

  it("does not complete an output-length-truncated answer", async () => {
    const t = setup();
    const run = await claim(t);
    await t.mutation(internal.migration.checkpointRun, {
      ownerId: ownerA,
      runId: run.runId,
      fence: run.fence,
      stepNumber: 0,
      payloadHash: "truncated",
      responseMessages: [{ role: "assistant", content: "Partial tariff breakdown" }],
      finishReason: "length",
    });
    await expect(t.mutation(internal.migration.completeRun, {
      ownerId: ownerA,
      runId: run.runId,
      fence: run.fence,
      responseMessages: [],
      form: null,
      finishReason: "length",
    })).rejects.toThrow(/clean terminal stop/i);
  });
  it.each(["blank", "provider-error"] as const)("does not let incomplete disposition bypass %s validation", async kind => {
    const t = setup();
    const run = await claim(t);
    await expect(t.mutation(internal.migration.completeRun, {
      ownerId: ownerA, runId: run.runId, fence: run.fence, form: null,
      responseMessages: kind === "blank" ? [] : [{ role: "assistant", content: "Partial work" }],
      finishReason: kind === "blank" ? "tool-calls" : "error", incomplete: true,
    })).rejects.toThrow(/Incomplete work requires/);
  });
  it("validates own-property form values without inherited prototype keys", async () => {
    const t = setup();
    const run = await claim(t);
    const dangerousForm = { ...form, fields: [{ name: "constructor", label: "Constructor", type: "text" as const, required: true }, { name: "toString", label: "Optional details", type: "text" as const, required: false }] };
    const message = { role: "assistant" as const, content: [{ type: "tool-call" as const, toolCallId: form.toolCallId, toolName: "ask_user_input", input: { title: form.title, fields: dangerousForm.fields } }] };
    await t.mutation(internal.migration.completeRun, { ownerId: ownerA, runId: run.runId, fence: run.fence, responseMessages: [message], form: dangerousForm });
    const args = { ownerId: ownerA, conversationId: run.conversationId, requestId: "prototype-form", payloadHash: "prototype-form", toolCallId: form.toolCallId, values: {}, cancelled: false, modelAlias: "model-1" as const, expectedRevision: run.revision + 1 };
    await expect(t.mutation(internal.migration.resolveFormAndClaim, args)).rejects.toThrow(/Constructor is required/);
    const resolved = await t.mutation(internal.migration.resolveFormAndClaim, { ...args, values: { constructor: "Actual supplied string" } });
    expect(resolved.replayed).toBe(false);
  });

});
