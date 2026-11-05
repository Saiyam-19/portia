import { createFxAgent, type FxAgentEvent, type FxHookEvent } from "libfx/node";
import type { PublicEvent } from "../chat/contracts";
import { createMockFetch } from "./mock-model";
import { customProvider, MODEL_IDS, modelMode, type ModelMode } from "./models";
import { ndjsonLines, TurnFold, type StreamLine } from "./projection";
import { buildTurnInput, INSTRUCTIONS, type FormReply, type MemoryContext } from "./prompt";
import type { AgentStore, TurnUsage } from "./store";
import { createTools, type ToolScope } from "./tools";
import { createTransport, UsageLedger } from "./transport";
import type { FilesContext } from '../artifacts/shared';

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type Durability = NonNullable<Parameters<typeof createFxAgent>[0]>["durability"];
type Agent = ReturnType<typeof createFxAgent>;

/** A turn's model-call ceiling; the hook cancels a session that goes past it. */
export const MAX_MODEL_CALLS = 24;
/** How long a reconnecting reader waits for a line of its turn before giving up. */
const RECONNECT_IDLE_MS = 30_000;
/** libfx diagnostics worth a server log line: retries, failures, takeovers and deadlines. */
const LOGGED_DIAGNOSTICS = new Set<FxAgentEvent["type"]>([
  "transport.retry", "transport.error", "journal.error", "checkpoint.error",
  "session.error", "session.fenced", "session.refused", "session.deadline", "ui.error",
]);

export type Claim = {
  turnId: string;
  requestId: string;
  conversationId: string;
  ownerId: string;
  fxSessionId: string | null;
  modelAlias: keyof typeof MODEL_IDS;
  message: string | null;
  form: FormReply["form"];
  formResponse: FormReply["response"] | null;
  memoryContext: MemoryContext | null;
  filesContext?: FilesContext | null;
};

export type AgentDeps = {
  store: AgentStore;
  durability?: Durability;
  /** Where shaped model requests go. Defaults to OpenRouter or the mock, per `PORTIA_MODEL_MODE`. */
  upstream?: Fetch;
  /** Keeps background work alive after the response is returned, such as Next's `after()`. */
  waitUntil?: (work: Promise<unknown>) => void;
  env?: Record<string, string | undefined>;
  log?: (message: string, detail?: unknown) => void;
  /** libfx agent name; sessions only run on agents with the name that created them. */
  name?: string;
};

class UsageTracker {
  private readonly turns = new Map<string, TurnUsage>();
  add(turnId: string, usage: Omit<TurnUsage, "modelCalls">) {
    const total = this.turns.get(turnId) ?? { modelCalls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    total.modelCalls += 1;
    total.inputTokens += usage.inputTokens;
    total.outputTokens += usage.outputTokens;
    total.cacheReadTokens += usage.cacheReadTokens;
    total.cacheWriteTokens += usage.cacheWriteTokens;
    this.turns.set(turnId, total);
    if (this.turns.size > 256) this.turns.delete(this.turns.keys().next().value!);
  }
  take(turnId: string) {
    const usage = this.turns.get(turnId);
    this.turns.delete(turnId);
    return usage;
  }
}

async function* untilIdle(lines: AsyncGenerator<StreamLine>, matches: (line: StreamLine) => boolean, idleMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const idle = () => new Promise<"idle">(resolve => { timer = setTimeout(() => resolve("idle"), idleMs); });
  let deadline = idle();
  try {
    while (true) {
      const next = await Promise.race([lines.next(), deadline]);
      if (next === "idle" || next.done) return;
      if (matches(next.value)) {
        clearTimeout(timer);
        deadline = idle();
      }
      yield next.value;
    }
  } finally {
    clearTimeout(timer);
    await lines.return(undefined);
  }
}

/**
 * Berthwise's agent: one libfx agent per process, holding the model-facing
 * history in durable sessions, plus the projection that mirrors each turn into
 * the app's database for display.
 */
export class BerthwiseAgent {
  readonly fx: Agent;
  readonly mode: ModelMode;
  private readonly store: AgentStore;
  private readonly usage = new UsageTracker();
  private readonly ledger = new UsageLedger();
  private readonly modelCalls = new Map<string, number>();
  /** Messages in each session's last agent request: history only shrinks when it is compacted. */
  private readonly historySize = new Map<string, number>();
  /** Turns whose projection a reader in this process is already folding. */
  private readonly folding = new Set<string>();
  private readonly waitUntil: (work: Promise<unknown>) => void;
  private readonly log: (message: string, detail?: unknown) => void;

  constructor(deps: AgentDeps) {
    const env = deps.env ?? process.env;
    this.store = deps.store;
    this.mode = modelMode(env);
    this.waitUntil = deps.waitUntil ?? (work => void work);
    this.log = deps.log ?? ((message, detail) => console.error(`[agent] ${message}`, detail ?? ""));
    const upstream = deps.upstream ?? (this.mode === "mock" ? createMockFetch({ chunkDelayMs: Number(env.PORTIA_MOCK_DELAY_MS ?? 12) }) : fetch);
    this.fx = createFxAgent({
      name: deps.name ?? "berthwise",
      model: MODEL_IDS["model-1"],
      instructions: INSTRUCTIONS,
      tools: createTools({ store: deps.store }),
      provider: customProvider(env),
      credentials: () => ({ apiKey: this.mode === "mock" ? "mock" : env.OPENROUTER_API_KEY! }),
      fetch: createTransport({ upstream, ledger: this.ledger }),
      ...(deps.durability ? { durability: deps.durability } : {}),
      onEvent: (event: FxAgentEvent) => {
        if (LOGGED_DIAGNOSTICS.has(event.type)) this.log(`libfx ${event.type}`, event);
      },
      hooks: {
        onEvent: event => this.observe(event),
        onError: error => this.log("hook failed", error),
      },
    } as Parameters<typeof createFxAgent>[0]);
  }

  private observe(event: FxHookEvent) {
    const turnId = event.turnId;
    switch (event.type) {
      case "model.start": {
        // libfx compacts small histories without a model call, so a shrinking history is the reliable signal.
        const previous = this.historySize.get(event.sessionId);
        if (event.data.purpose === "agent") {
          this.historySize.set(event.sessionId, event.data.messageCount);
          if (this.historySize.size > 512) this.historySize.delete(this.historySize.keys().next().value!);
        }
        if (event.data.purpose === "compaction" || (event.data.purpose === "agent" && previous !== undefined && event.data.messageCount < previous)) {
          // The summary replaced the memory snapshot the history carried; resend it next turn.
          void this.store.markCompacted(event.sessionId).catch(error => this.log("markCompacted failed", error));
        }
        if (event.data.purpose === "agent" && turnId) {
          const calls = (this.modelCalls.get(turnId) ?? 0) + 1;
          this.modelCalls.set(turnId, calls);
          if (calls > MAX_MODEL_CALLS) void this.fx.session(event.sessionId).cancel().catch(() => undefined);
        }
        return;
      }
      case "model.end": {
        if (event.data.error && !event.data.cancelled) {
          this.log("model call failed", { sessionId: event.sessionId, turnId, provider: event.data.provider, finishReason: event.data.finishReason, error: event.data.error });
        }
        if (!turnId) return;
        const recorded = this.ledger.take(event.data.generationId);
        const reported = event.data.usage;
        this.usage.add(turnId, recorded ?? {
          inputTokens: reported?.inputTokens ?? 0,
          outputTokens: reported?.outputTokens ?? 0,
          cacheReadTokens: reported?.cacheReadTokens ?? 0,
          cacheWriteTokens: reported?.cacheWriteTokens ?? 0,
        });
        return;
      }
      case "turn.end": {
        if (!turnId) return;
        this.modelCalls.delete(turnId);
        const outcome = event.data.outcome;
        if (event.data.error) this.log(`turn ${outcome}`, { sessionId: event.sessionId, turnId, error: event.data.error });
        // A turn this process ran without a reader (a queue delivery, a resumed turn) still needs its projection closed.
        if (!this.folding.has(turnId) && outcome !== "yielded" && outcome !== "paused" && outcome !== "fenced") {
          this.waitUntil(this.reconcile(event.sessionId, turnId));
        }
        return;
      }
    }
  }

  /** Starts a claimed turn and returns its public NDJSON event stream. */
  async start(claim: Claim): Promise<ReadableStream<Uint8Array>> {
    const sessionId = claim.fxSessionId ?? await this.fx.newSessionId();
    if (!claim.fxSessionId) await this.store.attachSession(claim.turnId, sessionId);
    const scope: ToolScope = { ownerId: claim.ownerId, conversationId: claim.conversationId };
    const session = this.fx.session(sessionId, { model: MODEL_IDS[claim.modelAlias], context: scope });
    const input = buildTurnInput({
      today: new Date().toISOString().slice(0, 10),
      memory: claim.memoryContext,
      files: claim.filesContext,
      message: claim.message,
      formReply: claim.formResponse ? { form: claim.form, response: claim.formResponse } : null,
    });
    const turn = session.prompt(input, { messageId: claim.requestId });
    try {
      await turn.accepted;
    } catch (error) {
      this.log("prompt rejected", error);
      await this.store.finishTurn({ turnId: claim.turnId, status: "error", segments: [], error: "Couldn't start the response. Try again shortly." });
      throw error;
    }
    return this.relay(ndjsonLines(turn.readable), claim.requestId, claim.turnId);
  }

  /** Follows a running turn from the session's stored stream, from any process. */
  reconnect(target: { fxSessionId: string; requestId: string; turnId: string }): ReadableStream<Uint8Array> {
    const lines = ndjsonLines(this.fx.session(target.fxSessionId).stream(0));
    return this.relay(untilIdle(lines, line => line.messageId === target.requestId, RECONNECT_IDLE_MS), target.requestId, target.turnId);
  }

  async cancel(fxSessionId: string) {
    await this.fx.session(fxSessionId).cancel();
  }

  /** Closes the projection of a turn that ended in a process with no reader. */
  private async reconcile(fxSessionId: string, messageId: string) {
    try {
      const running = await this.store.runningTurn(fxSessionId);
      if (!running || running.requestId !== messageId) return;
      const stream = this.reconnect({ fxSessionId, requestId: messageId, turnId: running.turnId });
      await stream.pipeTo(new WritableStream());
    } catch (error) {
      this.log("reconcile failed", error);
    }
  }

  /**
   * Folds a turn's lines into its projection while forwarding public events to
   * the browser. The fold keeps going if the browser leaves, so the projection
   * still closes; a stream that ends without `turn_end` (the turn moved to another
   * invocation) leaves the turn running for a reconnect or that worker to close.
   */
  private relay(lines: AsyncGenerator<StreamLine>, messageId: string, turnId: string): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const fold = new TurnFold(messageId);
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    let open = true;
    const output = new ReadableStream<Uint8Array>({
      start: c => { controller = c; },
      cancel: () => { open = false; },
    });
    const send = (event: PublicEvent) => {
      if (!open) return;
      try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); } catch { open = false; }
    };
    send({ type: "start", requestId: messageId });
    const work = (async () => {
      this.folding.add(messageId);
      try {
        for await (const line of lines) {
          for (const event of fold.push(line)) send(event);
          if (fold.end) break;
        }
        if (fold.end) {
          await this.store.finishTurn({ turnId, segments: fold.segments, ...fold.end, usage: this.usage.take(messageId) });
        }
      } catch (error) {
        this.log("relay failed", error);
      } finally {
        this.folding.delete(messageId);
        if (open) { open = false; try { controller.close(); } catch { /* already closed */ } }
      }
    })();
    this.waitUntil(work);
    return output;
  }
}
