import { projectionProposal } from "./conversation-fixtures";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { buildCallContext } from "../../src/lib/migration/call-context";
import { prepareSuppliedQuotation, calculateSuppliedQuotation } from "../../src/lib/migration/supplied-quotation";
import { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";

const binding = { runId: "rule-regression", fence: 1, revision: 1 };
const compile = (text: string) => prepareSuppliedQuotation(buildCallContext([{ role: "user", content: text }]), binding);
const base = "Supplied quotation: GT 1000; stay 2 hours. Berth hire USD 0.075 per GT per hour. No taxes. Calculate total.";
const d01 = JSON.parse(readFileSync("tests/acceptance/portia/development.json", "utf8")).cases.find((c: {id: string}) => c.id === "D01").steps[0].text as string;

it.each([
  base.replace("No taxes.", "First hour free. No taxes."),
  base.replace("per hour.", "per hour, waived for coastal calls. This is a coastal call."),
  base.replace("Supplied quotation:", "Supplied quotation: First hour free."),
  base.replace("per hour.", "per hour subject to a coastal exemption."),
  base + " Berth hire is waived.",
])("does not certify a partially understood governing clause: %s", text => {
  expect(compile(text)).toBeUndefined();
});

it.each([
  "Round the final total up to whole dollars.",
  "Round each charge up to the next whole dollar.",
  "Round the total berth stay down to the previous whole hour.",
])("does not reinterpret an unsupported rounding target: %s", rule => {
  expect(compile(base.replace("2 hours", "1.1 hours").replace("No taxes.", rule + " No taxes."))).toBeUndefined();
});

it.each(["twenty one", "twenty-one", "one hundred and one"])("never promotes a suffix of '%s movements'", quantity => {
  expect(compile(d01.replace("two movements", quantity + " movements"))).toBeUndefined();
});

it.each([
  [base, "USD 150.00"],
  [base.replace("hire USD", "hire IS USD").toUpperCase(), "USD 150.00"],
  [base.replace("2 hours", "1.1 hours"), "USD 82.50"],
  [base.replace("2 hours", "1.1 hours").replace("No taxes.", "Round the total berth stay up to the next whole hour. No taxes."), "USD 150.00"],
  [base.replace("2 hours", "1.1 hours").replace("per hour.", "per hour or part thereof."), "USD 150.00"],
  [d01.replace("two movements", "21 movements"), "USD 27,075.00"],
  [d01.replace("two movements", "twenty movements"), "USD 25,875.00"],
])("preserves supported positive rule: %s", (text, amount) => {
  const plan = compile(text);expect(plan).toBeDefined();
  expect(calculateSuppliedQuotation(plan!).totals[0].displayAmount).toBe(amount);
});

it("preserves the full unsupported quote for the existing agent path", async () => {
  const text = base.replace("No taxes.", "First hour free. No taxes.");
  const model = new MockLanguageModelV4({ doGenerate: async ({prompt,tools}) => {
    expect(JSON.stringify(prompt)).toContain(text);
    expect(JSON.stringify(prompt)).not.toContain("CURRENT_SUPPLIED_QUOTE_ID=");
    expect(tools?.some(t => t.name === "calculate_supplied_quote")).toBe(false);
    const p=await projectionProposal([{role:"user",content:text}],"quote");p.tasks[0].source="supplied";p.unresolved=[{scopeId:p.tasks[0].scopeId,taskIds:[p.tasks[0].id],question:"The free-hour condition needs interpretation.",evidence:{inputId:p.inputIds[0],quote:text}}];
    return {content:[{type:"tool-call",toolName:"interpret_request",toolCallId:"interpret",input:JSON.stringify(p)}],finishReason:{unified:"tool-calls",raw:undefined},warnings:[],usage:{inputTokens:{total:1,noCache:1,cacheRead:undefined,cacheWrite:undefined},outputTokens:{total:1,text:1,reasoning:undefined}}};
  } });
  await createMigrationMainAgent({alias:"model-1",mainModel:model}).generate({prompt:text});
  expect(model.doGenerateCalls).toHaveLength(1);
});
