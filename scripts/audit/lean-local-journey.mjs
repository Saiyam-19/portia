// Synthetic public UI journey using the existing isolated lab and SQLite-backed
// Convex server. Authentication/UI/storage are real local; inference is replaced.
import assert from 'node:assert/strict';
import {writeFile,readdir,readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium,expect} from '@playwright/test';
import {ConvexHttpClient} from 'convex/browser';
import {anyApi} from 'convex/server';

assert.equal(process.env.PORTIA_OFFLINE_FIXTURES,'true');
assert.equal(globalThis.__portiaOfflineNetwork,true);
const site=process.env.SITE_URL,url=process.env.NEXT_PUBLIC_CONVEX_URL,dir=process.env.MEMORY_E2E_DIR;
assert.equal(new URL(site).hostname,'127.0.0.1');assert.equal(new URL(url).hostname,'127.0.0.1');
const cache=path.join(homedir(),'Library/Caches/ms-playwright');
const versions=existsSync(cache)?(await readdir(cache)).filter(name=>name.startsWith('chromium_headless_shell-')).sort().reverse():[];
const binary=[chromium.executablePath(),...versions.map(name=>path.join(cache,name,'chrome-headless-shell-mac-'+(process.arch==='arm64'?'arm64':'x64'),'chrome-headless-shell'))].find(existsSync);
assert(binary,'Cached browser required; no downloads.');
const browser=await chromium.launch({headless:true,executablePath:binary});
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{void browser.close().finally(()=>process.exit(130));});
const context=await browser.newContext({viewport:{width:1440,height:1100}});
await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
const page=await context.newPage(),results=[];
let client,id;
const events=async()=> (await readFile(path.join(process.env.PORTIA_AUDIT_OUTPUT_DIR,'offline-provider-events.jsonl'),'utf8').catch(()=>'' )).trim().split('\n').filter(Boolean).length;
async function state(){return client.query(anyApi.migration.getConversation,{conversationId:id});}
async function settled(previousRevision=0){
  await expect.poll(async()=>{const value=await state();assert(!['error','stopped'].includes(value.conversation.state),JSON.stringify(value));return value.conversation.revision>=previousRevision+2&&['idle','waiting'].includes(value.conversation.state);},{timeout:30000}).toBe(true);
  return state();
}
async function ask(text){
  const previous=id?(await state()).conversation.revision:0;
  const responsePromise=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/chat'&&response.request().method()==='POST',{timeout:30000});
  await page.getByRole('textbox',{name:'Message',exact:true}).fill(text);
  await page.getByRole('button',{name:'Send message',exact:true}).click();
  if(!id){await page.waitForURL('**/dashboard/chat/**');id=new URL(page.url()).pathname.split('/').at(-1);}
  const response=await responsePromise;assert.equal(response.status(),200);
  await settled(previous);await page.reload();await expect(page.getByRole('textbox',{name:'Message',exact:true})).toBeVisible();
}
async function approve(expected){
  const pending=(await state()).forms.find(form=>form.status==='pending');assert(pending);
  for(const value of expected)assert(pending.description.includes(value),value+' absent from exact review');
  const before=await events(),revision=(await state()).conversation.revision;
  const responsePromise=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/chat'&&response.request().method()==='POST',{timeout:30000});
  await page.getByRole('radio',{name:'Approve exactly as shown',exact:true}).check();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  const response=await responsePromise;assert.equal(response.status(),200);
  await settled(revision);assert.equal(await events(),before,'Approval must not trigger fresh model inference');
  await page.reload();await expect(page.getByRole('textbox',{name:'Message',exact:true})).toBeVisible();
}
async function control(op){const requestId=randomUUID();await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Restart timeout')),30000);const listener=message=>{if(message.id!==requestId)return;clearTimeout(timeout);process.off('message',listener);if(message.ok)resolve();else reject(Error(message.error));};process.on('message',listener);process.send({op,id:requestId});});}
try {
  await page.goto(site+'/login?tab=signup');
  await page.getByLabel('Email',{exact:true}).fill('lean-'+randomUUID()+'@example.test');
  await page.getByLabel('Password',{exact:true}).fill('Local-fixture-'+randomUUID());
  await page.locator('button[type="submit"]').click();await page.waitForURL('**/dashboard');
  const token=await (await page.request.get(site+'/api/auth/convex/token')).json();client=new ConvexHttpClient(url);client.setAuth(token.token);
  await ask('Create quotation Alpha, supplier Agency Alpha, physical operator Terminal Alpha, reference AL-1. Transfer coverage transfer: USD per tonne per movement, 12 tonnes and 3 movements, rate unknown. Documentation coverage documentation: flat USD 10. Excluded charge flat USD 900. Tax status unknown. [fixture:create]');
  assert(!(await state()).forms.some(form=>form.status==='pending'),'Unpriced draft cannot be approved');
  results.push({check:'unpriced draft persisted without approval',pass:true});
  await ask('Correct Alpha Transfer rate to USD 3 per tonne per movement; retain 12 tonnes and 3 movements and every other supplied fact. [fixture:correct]');
  await approve(['Agency Alpha','Terminal Alpha','AL-1','1018']);
  results.push({check:'corrected compound quote exact review and native approval',pass:true,expected:'12 × 3 × 3 + 10 + 900 = USD 1018'});
  await ask('Create quotation Beta, supplier Agency Beta, physical operator Terminal Beta. Transfer coverage transfer flat EUR 40, Documentation coverage documentation flat EUR 10, Excluded charge flat EUR 1000. Tax status unknown. [fixture:beta]');
  await approve(['Agency Beta','Terminal Beta','1050']);
  await ask('Compare only Transfer and Documentation in Alpha and Beta, excluding Excluded charge in both. The selected transfer and documentation services have matching coverage as supplied. Use 1 EUR = 2 USD, show USD. Tax remains unknown. [fixture:compare]');
  await approve(['Compare these exact','line ids','from amount: 1','to amount: 2']);
  let content=await page.locator('body').innerText();
  for(const value of ['USD 118.00','USD 100.00','USD 18.00','Tax status unknown'])assert(content.includes(value),value+' missing');
  await page.screenshot({path:path.join(dir,'selected-comparison.png'),fullPage:true});
  results.push({check:'selected comparison exact FX, exclusions and tax qualification',pass:true,expected:'Alpha 108 + 10 = USD 118; Beta (40 + 10) × 2 = USD 100; difference USD 18'});
  await ask('First compare the same selected Transfer and Documentation lines in Alpha and Beta using 1 EUR = 2 USD. Then correct Alpha Transfer rate to USD 4 per tonne per movement, retaining 12 tonnes and 3 movements. Leave the invalidated comparison unfinished; do not recompute after the correction. [fixture:stale]');
  await approve(['1054']);
  await expect(page.getByRole('article',{name:'Plisto response'}).last()).toContainText('comparison remains unfinished');
  await page.reload();
  await expect(page.getByRole('article',{name:'Plisto response'}).last()).toContainText('comparison remains unfinished');
  results.push({check:'invalidated comparison stays unfinished after native correction approval and reload',pass:true});
  await ask('Now explicitly recompute only Transfer and Documentation in Alpha and Beta at their current revisions, in USD using 1 EUR = 2 USD. [fixture:compare]');
  await approve(['Compare these exact','154']);
  content=await page.getByRole('article',{name:'Plisto response'}).last().innerText();
  for(const value of ['USD 154.00','USD 100.00','USD 54.00'])assert(content.includes(value),'Recomputation lost '+value);
  results.push({check:'explicit current comparison after correction',pass:true,expected:'Alpha 12 × 3 × 4 + 10 = USD 154; Beta = USD 100; difference USD 54'});
  await control('restart');await page.reload();
  await expect(page.getByRole('textbox',{name:'Message',exact:true})).toBeVisible();
  content=await page.locator('body').innerText();
  for(const value of ['USD 154.00','USD 100.00','USD 54.00','Tax status unknown'])assert(content.includes(value),'Restart lost '+value);
  await ask('Read both saved quotations with original supplier and operator metadata. [fixture:read]');
  content=await page.locator('body').innerText();
  for(const value of ['Agency Alpha','Terminal Alpha','AL-1','USD 1,054.00','EUR 1,050.00'])assert(content.includes(value),'Readback lost '+value);
  await page.screenshot({path:path.join(dir,'persisted-reload.png'),fullPage:true});
  results.push({check:'app/backend restart and persisted UI readback',pass:true});
  await writeFile(path.join(dir,'lean-journey.json'),JSON.stringify({synthetic:true,providerInference:false,localAuth:true,localSQLite:true,conversationId:id,results},null,2));
  console.log(JSON.stringify({pass:true,checks:results.length,evidence:path.join(dir,'lean-journey.json')}));
} catch(error) {
  await page.screenshot({path:path.join(dir,'lean-failure.png'),fullPage:true}).catch(()=>{});
  await writeFile(path.join(dir,'lean-journey.json'),JSON.stringify({synthetic:true,providerInference:false,pass:false,error:String(error),results,body:await page.locator('body').innerText().catch(()=>''),state:id?await state().catch(()=>null):null},null,2));
  throw error;
} finally {await context.close();await browser.close();}
