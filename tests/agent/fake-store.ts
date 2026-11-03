import { contentHash, memorySetError } from "../../convex/lib/memory";
import type { AgentStore, FinishedTurn, WorkspaceCommit } from "../../src/lib/agent/store";

/** An in-memory AgentStore with the same semantics as the Convex functions it stands in for. */
export class FakeStore implements AgentStore {
  memory = new Map<string, string>();
  version = 0;
  notes = new Map<string, string>();
  sessions = new Map<string, string>();
  running = new Map<string, { turnId: string; requestId: string }>();
  finished: FinishedTurn[] = [];
  compacted: string[] = [];
  commits: WorkspaceCommit[] = [];

  async attachSession(turnId: string, fxSessionId: string) { this.sessions.set(turnId, fxSessionId); }
  async finishTurn(turn: FinishedTurn) {
    if (this.finished.some(item => item.turnId === turn.turnId)) return;
    this.finished.push(turn);
    for (const [session, running] of this.running) if (running.turnId === turn.turnId) this.running.delete(session);
  }
  async markCompacted(fxSessionId: string) { this.compacted.push(fxSessionId); }
  async runningTurn(fxSessionId: string) { return this.running.get(fxSessionId) ?? null; }
  async workspaceState(conversationId: string) {
    return { version: this.version, files: [...this.memory].map(([path, content]) => ({ path, content })), notes: this.notes.get(conversationId) ?? "" };
  }
  async commitWorkspace(commit: WorkspaceCommit) {
    this.commits.push(commit);
    if (commit.notes !== undefined) this.notes.set(commit.conversationId, commit.notes);
    if (!commit.upserts.length && !commit.deletes.length) return { ok: true as const, version: this.version };
    if (commit.expectedVersion !== this.version) return { ok: false as const, reason: "Saved memory changed elsewhere." };
    const next = new Map(this.memory);
    for (const path of commit.deletes) next.delete(path);
    for (const file of commit.upserts) next.set(file.path, file.content);
    const error = memorySetError([...next].map(([path, content]) => ({ path, content })));
    if (error) return { ok: false as const, reason: error };
    this.memory = next;
    this.version += 1;
    return { ok: true as const, version: this.version };
  }
  digest() { return [...this.memory].map(([path, content]) => ({ path, hash: contentHash(content) })); }
}
