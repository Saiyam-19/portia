import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ after: () => { throw new Error("outside a request"); } }));

let dir = "";
const load = async () => {
  vi.resetModules(); // a dev reload: Next evaluates the module again in the same process
  return (await import("../../src/lib/agent/server")).berthwiseAgent;
};

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "portia-agent-"));
  vi.stubEnv("PORTIA_ENABLED", "true");
  vi.stubEnv("PORTIA_CONVEX_DEPLOYMENT", "brilliant-whale-380");
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://brilliant-whale-380.convex.cloud");
  vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://brilliant-whale-380.convex.site");
  vi.stubEnv("SITE_URL", "http://localhost:3001");
  vi.stubEnv("PORTIA_SERVER_SECRET", "x".repeat(32));
  vi.stubEnv("PORTIA_MODEL_MODE", "mock");
  vi.stubEnv("FX_SESSIONS_DIR", dir);
});

afterAll(async () => {
  const slot = globalThis as { __berthwiseAgent?: { agent: Promise<{ fx: { close(): Promise<void> } }> } };
  await (await slot.__berthwiseAgent?.agent)?.fx.close();
  delete slot.__berthwiseAgent;
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

describe("the process's agent", () => {
  it("is shared within one module evaluation", async () => {
    const berthwiseAgent = await load();
    const [a, b] = await Promise.all([berthwiseAgent(), berthwiseAgent()]);
    expect(a).toBe(b);
  });

  it("replaces the previous evaluation's agent instead of clashing with it", async () => {
    const first = await (await load())();
    const close = vi.spyOn(first.fx, "close");
    // The new evaluation builds its agent from fresh closures, which libfx sees as another configuration.
    const second = await (await load())();
    expect(second).not.toBe(first);
    expect(close).toHaveBeenCalledOnce();
  });
});
