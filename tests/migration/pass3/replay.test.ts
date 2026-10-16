import {expect,it} from 'vitest';
import fs from 'node:fs';
import {conversationInputs,emptyConversation,reduceInterpretation,type ConversationState,type ConversationInput} from '../../../src/lib/migration/conversation';
import {compileFlatInterpretation} from '../../../src/lib/migration/flat-interpretation';
import {planConversationAnswer,renderConversationAnswer} from '../../../src/lib/migration/conversation-rules';
const read=(file:string)=>JSON.parse(fs.readFileSync(file,'utf8'));
function argumentsOf(file:string){
  const args:Record<string,string>={};if(!fs.existsSync(file))throw new Error('capture: absent response');
  for(const line of fs.readFileSync(file,'utf8').split('\n'))if(line.startsWith('data: {')){
    const data=JSON.parse(line.slice(6));for(const choice of data.choices??[])for(const t of choice.delta?.tool_calls??[])args[t.index??0]=(args[t.index??0]??'')+(t.function?.arguments??'');
  }
  if(Object.keys(args).length!==1)throw new Error('capture: expected one complete tool call');return JSON.parse(Object.values(args)[0]);
}
const textOf=(c:unknown):string=>typeof c==='string'?c:(c as {text?:string}[]??[]).map(p=>p.text??'').join('');
it('replays all 60 untouched captures through their saved-contract entrypoints',async()=>{
  const records:Array<{id:string;version:string;callId:string;repair:boolean;accepted:boolean;complete:boolean;oracle:boolean;gates:string[];text:string}>=[];
  for(const version of ['v1','v2']){
    const root=version==='v1'?'output/inference-pass1':'output/pass2/live';
    const ledger=read(root+'/ledger.json');const oldResults=version==='v2'?read(root+'/results.json'):[];
    for(const call of ledger.calls){
      const req=read(`${root}/calls/${call.id}.request.json`),messages=req.request.messages as {role:string;content:unknown}[];
      const id=version==='v1'?req.id:req.turnId;
      const row={id,version,callId:call.id,repair:call.repair,accepted:false,complete:false,oracle:false,gates:[] as string[],text:''};
      try{
        let previous:ConversationState,inputs:ConversationInput[];
        const raw=argumentsOf(`${root}/calls/${call.id}.response.txt`);
        if(version==='v1'){
          const system=messages.filter(m=>m.role==='system').map(m=>textOf(m.content)).join('\n');
          previous=JSON.parse(system.split('CURRENT_CONVERSATION=')[1].split('\n')[0]);
          const pending=JSON.parse(system.split('AUTHENTICATED_PENDING_INPUTS=')[1].split('\n')[0]);
          const users=messages.filter(m=>m.role==='user').map(m=>textOf(m.content));
          inputs=[...previous.consumed.map(id=>({id,text:users[Number(id.split('-')[1])],kind:'user' as const})),...pending];
          raw.baseHash=previous.hash;raw.inputIds=pending.map((p:ConversationInput)=>p.id);
        }else{
          const old=oldResults.find((r:{id:string})=>r.id===id);
          previous=old.turn===2?oldResults.find((r:{case:string;repetition:number;turn:number})=>r.case===old.case&&r.repetition===old.repetition&&r.turn===1).state:emptyConversation();
          inputs=conversationInputs(messages.filter(m=>m.role==='user').map(m=>({role:'user',content:textOf(m.content)})));
        }
        const proposal=version==='v1'?raw:compileFlatInterpretation(previous,raw,inputs);
        const reduced=reduceInterpretation(previous,proposal,inputs);
        row.gates=reduced.state.facts.filter(f=>f.revision===reduced.state.revision&&f.status==='conflicting').map(f=>`${f.scopeId}.${f.field}: ${f.validationError??'conflict'}`);
        row.accepted=row.gates.length===0;
        const answer=await planConversationAnswer(reduced.state,{runId:'pass3-replay',fence:1,revision:1});row.complete=answer.complete;row.text=renderConversationAnswer(answer);
        row.gates.push(...answer.items.flatMap(i=>i.pending.map(p=>`planner/${i.taskId}: ${p}`)));
        const required=id.toLowerCase().includes('d11')?['1,100.00','billable periods 3']:id.toLowerCase().includes('d19')?(id.endsWith('t2')?['1,295.00','825.00','390.00']:['1,280.00','825.00','390.00','65.00']):id.toLowerCase().includes('d24')?['113,220.00','114,500.00','1,280.00']:id.toLowerCase().includes('original-19')?['60,000.00','62,500.00','120,000.00']:['30.5 hours','billable periods 6','24,000.00'];
        row.oracle=row.accepted&&row.complete&&required.every(s=>row.text.includes(s));
      }catch(e){row.gates.push(e instanceof Error?e.message:String(e));}
      records.push(row);
    }
  }
  expect(records).toHaveLength(60);
  const summary={label:process.env.PASS3_LABEL??'baseline',total:60,accepted:records.filter(r=>r.accepted).length,oracle:records.filter(r=>r.oracle).length,byVersion:Object.fromEntries(['v1','v2'].map(v=>[v,{accepted:records.filter(r=>r.version===v&&r.accepted).length,oracle:records.filter(r=>r.version===v&&r.oracle).length}])),records};
  fs.mkdirSync('output/pass3',{recursive:true});fs.writeFileSync(`output/pass3/replay-${summary.label}.json`,JSON.stringify(summary,null,2));console.log(JSON.stringify({...summary,records:undefined}));
});
