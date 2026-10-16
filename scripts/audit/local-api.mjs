// Run only against the isolated memory lab, with provider.cjs substituting inference.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
const site = 'http://127.0.0.1:3022', backend = 'http://127.0.0.1:3220';
const output = process.env.PORTIA_AUDIT_OUTPUT_DIR||'.local/audit-20261014';
const lab = JSON.parse(await fs.readFile('.local/memory-chat-lab.json','utf8'));
assert.equal(lab.site, site);
assert.equal(lab.url, backend);
assert.equal(process.env.PORTIA_AUDIT_SYNTHETIC_PROVIDER, 'true', 'Set only after starting the local lab with the audited provider substitute.');
const results=[];
const password='Audit-local-20261014-only!';
const states = {};
async function test(name, fn) {
  try { const evidence=await fn();results.push({name,status:'PASS',evidence}); }
  catch(error) {results.push({name,status:'FAIL',error:String(error)});}
  await fs.writeFile(output+'/local-api.json',JSON.stringify(results,null,2));
}
async function request(path,{actor,body,method,origin=site,...rest}={}) {
  assert(path.startsWith('/'));
  return fetch(site+path,{method:method??(body===undefined?'GET':'POST'),headers:{Origin:origin,...(actor?{Cookie:actor.cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),...rest});
}
async function account(email) {
  let response=await request('/api/auth/sign-up/email',{body:{name:'Local Audit',email,password}});
  if(response.status===422)response=await request('/api/auth/sign-in/email',{body:{email,password}});
  assert.equal(response.status,200,await response.clone().text());
  const cookie=response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  const actor={cookie,email};
  const token=await (await request('/api/auth/convex/token',{actor})).json();
  const client=new ConvexHttpClient(backend);client.setAuth(token.token);
  actor.client=client;actor.token=token.token;
  actor.user=(await response.json()).user;
  return actor;
}
const body=(id,revision,question,alias='model-1')=>({kind:'question',requestId:randomUUID(),conversationId:id,expectedRevision:revision,question,modelAlias:alias});
const conversation=(actor,id)=>actor.client.query(anyApi.migration.getConversation,{conversationId:id});
async function complete(actor,payload){const response=await request('/api/chat',{actor,body:payload});const stream=await response.text();assert.equal(response.status,200,stream);return stream;}

await test('remaining public links and anchors resolve without invented legal pages',async()=>{
  const status={};
  const home=await(await request('/')).text();
  const links=[...home.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match=>match[1]);
  for(const href of links){
    assert(!['/terms','/privacy','/about','/blog','/contact','#pricing'].includes(href));
    if(href.startsWith('#'))assert(home.includes('id="'+href.slice(1)+'"'));
    else if(href.startsWith('/'))status[href]=(await request(href)).status;
  }
  for(const path of ['/','/login'])status[path]=(await request(path)).status;
  assert(Object.values(status).every(value=>value===200));
  assert.equal(status['/'],200);assert.equal(status['/login'],200);
  states.publicRoutes=status;
  return status;
});
await test('unauthenticated dashboard redirects to login',async()=>{const r=await request('/dashboard',{redirect:'manual'});assert([307,303].includes(r.status));assert(r.headers.get('location')?.includes('/login'));return r.status;});
await test('anonymous API and hostile origin rejected',async()=>{
  for(const [path,payload] of [['/api/chat',body(null,null,'hello')],['/api/chat/cancel',{runId:'bogus'}],['/api/memory',{kind:'clear',epoch:0,requestId:randomUUID()}]]){
    const foreign=await request(path,{body:payload,origin:'https://attacker.invalid'});assert.equal(foreign.status,403);
    const anonymous=await request(path,{body:payload});assert([401,409].includes(anonymous.status),await anonymous.text());
  }
});
await test('malformed chat payloads rejected before authentication/inference',async()=>{
  for(const patch of [{question:''},{question:'x'.repeat(4001)},{modelAlias:'invalid'},{messages:[]},{expectedRevision:-1},{ownerId:'victim'}])assert.equal((await request('/api/chat',{body:{...body(null,null,'hello'),...patch}})).status,400);
});
await test('two fresh local accounts with truthful verification state',async()=>{
  states.a=await account('audit-browser-20261014@example.com');
  states.b=await account('audit-other-20261014@example.com');
  assert.equal(states.a.user.emailVerified,false);assert.equal(states.b.user.emailVerified,false);
  return {accounts:2,emailVerified:false};
});
const a=states.a,b=states.b;
if(!a||!b)throw new Error('Account setup failed; see local-api.json');
await test('owner-isolated empty conversation and messages',async()=>{
  states.id=await a.client.mutation(anyApi.migration.createConversation,{});
  assert.equal(await conversation(b,states.id),null);
  const history=await b.client.query(anyApi.migration.listConversationMessages,{conversationId:states.id,paginationOpts:{cursor:null,numItems:10}});
  assert.equal(history.page.length,0);
  await assert.rejects(b.client.mutation(anyApi.migration.deleteConversation,{conversationId:states.id}));
});
await test('actual HTTP chat stream persists synthetic answer',async()=>{
  states.payload=body(states.id,0,'AUDIT_SUCCESS');
  const stream=await complete(a,states.payload);assert(stream.includes('AUDIT_LOCAL_SUCCESS'),stream);
  const state=await conversation(a,states.id);assert.equal(state.conversation.state,'idle');assert.equal(state.conversation.revision,2);
  const history=await a.client.query(anyApi.migration.listConversationMessages,{conversationId:states.id,paginationOpts:{cursor:null,numItems:20}});
  assert(history.page.some(row=>row.text.includes('AUDIT_LOCAL_SUCCESS')));
  return {stream:true,persistence:true};
});
await test('idempotent retry recovers existing run without inference replay',async()=>{
  const before=await fs.readFile(output+'/provider-events.jsonl','utf8');
  const response=await request('/api/chat',{actor:a,body:states.payload});assert.equal(response.status,409);
  assert((await response.text()).includes('open_saved_conversation'));
  assert.equal(await fs.readFile(output+'/provider-events.jsonl','utf8'),before);
});
await test('changed idempotency payload and stale revision rejected',async()=>{
  assert.equal((await request('/api/chat',{actor:a,body:{...states.payload,question:'Changed'}})).status,409);
  assert.equal((await request('/api/chat',{actor:a,body:body(states.id,0,'STALE')})).status,409);
});
await test('cross-owner question and memory reads denied',async()=>{
  assert([404,409].includes((await request('/api/chat',{actor:b,body:body(states.id,2,'Foreign')})).status));
  assert.equal((await request('/api/memory?conversationId='+states.id,{actor:b})).status,404);
});
await test('form wait and Model 2 persist',async()=>{
  states.formId=await a.client.mutation(anyApi.migration.createConversation,{});
  await complete(a,body(states.formId,0,'AUDIT_FORM','model-2'));
  states.formState=await conversation(a,states.formId);
  assert.equal(states.formState.conversation.state,'waiting');assert.equal(states.formState.conversation.modelAlias,'model-2');
  states.form=states.formState.forms.find(form=>form.status==='pending');assert(states.form);
});
const formBody=(extra={})=>({kind:'form',requestId:randomUUID(),conversationId:states.formId,expectedRevision:states.formState.conversation.revision,modelAlias:'model-2',toolCallId:states.form.toolCallId,values:{grt:'20000'},note:'Synthetic note retained',cancelled:false,...extra});
await test('invalid form values do not consume pending form',async()=>{
  for(const values of [{},{grt:'abc'},{grt:'Infinity'},{grt:'2',unrequested:'x'}])assert([400,409].includes((await request('/api/chat',{actor:a,body:formBody({values})})).status));
  assert.equal((await conversation(a,states.formId)).forms[0].status,'pending');
});
await test('valid form continuation persists exact values and note',async()=>{
  await complete(a,formBody());
  const state=await conversation(a,states.formId);assert.equal(state.conversation.state,'idle');
  assert.equal(state.forms[0].status,'submitted');assert.equal(state.forms[0].values.grt,'20000');assert.equal(state.forms[0].note,'Synthetic note retained');
});
await test('reconsuming a form does not infer twice',async()=>{
  assert.equal((await request('/api/chat',{actor:a,body:formBody()})).status,409);
});
await test('provider 503 releases active run and preserves readable error',async()=>{
  const id=await a.client.mutation(anyApi.migration.createConversation,{});
  const stream=await complete(a,body(id,0,'AUDIT_ERROR'));
  const state=await conversation(a,id);assert.equal(state.conversation.state,'error');assert(!state.conversation.activeRunId);
  assert(stream.includes('temporarily busy'));return {state:'error',activeRun:false};
});
await test('durable cancellation across independent request stops active run',async()=>{
  const id=await a.client.mutation(anyApi.migration.createConversation,{});
  const pending=request('/api/chat',{actor:a,body:body(id,0,'AUDIT_SLOW')}).then(async r=>({status:r.status,text:await r.text()}));
  let state;
  for(let i=0;i<50;i++){state=await conversation(a,id);if(state?.conversation.activeRunId)break;await new Promise(resolve=>setTimeout(resolve,50));}
  assert(state?.conversation.activeRunId);
  const response=await request('/api/chat/cancel',{actor:a,body:{runId:state.conversation.activeRunId}});assert.equal(response.status,200);
  await pending;
  const stopped=await conversation(a,id);assert.equal(stopped.conversation.state,'stopped');assert(!stopped.conversation.activeRunId);
  return {state:'stopped'};
});
await test('real memory tools publish facts and notes; explicit forget is idempotent',async()=>{
  const id=await a.client.mutation(anyApi.migration.createConversation,{});
  await complete(a,body(id,0,'AUDIT_REMEMBER'));
  const endpoint='/api/memory?conversationId='+id;
  const response=await request(endpoint,{actor:a});assert.equal(response.status,200);
  const view=await response.json();assert(view.facts.some(f=>f.key==='audit_fact'&&f.value==='SYNTHETIC-20261014'));assert.equal(view.scratchpad,'SYNTHETIC WORKING NOTE');
  const del={kind:'forget',key:'audit_fact',epoch:view.epoch,requestId:randomUUID()};
  const cleared=await request(endpoint,{actor:a,body:del});assert.equal(cleared.status,200);
  const current=await cleared.json();assert.equal(current.facts.length,0);assert.equal(current.scratchpad,'');
  assert.equal((await request(endpoint,{actor:a,body:del})).status,200);
});
await test('4000-character Unicode question stays out of navigation URL and persists once',async()=>{
  const statuses=[];
  for(const length of [4000]){
    const initialIntent={requestId:randomUUID(),question:'航'.repeat(length),modelAlias:'model-2'};
    const id=await a.client.mutation(anyApi.migration.createConversation,{initialIntent});
    assert.equal(await a.client.mutation(anyApi.migration.createConversation,{initialIntent}),id);
    const path='/dashboard/chat/'+id;
    const response=await request(path,{actor:a,redirect:'manual'});
    statuses.push({characters:length,urlBytes:path.length,status:response.status});
    assert(path.length<100);assert.equal((await conversation(a,id)).conversation.initialIntent.question,initialIntent.question);
    await complete(a,{...body(id,0,initialIntent.question,initialIntent.modelAlias),requestId:initialIntent.requestId});
    assert.equal((await conversation(a,id)).conversation.initialIntent,undefined);
  }
  states.unicode=statuses;
  assert(statuses.every(s=>s.status===200),JSON.stringify(statuses));
  return statuses;
});
await test('live session revocation invalidates retained JWT reads',async()=>{
  const response=await request('/api/auth/sign-out',{actor:b,body:{}});assert.equal(response.status,200);
  const rows=await b.client.query(anyApi.migration.listConversations,{paginationOpts:{cursor:null,numItems:20}});assert.equal(rows.page.length,0);
  await assert.rejects(b.client.mutation(anyApi.migration.createConversation,{}));
});
await fs.writeFile(output+'/browser-fixtures.json',JSON.stringify({site,email:a.email,password,chatId:states.id,formId:states.formId},null,2),{mode:0o600});
console.log(JSON.stringify({total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL')}));
process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
