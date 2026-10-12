
import assert from "node:assert/strict";
import {writeFile,readFile,rm} from "node:fs/promises";
import path from "node:path";
import {existsSync} from "node:fs";
import {homedir} from "node:os";
import {readdir} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {chromium,expect,type Page} from "@playwright/test";
import {ConvexHttpClient} from "convex/browser";
import {anyApi} from "convex/server";
const api=anyApi as unknown as typeof import("../convex/_generated/api").api;
import type {Id} from "../convex/_generated/dataModel";
import type {MemoryFact} from "../src/lib/memory/contracts";
const site=process.env.SITE_URL!,url=process.env.NEXT_PUBLIC_CONVEX_URL!,dir=process.env.MEMORY_E2E_DIR!;
assert(new URL(site).hostname==="127.0.0.1"&&new URL(url).hostname==="127.0.0.1");
type Result={name:string;passed:boolean;details?:unknown};
type Case={stamp:string;passwords:string;results:Result[];chatA:string;chatB:string;ownerA:string;ownerB:string;before:{totalCredits:number;totalUsage:number}|null};
const casePath=path.join(dir,"private-e2e-case.json");
const saved:Case|null=await readFile(casePath,"utf8").then(JSON.parse).catch(()=>null);
const results:Result[]=saved?.results??[];
const stamp=saved?.stamp??Date.now().toString(36);
const callsign="Northstar-"+stamp;
const voyage="Voyage-"+stamp;
const note="DOCK-NOTE-"+stamp;
const passwords=saved?.passwords??"LocalAcceptance-"+randomUUID();
let chatA=saved?.chatA??"",chatB=saved?.chatB??"",ownerA=saved?.ownerA??"",ownerB=saved?.ownerB??"";
const errors:string[]=[];
const network:{path:string;status:number}[]=[];
const consoleErrors:string[]=[];
const browserCache=path.join(homedir(),"Library/Caches/ms-playwright");
const cachedBrowsers=existsSync(browserCache)?(await readdir(browserCache)).filter(name=>name.startsWith("chromium_headless_shell-")).sort().reverse().map(name=>path.join(browserCache,name,"chrome-headless-shell-mac-"+(process.arch==="arm64"?"arm64":"x64"),"chrome-headless-shell")):[];
const browserPath=process.env.MEMORY_CHROMIUM_PATH??[chromium.executablePath(),...cachedBrowsers].find(existsSync);
assert(browserPath,"Install Playwright Chromium or set MEMORY_CHROMIUM_PATH");
const browser=await chromium.launch({headless:true,executablePath:browserPath});
const aliceContext=await browser.newContext({viewport:{width:1440,height:1000},...(saved?{storageState:JSON.parse(await readFile(path.join(dir,"private-alice-state.json"),"utf8"))}:{})});
const bobContext=await browser.newContext({viewport:{width:1440,height:1000},...(saved?{storageState:JSON.parse(await readFile(path.join(dir,"private-bob-state.json"),"utf8"))}:{})});
const a=await aliceContext.newPage(),b=await bobContext.newPage();
for(const page of [a,b]){
 page.on("pageerror",error=>errors.push(error.message));
 page.on("response",response=>{if(response.status()>=400)network.push({path:new URL(response.url()).pathname,status:response.status()});});
 page.on("console",message=>{if(message.type()==="error")consoleErrors.push(message.text().replace(/eyJ[A-Za-z0-9_.-]{30,}/g,"[jwt]"));});
}
type View={epoch:number;revision:number;facts:MemoryFact[];scratchpad:string;scratchpadRevision:number};
async function memory(page:Page,conversationId?:string):Promise<View>{
  const response=await page.request.get(site+"/api/memory"+(conversationId?"?conversationId="+conversationId:""));
  assert.equal(response.status(),200,await response.text());
  return response.json();
}
async function auth(page:Page,email:string,create=true){
  await page.goto(site+(create?"/login?tab=signup":"/login"));
  await page.getByLabel("Email",{exact:true}).fill(email);
  await page.getByLabel("Password",{exact:true}).fill(passwords);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/dashboard",{timeout:30_000});
  const response=await page.request.get(site+"/api/auth/get-session");
  assert.equal(response.status(),200);
  return (await response.json()).user.id as string;
}
async function client(page:Page){
  const response=await page.request.get(site+"/api/auth/convex/token");
  assert.equal(response.status(),200);
  const jwt=(await response.json()).token as string;
  const convex=new ConvexHttpClient(url);convex.setAuth(jwt);
  return {convex,jwt};
}
async function settled(page:Page,id:string){
  const {convex}=await client(page);
  const deadline=Date.now()+210_000;
  let complete=false;
  while(Date.now()<deadline){
    const state=await convex.query(api.migration.getConversation,{conversationId:id});
    if(!state)throw new Error("Conversation missing");
    if(["error","stopped","waiting"].includes(state.conversation.state))throw new Error("Chat run failed: "+state.conversation.state);
    if(state.conversation.state==="idle"&&state.conversation.revision>=2){complete=true;break;}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert(complete,"Chat completion deadline");
  await page.reload();
  await expect(page.getByRole("article",{name:"Plisto response"}).last()).toBeVisible({timeout:20_000});
  return page.getByRole("article",{name:"Plisto response"}).allTextContents();
}
async function ask(page:Page,text:string){
  await page.goto(site+"/dashboard");
  await page.getByRole("textbox",{name:"Message",exact:true}).fill(text);
  await page.getByRole("button",{name:"Send message",exact:true}).click();
  await page.waitForURL("**/dashboard/chat/**",{timeout:20_000});
  const id=new URL(page.url()).pathname.split("/").at(-1)!;
  const messages=await settled(page,id);
  return {id,text:messages.join("\n")};
}
async function control(op:string){
  const id=randomUUID();
  await new Promise<void>((resolve,reject)=>{
    const listener=(data:unknown)=>{
      const message=data as {id:string;ok:boolean;error?:string};
      if(message.id!==id)return;
      process.off("message",listener);
      if(message.ok)resolve();else reject(new Error(message.error));
    };
    process.on("message",listener);process.send?.({id,op});
  });
}
async function persistCase(){
 await writeFile(casePath,JSON.stringify({stamp,passwords,results,chatA,chatB,ownerA,ownerB,before}),{mode:0o600});
 await writeFile(path.join(dir,"private-alice-state.json"),JSON.stringify(await aliceContext.storageState()),{mode:0o600});
 await writeFile(path.join(dir,"private-bob-state.json"),JSON.stringify(await bobContext.storageState()),{mode:0o600});
}
async function check(name:string,fn:()=>Promise<unknown>){
 if(results.some(result=>result.name===name&&result.passed)){console.log("REUSED "+name);return;}
 const details=await fn();results.push({name,passed:true,...(details?{details}:{})});await persistCase();console.log("PASS "+name);
}
async function credit(){
 try {
  const response=await fetch("https://openrouter.ai/api/v1/credits",{headers:{authorization:"Bearer "+process.env.OPENROUTER_API_KEY},signal:AbortSignal.timeout(10000)});
  if(!response.ok)return null;
  const data=(await response.json()).data;
  return {totalCredits:data.total_credits,totalUsage:data.total_usage};
 }catch{return null;}
}
const before=saved?.before??await credit();
try{
  if(!saved){
    ownerA=await auth(a,"memory-a-"+stamp+"@example.com");ownerB=await auth(b,"memory-b-"+stamp+"@example.com");await persistCase();
  }else{
    const activeA=await a.request.get(site+"/api/auth/get-session");
    if(!(await activeA.json())?.user)ownerA=await auth(a,"memory-a-"+stamp+"@example.com",false);
    const activeB=await b.request.get(site+"/api/auth/get-session");
    if(!(await activeB.json())?.user)ownerB=await auth(b,"memory-b-"+stamp+"@example.com",false);
  }
  await check("real model stores cross-chat facts and current-chat notes through tools",async()=>{
    const response=await ask(a,"Synthetic memory acceptance test. Please remember these two facts for future conversations using exactly these stable keys: fleet_callsign = "+callsign+"; voyage_tag = "+voyage+". Also save this exact line in this chat's working notes: "+note+". Use the persistence tools for all three, then confirm briefly. Do not calculate anything.");
    chatA=response.id;
    const view=await memory(a,chatA);
    assert(view.facts.some(f=>f.key==="fleet_callsign"&&f.value===callsign));
    assert(view.facts.some(f=>f.key==="voyage_tag"&&f.value===voyage));
    assert(view.scratchpad.includes(note));
    await a.getByRole("button",{name:"Memory",exact:true}).click();
    await expect(a.getByRole("region",{name:"Saved memory"})).toContainText(callsign);
    await expect(a.getByTestId("working-notes")).toContainText(note);
    await a.screenshot({path:path.join(dir,"synthetic-memory-desktop.png")});
    await a.setViewportSize({width:390,height:844});
    await a.screenshot({path:path.join(dir,"synthetic-memory-mobile.png")});
    assert(await a.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await a.setViewportSize({width:1440,height:1000});
    return {conversationId:chatA,revision:view.revision};
  });
  await check("new chat recalls saved fact without receiving another chat's working notes",async()=>{
    const response=await ask(a,"What fleet callsign have I asked you to remember? Give the exact saved value, do not guess. What working notes are saved for this current conversation? Do not create or change any memories or notes.");
    chatB=response.id;assert(response.text.includes(callsign));assert(!response.text.includes(note));
    assert(!(await memory(a,chatB)).scratchpad.includes(note));
  });
  await check("Next and Convex restart preserve authentication, SQLite recall and Markdown notes",async()=>{
    await control("restart");
    await a.goto(site+"/dashboard/chat/"+chatA);
    await expect(a.getByRole("button",{name:"Memory",exact:true})).toBeVisible({timeout:30_000});
    await a.getByRole("button",{name:"Memory",exact:true}).click();
    await expect(a.getByTestId("working-notes")).toContainText(note);
    assert((await memory(a,chatA)).facts.some(f=>f.value===callsign));
    const response=await ask(a,"What is my saved fleet callsign? Return the remembered value without changing memory or notes.");
    assert(response.text.includes(callsign));
  });
  await check("separate real user cannot read or mutate the other user's memory",async()=>{
    const view=await memory(b);assert.equal(view.facts.length,0);
    const response=await ask(b,"What fleet callsign do you remember for me? Do not guess or store anything.");
    assert(!response.text.includes(callsign)&&!response.text.includes(voyage));
    assert.equal((await b.request.get(site+"/api/memory?conversationId="+chatA)).status(),404);
    const {convex,jwt}=await client(b);
    assert.equal(await convex.query(api.migration.getConversation,{conversationId:chatA}),null);
    await assert.rejects(convex.mutation(api.migration.deleteConversation,{conversationId:chatA as Id<"migrationConversations">}));
    const badOwner=await b.request.post(site+"/api/memory",{headers:{origin:site},data:{kind:"clear",epoch:0,requestId:randomUUID(),ownerId:ownerA}});
    assert.equal(badOwner.status(),400);
    const noSecret=await fetch(process.env.NEXT_PUBLIC_CONVEX_SITE_URL!+"/memory/bridge",{method:"POST",headers:{authorization:"Bearer "+jwt,"content-type":"application/json"},body:JSON.stringify({op:"open",args:{conversationId:chatA}})});
    assert.equal(noSecret.status,401);
    const foreign=await fetch(process.env.NEXT_PUBLIC_CONVEX_SITE_URL!+"/memory/bridge",{method:"POST",headers:{authorization:"Bearer "+jwt,"content-type":"application/json","x-portia-server-secret":process.env.PORTIA_SERVER_SECRET!},body:JSON.stringify({op:"open",args:{conversationId:chatA}})});
    assert.equal(foreign.status,409);
    const deniedOrigin=await b.request.post(site+"/api/memory",{headers:{origin:"https://wrong.example.com"},data:{kind:"clear",epoch:0,requestId:randomUUID()}});
    assert.equal(deniedOrigin.status(),403);
    await ask(b,"Please remember for future conversations using the exact key preferred_currency that my preferred currency is EUR. Use the memory tool and confirm briefly.");
    assert((await memory(b)).facts.some(f=>f.key==="preferred_currency"&&f.value==="EUR"));
    return {ownerA,ownerB};
  });
  await check("Memory panel forget removes recall and notes; exact deletion retry is idempotent",async()=>{
    await a.goto(site+"/dashboard/chat/"+chatB);
    await a.getByRole("button",{name:"Memory",exact:true}).click();
    await expect(a.getByRole("button",{name:"Forget fleet callsign"})).toBeVisible();
    let deletionBody:unknown;
    a.on("request",request=>{if(request.url().includes("/api/memory")&&request.method()==="POST")deletionBody=request.postDataJSON();});
    await a.getByRole("button",{name:"Forget fleet callsign"}).click();
    await expect(a.getByRole("button",{name:"Forget fleet callsign"})).toHaveCount(0);
    const forgotten=await memory(a,chatA);
    assert(!forgotten.facts.some(f=>f.value===callsign));assert.equal(forgotten.scratchpad,"");
    assert(forgotten.facts.some(f=>f.value===voyage));
    const duplicate=await a.request.post(site+"/api/memory",{headers:{origin:site},data:deletionBody});
    assert.equal(duplicate.status(),200);
    assert.equal((await duplicate.json()).epoch,forgotten.epoch);
    const response=await ask(a,"What is my saved fleet callsign? Check saved memory; if absent, say it is not saved. Do not guess or save anything.");
    assert(!response.text.includes(callsign));
  });
  await check("deleting the source chat removes its derived memory and survives restart",async()=>{
    await a.goto(site+"/dashboard/chat/"+chatA);
    await a.getByRole("button",{name:"Delete conversation",exact:true}).click();
    await a.getByRole("button",{name:"Delete",exact:true}).click();
    await a.waitForURL("**/dashboard",{timeout:15_000});
    const view=await memory(a);
    assert(!view.facts.some(f=>f.value===voyage||f.value===callsign));
    assert.equal((await a.request.get(site+"/api/memory?conversationId="+chatA)).status(),404);
    await control("restart");
    const response=await ask(a,"What voyage tag have I saved in memory? Check saved memory; if absent, say it is not saved. Do not guess or save anything.");
    assert(!response.text.includes(voyage));
    assert((await memory(b)).facts.some(f=>f.key==="preferred_currency"&&f.value==="EUR"));
  });
  await check("logout revokes memory access even while the prior JWT has time remaining",async()=>{
    const {jwt}=await client(a);
    const decoded=JSON.parse(Buffer.from(jwt.split(".")[1],"base64url").toString());assert(decoded.exp>Date.now()/1000);
    const signout=await a.request.post(site+"/api/auth/sign-out",{headers:{origin:site},data:{}});
    assert.equal(signout.status(),200);
    const response=await fetch(process.env.NEXT_PUBLIC_CONVEX_SITE_URL!+"/memory/bridge",{method:"POST",headers:{authorization:"Bearer "+jwt,"content-type":"application/json","x-portia-server-secret":process.env.PORTIA_SERVER_SECRET!},body:JSON.stringify({op:"open",args:{}})});
    assert.equal(response.status,401);
    assert.equal((await a.request.get(site+"/api/memory")).status(),401);
  });
  const after=await credit();
  await writeFile(path.join(dir,"chat-memory-acceptance.json"),JSON.stringify({at:new Date().toISOString(),site,scope:"Actual local production build, real Better Auth, actual Model 1 and SQLite tools; synthetic account data",results,errors,usage:{before,after,delta:before&&after?after.totalUsage-before.totalUsage:null}},null,2));
  assert.deepEqual(errors,[]);
  await Promise.all(["private-e2e-case.json","private-alice-state.json","private-bob-state.json"].map(name=>rm(path.join(dir,name),{force:true})));
  console.log("BROWSER_ACCEPTANCE_COMPLETE "+results.length);
}catch(error){
  await writeFile(path.join(dir,"chat-memory-failure.json"),JSON.stringify({at:new Date().toISOString(),results,errors,network,consoleErrors,url:a.url(),error:String(error)},null,2));
  await a.screenshot({path:path.join(dir,"failure.png")}).catch(()=>undefined);
  throw error;
}finally{
  await aliceContext.close();await bobContext.close();await browser.close();process.disconnect?.();
}
