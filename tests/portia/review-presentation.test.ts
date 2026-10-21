/// <reference types="vite/client" />
import agentTest from "@convex-dev/agent/test";
import betterAuthTest from "@convex-dev/better-auth/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "../helpers/portia-protocol-model";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import type { ModelMessage } from "ai";
import type { createMigrationMainAgent } from "../../src/lib/migration/domain-agent";
import { internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { AuthoritySession } from "../../src/lib/authority/session";
import { APPROVE } from "../../src/lib/authority/contract";
import { executeAuthorizedOperations } from "../../src/lib/authority/execute";
import { QuoteSession } from "../../src/lib/portia/session";

const mocks=vi.hoisted(()=>({bridge:vi.fn(),agent:vi.fn()}));
vi.mock('../../src/lib/migration/config',()=>({migrationPreviewEnabled:()=>true}));
vi.mock('../../src/lib/migration/origin',()=>({trustedMigrationOrigin:()=> 'https://portia.test'}));
vi.mock('../../src/lib/memory/session',()=>({memoryFeatureEnabled:()=>false}));
vi.mock('../../src/lib/migration/domain-agent',async original=>({...await original<object>(),createMigrationMainAgent:mocks.agent}));
vi.mock('../../src/lib/migration/bridge',()=>({callMigrationBridge:mocks.bridge,MigrationTokenManager:class{initialize=async()=>{};refresh=async()=>{};stop=()=>{};}}));
import { POST } from "../../src/app/api/migration/chat/route";
const modules=import.meta.glob("../../convex/**/*.ts");
const usage={inputTokens:{total:1,noCache:1,cacheRead:undefined,cacheWrite:undefined},outputTokens:{total:1,text:1,reasoning:undefined}};
beforeEach(()=>{vi.clearAllMocks();for(const[k,v]of Object.entries({PORTIA_ENABLED:"true",PORTIA_CONVEX_DEPLOYMENT:"brilliant-whale-380",CONVEX_SITE_URL:"https://brilliant-whale-380.convex.site",PORTIA_AUTH_MODE:"basic"}))vi.stubEnv(k,v);});
afterEach(()=>vi.unstubAllEnvs());

it.each(["imitation","paired-error","clarification","unbacked"] as const)("owns exact review presentation without losing %s history",async kind=>{
  const t=convexTest(schema,modules);agentTest.register(t);betterAuthTest.register(t);const ownerId="review-owner";
  const question="Create the supplied Cedar quotation: fee USD37.125, line rounding to2 decimals. Also retain Elm with fee23 if its currency is missing.";
  let run:{runId:Id<"migrationRuns">;conversationId:Id<"migrationConversations">;fence:number}|undefined;
  let completed:{revision:number}|undefined;
  let completeArgs:Record<string,unknown>|undefined;
  mocks.bridge.mockImplementation(async(_manager,call)=>{
    if(call.op==="claim"){const value=await t.mutation(internal.migration.claimQuestion,{ownerId,...call.args});run=value;return value;}
    if(call.op==="context")return t.query(internal.migration.getRunContext,{ownerId,...call.args});
    if(call.op==="checkpoint")return t.mutation(internal.migration.checkpointRun,{ownerId,...call.args});
    if(call.op==="complete"){completeArgs=structuredClone(call.args);const value=await t.mutation(internal.migration.completeRun,{ownerId,...JSON.parse(JSON.stringify(call.args))});completed=value;return value;}
    if(call.op==="status")return {active:true};
    if(call.op==="fail")return {};
    throw Error("Unexpected bridge operation "+call.op);
  });
  const actual=await vi.importActual<typeof import('../../src/lib/migration/domain-agent')>('../../src/lib/migration/domain-agent');
  let step=0;const offered:string[][]=[];
  const model=new MockLanguageModelV4({doStream:async options=>{
    offered.push((options.tools??[]).flatMap(tool=>tool.type==="function"?[tool.name]:[]));const n=step++;
    return {stream:new ReadableStream<LanguageModelV4StreamPart>({start(c){
      c.enqueue({type:"stream-start",warnings:[]});
      if(n===0){
        if(kind==="unbacked")c.enqueue({type:"tool-call",toolCallId:"read-only",toolName:"manage_quote",input:JSON.stringify({action:"read",readScope:"current-chat"})});
        else c.enqueue({type:"tool-call",toolCallId:"cedar",toolName:"manage_quote",input:JSON.stringify({action:"create",name:"Cedar",pricing:"supplied",lines:[{name:"fee",currency:"USD",billing:{kind:"flat",price:"37.125",basis:"user-stated-flat"}}],terms:{rounding:{stage:"line",decimals:2}}})});
        if(kind==="clarification")c.enqueue({type:"tool-call",toolCallId:"elm",toolName:"manage_quote",input:JSON.stringify({action:"create",name:"Elm",pricing:"supplied",lines:[{name:"fee",billing:{kind:"flat",price:"23",basis:"user-stated-flat"}}]})});
      } else if(n===1){
        // A model may still emit a tool omitted from activeTools. Server state
        // must decide presentation; text/title heuristics cannot establish consent.
        c.enqueue({type:"tool-call",toolCallId:"model-form",toolName:"ask_user_input",input:JSON.stringify(kind==="paired-error"?{title:"Malformed",fields:[]}:kind==="clarification"?{title:"Missing input",description:"Which currency applies to Elm?",fields:[{name:"currency",label:"Currency",type:"text",required:true}]}:{title:"A generic heading",description:"X".repeat(500),fields:[{name:"choice",label:"Continue?",type:"radio",options:["Apply","Do not apply"],required:true}]})});
      } else {c.enqueue({type:"text-start",id:"done"});c.enqueue({type:"text-delta",id:"done",delta:"Prepared."});c.enqueue({type:"text-end",id:"done"});}
      c.enqueue({type:"finish",usage,finishReason:{unified:n<2?"tool-calls":"stop",raw:undefined}});c.close();
    }})};
  }});
  mocks.agent.mockImplementation((options:Parameters<typeof createMigrationMainAgent>[0])=>actual.createMigrationMainAgent({...options,mainModel:model}));
  const response=await POST(new Request("https://portia.test/api/chat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:"question",question,conversationId:null,expectedRevision:null,requestId:crypto.randomUUID(),modelAlias:"model-1"})}));
  const wire=await response.text();expect(response.status).toBe(200);expect(completeArgs).toBeDefined();
  const form=completeArgs!.form as {toolCallId:string;description?:string};
  if(kind==="unbacked"){
    expect(offered[1]).not.toContain("ask_user_input"); expect(form).toBeNull(); expect(completeArgs!.authorizationProposal).toBeUndefined();
    expect(wire).not.toContain("A generic heading"); expect(wire).toMatch(/No new operation was prepared for approval|could not complete because its business tool call failed/);
    const messages:ModelMessage[]=[...mocks.bridge.mock.calls.flatMap(([,call])=>call.op==="checkpoint"?call.args.responseMessages:[]),...completeArgs!.responseMessages as ModelMessage[]];
    const parts:Array<{type:string;toolCallId:string}>=[];
    for(const message of messages)if(Array.isArray(message.content))for(const part of message.content)if("toolCallId" in part&&typeof part.toolCallId==="string")parts.push({type:part.type,toolCallId:part.toolCallId});
    expect(parts.filter(part=>part.type==="tool-call"&&part.toolCallId==="model-form")).toHaveLength(1);
    expect(parts.filter(part=>part.type==="tool-result"&&part.toolCallId==="model-form")).toHaveLength(1);
    return;
  }
  if(kind==="clarification"){
    expect(offered[1]).toContain("ask_user_input");expect(form.toolCallId).toBe("model-form");
    expect(completeArgs!.authorizationProposal).toBeUndefined();expect(completeArgs!.authorizationContinuation).toHaveLength(1);expect(wire).toContain("Missing input");return;
  }
  expect(offered[1]).not.toContain("ask_user_input");expect(form.toolCallId).toMatch(/^authorization-/);
  expect(form.description!.length).toBeGreaterThan(500);expect(wire).toContain("Confirm exact operations");expect(wire).not.toContain("X".repeat(100));expect(wire).not.toContain("A generic heading");
  expect(wire).not.toContain("business tool call failed");
  expect(completeArgs!.authorizationProposal).toBeDefined();
  if(!run||!completed)throw Error("No persisted completion");
  const grant=await t.mutation(internal.migration.resolveFormAndClaim,{ownerId,conversationId:run.conversationId,requestId:"approve",payloadHash:"approve",toolCallId:form.toolCallId,values:{decision:APPROVE},cancelled:false,note:"",modelAlias:"model-1",expectedRevision:completed.revision});
  const context=await t.query(internal.migration.getRunContext,{ownerId,runId:grant.runId,fence:grant.fence});
  const parts:Array<{type:string;toolCallId:string}>=[];
  for(const message of context.messages)if(Array.isArray(message.content))for(const part of message.content)if("toolCallId" in part&&typeof part.toolCallId==="string")parts.push({type:part.type,toolCallId:part.toolCallId});
  expect(parts.filter(part=>part.type==="tool-call"&&part.toolCallId==="model-form")).toHaveLength(1);
  expect(parts.filter(part=>part.type==="tool-result"&&part.toolCallId==="model-form")).toHaveLength(1);
  const session=new QuoteSession(run.conversationId);session.bindAuthority(new AuthoritySession(context.authorityContext));await session.initialize(context.messages as ModelMessage[]);
  const result=await executeAuthorizedOperations({authorization:context.authorization!,session,signal:new AbortController().signal});
  expect(result.text).toContain("USD 37.13");
  await t.mutation(internal.migration.completeRun,{ownerId,runId:grant.runId,fence:grant.fence,responseMessages:JSON.parse(JSON.stringify(result.messages)),form:null,finishReason:"stop"});
});
