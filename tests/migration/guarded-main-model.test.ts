import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult, LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { describe, expect, it, vi } from "vitest";
import { createGuardedMainModel } from "../../src/lib/migration/guarded-main-model";
import { RequestEvidence } from "../../src/lib/migration/request-evidence";
import { formInputSchema } from "../../src/lib/migration/contracts";

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } };
const form = (input: unknown) => ({ type: "tool-call" as const, toolName: "ask_user_input", toolCallId: "form", input: JSON.stringify(input) });
const generated = (content: LanguageModelV4GenerateResult["content"]): LanguageModelV4GenerateResult => ({ content, finishReason: { unified: content.some(c=>c.type==="tool-call") ? "tool-calls" : "stop", raw: undefined }, usage, warnings: [] });
const source = (text = "Estimate berth hire for GT 12000.") => { const e = new RequestEvidence(); e.initialize([{ role: "user", content: text }]); return e; };
async function drain(stream: ReadableStream<LanguageModelV4StreamPart>) {
  const parts: LanguageModelV4StreamPart[] = []; const reader = stream.getReader();
  try { while (true) { const next = await reader.read(); if (next.done) break; parts.push(next.value); } }
  finally { reader.releaseLock(); }
  return parts;
}

describe("guarded main-model boundary", () => {
  it("answers invalid inputs without a provider request", async () => {
    const raw = new MockLanguageModelV4();
    const model=createGuardedMainModel(raw,source("Estimate berth hire for GT -4."));
    const result=await model.doGenerate({prompt:[]});
    expect(result.content).toEqual([{type:"text",text:expect.stringMatching(/GT must be positive/)}]);
    expect(raw.doGenerateCalls).toHaveLength(0); expect(result.usage.inputTokens.total).toBe(0);
  });
  it("normalizes harmless nullable form metadata before persistence validation", async () => {
    const raw=new MockLanguageModelV4({doGenerate:generated([form({title:"Terminal",description:null,fields:[{name:"terminal",type:"text",label:"Which terminal?",options:null,hint:null}]})])});
    const result=await createGuardedMainModel(raw,source()).doGenerate({prompt:[]});
    const call=result.content[0]; expect(call.type).toBe("tool-call");
    if(call.type==="tool-call") expect(formInputSchema.parse(JSON.parse(call.input))).toEqual({title:"Terminal",description:"Supplied GT: 12,000",fields:[{name:"terminal",type:"text",label:"Which terminal?",required:true}]});
    expect(result.usage).toEqual(usage);
  });
  it("recovers invalid forms as plain clarification without an extra provider request", async () => {
    const raw=new MockLanguageModelV4({doGenerate:generated([form({title:"Missing",fields:[{name:"bad name",type:"text",label:"Which terminal?"}]})])});
    const result=await createGuardedMainModel(raw,source()).doGenerate({prompt:[]});
    expect(result.content).toEqual([{type:"text",text:expect.stringContaining("Which terminal?")}]);
    expect(result.finishReason.unified).toBe("stop"); expect(raw.doGenerateCalls).toHaveLength(1);
  });
  it("defers mixed form requests until executable tools finish instead of persisting mixed calls", async () => {
    const calculator={type:"tool-call" as const,toolName:"calculate_charges",toolCallId:"calc",input:'{"expression":"1+1"}'};
    const raw=new MockLanguageModelV4({doGenerate:generated([calculator,form({title:"Terminal",fields:[{name:"terminal",type:"text",label:"Terminal",required:true}]})])});
    const result=await createGuardedMainModel(raw,source()).doGenerate({prompt:[]});
    expect(result.content).toEqual([calculator]); expect(result.finishReason.unified).toBe("tool-calls");
  });
  it("withholds fabricated amounts from streaming text and keeps provider usage", async () => {
    const raw=new MockLanguageModelV4({doStream:async()=>({stream:new ReadableStream({start(c){
      c.enqueue({type:"text-start",id:"x"});c.enqueue({type:"text-delta",id:"x",delta:"Berth hire is INR 1200000."});c.enqueue({type:"text-end",id:"x"});
      c.enqueue({type:"finish",finishReason:{unified:"stop",raw:undefined},usage});c.close();
    }})})});
    const parts=await drain((await createGuardedMainModel(raw,source()).doStream({prompt:[]})).stream);
    expect(JSON.stringify(parts)).not.toContain("1200000"); expect(JSON.stringify(parts)).toContain("No rate was supplied");
    expect(parts.at(-1)).toMatchObject({type:"finish",usage});
  });
  it("normalizes a fragmented streamed form before the SDK or persistence sees arguments", async () => {
    const call = form({ title: "Terminal", fields: [{ name: "terminal", label: "Terminal", type: "text", required: null, options: null }] });
    const raw = new MockLanguageModelV4({ doStream: async () => ({ stream: new ReadableStream({ start(c) {
      c.enqueue({ type: "tool-input-start", id: call.toolCallId, toolName: call.toolName });
      c.enqueue({ type: "tool-input-delta", id: call.toolCallId, delta: call.input });
      c.enqueue({ type: "tool-input-end", id: call.toolCallId }); c.enqueue(call);
      c.enqueue({ type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage }); c.close();
    } }) }) });
    const parts = await drain((await createGuardedMainModel(raw, source()).doStream({ prompt: [] })).stream);
    expect(parts.some(p => p.type.startsWith("tool-input-"))).toBe(false);
    const normalized = parts.find(p => p.type === "tool-call");
    expect(normalized?.type).toBe("tool-call");
    if (normalized?.type === "tool-call") expect(formInputSchema.parse(JSON.parse(normalized.input)).fields[0].required).toBe(true);
  });
  it("never converts truncated or errored output into successful clarification", async () => {
    for(const mode of ["truncated","error","length"]){
      const raw=new MockLanguageModelV4({doStream:async()=>({stream:new ReadableStream({start(c){
        c.enqueue({type:"tool-input-start",id:"x",toolName:"ask_user_input"});
        if(mode==="error") c.enqueue({type:"error",error:new Error("Provider failed")});
        if(mode==="length") c.enqueue({type:"finish",finishReason:{unified:"length",raw:undefined},usage});
        c.close();
      }})})});
      const output=drain((await createGuardedMainModel(raw,source()).doStream({prompt:[]})).stream);
      if(mode==="error") expect(await output).toEqual([{type:"error",error:expect.any(Error)}]);
      else await expect(output).rejects.toThrow(/incomplete/i);
    }
  });
  it("propagates cancellation and bounds buffered output", async()=>{
    const cancel=vi.fn();
    const raw=new MockLanguageModelV4({doStream:async()=>({stream:new ReadableStream({cancel})})});
    await (await createGuardedMainModel(raw,source()).doStream({prompt:[]})).stream.cancel("user stop");
    expect(cancel).toHaveBeenCalledWith("user stop");
    const large=new MockLanguageModelV4({doStream:async()=>({stream:new ReadableStream({start(c){c.enqueue({type:"text-delta",id:"x",delta:"x".repeat(1_100_000)});c.close();}})})});
    await expect(drain((await createGuardedMainModel(large,source()).doStream({prompt:[]})).stream)).rejects.toThrow(/limit/i);
  });
});
