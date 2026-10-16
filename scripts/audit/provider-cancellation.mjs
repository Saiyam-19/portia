import {createOpenRouter} from '@openrouter/ai-sdk-provider';
import {writeFile} from 'node:fs/promises';
const failures=[];
const unhandled=error=>failures.push({name:error?.name,message:error?.message});
process.on('unhandledRejection',unhandled);
const results=[];
try {
  for(const order of ['abort-then-cancel','cancel-then-abort','pending-read-abort-cancel','cancel-rejects']){
    const outer=new AbortController();
    const network=async (_input,init)=>new Response(new ReadableStream({
      start(controller){init.signal.addEventListener('abort',()=>controller.error(init.signal.reason),{once:true});},
      cancel(reason){if(order==='cancel-rejects')return Promise.reject(reason);},
    }),{headers:{'Content-Type':'text/event-stream'}});
    const model=createOpenRouter({apiKey:'synthetic-audit-key',fetch:network}).chat('synthetic-test-model');
    const response=await model.doStream({prompt:[{role:'user',content:[{type:'text',text:'Synthetic fixture'}]}],abortSignal:outer.signal});
    const reader=response.stream.getReader();
    await reader.read(); // Adapter's stream-start, before any model output.
    const before=failures.length;
    const reason=new DOMException('Stopped by audit','AbortError');
    let pending;
    if(order==='pending-read-abort-cancel')pending=reader.read().catch(()=>undefined);
    if(order==='cancel-rejects'){
      await reader.cancel(reason).catch(()=>undefined);
    }else if(order==='cancel-then-abort'){
      const cancelled=reader.cancel(reason).catch(()=>undefined);outer.abort(reason);await cancelled;
    }else{
      outer.abort(reason);await reader.cancel(reason).catch(()=>undefined);
    }
    await pending;
    await new Promise(resolve=>setTimeout(resolve,50));
    results.push({order,unhandled:failures.slice(before)});
  }
}finally{process.off('unhandledRejection',unhandled);}
await writeFile('.local/audit-20261014/provider-cancellation.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results));
process.exitCode=failures.length?1:0;
