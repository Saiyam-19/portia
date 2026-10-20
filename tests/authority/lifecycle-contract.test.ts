import { expect, it } from "vitest";
import { AuthoritySession } from "../../src/lib/authority/session";
import { parsePacket } from "../../src/lib/authority/contract";
import { executeAuthorizedOperations } from "../../src/lib/authority/execute";
import { QuoteSession } from "../../src/lib/portia/session";
import type { ModelMessage } from "ai";

const flat = (name:string, price:string) => ({ name, currency:"USD" as const, billing:{kind:"flat" as const,price,basis:"user-stated-flat" as const} });
const toolResult=(id:string,input:object,output:unknown):ModelMessage[]=>[{role:"assistant",content:[{type:"tool-call",toolName:"manage_quote",toolCallId:id,input}]},{role:"tool",content:[{type:"tool-result",toolName:"manage_quote",toolCallId:id,output:{type:"json",value:JSON.parse(JSON.stringify(output))}}]}];

it("stages two independent quotes, then a dependent comparison, and executes in exact order",async()=>{
 const authority=new AuthoritySession(),session=new QuoteSession("ordered");session.bindAuthority(authority);
 await session.initialize([{role:"user",content:"Treat Dock pack and Harbour pack as equivalent supplied scopes, then compare them."}]);
 const a=await session.executeCommand({action:"create",name:"Dock pack",pricing:"supplied",lines:[flat("dock bundle","37")]});
 const b=await session.executeCommand({action:"create",name:"Harbour pack",pricing:"supplied",lines:[flat("harbour bundle","41")]});
 if(!("quoteId" in a)||!("quoteId" in b))throw Error("missing staged quotes");
 const comparison=await session.compare({quoteIds:[a.quoteId,b.quoteId],scopeEquivalence:{statement:"Treat Dock pack and Harbour pack as equivalent supplied scopes"}});
 expect(comparison).toMatchObject({approvalRequired:true,stagedForReview:true});
 const pending=authority.pending()!,packet=parsePacket(pending.payload);expect(packet.version).toBe(2);expect(packet.operations.map(op=>op.kind)).toEqual(["quote","quote","comparison"]);
 expect(pending.form.description).toContain("selected scopes");
 const executed=await executeAuthorizedOperations({authorization:{payload:pending.payload,expiresAt:Date.now()+60_000},session,signal:new AbortController().signal});
 expect(executed.text).toContain("Dock pack");expect(executed.text).toContain("Harbour pack");expect(executed.text).toContain("difference");
});

it("executes approved supplied scope equivalence after native-form reload without re-grounding",async()=>{
 const authority=new AuthoritySession(),staged=new QuoteSession("fresh-scope");staged.bindAuthority(authority);const statement="Treat north plan and south plan as equivalent supplied scopes";
 await staged.initialize([{role:"user",content:statement}]);
 const ai={action:"create" as const,name:"north plan",pricing:"supplied" as const,lines:[flat("north package","29")]},bi={action:"create" as const,name:"south plan",pricing:"supplied" as const,lines:[flat("south package","31")]};
 const a=await staged.executeCommand(ai),b=await staged.executeCommand(bi);if(!("quoteId" in a)||!("quoteId" in b))throw Error();
 await staged.compare({quoteIds:[a.quoteId,b.quoteId],scopeEquivalence:{statement}});const pending=authority.pending()!;
 const messages:ModelMessage[]=[{role:"user",content:statement},...toolResult("a",ai,a),...toolResult("b",bi,b),{role:"assistant",content:[{type:"tool-call",toolName:"ask_user_input",toolCallId:pending.form.toolCallId,input:{title:pending.form.title,description:pending.form.description,fields:pending.form.fields}}]},{role:"tool",content:[{type:"tool-result",toolName:"ask_user_input",toolCallId:pending.form.toolCallId,output:{type:"json",value:{cancelled:false,values:{decision:"Approve exactly as shown"},note:""}}}]}];
 const fresh=new QuoteSession("fresh-scope");fresh.bindAuthority(new AuthoritySession());await fresh.initialize(messages);
 const executed=await executeAuthorizedOperations({authorization:{payload:pending.payload,expiresAt:Date.now()+60_000},session:fresh,signal:new AbortController().signal});
 expect(executed.text).toContain("Confirmed supplied-package scope equivalence");expect(executed.text).toContain("USD 2.00");
});

it("replaces ready quote intent, invalidates its comparison, and preserves invalid or incomplete prior state",async()=>{
 const authority=new AuthoritySession(),session=new QuoteSession("replace");session.bindAuthority(authority);await session.initialize([]);
 const first=await session.executeCommand({action:"create",pricing:"supplied",lines:[flat("fee","17")]});if(!("quoteId" in first))throw Error();
 const other=await session.executeCommand({action:"create",pricing:"supplied",lines:[flat("fee","19")]});if(!("quoteId" in other))throw Error();
 await session.compare({quoteIds:[first.quoteId,other.quoteId]});expect(authority.pendingOperations().some(op=>op.kind==="comparison")).toBe(true);
 session.beginStep();const restaged=await session.executeCommand({action:"update",quoteId:first.quoteId,lines:[{name:"fee",price:"23"}]});
 expect(restaged).toMatchObject({approvalRequired:true,invalidatedComparisons:1});expect(authority.pendingOperations().filter(op=>op.kind==="quote"&&op.quote.id===first.quoteId)).toHaveLength(1);expect(authority.pendingOperations().some(op=>op.kind==="comparison")).toBe(false);
 session.beginStep();const incomplete=await session.executeCommand({action:"update",quoteId:first.quoteId,lines:[{name:"fee",billing:{kind:"time",price:"5"}}]});expect(incomplete).toHaveProperty("draft");expect(authority.pendingQuote(first.quoteId)).toBeUndefined();
});

it("does not bridge mismatched official scopes or ungrounded supplied equivalence",async()=>{
 const session=new QuoteSession("scope");await session.initialize([{role:"user",content:"Compare the packages."}]);
 const a=await session.update({pricing:"supplied",lines:[{name:"alpha",currency:"USD",amount:"11"}]});const b=await session.update({pricing:"supplied",lines:[{name:"beta",currency:"USD",amount:"13"}]});if(!("quoteId" in a)||!("quoteId" in b))throw Error();
 expect((await session.compare({quoteIds:[a.quoteId,b.quoteId]})).status).toBe("error");
 expect((await session.compare({quoteIds:[a.quoteId,b.quoteId],scopeEquivalence:{statement:"They are the same"}})).body).toMatch(/not grounded/i);
});

it("preserves explicit review-group order and membership across restage and continuation restore",()=>{
 const authority=new AuthoritySession(),quote={id:crypto.randomUUID(),kind:"quote" as const,before:null,previous:null,quote:{id:"grouped",revision:0,name:"Grouped",pricing:"supplied" as const,call:{},services:[],lines:[{name:"fee",currency:"USD",amount:"7"}],terms:{}}};
 authority.propose(quote,"quotes");authority.propose({id:crypto.randomUUID(),kind:"remember",key:"units",value:"metric",previousValue:null,previousValueHash:null,memoryEpoch:0,memoryRevision:0},"memory");
 authority.propose({...quote,id:crypto.randomUUID(),quote:{...quote.quote,lines:[{name:"fee",currency:"USD",amount:"9"}]}});
 expect(authority.pendingQueue().map(item=>item.reviewGroup)).toEqual(["quotes","memory"]);
 const restored=new AuthoritySession(undefined,authority.pendingQueue().map(item=>({payload:item.payload,reviewGroup:item.reviewGroup})));restored.propose({...quote,id:crypto.randomUUID(),quote:{...quote.quote,lines:[{name:"fee",currency:"USD",amount:"11"}]}});
 expect(restored.pendingQueue().map(item=>item.reviewGroup)).toEqual(["quotes","memory"]);expect(parsePacket(restored.pendingQueue()[0].payload).operations[0]).toMatchObject({kind:"quote",quote:{lines:[{amount:"11"}]}});
});
