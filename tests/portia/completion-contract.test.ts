import { expect, it } from "vitest";
import { CompletionSession, type FinishTurnInput } from "../../src/lib/portia/completion";

const outcome = (kind: "comparison" | "quotation_read", evidenceIds: string[]): FinishTurnInput => ({ outcomes: [{ id: "requested", requestedOutcome: "Requested result", kind, targets: ["a", "b"], evidenceIds }] });
it("rejects a read as comparison evidence then accepts actual comparison work in the same run", () => {
  const session = new CompletionSession();
  const read = session.register("read", { toolName: "read_quotes", kind: "quotation_read", targets: ["a", "b"], disposition: "completed" });
  expect(session.finish(outcome("comparison", [read.id]), "finish1")).toMatchObject({ status: "continue_work", issues: expect.arrayContaining([expect.objectContaining({ code: "wrong_operation", nextTools: ["compare_quotes"] })]) });
  expect(session.acceptStep([{ toolName: "finish_turn", toolCallId: "finish1" }])).toBe(false);
  const comparison = session.register("compare", { toolName: "compare_quotes", kind: "comparison", targets: ["a", "b"], disposition: "awaiting_approval", required: true });
  expect(session.finish(outcome("comparison", [comparison.id]), "finish2").status).toBe("ready_for_final_check");
  expect(session.acceptStep([{ toolName: "finish_turn", toolCallId: "finish2" }])).toBe(true);
  expect(session.completion()?.outcomes[0].disposition).toBe("awaiting_approval");
});
it("cannot drop or relabel a declared outcome to escape a rejected finish", () => {
  const session = new CompletionSession(); session.finish(outcome("comparison", []), "first");
  expect(session.finish({ outcomes: [] }, "drop").issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "dropped_outcome" })]));
  const read = session.register("read", { toolName: "read_quotes", kind: "quotation_read", targets: [], disposition: "completed" });
  expect(session.finish(outcome("quotation_read", [read.id]), "relabel").issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "changed_outcome" })]));
  expect(session.acceptStep([{ toolName: "finish_turn", toolCallId: "relabel" }])).toBe(false);
});
it("rechecks current bindings after the complete tool step and rejects mixed finish steps", () => {
  const session = new CompletionSession(); let current = true;
  const evidence = session.register("compare", { toolName: "compare_quotes", kind: "comparison", targets: ["a", "b"], disposition: "completed", current: () => current });
  session.finish(outcome("comparison", [evidence.id]), "finish");
  expect(session.acceptStep([{ toolName: "finish_turn", toolCallId: "finish" }, { toolName: "supplied_quote", toolCallId: "update" }])).toBe(false);
  session.finish(outcome("comparison", [evidence.id]), "finish2"); current = false;
  expect(session.acceptStep([{ toolName: "finish_turn", toolCallId: "finish2" }])).toBe(false); expect(session.completion()).toBeUndefined();
});
it("cannot invent evidence or omit a real rejected business operation", () => {
  const session = new CompletionSession();
  expect(session.finish(outcome("comparison", ["invented"]), "first").issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "unknown_evidence" })]));
  const failure = session.register("compare", { toolName: "compare_quotes", kind: "comparison", targets: ["a", "b"], disposition: "failed", required: true, summary: "Complete the requested terms first." });
  expect(session.finish(outcome("comparison", [failure.id]), "second").issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "failed_operation" })]));
  expect(session.acceptStep([{ toolName: "finish_turn", toolCallId: "second" }])).toBe(false);
});
it("allows a conversational reply with no business authority or invented receipt", () => {
  const session = new CompletionSession(); session.finish({ outcomes: [], response: "Hello." }, "hello");
  expect(session.acceptStep([{ toolName: "finish_turn", toolCallId: "hello" }])).toBe(true);
  expect(session.completion()).toEqual({ outcomes: [], response: "Hello." });
});

it.each([undefined, "", " \n "])("rejects an empty conversational finish (%j)", response => {
  const session = new CompletionSession();
  expect(session.finish({ outcomes: [], response }, "empty")).toMatchObject({
    status: "continue_work",
    issues: expect.arrayContaining([expect.objectContaining({ code: "empty_response" })]),
  });
  expect(session.acceptStep([{ toolName: "finish_turn", toolCallId: "empty" }])).toBe(false);
});

it("returns financial prose without evidence to the same loop for real work", () => {
  const session = new CompletionSession();
  expect(session.finish({ outcomes: [], response: "Berth hire totals USD 120." }, "unsupported")).toMatchObject({
    status: "continue_work",
    issues: expect.arrayContaining([expect.objectContaining({ code: "unsupported_financial_response" })]),
  });
  expect(session.acceptStep([{ toolName: "finish_turn", toolCallId: "unsupported" }])).toBe(false);
});

it("cannot substitute comparison targets or silently supersede independent comparison outputs", () => {
  const session = new CompletionSession();
  const usd = session.register("usd", { toolName: "compare_quotes", kind: "comparison", targets: ["a", "b"], comparisonCurrency: "USD", disposition: "completed", required: true });
  const eur = session.register("eur", { toolName: "compare_quotes", kind: "comparison", targets: ["a", "b"], comparisonCurrency: "EUR", disposition: "completed", required: true });
  const wrong: FinishTurnInput = { outcomes: [{ id: "usd", requestedOutcome: "USD comparison", kind: "comparison", targets: ["a", "c"], comparisonCurrency: "USD", evidenceIds: [usd.id] }] };
  expect(session.finish(wrong, "wrong").issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "wrong_targets" }), expect.objectContaining({ code: "unreported_work" })]));
  expect(session.context().evidence.filter(item => item.current)).toHaveLength(2);
  expect(session.finish({ outcomes: [{ ...wrong.outcomes[0], evidenceIds: [eur.id] }] }, "swap").issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "wrong_comparison_currency" })]));
});

it("keeps verified comparison bindings immutable on later finish attempts", () => {
  const session = new CompletionSession();
  const usd = session.register("usd", { toolName: "compare_quotes", kind: "comparison", targets: ["a", "b"], comparisonCurrency: "USD", disposition: "completed" });
  const input: FinishTurnInput = { outcomes: [{ id: "compare", requestedOutcome: "Compare the chosen quotes", kind: "comparison", targets: ["a", "b"], comparisonCurrency: "USD", evidenceIds: [usd.id] }] };
  session.finish(input, "first");
  expect(session.acceptStep([{ toolCallId: "first", toolName: "finish_turn" }])).toBe(true);
  const eur = session.register("eur", { toolName: "compare_quotes", kind: "comparison", targets: ["a", "c"], comparisonCurrency: "EUR", disposition: "completed" });
  expect(session.finish({ outcomes: [{ ...input.outcomes[0], targets: ["a", "c"], comparisonCurrency: "EUR", evidenceIds: [eur.id] }] }, "changed").issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "changed_outcome" })]));
  expect(session.acceptStep([{ toolCallId: "changed", toolName: "finish_turn" }])).toBe(false);
});

it("does not lock unverified targets when a relabelled outcome is rejected", () => {
  const session = new CompletionSession();
  const original = { id: "compare", requestedOutcome: "Compare the chosen quotes", kind: "comparison" as const, targets: ["wrong"], evidenceIds: [] };
  session.finish({ outcomes: [original] }, "missing");
  const read = session.register("read", { toolName: "read_quotes", kind: "quotation_read", targets: ["a", "b"], disposition: "completed" });
  expect(session.finish({ outcomes: [{ ...original, kind: "quotation_read", targets: ["a", "b"], evidenceIds: [read.id] }] }, "relabel").issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "changed_outcome" })]));
  const comparison = session.register("compare", { toolName: "compare_quotes", kind: "comparison", targets: ["a", "b"], disposition: "completed" });
  expect(session.finish({ outcomes: [{ ...original, targets: ["a", "b"], evidenceIds: [comparison.id] }] }, "fixed").status).toBe("ready_for_final_check");
  expect(session.acceptStep([{ toolName: "finish_turn", toolCallId: "fixed" }])).toBe(true);
});

it("rejects unsupported monetary prose beside valid evidence and preserves the repaired question", () => {
  const session = new CompletionSession();
  const evidence = session.register("sum", { toolName: "calculate_charges", kind: "calculation", targets: ["sum"], disposition: "completed", required: true });
  const result: FinishTurnInput["outcomes"][number] = { id: "sum", requestedOutcome: "Calculate the supplied expression", kind: "calculation", targets: ["sum"], evidenceIds: [evidence.id] };
  expect(session.finish({ outcomes: [result], response: "Total RON 999999." }, "unsupported").issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "unsupported_financial_response" })]));
  expect(session.acceptStep([{ toolName: "finish_turn", toolCallId: "unsupported" }])).toBe(false);
  const response = "What is the certificate price? Please try all 3 options.";
  expect(session.finish({ outcomes: [result], response }, "question").status).toBe("ready_for_final_check");
  expect(session.acceptStep([{ toolName: "finish_turn", toolCallId: "question" }])).toBe(true);
  expect(session.completion()?.response).toBe(response);
});

it("binds a combined report outcome to the actual stage and precision set", () => {
  const session = new CompletionSession();
  const line = session.register("line", { toolName: "read_quotes", kind: "quotation_read", targets: ["a"], disposition: "completed", reportingView: { stage: "line", decimals: 2 } });
  const total = session.register("total", { toolName: "read_quotes", kind: "quotation_read", targets: ["a"], disposition: "completed", reportingView: { stage: "total", decimals: 2 } });
  const declared = { id: "reports", requestedOutcome: "Show both requested reports", kind: "quotation_read" as const, targets: ["a"], reportingViews: [{ stage: "line" as const, decimals: 2 }, { stage: "total" as const, decimals: 2 }] };
  expect(session.finish({ outcomes: [{ ...declared, evidenceIds: [line.id] }] }, "missing-view").issues).toContainEqual(expect.objectContaining({ code: "wrong_reporting_views" }));
  expect(session.finish({ outcomes: [{ ...declared, evidenceIds: [line.id, total.id] }] }, "both").status).toBe("ready_for_final_check");
  expect(session.acceptStep([{ toolName: "finish_turn", toolCallId: "both" }])).toBe(true);
  expect(session.finish({ outcomes: [{ ...declared, reportingViews: [{ stage: "line", decimals: 2 }], evidenceIds: [line.id] }] }, "drop-view").issues).toContainEqual(expect.objectContaining({ code: "changed_outcome" }));
});

it("does not substitute another quotation's report precision", () => {
  const session = new CompletionSession();
  const a = session.register("a", { toolName: "read_quotes", kind: "quotation_read", targets: ["a"], disposition: "completed", reportingView: { stage: "total", decimals: 2 } });
  const b = session.register("b", { toolName: "read_quotes", kind: "quotation_read", targets: ["b"], disposition: "completed", reportingView: { stage: "total", decimals: 3 } });
  const result = session.finish({ outcomes: [{ id: "both", requestedOutcome: "Both precisions for both quotes", kind: "quotation_read", targets: ["a", "b"],
    reportingViews: [{ stage: "total", decimals: 2 }, { stage: "total", decimals: 3 }], evidenceIds: [a.id, b.id] }] }, "finish");
  expect(result.issues).toContainEqual(expect.objectContaining({ code: "wrong_reporting_targets" }));
});

it("does not use a rounded report as exact-only or wrong-precision read evidence", () => {
  for (const reportingViews of [undefined, [{ stage: "total" as const, decimals: 3 }], [{ stage: "line" as const, decimals: 2 }]]) {
    const session = new CompletionSession();
    const read = session.register("read", { toolName: "read_quotes", kind: "quotation_read", targets: ["a"], disposition: "completed", reportingView: { stage: "total", decimals: 2 } });
    expect(session.finish({ outcomes: [{ id: "read", requestedOutcome: "Requested view", kind: "quotation_read", targets: ["a"], reportingViews, evidenceIds: [read.id] }] }, "finish").issues).toContainEqual(expect.objectContaining({ code: "wrong_reporting_views" }));
    expect(session.acceptStep([{ toolName: "finish_turn", toolCallId: "finish" }])).toBe(false);
  }
});

it("keeps exact-only read declarations compatible and includes exact when combining views", () => {
  const session = new CompletionSession();
  const exact = session.register("exact", { toolName: "read_quotes", kind: "quotation_read", targets: ["a"], disposition: "completed", reportingView: { stage: "exact" } });
  expect(session.finish({ outcomes: [{ id: "exact", requestedOutcome: "Read exact values", kind: "quotation_read", targets: ["a"], evidenceIds: [exact.id] }] }, "exact-finish").status).toBe("ready_for_final_check");
  const combined = new CompletionSession();
  const a = combined.register("exact", { toolName: "read_quotes", kind: "quotation_read", targets: ["a"], disposition: "completed", reportingView: { stage: "exact" } });
  const b = combined.register("rounded", { toolName: "read_quotes", kind: "quotation_read", targets: ["a"], disposition: "completed", reportingView: { stage: "total", decimals: 2 } });
  const input: FinishTurnInput = { outcomes: [{ id: "views", requestedOutcome: "Exact and rounded views", kind: "quotation_read", targets: ["a"], reportingViews: [{ stage: "exact" }, { stage: "total", decimals: 2 }], evidenceIds: [a.id, b.id] }] };
  expect(combined.finish(input, "combined").status).toBe("ready_for_final_check");
  expect(combined.acceptStep([{ toolName: "finish_turn", toolCallId: "combined" }])).toBe(true);
});
