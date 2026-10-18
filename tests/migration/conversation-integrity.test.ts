import { beforeAll, expect, it } from "vitest";
import type { ModelMessage } from "ai";
import { conversationInputs, emptyConversation, currentConversationFact, unresolvedConversationField, monetaryEvidenceCurrency, reduceInterpretation, type Interpretation } from "../../src/lib/migration/conversation";
const user=(content:string):ModelMessage=>({role:"user",content});
async function initial(){
 const text="Supplied quotation: GT 20000; stay 20 hours. Berth USD 0.01 per GT per hour, exact. Tax 5 percent. No other charges.";
 const messages=[user(text)],inputs=conversationInputs(messages),e=(quote:string)=>({inputId:inputs[0].id,quote});
 const p:Interpretation={version:1,baseHash:emptyConversation().hash,inputIds:inputs.map(i=>i.id),scopes:[],tasks:[],operations:[],unresolved:[]};p.scopes=[{id:"call",label:"Current call",kind:"call",parentId:null,evidence:e(text)},{id:"rule",label:"Berth",kind:"quotation-rule",parentId:"call",evidence:e("Berth USD 0.01 per GT per hour, exact")}];
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
 const r=await follow("taxPercent","8","percent","Tax 8 percent");
 expect(currentConversationFact(r.state,"call","taxPercent")).toBeUndefined();expect(unresolvedConversationField(r.state,"call","taxPercent")).toBe(true);
});
it("invalidates an uncertain current field while preserving unrelated facts",async()=>{
 const r=await follow("gt","10000","GT","GT may be 10000; the earlier figure is unconfirmed.","uncertain");
 expect(currentConversationFact(r.state,"call","gt")).toBeUndefined();expect(currentConversationFact(r.state,"call","durationHours")?.value).toBe("20");
 expect(unresolvedConversationField(r.state,"call","gt")).toBe(true);
});
it("cannot count one quoted rule twice while omitting another requested charge",async()=>{
 const r=await initial();const p=structuredClone(r.p);p.tasks[0].charges=["berth","pilotage"];p.tasks[0].ruleScopeIds=["rule","rule"];
 expect(()=>reduceInterpretation(emptyConversation(),p,r.inputs)).toThrow(/unique/);
});
it("still permits an explicit tax correction and ordinary positive calculation",async()=>{
 const base=await initial();expect(currentConversationFact(base.state,"call","taxPercent")?.value).toBe("5");
 const r=await follow("taxPercent","8","percent","Correct tax to 8 percent","correct");
 expect(currentConversationFact(r.state,"call","taxPercent")?.value).toBe("8");expect(unresolvedConversationField(r.state,"call","taxPercent")).toBe(false);
});
it.each(["minimum","maximum"] as const)("retains an unresolved withdrawn %s rather than silently omitting it",async field=>{
 const r=await initial();const declared=field==="minimum"?"Berth minimum USD 500 per call":"Berth cap USD 8000 per call";const amount=field==="minimum"?"500":"8000";
 let messages=[...r.messages,user(declared)],inputs=conversationInputs(messages);
 const p:Interpretation={version:1,baseHash:r.state.hash,scopes:[],inputIds:[inputs[1].id],tasks:r.state.tasks,unresolved:[],operations:[{scopeId:"rule",field,value:amount,unit:"money",operation:"assert",evidence:{inputId:inputs[1].id,quote:declared}},{scopeId:"rule",field:field==="minimum"?"minimumScope":"maximumScope",value:"call",unit:"",operation:"assert",evidence:{inputId:inputs[1].id,quote:declared}}]};
 const established=reduceInterpretation(r.state,p,inputs).state;expect(currentConversationFact(established,"rule",field)?.value).toBe(amount);
 const withdrawn="Reject "+declared;messages=[...messages,user(withdrawn)];inputs=conversationInputs(messages);
 const next:Interpretation={...p,baseHash:established.hash,inputIds:[inputs[2].id],operations:[{scopeId:"rule",field,value:amount,unit:"money",operation:"reject",evidence:{inputId:inputs[2].id,quote:withdrawn}}]};
 const state=reduceInterpretation(established,next,inputs).state;expect(currentConversationFact(state,"rule",field)).toBeUndefined();expect(unresolvedConversationField(state,"rule",field)).toBe(true);
});
it("does not erase conflicting adjustment conditions",async()=>{
 const r=await follow("otherAdjustments","true","","A discount applies");expect(unresolvedConversationField(r.state,"call","otherAdjustments")).toBe(true);
});
it("binds a minimum's currency to its own monetary atom",async()=>{
 const r=await initial(),text="Berth minimum EUR 200 per call",messages=[...r.messages,user(text)],inputs=conversationInputs(messages);
 const p:Interpretation={version:1,baseHash:r.state.hash,scopes:[],inputIds:[inputs[1].id],tasks:r.state.tasks,unresolved:[],operations:[{scopeId:"rule",field:"minimum",value:"200",unit:"money",operation:"assert",evidence:{inputId:inputs[1].id,quote:text}},{scopeId:"rule",field:"minimumScope",value:"call",unit:"",operation:"assert",evidence:{inputId:inputs[1].id,quote:text}}]};
 const state=reduceInterpretation(r.state,p,inputs).state;expect(monetaryEvidenceCurrency(currentConversationFact(state,"rule","minimum")!)).toBe("EUR");expect(currentConversationFact(state,"rule","currency")?.value).toBe("USD");
});
it.each([
 ["The tide and weather are not favourable.","favourableConditions","true",false],
 ["The tide and weather are favourable.","favourableConditions","true",true],
 ["Favourable tide and weather, no shifting.","favourableConditions","true",true],
 ["No shifting; the tide and weather are favourable.","favourableConditions","true",true],
 ["Priority is not applicable.","priority","true",false],
 ["Priority is not applicable.","priority","false",true],
] as const)("validates scoped predicate polarity: %s",async(text,field,value,valid)=>{
 const messages=[user(text)],inputs=conversationInputs(messages);const p:Interpretation={version:1,baseHash:emptyConversation().hash,inputIds:inputs.map(i=>i.id),scopes:[],tasks:[],operations:[],unresolved:[]};p.scopes=[{id:"call",label:"Current call",kind:"call",parentId:null,evidence:{inputId:inputs[0].id,quote:text}}];p.tasks=[{id:"facts",scopeId:"call",kind:"facts",source:"none",charges:[],ruleScopeIds:[],evidence:{inputId:inputs[0].id,quote:text}}];p.operations=[{scopeId:"call",field,value,unit:"",operation:"assert",evidence:{inputId:inputs[0].id,quote:text}}];
 const state=reduceInterpretation(emptyConversation(),p,inputs).state;expect(Boolean(currentConversationFact(state,"call",field))).toBe(valid);
});

// Preserve the retired planner's currency guard at the active saved-receipt bridge.
// Exercise the current saved-receipt bridge and calculator.
let crossCurrencyStatus: string;
beforeAll(async()=>{
 const { QuoteSession }=await import("../../src/lib/portia/session");
 const base=await initial();const first=reduceInterpretation(emptyConversation(),base.p,base.inputs);
 const record=(value:unknown,id:string):ModelMessage=>({role:"tool",content:[{type:"tool-result",toolName:"interpret_request",toolCallId:id,output:{type:"json",value:JSON.parse(JSON.stringify(value))}}]});
 const text="Berth minimum EUR 5000 per call";
 const messages:ModelMessage[]=[...base.messages,record(first.receipt,"before-bound"),user(text)];
 const inputs=conversationInputs(messages),evidence={inputId:inputs.at(-1)!.id,quote:text};
 const p:Interpretation={version:1,baseHash:first.state.hash,scopes:[],inputIds:[evidence.inputId],tasks:first.state.tasks,unresolved:[],operations:[{scopeId:"rule",field:"minimum",value:"5000",unit:"money",operation:"assert",evidence},{scopeId:"rule",field:"minimumScope",value:"call",unit:"",operation:"assert",evidence}]};
 const second=reduceInterpretation(first.state,p,inputs);
 expect(monetaryEvidenceCurrency(currentConversationFact(second.state,"rule","minimum")!)).toBe("EUR");
 const session=new QuoteSession("historical-currency-gap");await session.initialize([...messages,record(second.receipt,"foreign-bound")]);
 expect(session.warning).toBeUndefined();expect(session.quotes.size).toBe(1);
 crossCurrencyStatus=(await session.update({quoteId:[...session.quotes.keys()][0]})).status;
 expect(["calculated","unresolved"]).toContain(crossCurrencyStatus);
});
it("imported EUR minimum on USD quote remains unresolved",()=>{
 expect(crossCurrencyStatus).toBe("unresolved");
});
