import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryRuntime } from "../src/runtime.ts";

test("SQLite and Markdown survive destroying and restoring the runtime", async () => {
  let runtime = await MemoryRuntime.restore();
  await runtime.apply([
    { kind: "put", key: "currency", value: "INR", source: "chat-a:turn-1" },
    { kind: "scratchpad", key: "chat-a", value: "# Working\nWaiting for vessel dimensions." },
  ]);
  const saved = await runtime.checkpoint();
  runtime = await MemoryRuntime.restore(saved);
  assert.deepEqual(await runtime.recall(), [{ key: "currency", value: "INR", source: "chat-a:turn-1" }]);
  assert.match(await runtime.readFile("/memory/summary.md"), /INR/);
  assert.match(await runtime.readFile("/scratchpads/chat-a.md"), /vessel dimensions/);
});

test("forget removes value from SQLite, summary, scratchpads and exported bytes", async () => {
  const runtime = await MemoryRuntime.restore();
  const secret = "UNIQUE_FORGOTTEN_FIXTURE_873209";
  await runtime.apply([
    { kind: "put", key: "obsolete", value: secret, source: "chat-a" },
    { kind: "put", key: "retained", value: "keep this", source: "chat-b" },
    { kind: "scratchpad", key: "chat-a", value: secret },
  ]);
  await runtime.apply([{ kind: "forget", key: "obsolete" }]);
  const saved = await runtime.checkpoint();
  const restored = await MemoryRuntime.restore(saved);
  assert.deepEqual(await restored.recall(), [{ key: "retained", value: "keep this", source: "chat-b" }]);
  assert.doesNotMatch(await restored.readFile("/memory/summary.md"), new RegExp(secret));
  await assert.rejects(restored.readFile("/scratchpads/chat-a.md"));
  const archive = JSON.parse(Buffer.from(saved).toString());
  assert.equal(Buffer.from(archive.sqlite, "base64").includes(Buffer.from(secret)), false);
  await assert.rejects(restored.apply([{ kind: "put", key: "obsolete", value: "stale replay", source: "old chat" }]), /FORGOTTEN_KEY/);
});

test("invalid snapshots and identifiers fail closed", async () => {
  await assert.rejects(MemoryRuntime.restore(new TextEncoder().encode("broken").buffer));
  const runtime = await MemoryRuntime.restore();
  await assert.rejects(runtime.apply([{ kind: "scratchpad", key: "../escape", value: "bad" }]));
});

test("prototype runtime exposes no printf or network command",async()=>{
  const runtime=await MemoryRuntime.restore();
  const shell=(runtime as unknown as {bash:{exec:(command:string)=>Promise<{exitCode:number}>}}).bash;
  for(const command of ['printf %.1000f 1','/usr/bin/printf x','command printf x','builtin printf x','awk BEGIN{}','curl https://example.com','wget https://example.com','python3 -c 1','js-exec 1'])assert.notEqual((await shell.exec(command)).exitCode,0,command);
});
