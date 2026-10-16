import { expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { tool } from "ai";
import { z } from "zod";
import { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";
import { ConversationSession } from "../../src/lib/migration/conversation-session";
import { projectionProposal } from "./conversation-fixtures";
const usage={inputTokens:{total:1,noCache:1,cacheRead:0,cacheWrite:0},outputTokens:{total:1,text:1,reasoning:0}};
const generated=(toolName:string,input:unknown,toolCallId:string)=>({content:[{type:"tool-call" as const,toolName,input:JSON.stringify(input),toolCallId}],finishReason:{unified:"tool-calls" as const,raw:undefined},usage,warnings:[]});
async function setup(action:"remember"|"lookup",badReceipt=false){
 const question=action==="remember"?"Calculate 2 + 3 and remember my preferred units are metric.":"Calculate 2 + 3 and look up vessel Alpha.";
 const p=await projectionProposal([{role:"user",content:question}],"arithmetic","2 + 3");p.tasks.push({...p.tasks[0],id:"aux",kind:"other",auxiliaryAction:action,source:"none"});
 const binding={runId:"mixed",fence:1,revision:1};const session=new ConversationSession(binding);
 const remember=vi.fn(async()=>({saved:true}));const memory={instructions:async()=>"No saved facts.",tools:{remember_memory:tool({inputSchema:z.object({key:z.string(),value:z.string()}),execute:remember})}};
 const model=new MockLanguageModelV4({doGenerate:[generated("interpret_request",p,"interpret"),generated(action==="remember"?"remember_memory":"search_vessels",action==="remember"?{key:"units",value:"metric"}:{query:"Alpha",limit:5},"action"),generated("complete_auxiliary",{outcomes:[{taskId:"aux",status:action==="lookup"?"unresolved":"completed",text:action==="lookup"?"Vessel lookup is unavailable; please provide the needed particulars.":"Saved your preferred units as metric.",receiptIds:[badReceipt?"invented":"action"]}]},"complete")]});
 const result=await createMigrationMainAgent({ interpretationFormat: "legacy",alias:"model-1",mainModel:model,memory,conversation:session,quoteBinding:binding}).generate({prompt:question});
 return{result,session,model,remember};
}
it("completes independent memory work alongside calculation before final publication",async()=>{
 const r=await setup("remember");expect(r.remember).toHaveBeenCalledTimes(1);expect(r.result.text).toContain("**5**");expect(r.result.text).toContain("Saved your preferred units as metric");expect(r.session.answer?.complete).toBe(true);expect(await r.session.verify(r.session.answer)).toBe(true);expect(r.model.doGenerateCalls).toHaveLength(3);
});
it("retains arithmetic and truthful manual fallback when lookup is unavailable",async()=>{
 const r=await setup("lookup");expect(r.result.text).toContain("**5**");expect(r.result.text).toContain("lookup is unavailable");expect(r.session.answer?.complete).toBe(false);expect(r.model.doGenerateCalls).toHaveLength(3);
});
it("cannot certify an auxiliary action using an invented tool receipt",async()=>{
 const r=await setup("remember",true);expect(r.result.text).toContain("**5**");expect(r.result.text).not.toContain("Saved your preferred");expect(r.session.answer?.complete).toBe(false);
});
