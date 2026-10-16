import { expect,it } from 'vitest';
import { conversationInputs,emptyConversation,reduceInterpretation } from '../../../src/lib/migration/conversation';
import { planConversationAnswer,renderConversationAnswer } from '../../../src/lib/migration/conversation-rules';
import { mumbaiProposal,mumbaiQuestion } from '../conversation-fixtures';
import { d11,draft,mumbai } from './golden';
const binding={runId:'offline-authority',fence:1,revision:1};
it('uses reviewed Mumbai rules before an official-rate/basis question',async()=>{
 const p=mumbaiProposal();p.unresolved=[{scopeId:'call',question:'What is the official berth hire rate and tariff basis?',evidence:p.tasks[0].evidence,taskIds:['berth']}];
 const inputs=conversationInputs([{role:'user',content:mumbaiQuestion}]);const answer=await planConversationAnswer(reduceInterpretation(emptyConversation(),p,inputs).state,binding);
 expect(answer.complete).toBe(true);expect(renderConversationAnswer(answer)).toContain('INR 51,094.00');expect(renderConversationAnswer(answer)).not.toContain(p.unresolved[0].question);
});
it.each(['Are favourable tide and weather conditions confirmed?','Does the priority rate apply?'])('preserves unresolved applicability: %s',question=>{
 const p=mumbaiProposal();p.unresolved=[{scopeId:'call',question,evidence:p.tasks[0].evidence,taskIds:['berth']}];
 const inputs=conversationInputs([{role:'user',content:mumbaiQuestion}]);return expect(planConversationAnswer(reduceInterpretation(emptyConversation(),p,inputs).state,binding)).resolves.toMatchObject({complete:false});
});
it('distinguishes Mumbai missing executable rules from absent authority',async()=>{
 const answer=await planConversationAnswer(mumbai('MJ1').apply().state,binding);expect(renderConversationAnswer(answer)).toMatch(/missing implementation/i);expect(renderConversationAnswer(answer)).not.toMatch(/what.*rate/i);
});
it('reports empty BPCL source as a code-owned authority gap, never asks for a rate',async()=>{
 const text='Official berth hire at BPCL Cargo Jetty';const d=draft(text);d.scope('call','Call',text);d.op('call','port','bpcl-cargo-jetty','','BPCL Cargo Jetty');d.p.tasks=[{id:'quote',scopeId:'call',kind:'quote',source:'official',charges:['berth'],ruleScopeIds:[],evidence:d.e(text)}];d.p.unresolved=[{scopeId:'call',question:'What is the official tariff rate?',evidence:d.e(text),taskIds:['quote']}];
 const answer=await planConversationAnswer(d.apply().state,binding);expect(renderConversationAnswer(answer)).toMatch(/missing tariff authority/i);expect(renderConversationAnswer(answer)).not.toContain('What is the official tariff rate?');expect(answer.complete).toBe(false);
});
it('keeps supplied-quotation unresolved handling unchanged',async()=>{
 const d=d11();d.p.unresolved=[{scopeId:'call',question:'Confirm this supplied minimum term',evidence:d.p.tasks[0].evidence,taskIds:['quote']}];const answer=await planConversationAnswer(d.apply().state,binding);expect(answer.complete).toBe(false);expect(renderConversationAnswer(answer)).toContain('Confirm this supplied minimum term');
});
