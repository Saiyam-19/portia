import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { randomBytes, generateKeyPairSync, sign } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile, open, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";

const cwd = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const local = path.join(cwd, ".local");
await mkdir(local, { recursive: true });
const lockPath = path.join(local, "integration.lock");
const lock = await open(lockPath, "wx").catch(() => { throw new Error("Prototype run already owns .local/integration.lock; inspect its PID before retrying."); });
await lock.writeFile(JSON.stringify({ pid: process.pid, cwd, task: "memory-persistence-prototype" }));
await lock.close();
const runDir = await mkdtemp(path.join(local, "run-"));
const port = Number(process.env.MEMORY_PROTOTYPE_PORT ?? 3220);
if (!Number.isInteger(port) || port < 1024 || port > 65534) throw new Error("INVALID_LOCAL_PORT");
const url = "http://127.0.0.1:" + port;
const registry: { pid: number; pgid: number; ppid: number; command: string; cwd: string; ports: number[]; purpose: string; stopped: boolean }[] = [];
const children = new Set<ChildProcess>();
const result: { name: string; passed: boolean; durationMs: number }[] = [];
const baseEnv = { ...process.env };
for (const key of Object.keys(baseEnv)) if (key.startsWith("CONVEX_") || key.startsWith("MEMORY_")) delete baseEnv[key];
const secret = randomBytes(32).toString("hex");
const workerSecret = randomBytes(32).toString("hex");
const redact = (s: string) => s.replaceAll(secret, "[redacted]").replaceAll(workerSecret, "[redacted]").replace(/eyJ[A-Za-z0-9_.-]{40,}/g, "[jwt]");
let adminKey = "";
const logFile = path.join(runDir, "backend.log");
const cached = path.join(homedir(), ".cache/convex/binaries");
const versions = existsSync(cached) ? (await readdir(cached)).sort().reverse() : [];
const binary = process.env.MEMORY_CONVEX_BINARY ?? versions.map(v => path.join(cached, v, "convex-local-backend")).find(existsSync);
let backend: ChildProcess | undefined;
let stopping: Promise<void> | undefined;
async function record() { await writeFile(path.join(runDir, "processes.json"), JSON.stringify({ task: "memory-persistence-prototype", runner: process.pid, registry }, null, 2)); }
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
    "--instance-name", "memory-prototype", "--instance-secret", secret, "--disable-beacon",
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
type Running = { child: ChildProcess; message: (type: string) => Promise<any> };
async function childClient(jwt: string, input: unknown): Promise<Running> {
  const child = spawn(process.execPath, ["--import", "tsx", "scripts/client-process.ts"], {
    cwd, env: { ...baseEnv, MEMORY_URL: url, MEMORY_JWT: jwt, MEMORY_WORKER_SECRET: workerSecret, MEMORY_CHILD_INPUT: JSON.stringify(input) },
    detached: true, stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const messages: any[] = [];
  let failure = "";
  child.stderr?.on("data", data => failure += data);
  child.on("message", message => messages.push(message));
  await track(child, "independent memory client", cwd);
  return { child, message: async type => {
    const deadline = Date.now() + 40_000;
    while (Date.now() < deadline) {
      const found = messages.find(m => m.type === type);
      if (found) return found;
      if (child.exitCode !== null) throw new Error("Child exited: " + redact(failure).slice(-1800));
      await new Promise(r => setTimeout(r, 25));
    }
    throw new Error("CLIENT_TIMEOUT: " + type);
  } };
}
async function check(name: string, fn: () => Promise<void>) {
  const start = Date.now();
  await fn();
  result.push({ name, passed: true, durationMs: Date.now() - start });
  console.log("PASS " + name);
}
try {
  assert(binary, "Set MEMORY_CONVEX_BINARY to a locally installed convex-local-backend");
  // Capture global process/listener inventory before starting anything; no unrelated process is modified.
  await writeFile(path.join(runDir, "process-baseline.txt"), execFileSync("ps", ["-axo", "pid,ppid,pgid,etime,%cpu,%mem,comm"], { encoding: "utf8" }));
  await writeFile(path.join(runDir, "listeners-before.txt"), execFileSync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"], { encoding: "utf8" }));
  adminKey = execFileSync(binary, ["keygen", "admin-key", "--instance-name", "memory-prototype", "--instance-secret", secret], { encoding: "utf8" }).trim();
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "prototype", alg: "RS256", use: "sig" };
  const jwt = (subject: string, overrides: Record<string, unknown> = {}) => {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "prototype" })).toString("base64url");
    const body = Buffer.from(JSON.stringify({ sub: subject, iss: "https://memory-prototype.test", aud: "memory-prototype", iat: now, exp: now + 3600, ...overrides })).toString("base64url");
    return header + "." + body + "." + sign("RSA-SHA256", Buffer.from(header + "." + body), privateKey).toString("base64url");
  };
  await startBackend();
  const env = { ...baseEnv, CONVEX_SELF_HOSTED_URL: url, CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey };
  await command(["env", "set", "MEMORY_PROTOTYPE_JWKS", "data:text/plain;charset=utf-8;base64," + Buffer.from(JSON.stringify({ keys: [jwk] })).toString("base64")], env, "configure-jwks");
  await command(["env", "set", "MEMORY_PROTOTYPE_WORKER_SECRET", workerSecret], env, "configure-worker");
  await command(["deploy", "--yes", "--typecheck", "disable"], env, "deploy");
  const { MemoryClient } = await import("../src/client.ts");
  const { MemoryRuntime } = await import("../src/runtime.ts");
  const { api, internal } = await import("../convex/_generated/api");
  const aliceJwt = jwt("alice"); const bobJwt = jwt("bob");
  const alice = new MemoryClient(url, aliceJwt, workerSecret);
  const bob = new MemoryClient(url, bobJwt, workerSecret);
  const admin = new ConvexHttpClient(url);
  (admin as any).setAdminAuth(adminKey);
  const ns = await alice.create("recovery");
  const inspect = (id: typeof ns) => admin.query(internal.memory.inspect as any, { namespaceId: id });
  const put = (key: string, value: string) => ({ kind: "put" as const, key, value, source: "synthetic-acceptance" });
  await check("cold process and backend restart restores SQLite plus Markdown", async () => {
    const writer = await childClient(aliceJwt, { mode: "write", namespaceId: ns, operations: [
      { requestId: "currency", operation: put("currency", "INR") },
      { requestId: "scratch", operation: { kind: "scratchpad", key: "chat-a", value: "# Working\nWaiting for dimensions" } },
    ] });
    await writer.message("ready"); writer.child.send("go"); await writer.message("result"); await finish(writer.child);
    await stop(backend!); await startBackend();
    const reader = await childClient(aliceJwt, { mode: "read", namespaceId: ns, scratchpad: "chat-a" });
    const restored = await reader.message("result");
    assert.equal(restored.facts[0].value, "INR"); assert.match(restored.summary, /INR/); assert.match(restored.scratchpad, /dimensions/);
    await finish(reader.child);
  });
  await check("simultaneous independent writers retain every update", async () => {
    const id = await alice.create("concurrent");
    const writers = await Promise.all(["a", "b"].map(prefix => childClient(aliceJwt, {
      mode: "write", namespaceId: id,
      operations: Array.from({ length: 8 }, (_, i) => ({ requestId: prefix + i, operation: put(prefix + i, prefix + "-value-" + i) })),
    })));
    await Promise.all(writers.map(w => w.message("ready")));
    writers.forEach(w => w.child.send("go"));
    await Promise.all(writers.map(w => w.message("result")));
    for (const w of writers) await finish(w.child);
    const facts = await (await MemoryRuntime.restore((await alice.read(id)).bytes)).recall();
    assert.equal(facts.length, 16);
    for (const prefix of ["a", "b"]) for (let i = 0; i < 8; i++) assert.equal(facts.find(f => f.key === prefix + i)?.value, prefix + "-value-" + i);
    assert.deepEqual(await inspect(id), { snapshots: 1, operations: 16, payloads: 0, tombstones: 0 });
  });
  await check("idempotent retries do not duplicate writes; mismatched retry rejected", async () => {
    const id = await alice.create("idempotency");
    const request = put("currency", "INR");
    const receipts = await Promise.all([alice.enqueue(id, "same", request), alice.enqueue(id, "same", request)]);
    assert.equal(receipts[0].sequence, receipts[1].sequence);
    await alice.flush(id);
    const before = await alice.read(id);
    assert.equal((await alice.enqueue(id, "same", request)).status, "done");
    await alice.flush(id); assert.equal((await alice.read(id)).revision, before.revision);
    await assert.rejects(alice.enqueue(id, "same", put("currency", "USD")), /IDEMPOTENCY_CONFLICT/);
  });
  await check("signed identities enforce cross-user, anonymous and forged-token isolation", async () => {
    const bobId = await bob.create("recovery"); assert.notEqual(bobId, ns);
    await bob.enqueue(bobId, "bob-value", put("currency", "EUR")); await bob.flush(bobId);
    await assert.rejects(bob.read(ns), /NOT_FOUND/);
    await assert.rejects(bob.enqueue(ns, "forged", put("x", "x")), /NOT_FOUND/);
    await assert.rejects(bob.claim(ns), /NOT_FOUND/);
    await assert.rejects(bob.http.mutation(api.memory.destroy, { namespaceId: ns }), /NOT_FOUND/);
    await assert.rejects(bob.http.query(api.memory.status, { namespaceId: ns, requestId: "currency" }), /NOT_FOUND/);
    const anonymous = new ConvexHttpClient(url);
    await assert.rejects(anonymous.query(api.memory.read, { namespaceId: ns }), /UNAUTHENTICATED/);
    await assert.rejects(anonymous.mutation(api.memory.create, { workspace: "anonymous" }), /UNAUTHENTICATED/);
    await assert.rejects(new MemoryClient(url, jwt("alice", { aud: "wrong-service" })).read(ns));
    const parts = aliceJwt.split("."); parts[1] = Buffer.from(JSON.stringify({ sub: "bob", iss: "https://memory-prototype.test", aud: "memory-prototype", exp: Math.floor(Date.now()/1000)+3600 })).toString("base64url");
    await assert.rejects(new MemoryClient(url, parts.join(".")).read(ns));
    await assert.rejects(alice.http.mutation(api.memory.claim, { namespaceId: ns, leaseMs: 1000, workerSecret: "wrong" }), /WORKER_REQUIRED/);
    await assert.rejects(alice.http.query(internal.memory.inspect as any, { namespaceId: ns }));
    assert.equal((await (await MemoryRuntime.restore((await bob.read(bobId)).bytes)).recall())[0].value, "EUR");
  });
  await check("crashed writer leaves a durable queue that another process recovers", async () => {
    const id = await alice.create("crash");
    await alice.enqueue(id, "pending", put("survives", "process-termination"));
    const writer = await childClient(aliceJwt, { mode: "pause", namespaceId: id });
    await writer.message("staged"); await stop(writer.child);
    assert.equal((await alice.read(id)).revision, 0);
    await stop(backend!); await startBackend();
    await alice.flush(id);
    assert.equal((await (await MemoryRuntime.restore((await alice.read(id)).bytes)).recall())[0].value, "process-termination");
  });
  await check("expired leases, incorrect revisions and stale fencing tokens reject publication", async () => {
    const id = await alice.create("fences");
    await alice.enqueue(id, "pending", put("safe", "new-writer"));
    const old = (await alice.claim(id, 150))!;
    await new Promise(r => setTimeout(r, 180));
    const current = (await alice.claim(id))!; assert(current.fence > old.fence);
    const runtime = await MemoryRuntime.restore(current.bytes); await runtime.apply(current.operations);
    const bytes = await runtime.checkpoint();
    await assert.rejects(alice.publish(id, old, bytes), /STALE_WRITER/);
    await assert.rejects(alice.publish(id, { ...current, baseRevision: 123 }, bytes), /STALE_WRITER/);
    await assert.rejects(alice.publish(id, { ...current, through: current.through + 1 }, bytes), /INVALID_CHECKPOINT/);
    await alice.publish(id, current, bytes);
    await assert.rejects(alice.publish(id, current, bytes), /STALE_WRITER/);
  });
  await check("forget purges persisted content, rejects stale writers and prevents resurrection", async () => {
    const id = await alice.create("forget");
    const marker = "FORGOTTEN_FIXTURE_38498219";
    await alice.enqueue(id, "initial", put("obsolete", marker));
    await alice.enqueue(id, "retained", put("keep", "still here"));
    await alice.enqueue(id, "scratch", { kind: "scratchpad", key: "chat-a", value: marker });
    await alice.flush(id);
    await alice.enqueue(id, "pending", put("later", "preserve this"));
    const stale = (await alice.claim(id))!;
    const staleRuntime = await MemoryRuntime.restore(stale.bytes); await staleRuntime.apply(stale.operations);
    await alice.enqueue(id, "forget", { kind: "forget", key: "obsolete" }, 0);
    await assert.rejects(alice.publish(id, stale, await staleRuntime.checkpoint()), /STALE_WRITER/);
    await assert.rejects(alice.enqueue(id, "stale-scratch", { kind: "scratchpad", key: "chat-a", value: marker }, 0), /STALE_EPOCH/);
    await assert.rejects(alice.enqueue(id, "resurrect", put("obsolete", marker)), /FORGOTTEN_KEY/);
    await alice.flush(id);
    const state = await alice.read(id);
    const restored = await MemoryRuntime.restore(state.bytes);
    assert.deepEqual((await restored.recall()).map(f => f.key), ["keep", "later"]);
    assert.doesNotMatch(await restored.readFile("/memory/summary.md"), new RegExp(marker));
    await assert.rejects(restored.readFile("/scratchpads/chat-a.md"));
    const archive = JSON.parse(Buffer.from(state.bytes!).toString());
    assert.equal(Buffer.from(archive.sqlite, "base64").includes(Buffer.from(marker)), false);
    assert.deepEqual(await inspect(id), { snapshots: 1, operations: 5, payloads: 0, tombstones: 1 });
    await stop(backend!); await startBackend();
    await assert.rejects(alice.enqueue(id, "after-restart", put("obsolete", marker)), /FORGOTTEN_KEY/);
    assert.equal((await alice.enqueue(id, "initial", put("obsolete", marker))).status, "done");
    await alice.flush(id);
    assert.deepEqual((await (await MemoryRuntime.restore((await alice.read(id)).bytes)).recall()).map(f => f.key), ["keep", "later"]);
  });
  await check("namespace deletion erases snapshots and queued payloads, and revokes in-flight work", async () => {
    const id = await alice.create("destroy");
    await alice.enqueue(id, "persist", put("secret", "delete all")); await alice.flush(id);
    await alice.enqueue(id, "pending", put("other", "also delete"));
    const claim = (await alice.claim(id))!;
    const runtime = await MemoryRuntime.restore(claim.bytes); await runtime.apply(claim.operations);
    await assert.rejects(bob.http.mutation(api.memory.destroy, { namespaceId: id }), /NOT_FOUND/);
    await alice.http.mutation(api.memory.destroy, { namespaceId: id });
    await assert.rejects(alice.read(id), /NOT_FOUND/);
    await assert.rejects(alice.publish(id, claim, await runtime.checkpoint()), /NOT_FOUND/);
    await assert.rejects(alice.enqueue(id, "new", put("x", "x")), /NOT_FOUND/);
    await assert.rejects(alice.create("destroy"), /NAMESPACE_DELETED/);
    assert.deepEqual(await inspect(id), { snapshots: 0, operations: 0, payloads: 0, tombstones: 0 });
    assert.equal((await alice.read(ns)).revision, 1);
  });
  await writeFile(path.join(local, "acceptance.json"), JSON.stringify({
    timestamp: new Date().toISOString(), runtime: process.version, binary, target: url, runDir,
    scope: "real local Convex, ephemeral signed JWTs, real just-bash SQLite; no chat or cloud integration",
    tests: result,
  }, null, 2));
} finally {
  await cleanup();
  await assertPortFree(port); await assertPortFree(port + 1);
  await writeFile(path.join(runDir, "listeners-after.txt"), execFileSync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"], { encoding: "utf8" }));
}
console.log("All " + result.length + " integration checks passed; owned processes stopped.");
