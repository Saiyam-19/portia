import { expect, it, vi } from "vitest";
import { QuoteSession } from "../../src/lib/portia/session";
import { AuthoritySession } from "../../src/lib/authority/session";
import { canonical, parsePacket, quoteCore } from "../../src/lib/authority/contract";
import type { QuoteInput } from "../../src/lib/portia/quotes";
import { executeAuthorizedOperations } from "../../src/lib/authority/execute";

const terms = { pricing: "supplied" as const, lines: [{ name: "Berth", currency: "USD" as const, amount: "100" }], terms: { taxPercent: "0" } };
it("stages an exact quotation without accepting it, then executes only that candidate", async () => {
  const session = new QuoteSession("runtime"), authority = new AuthoritySession();
  session.bindAuthority(authority);
  await session.initialize([{ role: "user", content: "Use supplied USD 100 berth, no tax." }]);
  expect(await session.update(terms)).toMatchObject({ approvalRequired: true });
  expect(session.quotes.size).toBe(0);
  const packet = parsePacket(authority.pending()!.payload), op = packet.operations[0];
  if (op.kind !== "quote") throw new Error("Expected quote");
  expect(authority.pending()!.form.description).toContain("100");
  const result = await session.applyApprovedQuote(op);
  expect(result.record.quote).toEqual(op.quote);
  expect(result.totals?.[0].amount).toBe("100");
  expect(canonical(quoteCore(result.record.quote))).toBe(canonical(op.quote));
  session.beginStep();
  expect(await session.update({ quoteId: op.quote.id })).toMatchObject({ status: "calculated" });
});
it("every effective change requires another review; repeat identical inputs do not", async () => {
  const session = new QuoteSession("revision"), authority = new AuthoritySession(); session.bindAuthority(authority);
  await session.initialize([{ role: "user", content: "Use supplied USD 100 berth, no tax." }]);
  await session.update(terms);
  const op = parsePacket(authority.pending()!.payload).operations[0]; if(op.kind!=="quote")throw new Error();
  await session.applyApprovedQuote(op);
  const next = new AuthoritySession({quotes:[AuthoritySession.binding(op.quote)],comparisons:[]}); session.bindAuthority(next);session.beginStep();
  expect(await session.update({quoteId:op.quote.id,...terms})).not.toHaveProperty("approvalRequired");
  expect(await session.update({quoteId:op.quote.id,lines:[{name:"Berth",amount:"900"}]})).toMatchObject({approvalRequired:true});
  expect(session.quotes.get(op.quote.id)!.lines[0].amount).toBe("100");
});
it("an integrity checksum alone cannot authorize a historical supplied quote", async () => {
  const original=new QuoteSession("old");await original.initialize([]);const saved=await original.update(terms);
  const session=new QuoteSession("old");session.bindAuthority(new AuthoritySession());
  await session.initialize([{role:"tool",content:[{type:"tool-result",toolCallId:"old",toolName:"manage_quote",output:{type:"json",value:JSON.parse(JSON.stringify(saved))}}]}]);
  expect(await session.calculate([...session.quotes.values()][0])).toMatchObject({status:"unresolved"});
  expect(await session.answer("USD 100")).not.toContain("USD 100");
});

it.each<[string,QuoteInput]>([
  ["amount",{lines:[{name:"Berth",amount:"999"}]}],
  ["currency",{lines:[{name:"Berth",currency:"EUR"}]}],
  ["rate and units",{lines:[{name:"Berth",rate:"3",unit:"time",periodHours:"12",commenced:true}]}],
  ["denominator",{lines:[{name:"Berth",perQuantity:"100"}]}],
  ["minimum",{lines:[{name:"Berth",minimum:{amount:"200",per:"call"}}]}],
  ["maximum",{lines:[{name:"Berth",maximum:{amount:"99",per:"call"}}]}],
  ["remove minimum",{lines:[{name:"Berth",removeMinimum:true}]}],
  ["remove maximum",{lines:[{name:"Berth",removeMaximum:true}]}],
  ["remove charge",{removeLines:["Berth"]}],
  ["tax",{terms:{taxPercent:"18"}}],
  ["rounding",{terms:{rounding:{stage:"line",decimals:0}}}],
  ["remove rounding",{terms:{removeRounding:true}}],
  ["occupancy",{call:{occupancy:{hours:"14",minutes:"1"}}}],
  ["gross tonnage",{call:{gt:"20000"}}],
  ["included services",{services:["berth","pilotage"]}],
])("does not apply a changed %s before confirmation",async(_name,patch)=>{
  const session=new QuoteSession("changes");await session.initialize([]);
  const result=await session.update({...terms,lines:[{...terms.lines[0],minimum:{amount:"50",per:"call"},maximum:{amount:"500",per:"call"}}],terms:{taxPercent:"0",rounding:{stage:"total",decimals:2}}});
  if(!("record" in result)||!result.record)throw new Error();
  const original=structuredClone(result.record.quote),authority=new AuthoritySession({quotes:[AuthoritySession.binding(quoteCore(original))],comparisons:[]});session.bindAuthority(authority);session.beginStep();
  expect(await session.update({quoteId:original.id,...patch})).toMatchObject({approvalRequired:true});
  expect(session.quotes.get(original.id)).toEqual(original);
  const pending=parsePacket(authority.pending()!.payload).operations[0];if(pending.kind!=="quote")throw new Error();
  expect(pending.before).toEqual(AuthoritySession.binding(quoteCore(original)));
  expect(pending.previous).toEqual(quoteCore(original));
  expect(pending.quote.revision).toBe(original.revision+1);
});

it("binds comparison FX and rounding to current approved quote revisions",async()=>{
  const session=new QuoteSession("compare");await session.initialize([]);
  const left=await session.update(terms),right=await session.update({...terms,lines:[{name:"Berth",currency:"EUR",amount:"90"}]});
  if(!("quoteId" in left)||!("quoteId" in right))throw new Error();
  const authority=new AuthoritySession({quotes:[...session.quotes.values()].map(q=>AuthoritySession.binding(quoteCore(q))),comparisons:[]});session.bindAuthority(authority);
  expect(await session.compare({quoteIds:[left.quoteId,right.quoteId],currency:"USD",exchangeRates:[{from:"EUR",to:"USD",rate:"1.1"}],rounding:{stage:"total",decimals:2}})).toMatchObject({approvalRequired:true});
  const op=parsePacket(authority.pending()!.payload).operations[0];if(op.kind!=="comparison")throw new Error();
  expect(await session.applyApprovedComparison(op)).toMatchObject({status:"calculated",difference:"1"});
  const next=new AuthoritySession(authority.context);session.bindAuthority(next);
  expect(await session.compare({...op.input,exchangeRates:[{from:"EUR",to:"USD",rate:"1.2"}]} as Parameters<QuoteSession["compare"]>[0])).toMatchObject({approvalRequired:true});
});

it.each(["Gross tonnage", "Deadweight", "Cargo tonnes"])("does not promote a misleading %s form into NT",async(label)=>{
  const session=new QuoteSession("nt-form");await session.initialize([
    {role:"assistant",content:[{type:"tool-call",toolCallId:"nt",toolName:"ask_user_input",input:{title:"Particulars",fields:[{name:"nt",label,type:"number",required:true}]}}]},
    {role:"tool",content:[{type:"tool-result",toolCallId:"nt",toolName:"ask_user_input",output:{type:"json",value:{values:{nt:"9000"}}}}]},
  ]);
  expect(await session.update({pricing:"official",call:{port:"Redi",nt:"9000"},services:["berth"]})).toMatchObject({status:"error"});
  expect(session.quotes.size).toBe(0);
});

it.each(["remember","forget"] as const)("approved memory-only %s publishes its actual outcome after draining",async(kind)=>{
  const authority=new AuthoritySession(),session=new QuoteSession("memory-only");session.bindAuthority(authority);await session.initialize([]);
  authority.propose({id:crypto.randomUUID(),kind,key:"port",...(kind==="remember"?{value:"Mumbai"}:{}),previousValue:null,previousValueHash:null,memoryEpoch:0,memoryRevision:0});
  const drainMemory=vi.fn(async()=>({facts:[]}));
  const authorization={payload:authority.pending()!.payload,expiresAt:Date.now()+60000};
  const result=await executeAuthorizedOperations({session,authorization,drainMemory,signal:new AbortController().signal});
  expect(drainMemory).toHaveBeenCalledOnce();expect(result.text).toBe(kind==="remember"?"Requested memory saved.":"Requested memory forgotten.");
  await expect(executeAuthorizedOperations({session:new QuoteSession("failed"),authorization,drainMemory:async()=>{throw new Error("MEMORY_BUSY");},signal:new AbortController().signal})).rejects.toThrow("MEMORY_BUSY");
});
