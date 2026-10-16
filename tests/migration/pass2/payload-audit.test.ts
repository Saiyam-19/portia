import {expect,it} from 'vitest';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createOpenRouter} from '@openrouter/ai-sdk-provider';
import type {ModelMessage} from 'ai';
import {createMigrationMainAgent} from '../../../src/lib/migration/domain-agent';
import {ConversationSession} from '../../../src/lib/migration/conversation-session';
import {quoteFacts,rows,texts} from './fixtures';

it('audits actual serialized outgoing bodies using a fake transport and synthetic credential only',async()=>{
  const payloads:unknown[]=[];
  const capturedInputs=new Set(Object.values(texts).slice(0,5).flat());
  for(const id of ['D11','D19','D24','original-19','D02'] as const){
    const messages:ModelMessage[]=[];
    for(const [turn,input]of texts[id].entries()){
      messages.push({role:'user',content:input});const proposal=turn?{facts:rows('Quote','water supply',{rate:'80'})}:quoteFacts(id);
      const provider=createOpenRouter({apiKey:'synthetic-payload-audit',compatibility:'strict',fetch:async(url,init)=>{
        expect(String(url)).toBe('https://openrouter.ai/api/v1/chat/completions');
        const body=JSON.parse(String(init?.body));
        for(const message of body.messages.filter((m:{role:string})=>m.role==='user'))expect(capturedInputs.has(typeof message.content==='string'?message.content:message.content.map((p:{text:string})=>p.text).join(''))).toBe(true);
        const raw=JSON.stringify(body);expect(raw).not.toMatch(/OPENROUTER_API_KEY|\/Users\/|backend\/\.env|HISTORICAL_MEMORY/);
        payloads.push({case:id,turn:turn+1,bytes:Buffer.byteLength(raw),sha256:createHash('sha256').update(raw).digest('hex'),body});
        const first={id:'fake',model:'openai/gpt-6.1-sol',created:0,choices:[{index:0,delta:{tool_calls:[{index:0,id:`fake-${turn}`,type:'function',function:{name:'interpret_request',arguments:JSON.stringify(proposal)}}]},finish_reason:null}]};
        const end={id:'fake',model:'openai/gpt-6.1-sol',created:0,choices:[{index:0,delta:{},finish_reason:'tool_calls'}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2,cost:0}};
        return new Response(`data: ${JSON.stringify(first)}\n\ndata: ${JSON.stringify(end)}\n\ndata: [DONE]\n\n`,{headers:{'content-type':'text/event-stream'}});
      }});
      const model=provider.chat('openai/gpt-6.1-sol',{reasoning:{enabled:true,effort:'medium'},provider:{allow_fallbacks:false,require_parameters:true,data_collection:'allow',zdr:false,only:['openai'],max_price:{prompt:2,completion:10,request:0}}});
      const session=new ConversationSession({runId:`payload-${id}-${turn}`,fence:1,revision:turn+1});
      const result=await createMigrationMainAgent({alias:'model-1',mainModel:model,conversation:session}).stream({messages});
      for await(const part of result.stream)if(part.type==='error')throw part.error;
      messages.push(...await result.responseMessages);expect(session.answer?.complete).toBe(true);
    }
  }
  const output=process.env.PASS3_EVIDENCE_DIR??'output/pass2';
  fs.mkdirSync(output,{recursive:true});fs.writeFileSync(output+'/payload-audit.json',JSON.stringify({networkCalls:0,credential:'synthetic only; no env read',destination:'https://openrouter.ai/api/v1/chat/completions',scope:'five user-supplied fictional quote cases and D19 correction; code interpretation instructions and synthetic saved facts; no memory, lookup, workspace files or private configuration',payloads},null,2));
  expect(payloads).toHaveLength(6);
});
