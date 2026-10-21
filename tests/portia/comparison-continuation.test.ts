import { expect, it } from "vitest";
import type { ModelMessage } from "ai";
import { QuoteSession } from "../../src/lib/portia/session";
import { AuthoritySession } from "../../src/lib/authority/session";
import { quoteCore } from "../../src/lib/authority/contract";

const toolMessages = (name: string, id: string, input: unknown, output: unknown): ModelMessage[] => [
  { role: "assistant", content: [{ type: "tool-call", toolName: name, toolCallId: id, input }] },
  { role: "tool", content: [{ type: "tool-result", toolName: name, toolCallId: id, output: { type: "json", value: JSON.parse(JSON.stringify(output)) } }] },
];
it.each(["human-history", "assistant-only", "wrong-retry"] as const)("retains only authenticated matching scope evidence across FX clarification: %s", async mode => {
  const statement = "Treat north plan and south plan as equivalent supplied scopes";
  const user: ModelMessage = { role: "user", content: `Quotes named north plan and south plan. ${statement}; compare in USD.` };
  const original = new QuoteSession("scope-followup"); await original.initialize([user]);
  const aInput = { pricing: "supplied" as const, name: "north plan", lines: [{ name: "north package", currency: "USD" as const, amount: "100" }] };
  const bInput = { pricing: "supplied" as const, name: "south plan", lines: [{ name: "south package", currency: "EUR" as const, amount: "90" }] };
  const a = await original.update(aInput), b = await original.update(bInput);
  if (!("quoteId" in a) || !("quoteId" in b)) throw Error("Missing saved quotes");
  const comparison = { quoteIds: [a.quoteId, b.quoteId], currency: "USD" as const, scopeEquivalence: { statement } };
  const missingFx = await original.compare(comparison, "fx-question");
  expect(missingFx).toMatchObject({ status: "unresolved", clarificationId: "fx-question" });
  const history: ModelMessage[] = [
    mode === "assistant-only" ? { role: "assistant", content: user.content as string } : user,
    ...toolMessages("manage_quote", "a", aInput, a), ...toolMessages("manage_quote", "b", bInput, b),
    ...toolMessages("compare_quotes", "fx-question", comparison, missingFx),
    { role: "user", content: "The supplied FX is 1 EUR = 1.2 USD." },
  ];
  const reloaded = new QuoteSession("scope-followup");
  const authority = new AuthoritySession({ quotes: [...original.quotes.values()].map(q => AuthoritySession.binding(quoteCore(q))), comparisons: [] });
  reloaded.bindAuthority(authority); await reloaded.initialize(history);
  if (mode === "human-history") {
    const omitted = await reloaded.compare({ ...comparison, retryOf: "fx-question" }, "second-fx-question");
    expect(omitted).toMatchObject({ status: "unresolved", clarificationId: "second-fx-question" });
  }
  const continued = await reloaded.compare({ ...comparison, retryOf: mode === "wrong-retry" ? "unrelated" : mode === "human-history" ? "second-fx-question" : "fx-question", exchangeRates: [{ from: "EUR", to: "USD", rate: "1.2" }] });
  if (mode === "human-history") {
    expect(continued).toHaveProperty("approvalRequired", true);
    expect(authority.pending()!.form.description).toContain(statement);
  } else {
    expect(continued).toMatchObject({ status: "error" });
    expect(continued.body).toMatch(/not grounded/);
    expect(authority.hasPending()).toBe(false);
  }
});
