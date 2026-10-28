import "server-only";
import { createHash } from "node:crypto";
import { Bash, decodeBytesToUtf8, defineCommand, InMemoryFs } from "just-bash";
import { loadPortTariffDocuments, SUPPORTED_PORTS } from "../migration/ports";
import type { MemoryFact, MemoryOperation, MemoryState, WorkspaceResult } from "./contracts";
import { ChatMemoryRuntime, MEMORY_DATABASE_PATH, MEMORY_SQL_OUTPUT_BYTES } from "./runtime";
import { sqliteDeletesFacts } from "./sqlite-delete";
import { SCRATCHPAD_PATH, WorkspaceFileSystem } from "./workspace-fs";

export type { WorkspaceResult } from "./contracts";
export type WorkspaceVersion = Pick<MemoryState, "epoch" | "revision" | "scratchpadRevision">;
export type WorkspaceState = WorkspaceVersion & Pick<MemoryState, "image" | "scratchpad">;
type Invocation = { toolCallId?: string; commandHash: string; signal?: AbortSignal };
type UserSql = { deletion: boolean; failure?: unknown };
export interface WorkspacePersistence {
  restore(signal?: AbortSignal): Promise<WorkspaceState>;
  replay?(invocation: Invocation): Promise<WorkspaceResult | null>;
  // Atomically CAS the baseline, accept the whole diff and notes, and return the
  // canonical published state. Success must mean durable publication/receipt.
  persist(change: Invocation & {
    baseline: WorkspaceVersion; operations: MemoryOperation[]; scratchpad?: string;
    result: WorkspaceResult;
  }): Promise<WorkspaceState>;
}

const OUTPUT_BYTES = 16 * 1024;
const CLEAN_ENV = { HOME: "/work", TMPDIR: "/tmp", PATH: "/usr/bin:/bin", LANG: "C.UTF-8" };
function bounded(result: WorkspaceResult): WorkspaceResult {
  const clip = (text: string, bytes: number) => Buffer.from(text).subarray(0, Math.max(0, bytes)).toString("utf8").replace(/\uFFFD$/, "");
  const marker = Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) > OUTPUT_BYTES ? "\n[Output truncated; narrow the query.]" : "";
  const available = OUTPUT_BYTES - Buffer.byteLength(marker);
  const stdout = clip(result.stdout, available);
  return { stdout, stderr: clip(result.stderr, available - Buffer.byteLength(stdout)) + marker, exitCode: result.exitCode };
}
function factDiff(before: MemoryFact[], after: MemoryFact[], source: string): MemoryOperation[] {
  if (before.length && !after.length) return [{ kind: "clear" }];
  const previous = new Map(before.map(fact => [fact.key, fact]));
  const current = new Map(after.map(fact => [fact.key, fact]));
  const operations: MemoryOperation[] = [];
  // Remove first so a replacement at the 64-fact limit never briefly grows
  // the coordinator's canonical database to 65 facts.
  for (const fact of before) if (!current.has(fact.key)) operations.push({ kind: "forget", key: fact.key });
  for (const fact of after) {
    const prior = previous.get(fact.key);
    if (fact.sources.length && JSON.stringify(fact.sources) !== JSON.stringify(prior?.sources ?? [])) throw new Error("MEMORY_SOURCES_READ_ONLY");
    if (!fact.sources.length || prior?.value !== fact.value) operations.push({ kind: "remember", key: fact.key, value: fact.value, source });
  }
  if (operations.length > 16) throw new Error("MEMORY_BATCH_LIMIT");
  return operations;
}

// One instance belongs to one agent run. Only files survive between calls;
// environment, cwd, shell functions and variables are reset by each exec.
// sources='[]' marks an explicit write, including an unchanged value. Other
// source arrays must match the prior fact. The trusted host assigns provenance.
export class AgentWorkspace {
  private readonly fs: InMemoryFs;
  private readonly commandFs: WorkspaceFileSystem;
  private readonly shell: Bash;
  private tail: Promise<unknown> = Promise.resolve();
  private terminal: Error | undefined;
  private calls = 0;
  private userSql: UserSql | undefined;
  private loaded: { state: WorkspaceState; runtime: ChatMemoryRuntime; facts: MemoryFact[]; database: Uint8Array; summary: string } | undefined;
  private readonly receipts = new Map<string, { commandHash: string; epoch: number; result: WorkspaceResult }>();
  private constructor(private readonly persistence: WorkspacePersistence, private readonly source: string, documents: { path: string; contents: string }[]) {
    const assetBytes = documents.reduce((total, document) => total + Buffer.byteLength(document.contents), 0);
    this.fs = new InMemoryFs(Object.fromEntries(documents.map(document => [document.path, document.contents])), { maxTotalBytes: assetBytes + 2 * 1024 * 1024 });
    this.commandFs = new WorkspaceFileSystem(this.fs);
    this.shell = new Bash({
      fs: this.commandFs, cwd: "/work", env: CLEAN_ENV,
      customCommands: [defineCommand("sqlite3", async (args, context) => {
        const result = await context.origCommand!(args);
        if (this.userSql && result.exitCode === 0) {
          try {
            if (sqliteDeletesFacts(args, decodeBytesToUtf8(context.stdin), database => context.fs.resolvePath(context.cwd, database))) this.userSql.deletion = true;
          } catch (cause) { this.userSql.failure = cause; throw cause; }
        }
        return result;
      })],
      python: false, javascript: false, executionLimitProfile: "hardened",
      defenseInDepth: { enabled: true, excludeViolationTypes: process.env.NODE_ENV === "development" ? ["performance_timing", "weak_ref", "error_prepare_stack_trace"] : [] },
      executionLimits: {
        maxSourceBytes: 16 * 1024, maxExecutionTimeMs: 10_000, maxSqliteTimeoutMs: 5000,
        maxDatabaseBytes: 256 * 1024, maxDatabaseResultBytes: 256 * 1024,
        // Trusted fact validation can read all 64 facts; agent results are
        // separately clipped to OUTPUT_BYTES after exec.
        maxOutputSize: MEMORY_SQL_OUTPUT_BYTES, maxCommandCount: 1024, maxLoopIterations: 1024,
        maxTraversalEntries: 2048, maxTraversalDepth: 64, maxFileDescriptors: 32,
      },
    });
  }
  static async create(options: { persistence: WorkspacePersistence; source: string }): Promise<AgentWorkspace> {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(options.source)) throw new Error("INVALID_MEMORY_SOURCE");
    const documents = (await Promise.all(SUPPORTED_PORTS.map(loadPortTariffDocuments))).flat();
    const workspace = new AgentWorkspace(options.persistence, options.source, documents);
    for (const directory of ["/memory", "/scratchpad", "/tmp", "/work"]) await workspace.fs.mkdir(directory, { recursive: true });
    return workspace;
  }
  static ephemeral() {
    const state: WorkspaceState = { epoch: 0, revision: 0, scratchpadRevision: 0, image: null, scratchpad: "" };
    return AgentWorkspace.create({ source: "ephemeral", persistence: {
      restore: async () => state,
      persist: async ({ operations, scratchpad }) => {
        if (operations.length || scratchpad !== undefined) throw new Error("MEMORY_DISABLED");
        return state;
      },
    } });
  }
  private async restore(state: WorkspaceState) {
    if (this.loaded && this.loaded.state.epoch !== state.epoch) {
      // A privacy barrier also removes temporary copies of forgotten facts.
      for (const directory of ["/tmp", "/work"]) {
        await this.fs.rm(directory, { recursive: true, force: true });
        await this.fs.mkdir(directory);
      }
      this.receipts.clear();
    }
    if (this.loaded?.state.image === state.image && this.loaded.state.scratchpad === state.scratchpad) {
      this.loaded.state = { ...state };
      return this.loaded;
    }
    const runtime = await ChatMemoryRuntime.restore(state.image, { shell: this.shell, fs: this.fs });
    await this.fs.rm(SCRATCHPAD_PATH, { recursive: true, force: true });
    await runtime.workingNotes(state.scratchpad);
    const summary = await runtime.summary();
    this.loaded = { state: { ...state }, runtime, facts: await runtime.facts(), database: (await this.fs.readFileBuffer(MEMORY_DATABASE_PATH)).slice(), summary };
    return this.loaded;
  }
  private async rollback(loaded: NonNullable<AgentWorkspace["loaded"]>) {
    // Only trusted canonical bytes are copied. This path needs no SQL worker,
    // so cancellation can restore durable mounts without another shell exec.
    for (const [path, contents] of [
      [MEMORY_DATABASE_PATH, loaded.database], [SCRATCHPAD_PATH, loaded.state.scratchpad],
      ["/memory/summary.md", loaded.summary],
    ] as const) {
      await this.fs.rm(path, { recursive: true, force: true });
      await this.fs.writeFile(path, contents);
    }
  }
  private async durable<T>(action: () => Promise<T>) {
    try { return await action(); }
    catch (cause) {
      this.terminal = new Error("WORKSPACE_PERSISTENCE_FAILED", { cause });
      throw this.terminal;
    }
  }
  bash(input: { command: string }, toolCallId?: string, abortSignal?: AbortSignal): Promise<WorkspaceResult> {
    const next = this.tail.then(() => this.execute(input.command, toolCallId, abortSignal));
    this.tail = next.catch(() => undefined);
    return next;
  }
  private async execute(command: string, toolCallId?: string, signal?: AbortSignal): Promise<WorkspaceResult> {
    if (this.terminal) throw this.terminal;
    if (signal?.aborted) {
      this.terminal = new Error("WORKSPACE_CANCELLED", { cause: signal.reason });
      throw this.terminal;
    }
    if (++this.calls > 64) throw new Error("WORKSPACE_CALL_LIMIT");
    if (typeof command !== "string" || !command.trim() || Buffer.byteLength(command) > 16 * 1024) return { stdout: "", stderr: "WORKSPACE_COMMAND_LIMIT", exitCode: 2 };
    const commandHash = createHash("sha256").update(command).digest("hex");
    const invocation = { toolCallId, commandHash, signal };
    const state = await this.durable(() => this.persistence.restore(signal));
    if (this.loaded && this.loaded.state.epoch !== state.epoch) {
      await this.durable(() => this.restore(state));
      this.terminal = new Error("MEMORY_CHANGED");
      throw this.terminal;
    }
    const replay = await this.durable(async () => this.persistence.replay?.(invocation) ?? null);
    if (replay) return bounded(replay);
    const priorReceipt = toolCallId ? this.receipts.get(toolCallId) : undefined;
    if (priorReceipt) {
      if (priorReceipt.epoch !== state.epoch) throw new Error("MEMORY_CHANGED");
      if (priorReceipt.commandHash !== commandHash) throw new Error("WORKSPACE_TOOL_CALL_CONFLICT");
      return { ...priorReceipt.result };
    }
    const loaded = await this.durable(() => this.restore(state));
    const { runtime, facts: before } = loaded;
    let result: WorkspaceResult;
    let operations: MemoryOperation[] = [];
    let scratchpad: string | undefined;
    try {
      this.commandFs.clearViolation();
      const userSql: UserSql = { deletion: false };
      this.userSql = userSql;
      try { result = bounded(await this.shell.exec(command, { replaceEnv: true, env: CLEAN_ENV, cwd: "/work", signal, rawScript: true })); }
      finally { this.userSql = undefined; }
      signal?.throwIfAborted();
      if (userSql.failure) throw userSql.failure;
      // Some shell commands intentionally swallow filesystem errors (rm -f).
      // A denied mutation still rejects the whole invocation.
      this.commandFs.assertNoViolation();
      if (result.exitCode === 0) {
        let after = before;
        const editedDatabase = await this.fs.readFileBuffer(MEMORY_DATABASE_PATH);
        if (!Buffer.from(loaded.database).equals(editedDatabase)) {
          await runtime.validateDatabase();
          after = await runtime.facts({ allowUnattributed: true });
          operations = factDiff(before, after, this.source);
        }
        if (userSql.deletion && !operations.some(operation => operation.kind === "forget" || operation.kind === "clear")) {
          // An absent-key DELETE still requests a privacy barrier. Choose a
          // host-owned absent key so existing forget semantics preserve facts.
          const keys = new Set([...before, ...after].map(fact => fact.key));
          let suffix = 0;
          while (keys.has(`workspace_delete_barrier_${suffix}`)) suffix++;
          operations.unshift(after.length ? { kind: "forget", key: `workspace_delete_barrier_${suffix}` } : { kind: "clear" });
          if (operations.length > 16) throw new Error("MEMORY_BATCH_LIMIT");
        }
        const notes = await this.fs.readFile(SCRATCHPAD_PATH);
        if (Buffer.byteLength(notes) > 6000 || notes.includes("\0")) throw new Error("INVALID_NOTES");
        scratchpad = notes === state.scratchpad ? undefined : notes;
        const deletion = operations.some(operation => operation.kind === "forget" || operation.kind === "clear");
        if (scratchpad !== undefined && deletion) throw new Error("MEMORY_DELETE_WITH_NOTES");
        if (deletion) result = { stdout: "", stderr: "", exitCode: 0 };
      }
    } catch (cause) {
      if (signal?.aborted) {
        this.terminal = new Error("WORKSPACE_CANCELLED", { cause });
        await this.rollback(loaded);
        throw this.terminal;
      }
      result = bounded({ stdout: "", stderr: `Workspace changes discarded: ${cause instanceof Error ? cause.message : "WORKSPACE_VALIDATION_FAILED"}`, exitCode: 1 });
      operations = [];
      scratchpad = undefined;
    }
    // Rebuild durable mounts from the last canonical state even on success:
    // client-edited SQLite bytes are never exported or persisted.
    await this.durable(() => this.rollback(loaded));
    const canonical = await this.durable(() => this.persistence.persist({ ...invocation,
      baseline: { epoch: state.epoch, revision: state.revision, scratchpadRevision: state.scratchpadRevision },
      operations, scratchpad, result,
    }));
    await this.durable(() => this.restore(canonical));
    if (toolCallId) this.receipts.set(toolCallId, { commandHash, epoch: canonical.epoch, result: { ...result } });
    return result;
  }
}
