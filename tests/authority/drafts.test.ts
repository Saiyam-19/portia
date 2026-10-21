/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import betterAuthTest from "@convex-dev/better-auth/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ModelMessage } from "ai";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { validateQuoteReceipts } from "../../convex/lib/authority";
import { AuthoritySession } from "../../src/lib/authority/session";
import { APPROVE, authorityDigest, canonical, parsePacket } from "../../src/lib/authority/contract";
import { executeAuthorizedOperations } from "../../src/lib/authority/execute";
import { QuoteSession } from "../../src/lib/portia/session";
import { replayQuoteDrafts } from "../../src/lib/portia/quote-drafts";
import type { Id } from "../../convex/_generated/dataModel";

const modules = import.meta.glob("../../convex/**/*.ts");
beforeEach(() => { for (const [key, value] of Object.entries({ PORTIA_ENABLED: "true", PORTIA_CONVEX_DEPLOYMENT: "brilliant-whale-380", CONVEX_SITE_URL: "https://brilliant-whale-380.convex.site", PORTIA_AUTH_MODE: "basic", PORTIA_MEMORY_ENABLED: "true" })) vi.stubEnv(key, value); });
afterEach(() => vi.unstubAllEnvs());
const messages = (input: object, output: unknown, id = "quote") => [
  { role: "assistant" as const, content: [{ type: "tool-call" as const, toolName: "manage_quote", toolCallId: id, input }] },
  { role: "tool" as const, content: [{ type: "tool-result" as const, toolName: "manage_quote", toolCallId: id, output: { type: "json" as const, value: JSON.parse(JSON.stringify(output)) } }] },
] satisfies ModelMessage[];
const input = { action: "create" as const, pricing: "supplied" as const, lines: [{ name: "berth", currency: "USD" as const, billing: { kind: "time" as const, price: "29", periodHours: "4", commenced: true } }] };

it("persists a draft checkpoint once, reloads, continues, approves and promotes without provider calls", async () => {
  const t = convexTest(schema, modules); agentTest.register(t); betterAuthTest.register(t);
  const ownerId = "draft-owner";
  const first = await t.mutation(internal.migration.claimQuestion, { ownerId, conversationId: null, requestId: "draft-first", payloadHash: "draft-first", question: "Supplied berth USD 29 per commenced four-hour period. Duration to follow.", modelAlias: "model-1", expectedRevision: null });
  const session = new QuoteSession(first.conversationId); session.bindAuthority(new AuthoritySession()); await session.initialize([]);
  const draft = await session.executeCommand(input); if (!("quoteId" in draft)) throw Error("missing draft");
  const checkpoint = { ownerId, runId: first.runId, fence: first.fence, stepNumber: 0, payloadHash: "draft-checkpoint", responseMessages: messages(input, draft), finishReason: "tool-calls" as const };
  expect(await t.mutation(internal.migration.checkpointRun, checkpoint)).toMatchObject({ replayed: false });
  expect(await t.mutation(internal.migration.checkpointRun, checkpoint)).toMatchObject({ replayed: true });
  const completed = await t.mutation(internal.migration.completeRun, { ownerId, runId: first.runId, fence: first.fence, responseMessages: [{ role: "assistant", content: "Draft retained; please provide occupancy." }], form: null, finishReason: "stop" });
  const second = await t.mutation(internal.migration.claimQuestion, { ownerId, conversationId: first.conversationId, requestId: "draft-second", payloadHash: "draft-second", question: "Nine hours.", modelAlias: "model-1", expectedRevision: completed.revision });
  const context = await t.query(internal.migration.getRunContext, { ownerId, runId: second.runId, fence: second.fence });
  const restored = new QuoteSession(first.conversationId), authority = new AuthoritySession(context.authorityContext); restored.bindAuthority(authority); await restored.initialize(context.messages as ModelMessage[]);
  const patch = { action: "update" as const, quoteId: draft.quoteId, call: { occupancy: { hours: "9" } } };
  const proposed = await restored.executeCommand(patch); expect(proposed).toHaveProperty("approvalRequired", true);
  await t.mutation(internal.migration.checkpointRun, { ownerId, runId: second.runId, fence: second.fence, stepNumber: 0, payloadHash: "completed-draft", responseMessages: messages(patch, proposed, "continued"), finishReason: "tool-calls" });
  const pending = authority.pending()!, { toolCallId, ...formInput } = pending.form;
  const waiting = await t.mutation(internal.migration.completeRun, { ownerId, runId: second.runId, fence: second.fence, responseMessages: [{ role: "assistant", content: [{ type: "tool-call", toolName: "ask_user_input", toolCallId, input: formInput }] }], form: pending.form, authorizationProposal: pending.payload });
  const accepted = await t.mutation(internal.migration.resolveFormAndClaim, { ownerId, conversationId: first.conversationId, requestId: "draft-approve", payloadHash: "draft-approve", toolCallId, values: { decision: APPROVE }, cancelled: false, note: "", expectedRevision: waiting.revision, modelAlias: "model-1" });
  const granted = await t.query(internal.migration.getRunContext, { ownerId, runId: accepted.runId, fence: accepted.fence });
  const approved = new QuoteSession(first.conversationId); approved.bindAuthority(new AuthoritySession(granted.authorityContext)); await approved.initialize(granted.messages as ModelMessage[]);
  const result = await executeAuthorizedOperations({ authorization: granted.authorization!, session: approved, signal: new AbortController().signal });
  expect(result.text).toContain("USD 87.00"); expect(JSON.parse(approved.context()).drafts).toEqual([]);
  await t.mutation(internal.migration.completeRun, { ownerId, runId: accepted.runId, fence: accepted.fence, responseMessages: JSON.parse(JSON.stringify(result.messages)), form: null, finishReason: "stop" });
  expect(approved.quotes.get(draft.quoteId)?.revision).toBe(0);
});

it("rejects tampered, foreign, repeated and forbidden-claim draft envelopes", async () => {
  const session = new QuoteSession("draft-guard"); session.bindAuthority(new AuthoritySession()); await session.initialize([]);
  const output = await session.executeCommand(input); if (!("draft" in output)) throw Error("missing draft");
  const original = messages(input, output);
  await expect(validateQuoteReceipts(original, "draft-guard" as Id<"migrationConversations">)).resolves.toBeUndefined();
  await expect(validateQuoteReceipts(original, "different" as Id<"migrationConversations">)).rejects.toThrow();
  await expect(validateQuoteReceipts(original, "draft-guard" as Id<"migrationConversations">, undefined, false, original)).rejects.toThrow();
  for (const patch of [
    { quote: { ...output.draft.quote, name: "tampered" } },
    { quote: { ...output.draft.quote, baseline: { totals: [] } } },
    { draftRevision: 3 },
    { base: { quoteId: output.quoteId, revision: 0, digest: "0".repeat(64) } },
  ]) {
    const draft = { ...output.draft, ...patch };
    await expect(validateQuoteReceipts(messages(input, { ...output, draft }), "draft-guard" as Id<"migrationConversations">)).rejects.toThrow();
  }
  const unsigned = { ...output.draft }; delete (unsigned as Partial<typeof unsigned>).hash;
  const forged = { ...unsigned, draftRevision: 8, beforeDraftRevision: 7 };
  await expect(replayQuoteDrafts(messages(input, { draft: { ...forged, hash: await authorityDigest(forged) } }), "draft-guard")).rejects.toThrow();
});

it("an incomplete correction leaves the approved quote unchanged and binds promotion to that saved base", async () => {
  const session = new QuoteSession("draft-correction"), authority = new AuthoritySession(); session.bindAuthority(authority); await session.initialize([]);
  await session.executeCommand({ action: "create", pricing: "supplied", lines: [{ name: "berth", currency: "USD", billing: { kind: "flat", price: "71", basis: "user-stated-flat" } }] });
  const firstOp = parsePacket(authority.pending()!.payload).operations[0]; if (firstOp.kind !== "quote") throw Error("wrong op");
  const first = await session.applyApprovedQuote(firstOp); const saved = canonical(session.quotes.get(first.quoteId));
  const nextAuthority = new AuthoritySession(authority.context); session.bindAuthority(nextAuthority); session.beginStep();
  const incomplete = await session.executeCommand({ action: "update", quoteId: first.quoteId, lines: [{ name: "berth", billing: { kind: "time", price: "11", periodHours: "3", commenced: true } }] });
  expect(incomplete).toHaveProperty("draft"); expect(nextAuthority.hasPending()).toBe(false); expect(canonical(session.quotes.get(first.quoteId))).toBe(saved);
  const reload = new QuoteSession("draft-correction"); reload.bindAuthority(nextAuthority); await reload.initialize([...messages({}, first), ...messages({}, incomplete)]);
  const continued = await reload.executeCommand({ action: "update", quoteId: first.quoteId, call: { occupancy: { hours: "7" } } });
  expect(continued).toHaveProperty("approvalRequired", true);
  const op = parsePacket(nextAuthority.pending()!.payload).operations[0]; if (op.kind !== "quote") throw Error("wrong op");
  expect(op.before?.revision).toBe(0); expect(op.quote.revision).toBe(1); expect(op.preview?.totals[0].amount).toBe("33");
  expect(canonical(reload.quotes.get(first.quoteId))).toBe(saved);
});

it("aborted draft continuation cannot publish or change staged state", async () => {
  const session = new QuoteSession("draft-abort"); session.bindAuthority(new AuthoritySession()); await session.initialize([]);
  const draft = await session.executeCommand(input); if (!("quoteId" in draft)) throw Error("missing draft");
  const before = session.context(), signal = AbortSignal.abort(); session.beginStep();
  await expect(session.executeCommand({ action: "update", quoteId: draft.quoteId, call: { occupancy: { hours: "5" } } }, signal)).rejects.toThrow();
  expect(session.context()).toBe(before);
});

it("later corrections through drafts retain the original approved comparison baseline", async () => {
  const session = new QuoteSession("draft-baseline"); let authority = new AuthoritySession(); session.bindAuthority(authority); await session.initialize([]);
  const approve = async () => {
    const op = parsePacket(authority.pending()!.payload).operations[0]; if (op.kind !== "quote") throw Error("wrong op");
    const saved = await session.applyApprovedQuote(op);
    authority = new AuthoritySession(authority.context); session.bindAuthority(authority); session.beginStep(); return saved;
  };
  await session.executeCommand({ action: "create", pricing: "supplied", lines: [{ name: "berth", currency: "USD", billing: { kind: "flat", price: "71", basis: "user-stated-flat" } }] });
  const first = await approve();
  await session.executeCommand({ action: "update", quoteId: first.quoteId, lines: [{ name: "berth", price: "33" }] });
  const second = await approve();
  const pending = await session.executeCommand({ action: "update", quoteId: first.quoteId, lines: [{ name: "berth", billing: { kind: "time", price: "11", periodHours: "2", commenced: true } }] });
  const reload = new QuoteSession("draft-baseline"); reload.bindAuthority(authority); await reload.initialize([...messages({}, first), ...messages({}, second), ...messages({}, pending)]);
  await reload.executeCommand({ action: "update", quoteId: first.quoteId, call: { occupancy: { hours: "9" } } });
  const finalOp = parsePacket(authority.pending()!.payload).operations[0]; if (finalOp.kind !== "quote") throw Error("wrong op");
  expect(finalOp.quote.baseline?.totals?.[0].amount).toBe("71"); expect(finalOp.quote.baseline?.lines[0].amount).toBe("71");
  const result = await reload.applyApprovedQuote(finalOp); expect(result.body).toContain("USD 16.00"); expect(result.totals?.[0].amount).toBe("55");
});

it("allocates distinct draft labels and does not advance an unpersistable proposal", async () => {
  const session = new QuoteSession("draft-atomic"), authority = new AuthoritySession(); session.bindAuthority(authority); await session.initialize([]);
  const first = await session.executeCommand(input), second = await session.executeCommand(input);
  if (!("draft" in first) || !("draft" in second)) throw Error("missing drafts");
  expect(first.draft.quote.name).not.toBe(second.draft.quote.name);
  session.beginStep(); const before = session.context();
  const reject = vi.spyOn(authority, "propose").mockImplementationOnce(() => { throw Error("review preparation failed"); });
  await expect(session.executeCommand({ action: "update", quoteId: first.quoteId, call: { occupancy: { hours: "3" } } })).rejects.toThrow("review preparation failed");
  expect(session.context()).toBe(before); reject.mockRestore();
  const retried = await session.executeCommand({ action: "update", quoteId: first.quoteId, call: { occupancy: { hours: "3" } } });
  expect(retried).toHaveProperty("approvalRequired", true);
  if (!("draft" in retried)) throw Error("missing draft");
  expect(retried.draft.beforeDraftRevision).toBe(first.draft.draftRevision);
  await expect(replayQuoteDrafts([...messages({}, first), ...messages({}, second), ...messages({}, retried)], "draft-atomic")).resolves.toBeInstanceOf(Map);
});

it.each([false, true])("removing supplied FX promotes an official draft without skipping a saved revision (saved base=%s)", async withBase => {
  const session = new QuoteSession("draft-fx"), authority = new AuthoritySession(); session.bindAuthority(authority); await session.initialize([]);
  const official = { action: "create" as const, pricing: "official" as const, services: ["berth" as const], call: { port: "GTI", gt: "14231", occupancy: { hours: "5" }, service: "foreign" as const, callDate: "14 November 2026" } };
  const original = withBase ? await session.executeCommand(official) : undefined;
  session.beginStep();
  const draft = original && "quoteId" in original
    ? await session.executeCommand({ action: "update", quoteId: original.quoteId, call: { fxInrPerUsd: "83" } })
    : await session.executeCommand({ ...official, call: { ...official.call, fxInrPerUsd: "83" } });
  if (!("draft" in draft)) throw Error("missing draft");
  const records = [...(original ? messages({}, original) : []), ...messages({}, draft)];
  const reload = new QuoteSession("draft-fx"); reload.bindAuthority(new AuthoritySession());
  await reload.initialize([...records, { role: "user", content: "Remove the supplied FX rate; retain the USD component." }]);
  const promoted = await reload.executeCommand({ action: "update", quoteId: draft.quoteId, clearCallFields: ["fxInrPerUsd"], scopeChangeEvidence: "Remove the supplied FX rate; retain the USD component." });
  expect(promoted).not.toHaveProperty("approvalRequired"); expect(promoted).toHaveProperty("record");
  if (!("record" in promoted) || !promoted.record) throw Error("missing saved record");
  expect(promoted.record.beforeRevision).toBe(withBase ? 0 : -1); expect(promoted.record.quote.revision).toBe(withBase ? 1 : 0);
  const final = new QuoteSession("draft-fx"); await final.initialize([...records, ...messages({}, promoted)]);
  expect(final.quotes.get(draft.quoteId)?.call.fxInrPerUsd).toBeUndefined(); expect(final.quotes.size).toBe(1); expect(JSON.parse(final.context()).drafts).toEqual([]);
});

it("drafts invalidate earlier comparison output and block parallel stale comparisons", async () => {
  const session = new QuoteSession("draft-comparison"); await session.initialize([]);
  const a = await session.update({ pricing: "supplied", lines: [{ name: "berth", currency: "USD", amount: "41" }] });
  const b = await session.update({ pricing: "supplied", lines: [{ name: "berth", currency: "USD", amount: "51" }] });
  if (!("quoteId" in a) || !("quoteId" in b)) throw Error("missing quotes");
  const authority = new AuthoritySession({ quotes: [...session.quotes.values()].map(quote => AuthoritySession.binding(quote)), comparisons: [] }); session.bindAuthority(authority); session.beginStep();
  const comparison = { quoteIds: [a.quoteId, b.quoteId], currency: "USD" as const };
  expect((await session.compare(comparison)).status).toBe("calculated");
  const [, retried] = await Promise.all([
    session.executeCommand({ action: "update", quoteId: a.quoteId, lines: [{ name: "berth", billing: { kind: "time", price: "7", periodHours: "3", commenced: true } }] }),
    session.compare(comparison),
  ]);
  expect(retried.status).toBe("unresolved");
  expect(retried.questions.join(" ")).toMatch(/occupancy|duration|timestamp/i);
  expect(retried).not.toHaveProperty("converted");
  expect(session.finalText("")).not.toContain("has the lower total");
  const unknown = await session.compare({ quoteIds: [a.quoteId, "never-saved"], currency: "USD" });
  expect(unknown.status).toBe("error");
  expect(unknown).toHaveProperty("repairKind", "unknown_quotation_target");
  expect(unknown).not.toHaveProperty("converted");
});
