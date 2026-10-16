export type BoundedJsonBody =
  | {ok:true;value:unknown}
  | {ok:false;reason:'too_large'|'invalid'|'aborted'};

/** Cancellation is observed, but a hostile underlying cancel cannot delay rejection. */
export async function readBoundedJsonBody(request:Request,limit:number):Promise<BoundedJsonBody> {
  const reader=request.body?.getReader();
  if(!reader)return {ok:false,reason:request.signal.aborted?'aborted':'invalid'};
  const cancel=()=>{void reader.cancel().catch(()=>undefined);};
  const abort=()=>cancel();
  request.signal.addEventListener('abort',abort,{once:true});
  try {
    if(request.signal.aborted){cancel();return {ok:false,reason:'aborted'};}
    const declared=Number(request.headers.get('content-length')??0);
    if(declared>limit){cancel();return {ok:false,reason:'too_large'};}
    const chunks:Uint8Array[]=[];
    let size=0;
    while(true){
      const next=await reader.read();
      if(request.signal.aborted)return {ok:false,reason:'aborted'};
      if(next.done)break;
      size+=next.value.byteLength;
      if(size>limit){cancel();return {ok:false,reason:'too_large'};}
      chunks.push(next.value);
    }
    const bytes=new Uint8Array(size);
    let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    return {ok:true,value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))};
  }catch{
    cancel();
    return {ok:false,reason:request.signal.aborted?'aborted':'invalid'};
  }finally{
    request.signal.removeEventListener('abort',abort);
    reader.releaseLock();
  }
}
