import { expect, it } from "vitest";
import { conversationInputs, emptyConversation, reduceInterpretation, type Interpretation } from "../../src/lib/migration/conversation";
import { planConversationAnswer, renderConversationAnswer } from "../../src/lib/migration/conversation-rules";
const binding = { runId: "components", fence: 1, revision: 1 };
function state(port: string, gt: string, hours: string) {
  const message = `Port ${port}; GT ${gt}; stay ${hours} hours; foreign-going tanker discharging cargo. Call 12 November 2026. Calculate berth and port dues.`;
  const inputs = conversationInputs([{ role: "user", content: message }]); const e = (quote: string) => ({ inputId: inputs[0].id, quote });
  const p: Interpretation = { version: 1, baseHash: emptyConversation().hash, inputIds: [inputs[0].id], scopes: [{ id: "call", kind: "call", label: "Current call", parentId: null, evidence: e(message) }], tasks: [{ id: "quote", scopeId: "call", kind: "quote", source: "official", charges: port === "GTI" ? ["berth"] : ["berth", "port-dues"], ruleScopeIds: [], evidence: e(message) }], unresolved: [], operations: [] };
  for (const [field, value, unit, quote] of [
    ["port", port === "GTI" ? "gateway-terminals-india-pvt-ltd" : "jsw-jnpt-liquid-terminal", "", port], ["gt", gt, "GT", `GT ${gt}`], ["durationHours", hours, "hours", `stay ${hours} hours`],
    ["service", "foreign", "", "foreign-going"], ["vesselCategory", "tanker", "", "tanker"], ["cargoOperation", "discharging", "", "discharging cargo"], ["callDate", "12 November 2026", "timestamp", "Call 12 November 2026"],
  ] as const) p.operations.push({ scopeId: "call", field, value, unit, operation: "assert", evidence: e(quote) });
  return reduceInterpretation(emptyConversation(), p, inputs).state;
}
it("uses the same operation family for GTI and JSW while retaining source boundaries", async () => {
  const gti = await planConversationAnswer(state("GTI", "28600", "14"), binding);
  expect(renderConversationAnswer(gti)).toContain("USD 2,122.12");
  expect(gti.complete).toBe(true); expect(gti.items[0].body).toContain("not a complete bill");
  const jsw = await planConversationAnswer(state("JSW JNPT Liquid Terminal", "16800", "30"), binding);
  expect(renderConversationAnswer(jsw)).toContain("USD 2,671.20"); expect(renderConversationAnswer(jsw)).toContain("USD 2,617.44");
  expect(renderConversationAnswer(jsw)).toContain("USD 5,288.64"); expect(jsw.complete).toBe(true); expect(jsw.items[0].body).toContain("not a complete bill");
});
it("changed quantities remain calculations, with no encoded expected totals", async () => {
  const changed = await planConversationAnswer(state("GTI", "10000", "3.5"), binding);
  expect(renderConversationAnswer(changed)).toContain("USD 212.00");
});
