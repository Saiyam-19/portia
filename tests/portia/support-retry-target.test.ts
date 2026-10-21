import {expect,it} from "vitest";
import {QuoteSession} from "../../src/lib/portia/session";

it("preserves a verified memory key while repairing only its rejected value",async()=>{
  const session=new QuoteSession("memory-retry-target");await session.initialize([]);
  session.observeTools([], [{toolCallId:"bad-value",toolName:"remember_memory",invalid:true,input:{key:"port_a",value:"é".repeat(513)}}]);
  session.observeTools([{toolCallId:"wrong-key",toolName:"remember_memory",input:{key:"port_b",value:"Mumbai",retryOf:"bad-value"},output:{saved:true}}]);
  expect(session.completion.context().evidence.find(item=>item.toolCallId==="bad-value")?.current).toBe(true);

  session.observeTools([{toolCallId:"same-key",toolName:"remember_memory",input:{key:"port_a",value:"Mumbai",retryOf:"bad-value"},output:{saved:true}}]);
  expect(session.completion.context().evidence.find(item=>item.toolCallId==="bad-value")?.current).toBe(false);
});
