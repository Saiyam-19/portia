import { wakeHandler } from "libfx/node";
import { berthwiseAgent } from "@/lib/agent/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Vercel Queues delivers libfx turns here: a turn that outlived its request, or
 * a prompt sent while another invocation held the session. The trigger in
 * vercel.json makes this route private to the queue.
 */
const handle = wakeHandler();

export async function POST(request: Request) {
  await berthwiseAgent();
  return handle(request);
}
