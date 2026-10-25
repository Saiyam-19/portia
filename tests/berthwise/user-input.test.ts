import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";
import type { ZodType } from "zod";
import { keepRate, keepShip, keepStay, readConversation } from "../../src/lib/berthwise/user-input";
import { businessTools } from "../../src/lib/berthwise/tools";

const user = (content: string): ModelMessage => ({ role: "user", content });
const assistant = (content: string): ModelMessage => ({ role: "assistant", content });

describe("what the user actually said", () => {
  it("keeps the stay the user gave and refuses a made-up exchange rate (Codex finding 4)", () => {
    const heard = readConversation([user("Paradip, 30,000 GRT bulk ship, 24 hours alongside")]);
    expect(keepStay({ hoursAlongside: "48" }, heard).hoursAlongside).toBe("24");
    expect(keepStay({ hoursAlongside: "24" }, heard).hoursAlongside).toBe("24");
    expect(keepRate("24", heard)).toBeUndefined();
    expect(keepRate("84.5", readConversation([user("total in rupees at 84.5 per dollar")]))).toBe("84.5");
    expect(keepRate("84.5", readConversation([user("use ₹84.5/USD")]))).toBe("84.5");
  });

  it("reads durations in everyday words", () => {
    const heard = readConversation([user("about a day alongside at Mundra, 2 days at Chennai, then 36 hrs and half a day at anchorage")])!;
    expect([...heard.durations].sort((a, b) => a - b)).toEqual([12, 24, 36, 48]);
  });

  it("takes a bare number as the answer to the assistant's question (Codex finding 10)", () => {
    const heard = readConversation([user("Estimate Paradip for a bulk ship, 24 hours"), assistant("What is the ship's gross tonnage (GRT)?"), user("30000")]);
    expect(keepShip({ grt: "30000" }, heard)).toEqual({ grt: "30000" });
    const rate = readConversation([user("Give me the Mundra total in rupees"), assistant("Which exchange rate should I use, in rupees per US dollar?"), user("84.5")]);
    expect(keepRate("84.5", rate)).toBe("84.5");
    expect(keepShip({ grt: "30000", nrt: "30000" }, heard)).toEqual({ grt: "30000" });
  });

  it("changes nothing when there is no conversation", () => {
    expect(keepStay({ hoursAlongside: "48" }, undefined)).toEqual({ hoursAlongside: "48" });
    expect(keepRate("84.5", undefined)).toBe("84.5");
  });

  it("reaches the estimate tool: Codex's Paradip case prices 24 hours with no conversion", async () => {
    const tool = businessTools().estimate_port_call!;
    const input = (tool.inputSchema as ZodType).parse({ ship: { grt: "30000", type: "bulk", status: "foreign" }, calls: [{ port: "Paradip", date: "2026-10-26", hoursAlongside: "48" }], usdToInr: "24" });
    const result = await tool.execute!(input as never, { toolCallId: "t", messages: [user("Paradip, foreign-going bulk ship of 30,000 GRT, 24 hours alongside")], context: {} } as never) as { card: { calls: Array<{ estimate: { totals: Array<{ amount: string }> } }>; inRupees?: unknown } };
    expect(result.card.calls[0]!.estimate.totals).toEqual([expect.objectContaining({ amount: "40858.32" })]);
    expect(result.card.inRupees).toBeUndefined();
  });
});
