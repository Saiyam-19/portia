import { expect, it } from 'vitest';
import { currentConversationFact } from '../../../src/lib/migration/conversation';
import { draft } from './golden';
import { calculateElapsedTime } from '../../../src/lib/migration/elapsed-time';

it.each(['India time','India Standard Time','Indian Standard Time'])('honors the explicit %s zone without guessing a locale',timeZone=>{
  expect(calculateElapsedTime({start:'18 October 2026 at 22:45',end:'20 October 2026 at 05:15',timeZone})).toMatchObject({status:'ok',elapsedHours:'30.5'});
});

it.each(['alongside', 'berthed'])('retains both endpoints of an explicit %s from/to interval', word => {
  const d=draft(`The vessel was ${word} from 18 October 2026 at 22:45 to 20 October 2026 at 05:15, India time.`);
  d.scope('call','Vessel',d.inputs[0].text);
  d.p.tasks=[{id:'facts',scopeId:'call',kind:'facts',source:'none',charges:[],ruleScopeIds:[],evidence:d.e(d.inputs[0].text)}];
  d.op('call','berthStart','18 October 2026 at 22:45','timestamp',`${word} from 18 October 2026 at 22:45`);
  d.op('call','berthEnd','20 October 2026 at 05:15','timestamp','to 20 October 2026 at 05:15');
  const state=d.apply().state;
  expect(currentConversationFact(state,'call','berthStart')?.value).toBe('18 October 2026 at 22:45');
  expect(currentConversationFact(state,'call','berthEnd')?.value).toBe('20 October 2026 at 05:15');
});

it.each(['at anchorage','not alongside','possibly alongside'])('does not authorize berth endpoints from %s',word=>{
  const d=draft(`The vessel was ${word} from 18 October 2026 at 22:45 to 20 October 2026 at 05:15, India time.`);
  d.scope('call','Vessel',d.inputs[0].text);
  d.p.tasks=[{id:'facts',scopeId:'call',kind:'facts',source:'none',charges:[],ruleScopeIds:[],evidence:d.e(d.inputs[0].text)}];
  d.op('call','berthEnd','20 October 2026 at 05:15','timestamp','to 20 October 2026 at 05:15');
  expect(currentConversationFact(d.apply().state,'call','berthEnd')).toBeUndefined();
});
