import { expect, it, vi } from "vitest";
import type { ModelMessage } from "ai";
import { AuthoritySession } from "../../src/lib/authority/session";
import { canonical, parsePacket, type AuthorityContext, type AuthorityOperation } from "../../src/lib/authority/contract";
import { executeAuthorizedOperations } from "../../src/lib/authority/execute";
import { QuoteSession } from "../../src/lib/portia/session";
import { quoteCommandSchema, type CommandLine, type LineField, type QuoteCommand } from "../../src/lib/portia/quotes";
import { suppliedQuoteSchema } from "../../src/lib/portia/agent-inputs";
import { recordDecisionEvidence } from "../../src/lib/portia/decision-evidence";
import { replayQuoteDrafts } from "../../src/lib/portia/quote-drafts";

// Domain/executor contract tests only: no language model, network or capability scoring.
const receipt = (input: object, output: unknown, id: string): ModelMessage[] => [
  { role: "assistant", content: [{ type: "tool-call", toolName: "supplied_quote", toolCallId: id, input }] },
  { role: "tool", content: [{ type: "tool-result", toolName: "supplied_quote", toolCallId: id, output: { type: "json", value: JSON.parse(JSON.stringify(output)) } }] },
];
const flat = (name: string, price: string): CommandLine => ({ name, currency: "USD", billing: { kind: "flat", price, basis: "user-stated-flat" } });
function idOf(result: unknown): string {
  if (!result || typeof result !== "object" || !("quoteId" in result) || typeof result.quoteId !== "string") throw Error("Expected quote identity");
  return result.quoteId;
}
function errorOf(result: unknown): string {
  if (!result || typeof result !== "object" || !("errorId" in result) || typeof result.errorId !== "string") throw Error("Expected actual rejected operation");
  return result.errorId;
}
async function run(conversationId: string, history: ModelMessage[] = [], context?: AuthorityContext, human = "") {
  const authority = new AuthoritySession(context ? structuredClone(context) : undefined);
  const session = new QuoteSession(conversationId); session.bindAuthority(authority);
  await session.initialize([...history, ...(human ? [{ role: "user" as const, content: human }] : [])]);
  return { session, authority };
}
async function approve(current: Awaited<ReturnType<typeof run>>) {
  const pending = current.authority.pending();
  if (!pending) throw Error("Expected exact pending operation");
  return executeAuthorizedOperations({
    authorization: { payload: pending.payload, expiresAt: Date.now() + 60_000 },
    session: current.session, signal: new AbortController().signal,
  });
}
async function seeded(conversationId: string, lines: CommandLine[], call?: QuoteCommand["call"]) {
  const current = await run(conversationId);
  const command: QuoteCommand = { action: "create", pricing: "supplied", lines, ...(call ? { call } : {}) };
  const prepared = await current.session.executeCommand(command);
  const executed = await approve(current);
  return { quoteId: idOf(prepared), history: [...receipt(command, prepared, "seed"), ...executed.messages], context: structuredClone(current.authority.context) };
}

const withdrawals: Array<{ field: LineField; initial: CommandLine; restore: CommandLine; original: string; final: string; call?: QuoteCommand["call"] }> = [
  { field: "price", initial: { name: "unit charge", currency: "USD", billing: { kind: "quantity", price: "9", quantity: "2", quantityLabel: "items", perQuantity: "3" } }, restore: { name: "unit charge", price: "0" }, original: "11", final: "5" },
  { field: "perQuantity", initial: { name: "unit charge", currency: "USD", billing: { kind: "quantity", price: "9", quantity: "2", quantityLabel: "items", perQuantity: "3" } }, restore: { name: "unit charge", billing: { kind: "quantity", quantityLabel: "items", perQuantity: "3" } }, original: "11", final: "11" },
  { field: "duration", initial: { name: "unit charge", currency: "USD", billing: { kind: "time", price: "9", periodHours: "1", commenced: false, duration: { hours: "2" } } }, restore: { name: "unit charge", billing: { kind: "time", duration: { hours: "0" } } }, call: { occupancy: { hours: "8" } }, original: "23", final: "5" },
];

it.each(withdrawals)("withdraws $field without default fallback, reloads it, then resolves through exact approval", async item => {
  const conversationId = `withdraw-${item.field}`;
  const seed = await seeded(conversationId, [item.initial, flat("retained fee", "5")], item.call);
  const human = `The unit charge ${item.field} is now unknown. Retain every other fact.`;
  const current = await run(conversationId, seed.history, seed.context, human);
  const before = canonical(current.session.quotes.get(seed.quoteId));
  const clear = quoteCommandSchema.parse({ action: "update", quoteId: seed.quoteId, lines: [{ name: "unit charge", clearFields: [item.field] }], scopeChangeEvidence: human });
  const draft = await current.session.executeCommand(clear);
  expect(draft).toMatchObject({ status: "unresolved", draft: { quote: { lines: [expect.objectContaining({ unresolvedFields: [item.field] }), expect.objectContaining({ amount: "5" })] } } });
  expect(draft).not.toHaveProperty("approvalRequired");
  expect(draft.body).toContain("USD 5.00");
  expect(draft.questions.join(" ")).toContain(item.field);
  expect(current.authority.hasPending()).toBe(false);
  expect(canonical(current.session.quotes.get(seed.quoteId))).toBe(before);

  const history = [...seed.history, { role: "user" as const, content: human }, ...receipt(clear, draft, "withdraw")];
  const restored = await run(conversationId, history, seed.context, "Use the explicitly supplied replacement value; retain the other fee.");
  const read = await restored.session.executeCommand({ action: "read", readScope: "current-chat", quoteId: seed.quoteId });
  expect(read.body).toContain("explicitly withdrawn");
  expect(read.body).toContain(`USD ${Number(item.original).toFixed(2)}`);
  const proposed = await restored.session.executeCommand({ action: "update", quoteId: seed.quoteId, lines: [item.restore] });
  expect(proposed).toHaveProperty("approvalRequired", true);
  const packet = parsePacket(restored.authority.pending()!.payload), operation = packet.operations[0];
  if (operation.kind !== "quote") throw Error("Expected quote replacement");
  expect(operation.before?.revision).toBe(0);
  expect(operation.quote.lines[0]).not.toHaveProperty("unresolvedFields");
  expect(operation.quote.lines[1]).toMatchObject({ name: "retained fee", amount: "5" });
  expect(operation.preview?.totals).toEqual([{ currency: "USD", amount: item.final }]);
  const executed = await approve(restored);
  expect(executed.text).toContain(`USD ${Number(item.final).toFixed(2)}`);
  expect(restored.session.quotes.get(seed.quoteId)?.revision).toBe(1);
  expect(restored.session.quotes.get(seed.quoteId)?.baseline?.totals?.[0].amount).toBe(item.original);
});

it("does not expose unresolved markers or accept contradictory set-and-clear patches", () => {
  expect(suppliedQuoteSchema.safeParse({ action: "update", quoteId: "saved", lines: [{ name: "fee", unresolvedFields: ["price"] }] }).success).toBe(false);
  expect(quoteCommandSchema.safeParse({ action: "update", quoteId: "saved", lines: [{ name: "fee", price: "0", clearFields: ["price"] }], scopeChangeEvidence: "Withdraw price" }).success).toBe(false);
  expect(quoteCommandSchema.safeParse({ action: "update", quoteId: "saved", lines: [{ name: "fee", clearFields: ["price"] }] }).success).toBe(false);
});

it("publishes independent reporting views without changing the saved quotation", async () => {
  const conversationId = "report-views", seed = await seeded(conversationId, [flat("one", "1.005"), flat("two", "1.005")]);
  const current = await run(conversationId, seed.history, seed.context);
  const before = current.session.context();
  const outcomes = [];
  for (const stage of ["line", "total"] as const) {
    const reporting = { stage, decimals: 2 }, input = { readScope: "current-chat" as const, quoteId: seed.quoteId, reporting };
    const output = await current.session.executeCommand({ action: "read", ...input }, undefined, `read-${stage}`);
    const evidence = recordDecisionEvidence(current.session, current.authority, "read_quotes", input, output, `read-${stage}`)!;
    outcomes.push({ id: stage, requestedOutcome: `Show the ${stage} precision report`, kind: "quotation_read" as const, targets: [seed.quoteId], reportingViews: [reporting], evidenceIds: [evidence.id] });
  }
  expect(current.session.completion.finish({ outcomes }, "finish").status).toBe("ready_for_final_check");
  expect(current.session.completion.acceptStep([{ toolCallId: "finish", toolName: "finish_turn" }])).toBe(true);
  const published = await current.session.answer("");
  expect(published).toContain("half-up per line, 2 decimal places");
  expect(published).toContain("half-up per total, 2 decimal places");
  expect(published).toContain("USD 2.02");
  expect(published).toContain("USD 2.01");
  expect(current.session.context()).toBe(before);
  expect(current.authority.hasPending()).toBe(false);
});

it.each(["correct", "unread", "changed-price"] as const)("retires only the intended unknown-ID repair (%s)", async variant => {
  const conversationId = `repair-${variant}`, seed = await seeded(conversationId, [flat("fee", "10")]);
  const current = await run(conversationId, seed.history, seed.context);
  const bad = { action: "update" as const, pricing: "supplied" as const, quoteId: "invented", lines: [{ name: "fee", price: "13" }] };
  const failed = await current.session.executeCommand(bad);
  expect(failed).toMatchObject({ status: "error", repairKind: "unknown_quotation_target" });
  current.session.observeTools([{ toolCallId: "bad", toolName: "supplied_quote", input: bad, output: failed }]);
  if (variant !== "unread") await current.session.executeCommand({ action: "read", readScope: "current-chat", quoteId: seed.quoteId });
  const fixed = { ...bad, quoteId: seed.quoteId, retryOf: errorOf(failed), lines: [{ name: "fee", price: variant === "changed-price" ? "14" : "13" }] };
  const result = await current.session.executeCommand(fixed);
  expect(result).toHaveProperty("approvalRequired", true);
  current.session.observeTools([{ toolCallId: "fixed", toolName: "supplied_quote", input: fixed, output: result }]);
  expect(current.session.hasUnresolvedToolFailure("bad")).toBe(variant !== "correct");
  expect(current.session.quotes.get(seed.quoteId)?.lines[0].amount).toBe("10");
});

it.each([false, true])("retargeting a missing comparison side preserves every valid side (change valid side=%s)", async changeValid => {
  const session = new QuoteSession(`comparison-retarget-${changeValid}`); await session.initialize([]);
  const ids: string[] = [];
  for (const price of ["10", "15", "20"]) ids.push(idOf(await session.update({ pricing: "supplied", lines: [{ name: "fee", currency: "USD", amount: price }] })));
  session.bindAuthority(new AuthoritySession({ quotes: [...session.quotes.values()].map(quote => AuthoritySession.binding(quote)), comparisons: [] }));
  const input = { quoteIds: [ids[0], "invented"], currency: "USD" as const };
  const failed = await session.compare(input, "bad");
  expect(failed).toMatchObject({ status: "error", repairKind: "unknown_quotation_target" });
  session.observeTools([{ toolCallId: "bad", toolName: "compare_quotes", input, output: failed }]);
  await session.executeCommand({ action: "read", readScope: "current-chat" });
  const fixed = { ...input, quoteIds: [ids[changeValid ? 2 : 0], ids[1]], retryOf: errorOf(failed) };
  const result = await session.compare(fixed, "fixed");
  expect(result.status).toBe("calculated");
  session.observeTools([{ toolCallId: "fixed", toolName: "compare_quotes", input: fixed, output: result }]);
  expect(session.hasUnresolvedToolFailure("bad")).toBe(changeValid);
});

it("batches five exact proposals, executes both packets and reloads every approved receipt", async () => {
  const conversationId = "batched-approvals", current = await run(conversationId), history: ModelMessage[] = [], ids: string[] = [];
  for (let index = 0; index < 5; index++) {
    const command: QuoteCommand = { action: "create", pricing: "supplied", lines: [flat("fee", String(index + 1))] };
    const prepared = await current.session.executeCommand(command);
    ids.push(idOf(prepared)); history.push(...receipt(command, prepared, `prepare-${index}`));
  }
  const queue = current.authority.pendingQueue();
  expect(queue.map(item => parsePacket(item.payload).operations.length)).toEqual([4, 1]);
  expect(new Set(queue.map(item => item.form.toolCallId)).size).toBe(2);
  for (const pending of queue) {
    const executed = await executeAuthorizedOperations({ authorization: { payload: pending.payload, expiresAt: Date.now() + 60_000 }, session: current.session, signal: new AbortController().signal });
    history.push(...executed.messages);
  }
  const reloaded = await run(conversationId, history, current.authority.context);
  expect([...reloaded.session.quotes.keys()].sort()).toEqual([...ids].sort());
  expect([...reloaded.session.quotes.values()].map(quote => quote.revision)).toEqual([0, 0, 0, 0, 0]);
  expect(JSON.parse(reloaded.session.context()).drafts).toEqual([]);
});

it("counts thirteen distinct pending quotations once and preserves packet bounds", async () => {
  const current = await run("unique-capacity"), ids = new Set<string>();
  for (let index = 0; index < 13; index++) {
    const result = await current.session.executeCommand({ action: "create", pricing: "supplied", lines: [flat("fee", "1")] });
    expect(result).toHaveProperty("approvalRequired", true);
    ids.add(idOf(result));
  }
  expect(ids.size).toBe(13);
  expect(current.authority.pendingQueue().map(item => parsePacket(item.payload).operations.length)).toEqual([4, 4, 4, 1]);
  expect(current.session.quotes.size).toBe(0);
});

it("retains a seventeenth request as an unstaged draft without changing the sixteen exact operations", async () => {
  const conversationId = "hard-review-cap", current = await run(conversationId), history: ModelMessage[] = [];
  for (let index = 0; index < 16; index++) {
    const command: QuoteCommand = { action: "create", pricing: "supplied", lines: [flat("fee", String(index + 1))] };
    const result = await current.session.executeCommand(command);
    expect(result).toHaveProperty("approvalRequired", true);
    history.push(...receipt(command, result, `staged-${index}`));
  }
  const before = canonical(current.authority.pendingQueue());
  const command: QuoteCommand = { action: "create", pricing: "supplied", lines: [flat("fee", "17")] };
  const unavailable = await current.session.executeCommand(command);
  expect(unavailable).toMatchObject({ status: "unresolved", availability: "unavailable", code: "review_capacity", approvalRequired: false, stagedForReview: false });
  expect(unavailable).toHaveProperty("draft");
  expect(unavailable).not.toHaveProperty("record");
  expect(current.authority.pendingQuote(idOf(unavailable))).toBeUndefined();
  expect(canonical(current.authority.pendingQueue())).toBe(before);
  expect(current.session.quotes.size).toBe(0);
  const replayed = await replayQuoteDrafts([...history, ...receipt(command, unavailable, "unstaged")], conversationId);
  expect(replayed.size).toBe(17);
  expect(replayed.get(idOf(unavailable))?.quote.lines[0]).toMatchObject({ amount: "17" });
});

it("treats single-review size as capacity but does not relabel structural corruption", () => {
  const authority = new AuthoritySession();
  const operation = (context: string, revision = 0): AuthorityOperation => ({
    id: crypto.randomUUID(), kind: "quote", before: null, previous: null,
    quote: { id: crypto.randomUUID(), revision, name: "Bounded review", pricing: "supplied", call: { context }, services: [], lines: [{ name: "fee", currency: "USD", amount: "1" }], terms: {} },
  });
  expect(authority.propose(operation(""))).toHaveProperty("approvalRequired", true);
  const before = canonical(authority.pendingQueue());
  expect(authority.propose(operation("x".repeat(13_000)))).toMatchObject({ availability: "unavailable", code: "review_capacity", stagedForReview: false });
  expect(canonical(authority.pendingQueue())).toBe(before);
  expect(() => authority.propose(operation("", 2))).toThrow();
  expect(canonical(authority.pendingQueue())).toBe(before);
});

it("withdraws only a superseded target and its comparisons when its replacement cannot fit review", async () => {
  const current = await run("replacement-capacity");
  const a = await current.session.executeCommand({ action: "create", pricing: "supplied", lines: [flat("fee", "10")] });
  const b = await current.session.executeCommand({ action: "create", pricing: "supplied", lines: [flat("fee", "20")] });
  const aId = idOf(a), bId = idOf(b);
  expect(await current.session.compare({ quoteIds: [aId, bId], currency: "USD" })).toHaveProperty("approvalRequired", true);
  expect(current.authority.pendingOperations().map(operation => operation.kind)).toEqual(["quote", "quote", "comparison"]);
  current.session.beginStep();
  // Contract fault injection: actual review-size classification is covered above.
  const capacity = vi.spyOn(current.authority, "propose").mockImplementationOnce(() => ({
    status: "unresolved", availability: "unavailable", code: "review_capacity",
    approvalRequired: false, stagedForReview: false, operationId: undefined,
    invalidatedComparisons: 0, body: "The complete review exceeds its bounded display.", questions: [],
  }));
  const replacement = await current.session.executeCommand({ action: "update", quoteId: aId, lines: [{ name: "fee", price: "11" }] });
  capacity.mockRestore();
  expect(replacement).toMatchObject({ availability: "unavailable", code: "review_capacity", stagedForReview: false });
  expect(current.authority.pendingQuote(aId)).toBeUndefined();
  expect(current.authority.pendingQuote(bId)?.lines[0]).toMatchObject({ amount: "20" });
  expect(current.authority.pendingOperations()).toHaveLength(1);
  expect(current.authority.pendingOperations().some(operation => operation.kind === "comparison")).toBe(false);
  const view = JSON.parse(current.session.context()) as { drafts: Array<{ quoteId: string; quote: { lines: Array<{ amount?: string }> } }> };
  expect(view.drafts.find(draft => draft.quoteId === aId)?.quote.lines[0].amount).toBe("11");
  expect(await current.session.compare({ quoteIds: [aId, bId], currency: "USD" })).toMatchObject({ status: "unresolved", availability: "unavailable", code: "review_capacity" });
});

it("does not mutate existing records when quote or accumulated line capacity is exhausted", async () => {
  const session = new QuoteSession("saved-capacity"); await session.initialize([]);
  for (let index = 0; index < 24; index++) await session.update({ pricing: "supplied", lines: [{ name: "fee", currency: "USD", amount: "1" }] });
  session.bindAuthority(new AuthoritySession({ quotes: [...session.quotes.values()].map(quote => AuthoritySession.binding(quote)), comparisons: [] }));
  const before = session.context();
  const result = await session.executeCommand({ action: "create", pricing: "supplied", lines: [flat("fee", "2")] });
  expect(result).toMatchObject({ status: "unresolved", availability: "unavailable", code: "quotation_capacity" });
  expect(result).not.toHaveProperty("record");
  expect(session.context()).toBe(before);

  const lines = new QuoteSession("line-capacity"); await lines.initialize([]);
  const original = await lines.update({ pricing: "supplied", lines: Array.from({ length: 16 }, (_, index) => ({ name: `fee ${index}`, currency: "USD", amount: "1" })) });
  lines.bindAuthority(new AuthoritySession({ quotes: [...lines.quotes.values()].map(quote => AuthoritySession.binding(quote)), comparisons: [] })); lines.beginStep();
  const lineBefore = lines.context();
  const extra = await lines.executeCommand({ action: "update", quoteId: idOf(original), lines: [flat("extra", "2")] });
  expect(extra).toMatchObject({ status: "unresolved", availability: "unavailable", code: "quotation_capacity" });
  expect(extra).not.toHaveProperty("record");
  expect(lines.context()).toBe(lineBefore);
});

it("retains original and immediately previous totals separately after approval and reload", async () => {
  const conversationId = "previous-versus-original", seed = await seeded(conversationId, [flat("fee", "100")]);
  let history = seed.history, context = seed.context;
  for (const [index, price] of ["120", "130"].entries()) {
    const current = await run(conversationId, history, context);
    const command: QuoteCommand = { action: "update", quoteId: seed.quoteId, lines: [{ name: "fee", price }] };
    const prepared = await current.session.executeCommand(command);
    const executed = await approve(current);
    history = [...history, ...receipt(command, prepared, `update-${index}`), ...executed.messages];
    context = structuredClone(current.authority.context);
    if (price === "130") {
      expect(executed.text).toContain("USD 120.00 → USD 130.00");
      expect(executed.text).toContain("increase USD 10.00");
      expect(executed.text).toContain("USD 100.00 → USD 130.00");
    }
  }
  const restored = await run(conversationId, history, context);
  const read = await restored.session.executeCommand({ action: "read", readScope: "current-chat", quoteId: seed.quoteId });
  expect(read.body).toContain("Immediately previous saved revision 1");
  expect(read.body).toContain("USD 120.00 → USD 130.00");
  expect(read.body).toContain("USD 100.00 → USD 130.00");
  expect(restored.session.quotes.get(seed.quoteId)?.baseline?.totals?.[0].amount).toBe("100");
  expect(restored.session.quotes.get(seed.quoteId)?.revision).toBe(2);
});
