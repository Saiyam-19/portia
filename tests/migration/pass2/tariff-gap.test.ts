import { expect,it } from 'vitest';
import { draft,mumbai } from '../pass1/golden';
import { planConversationAnswer,renderConversationAnswer } from '../../../src/lib/migration/conversation-rules';
import { ConversationSession } from '../../../src/lib/migration/conversation-session';
import { rows } from './fixtures';
const binding={runId:'tariff-gap',fence:1,revision:1};
it.each([['BPCL Cargo Jetty','bpcl-cargo-jetty'],['Imaginary Harbour','Imaginary Harbour']])('gives the code-owned no-tariff answer for %s',async(name,port)=>{
  const text=`Official berth hire at ${name}`;const d=draft(text);d.scope('call','Call',text);d.op('call','port',port,'',name);
  d.p.tasks=[{id:'quote',scopeId:'call',kind:'quote',source:'official',charges:['berth'],ruleScopeIds:[],evidence:d.e(text)}];
  d.p.unresolved=[{scopeId:'call',question:'Please provide the official berth rate',evidence:d.e(text),taskIds:['quote']}];
  const a=await planConversationAnswer(d.apply().state,binding);const result=renderConversationAnswer(a);
  expect(result).toContain('no verified tariff yet');expect(result).not.toMatch(/provide.*rate|what.*rate/i);expect(a.complete).toBe(false);expect(a.questions).toEqual([]);
});
it('flat official intent reaches the authority gate without inventing a supplied price',async()=>{
  const s=new ConversationSession(binding);s.initialize([{role:'user',content:'Official berth hire at BPCL Cargo Jetty'}]);
  s.interpretFacts({facts:rows('Quote','',{request:'official-quote',port:'bpcl-cargo-jetty',charge:'berth'})},s.captureInterpretationDispatch());
  await s.prepare();expect(s.text()).toContain('no verified tariff yet');expect(s.clarificationForm()).toBeUndefined();
});
it('retains missing implementation classification when source authority exists',async()=>{
  const a=await planConversationAnswer(mumbai('MJ1').apply().state,binding);expect(renderConversationAnswer(a)).toMatch(/missing implementation/i);
});
