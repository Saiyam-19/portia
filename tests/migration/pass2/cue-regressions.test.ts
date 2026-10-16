import {expect,it} from 'vitest';
import {ConversationSession} from '../../../src/lib/migration/conversation-session';
import {rows,texts} from './fixtures';
import type {FlatInterpretation} from '../../../src/lib/migration/flat-interpretation';
async function run(text:string,facts:FlatInterpretation['facts']){
  const s=new ConversationSession({runId:'flat-cues',fence:1,revision:1});s.initialize([{role:'user',content:text}]);s.interpretFacts({facts},s.captureInterpretationDispatch());await s.prepare();return s;
}
it('R1 flat front door rejects a negated DWT even when the number appears',async()=>{
  await expect(run('GT 20000, not DWT 30000',rows('Call','',{request:'facts',dwt:'30000'}))).rejects.toThrow(/ground/);
});
it('R1 flat front door never chooses either/or timestamps',async()=>{
  await expect(run('Berthed either 18 October 2026 at 22:45 or 19 October 2026 at 22:45',rows('Call','',{request:'elapsed',berthStart:'18 October 2026 at 22:45'}))).rejects.toThrow(/ground/);
});
it('R1 flat front door rejects metre/hour as GT/hour',async()=>{
  await expect(run('Berth USD 2/metre/hour, LOA 100 m, 10 hours',[...rows('Call','',{request:'supplied-quote',loa:'100',durationHours:'10'}),...rows('Call','Berth',{charge:'Berth',currency:'USD',rate:'2',basis:'gt-period',periodHours:'1',rounding:'exact'})])).rejects.toThrow(/ground/);
});
it.each(['minimumScope','maximumScope'])('D11 flat front door rejects contradictory %s=block',async field=>{
  const facts=[...rows('Call','',{request:'supplied-quote',gt:'9000',durationHours:'25',taxPercent:'0',otherAdjustments:'no'}),...rows('Call','berth hire',{charge:'berth hire',currency:'USD',rate:'0.04',basis:'gt-period',periodHours:'12',rounding:'started',minimum:'1100',maximum:'1800',minimumScope:'call',maximumScope:'call',[field]:'block'})];
  const s=await run(texts.D11[0],facts);expect(s.answer?.complete).toBe(false);expect(s.text()).not.toContain('USD 1,800.00');
});
