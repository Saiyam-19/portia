
import {afterEach,expect,it,vi} from "vitest";
import {MemorySession} from "../../src/lib/memory/session";
import {MigrationTokenManager} from "../../src/lib/migration/bridge";
import {ChatMemoryRuntime} from "../../src/lib/memory/runtime";
import {AuthoritySession} from "../../src/lib/authority/session";
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});
it("an ordinary memory outage is typed and does not revoke the run",async()=>{
 for(const [key,value] of Object.entries({PORTIA_ENABLED:"true",PORTIA_CONVEX_DEPLOYMENT:"brilliant-whale-380",NEXT_PUBLIC_CONVEX_URL:"https://brilliant-whale-380.convex.cloud",NEXT_PUBLIC_CONVEX_SITE_URL:"https://brilliant-whale-380.convex.site",PORTIA_SERVER_SECRET:"x".repeat(32),SITE_URL:"http://127.0.0.1:3022"}))vi.stubEnv(key,value);
 const controller=new AbortController();
 const manager=new MigrationTokenManager("synthetic","http://127.0.0.1:3022",controller);
 vi.spyOn(manager,"getToken").mockReturnValue("synthetic-jwt");
 const requested:string[]=[];
 vi.stubGlobal("fetch",vi.fn(async(_url,init)=>{
  const body=JSON.parse(String(init.body));requested.push(body.op);
  return Response.json({code:"MEMORY_UNAVAILABLE"},{status:409});
 }));
 const memory=new MemorySession(manager,"chat_a",{runId:"run_a",runFence:1}).agent();
 const result=await memory.proposeWrite!(new AuthoritySession(),"remember",{key:"preference",value:"INR"},undefined,"save");
 expect(result).toMatchObject({status:"unresolved",availability:"unavailable",saved:false,errorId:"save"});
 expect(controller.signal.aborted).toBe(false);
 expect(requested).not.toContain("publish");
 expect(requested).not.toContain("enqueue");
},15_000);
it("a memory epoch fence failure remains fatal",async()=>{
 for(const [key,value] of Object.entries({PORTIA_ENABLED:"true",PORTIA_CONVEX_DEPLOYMENT:"brilliant-whale-380",NEXT_PUBLIC_CONVEX_URL:"https://brilliant-whale-380.convex.cloud",NEXT_PUBLIC_CONVEX_SITE_URL:"https://brilliant-whale-380.convex.site",PORTIA_SERVER_SECRET:"x".repeat(32),SITE_URL:"http://127.0.0.1:3022"}))vi.stubEnv(key,value);
 const controller=new AbortController(),manager=new MigrationTokenManager("synthetic","http://127.0.0.1:3022",controller);
 vi.spyOn(manager,"getToken").mockReturnValue("synthetic-jwt");
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({code:"MEMORY_CHANGED"},{status:409})));
 const memory=new MemorySession(manager,"chat_a",{runId:"run_a",runFence:1}).agent();
 await expect(memory.currentVersion!()).rejects.toThrow("MEMORY_CHANGED");
 expect(controller.signal.aborted).toBe(true);
});
it("SQLite corruption with a valid manifest fails round-trip validation",async()=>{
 const runtime=await ChatMemoryRuntime.restore(null);
 await runtime.apply([{kind:"remember",key:"safe",value:"preserve",source:"chat_a"}]);
 const valid=await runtime.snapshot();
 const archive=JSON.parse(Buffer.from(valid,"base64").toString());
 const bytes=Buffer.alloc(4096);bytes.write("SQLite format 3\0");
 archive.sqlite=bytes.toString("base64");
 await expect(ChatMemoryRuntime.restore(Buffer.from(JSON.stringify(archive)).toString("base64"))).rejects.toThrow();
 expect(await (await ChatMemoryRuntime.restore(valid)).facts()).toEqual([{key:"safe",value:"preserve",sources:["chat_a"]}]);
},15_000);
