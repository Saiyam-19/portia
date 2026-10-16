import {afterEach,expect,it,vi} from 'vitest';
import {readBoundedJsonBody} from '../../src/lib/bounded-json-body';
afterEach(()=>vi.unstubAllGlobals());
function request(stream:ReadableStream<Uint8Array>,options:{signal?:AbortSignal;headers?:Record<string,string>}={}) {
  return new Request('http://localhost/audit',{method:'POST',body:stream,duplex:'half',...options} as RequestInit);
}
it('accepts exact UTF-8 byte boundary, including characters split between chunks',async()=>{
  const value={text:'船🚢é'},bytes=new TextEncoder().encode(JSON.stringify(value));
  const body=request(new ReadableStream({start(c){for(const byte of bytes)c.enqueue(Uint8Array.of(byte));c.close();}}));
  expect(await readBoundedJsonBody(body,bytes.length)).toEqual({ok:true,value});expect(body.body!.locked).toBe(false);
});
it.each(['missing','false','declared'] as const)('rejects excess bytes with %s Content-Length',async mode=>{
  const cancel=vi.fn();
  const body=request(new ReadableStream({start(c){c.enqueue(new Uint8Array(4097));},cancel}),{headers:mode==='missing'?{}:{'content-length':mode==='false'?'1':'9999'}});
  expect(await readBoundedJsonBody(body,4096)).toEqual({ok:false,reason:'too_large'});expect(cancel).toHaveBeenCalled();expect(body.body!.locked).toBe(false);
});
it.each(['reject','hang'] as const)('does not let a %s in underlying cancel delay rejection or leak errors',async mode=>{
  const body=request(new ReadableStream({start(c){c.enqueue(new Uint8Array(33));},cancel(){return mode==='reject'?Promise.reject(new Error('cancel failed')):new Promise(()=>{});}}));
  expect(await readBoundedJsonBody(body,32)).toEqual({ok:false,reason:'too_large'});expect(body.body!.locked).toBe(false);
},1000);
it.each([true,false])('aborts before or during a pending read (already=%s)',async already=>{
  const controller=new AbortController(),cancel=vi.fn();
  if(already)controller.abort();
  const body=request(new ReadableStream({cancel}),{signal:controller.signal});
  const pending=readBoundedJsonBody(body,32);if(!already)controller.abort();
  expect(await pending).toEqual({ok:false,reason:'aborted'});expect(cancel).toHaveBeenCalled();expect(body.body!.locked).toBe(false);
});
it.each([new TextEncoder().encode('{'),Uint8Array.of(34,255,34),new Uint8Array()])('rejects malformed JSON/UTF8',async bytes=>{
  const body=request(new ReadableStream({start(c){c.enqueue(bytes);c.close();}}));expect(await readBoundedJsonBody(body,32)).toEqual({ok:false,reason:'invalid'});
});
it('contains source read errors and releases the reader',async()=>{
  const body=request(new ReadableStream({start(c){c.error(new Error('read failed'));}}));expect(await readBoundedJsonBody(body,32)).toEqual({ok:false,reason:'invalid'});expect(body.body!.locked).toBe(false);
});
