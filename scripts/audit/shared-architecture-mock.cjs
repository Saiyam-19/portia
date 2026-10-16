/* eslint-disable @typescript-eslint/no-require-imports -- synthetic local acceptance only. */
const fs = require('node:fs');
const original = globalThis.fetch;
globalThis.fetch = async function(input, init) {
  const url = new URL(typeof input === 'string' ? input : input.url || String(input));
  if (url.hostname !== 'openrouter.ai') return original(input, init);
  if (process.env.PORTIA_LOCAL_BACKEND !== 'true' || process.env.PORTIA_CONVEX_DEPLOYMENT !== 'local-memory-integration') throw new Error('Synthetic interpretation requires isolated local backend');
  const request = JSON.parse(init?.body || '{}');
  if (url.pathname !== '/api/v1/chat/completions' || request.model !== 'nvidia/nemotron-3-super-120b-a12b:free' || request.provider?.allow_fallbacks !== false || ['prompt','completion','request'].some(k => request.provider?.max_price?.[k] !== 0)) throw new Error('Synthetic price/model guard');
  const system = request.messages.filter(m => m.role === 'system' || m.role === 'developer').map(m => typeof m.content === 'string' ? m.content : m.content.map(p => p.text ?? '').join('\n')).join('\n');
  fs.appendFileSync(process.env.PORTIA_SHARED_MOCK_LOG, JSON.stringify({ at: new Date().toISOString(), event: 'mock-input-check', currentFound: system.includes('CURRENT_CONVERSATION='), pendingFound: system.includes('AUTHENTICATED_PENDING_INPUTS='), tools: request.tools?.map(t => t.function?.name), upstreamDispatches: 0 }) + '\n');
  const current = JSON.parse(system.split('CURRENT_CONVERSATION=')[1].split('\n')[0]);
  const pending = JSON.parse(system.split('AUTHENTICATED_PENDING_INPUTS=')[1].split('\n')[0]);
  const fixture = JSON.parse(fs.readFileSync(process.env.PORTIA_SHARED_MOCK_FIXTURE, 'utf8'));
  const chunk = (delta, finish_reason = null) => 'data: ' + JSON.stringify({ id: 'synthetic-interpretation', object: 'chat.completion.chunk', created: 1, model: request.model, choices: [{ index: 0, delta, finish_reason }] }) + '\n\n';
  const respond=(name,args,id)=>new Response(chunk({role:'assistant',tool_calls:[{index:0,id,type:'function',function:{name,arguments:JSON.stringify(args)}}]})+chunk({},'tool_calls')+'data: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
  if(!pending.length&&fixture.mixed&&current.revision===3){
    const receipts=JSON.parse(system.split('CURRENT_AUXILIARY_RECEIPTS=')[1].split('\n')[0]);
    if(!receipts.some(r=>r.tool==='remember_memory'))return respond('remember_memory',{key:'preferred_units',value:'metric'},'synthetic-remember-3');
    return respond('complete_auxiliary',{outcomes:[{taskId:'remember_units',status:'completed',text:'Saved preferred units as metric.',receiptIds:['synthetic-remember-3']}]},'synthetic-complete-3');
  }
  if (pending.length !== 1) throw new Error('Synthetic fixture requires exactly one pending input');
  let proposal;
  if (pending[0].text === fixture.question && current.revision === 0) proposal = JSON.parse(JSON.stringify(fixture.proposal).replaceAll(fixture.proposal.inputIds[0], pending[0].id));
  else if (fixture.followup && pending[0].text === fixture.followup.question && current.revision === 1) proposal = {
    version: 1, baseHash: current.hash, scopes: [], inputIds: [pending[0].id], tasks: current.tasks, unresolved: [],
    operations: [{ scopeId: current.tasks[0].scopeId, field: 'gt', operation: 'correct', value: fixture.followup.value, unit: 'GT', evidence: { inputId: pending[0].id, quote: pending[0].text } }],
  };
  else if(fixture.mixed&&pending[0].text===fixture.mixed.question&&current.revision===2)proposal={version:1,baseHash:current.hash,scopes:[],inputIds:[pending[0].id],operations:[],unresolved:[],tasks:[...current.tasks,{id:'remember_units',scopeId:current.tasks[0].scopeId,kind:'other',auxiliaryAction:'remember',source:'none',charges:[],ruleScopeIds:[],evidence:{inputId:pending[0].id,quote:pending[0].text}}]};
  else throw new Error('Synthetic fixture is not applicable; no upstream dispatch is permitted');
  proposal.baseHash = current.hash;
  fs.appendFileSync(process.env.PORTIA_SHARED_MOCK_LOG, JSON.stringify({ at: new Date().toISOString(), boundary: 'mocked-provider', tool: 'interpret_request', upstreamDispatches: 0 }) + '\n');
  return new Response(chunk({ role: 'assistant', tool_calls: [{ index: 0, id: 'synthetic-interpretation-' + current.revision, type: 'function', function: { name: 'interpret_request', arguments: JSON.stringify(proposal) } }] }) + chunk({}, 'tool_calls') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
};
