import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { buildCallContext } from "../../src/lib/migration/call-context";
import { prepareOfficialBerth, calculateOfficialBerth } from "../../src/lib/migration/official-berth";
import { mumbaiProposal, nonfinancialProposal } from "./conversation-fixtures";
import { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";
const original=JSON.parse(readFileSync("output/actual-tariff-20261015/independent/input-v1.json","utf8")).user_message as string;
const binding={runId:"input-regression",fence:1,revision:1};
const prepare=(text:string)=>prepareOfficialBerth(buildCallContext([{role:"user",content:text}]),binding);
const usage={inputTokens:{total:1,noCache:1,cacheRead:undefined,cacheWrite:undefined},outputTokens:{total:1,text:1,reasoning:undefined}};

it.each([
  ["discharged steel coils with priority berthing","priority"],
  ["discharged steel coils under a penalty","penalty"],
  ["discharged steel coils with special rebate","rebate"],
  ["discharged steel coils with ousting priority","ousting"],
  ["discharged priority steel coils","priority"],
])("requires focused resolution of governing cargo conflict: %s",async(cargo,field)=>{
  const p=await prepare(original.replace("discharged steel coils",cargo));expect(p?.status).toBe("needs-facts");
  if(p?.status!=="needs-facts")throw new Error("Contradictory ordinary eligibility certified");
  expect(p.missing.join(" ")).toMatch(/conflict/i);expect(p.missing.join(" ")).toContain(field);expect(p.missing.length).toBeLessThanOrEqual(2);
});
it("does not swallow an unsupported modifier as a commodity name",async()=>{
  expect((await prepare(original.replace("discharged steel coils","discharged steel coils with refrigerated handling")))?.status).toBe("needs-facts");
});
it.each([
  ["came from Mormugao","came from Mormugao with priority berthing","priority"],
  ["sailed for New Mangalore","sailed for New Mangalore under a penalty","penalty"],
])("checks governing conflicts independently of neutral narrative coverage: %s",async(before,after,field)=>{
  const p=await prepare(original.replace(before,after));expect(p?.status).toBe("needs-facts");
  if(p?.status==="needs-facts")expect(p.missing.join(" ")).toContain("conflicting "+field);
});
it.each(["loaded bagged rice","discharged hot-rolled steel coils"])("preserves neutral cargo descriptions: %s",async cargo=>{
  const p=await prepare(original.replace("discharged steel coils",cargo));expect(p?.status).toBe("ready");if(p?.status==="ready")expect(calculateOfficialBerth(p.plan).amounts.total).toBe("51094.00");
});
it.each([["Saffron Estuary","Priority Mariner"],["Mormugao","Priority Harbour"]])("keeps names separate from operating conditions: %s",async(before,after)=>{
  const p=await prepare(original.replace(before,after));expect(p?.status).toBe("ready");if(p?.status==="ready")expect(calculateOfficialBerth(p.plan).amounts.total).toBe("51094.00");
});
const ruleQuestions=[
  "Please explain the berth-hire and GST rules at Mumbai Port Authority's Indira Dock.",
  "Please explain how you calculate berth-hire and GST at Mumbai Port Authority's Indira Dock.",
  "How is berth-hire and GST determined at Mumbai Port Authority's Indira Dock?",
];
it.each(ruleQuestions)("leaves ordinary rule questions on their existing path: %s",async text=>{
  expect(await prepare(text)).toBeUndefined();
});
it("explains the source-bound rule without vessel quote intake",async()=>{
  const p=nonfinancialProposal(ruleQuestions[0]);p.tasks[0]={...p.tasks[0],kind:"rule",source:"official",charges:["berth","gst"]};
  p.operations=[{scopeId:"request",field:"port",operation:"assert",value:"mumbai",unit:"",evidence:{inputId:p.inputIds[0],quote:"Mumbai Port Authority's Indira Dock"}}];
  const model=new MockLanguageModelV4({doGenerate:{content:[{type:"tool-call",toolName:"interpret_request",toolCallId:"interpret",input:JSON.stringify(p)}],usage,warnings:[],finishReason:{unified:"tool-calls",raw:undefined}}});
  const result=await createMigrationMainAgent({alias:"model-1",mainModel:model}).generate({prompt:ruleQuestions[0]});
  expect(model.doGenerateCalls).toHaveLength(1);expect(result.text).toContain("not a vessel quote");expect(result.text).toContain("CGST 9%");expect(result.text).not.toContain("please confirm");
});
it("asks only about the scoped contradiction before calculating a quote",async()=>{
  const question=original.replace("discharged steel coils","discharged steel coils with priority berthing");
  const p=mumbaiProposal([{role:"user",content:question}]);
  p.unresolved=[{scopeId:"call",question:"Conflicting priority information: does priority berthing apply?",taskIds:["berth"],evidence:{inputId:p.inputIds[0],quote:"discharged steel coils with priority berthing"}}];
  const model=new MockLanguageModelV4({doGenerate:{content:[{type:"tool-call",toolName:"interpret_request",toolCallId:"interpret",input:JSON.stringify(p)}],usage,warnings:[],finishReason:{unified:"tool-calls",raw:undefined}}});
  const result=await createMigrationMainAgent({alias:"model-1",mainModel:model}).generate({prompt:question});
  expect(result.text).toMatch(/conflict.*priority|priority.*conflict/i);expect(result.text).not.toContain("51,094");expect(model.doGenerateCalls).toHaveLength(1);
});
