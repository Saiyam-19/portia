import { beforeAll, afterEach, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { tool } from "ai";
import { z } from "zod";
import { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";
import { AuthoritySession } from "../../src/lib/authority/session";
import { QuoteSession } from "../../src/lib/portia/session";
const usage={inputTokens:{total:1,noCache:1,cacheRead:0,cacheWrite:0},outputTokens:{total:1,text:1,reasoning:0}};
const generated=(toolName:string,input:unknown,toolCallId:string)=>({content:[{type:"tool-call" as const,toolName,input:JSON.stringify(input),toolCallId}],finishReason:{unified:"tool-calls" as const,raw:undefined},usage,warnings:[]});
afterEach(()=>vi.unstubAllEnvs());
it.each(["remember","lookup"] as const)("retains independent arithmetic alongside %s work",async action=>{
 vi.stubEnv("VESSEL_API_KEY","");
 const session=new QuoteSession("mixed-"+action),remember=vi.fn(async()=>({saved:true}));
 const memory={proposeWrite:async(authority:AuthoritySession,_kind:"remember"|"forget",input:{key:string;value?:string})=>authority.propose({id:crypto.randomUUID(),kind:"remember",key:input.key,value:input.value,previousValue:null,previousValueHash:null,memoryEpoch:0,memoryRevision:0}),instructions:async()=>"No saved facts.",tools:{remember_memory:tool({inputSchema:z.object({key:z.string(),value:z.string()}),execute:remember})}};
 const model=new MockLanguageModelV4({doGenerate:[generated("calculate_charges",{expression:"2 + 3"},"math"),generated(action==="remember"?"remember_memory":"search_vessels",action==="remember"?{key:"units",value:"metric"}:{query:"Alpha"},"action"),{content:[{type:"text",text:action==="remember"?"Saved your preferred units.":"Vessel lookup is unavailable; provide the needed particulars."}],finishReason:{unified:"stop",raw:undefined},usage,warnings:[]}]});
 const result=await createMigrationMainAgent({alias:"model-1",mainModel:model,memory,session}).generate({prompt:action==="remember"?"Calculate 2 + 3 and remember my preferred units are metric.":"Calculate 2 + 3 and look up vessel Alpha."});
 const text=await session.answer(result.text);expect(text).toContain("**5**");
 if(action==="remember"){expect(remember).not.toHaveBeenCalled();expect(text).toContain("awaiting your exact confirmation");}
 else {expect(result.steps.flatMap(s=>s.toolResults).find(r=>r.toolName==="search_vessels")?.output).toMatch(/not configured|unavailable/i);expect(text).toMatch(/lookup.*(?:unavailable|not configured)/i);}
 expect(model.doGenerateCalls).toHaveLength(3);
});

// The final answer must preserve the actual tool outcome, never trust invented prose.
let knownGapPublication: string;
beforeAll(async()=>{
 const session=new QuoteSession("known-lookup-gap");await session.initialize([{role:"user",content:"Calculate 2 + 3 and look up vessel Alpha."}]);
 session.recordAnswer("math",{status:"calculated",body:"2 + 3 = **5**.",questions:[]});
 session.observeTools([{toolCallId:"lookup",toolName:"search_vessels",output:"Vessel lookup is not configured. Ask the user for vessel particulars."}]);
 knownGapPublication=await session.answer("Vessel lookup is unavailable; provide the needed particulars.");
 expect(knownGapPublication).toContain("**5**");
});
it("final publication retains unavailable lookup alongside arithmetic", ()=>{
 expect(knownGapPublication).toMatch(/lookup.*(?:unavailable|not configured)/i);
});
