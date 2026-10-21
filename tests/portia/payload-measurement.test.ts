import { it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { MockLanguageModelV4 } from "ai/test";
import { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";

it("captures the actual provider-bound tool definitions without provider inference", async () => {
  const model = new MockLanguageModelV4({doGenerate: async () => ({
    content:[{type:"tool-call",toolName:"finish_turn",toolCallId:"finish",input:JSON.stringify({response:"Hello.",...(process.env.PORTIA_BASELINE ? {outcomes:[]} : {})})}],
    finishReason:{unified:"tool-calls",raw:undefined},
    usage:{inputTokens:{total:0,noCache:0,cacheRead:undefined,cacheWrite:undefined},outputTokens:{total:0,text:0,reasoning:undefined}},warnings:[],
  })});
  await createMigrationMainAgent({alias:"model-1",mainModel:model}).generate({prompt:"Hello."});
  const tools = model.doGenerateCalls[0].tools!;
  expect(tools.some(tool=>tool.name==="supplied_quote")).toBe(true);
  if(process.env.PORTIA_PAYLOAD_OUTPUT) writeFileSync(process.env.PORTIA_PAYLOAD_OUTPUT,JSON.stringify({tools,characters:Object.fromEntries(tools.map(tool=>[tool.name,JSON.stringify(tool).length]))},null,2));
});
