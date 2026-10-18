import {createRequire} from 'node:module';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {homedir} from 'node:os';
const require=createRequire(process.cwd()+'/package.json');const {chromium,expect}=require('@playwright/test');
const site=process.env.SITE_URL,dir=path.dirname(new URL(import.meta.url).pathname);assert(new URL(site).hostname==='127.0.0.1');
const cache=path.join(homedir(),'Library/Caches/ms-playwright');const candidates=fs.readdirSync(cache).filter(x=>x.startsWith('chromium_headless_shell-')).sort().reverse().map(x=>path.join(cache,x,'chrome-headless-shell-mac-'+(process.arch==='arm64'?'arm64':'x64'),'chrome-headless-shell'));
const executablePath=[chromium.executablePath(),...candidates].find(fs.existsSync);assert(executablePath);
const browser=await chromium.launch({headless:true,executablePath});const results=[];const errors=[];
const shutdown=setTimeout(()=>browser.close(),120000);process.once('SIGTERM',()=>{void browser.close().finally(()=>process.exit(130));});
const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
const count=()=>fs.existsSync(dir+'/browser-provider.jsonl')?fs.readFileSync(dir+'/browser-provider.jsonl','utf8').trim().split('\n').length:0;
const view=async()=>{const r=await page.request.get(site+'/api/memory');assert.equal(r.status(),200);return r.json();};
const response=()=>page.getByRole('article',{name:'Plisto response'}).last();
const pending=()=>page.getByRole('heading',{name:'Confirm exact operations',exact:true});
async function ask(text){
 console.log('BROWSER_STEP '+text.split(':')[0]);
 const prior=await page.getByRole('article',{name:'Plisto response'}).count();
 await page.getByRole('textbox',{name:'Message',exact:true}).fill(text);
 await page.getByRole('button',{name:'Send message',exact:true}).click();
 await expect.poll(()=>page.getByRole('article',{name:'Plisto response'}).count(),{timeout:30000}).toBeGreaterThan(prior);
}
async function decide(label,note){await page.getByRole('radio',{name:label,exact:true}).click();if(note)await page.getByLabel('Additional context').fill(note);await page.getByRole('button',{name:'Continue',exact:true}).click();}
try{
 await page.goto(site+'/login?tab=signup');await page.getByLabel('Email',{exact:true}).fill('authority-'+Date.now()+'@example.com');await page.getByLabel('Password',{exact:true}).fill('Synthetic-Only-Password-2026!');await page.locator('button[type="submit"]').click();await page.waitForURL('**/dashboard',{timeout:30000});
 await ask('AUTHORITY_QUOTE: supplier berth USD 137.50 and water USD 24.25, tax excluded.');await pending().waitFor({timeout:30000});
 await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeDisabled();await expect(page.getByRole('radio',{name:'Approve exactly as shown'})).not.toBeChecked();assert.equal((await view()).facts.length,0);
 await page.screenshot({path:dir+'/review-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:dir+'/review-mobile.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.setViewportSize({width:1440,height:1000});
 await page.reload();await pending().waitFor();const before=count();await decide('Approve exactly as shown');await expect(response()).toContainText('USD 161.75',{timeout:30000});assert.equal(count(),before);results.push('Exact approval executes and publishes USD 161.75 without another provider call; pending survives reload; no preselected approval; mobile no horizontal overflow.');
 await page.reload();await ask('AUTHORITY_READ: show the saved quotation.');await expect(response()).toContainText('USD 161.75',{timeout:30000});await expect(pending()).toHaveCount(0);results.push('Reloaded approved quote can be read without another review.');
 await ask('AUTHORITY_CHANGE: change the berth amount to USD 999.');await pending().waitFor({timeout:30000});const rejectCount=count();await decide('Reject');await expect(response()).toContainText('Review rejected',{timeout:30000});assert.equal(count(),rejectCount);await ask('AUTHORITY_READ: show the original quotation.');await expect(response()).toContainText('USD 161.75',{timeout:30000});results.push('Reject prevents quote revision; no inference on rejection.');
 await ask('AUTHORITY_CHANGE: change the berth amount to USD 999.');await pending().waitFor({timeout:30000});await decide('Approve exactly as shown','Keep the original 137.50 instead.');await expect(response()).toContainText('Synthetic response completed',{timeout:30000});await ask('AUTHORITY_READ: verify unchanged saved quotation.');await expect(response()).toContainText('USD 161.75',{timeout:30000});results.push('Approval with correction note never applies proposed USD 999.');
 await ask('AUTHORITY_MEMORY: do not remember anything; explain gross tonnage only.');await pending().waitFor({timeout:30000});assert.equal((await view()).facts.length,0);await decide('Reject');await expect(response()).toContainText('Review rejected',{timeout:30000});assert.equal((await view()).facts.length,0);results.push('Malicious memory call after negative consent only proposes; rejection persists no fact.');
 await ask('AUTHORITY_MEMORY: remember my preferred port for future chats.');await pending().waitFor({timeout:30000});const memoryCount=count();await decide('Approve exactly as shown');await expect(response()).toContainText('Requested memory saved',{timeout:30000});assert.equal(count(),memoryCount);assert.deepEqual((await view()).facts.map(({key,value})=>({key,value})),[{key:'audit_port',value:'Synthetic Mumbai'}]);results.push('Approved memory persists exact key/value; no provider reinterpretation.');
 await ask('AUTHORITY_FORGET: forget my preferred port.');await pending().waitFor({timeout:30000});const review=await page.locator('form').filter({has:pending()}).textContent();assert(!review.includes('Synthetic Mumbai'));await decide('Approve exactly as shown');await expect(response()).toContainText('Requested memory forgotten',{timeout:30000});assert.equal((await view()).facts.length,0);results.push('Forget review and response do not repeat forgotten value; memory removed.');
 await page.screenshot({path:dir+'/completed.png',fullPage:true});assert.deepEqual(errors,[]);console.log('AUTHORITY_BROWSER_PASS '+JSON.stringify(results));
}catch(error){await page.screenshot({path:dir+'/browser-failure.png',fullPage:true}).catch(()=>{});console.log('AUTHORITY_BROWSER_FAIL '+String(error));throw error;}
finally{clearTimeout(shutdown);fs.writeFileSync(dir+'/browser-results.json',JSON.stringify({results,errors,synthetic:true},null,2));await browser.close();}
