// Executable integration probe for the workspace boundary; no live services.
import assert from "node:assert/strict";
import { Bash } from "just-bash";
import { AgentWorkspace, type WorkspacePersistence, type WorkspaceResult, type WorkspaceState } from "../src/lib/memory/workspace";
import { ChatMemoryRuntime, MEMORY_SQL_OUTPUT_BYTES } from "../src/lib/memory/runtime";

let state: WorkspaceState = { epoch: 0, revision: 0, scratchpadRevision: 0, image: null, scratchpad: "" };
let writes = 0;
let failPersistence = false;
const receipts = new Map<string, { commandHash: string; epoch: number; result: WorkspaceResult }>();
const persistence: WorkspacePersistence = {
  restore: async () => ({ ...state }),
  replay: async ({ toolCallId, commandHash }) => {
    const prior = toolCallId ? receipts.get(toolCallId) : undefined;
    if (!prior) return null;
    assert.equal(prior.epoch, state.epoch, "old epoch receipt is invalidated");
    assert.equal(prior.commandHash, commandHash, "tool call identity is immutable");
    return prior.result;
  },
  persist: async ({ baseline, operations, scratchpad, toolCallId, commandHash, result }) => {
    if (failPersistence) throw new Error("injected publication failure");
    assert.deepEqual(baseline, { epoch: state.epoch, revision: state.revision, scratchpadRevision: state.scratchpadRevision });
    let image = state.image;
    if (operations.length) {
      const runtime = await ChatMemoryRuntime.restore(image);
      await runtime.apply(operations);
      image = await runtime.snapshot();
    }
    const deletion = operations.some(operation => operation.kind === "forget" || operation.kind === "clear");
    if (deletion) receipts.clear();
    state = { ...state, image, revision: state.revision + (operations.length ? 1 : 0),
      epoch: state.epoch + (deletion ? 1 : 0), scratchpad: deletion ? "" : scratchpad ?? state.scratchpad,
      scratchpadRevision: state.scratchpadRevision + (scratchpad !== undefined || deletion ? 1 : 0) };
    writes++;
    if (toolCallId) receipts.set(toolCallId, { epoch: state.epoch, commandHash, result });
    return { ...state };
  },
};
const workspace = await AgentWorkspace.create({ persistence, source: "chat_probe" });
let id = 0;
const run = (command: string) => workspace.bash({ command }, `probe_${++id}`);
const ok = async (command: string) => {
  const result = await run(command);
  assert.equal(result.exitCode, 0, result.stderr);
  return result.stdout;
};

assert.match(await ok("head -c 80 /ports/mumbai/tariffs.md"), /\S/);
await ok("printf temp > /work/survives; printf tmp > /tmp/survives");
assert.equal(await ok("cat /work/survives /tmp/survives"), "temptmp");
await ok(`sqlite3 /memory/long_term.sqlite "INSERT INTO facts (key,value,sources) VALUES ('currency','INR','[]');"; printf 'current plan' > /scratchpad/current.md`);
assert.deepEqual(await (await ChatMemoryRuntime.restore(state.image)).facts(), [{ key: "currency", value: "INR", sources: ["chat_probe"] }]);
assert.equal(state.scratchpad, "current plan");
assert.match(await ok("cat /memory/summary.md"), /currency/);
const beforeReplay = writes;
const first = await workspace.bash({ command: "printf once >> /work/replay; cat /work/replay" }, "replay");
assert.deepEqual(await workspace.bash({ command: "printf once >> /work/replay; cat /work/replay" }, "replay"), first);
assert.equal(writes, beforeReplay + 1);
assert.equal(await ok("cat /work/replay"), "once");

for (const command of [
  "printf nope > /memory/summary.md", "printf nope > /ports/mumbai/tariffs.md", "rm -rf /memory", "mv /ports /work/copied",
  "chmod 777 /ports", "ln -s /ports/mumbai/tariffs.md /tmp/link", "ln /memory/long_term.sqlite /tmp/hardlink",
  `sqlite3 /memory/long_term.sqlite "UPDATE facts SET sources=json_array('forged');"`,
  `sqlite3 /memory/long_term.sqlite "CREATE TABLE injected (value TEXT);"`,
  "printf broken > /memory/long_term.sqlite",
  `sqlite3 /memory/long_term.sqlite "DELETE FROM facts;"; printf changed > /scratchpad/current.md`,
]) assert.notEqual((await run(command)).exitCode, 0, command);
assert.equal((await (await ChatMemoryRuntime.restore(state.image)).facts())[0]?.value, "INR");
assert.equal(state.scratchpad, "current plan");
const failedShell = await run(`sqlite3 /memory/long_term.sqlite "UPDATE facts SET value='USD';"; false`);
assert.notEqual(failedShell.exitCode, 0);
assert.match(await ok("sqlite3 /memory/long_term.sqlite 'SELECT value FROM facts;'"), /INR/);
for (const command of ["node -e '1'", "python3 -c '1'", "js-exec '1'", "curl https://example.com"]) assert.equal((await run(command)).exitCode, 127);
assert.equal(await ok("printenv"), "HOME=/work\nTMPDIR=/tmp\nPATH=/usr/bin:/bin\nLANG=C.UTF-8\nPWD=/work\n");
assert.ok(Buffer.byteLength((await run("yes x")).stdout) <= 16 * 1024);
assert.notEqual((await run("for i in $(seq 1 1100); do mkdir /tmp/entry_$i; done")).exitCode, 0);
await ok("rm -rf /tmp/entry_*");
await ok("cp /memory/long_term.sqlite /tmp/private-copy; cat /scratchpad/current.md > /work/private-copy");
const deletion = await run(`sqlite3 /memory/long_term.sqlite "SELECT value FROM facts; DELETE FROM facts;"`);
assert.deepEqual(deletion, { stdout: "", stderr: "", exitCode: 0 });
assert.equal(state.scratchpad, "");
assert.notEqual((await run("cat /tmp/private-copy /work/private-copy")).exitCode, 0);

const firstSource = await AgentWorkspace.create({ persistence, source: "source_a" });
const sameValue = "sqlite3 /memory/long_term.sqlite \"INSERT INTO facts(key,value,sources) VALUES ('shared','same fact','[]') ON CONFLICT(key) DO UPDATE SET value=excluded.value,sources='[]';\"";
assert.equal((await firstSource.bash({ command: sameValue }, "source_a_save")).exitCode, 0);
const secondSource = await AgentWorkspace.create({ persistence, source: "source_b" });
assert.equal((await secondSource.bash({ command: sameValue }, "source_b_save")).exitCode, 0);
const shared = await ChatMemoryRuntime.restore(state.image);
assert.deepEqual((await shared.facts())[0]?.sources, ["source_a", "source_b"]);
await shared.apply([{ kind: "delete_source", source: "source_a" }]);
assert.deepEqual(await (await ChatMemoryRuntime.restore(await shared.snapshot())).facts(), [{ key: "shared", value: "same fact", sources: ["source_b"] }]);

const largeShell = new Bash({ executionLimitProfile: "hardened", executionLimits: { maxOutputSize: MEMORY_SQL_OUTPUT_BYTES }, defenseInDepth: { enabled: true } });
const large = await ChatMemoryRuntime.restore(null, { shell: largeShell, fs: largeShell.fs });
const largestSources = JSON.stringify(Array.from({ length: 8 }, (_, index) => `s${index}${"x".repeat(98)}`));
const largestKey = (index: number) => `f${String(index).padStart(2, "0")}${"k".repeat(77)}`;
const values = Array.from({ length: 64 }, (_, index) => `('${largestKey(index)}','${"v".repeat(1024)}','${largestSources}')`).join(",");
assert.equal((await largeShell.exec("sqlite3", { args: ["/memory/long_term.sqlite", `INSERT INTO facts VALUES ${values};`] })).exitCode, 0);
const largeState = { ...state, image: await large.snapshot() };
const projection = await ChatMemoryRuntime.restore(largeState.image);
await projection.apply([{ kind: "remember", key: largestKey(1), value: "changed at capacity", source: "chat_probe" }]);
await projection.apply([{ kind: "forget", key: largestKey(0) }, { kind: "remember", key: "replacement", value: "replacement", source: "chat_probe" }]);
assert.equal((await (await ChatMemoryRuntime.restore(await projection.snapshot())).facts()).length, 64);
const largeWorkspace = await AgentWorkspace.create({ source: "chat_probe", persistence: { restore: async () => largeState, persist: async () => largeState } });
assert.equal((await largeWorkspace.bash({ command: "sqlite3 /memory/long_term.sqlite 'SELECT COUNT(*) FROM facts;'" })).stdout.trim(), "64");

failPersistence = true;
await assert.rejects(run("printf never_saved > /scratchpad/current.md"), /WORKSPACE_PERSISTENCE_FAILED/);
failPersistence = false;
await assert.rejects(run("true"), /WORKSPACE_PERSISTENCE_FAILED/);

const cancelled = await AgentWorkspace.create({ persistence, source: "chat_probe" });
const controller = new AbortController();
const pending = cancelled.bash({ command: "sleep 5" }, "cancelled", controller.signal);
setTimeout(() => controller.abort(), 50);
await assert.rejects(pending, /WORKSPACE_CANCELLED/);
await assert.rejects(cancelled.bash({ command: "true" }, "after_cancel"), /WORKSPACE_CANCELLED/);

const privacy = await AgentWorkspace.create({ persistence, source: "privacy_probe" });
let privacyId = 0;
const privacyRun = (command: string) => privacy.bash({ command }, `privacy_${++privacyId}`);
const privacyOk = async (command: string) => {
  const result = await privacyRun(command);
  assert.equal(result.exitCode, 0, result.stderr);
  return result;
};
await privacyOk("sqlite3 /memory/long_term.sqlite 'DELETE FROM facts;'");
await privacyOk("printf private > /scratchpad/current.md; printf private > /tmp/private; printf private > /work/private");
const emptyEpoch = state.epoch;
await privacyOk(`sqlite3 /memory/long_term.sqlite "SELECT 'DELETE FROM facts;'; /* DELETE FROM facts; */ SELECT 1; -- DELETE FROM facts;
EXPLAIN DELETE FROM facts;"; sqlite3 /memory/long_term.sqlite -readonly 'DELETE FROM facts;'; cp /memory/long_term.sqlite /tmp/copy.sqlite; sqlite3 /tmp/copy.sqlite 'DELETE FROM facts;'`);
assert.equal(state.epoch, emptyEpoch, "text, EXPLAIN, readonly and another database are not deletion requests");
assert.equal(state.scratchpad, "private");
assert.equal((await privacyOk("cat /tmp/private /work/private")).stdout, "privateprivate");
assert.notEqual((await privacyRun("sqlite3 /memory/long_term.sqlite 'DELETE FROM facts; SELECT missing FROM facts;'")).exitCode, 0);
assert.notEqual((await privacyRun("sqlite3 /memory/long_term.sqlite 'DELETE FROM facts;'; false")).exitCode, 0);
assert.notEqual((await privacyRun("sqlite3 /memory/long_term.sqlite 'BEGIN; DELETE FROM facts; ROLLBACK;'; true")).exitCode, 0);
assert.notEqual((await privacyRun("sqlite3 /memory/long_term.sqlite 'DELETE FROM facts;'; printf changed > /scratchpad/current.md")).exitCode, 0);
assert.equal(state.epoch, emptyEpoch, "failed or rolled-back deletion does not publish a barrier");
assert.equal(state.scratchpad, "private");
assert.deepEqual(await privacyOk(`printf 'WITH target AS (SELECT 1) DELETE FROM "main"."facts";' | sqlite3 /work/../memory/long_term.sqlite`), { stdout: "", stderr: "", exitCode: 0 });
assert.equal(state.epoch, emptyEpoch + 1, "empty-table DELETE still clears saved notes");
assert.equal(state.scratchpad, "");
assert.notEqual((await privacyRun("cat /tmp/private /work/private")).exitCode, 0);
await privacyOk(`sqlite3 /memory/long_term.sqlite "INSERT INTO facts VALUES ('unrelated','keep','[]');"; printf private > /scratchpad/current.md; printf private > /work/private`);
const absentEpoch = state.epoch;
assert.notEqual((await privacyRun("sqlite3 /memory/long_term.sqlite 'CREATE TEMP TRIGGER never_used AFTER INSERT ON facts BEGIN SELECT 1; DELETE FROM facts; END; DROP TRIGGER never_used;'")).exitCode, 0);
assert.equal(state.epoch, absentEpoch, "unexecuted trigger bodies cannot request a privacy barrier");
assert.equal(state.scratchpad, "private");
assert.deepEqual(await privacyOk(`sqlite3 -cmd "DELETE FROM 'main'.'facts' WHERE key='absent';" /memory/long_term.sqlite 'SELECT value FROM facts;'`), { stdout: "", stderr: "", exitCode: 0 });
assert.equal(state.epoch, absentEpoch + 1, "absent-key DELETE still forgets prior notes and receipts");
assert.equal(state.scratchpad, "");
assert.deepEqual(await (await ChatMemoryRuntime.restore(state.image)).facts(), [{ key: "unrelated", value: "keep", sources: ["privacy_probe"] }]);
assert.notEqual((await privacyRun("cat /work/private")).exitCode, 0);
console.log("Workspace probe passed: real SQLite, atomic diff/notes, same-value source provenance, receipts, immutable mounts, links, rollback, clean environment, bounds, no-op DELETE privacy barriers, terminal publication failure, cancellation.");
