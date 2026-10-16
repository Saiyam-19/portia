import { expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";
import { nonfinancialProposal, mumbaiProposal, mumbaiQuestion } from "./conversation-fixtures";
const usage={inputTokens:{total:1,noCache:1,cacheRead:0,cacheWrite:0},outputTokens:{total:1,text:1,reasoning:0}};
it("forces only pending interpretation and restores the normal output bound afterward",async()=>{
 let calls=0;const model=new MockLanguageModelV4({doGenerate:async options=>{
  if(calls++===0){expect(options.toolChoice).toEqual({type:"tool",toolName:"interpret_request"});expect(options.maxOutputTokens).toBe(8192);return{content:[{type:"tool-call",toolCallId:"interpret",toolName:"interpret_request",input:JSON.stringify(nonfinancialProposal("Hello"))}],finishReason:{unified:"tool-calls",raw:undefined},usage,warnings:[]};}
  expect(options.toolChoice).toEqual({type:"auto"});expect(options.maxOutputTokens).toBe(4096);return{content:[{type:"text",text:"Hello."}],finishReason:{unified:"stop",raw:undefined},usage,warnings:[]};
 }});
 expect((await createMigrationMainAgent({alias:"model-1",mainModel:model}).generate({prompt:"Hello"})).text).toBe("Hello.");expect(calls).toBe(2);
});
it("keeps the original complete tariff path deterministic after forced interpretation",async()=>{
 const model=new MockLanguageModelV4({doGenerate:async options=>{expect(options.maxOutputTokens).toBe(8192);expect(options.toolChoice).toEqual({type:"tool",toolName:"interpret_request"});return{content:[{type:"tool-call",toolCallId:"interpret",toolName:"interpret_request",input:JSON.stringify(mumbaiProposal())}],finishReason:{unified:"tool-calls",raw:undefined},usage,warnings:[]};}});
 const result=await createMigrationMainAgent({alias:"model-1",mainModel:model}).generate({prompt:mumbaiQuestion});expect(result.text).toContain("51,094.00");expect(model.doGenerateCalls).toHaveLength(1);
});
