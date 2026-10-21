/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import { listMessages } from "@convex-dev/agent";
import betterAuthTest from "@convex-dev/better-auth/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, components, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { ChatMemoryRuntime } from "../../src/lib/memory/runtime";
import { AuthoritySession } from "../../src/lib/authority/session";
import {
  APPROVE,
  REJECT,
  approvalForm,
  authorityDigest,
  canonical, comparisonCore,
  quoteCore,
  reviewPacket,
  type AuthorityPacket,
  type QuoteCore,
} from "../../src/lib/authority/contract";

const modules = import.meta.glob("../../convex/**/*.ts");
const setup = () => { const t = convexTest(schema, modules); agentTest.register(t); betterAuthTest.register(t); return t; };
type Test = ReturnType<typeof setup>;
const owner = "authority-owner";
const quote: QuoteCore = {
  id: "quote-alpha", revision: 0, name: "Alpha", pricing: "supplied", call: { gt: "10000" }, services: [],
  lines: [{ name: "Berth", currency: "USD", amount: "100" }], terms: { taxPercent: "0" },
};
const quoteOperation = { id: "00000000-0000-4000-8000-000000000001", kind: "quote" as const, quote, before: null, previous: null };
const QUOTE_CORE_SHA256 = "3b7a4cc414e2f9b118e58db29a1fe3ffe7ec90480aa3264c2a92aad11b9a5fdc";
const quotePacket = (): AuthorityPacket => ({ version: 1, operations: [structuredClone(quoteOperation)] });
type MemoryOverrides = Partial<{ key: string; value: string; previousValue: string | null; previousValueHash: string | null; memoryEpoch: number; memoryRevision: number }>;
const memoryPacket = (overrides: MemoryOverrides = {}): AuthorityPacket => ({
  version: 1,
  operations: [{ id: "00000000-0000-4000-8000-000000000002", kind: "remember", key: "preferred_port", value: "Mumbai", previousValue: null, previousValueHash: null, memoryEpoch: 0, memoryRevision: 0, ...overrides }],
});

async function claim(t: Test, id = crypto.randomUUID(), conversationId: Id<"migrationConversations"> | null = null, expectedRevision: number | null = null, useOwner = owner) {
  return t.mutation(internal.migration.claimQuestion, {
    ownerId: useOwner, conversationId, requestId: id, payloadHash: id, question: "Authority test", modelAlias: "model-1", expectedRevision,
  });
}
async function propose(t: Test, run: Awaited<ReturnType<typeof claim>>, packet: AuthorityPacket, toolCallId = `approval-${crypto.randomUUID()}`) {
  const payload = canonical(packet), form = approvalForm(packet, toolCallId);
  const input = { title: form.title, description: form.description, fields: form.fields };
  const result = await t.mutation(internal.migration.completeRun, {
    ownerId: owner, runId: run.runId, fence: run.fence,
    responseMessages: [{ role: "assistant" as const, content: [{ type: "tool-call" as const, toolName: "ask_user_input", toolCallId, input }] }],
    form, authorizationProposal: payload,
  });
  return { payload, form, result };
}
async function resolve(t: Test, run: Awaited<ReturnType<typeof claim>>, proposal: Awaited<ReturnType<typeof propose>>, options: { decision?: string; cancelled?: boolean; note?: string; requestId?: string; ownerId?: string; conversationId?: Id<"migrationConversations">; toolCallId?: string } = {}) {
  const requestId = options.requestId ?? crypto.randomUUID();
  return t.mutation(internal.migration.resolveFormAndClaim, {
    ownerId: options.ownerId ?? owner,
    conversationId: options.conversationId ?? run.conversationId,
    requestId,
    payloadHash: requestId,
    toolCallId: options.toolCallId ?? proposal.form.toolCallId,
    values: options.cancelled ? {} : { decision: options.decision ?? APPROVE },
    cancelled: options.cancelled ?? false,
    note: options.note ?? "",
    modelAlias: "model-1",
    expectedRevision: proposal.result.revision,
  });
}
async function receiptMessages(conversationId: string, candidate = quote, beforeRevision = -1, hashOverride?: string, toolCallId = "execute-quote") {
  const unsigned = { version: 2, kind: "portia-quote", conversationId, beforeRevision, quote: candidate };
  const record = { ...unsigned, hash: hashOverride ?? await authorityDigest(unsigned) };
  return [
    { role: "assistant" as const, content: [{ type: "tool-call" as const, toolCallId, toolName: "manage_quote", input: candidate }] },
    { role: "tool" as const, content: [{ type: "tool-result" as const, toolCallId, toolName: "manage_quote", output: { type: "json" as const, value: { record } } }] },
    { role: "assistant" as const, content: "Applied the approved quotation." },
  ];
}

function comparisonMessages(conversationId: string, operation: Extract<AuthorityPacket["operations"][number], { kind: "comparison" }>, toolCallId = "execute-comparison") {
  return [
    { role: "assistant" as const, content: [{ type: "tool-call" as const, toolCallId, toolName: "compare_quotes", input: operation.input }] },
    { role: "tool" as const, content: [{ type: "tool-result" as const, toolCallId, toolName: "compare_quotes", output: { type: "json" as const, value: { record: { version: 1, kind: "portia-comparison", conversationId, ...comparisonCore(operation) } } } }] },
    { role: "assistant" as const, content: "Compared the approved quotation revisions." },
  ];
}
async function account(t: Test, email: string) {
  const now = Date.now();
  const user = await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: "Authority", email, emailVerified: false, createdAt: now, updatedAt: now } } });
  const session = await t.mutation(components.betterAuth.adapter.create, { input: { model: "session", data: { userId: user._id, token: crypto.randomUUID(), expiresAt: now + 3_600_000, createdAt: now, updatedAt: now } } });
  return { ownerId: user._id, client: t.withIdentity({ subject: user._id, sessionId: session._id }) };
}

beforeEach(() => {
  vi.stubEnv("MIGRATION_DEV_ENABLED", "true");
  vi.stubEnv("PORTIA_CONVEX_DEPLOYMENT", "brilliant-whale-380");
  vi.stubEnv("CONVEX_SITE_URL", "https://brilliant-whale-380.convex.site");
  vi.stubEnv("PORTIA_AUTH_MODE", "basic");
  vi.stubEnv("PORTIA_MEMORY_ENABLED", "true");
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("exact-operation backend authority", () => {
  it("carries bounded remaining obligations from exact review into the approval run",async()=>{
    const t=setup(),run=await claim(t),packet=quotePacket(),payload=canonical(packet),form=approvalForm(packet,"obligation-review");
    const remainingObligations={version:1 as const,outcomes:[{kind:"information" as const,branches:[{disposition:"unavailable" as const,targets:["redi-current"],questions:[],detail:"Current operative schedule unavailable."}]}]};
    const proposed=await t.mutation(internal.migration.completeRun,{ownerId:owner,runId:run.runId,fence:run.fence,responseMessages:[{role:"assistant",content:[{type:"tool-call",toolName:"ask_user_input",toolCallId:form.toolCallId,input:{title:form.title,description:form.description,fields:form.fields}}]}],form,authorizationProposal:payload,remainingObligations});
    const approved=await resolve(t,run,{payload,form,result:proposed});
    const context=await t.query(internal.migration.getRunContext,{ownerId:owner,runId:approved.runId,fence:approved.fence});
    expect(context.remainingObligations).toEqual(remainingObligations);
  });
  it("completes a native official comparison from an ordinary saved quote and its newer approved FX revision", async () => {
    const t = setup();
    const ordinaryA: QuoteCore = { id: "official-a", revision: 0, name: "Official A", pricing: "official", call: { gt: "8317" }, services: ["port-dues"], lines: [{ name: "Port dues", currency: "USD", amount: "71.35" }], terms: {} };
    const ordinaryB: QuoteCore = { id: "official-b", revision: 0, name: "Official B", pricing: "official", call: { gt: "9001" }, services: ["port-dues"], lines: [{ name: "Port dues", currency: "USD", amount: "76.90" }], terms: {} };
    const initial = await claim(t);
    const savedA = await receiptMessages(initial.conversationId, ordinaryA, -1, undefined, "ordinary-a");
    const savedB = await receiptMessages(initial.conversationId, ordinaryB, -1, undefined, "ordinary-b");
    const ordinaryComplete = await t.mutation(internal.migration.completeRun, {
      ownerId: owner, runId: initial.runId, fence: initial.fence,
      responseMessages: [...savedA.slice(0, 2), ...savedB], form: null, finishReason: "stop",
    });

    const fxQuote: QuoteCore = { ...structuredClone(ordinaryA), revision: 1, call: { ...ordinaryA.call, fxInrPerUsd: "83.75", fxDate: "2026-11-17" } };
    const ordinaryBinding = { quoteId: ordinaryA.id, revision: 0, digest: await authorityDigest(quoteCore(ordinaryA)) };
    const fxPacket: AuthorityPacket = { version: 1, operations: [{ id: crypto.randomUUID(), kind: "quote", quote: fxQuote, before: ordinaryBinding, previous: ordinaryA }] };
    const fxRun = await claim(t, "official-fx", initial.conversationId, ordinaryComplete.revision);
    const fxProposal = await propose(t, fxRun, fxPacket, "approve-official-fx");
    const fxGrant = await resolve(t, fxRun, fxProposal, { requestId: "approve-official-fx-response" });
    const fxComplete = await t.mutation(internal.migration.completeRun, {
      ownerId: owner, runId: fxGrant.runId, fence: fxGrant.fence,
      responseMessages: await receiptMessages(initial.conversationId, fxQuote, 0, undefined, "execute-official-fx"), form: null, finishReason: "stop",
    });

    const fxBinding = { quoteId: fxQuote.id, revision: 1, digest: await authorityDigest(quoteCore(fxQuote)) };
    const ordinaryBBinding = { quoteId: ordinaryB.id, revision: 0, digest: await authorityDigest(quoteCore(ordinaryB)) };
    const comparison = { id: crypto.randomUUID(), kind: "comparison" as const, input: { quoteIds: [fxQuote.id, ordinaryB.id], currency: "INR", exchangeRates: [{ from: "USD", to: "INR", rate: "83.75", date: "2026-11-17" }], rounding: null }, quotes: [{ ...fxBinding, name: fxQuote.name }, { ...ordinaryBBinding, name: ordinaryB.name }] };
    const comparisonPacket: AuthorityPacket = { version: 1, operations: [comparison] };
    const comparisonRun = await claim(t, "official-comparison", initial.conversationId, fxComplete.revision);
    const comparisonProposal = await propose(t, comparisonRun, comparisonPacket, "approve-official-comparison");
    const comparisonGrant = await resolve(t, comparisonRun, comparisonProposal, { requestId: "approve-official-comparison-response" });
    const comparisonComplete = await t.mutation(internal.migration.completeRun, {
      ownerId: owner, runId: comparisonGrant.runId, fence: comparisonGrant.fence,
      responseMessages: comparisonMessages(initial.conversationId, comparison), form: null, finishReason: "stop",
    });

    expect(comparisonComplete.state).toBe("idle");
    const conversation = await t.run((ctx) => ctx.db.get(initial.conversationId));
    expect(conversation?.quoteApprovals).toContainEqual(fxBinding);
    expect(conversation?.quoteApprovals).not.toContainEqual(ordinaryBinding);
    expect(conversation?.comparisonApprovals).toContain(await authorityDigest(comparisonCore(comparison)));
  });

  it("preserves a ready quote through native clarification and reviews it with the completed quote", async () => {
    const t = setup(), run = await claim(t);
    const ready = structuredClone(quoteOperation);
    const readyPacket: AuthorityPacket = { version: 1, operations: [ready] };
    const readyPayload = canonical(readyPacket), readyForm = approvalForm(readyPacket, "ready-a-review");
    const clarification = { toolCallId: "clarify-b", title: "Complete quotation B", description: "Provide the remaining quotation value.", fields: [{ name: "price", label: "Quotation B price", type: "text" as const, required: true }] };
    const waiting = await t.mutation(internal.migration.completeRun, {
      ownerId: owner, runId: run.runId, fence: run.fence,
      responseMessages: [{ role: "assistant", content: [{ type: "tool-call", toolName: "ask_user_input", toolCallId: clarification.toolCallId, input: { title: clarification.title, description: clarification.description, fields: clarification.fields } }] }],
      form: clarification,
      authorizationContinuation: [{ payload: readyPayload, ...readyForm, reviewGroup: "quotes" }],
    });
    const clarified = await t.mutation(internal.migration.resolveFormAndClaim, {
      ownerId: owner, conversationId: run.conversationId, requestId: "clarification-response", payloadHash: "clarification-response", toolCallId: clarification.toolCallId,
      values: { price: "73.40" }, cancelled: false, note: "", modelAlias: "model-1", expectedRevision: waiting.revision,
    });
    const restored = await t.query(internal.migration.getRunContext, { ownerId: owner, runId: clarified.runId, fence: clarified.fence });
    expect(restored.authorizationResolutionReason).toBe("submitted");
    expect(restored.authorizationContinuation?.map((item) => item.payload)).toEqual([readyPayload]);

    const completedB: QuoteCore = { id: "quote-beta", revision: 0, name: "Beta", pricing: "supplied", call: {}, services: [], lines: [{ name: "Towage", currency: "USD", amount: "73.40" }], terms: {} };
    const completedBOperation = { id: crypto.randomUUID(), kind: "quote" as const, quote: completedB, before: null, previous: null };
    const authority = new AuthoritySession(restored.authorityContext, restored.authorizationContinuation?.map(({ payload, reviewGroup }) => ({ payload, reviewGroup })));
    authority.propose(completedBOperation, "quotes");
    const review = authority.pendingQueue()[0]!;
    expect(review.reviewGroup).toBe("quotes");
    expect(JSON.parse(review.payload).operations.map((operation: { quote: { id: string } }) => operation.quote.id)).toEqual([quote.id, completedB.id]);
    const proposed = await t.mutation(internal.migration.completeRun, {
      ownerId: owner, runId: clarified.runId, fence: clarified.fence,
      responseMessages: [{ role: "assistant", content: [{ type: "tool-call", toolName: "ask_user_input", toolCallId: review.form.toolCallId, input: { title: review.form.title, description: review.form.description, fields: review.form.fields } }] }],
      form: review.form, authorizationProposal: review.payload,
    });
    const approved = await resolve(t, clarified, { payload: review.payload, form: review.form, result: proposed }, { requestId: "approve-both-quotes" });
    const readyReceipts = await receiptMessages(run.conversationId, quote, -1, undefined, "execute-ready-a");
    const completedBReceipts = await receiptMessages(run.conversationId, completedB, -1, undefined, "execute-completed-b");
    await t.mutation(internal.migration.completeRun, {
      ownerId: owner, runId: approved.runId, fence: approved.fence,
      responseMessages: [...readyReceipts.slice(0, 2), ...completedBReceipts], form: null, finishReason: "stop",
    });
    const conversation = await t.run((ctx) => ctx.db.get(run.conversationId));
    expect(conversation?.quoteApprovals?.map((binding) => binding.quoteId).sort()).toEqual([quote.id, completedB.id].sort());
  });

  it("keeps an independent memory successor when only the namespace revision advances", async () => {
    const t = setup(), run = await claim(t), first = quotePacket(), successorPacket = memoryPacket();
    const firstPayload = canonical(first), firstForm = approvalForm(first, "stale-first"), successorPayload = canonical(successorPacket), successorForm = approvalForm(successorPacket, "stale-successor");
    const proposed = await t.mutation(internal.migration.completeRun, {
      ownerId: owner, runId: run.runId, fence: run.fence,
      responseMessages: [{ role: "assistant", content: [{ type: "tool-call", toolName: "ask_user_input", toolCallId: firstForm.toolCallId, input: { title: firstForm.title, description: firstForm.description, fields: firstForm.fields } }] }],
      form: firstForm, authorizationProposal: firstPayload,
      authorizationContinuation: [{ payload: successorPayload, ...successorForm, reviewGroup: "memory" }],
    });
    const granted = await resolve(t, run, { payload: firstPayload, form: firstForm, result: proposed }, { requestId: "approve-before-successor-stales" });
    await t.run(async (ctx) => {
      const namespace = (await ctx.db.query("memoryNamespaces").withIndex("by_owner", (q) => q.eq("ownerId", owner)).unique())!;
      await ctx.db.patch(namespace._id, { revision: namespace.revision + 1 });
    });
    const completed = await t.mutation(internal.migration.completeRun, {
      ownerId: owner, runId: granted.runId, fence: granted.fence,
      responseMessages: await receiptMessages(run.conversationId), form: null, finishReason: "stop",
    });
    expect(completed.state).toBe("waiting");
    const conversation = await t.run((ctx) => ctx.db.get(run.conversationId));
    expect(conversation?.quoteApprovals).toContainEqual({ quoteId: quote.id, revision: 0, digest: await authorityDigest(quoteCore(quote)) });
    expect(conversation?.pendingFormId).toBeDefined();
    expect(conversation?.lastError).toBeUndefined();
    expect(await t.run(async (ctx) => (await ctx.db.query("memoryOperations").collect()).length)).toBe(0);
    const successor=await t.run(async ctx=>ctx.db.get(conversation!.pendingFormId!));
    expect(successor?.authorization?.payload).toBe(successorPayload);
  });

  it("publishes one identical canonical answer when a successor's prior value changes", async () => {
    const t = setup(), run = await claim(t), first = quotePacket(), next = memoryPacket();
    const payload = canonical(first), form = approvalForm(first, "canonical-first"), successor = approvalForm(next, "canonical-next");
    const proposed = await t.mutation(internal.migration.completeRun, {
      ownerId: owner, runId: run.runId, fence: run.fence,
      responseMessages: [{ role: "assistant", content: [{ type: "tool-call", toolName: "ask_user_input", toolCallId: form.toolCallId, input: { title: form.title, description: form.description, fields: form.fields } }] }],
      form, authorizationProposal: payload, authorizationContinuation: [{ payload: canonical(next), ...successor, reviewGroup: "memory" }],
    });
    const granted = await resolve(t, run, { payload, form, result: proposed }, { requestId: "canonical-approve" });
    await t.run(async ctx => {
      const namespace = (await ctx.db.query("memoryNamespaces").withIndex("by_owner", q => q.eq("ownerId", owner)).unique())!;
      await ctx.db.patch(namespace._id, { revision: namespace.revision + 1, factIndex: [{ key: "preferred_port", hash: "a".repeat(64), sources: [] }] });
    });
    const completed = await t.mutation(internal.migration.completeRun, { ownerId: owner, runId: granted.runId, fence: granted.fence,
      responseMessages: await receiptMessages(run.conversationId), form: null, finishReason: "stop" });
    expect(completed.state).toBe("idle");
    expect(completed.publicText).toContain("Applied the approved quotation.");
    expect(completed.publicText).toContain("No successor review was opened");
    const history = await t.run(async ctx => {
      const conversation = (await ctx.db.get(run.conversationId))!;
      expect(conversation.pendingFormId).toBeUndefined();
      return listMessages(ctx, components.agent, { threadId: conversation.agentThreadId, paginationOpts: { cursor: null, numItems: 100 }, excludeToolMessages: false });
    });
    const texts = history.page.flatMap(doc => doc.message?.role === "assistant" && typeof doc.message.content === "string" ? [doc.message.content] : []);
    expect(texts).toEqual([completed.publicText]);
  });

  it.each([
    ["note", { decision: APPROVE, note: "Please revise the first quotation." }],
    ["reject", { decision: REJECT }],
    ["cancel", { cancelled: true }],
  ] as const)("%s discards the native review continuation without enqueueing memory", async (_reason, response) => {
    const t = setup(), run = await claim(t), first = quotePacket(), successorPacket = memoryPacket();
    const firstPayload = canonical(first), firstForm = approvalForm(first, "declined-first"), successorPayload = canonical(successorPacket), successorForm = approvalForm(successorPacket, "discarded-successor");
    const proposed = await t.mutation(internal.migration.completeRun, {
      ownerId: owner, runId: run.runId, fence: run.fence,
      responseMessages: [{ role: "assistant", content: [{ type: "tool-call", toolName: "ask_user_input", toolCallId: firstForm.toolCallId, input: { title: firstForm.title, description: firstForm.description, fields: firstForm.fields } }] }],
      form: firstForm, authorizationProposal: firstPayload,
      authorizationContinuation: [{ payload: successorPayload, ...successorForm, reviewGroup: "memory" }],
    });
    const resolved = await resolve(t, run, { payload: firstPayload, form: firstForm, result: proposed }, response);
    const context = await t.query(internal.migration.getRunContext, { ownerId: owner, runId: resolved.runId, fence: resolved.fence });
    expect(context.authorization).toBeUndefined();
    expect(context.authorizationContinuation).toBeUndefined();
    await t.mutation(internal.migration.completeRun, {
      ownerId: owner, runId: resolved.runId, fence: resolved.fence,
      responseMessages: [{ role: "assistant", content: "The review was not applied." }], form: null, finishReason: "stop",
    });
    const conversation = await t.run((ctx) => ctx.db.get(run.conversationId));
    expect(conversation?.pendingFormId).toBeUndefined();
    expect(conversation?.quoteApprovals ?? []).toEqual([]);
    expect(await t.run(async (ctx) => (await ctx.db.query("memoryOperations").collect()).length)).toBe(0);
  });

  it("keeps successor review outside the active grant and advances it only after exact execution",async()=>{
    const t=setup(),run=await claim(t),first=quotePacket(),second=memoryPacket(),firstPayload=canonical(first),firstForm=approvalForm(first,"group-1"),secondPayload=canonical(second),secondForm=approvalForm(second,"group-2");
    const proposed=await t.mutation(internal.migration.completeRun,{ownerId:owner,runId:run.runId,fence:run.fence,responseMessages:[{role:"assistant",content:[{type:"tool-call",toolName:"ask_user_input",toolCallId:firstForm.toolCallId,input:{title:firstForm.title,description:firstForm.description,fields:firstForm.fields}}]}],form:firstForm,authorizationProposal:firstPayload,authorizationContinuation:[{payload:secondPayload,...secondForm,reviewGroup:"memory"}]});
    const granted=await resolve(t,run,{payload:firstPayload,form:firstForm,result:proposed});
    const active=await t.run(ctx=>ctx.db.get(granted.runId));expect(active?.authorization?.payload).toBe(firstPayload);expect(active?.authorization?.payload).not.toContain("preferred_port");
    const completed=await t.mutation(internal.migration.completeRun,{ownerId:owner,runId:granted.runId,fence:granted.fence,responseMessages:await receiptMessages(run.conversationId),form:null,finishReason:"stop"});expect(completed.state).toBe("waiting");
    const successor=await t.run(async ctx=>ctx.db.get((await ctx.db.get(run.conversationId))!.pendingFormId!));expect(successor?.authorization?.payload).toBe(secondPayload);expect(successor?.toolCallId).toBe("group-2");
    const next=await t.mutation(internal.migration.resolveFormAndClaim,{ownerId:owner,conversationId:run.conversationId,requestId:"group-2-approve",payloadHash:"group-2-approve",toolCallId:"group-2",values:{decision:APPROVE},cancelled:false,note:"",expectedRevision:completed.revision,modelAlias:"model-1"});
    const context=await t.query(internal.migration.getRunContext,{ownerId:owner,runId:next.runId,fence:next.fence});
    expect(context.messages.some(message=>Array.isArray(message.content)&&message.content.some(part=>part.type==="tool-call"&&part.toolCallId==="group-2"))).toBe(true);
    expect(context.messages.some(message=>Array.isArray(message.content)&&message.content.some(part=>part.type==="tool-result"&&part.toolCallId==="group-2"))).toBe(true);
    expect(JSON.stringify(context.messages)).toContain('"resolutionReason":"approved"');
    const final=await t.mutation(internal.migration.completeRun,{ownerId:owner,runId:next.runId,fence:next.fence,responseMessages:[{role:"assistant",content:[{type:"tool-call",toolName:"remember_memory",toolCallId:"approved-memory",input:{key:"preferred_port",value:"Mumbai"}}]},{role:"tool",content:[{type:"tool-result",toolName:"remember_memory",toolCallId:"approved-memory",output:{type:"json",value:{saved:true}}}]},{role:"assistant",content:"Requested memory saved."}],form:null,finishReason:"stop"});expect(final.state).toBe("idle");
    expect(await t.run(async ctx=>(await ctx.db.query("memoryOperations").collect()).some(operation=>operation.status==="pending"))).toBe(true);
  });
  it("keeps an independently reviewed memory key after an earlier key advances the namespace revision",async()=>{
    const t=setup(),run=await claim(t),first=memoryPacket({key:"preferred_port",value:"Mumbai"}),second=memoryPacket({key:"preferred_units",value:"metric"});
    second.operations[0]!.id="00000000-0000-4000-8000-000000000005";
    const firstPayload=canonical(first),firstForm=approvalForm(first,"memory-group-1"),secondPayload=canonical(second),secondForm=approvalForm(second,"memory-group-2");
    const proposed=await t.mutation(internal.migration.completeRun,{ownerId:owner,runId:run.runId,fence:run.fence,responseMessages:[{role:"assistant",content:[{type:"tool-call",toolName:"ask_user_input",toolCallId:firstForm.toolCallId,input:{title:firstForm.title,description:firstForm.description,fields:firstForm.fields}}]}],form:firstForm,authorizationProposal:firstPayload,authorizationContinuation:[{payload:secondPayload,...secondForm,reviewGroup:"units"}]});
    const granted=await resolve(t,run,{payload:firstPayload,form:firstForm,result:proposed});
    const job=(await t.mutation(internal.memory.claim,{ownerId:owner}))!;
    const runtime=await ChatMemoryRuntime.restore(job.image);await runtime.apply(job.operations);
    await t.mutation(internal.memory.publish,{ownerId:owner,token:job.token,fence:job.fence,epoch:job.epoch,baseRevision:job.baseRevision,through:job.through,image:await runtime.snapshot()});
    const completed=await t.mutation(internal.migration.completeRun,{ownerId:owner,runId:granted.runId,fence:granted.fence,responseMessages:[{role:"assistant",content:[{type:"tool-call",toolName:"remember_memory",toolCallId:"approved-first",input:{key:"preferred_port",value:"Mumbai"}}]},{role:"tool",content:[{type:"tool-result",toolName:"remember_memory",toolCallId:"approved-first",output:{type:"json",value:{saved:true}}}]},{role:"assistant",content:"Requested memory saved."}],form:null,finishReason:"stop"});
    expect(completed.state).toBe("waiting");
    const conversation=await t.run(ctx=>ctx.db.get(run.conversationId)),successor=await t.run(ctx=>ctx.db.get(conversation!.pendingFormId!));
    expect(successor?.authorization?.payload).toBe(secondPayload);
  });
  it("persists an identical complete review privately, executes one exact quote, and records provenance", async () => {
    const t = setup(), run = await claim(t), packet = quotePacket(), proposed = await propose(t, run, packet);
    expect(await authorityDigest(quoteCore(quote))).toBe(QUOTE_CORE_SHA256);
    expect(proposed.form.description).toBe(reviewPacket(packet));
    const stored = await t.run(async (ctx) => ctx.db.get((await ctx.db.get(run.conversationId))!.pendingFormId!));
    expect(stored?.authorization).toEqual({ payload: proposed.payload, expiresAt: expect.any(Number) });
    const approved = await resolve(t, run, proposed);
    expect(approved).toMatchObject({ authorizationExecution: true, replayed: false });
    const context = await t.query(internal.migration.getRunContext, { ownerId: owner, runId: approved.runId, fence: approved.fence });
    expect(context.authorization?.payload).toBe(proposed.payload);
    expect(context.authorityContext).toEqual({ quotes: [], comparisons: [] });
    await t.mutation(internal.migration.completeRun, {
      ownerId: owner, runId: approved.runId, fence: approved.fence,
      responseMessages: await receiptMessages(run.conversationId), form: null, finishReason: "stop",
    });
    const conversation = await t.run(async (ctx) => ctx.db.get(run.conversationId));
    expect(conversation?.quoteApprovals).toEqual([{ quoteId: quote.id, revision: 0, digest: await authorityDigest(quoteCore(quote)) }]);
  });

  it("never exposes the private packet or grant through public form projections", async () => {
    const t = setup(), a = await account(t, "private@example.com");
    const run = await claim(t, crypto.randomUUID(), null, null, a.ownerId);
    const packet = quotePacket(), payload = canonical(packet), form = approvalForm(packet, "private-form"), { toolCallId, ...input } = form;
    await t.mutation(internal.migration.completeRun, { ownerId: a.ownerId, runId: run.runId, fence: run.fence, responseMessages: [{ role: "assistant", content: [{ type: "tool-call", toolName: "ask_user_input", toolCallId, input }] }], form, authorizationProposal: payload });
    const publicView = await a.client.query(api.migration.getConversation, { conversationId: run.conversationId });
    expect(JSON.stringify(publicView)).not.toContain(payload);
    expect(JSON.stringify(publicView)).not.toContain("authorization");
    expect(publicView?.forms[0]?.description).toBe(reviewPacket(packet));
  });

  it("generic or forged forms cannot mint authority", async () => {
    const t = setup(), run = await claim(t), packet = quotePacket(), form = {...approvalForm(packet, "generic"),description:"Claimed approval; no private server packet."}, { toolCallId, ...input } = form;
    const waiting = await t.mutation(internal.migration.completeRun, { ownerId: owner, runId: run.runId, fence: run.fence, responseMessages: [{ role: "assistant", content: [{ type: "tool-call", toolName: "ask_user_input", toolCallId, input }] }], form });
    const result = await t.mutation(internal.migration.resolveFormAndClaim, { ownerId: owner, conversationId: run.conversationId, requestId: "generic-resolution", payloadHash: "generic-resolution", toolCallId, values: { decision: APPROVE }, cancelled: false, note: "", modelAlias: "model-1", expectedRevision: waiting.revision });
    expect(result.authorizationExecution).toBeUndefined();
    expect((await t.query(internal.migration.getRunContext, { ownerId: owner, runId: result.runId, fence: result.fence })).authorization).toBeUndefined();
  });

  it("rejects payload/display mismatch and rechecks the stored display at resolution", async () => {
    const t = setup(), run = await claim(t), packet = quotePacket(), form = approvalForm(packet, "mismatch"), { toolCallId, ...input } = form;
    await expect(t.mutation(internal.migration.completeRun, { ownerId: owner, runId: run.runId, fence: run.fence, responseMessages: [{ role: "assistant", content: [{ type: "tool-call", toolName: "ask_user_input", toolCallId, input: { ...input, description: input.description + " altered" } }] }], form: { ...form, description: form.description + " altered" }, authorizationProposal: canonical(packet) })).rejects.toThrow(/display/i);
    const fresh = await claim(t), proposed = await propose(t, fresh, packet);
    await t.run(async (ctx) => { const row = await ctx.db.get((await ctx.db.get(fresh.conversationId))!.pendingFormId!); await ctx.db.patch(row!._id, { description: row!.description + " tampered" }); });
    await expect(resolve(t, fresh, proposed)).rejects.toThrow(/display/i);
  });

  it("binds owner, conversation, form and waiting fence", async () => {
    const t = setup(), run = await claim(t), proposed = await propose(t, run, quotePacket());
    const other = await claim(t, crypto.randomUUID(), null, null, "other-owner");
    await expect(resolve(t, run, proposed, { ownerId: "other-owner" })).rejects.toThrow();
    await expect(resolve(t, run, proposed, { conversationId: other.conversationId })).rejects.toThrow();
    await expect(resolve(t, run, proposed, { toolCallId: "swapped-form" })).rejects.toThrow();
    await t.run(async (ctx) => { const form = await ctx.db.get((await ctx.db.get(run.conversationId))!.pendingFormId!); await ctx.db.patch(form!.runId, { fence: form!.fence + 1 }); });
    await expect(resolve(t, run, proposed)).rejects.toThrow(/fence/i);
  });

  it.each([
    ["cancel", { cancelled: true }, true],
    ["reject", { decision: REJECT }, true],
    ["approve with correction", { decision: APPROVE, note: "Change USD 100 to USD 90" }, false],
  ] as const)("%s never grants or admits operations", async (_name, options, declined) => {
    const t = setup(), run = await claim(t), proposed = await propose(t, run, memoryPacket());
    const result = await resolve(t, run, proposed, options);
    expect(result.authorizationExecution).toBeUndefined();
    expect(result.authorizationDeclined).toBe(declined ? true : undefined);
    expect((await t.query(internal.memory.inspect, { ownerId: owner })).payloads).toBe(0);
  });

  it("rejects expired reviews and stale conversation/quote bases", async () => {
    const t = setup(), run = await claim(t), proposed = await propose(t, run, quotePacket());
    await t.run(async (ctx) => { const form = await ctx.db.get((await ctx.db.get(run.conversationId))!.pendingFormId!); await ctx.db.patch(form!._id, { authorization: { ...form!.authorization!, expiresAt: Date.now() - 1 } }); });
    await expect(resolve(t, run, proposed)).rejects.toThrow(/expired/i);

    const current = { quoteId: quote.id, revision: 0, digest: await authorityDigest(quoteCore(quote)) };
    const changed = structuredClone(quote); changed.revision = 1; changed.lines[0]!.amount = "200";
    const updatePacket: AuthorityPacket = { version: 1, operations: [{ id: "00000000-0000-4000-8000-000000000003", kind: "quote", quote: changed, before: current, previous: quote }] };
    const updateRun = await claim(t), update = await propose(t, updateRun, updatePacket);
    await t.run(async (ctx) => { await ctx.db.patch(updateRun.conversationId, { quoteApprovals: [{ ...current, digest: "f".repeat(64) }] }); });
    await expect(resolve(t, updateRun, update)).rejects.toThrow(/changed|newer/i);
  });

  it.each(["expired", "corrupt-payload"] as const)("allows cancellation to release a %s authorization form without effects", async (kind) => {
    const t = setup(), run = await claim(t), proposed = await propose(t, run, memoryPacket());
    await t.run(async (ctx) => {
      const form = await ctx.db.get((await ctx.db.get(run.conversationId))!.pendingFormId!);
      await ctx.db.patch(form!._id, { authorization: kind === "expired"
        ? { ...form!.authorization!, expiresAt: Date.now() - 1 }
        : { ...form!.authorization!, payload: "not-json" } });
    });
    const result = await resolve(t, run, proposed, { cancelled: true });
    expect(result).toMatchObject({ authorizationDeclined: true });
    expect(result.authorizationExecution).toBeUndefined();
    expect((await t.query(internal.memory.inspect, { ownerId: owner })).payloads).toBe(0);
  });

  it.each(["epoch", "prior-hash"] as const)("rejects stale memory %s", async (kind) => {
    const t = setup();
    await t.mutation(internal.memory.open, { ownerId: owner });
    const run = await claim(t), proposed = await propose(t, run, memoryPacket());
    await t.run(async (ctx) => {
      const ns = (await ctx.db.query("memoryNamespaces").withIndex("by_owner", (q) => q.eq("ownerId", owner)).unique())!;
      if (kind === "epoch") await ctx.db.patch(ns._id, { epoch: 1 });
      if (kind === "prior-hash") await ctx.db.patch(ns._id, { factIndex: [{ key: "preferred_port", hash: "a".repeat(64), sources: [] }] });
    });
    await expect(resolve(t, run, proposed)).rejects.toThrow(/memory|prior/i);
  });

  it("commits memory queue admission atomically and replays approval without duplication", async () => {
    const t = setup(), run = await claim(t), proposed = await propose(t, run, memoryPacket());
    const requestId = "stable-approval-resolution";
    const first = await resolve(t, run, proposed, { requestId });
    expect(first.authorizationExecution).toBe(true);
    expect((await t.query(internal.memory.inspect, { ownerId: owner })).payloads).toBe(1);
    const replay = await resolve(t, run, proposed, { requestId });
    expect(replay).toMatchObject({ replayed: true, runId: first.runId, authorizationExecution: true });
    expect((await t.query(internal.memory.inspect, { ownerId: owner })).payloads).toBe(1);
    await t.mutation(internal.migration.cancelRun, { ownerId: owner, runId: first.runId });
    expect((await resolve(t, run, proposed, { requestId })).authorizationExecution).toBeUndefined();
    expect((await t.query(internal.memory.inspect, { ownerId: owner })).payloads).toBe(1);
  });

  it("binds a private forget by hash without copying the forgotten value into review/history", async () => {
    const t = setup(), secret = "PRIVATE-VALUE-DO-NOT-REPEAT", hash = await authorityDigest(secret);
    await t.mutation(internal.memory.open, { ownerId: owner });
    await t.run(async (ctx) => {
      const ns = (await ctx.db.query("memoryNamespaces").withIndex("by_owner", (q) => q.eq("ownerId", owner)).unique())!;
      await ctx.db.patch(ns._id, { factIndex: [{ key: "private_fact", hash, sources: ["old-chat"] }] });
    });
    const packet: AuthorityPacket = { version: 1, operations: [{ id: "00000000-0000-4000-8000-000000000004", kind: "forget", key: "private_fact", previousValue: null, previousValueHash: hash, memoryEpoch: 0, memoryRevision: 0 }] };
    const run = await claim(t), proposed = await propose(t, run, packet);
    expect(proposed.form.description).not.toContain(secret);
    expect(proposed.form.description).not.toContain(hash);
    expect(proposed.form.description).toContain("chat history remains");
    const approved = await resolve(t, run, proposed);
    expect(approved.authorizationExecution).toBe(true);
    expect(await t.query(internal.memory.inspect, { ownerId: owner })).toMatchObject({ epoch: 1, payloads: 1 });
    await expect(t.query(internal.migration.getRunContext, { ownerId: owner, runId: approved.runId, fence: approved.fence })).resolves.toMatchObject({ authorization: { payload: proposed.payload } });
  });

  it("records only the exact approved comparison digest", async () => {
    const t = setup();
    const left = { quoteId: "left", revision: 0, digest: "a".repeat(64) };
    const right = { quoteId: "right", revision: 2, digest: "b".repeat(64) };
    const run = await claim(t);
    await t.run(async (ctx) => ctx.db.patch(run.conversationId, { quoteApprovals: [left, right] }));
    const operation = { id: "00000000-0000-4000-8000-000000000005", kind: "comparison" as const, input: { currency: "USD", rounding: null }, quotes: [{ ...left, name: "Left" }, { ...right, name: "Right" }] };
    const packet: AuthorityPacket = { version: 1, operations: [operation] };
    const proposed = await propose(t, run, packet), approved = await resolve(t, run, proposed);
    await t.mutation(internal.migration.completeRun, { ownerId: owner, runId: approved.runId, fence: approved.fence, responseMessages: [
      {role:"assistant",content:[{type:"tool-call",toolName:"compare_quotes",toolCallId:"comparison",input:operation.input}]},
      {role:"tool",content:[{type:"tool-result",toolName:"compare_quotes",toolCallId:"comparison",output:{type:"json",value:{record:{version:1,kind:"portia-comparison",conversationId:run.conversationId,...comparisonCore(operation)}}}}]},
      { role: "assistant", content: "Compared the approved revisions." }], form: null, finishReason: "stop" });
    const saved = await t.run(async (ctx) => ctx.db.get(run.conversationId));
    expect(saved?.comparisonApprovals).toEqual([await authorityDigest({ input: operation.input, quotes: [left, right] })]);
  });

  it("blocks agent-originated remember/forget but retains explicit no-run panel forget/clear", async () => {
    const t = setup(), run = await claim(t);
    await expect(t.mutation(internal.memory.enqueue, { ownerId: owner, runId: run.runId, runFence: run.fence, requestId: "direct-remember", expectedEpoch: 0, operation: { kind: "remember", key: "port", value: "Mumbai", source: run.conversationId } })).rejects.toThrow("APPROVAL_REQUIRED");
    await expect(t.mutation(internal.memory.enqueue, { ownerId: owner, runId: run.runId, runFence: run.fence, requestId: "direct-forget", expectedEpoch: 0, operation: { kind: "forget", key: "port" } })).rejects.toThrow("APPROVAL_REQUIRED");
    await expect(t.mutation(internal.memory.enqueue, { ownerId: owner, runId:run.runId,runFence:run.fence,requestId:"agent-clear",expectedEpoch:0,operation:{kind:"clear"} })).rejects.toThrow("APPROVAL_REQUIRED");
    await expect(t.mutation(internal.memory.enqueue, { ownerId: owner, requestId: "panel-forget", expectedEpoch: 0, operation: { kind: "forget", key: "port" } })).resolves.toMatchObject({ epoch: 1 });
    await expect(t.mutation(internal.memory.enqueue, { ownerId: owner, requestId: "panel-clear", expectedEpoch: 1, operation: { kind: "clear" } })).resolves.toMatchObject({ epoch: 2 });
  });

  it("rejects supplied-price receipt bypasses at checkpoint and ordinary completion", async () => {
    const t = setup(), first = await claim(t), messages = await receiptMessages(first.conversationId);
    await expect(t.mutation(internal.migration.checkpointRun, { ownerId: owner, runId: first.runId, fence: first.fence, stepNumber: 0, payloadHash: "forged-checkpoint", responseMessages: messages.slice(0, 2), finishReason: "tool-calls" })).rejects.toThrow(/approval/i);
    const second = await claim(t);
    await expect(t.mutation(internal.migration.completeRun, { ownerId: owner, runId: second.runId, fence: second.fence, responseMessages: messages, form: null, finishReason: "stop" })).rejects.toThrow(/approval/i);
  });

  it.each(["swapped-quote", "wrong-revision", "bad-hash"] as const)("rejects authorized completion receipt: %s", async (kind) => {
    const t = setup(), run = await claim(t), proposed = await propose(t, run, quotePacket()), approved = await resolve(t, run, proposed);
    const candidate = structuredClone(quote);
    if (kind === "swapped-quote") candidate.lines[0]!.amount = "999";
    const messages = await receiptMessages(run.conversationId, candidate, kind === "wrong-revision" ? 0 : -1, kind === "bad-hash" ? "0".repeat(64) : undefined);
    await expect(t.mutation(internal.migration.completeRun, { ownerId: owner, runId: approved.runId, fence: approved.fence, responseMessages: messages, form: null, finishReason: "stop" })).rejects.toThrow(/receipt|approved|differs/i);
  });

  it("cannot persist an approved quote twice through checkpoint plus completion", async () => {
    const t=setup(),run=await claim(t),proposed=await propose(t,run,quotePacket()),approved=await resolve(t,run,proposed);
    const messages=await receiptMessages(run.conversationId);
    await expect(t.mutation(internal.migration.checkpointRun,{ownerId:owner,runId:approved.runId,fence:approved.fence,stepNumber:0,payloadHash:"approved-checkpoint",responseMessages:messages.slice(0,2),finishReason:"tool-calls"})).rejects.toThrow(/atomic/i);
    await expect(t.mutation(internal.migration.completeRun,{ownerId:owner,runId:approved.runId,fence:approved.fence,responseMessages:messages,form:null,finishReason:"stop"})).resolves.toMatchObject({state:"idle"});
  });

  it("cannot mark an approved comparison executed using plain prose",async()=>{
    const t=setup(),run=await claim(t);
    await t.run(async ctx=>ctx.db.patch(run.conversationId,{quoteApprovals:[{quoteId:"a",revision:0,digest:"a".repeat(64)},{quoteId:"b",revision:0,digest:"b".repeat(64)}]}));
    const packet:AuthorityPacket={version:1,operations:[{id:crypto.randomUUID(),kind:"comparison",input:{quoteIds:["a","b"],currency:"USD"},quotes:[{quoteId:"a",revision:0,digest:"a".repeat(64),name:"A"},{quoteId:"b",revision:0,digest:"b".repeat(64),name:"B"}]}]};
    const proposed=await propose(t,run,packet),approved=await resolve(t,run,proposed);
    await expect(t.mutation(internal.migration.completeRun,{ownerId:owner,runId:approved.runId,fence:approved.fence,responseMessages:[{role:"assistant",content:"Compared successfully."}],form:null,finishReason:"stop"})).rejects.toThrow(/comparison.*receipt/i);
    expect((await t.run(ctx=>ctx.db.get(run.conversationId)))?.comparisonApprovals??[]).toEqual([]);
  });

  it.each(["quote","remember"] as const)("deleting an active approved %s revokes execution; accepted memory is purged",async(kind)=>{
    const t=setup(),a=await account(t,`delete-${kind}@example.com`),run=await claim(t,crypto.randomUUID(),null,null,a.ownerId);
    const packet=kind==="quote"?quotePacket():memoryPacket(),form=approvalForm(packet,"active-grant"),{toolCallId,...input}=form;
    const waiting=await t.mutation(internal.migration.completeRun,{ownerId:a.ownerId,runId:run.runId,fence:run.fence,responseMessages:[{role:"assistant",content:[{type:"tool-call",toolName:"ask_user_input",toolCallId,input}]}],form,authorizationProposal:canonical(packet)});
    const accepted=await t.mutation(internal.migration.resolveFormAndClaim,{ownerId:a.ownerId,conversationId:run.conversationId,requestId:"approved",payloadHash:"approved",toolCallId,values:{decision:APPROVE},cancelled:false,note:"",modelAlias:"model-1",expectedRevision:waiting.revision});
    expect(accepted.authorizationExecution).toBe(true);
    await a.client.mutation(api.migration.deleteConversation,{conversationId:run.conversationId});
    await expect(t.query(internal.migration.getRunContext,{ownerId:a.ownerId,runId:accepted.runId,fence:accepted.fence})).rejects.toThrow();
    await expect(t.mutation(internal.migration.completeRun,{ownerId:a.ownerId,runId:accepted.runId,fence:accepted.fence,responseMessages:await receiptMessages(run.conversationId),form:null,finishReason:"stop"})).rejects.toThrow();
    expect((await t.run(ctx=>ctx.db.get(accepted.runId)))?.authorization).toBeUndefined();
    if(kind==="remember"){
      const job=(await t.mutation(internal.memory.claim,{ownerId:a.ownerId}))!;
      expect(job.operations.map(op=>op.kind)).toEqual(["remember","delete_source"]);
      const runtime=await ChatMemoryRuntime.restore(job.image);await runtime.apply(job.operations);
      await t.mutation(internal.memory.publish,{ownerId:a.ownerId,token:job.token,fence:job.fence,epoch:job.epoch,baseRevision:job.baseRevision,through:job.through,image:await runtime.snapshot()});
      const view=await t.mutation(internal.memory.open,{ownerId:a.ownerId});expect(await(await ChatMemoryRuntime.restore(view.image)).facts()).toEqual([]);
    }
  });

  it("deletion revokes pending forms and active grants inline", async () => {
    const t = setup(), a = await account(t, "delete@example.com");
    const first = await claim(t, crypto.randomUUID(), null, null, a.ownerId);
    const packet = quotePacket(), payload = canonical(packet), form = approvalForm(packet, "delete-pending"), { toolCallId, ...input } = form;
    await t.mutation(internal.migration.completeRun, { ownerId: a.ownerId, runId: first.runId, fence: first.fence, responseMessages: [{ role: "assistant", content: [{ type: "tool-call", toolName: "ask_user_input", toolCallId, input }] }], form, authorizationProposal: payload });
    const pendingFormId = await t.run(async (ctx) => (await ctx.db.get(first.conversationId))!.pendingFormId!);
    await a.client.mutation(api.migration.deleteConversation, { conversationId: first.conversationId });
    expect(await t.run(async (ctx) => ctx.db.get(pendingFormId))).toBeNull();
    const waiting = await t.run(async (ctx) => ctx.db.get(first.runId));
    expect(waiting).toMatchObject({ status: "cancelled" });
    expect(waiting?.authorization).toBeUndefined();
  });
});
