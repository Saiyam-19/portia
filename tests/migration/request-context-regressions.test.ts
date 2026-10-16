import { runInterpreted } from "./conversation-harness";
import { projectionProposal, nonfinancialProposal } from "./conversation-fixtures";
import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";
import { RequestEvidence } from "../../src/lib/migration/request-evidence";

const user = (content: string): ModelMessage => ({ role: "user", content });
const read = (...messages: ModelMessage[]) => { const e = new RequestEvidence(); e.initialize(messages); return e; };
const cancelled: ModelMessage[] = [user("Vessel GT 1000; stay 10 hours."), {
  role: "tool", content: [{ type: "tool-result", toolCallId: "details", toolName: "ask_user_input",
    output: { type: "json", value: { cancelled: true, values: { gt: "2000" }, note: "Correction: GT 3000. Cancel this form." } } }],
}];
const corrected: ModelMessage[] = [
  user("All fast 14 October 2026 10:00 UTC; last line away 14 October 2026 12:00 UTC."),
  user("Correction: last line away 14 October 2026 13:00 UTC."),
];
describe("stage 3A baseline regressions and positive neighbors", () => {
  it.each([
    ["GTI", "gateway-terminals-india-pvt-ltd"], ["Gateway Terminals India", "gateway-terminals-india-pvt-ltd"],
    ["NSIGT", "nhava-sheva-gateway-terminal"], ["NSICT", "nhava-sheva-international-container-terminal"],
    ["KLL", "konkan-lng-ltd"], ["Finolex jetty in Ranpar", "ranpar-finolex"],
  ])("CE-03 accepts the reviewed %s identity", (name, slug) => {
    expect(read(user(`Explain the ${name} tariff.`)).authorizePort(slug)).toBe(true);
  });
  it("does not turn generic Gateway into either terminal", () => {
    for (const slug of ["gateway-terminals-india-pvt-ltd", "nhava-sheva-gateway-terminal"])
      expect(read(user("Explain the Gateway tariff.")).authorizePort(slug)).toBe(false);
  });
  it("does not authorize Mumbai Port from an explicit BMCT terminal name", () => {
    expect(read(user("Estimate Bharat Mumbai Container Terminals berth hire.")).authorizePort("mumbai")).toBe(false);
    expect(read(user("Estimate Bharat Mumbai Container Terminals berth hire.")).authorizePort("mumbai-container-terminal")).toBe(true);
  });
  it("CE-05 ignores cancelled values, preserves the note and independent facts", () => {
    const e = read(...cancelled);
    expect(e.particulars()).toContain("GT: 3,000");
    expect(e.particulars()).toContain("10 hours");
    expect(e.sourceText).not.toContain("2000");
  });
  it("CE-06 preserves the old start while replacing only the corrected end", () => {
    const e = read(...corrected);
    expect(e.timeSummary()).toContain("3 hours");
    expect(e.timeInput({ start: "14 October 2026 10:00 UTC", end: "14 October 2026 13:00 UTC" })).not.toHaveProperty("error");
    expect(e.timeInput({ start: "14 October 2026 10:00 UTC", end: "14 October 2026 12:00 UTC" })).toHaveProperty("error");
  });
  it("retains event corrections through an unrelated later question", () => {
    expect(read(...corrected, user("Explain elapsed versus billable time.")).timeSummary()).toContain("3 hours");
  });
  it("preserves an explicit date-order choice through subsequent field corrections", () => {
    const e = read(user("All times UTC. All fast 04/05/2026 10:00; last line away 04/05/2026 12:00."), user("Use DD/MM/YYYY."), user("Correction: last line away 04/05/2026 13:00."));
    expect(e.forcedResponse).toBeUndefined(); expect(e.timeSummary()).toContain("3 hours");
  });
  it("does not transfer GT and timestamps into a new vessel", () => {
    const e = read(user("For vessel Alpha: GT 9000. All fast 14 October 2026 10:00 UTC; last line away 14 October 2026 12:00 UTC."), user("New vessel Beta: DWT 15000. Estimate Jaigarh charges."));
    expect(e.particulars()).not.toContain("9,000"); expect(e.timeSummary()).toBe("");
  });
  it("does not let a superseded Mumbai port authorize a switched request", () => {
    const e = read(user("Mumbai berth hire. GT 12000; stay 20 hours."), user("Switch to Jaigarh instead of Mumbai; keep the same vessel."));
    expect(e.authorizePort("mumbai")).toBe(false);
    expect(read(user("Mumbai berth hire."), user("Switch to Jaigarh instead of Mumbai.")).authorizePort("jaigarh")).toBe(true);
  });
  it("does not label an old rejected GT as the current correction", () => {
    const e = read(user("GT 18000; stay 30 hours."), user("The GT is 16800, not 18000. Everything else stays the same."));
    expect(e.particulars()).toContain("16,800"); expect(e.particulars()).toContain("30 hours");
  });
});

describe.each(["generate", "stream"] as const)("actual main-agent %s context path", mode => {
  it("routes a GTI rule question to the right reviewed source without a form", async () => {
    const messages=[user("Explain the GTI dwell tariff; I only want the rule.")];
    const proposal=await projectionProposal(messages);proposal.tasks[0]={...proposal.tasks[0],kind:"rule",source:"official",charges:["berth"]};
    const result=await runInterpreted(messages,mode,{proposal});
    expect(result.text).toContain("GTI general note 5");expect(result.text).toContain("per hour");expect(result.text).not.toContain("please confirm");
    expect(result.conversation.answer?.items[0].sourceClass).toBe("official-tariff");expect(result.calls).toBe(1);
  });
  it("calculates using the corrected end and preserved start", async () => {
    const result=await runInterpreted(corrected,mode,{kind:"elapsed"});
    expect(result.text).toContain("3 hours");expect(result.text).toContain("separate from tariff billing time");
    expect(JSON.stringify(result.conversation.answer?.items[0].calculation)).toContain('"elapsedHours":"3"');
  });
  it("sends corrected cancellation facts to bound execution", async () => {
    const result=await runInterpreted(cancelled,mode);
    expect(result.currentFacts.find(f=>f.field==="gt")?.value).toBe("3000");expect(result.currentFacts.find(f=>f.field==="durationHours")?.value).toBe("10");
    expect(result.currentFacts.some(f=>f.value==="2000")).toBe(false);
    const calls=mode==="generate"?result.model.doGenerateCalls:result.model.doStreamCalls;
    const instructions=calls[0].prompt.filter(p=>p.role==="system").map(p=>p.content).join("\n");
    expect(instructions).toContain("GT 3000");expect(instructions).not.toContain('"gt":"2000"');
  });
  it("preserves unfamiliar non-price phrasing without a closed-template refusal", async () => {
    const question="Could you put gross tonnage in everyday language? I'm not requesting a cost estimate.";
    const text="Gross tonnage measures enclosed volume under the applicable tonnage convention; it is not cargo mass.";
    const result=await runInterpreted([user(question)],mode,{proposal:nonfinancialProposal(question),ordinaryAnswer:text});
    expect(result.text).toBe(text);expect(result.calls).toBe(2);
  });
});
