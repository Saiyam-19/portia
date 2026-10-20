import { expect, it } from "vitest";
import type { ModelMessage } from "ai";
import { AuthoritySession } from "../../src/lib/authority/session";
import { parsePacket } from "../../src/lib/authority/contract";
import { QuoteSession } from "../../src/lib/portia/session";
import { quoteCommandSchema } from "../../src/lib/portia/quotes";

const official = { action: "create" as const, pricing: "official" as const, services: ["port-dues" as const], call: { port: "JSW Jaigarh", cargoCategory: "mechanized-bulk" as const, gt: "8317", callDays: "30", callDate: "17 November 2026" } };
const receipt = (result: unknown): ModelMessage => ({ role: "tool", content: [{ type: "tool-result", toolName: "manage_quote", toolCallId: "saved", output: { type: "json", value: JSON.parse(JSON.stringify(result)) } }] });

it("requires distinct operations and rejects write data on a read", () => {
  expect(quoteCommandSchema.safeParse({ pricing: "official" }).success).toBe(false);
  expect(quoteCommandSchema.safeParse({ action: "update", call: { gt: "92" } }).success).toBe(false);
  expect(quoteCommandSchema.safeParse({ ...official, quoteId: "existing" }).success).toBe(false);
  for (const patch of [{ pricing: "supplied" }, { services: ["berth"] }, { call: { gt: "9" } }, { removeServices: ["berth"] }]) {
    expect(quoteCommandSchema.safeParse({ action: "read", readScope: "current-chat", ...patch }).success).toBe(false);
  }
  expect(quoteCommandSchema.safeParse({ action: "read", readScope: "cross-chat", quoteId: "current" }).success).toBe(false);
});

it("reads current saved state without receipts, revisions or baselines", async () => {
  const session = new QuoteSession("command-read"); await session.initialize([]);
  const created = await session.executeCommand(official);
  if (!("quoteId" in created)) throw Error("quote missing");
  const before = session.context(); session.beginStep();
  const result = await session.executeCommand({ action: "read", readScope: "current-chat", quoteId: created.quoteId });
  expect(result.body).toContain("USD 2,744.61");
  expect(result).not.toHaveProperty("record"); expect(result).not.toHaveProperty("approvalRequired");
  expect(session.context()).toBe(before);
  expect(result.body).toContain(created.quoteId); expect(result.body).toMatch(/revision 0/i);
});

it("preserves requested scope through retries and reload; supports explicit removals", async () => {
  const session = new QuoteSession("command-scope"); await session.initialize([]);
  const first = await session.executeCommand({ ...official, services: ["port-dues", "other"], terms: { unsupportedServices: ["special night escort"], unresolvedTerms: ["Confirm escort basis"] } });
  if (!("quoteId" in first)) throw Error("quote missing");
  session.beginStep();
  const retried = await session.executeCommand({ action: "update", quoteId: first.quoteId, services: ["port-dues"], terms: { unresolvedTerms: [] } });
  expect(session.quotes.get(first.quoteId)?.services).toContain("other");
  expect(retried.body).toContain("special night escort"); expect(retried.questions.length).toBeGreaterThan(0);
  const restored = new QuoteSession("command-scope");
  await restored.initialize([receipt(first), receipt(retried), { role: "user", content: "Remove the special night escort. Keep port dues." }]);
  const corrected = await restored.executeCommand({ action: "update", quoteId: first.quoteId, removeServices: ["other"], removeUnsupportedServices: ["special night escort"], scopeChangeEvidence: "Remove the special night escort." });
  expect(corrected.body).toContain("USD 2,744.61"); expect(corrected.questions).toEqual([]);
  expect(corrected.body).toMatch(/removed.*special night escort/i);
  expect(restored.quotes.get(first.quoteId)?.services).toEqual(["port-dues"]);
});

it.each(["wrong-id", undefined])("unknown/empty current reads stay read-only (%s)", async quoteId => {
  const session = new QuoteSession("empty"); await session.initialize([]);
  const result = await session.executeCommand({ action: "read", readScope: "current-chat", quoteId });
  expect(result).not.toHaveProperty("record"); expect(session.quotes.size).toBe(0);
  expect(result.body).toMatch(/not saved|no .*quotation/i); expect(result.body).not.toMatch(/specify.*pricing/i);
});

it("does not propose or save incomplete supplied terms", async () => {
  const session = new QuoteSession("incomplete"), authority = new AuthoritySession(); session.bindAuthority(authority);
  await session.initialize([{ role: "user", content: "USD 527 berth plus a tax line; rate unknown." }]);
  const result = await session.executeCommand({ action: "create", pricing: "supplied", lines: [{ name: "berth", currency: "USD", billing: { kind: "flat", price: "527", basis: "user-stated-flat" } }, { name: "tax", currency: "USD" }] });
  expect(authority.hasPending()).toBe(false); expect(session.quotes.size).toBe(0);
  expect(result.questions.join(" ")).toMatch(/tax.*amount|tax.*rate/i);
  expect(result.body).not.toContain("Total of supplied lines");
});

it("approved supplied read stays unchanged and correction keeps its original baseline", async () => {
  const session = new QuoteSession("approved-read"), authority = new AuthoritySession(); session.bindAuthority(authority);
  await session.initialize([{ role: "user", content: "Ref Tide/203: supplied berth USD 527 and water USD 31." }]);
  const proposed = await session.executeCommand({ action: "create", name: "Tide/203", pricing: "supplied", lines: [{ name: "berth", currency: "USD", billing: { kind: "flat", price: "527", basis: "user-stated-flat" } }, { name: "water", currency: "USD", billing: { kind: "flat", price: "31", basis: "user-stated-flat" } }] });
  expect(proposed).toHaveProperty("approvalRequired", true);
  const op = parsePacket(authority.pending()!.payload).operations[0]; if (op.kind !== "quote") throw Error("wrong operation");
  const applied = await session.applyApprovedQuote(op); const before = session.context();
  session.beginStep(); const read = await session.executeCommand({ action: "read", readScope: "current-chat", quoteId: applied.quoteId });
  expect(read.body).toContain("USD 558.00"); expect(read).not.toHaveProperty("record"); expect(session.context()).toBe(before);
});

it("current read does not clear a failed write or leave a stale total after correction", async () => {
  const session = new QuoteSession("read-failure"); await session.initialize([]);
  const created = await session.executeCommand(official); if (!("quoteId" in created)) throw Error("quote missing");
  session.observeTools([], [{ toolCallId: "bad", toolName: "manage_quote", invalid: true, input: { action: "update", quoteId: created.quoteId, call: { gt: "-3" } } }]);
  const input = { action: "read" as const, readScope: "current-chat" as const, quoteId: created.quoteId };
  const read = await session.executeCommand(input, undefined, "read");
  session.observeTools([{ toolCallId: "read", toolName: "manage_quote", input, output: read }]);
  expect(session.finalText("")).toContain("could not complete");
  session.beginStep(); await session.executeCommand({ action: "update", quoteId: created.quoteId, call: { gt: "9001" } });
  expect(session.finalText("")).toContain("USD 2,970.33"); expect(session.finalText("")).not.toContain("Saved quotation —");
});

it("retires a corrected semantic input failure while keeping independent failures", async () => {
  const session = new QuoteSession("semantic-repair"), authority = new AuthoritySession(); session.bindAuthority(authority);
  await session.initialize([{ role: "user", content: "Berth is USD 37, no supplied quotation name." }]);
  const bad = { action: "create" as const, name: "Invented Cedar", pricing: "supplied" as const, lines: [{ name: "berth", currency: "USD" as const, billing: { kind: "flat" as const, price: "37", basis: "user-stated-flat" as const } }] };
  const rejected = await session.executeCommand(bad);
  session.observeTools([{ toolCallId: "bad", toolName: "manage_quote", input: bad, output: rejected }]);
  session.observeTools([{ toolCallId: "separate", toolName: "calculate_charges", input: { expression: "broken" }, output: { status: "error" } }]);
  const fixed = { ...bad, name: undefined };
  const result = await session.executeCommand(fixed);
  expect(result).toHaveProperty("approvalRequired", true);
  session.observeTools([{ toolCallId: "fixed", toolName: "manage_quote", input: fixed, output: result }]);
  expect(session.finalText("")).not.toContain("not grounded");
  expect(session.finalText("")).toContain("could not complete");
});

it("supplied canonical service scope cannot hide an unpriced named charge", async () => {
  expect(quoteCommandSchema.safeParse({ action: "create", pricing: "supplied", services: ["berth", "pilotage"], lines: [{ name: "berth", currency: "USD", billing: { kind: "flat", price: "37", basis: "user-stated-flat" } }] }).success).toBe(false);
});
