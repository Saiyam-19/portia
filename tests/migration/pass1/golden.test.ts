import { afterAll, expect, it } from 'vitest';
import { mkdirSync,writeFileSync } from 'node:fs';
import { planConversationAnswer,renderConversationAnswer } from '../../../src/lib/migration/conversation-rules';
import { d02,d11,d19,d19Correction,d24,original19,mumbai } from './golden';
const binding={runId:'offline-golden-pass1',fence:1,revision:1};
const results:unknown[]=[];
afterAll(()=>{mkdirSync('output/pass1',{recursive:true});writeFileSync(`output/pass1/${process.env.PASS1_GOLDEN_LABEL??'golden'}-results.json`,JSON.stringify(results,null,2)+'\n');});
async function run(id:string,d:ReturnType<typeof d11>){const reduced=d.apply();const answer=await planConversationAnswer(reduced.state,binding);results.push({id,answer,text:renderConversationAnswer(answer),invalidFacts:reduced.state.facts.filter(f=>f.status==='conflicting')});return {state:reduced.state,answer,text:renderConversationAnswer(answer)};}
it('D02: elapsed 30.5 h; time-only six-hour quote is a missing implementation, oracle INR 24000',async()=>{
 const r=await run('D02',d02());expect(r.text).toContain('30.5 hours');expect(r.answer.complete).toBe(false);expect(r.answer.items.find(i=>i.kind==='quote')?.pending.join(' ')).toMatch(/basis|rate units/);expect(r.text).not.toContain('INR 4,000.00');
});
it('D11: three periods, 1080 before per-call bounds, payable 1100',async()=>{const r=await run('D11',d11());expect(r.answer.complete).toBe(true);expect(r.text).toContain('billable periods 3');expect(r.text).toContain('USD 1,100.00');});
it('D19: preserve lines and correct only water: 1280 then 1295',async()=>{const d=d19();const a=await run('D19-1',d);expect(a.answer.complete).toBe(true);expect(a.text).toContain('USD 1,280.00');const b=await run('D19-2',d19Correction(a.state,d.messages));expect(b.answer.complete).toBe(true);expect(b.text).toContain('USD 1,295.00');expect(b.text).toContain('USD 825.00');expect(b.text).toContain('USD 390.00');});
it('D24: compare supplied totals, A 113220 B 114500 difference 1280',async()=>{const r=await run('D24',d24());expect(r.answer.complete).toBe(true);expect(r.text).toContain('INR 113,220.00');expect(r.text).toContain('INR 114,500.00');expect(r.text).toContain('INR 1,280.00');});
it('original-19: 24, 25, 48 billed hours produce 60000, 62500, 120000',async()=>{const r=await run('original-19',original19());expect(r.answer.complete).toBe(true);for(const amount of ['60,000.00','62,500.00','120,000.00'])expect(r.text).toContain('INR '+amount);});
it.each(['MJ1','MJ2'] as const)('%s: official Mumbai dues/movement branches remain absent; not an accepted quote',async id=>{const r=await run(id,mumbai(id));expect(r.answer.complete).toBe(false);expect(r.answer.items[0].totals).toBeUndefined();expect(r.text).not.toMatch(/what.*(?:rate|tariff)/i);});
