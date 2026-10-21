import {expect,it} from "vitest";
import {CompletionSession} from "../../src/lib/portia/completion";
import {REMAINING_OBLIGATIONS_LIMIT_MESSAGE,renderRemainingObligations} from "../../src/lib/portia/remaining-obligations";

it("removes only the exact approved branch and marks changed quote evidence stale",()=>{
  const completion=new CompletionSession(),approvedOperation="00000000-0000-4000-8000-000000000001",otherOperation="00000000-0000-4000-8000-000000000002";
  completion.register("quote",{toolName:"supplied_quote",kind:"quotation",disposition:"awaiting_approval",targets:["quote-a"],required:true,operationId:approvedOperation});
  const fullQuestion="Provide direct EUR to USD rate: "+"x".repeat(900);
  completion.register("compare",{toolName:"compare_quotes",kind:"comparison",disposition:"awaiting_input",targets:["quote-a","quote-b"],required:true,questions:[fullQuestion],reportingView:{stage:"total",decimals:4},quoteState:{quoteIds:["quote-a","quote-b"],digest:"a".repeat(64)}});
  completion.register("other",{toolName:"compare_quotes",kind:"comparison",disposition:"awaiting_approval",targets:["quote-c","quote-d"],required:true,operationId:otherOperation});
  completion.register("failed",{toolName:"calculate_charges",kind:"calculation",disposition:"failed",targets:["stores"],required:true,detail:"Repair the exact expression."});
  const saved=completion.remainingObligations();expect(saved.outcomes).toHaveLength(4);expect(saved.outcomes[1]!.branches[0]!.questions).toEqual([fullQuestion]);
  const text=renderRemainingObligations(saved,{applied:new Set([approvedOperation]),quoteStateDigest:()=>"b".repeat(64)});
  expect(text).not.toContain("quote-a. Awaits a separate exact review");expect(text).toContain("Needs recomputation");expect(text).toContain(fullQuestion);expect(text).toContain("View: total 4 decimals");expect(text).toContain("Awaits a separate exact review");expect(text).toContain("repair remains required");
});
it("fails the whole snapshot instead of truncating tool evidence",()=>{
  const completion=new CompletionSession(),question="q".repeat(65_000);
  completion.register("large",{toolName:"compare_quotes",kind:"comparison",disposition:"awaiting_input",targets:["a","b"],required:true,questions:[question]});
  expect(()=>completion.remainingObligations()).toThrow(REMAINING_OBLIGATIONS_LIMIT_MESSAGE);
});

it("retains a declared comparison that never reached an executed result", () => {
  const completion = new CompletionSession();
  const operationId = "00000000-0000-4000-8000-000000000003";
  const prepared = completion.register("quote", { toolName: "supplied_quote", kind: "quotation", disposition: "awaiting_approval", targets: ["a"], operationId, required: true });
  completion.register("read-b", { toolName: "read_quotes", kind: "quotation_read", disposition: "completed", targets: ["b"] });
  completion.finish({ outcomes: [
    { id: "quote", requestedOutcome: "MODEL narrative", kind: "quotation", targets: ["a"], evidenceIds: [prepared.id] },
    { id: "compare", requestedOutcome: "MODEL financial narrative", kind: "comparison", targets: ["a", "b"], comparisonCurrency: "CAD", evidenceIds: [] },
  ] }, "unfinished");
  const snapshot = completion.remainingObligations();
  const text = renderRemainingObligations(snapshot, { applied: new Set([operationId]), quoteStateDigest: () => "a".repeat(64) });
  expect(text).toContain("Comparison");
  expect(text).toContain("Comparison currency: CAD");
  expect(text).toContain("No matching verified completion");
  expect(JSON.stringify(snapshot)).not.toContain("MODEL");
});

it("keeps different requested comparison currencies distinguishable", () => {
  const completion = new CompletionSession();
  for (const comparisonCurrency of ["CAD", "EUR"]) completion.register(comparisonCurrency, {
    toolName: "compare_quotes", kind: "comparison", disposition: "unavailable", targets: ["a", "b"], comparisonCurrency,
    detail: "Current applicability unavailable.",
  });
  const text = renderRemainingObligations(completion.remainingObligations(), { applied: new Set(), quoteStateDigest: () => "" });
  expect(text).toContain("Comparison currency: CAD");
  expect(text).toContain("Comparison currency: EUR");
});

it("retains unverified report views without claiming that a tool failed", () => {
  const completion = new CompletionSession();
  completion.register("known", { toolName: "read_quotes", kind: "quotation_read", disposition: "completed", targets: ["a"] });
  completion.finish({ outcomes: [{ id: "reports", requestedOutcome: "Both report views", kind: "quotation_read", targets: ["a"],
    reportingViews: [{ stage: "line", decimals: 2 }, { stage: "total", decimals: 2 }], evidenceIds: [] }] }, "not-executed");
  const text = renderRemainingObligations(completion.remainingObligations(), { applied: new Set(), quoteStateDigest: () => "" });
  expect(text).toContain("View: line 2 decimals");
  expect(text).toContain("View: total 2 decimals");
  expect(text).toContain("execution and completion need verification");
  expect(text).not.toContain("Rejected or failed");
});
