/* eslint-disable @typescript-eslint/no-require-imports -- Node preload is CommonJS. */
// Audit-only provider substitute. No request to OpenRouter leaves this process.
const fs = require('node:fs');
const auditOutput=process.env.PORTIA_AUDIT_OUTPUT_DIR||require('node:path').join(process.cwd(),'.local/audit-20261014');
fs.mkdirSync(auditOutput,{recursive:true});
const original = globalThis.fetch;
const interruptedClaims=new Set();
globalThis.fetch = async function (input, init) {
  const url = new URL(typeof input === 'string' ? input : input.url || String(input));
  if(url.hostname==='127.0.0.1'&&url.port==='3221'&&url.pathname==='/migration/bridge'){
    const call=JSON.parse(init?.body||'{}');
    if(call.op==='claim'&&call.args?.question==='AUDIT_SAVED_RETRY'){
      fs.appendFileSync(require('node:path').join(auditOutput,'claim-retry-events.jsonl'),JSON.stringify({requestId:call.args.requestId})+'\n');
      if(!interruptedClaims.has(call.args.requestId)){
        interruptedClaims.add(call.args.requestId);
        return Response.json({error:'Synthetic preclaim interruption'},{status:503});
      }
    }
  }
  if (url.hostname !== 'openrouter.ai') return original(input, init);
  const request = JSON.parse(init?.body || '{}');
  const messages = request.messages || [];
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  const text = typeof lastUser?.content === 'string' ? lastUser.content : JSON.stringify(lastUser?.content || '');
  const hasToolAfterUser = messages.slice(messages.lastIndexOf(lastUser) + 1).some(m => m.role === 'tool');
  const scenario = text.includes('AUDIT_REMEMBER') ? 'memory' : text.includes('AUDIT_FORM') ? 'form' : text.includes('AUDIT_ERROR') ? 'error' : text.includes('AUDIT_SLOW') ? 'slow' : 'success';
  fs.appendFileSync(require('node:path').join(auditOutput,'provider-events.jsonl'), JSON.stringify({time:Date.now(),scenario,model:request.model,tools:(request.tools||[]).map(t=>t.function?.name)})+'\n');
  if (scenario === 'error') return new Response(JSON.stringify({error:{message:'Synthetic audit outage',code:503}}),{status:503,headers:{'Content-Type':'application/json'}});
  const encoder = new TextEncoder();
  let timer;
  const stream = new ReadableStream({start(controller) {
    const send = (delta,finish_reason=null) => controller.enqueue(encoder.encode('data: '+JSON.stringify({id:'audit-mock',object:'chat.completion.chunk',created:1,model:request.model,choices:[{index:0,delta,finish_reason}]})+'\n\n'));
    const finish=()=>{
      if (scenario==='memory'&&!hasToolAfterUser) {
        send({role:'assistant',tool_calls:[
          {index:0,id:'audit-remember-'+Date.now(),type:'function',function:{name:'remember_memory',arguments:JSON.stringify({key:'audit_fact',value:'SYNTHETIC-20261014'})}},
          {index:1,id:'audit-notes-'+Date.now(),type:'function',function:{name:'write_scratchpad',arguments:JSON.stringify({markdown:'SYNTHETIC WORKING NOTE'})}}
        ]});send({},'tool_calls');
      } else if (scenario==='form'&&!hasToolAfterUser) {
        send({role:'assistant',tool_calls:[{index:0,id:'audit-form-'+Date.now(),type:'function',function:{name:'ask_user_input',arguments:JSON.stringify({title:'Audit vessel details',fields:text.includes('AUDIT_FORM_MANY')?Array.from({length:8},(_,i)=>({name:'detail_'+i,label:'Detail '+(i+1),type:'textarea',required:false})):[{name:'grt',label:'Gross tonnage',type:'number',required:true},{name:'remarks',label:'Remarks',type:'textarea',required:false}]})}}]});
        send({},'tool_calls');
      } else { send({role:'assistant',content:hasToolAfterUser?'AUDIT_DETAILS_RECEIVED':'AUDIT_LOCAL_SUCCESS — synthetic response; no provider inference.'}); send({},'stop'); }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));controller.close();
    };
    if(scenario==='slow')timer=setTimeout(finish,45000);else finish();
    init?.signal?.addEventListener('abort',()=>{clearTimeout(timer);try{controller.error(init.signal.reason)}catch{}},{once:true});
  },cancel(){clearTimeout(timer)}});
  return new Response(stream,{headers:{'Content-Type':'text/event-stream'}});
};
