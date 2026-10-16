import { describe, expect, it } from "vitest";
import { runInterpreted } from "./conversation-harness";
import { projectionProposal, nonfinancialProposal } from "./conversation-fixtures";
import { conversationInputs, type Interpretation } from "../../src/lib/migration/conversation";
const user = (content: string) => ({ role: "user" as const, content });
function supplied(question: string) {
  const p = nonfinancialProposal(question), input = conversationInputs([user(question)])[0]; const evidence = (quote: string) => ({ inputId: input.id, quote });
  p.scopes.push({ id: "berth-rule", kind: "quotation-rule", label: "Berth terms", parentId: "request", evidence: evidence(question) });
  p.tasks[0] = { ...p.tasks[0], kind: "quote", source: "supplied", charges: ["berth"], ruleScopeIds: ["berth-rule"] };
  const add = (scopeId: string, field: Interpretation["operations"][number]["field"], value: string, unit: string, quote: string) => p.operations.push({ scopeId, field, value, unit, operation: "assert", evidence: evidence(quote) });
  return { p, add };
}
describe("main-agent independent calculations through typed interpretation", () => {
  it("rejects substituting a supported port tariff for a different requested port", async () => {
    const question = "Estimate Chennai berth hire for GT 18450."; const messages = [user(question)]; const p = await projectionProposal(messages, "quote");
    p.operations.push({ scopeId: p.tasks[0].scopeId, field: "port", value: "mumbai", unit: "", operation: "assert", evidence: { inputId: p.inputIds[0], quote: "Chennai" } });
    const result = await runInterpreted(messages, "generate", { proposal: p });
    expect(result.currentFacts.some(f => f.field === "port" && f.value === "mumbai")).toBe(false); expect(result.conversation.answer?.complete).toBe(false); expect(result.text).not.toMatch(/INR\s*\d/); expect(result.calls).toBe(1);
  });
  it("blocks an invented quote rate and finishes safely without a second provider call", async () => {
    const question = "Estimate berth hire for GT 50000 and a 48-hour stay."; const { p, add } = supplied(question);
    add("request", "gt", "50000", "GT", "GT 50000"); add("request", "durationHours", "48", "hours", "48-hour stay");
    add("berth-rule", "charge", "berth", "", question); add("berth-rule", "rate", "0.05", "money", question); add("berth-rule", "currency", "USD", "", question);
    const result = await runInterpreted([user(question)], "generate", { proposal: p });
    expect(result.currentFacts.some(f => f.field === "rate")).toBe(false); expect(JSON.stringify(result.conversation.answer)).toContain("rate"); expect(result.text).not.toContain("120000"); expect(result.calls).toBe(1);
  });
  it("does not let a model swap reversed user timestamps", async () => {
    const question = "Mumbai, GT 14860. Berthed 20 October 2026 at 18:00 IST; unberthed 19 October 2026 at 06:00 IST. Please calculate.";
    const p = await projectionProposal([user(question)], "elapsed"); const result = await runInterpreted([user(question)], "generate", { proposal: p });
    expect(result.text).toContain("end precedes the start"); expect(result.calls).toBe(1);
    const swapped = structuredClone(p); const start = swapped.operations.find(o => o.field === "berthStart")!, end = swapped.operations.find(o => o.field === "berthEnd")!;
    [start.field, end.field] = [end.field, start.field];
    const attack = await runInterpreted([user(question)], "generate", { proposal: swapped });
    expect(attack.conversation.answer?.complete).toBe(false); expect(attack.text).not.toContain("**36 hours**");
  });
  it("binds invented timestamps to the original single event atoms and retains the verified interval", async () => {
    const question = "All fast 19 October 2026 at 03:00 UTC; last line away 20 October 2026 at 15:30 IST. Estimate berth hire.";
    const p = await projectionProposal([user(question)], "elapsed"); p.operations.find(o => o.field === "berthEnd")!.value = "22 October 2026 at 15:30 IST";
    const result = await runInterpreted([user(question)], "generate", { proposal: p });
    expect(result.text).toContain("31 hours"); expect(result.text).not.toContain("22 October"); expect(result.calls).toBe(1);
    expect(result.currentFacts.find(f => f.field === "berthEnd")?.normalizations).toHaveLength(1);
  });
  it("carries corrected particulars into bound execution without retaining old GT", async () => {
    const result = await runInterpreted([user("GT 22400, foreign-going, alongside for 30 hours at Mumbai."), { role: "assistant", content: "Please confirm berth." }, user("Correction: 22400 was DWT. Actual GT is 14860. Extend the berth stay to 42 hours. Everything else remains the same.")], "generate");
    expect(result.currentFacts.find(f => f.field === "gt")?.value).toBe("14860"); expect(result.currentFacts.find(f => f.field === "durationHours")?.value).toBe("42"); expect(result.currentFacts.some(f => f.field === "gt" && f.value === "22400")).toBe(false);
  });
  it("calculates supplied rates without requiring a port specialist or unrequested tax intake", async () => {
    const question = "Check berth hire for GT 10000, INR 0.25 per GT per hour or part thereof, 24 hours and 1 minute. Round up to whole hours."; const { p, add } = supplied(question);
    add("request", "gt", "10000", "GT", "GT 10000"); add("request", "durationMinutes", "1441", "minutes", "24 hours and 1 minute");
    add("berth-rule", "charge", "berth", "", question); add("berth-rule", "rate", "0.25", "money", "INR 0.25 per GT per hour or part thereof"); add("berth-rule", "currency", "INR", "", "INR 0.25");
    add("berth-rule", "basis", "gt-period", "", "per GT per hour or part thereof"); add("berth-rule", "periodHours", "1", "hours", "per hour or part thereof"); add("berth-rule", "rounding", "started", "", "Round up to whole hours");
    const result = await runInterpreted([user(question)], "generate", { proposal: p });
    expect(result.text).toContain("INR 62,500.00"); expect(result.text).toContain("billable periods 25"); expect(result.text).toContain("tax is outside this calculation"); expect(result.calls).toBe(1);
  });
  it("can normalize raw timestamps and calculate elapsed time without tariff coverage", async () => {
    const question = "Calculate elapsed occupancy from 19 October 2026 at 03:00 UTC to 20 October 2026 at 15:30 IST.";
    const result = await runInterpreted([user(question)], "generate", { kind: "elapsed" });
    expect(result.text).toContain("31 hours"); expect(result.conversation.answer?.items[0].status).toBe("calculated"); expect(result.calls).toBe(1);
  });
});
