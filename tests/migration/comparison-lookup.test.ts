import {expect,it} from "vitest";
import {conversationInputs,emptyConversation,reduceInterpretation,replayConversation,currentConversationFact,applyVesselLookup,conversationDigest,type Interpretation,type ConversationState,type VesselLookupReceipt} from "../../src/lib/migration/conversation";
function receipt(state:ConversationState,subject:VesselLookupReceipt["subject"],values:VesselLookupReceipt["values"]):VesselLookupReceipt {
 const unsigned={version:1 as const,kind:"vessel-lookup" as const,beforeHash:state.hash,scopeId:"call",subject,values,observedAt:"2026-10-18T00:00:00Z"};return {...unsigned,id:conversationDigest(unsigned)};
}
it("binds matched lookup particulars, replays them, and preserves explicit user corrections",()=>{
 const text="Look up IMO 1234567 for this call.";const messages=[{role:"user" as const,content:text}];const inputs=conversationInputs(messages),e={inputId:inputs[0].id,quote:text};
 const p:Interpretation={version:1,baseHash:emptyConversation().hash,inputIds:[inputs[0].id],scopes:[{id:"call",label:"Current call",kind:"call",parentId:null,evidence:e}],operations:[],tasks:[{id:"lookup",scopeId:"call",kind:"other",auxiliaryAction:"lookup",source:"none",charges:[],ruleScopeIds:[],evidence:e}],unresolved:[]};
 const interpreted=reduceInterpretation(emptyConversation(),p,inputs);let state=interpreted.state;const lookup=receipt(state,{id:"1234567",idType:"imo",name:"ALPHA"},{gt:"20000",dwt:"30000"});state=applyVesselLookup(state,lookup);expect(lookup).toBeDefined();expect(currentConversationFact(state,"call","gt")?.sourceClass).toBe("lookup");
 const replay=replayConversation([...messages,{role:"tool",content:[{type:"tool-result",toolName:"interpret_request",toolCallId:"i",output:{type:"json",value:JSON.parse(JSON.stringify(interpreted.receipt))}}]},{role:"tool",content:[{type:"tool-result",toolName:"get_vessel",toolCallId:"v",output:{type:"json",value:JSON.parse(JSON.stringify({lookupReceipt:lookup}))}}]}]);expect(replay.state.hash).toBe(state.hash);
 const correctedText="Correction: actual GT 15000.";const correctedInputs=[...inputs,...conversationInputs([{role:"user",content:correctedText}]).map(i=>({...i,id:"correction",messageIndex:4}))];
 state=reduceInterpretation(state,{version:1,baseHash:state.hash,inputIds:["correction"],scopes:[],tasks:p.tasks,unresolved:[],operations:[{scopeId:"call",field:"gt",value:"15000",unit:"GT",operation:"correct",evidence:{inputId:"correction",quote:correctedText}}]},correctedInputs).state;
 state=applyVesselLookup(state,receipt(state,{id:"1234567",idType:"imo",name:"ALPHA"},{gt:"25000",dwt:"31000"}));expect(currentConversationFact(state,"call","gt")?.value).toBe("15000");expect(currentConversationFact(state,"call","dwt")?.value).toBe("31000");
 expect(()=>applyVesselLookup(state,receipt(state,{id:"7654321",idType:"imo",name:"BETA"},{gt:"99999"}))).toThrow(/identity/);
});
