import { expect,it } from 'vitest';
import type { ModelMessage } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { createMigrationMainAgent } from '../../../src/lib/migration/domain-agent';
import { ConversationSession } from '../../../src/lib/migration/conversation-session';
import { emptyConversation,reduceInterpretation,type Interpretation } from '../../../src/lib/migration/conversation';
import { d19,d19Correction } from './golden';
const usage={inputTokens:{total:1,noCache:1,cacheRead:0,cacheWrite:0},outputTokens:{total:1,text:1,reasoning:0}};
function followup(){
 const first=d19(),accepted=first.apply();
 const history:ModelMessage[]=[...first.messages,{role:'tool',content:[{type:'tool-result',toolName:'interpret_request',toolCallId:'initial',output:{type:'json',value:JSON.parse(JSON.stringify(accepted.receipt))}}]}];
 const d=d19Correction(accepted.state,history);return {first,accepted,d};
}
async function run(change:(p:Interpretation,f:ReturnType<typeof followup>)=>void,advance=false){
 const f=followup();const p=structuredClone(f.d.p);change(p,f);
 const session=new ConversationSession({runId:'dispatch-test',fence:1,revision:1});let wireSchema:unknown;
 const model=new MockLanguageModelV4({doGenerate:async options=>{
   wireSchema=options.tools?.find(t=>t.type==='function'&&t.name==='interpret_request');
   if(advance)session.state=reduceInterpretation(session.state,f.d.p,session.inputs).state;
   return {content:[{type:'tool-call',toolName:'interpret_request',toolCallId:'correction',input:JSON.stringify(p)}],finishReason:{unified:'tool-calls',raw:undefined},usage,warnings:[]};
 }});
 const result=await createMigrationMainAgent({ interpretationFormat: "legacy",alias:'model-1',mainModel:model,conversation:session}).generate({messages:f.d.messages});return {text:result.text,session,wireSchema,calls:model.doGenerateCalls.length};
}
it('binds correction to dispatch state despite echoed old hash/input IDs and unchanged scope references',async()=>{
 const r=await run((p,f)=>{p.baseHash=emptyConversation().hash;p.inputIds=f.first.p.inputIds;p.scopes=f.first.p.scopes;});
 expect(r.text).toContain('USD 1,295.00');expect(r.text).toContain('USD 825.00');expect(r.calls).toBe(1);
});
it('provider contract does not require code-owned baseHash/inputIds',async()=>{
 const r=await run(()=>{});const schema=r.wireSchema as {inputSchema:{properties:Record<string,unknown>}};expect(schema.inputSchema.properties).not.toHaveProperty('baseHash');expect(schema.inputSchema.properties).not.toHaveProperty('inputIds');
});
it('permits references to earlier evidence without reasserting it',async()=>{
 const r=await run((p,f)=>{p.operations.unshift({...f.first.p.operations.find(o=>o.scopeId==='water'&&o.field==='rate')!,operation:'reference'});});
 expect(r.text).toContain('USD 1,295.00');
});
it('rejects a stale dispatch after state advanced before commit',async()=>{
 const r=await run(()=>{},true);expect(r.text).toMatch(/stale/i);expect(r.text).not.toContain('USD 1,295.00');expect(r.session.published).toBe(false);
});
it('assert/correct cannot reuse consumed evidence, even with fresh code-owned metadata',async()=>{
 const r=await run((p,f)=>{p.operations.push({...f.first.p.operations.find(o=>o.scopeId==='water'&&o.field==='rate')!,operation:'assert'});});expect(r.text).toMatch(/evidence/i);expect(r.text).not.toContain('USD 1,295.00');expect(r.session.published).toBe(false);
});
it('an echoed historical scope cannot change its identity',async()=>{
 const r=await run((p,f)=>{p.scopes=[{...f.first.p.scopes[0],label:'Different vessel'}];});expect(r.session.published).toBe(false);expect(r.text).not.toContain('USD 1,295.00');
});
