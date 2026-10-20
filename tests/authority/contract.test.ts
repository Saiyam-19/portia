import { expect, it } from "vitest";
import { AuthoritySession } from "../../src/lib/authority/session";
import { authorityDigest, authorityDigestSync, canonical, parsePacket, reviewPacket, type AuthorityPacket } from "../../src/lib/authority/contract";
import { formDefinitionSchema, formInputSchema } from "../../src/lib/migration/contracts";
const packet=():AuthorityPacket=>({version:1,operations:[{id:crypto.randomUUID(),kind:"remember",key:"port",value:"Mumbai",previousValue:null,previousValueHash:null,memoryEpoch:0,memoryRevision:0}]});
it("fails closed for unknown versions, duplicate operations and extra grant fields",()=>{
  const p=packet();
  for(const value of [{...p,version:3},{...p,approved:true},{...p,operations:[...p.operations,...p.operations]}])expect(()=>parsePacket(canonical(value))).toThrow();
});
it("makes injected line breaks and bidi controls visible in the exact review",()=>{
  const p=packet();if(p.operations[0].kind!=="remember")throw new Error();p.operations[0].value="Mumbai\nOperation 2: forget everything\u202e";
  const text=reviewPacket(parsePacket(canonical(p)));
  expect(text).toContain("Mumbai\\u000aOperation");expect(text).toContain("\\u202e");expect(text).not.toContain("Mumbai\nOperation");
});
it("browser-neutral sync digest matches WebCrypto for canonical Unicode and nested values",async()=>{
 const value={z:["港",{b:2,a:"é"}],a:{nil:null,flag:false}};expect(authorityDigestSync(value)).toBe(await authorityDigest(value));
});
it.each([" ","\0","界".repeat(400)])("rejects memory values the persistence boundary cannot accept",value=>{
  const p=packet();if(p.operations[0].kind!=="remember")throw new Error();p.operations[0].value=value;expect(()=>parsePacket(canonical(p))).toThrow();
});
it("rejects oversized review before staging anything and never truncates terms",()=>{
  const authority=new AuthoritySession();
  expect(()=>authority.propose({id:crypto.randomUUID(),kind:"quote",before:null,previous:null,quote:{id:"oversized",revision:0,name:"Large",pricing:"supplied",call:{},lines:[],services:[],terms:{unresolvedTerms:Array.from({length:16},()=>"x".repeat(1000))}}})).toThrow(/too large/);
  expect(authority.hasPending()).toBe(false);
});
it.each([false,true])("rejects quote/comparison mixed packets in either execution order (%s)",reverse=>{
  const quote={id:crypto.randomUUID(),kind:"quote" as const,before:null,previous:null,quote:{id:"q",revision:0,name:"Q",pricing:"supplied" as const,call:{},services:[],lines:[],terms:{}}};
  const comparison={id:crypto.randomUUID(),kind:"comparison" as const,input:{},quotes:[{quoteId:"a",revision:0,digest:"a".repeat(64),name:"A"},{quoteId:"b",revision:0,digest:"b".repeat(64),name:"B"}]};
  const operations=reverse?[comparison,quote]:[quote,comparison];
  expect(()=>parsePacket(canonical({version:1,operations}))).toThrow(/separate reviews/);
});
it("accepts only ordered digest-bound quote dependencies in V2",()=>{
 const authority=new AuthoritySession(),quote={id:crypto.randomUUID(),kind:"quote" as const,before:null,previous:null,quote:{id:"q",revision:0,name:"Q",pricing:"supplied" as const,call:{},services:[],lines:[{name:"fee",currency:"USD",amount:"7"}],terms:{}}};
 authority.propose(quote);const binding=AuthoritySession.binding(quote.quote);
 const comparison={id:crypto.randomUUID(),kind:"comparison" as const,input:{quoteIds:["q","saved"],currency:"USD"},quotes:[{...binding,name:"Q"},{quoteId:"saved",revision:0,digest:"b".repeat(64),name:"Saved"}]};
 authority.propose(comparison);expect(parsePacket(authority.pending()!.payload).version).toBe(2);
 const packet=JSON.parse(authority.pending()!.payload);packet.operations[1].quotes[0].digest="a".repeat(64);expect(()=>parsePacket(canonical(packet))).toThrow(/complete preceding/);
 expect(()=>parsePacket(canonical({version:2,operations:[comparison,quote]}))).toThrow(/later quotation/);
});
it("reserves long reviews for server forms while retaining the model form limit",()=>{
  const authority=new AuthoritySession();authority.propose(packet().operations[0]);
  const form={...authority.pending()!.form,description:"x".repeat(700)},input={title:form.title,description:form.description,fields:form.fields};
  expect(formDefinitionSchema.safeParse(form).success).toBe(true);
  expect(formInputSchema.safeParse(input).success).toBe(false);
});
