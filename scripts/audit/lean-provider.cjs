/* eslint-disable @typescript-eslint/no-require-imports -- Offline Node preload. */
// Deterministic development fixture, never live-model evidence. All external
// transport is denied even if another caller bypasses the provider substitute.
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const connect = net.Socket.prototype.connect;
const local = host => ['localhost','127.0.0.1','::1','[::1]'].includes(host);
net.Socket.prototype.connect = function (...args) {
  const options = net._normalizeArgs(args)[0];
  if (!options.path && !local(options.host || 'localhost')) throw Error('OFFLINE_EXTERNAL_NETWORK_BLOCKED');
  return connect.apply(this,args);
};
globalThis.__portiaOfflineNetwork = true;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input,init) => {
  const url = new URL(typeof input==='string'?input:input.url||String(input));
  if (local(url.hostname)) return originalFetch(input,init);
  if (url.hostname !== 'openrouter.ai' || !url.pathname.endsWith('/chat/completions')) throw Error('OFFLINE_EXTERNAL_NETWORK_BLOCKED');
  const request=JSON.parse(init?.body||'{}'), messages=request.messages||[];
  const user=[...messages].reverse().find(message=>message.role==='user');
  const text=typeof user?.content==='string'?user.content:JSON.stringify(user?.content||'');
  const toolCount=messages.slice(messages.lastIndexOf(user)+1).filter(message=>message.role==='tool').length;
  const completedTool=toolCount>0;
  const instructions=messages.filter(message=>message.role==='system').map(message=>typeof message.content==='string'?message.content:(message.content||[]).map(part=>part.text||'').join('\n')).join('\n');
  const match=instructions.match(/SAVED_QUOTES=(.+)\n/);
  const state=match?JSON.parse(match[1]):{quotes:[],drafts:[]};
  const quotes=[...state.quotes,...state.drafts.map(item=>item.quote)];
  const dir=process.env.PORTIA_AUDIT_OUTPUT_DIR;
  if(dir){fs.mkdirSync(dir,{recursive:true});fs.appendFileSync(path.join(dir,'offline-fixture-context.jsonl'),JSON.stringify({scenario:text.match(/\[fixture:[a-z]+\]/)?.[0],systemRoles:messages.filter(message=>message.role==='system').map(message=>typeof message.content),matched:!!match,quoteNames:quotes.map(quote=>quote.name)})+'\n');}
  const pick=name=>quotes.find(quote=>quote.name===name);
  const comparison=()=>({selections:['Alpha','Beta'].map(label=>{const quote=pick(label);if(!quote)throw Error('Fixture quotation missing');return {quoteId:quote.id,revision:quote.revision,lineIds:quote.lines.filter(line=>line.name!=='Excluded charge').map(line=>line.id)};}),currency:'USD',exchangeRates:[{from:'EUR',fromAmount:'1',to:'USD',toAmount:'2'}]});
  let name='finish_turn',args={response:'Offline fixture finished its scripted operation.'};
  if(!completedTool && text.includes('[fixture:create]')) {
    name='supplied_quote';args={action:'create',name:'Alpha',call:{supplier:'Agency Alpha',operator:'Terminal Alpha',reference:'AL-1'},lines:[
      {name:'Transfer',currency:'USD',coverage:['transfer'],billing:{kind:'tonne-movement',quantity:'12',movements:'3'}},
      {name:'Documentation',currency:'USD',coverage:['documentation'],billing:{kind:'flat',price:'10',basis:'user-stated-flat'}},
      {name:'Excluded charge',currency:'USD',billing:{kind:'flat',price:'900',basis:'user-stated-flat'}},
    ]};
  } else if(!completedTool && text.includes('[fixture:correct]')) {
    const quote=pick('Alpha');if(!quote)throw Error('Fixture Alpha missing');
    name='supplied_quote';args={action:'update',quoteId:quote.id,lines:[{lineId:quote.lines[0].id,name:'Transfer',price:'3'}]};
  } else if(!completedTool && text.includes('[fixture:beta]')) {
    name='supplied_quote';args={action:'create',name:'Beta',call:{supplier:'Agency Beta',operator:'Terminal Beta'},lines:[
      {name:'Transfer',currency:'EUR',coverage:['transfer'],billing:{kind:'flat',price:'40',basis:'user-stated-flat'}},
      {name:'Documentation',currency:'EUR',coverage:['documentation'],billing:{kind:'flat',price:'10',basis:'user-stated-flat'}},
      {name:'Excluded charge',currency:'EUR',billing:{kind:'flat',price:'1000',basis:'user-stated-flat'}},
    ]};
  } else if(!completedTool && text.includes('[fixture:compare]')) {
    name='compare_quotes';args=comparison();
  } else if(text.includes('[fixture:stale]') && toolCount<2) {
    if(toolCount===0){name='compare_quotes';args=comparison();}
    else {const quote=pick('Alpha');if(!quote)throw Error('Fixture Alpha missing');name='supplied_quote';args={action:'update',quoteId:quote.id,lines:[{lineId:quote.lines[0].id,name:'Transfer',price:'4'}]};}
  } else if(!completedTool && text.includes('[fixture:read]')) { name='read_quotes';args={readScope:'current-chat'}; }
  if(dir){fs.mkdirSync(dir,{recursive:true});fs.appendFileSync(path.join(dir,'offline-provider-events.jsonl'),JSON.stringify({fixture:true,tool:name,externalRequests:0})+'\n');}
  const chunk={id:'offline-fixture',object:'chat.completion.chunk',created:1,model:request.model,choices:[{index:0,delta:{role:'assistant',tool_calls:[{index:0,id:'fixture-'+require('node:crypto').randomUUID(),type:'function',function:{name,arguments:JSON.stringify(args)}}]},finish_reason:null}]};
  const end={...chunk,choices:[{index:0,delta:{},finish_reason:'tool_calls'}]};
  return new Response('data: '+JSON.stringify(chunk)+'\n\ndata: '+JSON.stringify(end)+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
};
