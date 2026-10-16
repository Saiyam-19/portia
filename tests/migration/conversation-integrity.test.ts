import { expect, it } from "vitest";
import type { ModelMessage } from "ai";
import { conversationInputs, emptyConversation, currentConversationFact, reduceInterpretation, type Interpretation } from "../../src/lib/migration/conversation";
import { planConversationAnswer, renderConversationAnswer } from "../../src/lib/migration/conversation-rules";
import { projectionProposal } from "./conversation-fixtures";
const binding={runId:"integrity",fence:1,revision:1};
const user=(content:string):ModelMessage=>({role:"user",content});
async function initial(){
 const text="Supplied quotation: GT 20000; stay 20 hours. Berth USD 0.01 per GT per hour, exact. Tax 5 percent. No other charges.";
 const messages=[user(text)],inputs=conversationInputs(messages),e=(quote:string)=>({inputId:inputs[0].id,quote});
 const p=await projectionProposal(messages);p.scopes=[{id:"call",label:"Current call",kind:"call",parentId:null,evidence:e(text)},{id:"rule",label:"Berth",kind:"quotation-rule",parentId:"call",evidence:e("Berth USD 0.01 per GT per hour, exact")}];
 p.tasks=[{id:"quote",scopeId:"call",kind:"quote",source:"supplied",charges:["berth"],ruleScopeIds:["rule"],evidence:e(text)}];p.operations=[];
 for(const [scopeId,field,value,unit,quote] of [
 ["call","gt","20000","GT","GT 20000"],["call","durationHours","20","hours","stay 20 hours"],["call","taxPercent","5","percent","Tax 5 percent"],["call","otherAdjustments","false","","No other charges"],
 ["rule","charge","berth","","Berth USD 0.01 per GT per hour, exact"],["rule","rate","0.01","money","USD 0.01"],["rule","currency","USD","","USD 0.01"],["rule","basis","gt-period","","per GT per hour"],["rule","periodHours","1","hours","per hour"],["rule","rounding","exact","","exact"],
 ] as const)p.operations.push({scopeId,field,value,unit,operation:"assert",evidence:e(quote)});
 return {messages,p,inputs,state:reduceInterpretation(emptyConversation(),p,inputs).state};
}
async function follow(field:Interpretation["operations"][number]["field"],value:string,unit:string,text:string,operation:Interpretation["operations"][number]["operation"]="assert"){
 const base=await initial();const messages=[...base.messages,user(text)],inputs=conversationInputs(messages);
 const p:Interpretation={version:1,baseHash:base.state.hash,scopes:[],inputIds:[inputs[1].id],tasks:base.state.tasks,unresolved:[],operations:[{scopeId:"call",field,value,unit,operation,evidence:{inputId:inputs[1].id,quote:text}}]};
 return {...base,inputs,p,state:reduceInterpretation(base.state,p,inputs).state};
}
it("keeps a conflicting tax unresolved instead of silently defaulting to zero",async()=>{
 const r=await follow("taxPercent","8","percent","Tax 8 percent");const answer=await planConversationAnswer(r.state,binding);
 expect(answer.complete).toBe(false);expect(answer.items[0].pending.join(" ")).toMatch(/tax/i);expect(renderConversationAnswer(answer)).not.toContain("No tax rate was supplied");
});
it("invalidates an uncertain current field while preserving unrelated facts",async()=>{
 const r=await follow("gt","10000","GT","GT may be 10000; the earlier figure is unconfirmed.","uncertain");
 expect(currentConversationFact(r.state,"call","gt")).toBeUndefined();expect(currentConversationFact(r.state,"call","durationHours")?.value).toBe("20");
 expect((await planConversationAnswer(r.state,binding)).complete).toBe(false);
});
it("cannot count one quoted rule twice while omitting another requested charge",async()=>{
 const r=await initial();const p=structuredClone(r.p);p.tasks[0].charges=["berth","pilotage"];p.tasks[0].ruleScopeIds=["rule","rule"];
 expect(()=>reduceInterpretation(emptyConversation(),p,r.inputs)).toThrow(/unique/);
 const state=structuredClone(r.state);state.tasks=p.tasks;const answer=await planConversationAnswer(state,binding);
 expect(answer.complete).toBe(false);expect(renderConversationAnswer(answer)).not.toContain("USD 8,400.00");
});
it("still permits an explicit tax correction and ordinary positive calculation",async()=>{
 const base=await initial();expect(renderConversationAnswer(await planConversationAnswer(base.state,binding))).toContain("USD 4,200.00");
 const r=await follow("taxPercent","8","percent","Correct tax to 8 percent","correct");const answer=await planConversationAnswer(r.state,binding);
 expect(answer.complete).toBe(true);expect(renderConversationAnswer(answer)).toContain("USD 4,320.00");
});
it.each(["minimum","maximum"] as const)("retains an unresolved withdrawn %s rather than silently omitting it",async field=>{
 const r=await initial();const declared=field==="minimum"?"Berth minimum USD 500 per call":"Berth cap USD 8000 per call";const amount=field==="minimum"?"500":"8000";
 let messages=[...r.messages,user(declared)],inputs=conversationInputs(messages);
 const p:Interpretation={version:1,baseHash:r.state.hash,scopes:[],inputIds:[inputs[1].id],tasks:r.state.tasks,unresolved:[],operations:[{scopeId:"rule",field,value:amount,unit:"money",operation:"assert",evidence:{inputId:inputs[1].id,quote:declared}},{scopeId:"rule",field:field==="minimum"?"minimumScope":"maximumScope",value:"call",unit:"",operation:"assert",evidence:{inputId:inputs[1].id,quote:declared}}]};
 const established=reduceInterpretation(r.state,p,inputs).state;expect((await planConversationAnswer(established,binding)).complete).toBe(true);
 const withdrawn="Reject "+declared;messages=[...messages,user(withdrawn)];inputs=conversationInputs(messages);
 const next:Interpretation={...p,baseHash:established.hash,inputIds:[inputs[2].id],operations:[{scopeId:"rule",field,value:amount,unit:"money",operation:"reject",evidence:{inputId:inputs[2].id,quote:withdrawn}}]};
 const answer=await planConversationAnswer(reduceInterpretation(established,next,inputs).state,binding);expect(answer.complete).toBe(false);expect(answer.items[0].pending.join(" ")).toContain(field);
});
it("does not erase conflicting adjustment conditions",async()=>{
 const r=await follow("otherAdjustments","true","","A discount applies");const answer=await planConversationAnswer(r.state,binding);expect(answer.complete).toBe(false);expect(answer.items[0].pending.join(" ")).toMatch(/adjustment/);
});
it("binds a minimum's currency to its own monetary atom",async()=>{
 const r=await initial(),text="Berth minimum EUR 200 per call",messages=[...r.messages,user(text)],inputs=conversationInputs(messages);
 const p:Interpretation={version:1,baseHash:r.state.hash,scopes:[],inputIds:[inputs[1].id],tasks:r.state.tasks,unresolved:[],operations:[{scopeId:"rule",field:"minimum",value:"200",unit:"money",operation:"assert",evidence:{inputId:inputs[1].id,quote:text}},{scopeId:"rule",field:"minimumScope",value:"call",unit:"",operation:"assert",evidence:{inputId:inputs[1].id,quote:text}}]};
 const answer=await planConversationAnswer(reduceInterpretation(r.state,p,inputs).state,binding);expect(answer.complete).toBe(false);expect(answer.items[0].pending.join(" ")).toMatch(/currency/);expect(renderConversationAnswer(answer)).not.toContain("USD 200.00");
});
it.each([
 ["The tide and weather are not favourable.","favourableConditions","true",false],
 ["The tide and weather are favourable.","favourableConditions","true",true],
 ["Favourable tide and weather, no shifting.","favourableConditions","true",true],
 ["No shifting; the tide and weather are favourable.","favourableConditions","true",true],
 ["Priority is not applicable.","priority","true",false],
 ["Priority is not applicable.","priority","false",true],
] as const)("validates scoped predicate polarity: %s",async(text,field,value,valid)=>{
 const messages=[user(text)],inputs=conversationInputs(messages);const p=await projectionProposal(messages);p.scopes=[{id:"call",label:"Current call",kind:"call",parentId:null,evidence:{inputId:inputs[0].id,quote:text}}];p.tasks=[{id:"facts",scopeId:"call",kind:"facts",source:"none",charges:[],ruleScopeIds:[],evidence:{inputId:inputs[0].id,quote:text}}];p.operations=[{scopeId:"call",field,value,unit:"",operation:"assert",evidence:{inputId:inputs[0].id,quote:text}}];
 const state=reduceInterpretation(emptyConversation(),p,inputs).state;expect(Boolean(currentConversationFact(state,"call",field))).toBe(valid);
});
