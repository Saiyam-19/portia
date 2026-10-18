import { expect,it } from 'vitest';
import { currentConversationFact } from '../../../src/lib/migration/conversation';
import { d19,d19Correction } from '../pass1/golden';
it('legacy preserve cannot poison established rates by citing the current keep clause',()=>{
  const first=d19(),prior=first.apply().state,correction=d19Correction(prior,first.messages);
  for(const id of ['berth','pilotage']){
    const old=first.p.operations.find(o=>o.scopeId===id&&o.field==='rate')!;
    correction.p.operations.push({...old,operation:'preserve',evidence:correction.e('keep the other two charges')});
  }
  const after=correction.apply().state;
  expect(currentConversationFact(after,'berth','rate')?.value).toBe('825');expect(currentConversationFact(after,'pilotage','rate')?.value).toBe('390');
});
