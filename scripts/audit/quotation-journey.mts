import assert from "node:assert/strict";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
const site=process.env.SITE_URL!,url=process.env.NEXT_PUBLIC_CONVEX_URL!,dir=process.env.PORTIA_QUOTATION_OUTPUT!;
assert(new URL(site).hostname==="127.0.0.1"&&new URL(url).hostname==="127.0.0.1");
const mode=process.env.PORTIA_QUOTATION_MOCK==="true"?"synthetic":"live";
const fixture=JSON.parse(await readFile("tests/acceptance/portia/development.json","utf8"));
const question=fixture.cases.find((c:{id:string})=>c.id==="D01").steps[0].text as string;
const cache=path.join(homedir(),"Library/Caches/ms-playwright");
const candidates=(await readdir(cache)).filter(n=>n.startsWith("chromium_headless_shell-")).sort().reverse().map(n=>path.join(cache,n,"chrome-headless-shell-mac-"+process.arch,"chrome-headless-shell"));
const executablePath=[chromium.executablePath(),...candidates].find(existsSync);assert(executablePath);
const browser=await chromium.launch({headless:true,executablePath});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();
async function assertAmountVisible(amount: string) {
  const article=page.getByRole("article",{name:"Plisto response"}).last();
  const cell=article.getByRole("cell").filter({hasText:amount}).last();
  await cell.scrollIntoViewIfNeeded();
  const geometry=await cell.evaluate(element=>{
    const box=element.getBoundingClientRect();const region=element.closest('[data-slot="table-container"]') as HTMLElement;
    const bounds=region.getBoundingClientRect();
    return {left:box.left,right:box.right,viewport:window.innerWidth,regionLeft:bounds.left,regionRight:bounds.right,scrollWidth:region.scrollWidth,clientWidth:region.clientWidth};
  });
  assert(geometry.scrollWidth<=geometry.clientWidth+1,"Amount requires horizontal scrolling");
  assert(geometry.left>=0&&geometry.right<=geometry.viewport+1&&geometry.right<=geometry.regionRight+1,"Amount is clipped outside the viewport/table");
  return geometry;
}
const evidence:Record<string,unknown>={mode,input:question,inputSha256:createHash("sha256").update(question).digest("hex"),startedAt:new Date().toISOString(),passed:false};
let responseWire="";
let wirePromise:Promise<void>|undefined;
page.on("response",response=>{if(["/api/chat","/api/migration/chat"].includes(new URL(response.url()).pathname))wirePromise=response.text().then(text=>{responseWire=text;},()=>{});});
try {
  await page.goto(site+"/login?tab=signup");
  await page.getByLabel("Email",{exact:true}).fill("quotation-"+randomUUID()+"@example.com");
  await page.getByLabel("Password",{exact:true}).fill("LocalQuotation-"+randomUUID());
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/dashboard",{timeout:30000});
  await page.getByRole("textbox",{name:"Message",exact:true}).fill(question);
  await page.getByRole("button",{name:"Send message",exact:true}).click();
  await page.waitForURL("**/dashboard/chat/**",{timeout:20000});
  const conversationId=new URL(page.url()).pathname.split("/").at(-1)!;evidence.conversationId=conversationId;
  const token=await page.request.get(site+"/api/auth/convex/token");assert.equal(token.status(),200);
  const client=new ConvexHttpClient(url);client.setAuth((await token.json()).token);
  const deadline=Date.now()+210000;let state;
  while(Date.now()<deadline){
    state=await client.query(anyApi.migration.getConversation,{conversationId});
    if(state?.conversation?.state==="idle"&&state.conversation.revision>=2)break;
    if(["error","stopped","waiting"].includes(state?.conversation?.state))break;
    await new Promise(r=>setTimeout(r,300));
  }
  evidence.state=state?.conversation?.state;evidence.revision=state?.conversation?.revision;
  const stored=await client.query(anyApi.migration.listConversationMessages,{conversationId,paginationOpts:{cursor:null,numItems:50}});
  evidence.messages=stored.page.map((m:{role:string;text:string;runStatus:string;parts:unknown})=>({role:m.role,text:m.text,runStatus:m.runStatus,parts:m.parts}));
  await expect(page.getByRole("article",{name:"Plisto response"}).last()).toBeVisible({timeout:20000});
  await expect(page.getByRole("article",{name:"Plisto response"}).last()).toContainText("4,275.00",{timeout:20000});
  await wirePromise;
  const displayed=await page.getByRole("article",{name:"Plisto response"}).allTextContents();evidence.displayed=displayed;
  evidence.desktopAmountGeometry=await assertAmountVisible("4,275.00");
  await page.screenshot({path:path.join(dir,mode+"-display.png"),fullPage:true});
  assert.equal(state.conversation.state,"idle","Backend did not complete the quote");
  assert(responseWire.includes("4,275.00"),"No completed quote in response stream");
  assert(!/"type":"(?:error|abort)"/.test(responseWire),"Response stream failed after save");
  for(const value of ["1,875.00","2,400.00","4,275.00","0.075"])assert(displayed.join("\n").includes(value),"Missing displayed value "+value);
  const savedText=stored.page.filter((m:{role:string})=>m.role==="assistant").map((m:{text:string})=>m.text).join("\n");
  assert(savedText.includes("4,275.00"),"Correct response not persisted");
  assert(stored.page.some((m:{role:string;text:string})=>m.role==="user"&&m.text===question),"Saved input differs from frozen D01");
  await page.reload();
  await expect(page.getByRole("article",{name:"Plisto response"}).last()).toContainText("4,275.00",{timeout:20000});
  evidence.reloaded=await page.getByRole("article",{name:"Plisto response"}).allTextContents();
  assert.deepEqual(evidence.reloaded,evidence.displayed,"Reload text differs from original display");
  await assertAmountVisible("4,275.00");
  await page.screenshot({path:path.join(dir,mode+"-reload.png"),fullPage:true});
  await page.setViewportSize({width:320,height:900});
  evidence.mobileAmountGeometry=await assertAmountVisible("4,275.00");
  await page.screenshot({path:path.join(dir,mode+"-mobile.png"),fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  if(mode==="synthetic"&&process.env.PORTIA_SHARED_MOCK_FIXTURE){
    const fixture=JSON.parse(await readFile(process.env.PORTIA_SHARED_MOCK_FIXTURE,"utf8"));
    if(fixture.followup){
      evidence.initialStream=responseWire;
      await page.getByRole("textbox",{name:"Message",exact:true}).fill(fixture.followup.question);
      await page.getByRole("button",{name:"Send message",exact:true}).click();
      await expect(page.getByRole("article",{name:"Plisto response"}).last()).toContainText(fixture.followup.expectedTotal,{timeout:30000});
      await assertAmountVisible(fixture.followup.expectedTotal);
      const followupState=await client.query(anyApi.migration.getConversation,{conversationId});
      assert.equal(followupState.conversation.state,"idle");assert.equal(followupState.conversation.revision,4);
      const followupStored=await client.query(anyApi.migration.listConversationMessages,{conversationId,paginationOpts:{cursor:null,numItems:50}});
      assert(followupStored.page.some((m:{role:string;text:string})=>m.role==="assistant"&&m.text.includes(fixture.followup.expectedTotal)));
      const latest=await page.getByRole("article",{name:"Plisto response"}).last().innerText();
      assert(latest.includes("14000")&&latest.includes("30h")&&latest.includes("USD 2,400.00"),"Correction changed unrelated quotation facts");
      await page.reload();await expect(page.getByRole("article",{name:"Plisto response"}).last()).toContainText(fixture.followup.expectedTotal);
      await assertAmountVisible(fixture.followup.expectedTotal);
      assert.equal(await page.getByRole("article",{name:"Plisto response"}).last().innerText(),latest);
      await page.screenshot({path:path.join(dir,mode+"-followup-reload.png"),fullPage:true});
      evidence.followup={question:fixture.followup.question,state:followupState.conversation.state,revision:4,displayed:latest,saved:true,reloaded:true};
      if(fixture.mixed){
        await page.getByRole("textbox",{name:"Message",exact:true}).fill(fixture.mixed.question);
        await page.getByRole("button",{name:"Send message",exact:true}).click();
        await expect(page.getByRole("article",{name:"Plisto response"}).last()).toContainText("Saved preferred units as metric.",{timeout:30000});
        await expect(page.getByRole("article",{name:"Plisto response"}).last()).toContainText(fixture.followup.expectedTotal);
        const memoryResponse=await page.request.get(site+"/api/memory?conversationId="+conversationId);assert.equal(memoryResponse.status(),200);
        const memory=await memoryResponse.json();assert(memory.facts.some((f:{key:string;value:string})=>f.key==="preferred_units"&&f.value==="metric"),"Mixed request did not persist memory");
        const mixedState=await client.query(anyApi.migration.getConversation,{conversationId});assert.equal(mixedState.conversation.state,"idle");assert.equal(mixedState.conversation.revision,6);
        const mixedText=await page.getByRole("article",{name:"Plisto response"}).last().innerText();
        await page.reload();await expect(page.getByRole("article",{name:"Plisto response"}).last()).toContainText("Saved preferred units as metric.");
        assert.equal(await page.getByRole("article",{name:"Plisto response"}).last().innerText(),mixedText);
        await assertAmountVisible(fixture.followup.expectedTotal);await page.screenshot({path:path.join(dir,mode+"-mixed-reload.png"),fullPage:true});
        evidence.mixed={question:fixture.mixed.question,state:"idle",revision:6,displayed:mixedText,memorySaved:true,reloaded:true};
      }
    }
  }
  evidence.passed=true;console.log("QUOTATION_"+mode.toUpperCase()+"_PASS: USD 1,875 + USD 2,400 = USD 4,275; saved and reloaded.");
} catch(error) {
  evidence.error=String(error);evidence.bodyText=await page.locator("body").innerText().catch(()=>"");
  await page.screenshot({path:path.join(dir,mode+"-failure.png"),fullPage:true}).catch(()=>{});
  console.error("QUOTATION_"+mode.toUpperCase()+"_FAIL: "+String(error));process.exitCode=1;
} finally {
  evidence.finishedAt=new Date().toISOString();
  evidence.stream=responseWire;
  await writeFile(path.join(dir,mode+"-journey.json"),JSON.stringify(evidence,null,2)+"\n");
  await browser.close();
}
