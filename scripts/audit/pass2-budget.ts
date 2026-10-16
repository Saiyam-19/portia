export const HEADLESS_POLICY = Object.freeze({model:'openai/gpt-6.1-sol',reasoning:{enabled:true,effort:'medium'},hardCapMicros:1_000_000,stopMicros:800_000,maxOutputTokens:8192,maxInputPrice:0.0000025,outputPrice:0.00001});
export type AccountedCall={reserveMicros:number;actualMicros?:number};
export function reserveDispatch(calls:AccountedCall[],requestBytes:number,maxOutputTokens:number){
  if(maxOutputTokens!==HEADLESS_POLICY.maxOutputTokens||!Number.isSafeInteger(requestBytes)||requestBytes<1)throw new Error('Invalid frozen bounds');
  const inputBound=requestBytes+4096;
  if(inputBound>=272000)throw new Error('Long-context pricing is outside this run');
  const reserveMicros=Math.ceil((inputBound*HEADLESS_POLICY.maxInputPrice+maxOutputTokens*HEADLESS_POLICY.outputPrice)*1e6);
  const spent=calls.reduce((sum,c)=>sum+(c.actualMicros??c.reserveMicros),0);
  if(spent+reserveMicros>=HEADLESS_POLICY.stopMicros)throw new Error('80 percent budget stop: next reservation would reach the threshold');
  return {reserveMicros,inputBound};
}
export function checkDispatch(request:Record<string,unknown>,prior:number){
  const r=request as {model?:string;stream?:boolean;tool_choice?:{function?:{name?:string}};reasoning?:unknown;max_tokens?:number;provider?:{allow_fallbacks?:boolean;only?:string[]};messages?:{role:string;content:string|{text?:string}[]}[]};
  const repair=r.messages?.some(m=>m.role==='system'&&(typeof m.content==='string'?m.content:m.content.map(p=>p.text??'').join('')).startsWith('Invalid interpretation:'))??false;
  if(r.model!==HEADLESS_POLICY.model||!r.stream||r.tool_choice?.function?.name!=='interpret_request'||r.max_tokens!==8192||r.provider?.allow_fallbacks!==false||JSON.stringify(r.provider.only)!=='["openai"]'||JSON.stringify(r.reasoning)!==JSON.stringify(HEADLESS_POLICY.reasoning))throw new Error('Unexpected model dispatch settings');
  if(prior>=2||prior===1&&!repair||prior===0&&repair)throw new Error('Only one initial call and one schema repair are permitted');
  return repair;
}
