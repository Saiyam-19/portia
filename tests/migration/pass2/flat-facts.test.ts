import { expect, it } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import { createMigrationMainAgent } from '../../../src/lib/migration/domain-agent';
import { currentConversationFact } from '../../../src/lib/migration/conversation';
import { d11 } from '../pass1/golden';

const facts = [
  ['','request','supplied-quote'],['','gt','9000'],['','durationHours','25'],['','taxPercent','0'],['','otherAdjustments','false'],
  ['berth hire','charge','berth hire'],['berth hire','currency','USD'],['berth hire','rate','0.04'],['berth hire','basis','gt-period'],
  ['berth hire','periodHours','12'],['berth hire','rounding','started'],['berth hire','minimum','1100'],['berth hire','maximum','1800'],
  ['berth hire','minimumScope','call'],['berth hire','maximumScope','call'],
].map(([item,field,value])=>({subject:'Quote',item,field,value}));
it('accepts a flat list of D11 facts and exposes no model-owned state, evidence, units or expressions', async()=>{
  let wire:unknown;
  const model=new MockLanguageModelV4({doGenerate:async options=>{
    wire=options.tools?.find(t=>t.type==='function'&&t.name==='interpret_request');
    return {content:[{type:'tool-call',toolName:'interpret_request',toolCallId:'flat',input:JSON.stringify({facts})}],finishReason:{unified:'tool-calls',raw:undefined},usage:{inputTokens:{total:1,noCache:1,cacheRead:0,cacheWrite:0},outputTokens:{total:1,text:1,reasoning:0}},warnings:[]};
  }});
  const result=await createMigrationMainAgent({alias:'model-1',mainModel:model}).generate({messages:d11().messages});
  expect(result.text).toContain('USD 1,100.00');
  expect(result.text).toContain('billable periods 3');
  const schema=(wire as {inputSchema:{properties:Record<string,unknown>}}).inputSchema;
  expect(Object.keys(schema.properties)).toEqual(['facts']);
  expect(JSON.stringify(schema)).not.toMatch(/baseHash|inputId|revision|evidence|fromFactId|arithmeticExpression|"unit"/);
  expect(model.doGenerateCalls).toHaveLength(1);
});
it('code supplies omitted dimensions while retaining semantic validation',()=>{
  const d=d11();for(const op of d.p.operations)op.unit='';
  const state=d.apply().state;
  expect(currentConversationFact(state,'berth','rate')?.unit).toBe('money');
  expect(currentConversationFact(state,'call','gt')?.unit).toBe('GT');
});
it('code recognises the implicit one in per GT without fabricating a numeric assertion',()=>{
  const d=d11();d.op('berth','basisQuantity','1','','per GT for each started 12-hour block');
  expect(currentConversationFact(d.apply().state,'berth','basisQuantity')?.value).toBe('1');
});
it('maps a grounded currency unit to money but rejects a conflicting currency',()=>{
  const d=d11();d.p.operations.find(o=>o.field==='minimum')!.unit='USD';
  expect(currentConversationFact(d.apply().state,'berth','minimum')?.unit).toBe('money');
  d.p.operations.find(o=>o.field==='minimum')!.unit='INR';
  expect(currentConversationFact(d.apply().state,'berth','minimum')).toBeUndefined();
});
