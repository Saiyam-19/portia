import { MemoryClient } from "../src/client.ts";
import { MemoryRuntime } from "../src/runtime.ts";
import type { Id } from "../convex/_generated/dataModel";
const input = JSON.parse(process.env.MEMORY_CHILD_INPUT!);
const client = new MemoryClient(process.env.MEMORY_URL!, process.env.MEMORY_JWT!, process.env.MEMORY_WORKER_SECRET!);
const namespaceId = input.namespaceId as Id<"namespaces">;
const send = (message: unknown) => process.send?.(message);
if (input.mode === "read") {
  const state = await client.read(namespaceId);
  const runtime = await MemoryRuntime.restore(state.bytes);
  send({ type: "result", facts: await runtime.recall(), summary: await runtime.readFile("/memory/summary.md"),
    scratchpad: input.scratchpad ? await runtime.readFile("/scratchpads/" + input.scratchpad + ".md") : null });
} else if (input.mode === "pause") {
  const claim = await client.claim(namespaceId, 1600);
  if (!claim) throw new Error("NO_CLAIM");
  const runtime = await MemoryRuntime.restore(claim.bytes);
  await runtime.apply(claim.operations);
  await runtime.checkpoint();
  send({ type: "staged", fence: claim.fence });
  // Harness deliberately terminates this process before publication.
  await new Promise<void>(resolve => process.once("message", () => resolve()));
} else {
  send({ type: "ready" });
  await new Promise<void>(resolve => process.once("message", () => resolve()));
  for (const item of input.operations) await client.enqueue(namespaceId, item.requestId, item.operation);
  await client.flush(namespaceId);
  send({ type: "result" });
}
process.disconnect?.();
