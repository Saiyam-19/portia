import { expect, it } from "vitest";
import { memoryValueSchema, scratchpadSchema } from "../../src/lib/memory/input";
import { recordDecisionEvidence } from "../../src/lib/portia/decision-evidence";
import { QuoteSession } from "../../src/lib/portia/session";

const version=(memoryRevision:number,scratchpadRevision:number)=>({epoch:0,memoryRevision,scratchpadRevision});

it("enforces UTF-8, NUL, and blank memory boundaries before storage",()=>{
  expect(memoryValueSchema.safeParse("é".repeat(512)).success).toBe(true);
  expect(memoryValueSchema.safeParse("é".repeat(513)).success).toBe(false);
  expect(memoryValueSchema.safeParse(" \n ").success).toBe(false);
  expect(memoryValueSchema.safeParse("a\0b").success).toBe(false);
  expect(scratchpadSchema.safeParse("").success).toBe(true);
  expect(scratchpadSchema.safeParse(" \n ").success).toBe(false);
  expect(scratchpadSchema.safeParse("é".repeat(3001)).success).toBe(false);
});

it("retires only the explicitly linked support-tool rejection",async()=>{
  const session=new QuoteSession("support-retry");await session.initialize([]);
  session.observeTools([], [
    {toolCallId:"bad-a",toolName:"search_vessels",invalid:true,input:{query:""}},
    {toolCallId:"bad-b",toolName:"search_vessels",invalid:true,input:{query:"\0"}},
  ]);
  const output={status:"completed",availability:"available",targets:["Aurora"],body:"- Aurora"};
  const input={query:"Aurora",retryOf:"bad-a"};
  recordDecisionEvidence(session,undefined,"search_vessels",input,output,"fixed-a");
  session.observeTools([{toolCallId:"fixed-a",toolName:"search_vessels",input,output}]);
  const evidence=session.completion.context().evidence;
  expect(evidence.find(item=>item.toolCallId==="bad-a")?.current).toBe(false);
  expect(evidence.find(item=>item.toolCallId==="bad-b")?.current).toBe(true);
});

it.each(["unavailable","not_found","invalid"] as const)("does not mark a %s vessel result completed",async availability=>{
  const session=new QuoteSession("vessel-"+availability);await session.initialize([]);
  recordDecisionEvidence(session,undefined,"get_vessel",{id:"9074729",id_type:"imo"},{status:"unresolved",availability,targets:["IMO 9074729"],body:"No verified vessel result."},"lookup");
  expect(session.completion.context().evidence[0]).toMatchObject({disposition:"unavailable",targets:["IMO 9074729"]});
});

it("invalidates stale note evidence and escaped rendered notes after a write",async()=>{
  const session=new QuoteSession("note-version");await session.initialize([]);
  const read={markdown:"![remote](https://example.invalid/pixel)",stateVersion:version(0,1)};
  recordDecisionEvidence(session,undefined,"read_scratchpad",{},read,"read-1");
  session.observeTools([{toolCallId:"read-1",toolName:"read_scratchpad",input:{},output:read}]);
  expect(session.finalText("")).toContain("\\!\\[remote\\]");
  const write={saved:true,stateVersion:version(0,2)};
  recordDecisionEvidence(session,undefined,"write_scratchpad",{markdown:"new"},write,"write-2");
  session.observeTools([{toolCallId:"write-2",toolName:"write_scratchpad",input:{markdown:"new"},output:write}]);
  expect(session.finalText("")).not.toContain("remote");
  expect(session.completion.context().evidence.find(item=>item.toolCallId==="read-1")?.current).toBe(false);
});

it("invalidates a cross-chat read_quotes artifact on a newer memory revision",async()=>{
  const session=new QuoteSession("cross-chat-version");await session.initialize([]);
  await session.executeCommand({action:"read",readScope:"cross-chat"},undefined,"cross-read",async()=>({facts:[{key:"port",value:"Mumbai"}],stateVersion:version(1,0)}));
  expect(session.finalText("")).toContain("Mumbai");
  session.captureSupportStateVersion(version(2,0));
  expect(session.finalText("")).not.toContain("Mumbai");
});
