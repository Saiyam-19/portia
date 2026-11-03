import "server-only";
import path from "node:path";
import { after } from "next/server";
import { local } from "libfx/durable-local";
import { vercel } from "libfx/durable-vercel";
import { serverConfig } from "../config";
import { BerthwiseAgent } from "./agent";
import { convexStore } from "./store";

let instance: BerthwiseAgent | null = null;

/** Keeps a turn's projection work alive past the response when called within a request. */
function waitUntil(work: Promise<unknown>) {
  try { after(() => work); } catch { /* outside a request, as in a hook: the work just runs */ }
}

/**
 * The process's agent. Sessions are durable: in Vercel's World on Vercel, in files
 * under .fx/sessions elsewhere, so a turn survives a restart and any instance can
 * stream or cancel it.
 */
export function berthwiseAgent(): BerthwiseAgent {
  if (instance) return instance;
  const config = serverConfig();
  instance = new BerthwiseAgent({
    store: convexStore({ convexUrl: config.convexUrl, secret: config.serverSecret }),
    durability: process.env.VERCEL
      ? vercel()
      : local({ dir: process.env.FX_SESSIONS_DIR ?? path.join(process.cwd(), ".fx", "sessions") }),
    waitUntil,
  });
  return instance;
}
