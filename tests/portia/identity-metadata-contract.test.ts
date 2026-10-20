import { expect, it } from "vitest";
import { AuthoritySession } from "../../src/lib/authority/session";
import { parsePacket } from "../../src/lib/authority/contract";
import { quoteToolInputSchema, type QuoteInput } from "../../src/lib/portia/quotes";
import { QuoteSession } from "../../src/lib/portia/session";
import { lookupTariff, tariffInputSchema, type TariffInput } from "../../src/lib/portia/tariffs";

type CanonicalInput = TariffInput & { facilityId?: string };

it("accepts a canonical facility ID while preserving a descriptive booked identity", async () => {
  const input: CanonicalInput = {
    facilityId: "mumbai-container-terminal",
    port: "the booked Bharat Mumbai Container Terminal facility",
    charges: ["berth"],
    callDate: "27 October 2026",
    gt: "18437",
    durationHours: "3.25",
  };
  expect(tariffInputSchema.safeParse(input).success).toBe(true);
  const result = await lookupTariff(input);
  expect(result.facility).toBe("mumbai-container-terminal");
  expect(result.questions.join(" ")).not.toMatch(/identity|which exact booked/i);
});

it.each([
  ["gateway-terminals-india-pvt-ltd", "our booked Gateway Terminals India (GTI) facility"],
  ["jsw-jnpt-liquid-terminal", "the booked JSW JNPT Liquid Terminal Private Limited berth"],
  ["nhava-sheva-gateway-terminal", "our Nhava Sheva (India) Gateway Terminal Private Limited booking"],
] as const)("grounds overlapping catalog wording to %s", async (facilityId, port) => {
  const result = await lookupTariff({ facilityId, port, charges: ["berth"] } as CanonicalInput, "rule");
  expect(result.facility).toBe(facilityId);
  expect(result.questions.join(" ")).not.toMatch(/ambiguous|identity conflict/i);
});

it("accepts a declared parent only when another identity field grounds the selected child", async () => {
  const result = await lookupTariff({
    facilityId: "mumbai-container-terminal",
    port: "JNPA",
    terminal: "the booked Bharat Mumbai Container Terminal facility",
    charges: ["berth"],
  } as CanonicalInput, "rule");
  expect(result.facility).toBe("mumbai-container-terminal");
});

it.each([
  ["known conflict", { facilityId: "mumbai-container-terminal", port: "NSFT" }, /conflict/i],
  ["ambiguous label", { facilityId: "gateway-terminals-india-pvt-ltd", port: "Gateway" }, /ambiguous|which exact/i],
  ["unknown identity", { facilityId: "mumbai-container-terminal", port: "North Star Quay" }, /cannot be validated|not established|unknown/i],
  ["unknown terminal", { facilityId: "jawahar-nehru-port-authority-jnpa", port: "JNPA", terminal: "North Star Quay" }, /terminal.*cannot be validated|unverified/i],
  ["conflicting operator", { facilityId: "jaigarh", port: "JSW Jaigarh", operator: "JSW JNPT Liquid Terminal" }, /conflict/i],
  ["ambiguous terminal", { facilityId: "jawahar-nehru-port-authority-jnpa", port: "JNPA", terminal: "BPCL" }, /ambiguous/i],
  ["incidental geography", { facilityId: "mumbai-container-terminal", port: "North Star Quay", terminal: "North Star Quay", operator: "Mumbai regional agent" }, /cannot be validated|not established|unknown/i],
] as const)("keeps %s unresolved instead of trusting a model-selected ID", async (_case, identity, message) => {
  const result = await lookupTariff({ ...identity, charges: ["berth"] } as CanonicalInput);
  expect(result.facility).toBeUndefined();
  expect(`${result.body} ${result.questions.join(" ")}`).toMatch(message);
});

it("keeps legacy exact aliases valid without a canonical ID", async () => {
  const result = await lookupTariff({ port: "NSIGT", charges: ["berth"] });
  expect(result.facility).toBe("nhava-sheva-gateway-terminal");
});

it("preserves grounded supplied reference, name, raw location and context through approval and receipt", async () => {
  const session = new QuoteSession("metadata-contract"), authority = new AuthoritySession();
  session.bindAuthority(authority);
  await session.initialize([{ role: "user", content: "Supplier sheet VX-704: Cobalt/41-B covers USD 763.25 berth hire at the booked Bharat Mumbai Container Terminal facility for priority window Q7." }]);
  const input = {
    name: "Cobalt/41-B",
    pricing: "supplied",
    call: {
      facilityId: "mumbai-container-terminal",
      port: "the booked Bharat Mumbai Container Terminal facility",
      reference: "VX-704",
      context: "Supplier sheet VX-704: Cobalt/41-B covers USD 763.25 berth hire at the booked Bharat Mumbai Container Terminal facility for priority window Q7.",
    },
    lines: [{ name: "berth hire", currency: "USD", amount: "763.25" }],
  } as unknown as QuoteInput;
  expect(quoteToolInputSchema.safeParse(input).success).toBe(true);
  expect(await session.executeCommand({ ...input, action: "create", lines: [{ name: "berth hire", currency: "USD", billing: { kind: "flat", price: "763.25", basis: "user-stated-flat" } }] } as Parameters<QuoteSession["executeCommand"]>[0])).toMatchObject({ approvalRequired: true });
  const pending = authority.pending();
  expect(pending?.form.description).toContain("Cobalt/41-B");
  expect(pending?.form.description).toContain("VX-704");
  expect(pending?.form.description).toContain("priority window Q7");
  const operation = parsePacket(pending!.payload).operations[0];
  if (operation.kind !== "quote") throw new Error("Expected quote operation");
  expect(operation.quote.call).toMatchObject(input.call!);
  const applied = await session.applyApprovedQuote(operation);
  expect(applied.record.quote.name).toBe("Cobalt/41-B");
  expect(applied.record.quote.call).toMatchObject(input.call!);
});

it.each([
  ["name", { name: "Invented summary 88" }],
  ["reference", { call: { reference: "ZX-909" } }],
  ["context", { call: { context: "fabricated clearance window" } }],
] as const)("returns explicit feedback for ungrounded supplied %s metadata", async (_field, patch) => {
  const session = new QuoteSession(`ungrounded-${_field}`);
  await session.initialize([{ role: "user", content: "Use the supplied USD 431 berth amount." }]);
  const input = {
    pricing: "supplied",
    lines: [{ name: "berth", currency: "USD", amount: "431" }],
    ...patch,
  } as unknown as QuoteInput;
  const result = await session.executeCommand({ ...input, action: "create", lines: [{ name: "berth", currency: "USD", billing: { kind: "flat", price: "431", basis: "user-stated-flat" } }] } as Parameters<QuoteSession["executeCommand"]>[0]);
  expect(result).toMatchObject({ status: "error" });
  expect(result.body).toMatch(/not grounded|not supplied|cannot verify/i);
  expect(session.quotes.size).toBe(0);
});
