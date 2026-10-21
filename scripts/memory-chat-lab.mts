import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, writeFile, open, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const offline = process.env.PORTIA_OFFLINE_FIXTURES === "true";
if (offline) assert((globalThis as typeof globalThis & {__portiaOfflineNetwork?:boolean}).__portiaOfflineNetwork, "Offline lab requires its network-denying fixture preload");
assert(!process.env.PORTIA_FREE_TEST_MODEL?.trim() && !process.env.MIGRATION_MODEL_OVERRIDE?.trim() && !process.env.PORTIA_LIVE_KEY_FILE?.trim() && process.env.PORTIA_QUOTATION_MOCK !== "true", "Retired free/mock model modes are unsupported. No lab was started.");
const local = path.join(cwd, ".local");
await mkdir(local, { recursive: true });
const lockPath = path.join(local, "chat-integration.lock");
const lock = await open(lockPath, "wx").catch(() => { throw new Error("Another lab owns .local/chat-integration.lock; inspect its PID before retrying."); });
await lock.writeFile(JSON.stringify({ pid: process.pid, cwd, task: process.env.PORTIA_PROCESS_OWNER ?? "chat-memory-integration" }));
await lock.close();
const runDir = await mkdtemp(path.join(local, "run-"));
const port = Number(process.env.MEMORY_PROTOTYPE_PORT ?? 3220);
if (!Number.isInteger(port) || port < 1024 || port > 65534) throw new Error("INVALID_LOCAL_PORT");
const url = "http://127.0.0.1:" + port;
const registry: { pid: number; pgid: number; ppid: number; command: string; cwd: string; ports: number[]; purpose: string; stopped: boolean }[] = [];
const children = new Set<ChildProcess>();
const baseEnv = { ...process.env };
for (const key of Object.keys(baseEnv)) if (key.startsWith("CONVEX_") || key.startsWith("MEMORY_")) delete baseEnv[key];
const secret = randomBytes(32).toString("hex");
const workerSecret = randomBytes(32).toString("hex");
const sensitive = new Set([secret, workerSecret]);
const redact = (s: string) => [...sensitive].reduce((text, value) => value ? text.replaceAll(value, "[redacted]") : text, s).replace(/eyJ[A-Za-z0-9_.-]{40,}/g, "[jwt]");
let adminKey = "";
const logFile = path.join(runDir, "backend.log");
const cached = path.join(homedir(), ".cache/convex/binaries");
const versions = existsSync(cached) ? (await readdir(cached)).sort().reverse() : [];
const binary = process.env.MEMORY_CONVEX_BINARY ?? versions.map(v => path.join(cached, v, "convex-local-backend")).find(existsSync);
let backend: ChildProcess | undefined;
let stopping: Promise<void> | undefined;
async function record() { await writeFile(path.join(runDir, "processes.json"), JSON.stringify({ task: process.env.PORTIA_PROCESS_OWNER ?? "chat-memory-integration", runner: process.pid, registry }, null, 2)); }
function processInfo(pid: number) {
  try {
    const value = execFileSync("ps", ["-p", String(pid), "-o", "pid=,ppid=,pgid=,stat=,comm="], { encoding: "utf8" }).trim();
    const match = value.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
    return match ? { pid: +match[1], ppid: +match[2], pgid: +match[3], state: match[4], command: match[5] } : null;
  } catch { return null; }
}
async function track(child: ChildProcess, purpose: string, childCwd: string, ports: number[] = []) {
  assert(child.pid);
  const info = processInfo(child.pid);
  assert(info && info.pgid === child.pid && info.ppid === process.pid);
  registry.push({ ...info, cwd: childCwd, ports, purpose, stopped: false });
  children.add(child);
  child.once("exit", () => children.delete(child));
  await record();
  return child;
}
function survivors(pgid: number) {
  return execFileSync("ps", ["-axo", "pid=,pgid=,stat=,comm="], { encoding: "utf8" }).split("\n").flatMap(line => {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
    return m && +m[2] === pgid && !m[3].startsWith("Z") ? [{ pid: +m[1], command: m[4] }] : [];
  });
}
async function finish(child: ChildProcess) {
  if (child.exitCode === null && child.signalCode === null) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CLIENT_EXIT_TIMEOUT")), 5000);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
    });
  }
  const item = registry.find(r => r.pid === child.pid)!;
  for(let i=0;i<40&&survivors(item.pgid).length;i++)await new Promise(r=>setTimeout(r,50));
  if(survivors(item.pgid).length)await stop(child);
  assert.equal(survivors(item.pgid).length, 0);
  item.stopped = true;
  children.delete(child);
  await record();
}
async function stop(child: ChildProcess) {
  if (!child.pid) return;
  const owned = registry.find(r => r.pid === child.pid);
  assert(owned);
  const info = processInfo(child.pid);
  if (info && !info.state.startsWith("Z")) {
    assert.equal(info.pgid, owned.pgid);
    assert.equal(info.ppid, process.pid);
    assert.equal(info.command, owned.command);
    try {
      const childCwd = execFileSync("lsof", ["-a", "-p", String(child.pid), "-d", "cwd", "-Fn"], { encoding: "utf8" }).split("\n").find(l => l.startsWith("n"))?.slice(1);
      assert.equal(childCwd, owned.cwd);
    } catch (error) {
      const latest = processInfo(child.pid);
      if (latest && !latest.state.startsWith("Z")) throw error;
    }
  }
  const before = survivors(owned.pgid);
  if (before.length) {
    try { process.kill(-owned.pgid, "SIGTERM"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
  }
  const deadline = Date.now() + 5000;
  while (survivors(owned.pgid).length && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  for (const survivor of survivors(owned.pgid)) {
    assert(before.some(p => p.pid === survivor.pid && p.command === survivor.command), "Unverified descendant; refusing SIGKILL");
    const current = processInfo(survivor.pid);
    assert(current && current.pgid === owned.pgid && current.command === survivor.command);
    process.kill(survivor.pid, "SIGKILL");
  }
  await new Promise(r => setTimeout(r, 100));
  assert.equal(survivors(owned.pgid).length, 0, "Owned process respawned");
  owned.stopped = true;
  children.delete(child);
  await record();
}
async function cleanup() {
  if (stopping) return stopping;
  stopping = (async () => {
    const errors: unknown[] = [];
    for (const child of [...children].reverse()) {
      try { await stop(child); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, "Process cleanup incomplete");
    // A process may have exited just before cleanup; verify its group also vanished.
    for (const item of registry) {
      assert.equal(survivors(item.pgid).length, 0, "Leftover process group " + item.pgid);
      item.stopped = true;
    }
    await record();
    await rm(lockPath);
  })();
  return stopping;
}
for (const sig of ["SIGINT", "SIGTERM"] as const) process.once(sig, () => { void cleanup().finally(() => process.exit(130)); });
async function assertPortFree(value: number) {
  await new Promise<void>((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(value, "127.0.0.1", () => probe.close(error => error ? reject(error) : resolve()));
  });
}
async function startBackend() {
  await assertPortFree(port); await assertPortFree(port + 1);
  const args = ["--interface", "127.0.0.1", "--port", String(port), "--site-proxy-port", String(port + 1),
    "--instance-name", "local-memory-integration", "--instance-secret", secret, "--disable-beacon",
    "--local-storage", path.join(runDir, "storage"), path.join(runDir, "db.sqlite3")];
  const child = spawn(binary!, args, { cwd: runDir, env: baseEnv, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout?.on("data", data => { void import("node:fs").then(fs => fs.appendFileSync(logFile, redact(String(data)))); });
  child.stderr?.on("data", data => { void import("node:fs").then(fs => fs.appendFileSync(logFile, redact(String(data)))); });
  await track(child, "isolated Convex backend", runDir, [port, port + 1]);
  backend = child;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("Local backend exited; see redacted backend.log");
    try { if ((await fetch(url + "/version", { signal: AbortSignal.timeout(400) })).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error("BACKEND_START_TIMEOUT");
}
async function command(args: string[], env: NodeJS.ProcessEnv, label: string) {
  const child = spawn(process.execPath, [path.join(cwd, "node_modules/convex/bin/main.js"), ...args], {
    cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"],
  });
  const done = new Promise<number | null>((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); });
  let output = "";
  child.stdout?.on("data", data => output += data);
  child.stderr?.on("data", data => output += data);
  await track(child, label, cwd);
  const code = await done;
  const safe = redact(output).replaceAll(adminKey, "[admin-key]");
  await writeFile(path.join(runDir, label + ".log"), safe);
  if (code !== 0) throw new Error(label + " failed: " + safe.slice(-3000));
}

const appPort=3022;
const site="http://127.0.0.1:"+appPort;
let app: ChildProcess|undefined;
let appEnv: NodeJS.ProcessEnv;
const readEnv=(file:string)=>{
  const values:Record<string,string>={};
  if(!existsSync(file))return values;
  for(const line of requireRead(file).split("\n")) {
    const match=line.match(/^([A-Z0-9_]+)=(.*)$/);
    if(match)values[match[1]]=match[2].trim().replace(/^(['"])(.*)\1$/,"$2");
  }
  return values;
};
function requireRead(file:string){return execFileSync("cat",[file],{encoding:"utf8"});}
async function buildApp() {
  const child=spawn(process.execPath,[path.join(cwd,"node_modules/next/dist/bin/next"),"build",...(process.env.PORTIA_BUILD_WEBPACK==="true"?["--webpack"]:[])],{cwd,env:appEnv,detached:true,stdio:["ignore","pipe","pipe"]});
  const done=new Promise<number|null>((resolve,reject)=>{child.once("exit",resolve);child.once("error",reject)});
  let output="";
  child.stdout?.on("data",data=>output+=data);child.stderr?.on("data",data=>output+=data);
  await track(child,"Next production build",cwd);
  const code=await done;
  await writeFile(path.join(runDir,"build.log"),redact(output));
  if(code!==0)throw new Error("Build failed: "+redact(output).slice(-5000));
  await finish(child);
  console.log("BUILD_PASS");
}
async function startApp() {
  await assertPortFree(appPort);
  app=spawn(process.execPath,[path.join(cwd,"node_modules/next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(appPort)],{cwd,env:appEnv,detached:true,stdio:["ignore","pipe","pipe"]});
  const log=await import("node:fs");
  app.stdout?.on("data",data=>log.appendFileSync(path.join(runDir,"next.log"),redact(String(data))));
  app.stderr?.on("data",data=>log.appendFileSync(path.join(runDir,"next.log"),redact(String(data))));
  await track(app,"Portia memory production-build preview",cwd,[appPort]);
  for(let i=0;i<150;i++){
    if(app.exitCode!==null)throw new Error("App exited");
    try{if((await fetch(site+"/login",{signal:AbortSignal.timeout(1000)})).ok){
      const entry=registry.find(row=>row.pid===app!.pid)!;
      entry.command=processInfo(app.pid!)!.command;
      await record();return;
    }}catch{}
    await new Promise(r=>setTimeout(r,200));
  }
  throw new Error("APP_START_TIMEOUT");
}
async function restartApp(){if(app)await stop(app);await startApp();console.log("APP_RESTARTED");}
async function runVerification() {
  const verificationEnv:NodeJS.ProcessEnv={...appEnv,MEMORY_E2E_ADMIN_KEY:adminKey,MEMORY_E2E_DIR:runDir,MEMORY_CHROMIUM_PATH:process.env.MEMORY_CHROMIUM_PATH};
  // Browser verification never receives the inference credential.
  const script = process.env.PORTIA_BROWSER_VERIFY_SCRIPT ?? "scripts/memory-chat-e2e.mts";
  // Node 22 executes erasable TypeScript; no retired prototype dependency.
  const child=spawn(process.execPath,[...(/\.[cm]?js$/.test(script) ? [] : ["--experimental-strip-types"]),script],{
    cwd,env:verificationEnv,detached:true,stdio:["ignore","pipe","pipe","ipc"],
  });
  child.stdout?.on("data",data=>process.stdout.write(redact(String(data))));
  child.stderr?.on("data",data=>process.stdout.write(redact(String(data))));
  child.on("message",async(data:unknown)=>{
    const message=data as {op:string;id:string};
    try{
      if(message.op==="restart"){await restartApp();await stop(backend!);await startBackend();}
      else if(message.op==="restart-app")await restartApp();
      else throw new Error("Unknown control request");
      child.send({id:message.id,ok:true});
    }catch(error){child.send({id:message.id,ok:false,error:String(error)});}
  });
  const done=new Promise<number|null>((resolve,reject)=>{child.once("exit",resolve);child.once("error",reject)});
  await track(child,"Browser end-to-end verification",cwd);
  const code=await done;
  await finish(child);
  console.log(code===0?"E2E_PASS":"E2E_FAIL");
}
try {
  assert(binary,"Set MEMORY_CONVEX_BINARY to a cached backend");
  await writeFile(path.join(runDir,"process-baseline.txt"),execFileSync("ps",["-axo","pid,ppid,pgid,etime,%cpu,%mem,comm"],{encoding:"utf8"}));
  await writeFile(path.join(runDir,"listeners-before.txt"),execFileSync("lsof",["-nP","-iTCP","-sTCP:LISTEN"],{encoding:"utf8"}));
  adminKey=execFileSync(binary,["keygen","admin-key","--instance-name","local-memory-integration","--instance-secret",secret],{encoding:"utf8"}).trim();
  const existing=offline || process.env.OPENROUTER_API_KEY ? {} : readEnv(process.env.PORTIA_VERIFY_ENV ?? path.join(cwd, ".env.local"));
  const providerKey=offline ? "offline-fixture-not-a-credential" : process.env.OPENROUTER_API_KEY ?? existing.OPENROUTER_API_KEY;
  if(providerKey)sensitive.add(providerKey);
  assert(providerKey,"Set OPENROUTER_API_KEY or PORTIA_VERIFY_ENV for the requested live-model acceptance run");
  const betterAuthSecret=randomBytes(32).toString("hex");
  appEnv={...baseEnv,PORTIA_LOCAL_BACKEND:"true",PORTIA_ENABLED:"true",PORTIA_CONVEX_DEPLOYMENT:"local-memory-integration",
    PORTIA_MEMORY_ENABLED:"true",NEXT_PUBLIC_CONVEX_URL:url,NEXT_PUBLIC_CONVEX_SITE_URL:"http://127.0.0.1:"+(port+1),
    SITE_URL:site,NEXT_PUBLIC_SITE_URL:site,PORTIA_AUTH_MODE:"basic",PORTIA_SERVER_SECRET:workerSecret,
    BETTER_AUTH_SECRET:betterAuthSecret,OPENROUTER_API_KEY:providerKey,LLM_ALLOW_PAID:"true",
    NEXT_TELEMETRY_DISABLED:"1"};
  await startBackend();
  const cliEnv={...baseEnv,CONVEX_SELF_HOSTED_URL:url,CONVEX_SELF_HOSTED_ADMIN_KEY:adminKey};
  const serverValues={PORTIA_LOCAL_BACKEND:"true",PORTIA_ENABLED:"true",PORTIA_CONVEX_DEPLOYMENT:"local-memory-integration",
    PORTIA_MEMORY_ENABLED:"true",SITE_URL:site,PORTIA_AUTH_MODE:"basic",PORTIA_SERVER_SECRET:workerSecret,
    BETTER_AUTH_SECRET:betterAuthSecret,PORTIA_RUNS_PER_MINUTE:"20",PORTIA_CREATES_PER_MINUTE:"20"};
  for(const [key,value] of Object.entries(serverValues))await command(["env","set",key,value],cliEnv,"env-"+key);
  await command(["deploy","--yes","--typecheck","disable"],cliEnv,"deploy");
  console.log("LOCAL_CONVEX_READY");
  if(process.env.PORTIA_REUSE_BUILD_ID){
    assert.equal(requireRead(path.join(cwd,".next/BUILD_ID")).trim(),process.env.PORTIA_REUSE_BUILD_ID,"The requested tested build is no longer present");
    const prior=JSON.parse(requireRead(path.join(local,"memory-chat-lab.json")));
    assert(prior.site===site&&prior.url===url,"Reused build must target the same isolated origins");
    console.log("REUSED_TESTED_BUILD "+process.env.PORTIA_REUSE_BUILD_ID);
  }else await buildApp();
  await startApp();
  await writeFile(path.join(local,"memory-chat-lab.json"),JSON.stringify({runner:process.pid,cwd,runDir,site,url,ports:[port,port+1,appPort]},null,2));
  console.log("READY "+site+" ; commands: verify, restart, rebuild, deploy, stop");
  const {createInterface}=await import("node:readline");
  const lines=createInterface({input:process.stdin,terminal:false});
  for await(const line of lines){
    try{
      if(line.trim()==="stop")break;
      if(line.trim()==="verify")await runVerification();
      else if(line.trim()==="restart"){await restartApp();await stop(backend!);await startBackend();console.log("RESTART_PASS");}
      else if(line.trim()==="rebuild"){if(app)await stop(app);await buildApp();await startApp();console.log("READY "+site);}
      else if(line.trim()==="deploy"){await command(["deploy","--yes","--typecheck","disable"],cliEnv,"deploy");console.log("DEPLOY_PASS");}
    }catch(error){console.error(redact(String(error)));}
  }
  lines.close();
} finally {
  await cleanup();
  for(const value of [port,port+1,appPort])await assertPortFree(value);
  await writeFile(path.join(runDir,"listeners-after.txt"),execFileSync("lsof",["-nP","-iTCP","-sTCP:LISTEN"],{encoding:"utf8"}));
}
console.log("LAB_STOPPED");
