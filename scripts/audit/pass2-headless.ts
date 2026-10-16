import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createOpenRouter} from '@openrouter/ai-sdk-provider';
import type {ModelMessage} from 'ai';
import {createMigrationMainAgent} from '../../src/lib/migration/domain-agent';
import {ConversationSession} from '../../src/lib/migration/conversation-session';
import {HEADLESS_POLICY,checkDispatch,reserveDispatch,type AccountedCall} from './pass2-budget';

const root=path.resolve('output/pass2/live'),sha=(x:string|Buffer)=>createHash('sha256').update(x).digest('hex');
fs.mkdirSync(path.join(root,'calls'),{recursive:true});
const freeze=JSON.parse(fs.readFileSync(path.join(root,'freeze.json'),'utf8'));
if(process.argv[2]!=='--run-frozen')throw new Error('Explicit frozen-run flag required');
if(fs.existsSync(path.join(root,'ledger.json')))throw new Error('A ledger already exists; never reset a spent budget or replay this run');
const lock=fs.openSync(path.join(root,'run.lock'),'wx');
fs.writeSync(lock,JSON.stringify({pid:process.pid,task:'01a145b5-e5e1-75b3-b810-f039c5d31693'}));
type Call=AccountedCall&{id:string;turnId:string;repair:boolean;status:string;usage?:unknown;error?:string;provider?:string;generationId?:string};
const ledger={policy:HEADLESS_POLICY,commit:freeze.commit,calls:[] as Call[],halt:null as string|null};
const save=()=>{fs.writeFileSync(path.join(root,'ledger.json.tmp'),JSON.stringify(ledger,null,2));fs.renameSync(path.join(root,'ledger.json.tmp'),path.join(root,'ledger.json'));};
function verify(){
  if(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==freeze.commit)throw new Error('Frozen commit changed');
  for(const [file,hash]of Object.entries(freeze.files))if(sha(fs.readFileSync(file))!==hash)throw new Error('Frozen file changed: '+file);
}
let turnId='';const pendingRecords:Promise<void>[]=[];
const rawFetch=globalThis.fetch;
// No UI, server, backend, deployment or auxiliary network calls are permitted.
const guarded:typeof fetch=async(input,init)=>{
  verify();if(ledger.halt)throw new Error(ledger.halt);
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(url.href!=='https://openrouter.ai/api/v1/chat/completions'||typeof init?.body!=='string')throw new Error('Unexpected network request');
  const request=JSON.parse(init.body);request.stream_options={include_usage:true};
  const prior=ledger.calls.filter(c=>c.turnId===turnId).length;
  const repair=checkDispatch(request,prior);
  let reservation;try{reservation=reserveDispatch(ledger.calls,Buffer.byteLength(JSON.stringify(request)),request.max_tokens);}catch(e){ledger.halt=String(e);save();throw e;}
  const row:Call={id:randomUUID(),turnId,repair,status:'reserved',...reservation};ledger.calls.push(row);save();
  fs.writeFileSync(path.join(root,'calls',row.id+'.request.json'),JSON.stringify({turnId,commit:freeze.commit,request},null,2));
  let response:Response;try{response=await rawFetch(url,{...init,body:JSON.stringify(request)});}catch(e){row.status='transport-error';row.error=(e as Error).name;save();throw e;}
  const recording=(async()=>{
    let raw='';const reader=response.clone().body!.getReader(),decoder=new TextDecoder();
    try{while(true){const next=await reader.read();if(next.done)break;raw+=decoder.decode(next.value,{stream:true});if(raw.length>2_000_000){await reader.cancel();throw new Error('Response size bound');}}row.status=response.ok?'complete':'http-error';}
    catch(e){row.status='body-error';row.error=(e as Error).name;}
    fs.writeFileSync(path.join(root,'calls',row.id+'.response.txt'),raw);
    for(const line of raw.split('\n'))if(line.startsWith('data: {')){
      let data;try{data=JSON.parse(line.slice(6));}catch{continue;}
      if(data.provider)row.provider=data.provider;if(data.id)row.generationId=data.id;
      if(data.usage){row.usage=data.usage;const cost=data.usage.cost;if(typeof cost==='number'&&Number.isFinite(cost)&&cost>=0)row.actualMicros=Math.ceil(cost*1e6);}
    }
    if(row.actualMicros!==undefined&&row.actualMicros>row.reserveMicros)ledger.halt='Provider usage exceeded its reservation';
    if(ledger.calls.reduce((sum,c)=>sum+(c.actualMicros??c.reserveMicros),0)>=HEADLESS_POLICY.stopMicros)ledger.halt='80 percent stop threshold';save();
  })();pendingRecords.push(recording);return response;
};
globalThis.fetch=guarded;
const envText=fs.readFileSync('backend/.env','utf8');
const apiKey=/^OPENROUTER_API_KEY\s*=\s*["']?([^\s"'\r\n]+)/m.exec(envText)?.[1];
if(!apiKey)throw new Error('Existing credential unavailable');
const provider=createOpenRouter({apiKey,fetch:guarded,compatibility:'strict'});
const model=provider.chat(HEADLESS_POLICY.model,{reasoning:HEADLESS_POLICY.reasoning as {enabled:boolean;effort:'medium'},provider:{allow_fallbacks:false,require_parameters:true,data_collection:'allow',zdr:false,only:['openai'],max_price:{prompt:2,completion:10,request:0}}});
const cases=JSON.parse(fs.readFileSync('tests/migration/pass1/inputs.json','utf8')).inputs;
const required:Record<string,string[]>={D11:['USD 1,100.00','billable periods 3'],D19:['USD 1,280.00','berth hire','pilotage','water supply'],D19correction:['USD 1,295.00','USD 825.00','USD 390.00','USD 80.00'],D24:['INR 113,220.00','INR 114,500.00','INR 1,280.00'],'original-19':['INR 60,000.00','INR 62,500.00','INR 120,000.00','billable periods 24','billable periods 25','billable periods 48'],D02:['30.5 hours','billable periods 6','INR 24,000.00']};
const results:unknown[]=[];
try{
  verify();save();
  for(let repetition=1;repetition<=3&&!ledger.halt;repetition++)for(const id of ['D11','D19','D24','original-19','D02']){
    if(ledger.halt)break;const messages:ModelMessage[]=[];
    for(const [index,input]of (cases[id] as string[]).entries()){
      if(ledger.halt)break;turnId=`r${repetition}-${id}-t${index+1}`;messages.push({role:'user',content:input});
      const session=new ConversationSession({runId:'headless-'+turnId,fence:1,revision:index+1});
      let text='',error:string|undefined;
      try{
        const agent=createMigrationMainAgent({alias:'model-1',mainModel:model,conversation:session});
        const result=await agent.stream({messages,abortSignal:AbortSignal.timeout(240000)});
        for await(const part of result.stream){if(part.type==='text-delta')text+=part.text;if(part.type==='error')throw part.error;}
        messages.push(...await result.responseMessages);
      }catch(e){error=e instanceof Error?e.message:String(e);}
      await Promise.all(pendingRecords);verify();
      const expected=required[index?`${id}correction`:id];
      const passed=!error&&session.answer?.complete===true&&expected.every(token=>text.includes(token));
      results.push({id:turnId,case:id,repetition,turn:index+1,input,text,error,passed,answer:session.answer,state:session.state,calls:ledger.calls.filter(c=>c.turnId===turnId).map(c=>c.id)});
      fs.writeFileSync(path.join(root,'results.json'),JSON.stringify(results,null,2));
      console.log(JSON.stringify({id:turnId,passed,error,accountedUsd:ledger.calls.reduce((n,c)=>n+(c.actualMicros??c.reserveMicros),0)/1e6}));
    }
  }
}finally{await Promise.allSettled(pendingRecords);save();fs.closeSync(lock);fs.unlinkSync(path.join(root,'run.lock'));fs.writeFileSync(path.join(root,'finished.json'),JSON.stringify({finishedAt:new Date().toISOString(),turns:results.length,halt:ledger.halt,accountedUsd:ledger.calls.reduce((n,c)=>n+(c.actualMicros??c.reserveMicros),0)/1e6},null,2));}
