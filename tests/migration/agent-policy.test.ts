import { APICallError } from "@ai-sdk/provider";
import { ToolLoopAgent } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { expect, it } from "vitest";
import { MIGRATION_AGENT_POLICY } from "../../src/lib/migration/agent-policy";

it("makes one provider call for a retryable error", async () => {
  let calls = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      calls += 1;
      throw new APICallError({
        message: "retryable",
        url: "https://provider.invalid",
        requestBodyValues: {},
        statusCode: 503,
        isRetryable: true,
      });
    },
  });
  const agent = new ToolLoopAgent({ model, ...MIGRATION_AGENT_POLICY });
  await expect(agent.generate({ prompt: "test" })).rejects.toThrow("retryable");
  expect(calls).toBe(1);
});
