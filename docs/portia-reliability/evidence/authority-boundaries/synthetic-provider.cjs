const fs=require('node:fs');
const original=globalThis.fetch;
const log=__dirname+'/browser-provider.jsonl';
globalThis.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input.url||String(input));
 if(url.hostname!=='openrouter.ai')return original(input,init);
 if(url.pathname!=='/api/v1/chat/completions')throw new Error('SYNTHETIC_ONLY_NO_EXTERNAL_MODEL');
 const req=JSON.parse(init?.body||'{}'),messages=req.messages||[];
 const user=[...messages].reverse().find(m=>m.role==='user');
 const text=typeof user?.content==='string'?user.content:JSON.stringify(user?.content||'');
 const after=messages.slice(messages.lastIndexOf(user)+1).some(m=>m.role==='tool');
 const saved=JSON.stringify(messages.filter(m=>m.role==='system').map(m=>m.content));
 const sys=messages.filter(m=>m.role==='system'||m.role==='developer').map(m=>typeof m.content==='string'?m.content:(m.content||[]).map(p=>p.text||'').join('\n')).join('\n');
 const match=sys.match(/SAVED_QUOTES=(\{[^\n]*\})/);let quote;
 try{quote=match?JSON.parse(match[1]).quotes[0]:undefined;}catch{}
 fs.appendFileSync(__dirname+'/synthetic-diagnostics.jsonl',JSON.stringify({roles:messages.map(m=>m.role),hasSaved:sys.includes('SAVED_QUOTES'),matched:!!match,hasQuote:!!quote,scenario:text.match(/AUTHORITY_\w+/)?.[0]})+'\n');
 let calls=[];
 if(!after){
 if(text.includes('AUTHORITY_QUOTE'))calls=[['manage_quote',{pricing:'supplied',lines:[{name:'Berth',currency:'USD',amount:'137.50'},{name:'Water',currency:'USD',amount:'24.25'}],terms:{taxPercent:'0'}}]];
 else if(text.includes('AUTHORITY_CHANGE')){if(!quote)throw new Error('SYNTHETIC_QUOTE_MISSING');calls=[['manage_quote',{quoteId:quote.id,lines:[{name:'Berth',amount:'999'}]}]];}
 else if(text.includes('AUTHORITY_READ')){if(!quote)throw new Error('SYNTHETIC_QUOTE_MISSING');calls=[['manage_quote',{quoteId:quote.id}]];}
 else if(text.includes('AUTHORITY_MEMORY'))calls=[['remember_memory',{key:'audit_port',value:'Synthetic Mumbai'}]];
 else if(text.includes('AUTHORITY_FORGET'))calls=[['forget_memory',{key:'audit_port'}]];
 else if(!text.includes('AUTHORITY_'))throw new Error('UNRECOGNIZED_SYNTHETIC_SCENARIO');
 }
 fs.appendFileSync(log,JSON.stringify({time:Date.now(),scenario:text.match(/AUTHORITY_\w+/)?.[0],after,tools:calls.map(c=>c[0]),synthetic:true})+'\n');
 const encoder=new TextEncoder();
 return new Response(new ReadableStream({start(c){
 const emit=(delta,finish_reason=null)=>c.enqueue(encoder.encode('data: '+JSON.stringify({id:'authority-synthetic',object:'chat.completion.chunk',created:1,model:req.model,choices:[{index:0,delta,finish_reason}]})+'\n\n'));
 if(calls.length){emit({role:'assistant',tool_calls:calls.map(([name,args],index)=>({index,id:'synthetic-'+Date.now()+'-'+index,type:'function',function:{name,arguments:JSON.stringify(args)}}))});emit({},'tool_calls');}
 else{emit({role:'assistant',content:'Synthetic response completed.'});emit({},'stop');}
 c.enqueue(encoder.encode('data: [DONE]\n\n'));c.close();
 }}),{headers:{'Content-Type':'text/event-stream'}});
};
