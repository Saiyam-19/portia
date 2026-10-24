import { it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { MockLanguageModelV4 } from "ai/test";
import { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";

it("sends a small tool set with no supplier-quote or approval tools", async () => {
  const model = new MockLanguageModelV4({doGenerate: async () => ({
    content:[{type:"text",text:"Hello."}],
    finishReason:{unified:"stop",raw:undefined},
    usage:{inputTokens:{total:0,noCache:0,cacheRead:undefined,cacheWrite:undefined},outputTokens:{total:0,text:0,reasoning:undefined}},warnings:[],
  })});
  await createMigrationMainAgent({alias:"model-1",mainModel:model}).generate({prompt:"Hello."});
  const tools = model.doGenerateCalls[0].tools!;
  const names = tools.map(tool => tool.name);
  for (const retired of ["supplied_quote","official_quote","compare_quotes","read_quotes","finish_turn","ask_user_input"]) expect(names).not.toContain(retired);
  expect(model.doGenerateCalls[0].toolChoice).not.toEqual({type:"required"});
  expect(JSON.stringify(tools).length).toBeLessThan(12_000);
  if(process.env.PORTIA_PAYLOAD_OUTPUT) writeFileSync(process.env.PORTIA_PAYLOAD_OUTPUT,JSON.stringify({tools,characters:Object.fromEntries(tools.map(tool=>[tool.name,JSON.stringify(tool).length]))},null,2));
});
