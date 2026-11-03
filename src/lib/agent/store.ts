import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { FormDefinition } from "../chat/contracts";

export type Segment =
  | { type: "text"; text: string }
  | { type: "tool"; id: string; name: string; status: "running" | "done" | "error" }
  | { type: "form"; form: FormDefinition };

export type TurnUsage = { modelCalls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };

export type FinishedTurn = {
  turnId: string;
  status: "completed" | "waiting" | "cancelled" | "error";
  segments: Segment[];
  form?: FormDefinition;
  error?: string;
  usage?: TurnUsage;
};

export type WorkspaceState = { version: number; files: Array<{ path: string; content: string }>; notes: string };
export type WorkspaceCommit = {
  conversationId: string;
  ownerId: string;
  expectedVersion: number;
  upserts: Array<{ path: string; content: string }>;
  deletes: string[];
  notes?: string;
};

/** Everything the agent runtime reads from or writes to the app's database. */
export interface AgentStore {
  attachSession(turnId: string, fxSessionId: string): Promise<void>;
  finishTurn(turn: FinishedTurn): Promise<void>;
  markCompacted(fxSessionId: string): Promise<void>;
  runningTurn(fxSessionId: string): Promise<{ turnId: string; requestId: string } | null>;
  workspaceState(conversationId: string, ownerId: string): Promise<WorkspaceState | null>;
  commitWorkspace(commit: WorkspaceCommit): Promise<{ ok: true; version: number } | { ok: false; reason: string }>;
}

/** Convex over HTTP, authorized by the server secret: tools and queue workers run without a user session. */
export function convexStore(options: { convexUrl: string; secret: string }): AgentStore {
  const client = new ConvexHttpClient(options.convexUrl);
  const secret = options.secret;
  const turnId = (id: string) => id as Id<"turns">;
  const conversationId = (id: string) => id as Id<"conversations">;
  return {
    async attachSession(id, fxSessionId) { await client.mutation(api.agent.attachSession, { secret, turnId: turnId(id), fxSessionId }); },
    async finishTurn(turn) {
      await client.mutation(api.agent.finishTurn, { secret, ...turn, turnId: turnId(turn.turnId) });
    },
    async markCompacted(fxSessionId) { await client.mutation(api.agent.markCompacted, { secret, fxSessionId }); },
    async runningTurn(fxSessionId) { return await client.query(api.agent.runningTurn, { secret, fxSessionId }); },
    async workspaceState(id, ownerId) { return await client.query(api.agent.workspaceState, { secret, conversationId: conversationId(id), ownerId }); },
    async commitWorkspace(commit) {
      return await client.mutation(api.agent.commitWorkspace, { secret, ...commit, conversationId: conversationId(commit.conversationId) });
    },
  };
}
