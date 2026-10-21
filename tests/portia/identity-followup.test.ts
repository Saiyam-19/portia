import { expect, it } from "vitest";
import Decimal from "decimal.js";
import { lookupTariff, resolveTariffPort } from "../../src/lib/portia/tariffs";
import { QuoteSession } from "../../src/lib/portia/session";
import { MockLanguageModelV4 } from "../helpers/portia-protocol-model";
import { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";

// Captured first frozen-build NSFT tool arguments, provider dispatch176.
it("accepts equivalent full-name/acronym identities without selecting a neighbour", async () => {
  const r = await lookupTariff({ port: "Jawahar Nehru Port Authority (JNPA)", terminal: "Nhava Sheva Freeport Terminal (NSFT)", charges: ["handling"], callDate: "12 November 2026", service: "foreign", containerSize: "20", ladenContainers: "120", emptyContainers: "80", cargoTraffic: "exim", specialCargo: false, handlingMode: "road" });
  expect(r.status).toBe("calculated"); expect(r.questions).toEqual([]);
  expect(new Decimal(r.totals![0].amount).eq("17967.20")).toBe(true);
  expect(r.sources).toHaveLength(1); expect(r.sources![0].url).toContain("NSFTPL");
});
it.each(["Gateway (GTI)", "BPCL (BPCL Liquid Cargo Jetty)", "JNPA (GTI)", "NSFT (NSIGT)", "Mumbai (GTI)"])("does not infer or reconcile conflicting/ambiguous shorthand %s", name => {
  expect(resolveTariffPort(name)).toBeUndefined();
});
it("retains genuine user-stated cross-facility conflict despite parenthetical aliases", async () => {
  const r = await lookupTariff({ port: "Mumbai Port Authority", terminal: "Gateway Terminals India (GTI)", charges: ["berth"] }, "rule");
  expect(r.status).toBe("unresolved"); expect(r.questions.join(" ")).toMatch(/conflict/i); expect(r.sources).toBeUndefined();
});
it("gives an actionable official pre-tax error without authorizing supplied tax", async () => {
  const s = new QuoteSession("official-tax-input"); await s.initialize([]);
  const input = { pricing: "official" as const, services: ["handling"], call: { port: "NSFT", callDate: "12 November 2026", service: "foreign" as const, containerSize: "20", ladenContainers: "120", emptyContainers: "80", cargoTraffic: "exim" as const, specialCargo: false, handlingMode: "road" as const } };
  const rejected = await s.update({ ...input, terms: { taxPercent: "0" } });
  expect(rejected.status).toBe("error"); expect(rejected.body).toMatch(/taxPercent.*null/); expect(s.quotes.size).toBe(0);
  const accepted = await s.update(input); expect(accepted.status).toBe("calculated"); expect(accepted.body).toContain("USD 17,967.20");
});
it("returns the selected child facility identity for parent/terminal explanations", async () => {
  const result = await lookupTariff({ port: "JNPA", terminal: "NSFT", charges: ["handling"] }, "rule");
  expect(result).toHaveProperty("facility", "nhava-sheva-freeport-terminal");
});
it.each([["Gateway", "GTI", "NSIGT"], ["BPCL", "BPCL Cargo Jetty", "BPCL Liquid Cargo Jetty"]])("explains known %s ambiguity with the catalog alternatives", async (port, first, second) => {
  const result = await lookupTariff({ port, charges: ["identity"] }, "rule");
  expect(result.status).toBe("unresolved"); expect(result.body).toMatch(/ambiguous/i);
  expect(result.body).toContain(first); expect(result.body).toContain(second); expect(result.sources).toBeUndefined(); expect(result.totals).toBeUndefined();
});
it("keeps independent elapsed labels when genuinely missing zones require clarification", async () => {
  const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } };
  const model = new MockLanguageModelV4({ doGenerate: [
    { content: ["A", "B"].map(label => ({ type: "tool-call" as const, toolCallId: label, toolName: "calculate_elapsed_time", input: JSON.stringify({ label, start: "18 October 2026 08:00", end: "18 October 2026 09:00" }) })), finishReason: { unified: "tool-calls", raw: undefined }, usage, warnings: [] },
    { content: [{ type: "text", text: "Finished" }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] },
  ] });
  const session = new QuoteSession("missing-zones");
  const result = await createMigrationMainAgent({ alias: "model-1", mainModel: model, session }).generate({ prompt: "Calculate independent intervals A and B, but no timezone supplied." });
  const text = await session.answer(result.text);
  expect(text).toContain("A —"); expect(text).toContain("B —"); expect(text).toContain("Confirm the time zone"); expect(text).not.toContain("**1 hours**");
});
