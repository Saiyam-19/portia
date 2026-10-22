import { expect, it } from "vitest";
import { asSchema } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";
import { canonicalQuoteCommand } from "../../src/lib/portia/tool-names";
import { QuoteSession } from "../../src/lib/portia/session";
import { AuthoritySession } from "../../src/lib/authority/session";
import { parsePacket } from "../../src/lib/authority/contract";

const schema = () => asSchema(createMigrationMainAgent({ alias: "model-1", mainModel: new MockLanguageModelV4() }).tools.supplied_quote.inputSchema);
const cargo = { name: "Cargo fee", currency: "EUR", billing: { kind: "tonne-movement", price: "7.50", quantity: "8.4", movements: "2", perQuantity: "1", perMovements: "1" } };

it("exposes distinct vessel and cargo movement names through the real provider schema", async () => {
  const json = await schema().jsonSchema;
  const call = (json.properties!.call as { anyOf: Array<{ type?: string; properties?: Record<string, unknown> }> }).anyOf.find(x => x.type === "object")!;
  expect(call.properties).toHaveProperty("vesselMovements");
  expect(call.properties).not.toHaveProperty("movements");
  expect(JSON.stringify(json.properties!.lines)).toContain('"movements"');
});

it("rejects the ambiguous global movement field while preserving the cargo-only recipe", async () => {
  const wire = schema();
  expect((await wire.validate!({ action: "create", call: { movements: "2" }, lines: [cargo] })).success).toBe(false);
  const parsed = await wire.validate!({ action: "create", call: { vesselMovements: null }, lines: [cargo] });
  expect(parsed.success).toBe(true);
  if (parsed.success) { expect(parsed.value.call?.movements).toBeUndefined(); expect(parsed.value.lines?.[0].billing).toMatchObject({ kind: "tonne-movement", movements: "2" }); }
});

it.each(["0", "3"])("maps explicit vessel count %s into existing canonical storage without merging cargo movements", async value => {
  const parsed = await schema().validate!({ action: "create", call: { vesselMovements: value }, lines: [cargo] });
  expect(parsed.success).toBe(true);
  if (parsed.success) { expect(parsed.value.call).toEqual({ movements: value }); expect(parsed.value.lines?.[0].billing).toMatchObject({ movements: "2" }); }
});

it("maps explicit clearing to the canonical field and retains malformed-call identity for repair", async () => {
  const parsed = await schema().validate!({ action: "update", quoteId: "saved", clearCallFields: ["vesselMovements"], scopeChangeEvidence: "clear vessel movements" });
  expect(parsed.success).toBe(true);
  if (parsed.success) expect(parsed.value.clearCallFields).toEqual(["movements"]);
  expect(canonicalQuoteCommand("supplied_quote", { action: "create", call: { vesselMovements: "bad" }, lines: [cargo] })).toMatchObject({ pricing: "supplied", call: { movements: "bad" } });
});

it("preserves independent counts through exact review, approval receipt and reload", async () => {
  const session = new QuoteSession("movement-wire-persistence"), authority = new AuthoritySession();
  session.bindAuthority(authority);
  await session.initialize([{ role: "user", content: "The vessel has 3 vessel movements. Cargo fee: 8.4 tonnes for each of 2 cargo movements at EUR 7.50 per tonne per movement." }]);
  const parsed = await schema().validate!({ action: "create", call: { vesselMovements: "3" }, lines: [cargo] });
  expect(parsed.success).toBe(true); if (!parsed.success) return;
  expect(await session.executeCommand({ ...parsed.value, pricing: "supplied" })).toMatchObject({ approvalRequired: true });
  const operation = parsePacket(authority.pending()!.payload).operations[0]; if (operation.kind !== "quote") throw new Error("Expected quote");
  expect(operation.quote.call.movements).toBe("3"); expect(operation.quote.lines[0].movements).toBe("2");
  const applied = await session.applyApprovedQuote(operation); expect(applied.totals?.[0].amount).toBe("126");
  const restored = new QuoteSession(session.conversationId); restored.bindAuthority(new AuthoritySession({ quotes: [AuthoritySession.binding(operation.quote)], comparisons: [] }));
  await restored.initialize([{ role: "tool", content: [{ type: "tool-result", toolCallId: "fixture-approved", toolName: "supplied_quote", output: { type: "json", value: JSON.parse(JSON.stringify(applied)) } }] }]);
  const quote = restored.quotes.get(operation.quote.id)!; expect(quote.call.movements).toBe("3"); expect(quote.lines[0].movements).toBe("2");
});

it("retires only the corrected wire-validation failure after canonical normalization", async () => {
  const session = new QuoteSession("movement-wire-repair"); session.bindAuthority(new AuthoritySession());
  await session.initialize([{ role: "user", content: "The vessel has 3 vessel movements. Cargo fee: 8.4 tonnes for each of 2 cargo movements at EUR 7.50 per tonne per movement." }]);
  const bad = { action: "create", call: { vesselMovements: "bad" }, lines: [cargo] };
  session.observeTools([], [{ toolName: "supplied_quote", toolCallId: "bad", invalid: true, input: bad }]);
  session.observeTools([{ toolName: "calculate_charges", toolCallId: "independent", input: { expression: "bad" }, output: { status: "error" } }]);
  expect(session.hasUnresolvedToolFailure("bad")).toBe(true);
  const parsed = await schema().validate!({ ...bad, call: { vesselMovements: "3" }, retryOf: "bad" });
  expect(parsed.success).toBe(true); if (!parsed.success) return;
  const output = await session.executeCommand({ ...parsed.value, pricing: "supplied" }, undefined, "fixed");
  expect(output).toHaveProperty("approvalRequired", true);
  session.observeTools([{ toolName: "supplied_quote", toolCallId: "fixed", input: parsed.value, output }]);
  expect(session.hasUnresolvedToolFailure("bad")).toBe(false);
  expect(session.hasUnresolvedToolFailure("independent")).toBe(true);
});
