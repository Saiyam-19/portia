import { readFileSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { createMigrationMainAgent as realAgent } from "../../src/lib/migration/domain-agent";
import { quotationProposal } from "./conversation-fixtures";
import { buildCallContext } from "../../src/lib/migration/call-context";
import { prepareSuppliedQuotation, calculateSuppliedQuotation, verifySuppliedQuotation } from "../../src/lib/migration/supplied-quotation";

const mocks = vi.hoisted(() => ({ bridge: vi.fn(), agent: vi.fn(), stop: vi.fn() }));
vi.mock("../../src/lib/migration/config", () => ({ migrationPreviewEnabled: () => true }));
vi.mock("../../src/lib/migration/origin", () => ({ trustedMigrationOrigin: () => "https://portia.test" }));
vi.mock("../../src/lib/memory/session", () => ({ memoryFeatureEnabled: () => false }));
vi.mock("../../src/lib/migration/domain-agent", async importOriginal => ({ ...await importOriginal<object>(), createMigrationMainAgent: mocks.agent }));
vi.mock("../../src/lib/migration/bridge", () => ({ callMigrationBridge: mocks.bridge,
  MigrationTokenManager: class { initialize = async () => {}; refresh = async () => {}; stop = mocks.stop; },
}));
import { POST } from "../../src/app/api/migration/chat/route";

const question = JSON.parse(readFileSync("tests/acceptance/portia/development.json", "utf8")).cases.find((c: {id:string}) => c.id === "D01").steps[0].text;
const messages = [{ role: "user" as const, content: question }];
const binding = { runId: "run", fence: 1, revision: 1, conversationId: "chat" };
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } };
const request = () => new Request("https://portia.test/api/chat", { method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:"question",question,conversationId:null,expectedRevision:null,requestId:"a122fbae-303b-45a5-90f3-7f112025dc50",modelAlias:"model-1"}) });
beforeEach(async () => {
  vi.clearAllMocks();
  const actual = await vi.importActual<typeof import("../../src/lib/migration/domain-agent")>("../../src/lib/migration/domain-agent");
  mocks.agent.mockImplementation((options: Parameters<typeof realAgent>[0]) => actual.createMigrationMainAgent({ interpretationFormat: "legacy", ...options, mainModel: new MockLanguageModelV4({ doStream: async () => {
    const proposal = await quotationProposal(question);
    return { warnings: [], stream: new ReadableStream<LanguageModelV4StreamPart>({ start(c) {
      c.enqueue({type:"stream-start",warnings:[]});
      c.enqueue({type:"tool-call",toolCallId:"quote",toolName:"interpret_request",input:JSON.stringify(proposal)});
      c.enqueue({type:"finish",finishReason:{unified:"tool-calls",raw:undefined},usage});c.close();
    } }) };
  } }) }));
});

it("rejects altered arithmetic, source bindings and run bindings", () => {
  const plan = prepareSuppliedQuotation(buildCallContext(messages),binding)!;
  const ledger = calculateSuppliedQuotation(plan);
  expect(verifySuppliedQuotation(ledger,plan)).toBe(true);
  for (const mutate of [
    (x: typeof ledger) => { x.lines[0].exactAmount="1"; },
    (x: typeof ledger) => { x.calculations[0].expression="1+1"; },
    (x: typeof ledger) => { x.sourceRefs[0].raw="999"; },
    (x: typeof ledger) => { x.binding.revision++; },
  ]) { const copy = structuredClone(ledger);mutate(copy);expect(verifySuppliedQuotation(copy,plan)).toBe(false); }
  const changed = prepareSuppliedQuotation(buildCallContext([{role:"user",content:question.replace("12,500", "20,000")}]),binding)!;
  expect(calculateSuppliedQuotation(changed).totals[0].displayAmount).toBe("USD 5,400.00");
});

it.each([false,true])("publishes only after durable completion; reject=%s", async reject => {
  let release!: () => void, entered!: () => void;
  const commitEntered = new Promise<void>(resolve => {entered=resolve;});
  const commitGate = new Promise<void>(resolve => {release=resolve;});
  mocks.bridge.mockImplementation(async (_manager, call) => {
    if(call.op === "claim") return {...binding,threadId:"thread",promptMessageId:"prompt",replayed:false};
    if(call.op === "context") return {...binding,messages,modelAlias:"model-1"};
    if(call.op === "status") return {active:true};
    if(call.op === "complete") {entered();await commitGate;if(reject)throw new Error("Stale fence");return {state:"idle",revision:2};}
    return {};
  });
  const response = await POST(request());expect(response.status).toBe(200);
  const reader=response.body!.getReader();let wire="";
  const consume=(async()=>{while(true){const part=await reader.read();if(part.done)break;wire+=new TextDecoder().decode(part.value);}})();
  await commitEntered;
  expect(wire).not.toMatch(/4,275|4275|exactAmount|sourceRefs/);
  release();await consume;
  const completions=mocks.bridge.mock.calls.filter(([,call])=>call.op==="complete");expect(completions).toHaveLength(1);
  if(reject)expect(wire).not.toMatch(/4,275|4275|exactAmount|sourceRefs/);
  else {expect(wire).toContain("4,275.00");expect(JSON.stringify(completions[0][1].args.responseMessages)).toContain("4,275.00");}
});
