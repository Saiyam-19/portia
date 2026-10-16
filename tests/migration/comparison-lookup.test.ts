import {expect,it} from "vitest";
import {conversationInputs,emptyConversation,reduceInterpretation,replayConversation,currentConversationFact,type Interpretation} from "../../src/lib/migration/conversation";
import {ConversationSession} from "../../src/lib/migration/conversation-session";
import {planConversationAnswer,renderConversationAnswer} from "../../src/lib/migration/conversation-rules";
const binding={runId:"flow",fence:1,revision:1};
function comparison(){
 const text="Quotes: A is USD 1,275.35 plus USD 84.65. B is INR 114,500 all-in. Compare them in INR at fixed USD/INR rate 83.25. No tax or other extras; round to paise only after adding each quotation.";
 const inputs=conversationInputs([{role:"user",content:text}]),e=(quote:string)=>({inputId:inputs[0].id,quote});
 const p:Interpretation={version:1,baseHash:emptyConversation().hash,inputIds:[inputs[0].id],scopes:[],operations:[],tasks:[],unresolved:[]};
 const put=(scopeId:string,field:Interpretation['operations'][number]['field'],value:string,unit:string,quote:string)=>p.operations.push({scopeId,field,value,unit,operation:"assert",evidence:e(quote)});
 for(const [scope,label,amounts,currency]of [["a","A",["1,275.35","84.65"],"USD"],["b","B",["114,500"],"INR"]] as const){
  p.scopes.push({id:scope,label,kind:"call",parentId:null,evidence:e(text)});const ids:string[]=[],charges:string[]=[];
  amounts.forEach((amount,index)=>{const id=scope+"_"+index,charge="item_"+(index+1),quote=currency+" "+amount;ids.push(id);charges.push(charge);p.scopes.push({id,label:charge,kind:"quotation-rule",parentId:scope,evidence:e(quote)});put(id,"charge",charge,"",quote);put(id,"basis","amount","",quote);put(id,"rate",amount.replaceAll(",",""),"money",quote);put(id,"currency",currency,"",quote);});
  put(scope,"taxPercent","0","percent","No tax or other extras");put(scope,"otherAdjustments","false","","No tax or other extras");
  p.tasks.push({id:scope,scopeId:scope,kind:"quote",source:"supplied",charges,ruleScopeIds:ids,evidence:e(text)});
 }
 p.scopes.push({id:"compare",label:"Comparison",kind:"call",parentId:null,evidence:e(text)});p.tasks.push({id:"comparison",scopeId:"compare",kind:"comparison",source:"none",charges:[],ruleScopeIds:[],comparisonTaskIds:["a","b"],evidence:e(text)});
 put("compare","currency","INR","","Compare them in INR");put("compare","fxFrom","USD","","USD/INR rate 83.25");put("compare","fxTo","INR","","USD/INR rate 83.25");put("compare","fxRate","83.25","ratio","fixed USD/INR rate 83.25");put("compare","moneyRounding","quote","","round to paise only after adding each quotation");put("compare","moneyDecimals","2","places","round to paise only after adding each quotation");
 return{inputs,p};
}
it("compares anonymous supplied totals with explicit FX and quote-stage rounding",async()=>{const {inputs,p}=comparison();const answer=await planConversationAnswer(reduceInterpretation(emptyConversation(),p,inputs).state,binding);const text=renderConversationAnswer(answer);expect(text).toContain("USD 1,360.00");expect(text).toContain("INR 113,220.00");expect(text).toContain("INR 114,500.00");expect(text).toContain("INR 1,280.00");expect(answer.complete).toBe(true);});
it("does not rank different currencies without their supplied conversion",async()=>{const {inputs,p}=comparison();p.operations=p.operations.filter(o=>o.field!=="fxRate");const a=await planConversationAnswer(reduceInterpretation(emptyConversation(),p,inputs).state,binding);expect(a.items.at(-1)?.status).toBe("unresolved");});
it("binds matched lookup particulars, replays them, and preserves explicit user corrections",()=>{
 const text="Look up IMO 1234567 for this call.";const messages=[{role:"user" as const,content:text}];const inputs=conversationInputs(messages),e={inputId:inputs[0].id,quote:text};
 const p:Interpretation={version:1,baseHash:emptyConversation().hash,inputIds:[inputs[0].id],scopes:[{id:"call",label:"Current call",kind:"call",parentId:null,evidence:e}],operations:[],tasks:[{id:"lookup",scopeId:"call",kind:"other",auxiliaryAction:"lookup",source:"none",charges:[],ruleScopeIds:[],evidence:e}],unresolved:[]};
 const session=new ConversationSession(binding);session.initialize(messages);const interpreted=session.interpret(p);const lookup=session.acceptLookup({id:"1234567",idType:"imo",name:"ALPHA"},{gt:"20000",dwt:"30000"})!;expect(lookup).toBeDefined();expect(currentConversationFact(session.state,"call","gt")?.sourceClass).toBe("lookup");
 const replay=replayConversation([...messages,{role:"tool",content:[{type:"tool-result",toolName:"interpret_request",toolCallId:"i",output:{type:"json",value:JSON.parse(JSON.stringify(interpreted))}}]},{role:"tool",content:[{type:"tool-result",toolName:"get_vessel",toolCallId:"v",output:{type:"json",value:JSON.parse(JSON.stringify({lookupReceipt:lookup}))}}]}]);expect(replay.state.hash).toBe(session.state.hash);
 const correctedText="Correction: actual GT 15000.";const correctedInputs=[...inputs,...conversationInputs([{role:"user",content:correctedText}]).map(i=>({...i,id:"correction",messageIndex:4}))];
 session.state=reduceInterpretation(session.state,{version:1,baseHash:session.state.hash,inputIds:["correction"],scopes:[],tasks:p.tasks,unresolved:[],operations:[{scopeId:"call",field:"gt",value:"15000",unit:"GT",operation:"correct",evidence:{inputId:"correction",quote:correctedText}}]},correctedInputs).state;
 expect(session.acceptLookup({id:"1234567",idType:"imo",name:"ALPHA"},{gt:"25000",dwt:"31000"})).toBeDefined();expect(currentConversationFact(session.state,"call","gt")?.value).toBe("15000");expect(currentConversationFact(session.state,"call","dwt")?.value).toBe("31000");
 expect(session.acceptLookup({id:"7654321",idType:"imo",name:"BETA"},{gt:"99999"})).toBeUndefined();
});
it("distinguishes target-currency per-line rounding from quotation rounding",async()=>{
 const original=comparison();const replace=(s:string)=>s.replaceAll('1,275.35','0.005').replaceAll('1275.35','0.005').replaceAll('84.65','0.015').replaceAll('83.25','83');
 const p=JSON.parse(replace(JSON.stringify(original.p))) as Interpretation;
 const text=replace(original.inputs[0].text).replace('round to paise only after adding each quotation','round each line to paise after conversion');
 const inputs=conversationInputs([{role:'user',content:text}]);const changed=JSON.parse(JSON.stringify(p).replaceAll(original.inputs[0].id,inputs[0].id).replaceAll('round to paise only after adding each quotation','round each line to paise after conversion')) as Interpretation;
 changed.operations.find(o=>o.field==='moneyRounding')!.value='line';
 const answer=await planConversationAnswer(reduceInterpretation(emptyConversation(),changed,inputs).state,binding);expect(answer.items.at(-1)?.body).toContain('INR 1.67');
});
