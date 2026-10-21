import { expect, it } from "vitest";
import { CompletionSession } from "../../src/lib/portia/completion";
import { suppliedQuoteSchema } from "../../src/lib/portia/agent-inputs";
import { nullableToolSchema } from "../../src/lib/portia/tool-schema";
import { calculateSupplied, type Quote } from "../../src/lib/portia/quotes";
import { QuoteSession } from "../../src/lib/portia/session";
import { AuthoritySession } from "../../src/lib/authority/session";
import { recordDecisionEvidence } from "../../src/lib/portia/decision-evidence";
import { remainingObligationsSchema, renderRemainingObligations } from "../../src/lib/portia/remaining-obligations";

const quotation = (lines: Quote["lines"], call: Quote["call"] = {}): Quote => ({id:"q",revision:0,name:"Source",pricing:"supplied",call,lines,terms:{},services:[]});
it("preserves tonnes times movements as separate factors and leaves a missing factor unresolved", () => {
  const line = {name:"Transfer",currency:"USD",rate:"2.5",unit:"tonne-movement" as const,quantity:"12",movements:"3",perQuantity:"1",perMovements:"1"};
  expect(calculateSupplied(quotation([line])).totals?.[0].amount).toBe("90");
  expect(calculateSupplied(quotation([{...line,movements:undefined}])).status).toBe("unresolved");
});
it("accepts GT denominators but rejects GT masquerading as an independent resource", () => {
  const line = {name:"Stay",currency:"USD",rate:"7",unit:"gt-time" as const,perQuantity:"1000",periodHours:"1",commenced:false,duration:{hours:"2"}};
  expect(calculateSupplied(quotation([line],{gt:"5000"})).totals?.[0].amount).toBe("70");
  expect(calculateSupplied(quotation([{...line,resourceQuantity:"5000",resourceLabel:"GT",perResourceQuantity:"5000"}],{gt:"5000"})).status).toBe("unresolved");
});
it("retains unknown tax as unknown in the supplied result", () => {
  const result = calculateSupplied(quotation([{name:"Handling",currency:"USD",amount:"10"}]));
  expect(result.body).toContain("Tax status unknown");
  expect(result.body).not.toContain("tax is outside");
});
it("separates the requested before-tax view from original inclusive terms", () => {
  const quote=quotation([{id:"line",name:"Handling",currency:"USD",amount:"120"}]);
  quote.terms={taxStatus:"included",taxPercent:"20",statedTotals:[{currency:"USD",amount:"120"}]};
  expect(calculateSupplied(quote,["line"],"before-tax").totals?.[0].amount).toBe("100");
  expect(calculateSupplied(quote).totals?.[0].amount).toBe("120");
  expect(quote.terms.taxStatus).toBe("included");
});
it("retains a contradictory supplier total without certifying it", () => {
  const quote=quotation([{name:"Handling",currency:"USD",amount:"120"}]);
  quote.terms={statedTotals:[{currency:"USD",amount:"121"}]};
  expect(calculateSupplied(quote)).toMatchObject({status:"unresolved",questions:expect.arrayContaining([expect.stringContaining("does not match")])});
  expect(quote.terms.statedTotals?.[0].amount).toBe("121");
});
it("selects exact noncontiguous lines and rejects empty or stale selections", async () => {
  const session = new QuoteSession("selected-test"); await session.initialize([]);
  for (const [name,amount] of [["A","10"],["B","14"]]) await session.update({name,pricing:"supplied",lines:[
    {name:"First",currency:"USD",amount,coverage:["loading"]},
    {name:"Excluded",currency:"USD",amount:"900"},
    {name:"Last",currency:"USD",amount:"5",coverage:["unloading"]},
  ]});
  const quotes=[...session.quotes.values()];
  const selections=quotes.map(q=>({quoteId:q.id,revision:q.revision,lineIds:[q.lines[0].id!,q.lines[2].id!]}));
  const input={quoteIds:quotes.map(q=>q.id),selections,currency:"USD"};
  const result=await session.compare(input);
  expect(result).toMatchObject({status:"calculated",difference:"4"});
  expect(result.body).toContain("USD 15.00"); expect(result.body).not.toContain("915");
  expect(result.body).toContain("Tax status unknown");
  await expect(session.compare({...input,selections:selections.map(s=>({...s,lineIds:[]}))})).rejects.toThrow();
  expect(await session.compare({...input,selections:selections.map(s=>({...s,revision:s.revision+1}))})).toMatchObject({status:"error"});
});
it("cannot use selected lines to bypass approval of a saved supplier revision", async () => {
  const session=new QuoteSession("selected-unapproved");await session.initialize([]);
  for(const amount of ["10","12"])await session.update({pricing:"supplied",lines:[{name:"Transfer",amount,currency:"USD",coverage:["transfer"]}]});
  const quotes=[...session.quotes.values()];session.bindAuthority(new AuthoritySession());
  const result=await session.compare({quoteIds:quotes.map(q=>q.id),selections:quotes.map(q=>({quoteId:q.id,revision:q.revision,lineIds:[q.lines[0].id!]})),currency:"USD"});
  expect(result).toMatchObject({status:"unresolved"});
  expect(result.body).toContain("approval");expect(result.body).not.toContain("lower total");
});
it("keeps stable line identity and percentage dependencies across a label correction",async()=>{
  const session=new QuoteSession("line-rename");await session.initialize([]);
  await session.executeCommand({action:"create",pricing:"supplied",lines:[{name:"Transfer",currency:"USD",billing:{kind:"flat",price:"100",basis:"user-stated-flat"}},{name:"Surcharge",currency:"USD",billing:{kind:"percentage",percent:"10",baseLines:["Transfer"]}}]});
  const quote=[...session.quotes.values()][0],id=quote.lines[0].id;session.beginStep();
  await session.executeCommand({action:"update",quoteId:quote.id,lines:[{lineId:id,name:"Handling"}]});
  const updated=session.quotes.get(quote.id)!;
  expect(updated.lines[0].id).toBe(id);expect(updated.lines[1].baseLines).toEqual(["Handling"]);
  expect(calculateSupplied(updated).totals?.[0].amount).toBe("110");
});

it("finishes executed work without model-copied evidence or metadata", () => {
  const session = new CompletionSession();
  session.register("usd", { toolName: "compare_quotes", kind: "comparison", targets: ["a", "b"], comparisonCurrency: "USD", disposition: "completed", required: true });
  session.register("eur", { toolName: "compare_quotes", kind: "comparison", targets: ["a", "b"], comparisonCurrency: "EUR", disposition: "completed", required: true });
  expect(session.finishExecuted({ response: "Both requested views are shown." }, "finish").status).toBe("ready_for_final_check");
  expect(session.acceptStep([{toolName:"finish_turn",toolCallId:"finish"}])).toBe(true);
  expect(session.completion()?.outcomes.map(row=>row.comparisonCurrency)).toEqual(["USD","EUR"]);
});

it("keeps declared unexecuted work visibly unfinished", () => {
  const session = new CompletionSession();
  session.register("read", { toolName:"read_quotes",kind:"quotation_read",targets:["a","b"],disposition:"completed" });
  session.finishExecuted({ pending:[{kind:"comparison",reason:"Comparison still needs the selected charges."}] },"finish");
  expect(session.acceptStep([{toolName:"finish_turn",toolCallId:"finish"}])).toBe(true);
  expect(session.remainingObligations().outcomes).toContainEqual(expect.objectContaining({kind:"comparison"}));
  expect(session.completion()?.response).toContain("Comparison still needs");
});

it("rechecks server bindings after finishing, without silently substituting fresh evidence", () => {
  const session = new CompletionSession(); let current = true;
  session.register("compare",{toolName:"compare_quotes",kind:"comparison",targets:["a","b"],comparisonCurrency:"USD",disposition:"completed",current:()=>current});
  session.finishExecuted({},"finish"); current=false;
  expect(session.acceptStep([{toolName:"finish_turn",toolCallId:"finish"}])).toBe(false);
});
it("retains an invalidated comparison as unfinished after a later quotation correction",()=>{
  const session=new CompletionSession();let current=true;
  session.register("compare",{toolName:"compare_quotes",kind:"comparison",targets:["a","b"],comparisonCurrency:"USD",disposition:"completed",required:true,current:()=>current});
  current=false;
  session.register("correct",{toolName:"supplied_quote",kind:"quotation",targets:["a"],disposition:"awaiting_approval",required:true});
  session.finishExecuted({},"finish");
  expect(session.acceptStep([{toolName:"finish_turn",toolCallId:"finish"}])).toBe(true);
  expect(session.remainingObligations().outcomes).toContainEqual(expect.objectContaining({kind:"comparison"}));
  expect(session.completion()?.response).toContain("comparison remains unfinished");
  expect(session.executionContext().work).toContainEqual(expect.objectContaining({kind:"comparison",disposition:"awaiting_input",invalidated:true}));
});

it("persists invalidated approval work even when interrupted before finish",()=>{
  const session=new CompletionSession();let current=true;
  const quoteState={quoteIds:["a","b"],digest:"a".repeat(64)};
  session.register("compare",{toolName:"compare_quotes",kind:"comparison",targets:["a","b"],comparisonCurrency:"USD",disposition:"awaiting_approval",operationId:"21892c8d-f24d-4d88-bc27-7de75c6958a4",quoteState,required:true,current:()=>current});
  current=false;
  const reloaded=remainingObligationsSchema.parse(JSON.parse(JSON.stringify(session.remainingObligations())));
  expect(reloaded.outcomes[0].branches[0]).toMatchObject({disposition:"awaiting_input",verificationRequired:true,quoteState,comparisonCurrency:"USD"});
  expect(reloaded.outcomes[0].branches[0]).not.toHaveProperty("operationId");
  expect(renderRemainingObligations(reloaded,{applied:new Set(["21892c8d-f24d-4d88-bc27-7de75c6958a4"]),quoteStateDigest:()=>"b".repeat(64)})).toContain("comparison remains unfinished");
});

it("retires stale comparison work only after the exact selection and FX are recomputed",async()=>{
  const session=new QuoteSession("recompute-selection");await session.initialize([]);
  for(const [currency,amount] of [["USD","10"],["EUR","6"]])await session.update({pricing:"supplied",terms:{taxStatus:"excluded"},lines:[{name:"Transfer",currency,amount,coverage:["transfer"]},{name:"Extra",currency,amount:"100",coverage:["extra"]}]});
  const ids=[...session.quotes.keys()];
  const request=(lineIndex=0,rate="2")=>({quoteIds:ids,selections:ids.map(id=>{const q=session.quotes.get(id)!;return {quoteId:id,revision:q.revision,lineIds:[q.lines[lineIndex].id!]};}),currency:"USD",exchangeRates:[{from:"EUR",to:"USD",rate}]});
  const execute=async(name:string,input:ReturnType<typeof request>)=>{const output=await session.compare(input,name);recordDecisionEvidence(session,undefined,"compare_quotes",input,output,name);return output;};
  expect(await execute("original",request())).toMatchObject({status:"calculated",difference:"2"});
  session.beginStep();await session.update({quoteId:ids[0],lines:[{name:"Transfer",amount:"11"}]});
  expect(session.completion.remainingObligations().outcomes).toContainEqual(expect.objectContaining({kind:"comparison"}));
  await execute("wrong-selection",request(1));
  await execute("wrong-fx",request(0,"3"));
  const wrongView={...request(),rounding:{stage:"total" as const,decimals:2}};await execute("wrong-view",wrongView);
  const wrongTaxBasis={...request(),taxBasis:"before-tax" as const};await execute("wrong-tax-basis",wrongTaxBasis);
  expect(session.completion.remainingObligations().outcomes).toContainEqual(expect.objectContaining({kind:"comparison"}));
  expect(await execute("recomputed",request())).toMatchObject({status:"calculated",difference:"1"});
  expect(session.completion.remainingObligations().outcomes).toEqual([]);
  session.completion.finishExecuted({},"finish");expect(session.completion.acceptStep([{toolName:"finish_turn",toolCallId:"finish"}])).toBe(true);
  expect(session.completion.completion()?.response).not.toContain("comparison remains unfinished");
});

it("supplier input represents issuer separately and excludes tariff-only intake", async () => {
  expect(suppliedQuoteSchema.safeParse({action:"create",call:{supplier:"Harbour Agency",operator:"Terminal Company"}}).success).toBe(true);
  const serialized = JSON.stringify(await nullableToolSchema(suppliedQuoteSchema).jsonSchema);
  expect(serialized).not.toContain('"pilotageArea"');
  expect(serialized).not.toContain('"fxPreviousWorkingDay"');
});
