import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { Infer } from "convex/values";
import { claimView } from "../convex/validators";
import { MemoryRuntime, type Operation } from "./runtime.ts";
export type Claim = Exclude<Infer<typeof claimView>, null>;
export class MemoryClient {
  readonly http: ConvexHttpClient;
  constructor(url: string, token: string, readonly workerSecret?: string) {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1") throw new Error("PROTOTYPE_LOCAL_ONLY");
    this.http = new ConvexHttpClient(url);
    this.http.setAuth(token);
  }
  create(workspace: string) { return this.http.mutation(api.memory.create, { workspace }); }
  read(namespaceId: Id<"namespaces">) { return this.http.query(api.memory.read, { namespaceId }); }
  async enqueue(namespaceId: Id<"namespaces">, requestId: string, operation: Operation, expectedEpoch?: number) {
    const epoch = expectedEpoch ?? (await this.read(namespaceId)).epoch;
    return this.http.mutation(api.memory.enqueue, { namespaceId, requestId, operation, expectedEpoch: epoch });
  }
  claim(namespaceId: Id<"namespaces">, leaseMs = 30_000) {
    if (!this.workerSecret) throw new Error("WORKER_REQUIRED");
    return this.http.mutation(api.memory.claim, { namespaceId, workerSecret: this.workerSecret, leaseMs });
  }
  publish(namespaceId: Id<"namespaces">, claim: Claim, bytes: ArrayBuffer) {
    if (!this.workerSecret) throw new Error("WORKER_REQUIRED");
    return this.http.mutation(api.memory.publish, {
      namespaceId, workerSecret: this.workerSecret, token: claim.token, fence: claim.fence,
      baseRevision: claim.baseRevision, through: claim.through, bytes,
    });
  }
  async flush(namespaceId: Id<"namespaces">, timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const claim = await this.claim(namespaceId);
      if (!claim) {
        const current = await this.read(namespaceId);
        if (!current.pending) return current.revision;
        await new Promise(r => setTimeout(r, 30 + Math.random() * 40));
        continue;
      }
      try {
        const runtime = await MemoryRuntime.restore(claim.bytes);
        await runtime.apply(claim.operations);
        await this.http.mutation(api.memory.renew, {
          namespaceId, workerSecret: this.workerSecret!, token: claim.token,
          fence: claim.fence, baseRevision: claim.baseRevision,
        });
        await this.publish(namespaceId, claim, await runtime.checkpoint());
      } catch (error) {
        if (!String(error).includes("STALE_WRITER")) throw error;
        // Nothing from a stale workspace is reused. Rehydrate and replay the durable queue.
      }
    }
    throw new Error("FLUSH_TIMEOUT");
  }
}
