import { describe, expect, it } from "vitest";
import { extractNumbers, unsupportedNumbers } from "../../src/lib/berthwise/number-guard";
import { compactHistory } from "../../src/lib/berthwise/history";
import { assistantText, numberSources, withoutNarration } from "../../src/lib/berthwise/answer";
import type { ModelMessage } from "ai";

describe("number guard", () => {
  it("reads Indian and Western digit grouping", () => {
    expect(extractNumbers("₹4,04,722 and USD 21,339.12 for 32,450 GRT")).toEqual(["404722", "21339.12", "32450"]);
  });

  it("allows figures from tool results, including rounding to fewer decimals", () => {
    const tool = { total: "21339.12", gt: "32450", rate: "0.0137" };
    expect(unsupportedNumbers("Berth hire is about USD 21,339 (32,450 GRT × USD 0.0137 per hour).", [tool])).toEqual([]);
    expect(unsupportedNumbers("Berth hire is USD 21,339.12.", [tool])).toEqual([]);
  });

  it("rejects invented figures and invented precision", () => {
    const tool = { total: "21339.12" };
    expect(unsupportedNumbers("With 18% GST that is USD 25,180.16.", [tool])).toEqual(["18", "25180.16"]);
    expect(unsupportedNumbers("About USD 21,340.", [tool])).toEqual(["21340"]);
    expect(unsupportedNumbers("Exactly USD 21,339.125.", [tool])).toEqual(["21339.125"]);
  });

  it("always allows small counts, days and years", () => {
    expect(unsupportedNumbers("2 tugs, 18 October 2026, inward and outward", [])).toEqual([]);
  });

  it("allows figures the user typed", () => {
    expect(unsupportedNumbers("For a 30,000 GT ship over 48 hours", ["30000 GT ship, 48 hours"])).toEqual([]);
  });
});

describe("answer helpers", () => {
  const step: ModelMessage[] = [
    { role: "assistant", content: [{ type: "text", text: "Let me check 99,999." }, { type: "tool-call", toolCallId: "c1", toolName: "calculate", input: { expression: "1+1" } }] },
    { role: "tool", content: [{ type: "tool-result", toolCallId: "c1", toolName: "calculate", output: { type: "json", value: { result: "2" } } }] },
  ];

  it("drops narration written alongside tool calls", () => {
    const kept = withoutNarration(step);
    expect(JSON.stringify(kept)).not.toContain("99,999");
    expect(kept).toHaveLength(2);
  });

  it("collects figures from users, earlier answers and tool results, not from tool inputs", () => {
    const sources = numberSources([{ role: "user", content: "Ship of 30,000 GT" }, ...withoutNarration(step), { role: "assistant", content: "Earlier answer: USD 7,632." }]);
    expect(unsupportedNumbers("30,000 and 7,632", sources)).toEqual([]);
    expect(unsupportedNumbers("99,999", sources)).toEqual(["99999"]);
  });

  it("reads the final written answer", () => {
    expect(assistantText([{ role: "assistant", content: [{ type: "text", text: "Done." }] }])).toBe("Done.");
  });
});

describe("history compaction", () => {
  it("keeps the current turn whole and shrinks earlier tool results to their summary", () => {
    const history = compactHistory([
      { role: "user", content: "First" },
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "e1", toolName: "estimate_port_call", input: { port: "Mumbai", terminal: null } }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "e1", toolName: "estimate_port_call", output: { type: "json", value: { summary: "Mumbai USD 1", card: { kind: "estimate" } } } }] },
      { role: "assistant", content: "Answer" },
      { role: "user", content: "Second" },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "e2", toolName: "estimate_port_call", output: { type: "json", value: { summary: "kept", card: { kind: "estimate" } } } }] },
    ]);
    expect(history[1]).toMatchObject({ content: [{ input: { port: "Mumbai" } }] });
    expect(JSON.stringify(history[1])).not.toContain("terminal");
    expect(history[2]).toMatchObject({ content: [{ output: { type: "json", value: { summary: "Mumbai USD 1" } } }] });
    expect(JSON.stringify(history[2])).not.toContain("card");
    expect(JSON.stringify(history[5])).toContain("card");
  });
});
