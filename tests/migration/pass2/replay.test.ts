import { expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { reduceInterpretation, type ConversationInput } from '../../../src/lib/migration/conversation';
import { planConversationAnswer, renderConversationAnswer } from '../../../src/lib/migration/conversation-rules';

it('replays all 42 saved dispatches offline without altering captures', async () => {
  const root = path.resolve('output/inference-pass1');
  const ledger = JSON.parse(fs.readFileSync(path.join(root, 'ledger.json'), 'utf8'));
  const textOf = (c: unknown): string => typeof c === 'string' ? c : (c as {text?:string}[] ?? []).map(p=>p.text??'').join('');
  const results = [];
  for (const call of ledger.calls) {
    const req = JSON.parse(fs.readFileSync(path.join(root, 'calls', call.id+'.request.json'), 'utf8'));
    const messages = req.request.messages as {role:string;content:unknown}[];
    const system = messages.filter(m=>m.role==='system').map(m=>textOf(m.content)).join('\n');
    const state = JSON.parse(system.split('CURRENT_CONVERSATION=')[1].split('\n')[0]);
    const pending = JSON.parse(system.split('AUTHENTICATED_PENDING_INPUTS=')[1].split('\n')[0]);
    const users = messages.filter(m=>m.role==='user').map(m=>textOf(m.content));
    const inputs: ConversationInput[] = [...state.consumed.map((id:string)=>({id,text:users[Number(id.split('-')[1])],kind:'user'})), ...pending];
    const responsePath = path.join(root,'calls',call.id+'.response.txt');
    const raw = fs.existsSync(responsePath) ? fs.readFileSync(responsePath,'utf8') : '';
    const args: Record<string,string> = {};
    for (const line of raw.split('\n')) if (line.startsWith('data: {')) {
      let data; try { data=JSON.parse(line.slice(6)); } catch { continue; }
      for (const choice of data.choices??[]) for (const tc of choice.delta?.tool_calls??[]) args[tc.index??0]=(args[tc.index??0]??'')+(tc.function?.arguments??'');
    }
    const row = {id:req.id,callId:call.id,case:req.case,repair:call.repair,input:req.text,reducerPass:false,answerComplete:false,gates:[] as string[],text:''};
    try {
      if (Object.keys(args).length!==1) throw new Error('capture: expected one complete interpretation');
      const proposal = {...JSON.parse(Object.values(args)[0]),baseHash:state.hash,inputIds:pending.map((p:ConversationInput)=>p.id)};
      const reduced = reduceInterpretation(state,proposal,inputs);
      row.gates = reduced.state.facts.filter(f=>f.revision===reduced.state.revision&&f.status==='conflicting').map(f=>`${f.scopeId}.${f.field}: ${f.validationError??'conflicting fact'}`);
      row.reducerPass = row.gates.length===0;
      const answer = await planConversationAnswer(reduced.state,{runId:'pass2-offline-replay',fence:1,revision:1});
      row.answerComplete = answer.complete;
      row.text = renderConversationAnswer(answer);
      if (!answer.complete) row.gates.push(...answer.items.flatMap(i=>i.pending.map(p=>`planner/${i.taskId}: ${p}`)));
    } catch (error) { row.gates.push(error instanceof Error ? error.message : String(error)); }
    results.push(row);
  }
  expect(results).toHaveLength(42);
  const summary={label:process.env.PASS2_LABEL??'baseline',total:42,reducerPass:results.filter(r=>r.reducerPass).length,answerComplete:results.filter(r=>r.answerComplete).length,results};
  fs.mkdirSync('output/pass2',{recursive:true});
  fs.writeFileSync(`output/pass2/replay-${summary.label}.json`,JSON.stringify(summary,null,2)+'\n');
  for (const r of results) console.log(r.id,r.repair?'repair':'first',r.reducerPass?'ACCEPT':'REJECT',r.gates.join(' | ').slice(0,700));
  console.log('REPLAY SUMMARY',JSON.stringify({...summary,results:undefined}));
});
