/* eslint-disable @typescript-eslint/no-require-imports -- isolated free validation preload. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const { createFreeTariffFetch } = require('./tariff-provider.cjs');
function createSharedLiveFetch({ directory, budgetDirectory, model='nvidia/nemotron-3-super-120b-a12b:free',maxDispatches=8,aggregateBudgetDirectory,upstream }) {
  fs.mkdirSync(path.join(directory,'calls'),{recursive:true});
  const context = new AsyncLocalStorage();
  const log = value => fs.appendFileSync(path.join(directory,'trace.jsonl'),JSON.stringify({at:new Date().toISOString(),...value})+'\n');
  const guarded = createFreeTariffFetch({directory,budgetDirectory,model,maxDispatches,upstream:async(input,init)=>{
    const {turnId,callId,turnSlot}=context.getStore();
    const request=JSON.parse(init.body);
    fs.writeFileSync(path.join(directory,'calls',callId+'.request.json'),JSON.stringify({turnId,turnSlot,request},null,2)+'\n');
    const response=await upstream(input,init);
    log({event:'response',turnId,callId,turnSlot,status:response.status});
    // Preserve literal synthetic model output/diagnostic without auth headers.
    (async()=>{
      const reader=response.clone().body?.getReader(),decoder=new TextDecoder();let raw='',bytes=0,first=false,semantic=false,pending='';
      try{if(reader)while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(!first){first=true;log({event:'first-body-chunk',turnId,callId,bytes:part.value.length});}
        const text=decoder.decode(part.value,{stream:true});raw=(raw+text).slice(0,1000000);pending+=text;
        const lines=pending.split('\n');pending=lines.pop()??'';
        for(const line of lines)if(line.startsWith('data: ')&&line!=='data: [DONE]'){try{const item=JSON.parse(line.slice(6));const deltas=(item.choices??[]).map(c=>c.delta??{});if(!semantic&&deltas.some(d=>d.content||d.reasoning||d.reasoning_content||d.tool_calls?.length)){semantic=true;log({event:'first-semantic-delta',turnId,callId,kinds:deltas.flatMap(d=>[d.content?'content':null,d.reasoning||d.reasoning_content?'reasoning':null,d.tool_calls?.length?'tool':null].filter(Boolean))});}}catch{/* SSE framing may span chunks. */}}
      }}catch(error){log({event:'body-rejected',turnId,callId,errorType:error.name,bytes,semanticOutputObserved:semantic});}
      finally{const secret=process.env.OPENROUTER_API_KEY;const text=secret?raw.replaceAll(secret,'[redacted]'):raw;fs.writeFileSync(path.join(directory,'calls',callId+'.response.txt'),text);
        const terminal=text.split('\n').filter(l=>l.startsWith('data: ')&&l!=='data: [DONE]').flatMap(l=>{try{return[JSON.parse(l.slice(6))];}catch{return[];}});
        log({event:'body-recorded',turnId,callId,bytes,usage:terminal.findLast(x=>x.usage)?.usage??null,finishReasons:terminal.flatMap(x=>(x.choices??[]).map(c=>c.finish_reason).filter(Boolean))});}
    })().catch(error=>{try{log({event:'recording-failed',turnId,callId,errorType:error.name});}catch{/* No unhandled rejection after shutdown. */}});
    return response;
  }});
  return async function(input,init){
    const url=new URL(typeof input==='string'?input:input.url||String(input));
    if(url.hostname!=='openrouter.ai')return upstream(input,init);
    if(fs.existsSync(path.join(budgetDirectory,'provider-systemic-failure.json')))throw new Error('Shared live batch is stopped after provider failure');
    const request=JSON.parse(init?.body||'{}');
    if(process.env.PORTIA_LOCAL_BACKEND!=='true'||process.env.PORTIA_CONVEX_DEPLOYMENT!=='local-memory-integration'||request.provider?.data_collection!=='allow'||request.provider?.zdr!==false)throw new Error('Approved synthetic-local retention route is not active');
    const turn=JSON.parse(fs.readFileSync(path.join(directory,'active-turn.json'),'utf8'));
    if(!/^[a-z0-9-]{1,80}$/.test(turn.id))throw new Error('Invalid validation turn ID');
    const turnDir=path.join(budgetDirectory,'turn-'+turn.id);fs.mkdirSync(turnDir,{recursive:true});
    let turnSlot;
    for(let i=1;i<=4;i++){try{fs.closeSync(fs.openSync(path.join(turnDir,'dispatch-'+i+'.once'),'wx',0o600));turnSlot=i;break;}catch(e){if(e.code!=='EEXIST')throw e;}}
    if(!turnSlot)throw new Error('Four-dispatch per-turn free validation ceiling reached');
    let aggregateSlot;
    if(aggregateBudgetDirectory){
      for(let i=1;i<=8;i++){try{fs.closeSync(fs.openSync(path.join(aggregateBudgetDirectory,'dispatch-'+i+'.once'),'wx',0o600));aggregateSlot=i;break;}catch(e){if(e.code!=='EEXIST')throw e;}}
      if(!aggregateSlot)throw new Error('Aggregate resumed-flow eight-dispatch ceiling reached');
    }
    const callId=crypto.randomUUID();
    log({event:'reservation',turnId:turn.id,callId,turnSlot,aggregateSlot,privacy:{dataCollection:request.provider.data_collection,zdr:request.provider.zdr},maxPrice:request.provider?.max_price,retries:0});
    return context.run({turnId:turn.id,callId,turnSlot},()=>guarded(input,init));
  };
}
module.exports={createSharedLiveFetch};
if(process.env.PORTIA_SHARED_LIVE==='true')globalThis.fetch=createSharedLiveFetch({directory:process.env.PORTIA_SHARED_LIVE_OUTPUT,budgetDirectory:process.env.PORTIA_SHARED_LIVE_BUDGET,model:process.env.PORTIA_SHARED_LIVE_MODEL,maxDispatches:Number(process.env.PORTIA_SHARED_LIVE_MAX_DISPATCHES??8),aggregateBudgetDirectory:process.env.PORTIA_SHARED_LIVE_AGGREGATE,upstream:globalThis.fetch});
