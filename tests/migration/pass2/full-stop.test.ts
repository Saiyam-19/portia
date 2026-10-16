import { expect, it } from 'vitest';
import { currentConversationFact } from '../../../src/lib/migration/conversation';
import { draft } from '../pass1/golden';

it.each([['80','USD 80.'],['84.65','USD 84.65.'],['1275.35','USD 1,275.35.']])('grounds rate %s before a sentence full stop', (value, text) => {
  const d=draft(text); d.scope('call','Quote',text);
  d.p.tasks=[{id:'facts',scopeId:'call',kind:'facts',source:'none',charges:[],ruleScopeIds:[],evidence:d.e(text)}];
  d.op('call','rate',value,'money',text);
  expect(currentConversationFact(d.apply().state,'call','rate')?.value).toBe(value);
});
it('grounds the D24 fixed FX rate before a sentence full stop', () => {
  const text='my fixed USD/INR rate of 83.25.'; const d=draft(text); d.scope('call','Comparison',text);
  d.p.tasks=[{id:'facts',scopeId:'call',kind:'facts',source:'none',charges:[],ruleScopeIds:[],evidence:d.e(text)}];
  d.op('call','fxRate','83.25','ratio',text);
  expect(currentConversationFact(d.apply().state,'call','fxRate')?.value).toBe('83.25');
});
it.each(['USD 800.','USD 80.5.','USD 80.5.7','USD 80abc.'])('does not authorize 80 from a different or malformed number: %s', text => {
  const d=draft(text);d.scope('call','Quote',text);
  d.p.tasks=[{id:'facts',scopeId:'call',kind:'facts',source:'none',charges:[],ruleScopeIds:[],evidence:d.e(text)}];
  d.op('call','rate','80','money',text);
  expect(currentConversationFact(d.apply().state,'call','rate')).toBeUndefined();
});
