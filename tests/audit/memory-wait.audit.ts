import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {MemorySession} from '../../src/lib/memory/session';
import {MigrationTokenManager} from '../../src/lib/migration/bridge';
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(0);
  for(const[k,v]of Object.entries({PORTIA_ENABLED:'true',PORTIA_CONVEX_DEPLOYMENT:'brilliant-whale-380',NEXT_PUBLIC_CONVEX_URL:'https://brilliant-whale-380.convex.cloud',NEXT_PUBLIC_CONVEX_SITE_URL:'https://brilliant-whale-380.convex.site',PORTIA_SERVER_SECRET:'x'.repeat(32),SITE_URL:'http://127.0.0.1:3022'}))vi.stubEnv(k,v);
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();vi.useRealTimers();});
function session(){const controller=new AbortController(),manager=new MigrationTokenManager('','http://127.0.0.1:3022',controller);vi.spyOn(manager,'getToken').mockReturnValue('synthetic');return{controller,session:new MemorySession(manager)};}

it('bounds45-second contention including a fetch started near the deadline',async()=>{
  const network=vi.fn(async(_input:unknown,init?:RequestInit)=>{
    if(Date.now()>=43_000)return new Promise<Response>((_resolve,reject)=>init!.signal!.addEventListener('abort',()=>reject(init!.signal!.reason),{once:true}));
    return Response.json(JSON.parse(String(init?.body)).op==='claim'?null:{pending:true,blocked:false});
  });vi.stubGlobal('fetch',network);
  const pending=session().session.drain().catch(error=>error);
  await vi.advanceTimersByTimeAsync(45_000);
  expect(await pending).toMatchObject({name:'TimeoutError'});
  expect(network.mock.calls.length).toBeLessThanOrEqual(56);expect(vi.getTimerCount()).toBe(0);
  const count=network.mock.calls.length;await vi.advanceTimersByTimeAsync(10_000);expect(network.mock.calls).toHaveLength(count);
});
it.each(['sleep','fetch'])('aborts during %s without waiting for lease or deadline',async phase=>{
  const network=vi.fn(async(_input:unknown,init?:RequestInit)=>phase==='fetch'?new Promise<Response>((_resolve,reject)=>init!.signal!.addEventListener('abort',()=>reject(init!.signal!.reason),{once:true})):Response.json(JSON.parse(String(init?.body)).op==='claim'?null:{pending:true,blocked:false}));
  vi.stubGlobal('fetch',network);const actor=session(),pending=actor.session.drain().catch(error=>error);
  await vi.advanceTimersByTimeAsync(50);actor.controller.abort(new DOMException('Stopped','AbortError'));
  expect(await pending).toMatchObject({name:'AbortError'});expect(vi.getTimerCount()).toBe(0);
  const count=network.mock.calls.length;await vi.advanceTimersByTimeAsync(60_000);expect(network.mock.calls).toHaveLength(count);
});
it('recovers when another worker completes after its lease window',async()=>{
  const network=vi.fn(async(_input:unknown,init?:RequestInit)=>Response.json(JSON.parse(String(init?.body)).op==='claim'?null:{pending:Date.now()<30_000,blocked:false,revision:1}));
  vi.stubGlobal('fetch',network);const pending=session().session.drain();await vi.advanceTimersByTimeAsync(32_000);
  expect(await pending).toMatchObject({pending:false,revision:1});expect(network.mock.calls.length).toBeLessThanOrEqual(44);expect(vi.getTimerCount()).toBe(0);
});
