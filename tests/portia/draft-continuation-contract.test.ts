import { expect, it, vi } from "vitest";
import type { ModelMessage } from "ai";
import { AuthoritySession } from "../../src/lib/authority/session";
import { parsePacket } from "../../src/lib/authority/contract";
import { QuoteSession } from "../../src/lib/portia/session";

const history = (value: unknown): ModelMessage => ({ role: "tool", content: [{ type: "tool-result", toolName: "manage_quote", toolCallId: "draft", output: { type: "json", value: JSON.parse(JSON.stringify(value)) } }] });
const text = "Supplier reference Cedar/Q9 covers the berth at South Harbour: USD 73 per commenced six-hour period. Occupancy to follow.";
const create = { action: "create" as const, name: "Cedar/Q9", pricing: "supplied" as const, call: { reference: "Cedar/Q9", port: "South Harbour", context: text }, lines: [{ name: "berth", currency: "USD" as const, billing: { kind: "time" as const, price: "73", periodHours: "6", commenced: true } }] };

it("continues an unapproved draft across a terse reply/reload without losing its original metadata", async () => {
  const first = new QuoteSession("draft-continuation"); first.bindAuthority(new AuthoritySession());
  await first.initialize([{ role: "user", content: text }]); const incomplete = await first.executeCommand(create);
  expect(incomplete).toHaveProperty("draft"); expect(incomplete).not.toHaveProperty("record"); expect(first.quotes.size).toBe(0);
  if (!("quoteId" in incomplete)) throw Error("missing draft ID");
  const next = new QuoteSession("draft-continuation"), authority = new AuthoritySession(); next.bindAuthority(authority);
  await next.initialize([history(incomplete), { role: "user", content: "Thirteen hours and ten minutes." }]);
  const result = await next.executeCommand({ action: "update", quoteId: incomplete.quoteId, call: { occupancy: { hours: "13", minutes: "10" } } });
  expect(result).toHaveProperty("approvalRequired", true); expect(next.quotes.size).toBe(0);
  const op = parsePacket(authority.pending()!.payload).operations[0]; if (op.kind !== "quote") throw Error("wrong op");
  expect(op.quote).toMatchObject({ id: incomplete.quoteId, revision: 0, name: "Cedar/Q9", call: create.call });
  expect(op.before).toBeNull(); expect(op.quote.baseline).toBeUndefined();
  const applied = await next.applyApprovedQuote(op); expect(applied.totals?.[0].amount).toBe("219");
  const reload = new QuoteSession("draft-continuation"); reload.bindAuthority(authority);
  await reload.initialize([history(incomplete), history(result), history(applied)]);
  expect(JSON.parse(reload.context()).drafts).toEqual([]); expect(reload.quotes.size).toBe(1);
});

it("draft reads and comparisons cannot promote unapproved prices", async () => {
  const session = new QuoteSession("draft-read"), authority = new AuthoritySession(); session.bindAuthority(authority);
  await session.initialize([{ role: "user", content: text }]); const draft = await session.executeCommand(create);
  if (!("quoteId" in draft)) throw Error("missing draft ID");
  const before = session.context(), read = await session.executeCommand({ action: "read", readScope: "current-chat", quoteId: draft.quoteId });
  expect(read.body).toMatch(/draft|unapproved/i); expect(read).not.toHaveProperty("record"); expect(session.context()).toBe(before);
  expect((await session.compare({ quoteIds: [draft.quoteId, "another"], currency: "USD" })).status).toBe("error");
  expect(authority.hasPending()).toBe(false);
});

it("invalidates derived facility ID when the user corrects the raw booking", async () => {
  const session = new QuoteSession("identity-correction"); await session.initialize([]);
  const first = await session.executeCommand({ action: "create", pricing: "official", services: ["berth"], call: { port: "BMCT", facilityId: "mumbai-container-terminal" } });
  if (!("quoteId" in first)) throw Error("missing quote"); session.beginStep();
  const result = await session.executeCommand({ action: "update", quoteId: first.quoteId, call: { port: "North Star Quay" } });
  expect(result.status).not.toBe("error"); expect(session.quotes.get(first.quoteId)?.call.port).toBe("North Star Quay");
  expect(session.quotes.get(first.quoteId)?.call.facilityId).toBeUndefined(); expect(result).not.toHaveProperty("totals");
});

it("cross-chat read invokes only the memory reader, is rendered, and forget clears it", async () => {
  const session = new QuoteSession("recall"); await session.initialize([]);
  const reader = vi.fn(async () => ({ facts: [{ key: "historic_quote", value: "Cedar/Q9 USD 219" }] }));
  const result = await session.executeCommand({ action: "read", readScope: "cross-chat" }, undefined, "recall", reader);
  expect(reader).toHaveBeenCalledTimes(1); expect(session.quotes.size).toBe(0); expect(result).not.toHaveProperty("record");
  expect(session.finalText("USD 999")).toContain("Cedar/Q9 USD 219");
  session.observeTools([{ toolCallId: "forget", toolName: "forget_memory", output: { saved: true } }]);
  expect(session.finalText("Cedar/Q9 USD 219")).not.toContain("219");
});

it("clears obsolete booked identity fields explicitly without erasing unrelated quantities", async () => {
  const session = new QuoteSession("clear-identity"); await session.initialize([]);
  const original = await session.executeCommand({ action: "create", pricing: "official", services: ["berth"], call: { port: "JNPA", terminal: "GTI", facilityId: "gateway-terminals-india-pvt-ltd", gt: "14231" } });
  if (!("quoteId" in original)) throw Error("missing quote");
  await session.initialize([{ role: "user", content: "Replace that booking with NSFT. The previous terminal no longer applies." }]);
  const corrected = await session.executeCommand({ action: "update", quoteId: original.quoteId, call: { port: "NSFT", facilityId: "nhava-sheva-freeport-terminal" }, clearCallFields: ["terminal"], scopeChangeEvidence: "The previous terminal no longer applies." });
  expect(corrected.status).not.toBe("error");
  expect(session.quotes.get(original.quoteId)?.call).toMatchObject({ port: "NSFT", gt: "14231" });
  expect(session.quotes.get(original.quoteId)?.call.terminal).toBeUndefined();
});

it("removal-only updates observe the same-step revision fence", async () => {
  const session = new QuoteSession("removal-fence"); await session.initialize([{ role: "user", content: "Withdraw GT and occupancy." }]);
  const first = await session.executeCommand({ action: "create", pricing: "official", services: ["berth"], call: { port: "GTI", gt: "9000", occupancy: { hours: "8" } } });
  if (!("quoteId" in first)) throw Error("missing quote"); session.beginStep();
  const firstRemoval = await session.executeCommand({ action: "update", quoteId: first.quoteId, clearCallFields: ["gt"], scopeChangeEvidence: "Withdraw GT and occupancy." });
  expect(firstRemoval.status).not.toBe("error");
  const stale = await session.executeCommand({ action: "update", quoteId: first.quoteId, clearCallFields: ["occupancy"], scopeChangeEvidence: "Withdraw GT and occupancy." });
  expect(stale.status).toBe("error"); expect(session.quotes.get(first.quoteId)?.call.occupancy).toEqual({ hours: "8" });
});
