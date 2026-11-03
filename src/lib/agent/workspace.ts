import { Bash, InMemoryFs } from "just-bash";
import { MEMORY_PATH, memorySetError, notesError } from "../../../convex/lib/memory";
import { loadPortTariffDocuments, SUPPORTED_PORTS } from "../maritime/ports";
import type { AgentStore, WorkspaceState } from "./store";
import { MEMORY_DIR, NOTES_PATH, WorkspaceFileSystem } from "./workspace-fs";

export type BashResult = { stdout: string; stderr: string; exitCode: number };

const OUTPUT_BYTES = 16 * 1024;
const CLEAN_ENV = { HOME: "/work", TMPDIR: "/tmp", PATH: "/usr/bin:/bin", LANG: "C.UTF-8" };

let portDocuments: Promise<Array<{ path: string; contents: string }>> | null = null;
function ports() {
  portDocuments ??= Promise.all(SUPPORTED_PORTS.map(loadPortTariffDocuments)).then(sets => sets.flat());
  return portDocuments;
}

function bounded(result: BashResult): BashResult {
  const clip = (text: string, bytes: number) => Buffer.from(text).subarray(0, Math.max(0, bytes)).toString("utf8").replace(/�$/, "");
  const marker = Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) > OUTPUT_BYTES ? "\n[Output truncated; narrow the query.]" : "";
  const available = OUTPUT_BYTES - Buffer.byteLength(marker);
  const stdout = clip(result.stdout, available);
  return { stdout, stderr: clip(result.stderr, available - Buffer.byteLength(stdout)) + marker, exitCode: result.exitCode };
}

const sameState = (a: WorkspaceState | undefined, b: WorkspaceState) => Boolean(a && a.version === b.version && a.notes === b.notes &&
  a.files.length === b.files.length && a.files.every(file => b.files.some(other => other.path === file.path && other.content === file.content)));

/**
 * One conversation's shell. /ports holds the bundled tariffs; /memories mirrors the
 * owner's saved memory files and /notes/current.md the conversation's notes, both
 * re-read from the database before every command so changes made elsewhere show up.
 * After a successful command, edits under /memories and /notes are diffed and
 * committed in one compare-and-set write; anything rejected is rolled back.
 * Scratch files in /work and /tmp last as long as this process keeps the workspace.
 */
export class ConversationWorkspace {
  private readonly fs: InMemoryFs;
  private readonly commandFs: WorkspaceFileSystem;
  private readonly shell: Bash;
  private tail: Promise<unknown> = Promise.resolve();
  private synced: WorkspaceState | undefined;

  private constructor(private readonly options: { store: AgentStore; conversationId: string; ownerId: string }, documents: Array<{ path: string; contents: string }>) {
    const assetBytes = documents.reduce((total, document) => total + Buffer.byteLength(document.contents), 0);
    this.fs = new InMemoryFs(Object.fromEntries(documents.map(document => [document.path, document.contents])), { maxTotalBytes: assetBytes + 2 * 1024 * 1024 });
    this.commandFs = new WorkspaceFileSystem(this.fs);
    this.shell = new Bash({
      fs: this.commandFs, cwd: "/work", env: CLEAN_ENV,
      python: false, javascript: false, executionLimitProfile: "hardened",
      defenseInDepth: { enabled: true, excludeViolationTypes: process.env.NODE_ENV === "production" ? [] : ["performance_timing", "weak_ref", "error_prepare_stack_trace"] },
      executionLimits: {
        maxSourceBytes: 16 * 1024, maxExecutionTimeMs: 10_000, maxOutputSize: 256 * 1024,
        maxCommandCount: 1024, maxLoopIterations: 1024, maxTraversalEntries: 2048, maxTraversalDepth: 64, maxFileDescriptors: 32,
      },
    });
  }

  static async create(options: { store: AgentStore; conversationId: string; ownerId: string }) {
    const workspace = new ConversationWorkspace(options, await ports());
    for (const directory of [MEMORY_DIR, "/notes", "/tmp", "/work"]) await workspace.fs.mkdir(directory, { recursive: true });
    return workspace;
  }

  bash(command: string, signal?: AbortSignal): Promise<BashResult> {
    const next = this.tail.then(() => this.execute(command, signal));
    this.tail = next.catch(() => undefined);
    return next;
  }

  /** Rewrites /memories and /notes from canonical state, discarding uncommitted edits. */
  private async sync(state: WorkspaceState) {
    await this.fs.rm(MEMORY_DIR, { recursive: true, force: true });
    await this.fs.mkdir(MEMORY_DIR, { recursive: true });
    for (const file of state.files) {
      const path = `${MEMORY_DIR}/${file.path}`;
      await this.fs.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
      await this.fs.writeFile(path, file.content);
    }
    await this.fs.rm(NOTES_PATH, { force: true });
    if (state.notes) await this.fs.writeFile(NOTES_PATH, state.notes);
    this.synced = { ...state, files: [...state.files] };
  }

  private async readMemoryFiles() {
    const files: Array<{ path: string; content: string }> = [];
    const invalid: string[] = [];
    for (const path of this.fs.getAllPaths().filter(path => path.startsWith(`${MEMORY_DIR}/`)).sort()) {
      if ((await this.fs.stat(path)).isDirectory) continue;
      const relative = path.slice(MEMORY_DIR.length + 1);
      if (!MEMORY_PATH.test(relative)) invalid.push(path);
      else files.push({ path: relative, content: await this.fs.readFile(path) });
    }
    return { files, invalid };
  }

  private async execute(command: string, signal?: AbortSignal): Promise<BashResult> {
    const { store, conversationId, ownerId } = this.options;
    if (!command.trim() || Buffer.byteLength(command) > 16 * 1024) return { stdout: "", stderr: "Commands must be 1 byte to 16 KiB.", exitCode: 2 };
    const state = await store.workspaceState(conversationId, ownerId);
    if (!state) return { stdout: "", stderr: "This conversation no longer exists.", exitCode: 1 };
    if (!sameState(this.synced, state)) await this.sync(state);

    let result: BashResult;
    this.commandFs.clearViolation();
    try {
      result = bounded(await this.shell.exec(command, { replaceEnv: true, env: CLEAN_ENV, cwd: "/work", signal, rawScript: true }));
      this.commandFs.assertNoViolation();
    } catch (cause) {
      await this.sync(state);
      signal?.throwIfAborted();
      return { stdout: "", stderr: `Command rejected: ${cause instanceof Error ? cause.message : "workspace error"}. Nothing was saved.`, exitCode: 1 };
    }

    const { files, invalid } = await this.readMemoryFiles();
    const notes = await this.fs.exists(NOTES_PATH) ? await this.fs.readFile(NOTES_PATH) : "";
    const before = new Map(state.files.map(file => [file.path, file.content]));
    const upserts = files.filter(file => before.get(file.path) !== file.content);
    const deletes = [...before.keys()].filter(path => !files.some(file => file.path === path));
    const notesChanged = notes !== state.notes;
    if (!upserts.length && !deletes.length && !notesChanged && !invalid.length) return result;

    const reject = async (reason: string) => {
      await this.sync(state);
      return { ...result, stderr: `${result.stderr}${result.stderr ? "\n" : ""}Not saved: ${reason}`, exitCode: result.exitCode || 1 };
    };
    if (result.exitCode !== 0) return reject("the command failed, so changes to /memories and /notes were discarded.");
    if (invalid.length) return reject(`invalid memory file name ${invalid.join(", ")}. Use lowercase .md names such as /memories/profile.md, at most one folder deep.`);
    const problem = memorySetError(files) ?? (notesChanged ? notesError(notes) : null);
    if (problem) return reject(problem);
    const committed = await store.commitWorkspace({
      conversationId, ownerId, expectedVersion: state.version, upserts, deletes, ...(notesChanged ? { notes } : {}),
    });
    if (!committed.ok) return reject(committed.reason);
    this.synced = { version: committed.version, files, notes };
    return result;
  }
}

const workspaces = new Map<string, Promise<ConversationWorkspace>>();

/** Reuses a conversation's workspace within this process so scratch files persist between commands. */
export function conversationWorkspace(store: AgentStore, conversationId: string, ownerId: string) {
  const key = `${ownerId}:${conversationId}`;
  let workspace = workspaces.get(key);
  if (workspace) workspaces.delete(key);
  else workspace = ConversationWorkspace.create({ store, conversationId, ownerId });
  workspaces.set(key, workspace);
  if (workspaces.size > 16) workspaces.delete(workspaces.keys().next().value!);
  workspace.catch(() => workspaces.delete(key));
  return workspace;
}
