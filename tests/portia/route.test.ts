import { beforeEach, expect, it, vi } from 'vitest';
import { MockLanguageModelV4 } from '../helpers/portia-protocol-model';
import type { LanguageModelV4StreamPart, LanguageModelV4CallOptions } from '@ai-sdk/provider';
import type { createMigrationMainAgent } from '../../src/lib/migration/domain-agent';
const mocks=vi.hoisted(()=>({bridge:vi.fn(),agent:vi.fn(),stop:vi.fn()}));
vi.mock('../../src/lib/migration/config',()=>({migrationPreviewEnabled:()=>true}));
vi.mock('../../src/lib/migration/origin',()=>({trustedMigrationOrigin:()=> 'https://portia.test'}));
vi.mock('../../src/lib/memory/session',()=>({memoryFeatureEnabled:()=>false}));
vi.mock('../../src/lib/migration/domain-agent',async original=>({...await original<object>(),createMigrationMainAgent:mocks.agent}));
vi.mock('../../src/lib/migration/bridge',()=>({callMigrationBridge:mocks.bridge,MigrationTokenManager:class{initialize=async()=>{};refresh=async()=>{};stop=mocks.stop;}}));
import {POST} from '../../src/app/api/migration/chat/route';
const usage={inputTokens:{total:1,noCache:1,cacheRead:undefined,cacheWrite:undefined},outputTokens:{total:1,text:1,reasoning:undefined}};
function finishFromWork(options: LanguageModelV4CallOptions, step: number) {
 const line=options.prompt.flatMap(message=>message.role==='system'?message.content.split('\n'):[]).find(value=>value.startsWith('WORK_RESULTS='));
 if(!line)throw new Error('Missing result evidence');
 return {type:'tool-call' as const,toolCallId:'fixture-finish-'+step,toolName:'finish_turn',input:JSON.stringify({response:'Please review the prepared work.'})};
}
const coastal={pricing:'official',vesselCategoryEvidence:'Our vessel is an ordinary general-cargo ship',services:['berth','gst','rounding'],call:{port:'Mumbai',terminal:'Indira Dock',gt:'8000',service:'coastal',flag:'India',vesselCategory:'general-cargo',coastalLicence:true,berthStart:'10 October 2026 08:00 IST',berthEnd:'11 October 2026 03:40 IST',readinessTime:'11 October 2026 03:30 IST',cargoOperation:'discharging',berthAllotted:true,readinessValid:true,favourableConditions:true,idleTime:false,shifting:false,falseReadiness:false,priority:false,ousting:false,penalty:false,rebate:false,directBilling:true,registeredCustomer:true,privateCustomer:true,supplierState:'Maharashtra',supplyState:'Maharashtra',sez:false,taxExemption:false,standaloneBill:true}};
beforeEach(()=>vi.clearAllMocks());
it.each(['supplied','official','form'] as const)('persists %s results before publication and rejects stale completion',async kind=>{
 for(const reject of [false,true]){
  mocks.bridge.mockReset();let release!:()=>void,entered!:()=>void;
  const gate=new Promise<void>(r=>release=r),enteredPromise=new Promise<void>(r=>entered=r);
  const actual=await vi.importActual<typeof import('../../src/lib/migration/domain-agent')>('../../src/lib/migration/domain-agent');let calls=0;
  const model=new MockLanguageModelV4({doStream:async options=>{const first=calls++===0;return {stream:new ReadableStream<LanguageModelV4StreamPart>({start(c){
   c.enqueue({type:'stream-start',warnings:[]});c.enqueue({type:'text-start',id:'draft'});c.enqueue({type:'text-delta',id:'draft',delta:'Invented total USD 999999'});c.enqueue({type:'text-end',id:'draft'});
   if(first)c.enqueue({type:'tool-call',toolCallId:'tool-1',toolName:'manage_quote',input:JSON.stringify(kind==='form'?{action:'create',pricing:'supplied',lines:[{name:'Berth hire',billing:{kind:'flat',price:'720',basis:'user-stated-flat'}}]}:kind==='official'?{action:'create',...coastal}:{action:'create',pricing:'supplied',lines:[{name:'Berth hire',currency:'USD',billing:{kind:'flat',price:'720',basis:'user-stated-flat'}},{name:'Pilotage',currency:'USD',billing:{kind:'flat',price:'240',basis:'user-stated-flat'}},{name:'Water supply',currency:'USD',billing:{kind:'flat',price:'60',basis:'user-stated-flat'}}],terms:{taxPercent:'0'}})});
   else if(kind==='form')c.enqueue({type:'tool-call',toolCallId:'form-2',toolName:'ask_user_input',input:JSON.stringify({title:'Missing currency',fields:[{name:'currency',label:'Currency',type:'text',required:true}]})});
   else c.enqueue(finishFromWork(options,calls));
   c.enqueue({type:'finish',usage,finishReason:{unified:'tool-calls',raw:undefined}});c.close();
  }})};}});
  mocks.agent.mockImplementation((options:Parameters<typeof createMigrationMainAgent>[0])=>actual.createMigrationMainAgent({...options,mainModel:model}));
  mocks.bridge.mockImplementation(async(_manager,call)=>{
   if(call.op==='claim')return {conversationId:'chat',runId:'run',fence:1,revision:1,threadId:'thread',promptMessageId:'prompt',replayed:false};
   if(call.op==='context')return {conversationId:'chat',revision:1,messages:[{role:'user',content:'Our vessel is an ordinary general-cargo ship. Synthetic requested quotation including GST and final invoice rounding.'}],modelAlias:'model-1'};
   if(call.op==='status')return {active:true};
   if(call.op==='complete'){entered();await gate;if(reject)throw new Error('Stale fence');const text=call.args.responseMessages.filter((message:{role:string;content:unknown})=>message.role==='assistant'&&typeof message.content==='string').map((message:{content:string})=>message.content).join('\n');return {state:'idle',revision:2,publicText:text+'\n\nBackend continuation disposition recorded.'};}return {};
  });
  const response=await POST(new Request('https://portia.test/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'question',question:'Synthetic requested quotation',conversationId:null,expectedRevision:null,requestId:'a122fbae-303b-45a5-90f3-7f112025dc50',modelAlias:'model-1'})}));
  expect(response.status).toBe(200);const reader=response.body!.getReader();let wire='';
  const consume=(async()=>{while(true){const part=await reader.read();if(part.done)break;wire+=new TextDecoder().decode(part.value);}})();
  await enteredPromise;expect(wire).not.toMatch(/999999|40,876|1,020|portia-quote|Missing currency/);release();await consume;
  expect(wire).not.toContain('999999');
  if(!reject)expect(wire).toContain('Backend continuation disposition recorded.');
  const complete=mocks.bridge.mock.calls.find(([,c])=>c.op==='complete')![1];const canonical=complete.args.responseMessages.filter((message:{role:string;content:unknown})=>message.role==='assistant'&&typeof message.content==='string').map((message:{content:string})=>message.content).join('\n');expect(canonical).not.toContain('999999');expect(JSON.stringify(mocks.bridge.mock.calls.filter(([,call])=>call.op==='checkpoint'))).toContain('999999');
  if(reject)expect(wire).not.toMatch(/40,876|1,020|Missing currency/);
  else if(kind==='supplied'){expect(wire).toContain('Confirm exact operations');expect(wire).toContain('Amount: 1020');expect(complete.args.authorizationProposal).toBeDefined();expect(wire).not.toContain('portia-quote');}
  else if(kind!=='form'){expect(wire).toContain('40,876.00');expect(wire).not.toContain('"type":"error"');if(kind==='official')expect(wire).toContain('applicability is unverified');}
  else {expect(wire).toContain('Missing currency');expect(complete.args.form.toolCallId).toBe('form-2');}
  expect(calls).toBe(2);
 }
});

it.each(['lookup','invalid-quote'] as const)('persists complete mixed-task disposition for %s through the current agent and route',async kind=>{
 vi.stubEnv('VESSEL_API_KEY','');
 try {
  mocks.bridge.mockReset();let release!:()=>void,entered!:()=>void;
  const gate=new Promise<void>(r=>release=r),enteredPromise=new Promise<void>(r=>entered=r);
  const actual=await vi.importActual<typeof import('../../src/lib/migration/domain-agent')>('../../src/lib/migration/domain-agent');let calls=0;
  const model=new MockLanguageModelV4({doStream:async options=>{const first=calls++===0;return {stream:new ReadableStream<LanguageModelV4StreamPart>({start(c){
   c.enqueue({type:'stream-start',warnings:[]});
   if(first){
    c.enqueue({type:'tool-call',toolCallId:'math',toolName:'calculate_charges',input:JSON.stringify({expression:'2+3'})});
    c.enqueue({type:'tool-call',toolCallId:'other',toolName:kind==='lookup'?'search_vessels':'manage_quote',input:JSON.stringify(kind==='lookup'?{query:'Alpha'}:{pricing:'invalid'})});
   }else{c.enqueue({type:'text-start',id:'draft'});c.enqueue({type:'text-delta',id:'draft',delta:'Everything completed. Total USD 999999.'});c.enqueue({type:'text-end',id:'draft'});c.enqueue(finishFromWork(options,calls));}
   c.enqueue({type:'finish',usage,finishReason:{unified:'tool-calls',raw:undefined}});c.close();
  }})};}});
  mocks.agent.mockImplementation((options:Parameters<typeof createMigrationMainAgent>[0])=>actual.createMigrationMainAgent({...options,mainModel:model}));
  mocks.bridge.mockImplementation(async(_manager,call)=>{
   if(call.op==='claim')return {conversationId:'chat',runId:'run',fence:1,revision:1,threadId:'thread',promptMessageId:'prompt',replayed:false};
   if(call.op==='context')return {conversationId:'chat',revision:1,messages:[{role:'user',content:'Calculate 2+3 and '+(kind==='lookup'?'look up Alpha':'quote the requested berth')}],modelAlias:'model-1'};
   if(call.op==='status')return {active:true};
   if(call.op==='complete'){entered();await gate;return {state:'idle',revision:2};}return {};
  });
  const response=await POST(new Request('https://portia.test/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'question',question:'Mixed request',conversationId:null,expectedRevision:null,requestId:'a122fbae-303b-45a5-90f3-7f112025dc50',modelAlias:'model-1'})}));
  const reader=response.body!.getReader();let wire='';const consume=(async()=>{while(true){const part=await reader.read();if(part.done)break;wire+=new TextDecoder().decode(part.value);}})();
  await enteredPromise;expect(wire).not.toContain('**5**');release();await consume;
  const complete=mocks.bridge.mock.calls.find(([,call])=>call.op==='complete')![1];const saved=JSON.stringify(complete.args.responseMessages);
  for(const text of [saved,wire]){expect(text).toContain('**5**');expect(text).toMatch(kind==='lookup'?/lookup is not configured/i:/quotation.*could not complete/i);expect(text).not.toContain('999999');}
 } finally {vi.unstubAllEnvs();}
});
