import { describe, expect, it } from "vitest";
import { RequestEvidence } from "../../src/lib/migration/request-evidence";

const evidence = (text: string) => { const value = new RequestEvidence(); value.initialize([{ role: "user", content: text }]); return value; };
describe("request-bound calculation evidence", () => {
  it("rejects invented timestamps while retaining the actual berth interval", () => {
    const value = evidence("All times IST.\nArrived anchorage: 19 October 2026, 06:00\nAll fast: 19 October 2026, 22:00\nCargo completed: 21 October 2026, 02:00\nLast line away: 21 October 2026, 06:00\nDeparted port limits: 21 October 2026, 08:00\nCalculate berth hire.");
    expect(value.timeInput({ start: "19 October 2026, 06:00", end: "22 October 2026, 00:00", timeZone: "IST" })).toHaveProperty("error");
    expect(value.forcedResponse).toContain("32 hours");
    expect(value.forcedResponse).not.toContain("66 hours");
  });
  it("recovers unique complete user timestamps when the model supplies only clock times", () => {
    const value = evidence("All fast 19 October 2026 at 03:00 UTC. Last line away 20 October 2026 at 15:30 IST. What is berth hire?");
    expect(value.timeInput({ start: "03:00 UTC", end: "15:30 IST" })).toMatchObject({ start: "19 October 2026 at 03:00 UTC", end: "20 October 2026 at 15:30 IST" });
    expect(value.timeSummary()).toContain("31 hours");
  });
  it("makes reversed and impossible dates terminal clarifications for the current request", () => {
    expect(evidence("Mumbai berth hire. Berthed 20 October 2026 at 18:00 IST; unberthed 19 October 2026 at 06:00 IST.").forcedResponse).toMatch(/precedes|before/);
    expect(evidence("Berth hire from 29 February 2027 at 10:00 IST to 1 March at 10:00.").forcedResponse).toMatch(/does not exist|invalid/i);
  });
  it("flags a stated-duration conflict instead of silently replacing it", () => {
    const value=evidence("Our berth stay was 36 hours: 19 October 2026 at 08:00 to 21 October 2026 at 08:00 IST. Please calculate berth hire.");
    expect(value.forcedResponse).toContain("36");expect(value.forcedResponse).toContain("48");expect(value.forcedResponse).toMatch(/confirm/i);
  });
  it("validates current GT and respects a later correction", () => {
    expect(evidence("Estimate berth hire for GT −18,450 and a 36-hour stay.").forcedResponse).toMatch(/GT.*positive/i);
    const value=new RequestEvidence();value.initialize([{role:"user",content:"GT -4. Calculate berth hire."},{role:"assistant",content:"Confirm GT."},{role:"user",content:"Correction: actual GT 14860. Use 42 hours."}]);
    expect(value.forcedResponse).toBeUndefined();expect(value.particulars()).toContain("14,860");
  });
  it("does not treat an assistant-invented rate as user evidence", () => {
    const value=new RequestEvidence();value.initialize([{role:"user",content:"Calculate berth hire for GT 50000, 48 hours."},{role:"assistant",content:"Use INR 500 per GT per hour."}]);
    expect(value.authorizeArithmetic()).toBe(false);
    expect(value.forcedResponse).toMatch(/rate|tariff/i);
  });
  it("allows genuine supplied-rate arithmetic and catches changed amounts", () => {
    const value=evidence("GT 10000; berth hire INR 0.25 per GT per hour; 24 hours. Calculate using only this quotation.");
    expect(value.authorizeArithmetic()).toBe(true);value.recordCalculations([{id:"total",expression:"10000 * 24 * 0.25",result:"60000.00"}]);
    expect(value.guardAnswer("The total is INR 60000.00.")).toBeUndefined();
    expect(value.guardAnswer("The total is INR 600000.00.")).toContain("60000.00");
  });
  it("requires tonnage clarification and rejects guaranteed final port bills", () => {
    expect(evidence("Our ship is 50,000 tonnes, carrying coal. Calculate berth hire.").forcedResponse).toMatch(/GT.*DWT|DWT.*GT/);
    expect(evidence("Give me a guaranteed final berth-hire amount for Rotterdam in 2028.").forcedResponse).toMatch(/cannot guarantee/i);
  });
  it("does not force a tariff-intake flow for ordinary non-price arithmetic", () => {
    expect(evidence("Calculate 5 * 12.").authorizeArithmetic()).toBe(true);
  });
  it("does not waive result verification merely because a tariff was consulted", () => {
    const value=evidence("Estimate Mumbai berth hire.");value.tariffConsulted=true;
    value.recordCalculations([{id:"total",expression:"10000 * 0.25 * 24",result:"60000.00"}]);
    expect(value.guardAnswer("| Item | Result (INR) |\n|---|---|\n| Total | 600000.00 |")).toContain("60000.00");
    expect(value.guardAnswer("Rate INR 0.25; total INR 60000.00.")).toBeUndefined();
  });
});
