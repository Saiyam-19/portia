import "server-only";
import path from "node:path";
import { after } from "next/server";
import { local } from "libfx/durable-local";
import { vercel } from "libfx/durable-vercel";
import { serverConfig } from "../config";
import { BerthwiseAgent } from "./agent";
import { convexStore } from "./store";

/**
 * libfx keeps one agent per name per process, while Next re-evaluates this module
 * on every dev reload or env change. So the agent lives on `globalThis`, tagged with
 * the evaluation that made it: in development a new evaluation closes the old agent
 * (letting its running turns finish) before making its own, so edits and env changes
 * apply; in production a process evaluates it once and every route shares the agent.
 */
const generation = process.env.NODE_ENV === "production" ? "production" : crypto.randomUUID();
const slot = globalThis as typeof globalThis & {
  __berthwiseAgent?: { generation: string; agent: Promise<BerthwiseAgent> };
};

/** Keeps a turn's projection work alive past the response when called within a request. */
function waitUntil(work: Promise<unknown>) {
  try { after(() => work); } catch { /* outside a request, as in a hook: the work just runs */ }
}

/**
 * The process's agent. Sessions are durable: in Vercel's World on Vercel, in files
 * under .fx/sessions elsewhere, so a turn survives a restart and any instance can
 * stream or cancel it.
 */
export function berthwiseAgent(): Promise<BerthwiseAgent> {
  const current = slot.__berthwiseAgent;
  if (current?.generation === generation) return current.agent;
  const agent = (async () => {
    if (current) await current.agent.then(previous => previous.fx.close(), () => undefined);
    return createAgent();
  })();
  slot.__berthwiseAgent = { generation, agent };
  // A failed start is not cached, so the next request tries again.
  agent.catch(() => { if (slot.__berthwiseAgent?.agent === agent) delete slot.__berthwiseAgent; });
  return agent;
}

function createAgent(): BerthwiseAgent {
  const config = serverConfig();
  return new BerthwiseAgent({
    store: convexStore({ convexUrl: config.convexUrl, secret: config.serverSecret }),
    durability: process.env.VERCEL
      ? vercel()
      : local({ dir: process.env.FX_SESSIONS_DIR ?? path.join(process.cwd(), ".fx", "sessions") }),
    waitUntil,
  });
}
