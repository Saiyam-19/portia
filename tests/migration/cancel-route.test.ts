import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  registerMigrationRun,
  unregisterMigrationRun,
} from "../../src/lib/migration/run-registry";

const bridge = vi.hoisted(() => ({ cancelled: false }));

vi.mock("@/lib/migration/config", () => ({ migrationPreviewEnabled: () => true }));
vi.mock("@/lib/migration/bridge", () => ({
  MigrationTokenManager: class {
    async initialize() {}
    stop() {}
  },
  callMigrationBridge: async () => bridge.cancelled,
}));

import { POST } from "../../src/app/api/migration/cancel/route";

const runId = "victim-run";

function request() {
  return new Request("http://localhost:3002/api/migration/cancel", {
    method: "POST",
    headers: {
      origin: "http://localhost:3002",
      cookie: "portia-migration.session=attacker",
      "content-type": "application/json",
    },
    body: JSON.stringify({ runId }),
  });
}

describe("migration cancel route", () => {
  beforeEach(() => vi.stubEnv("SITE_URL", "http://localhost:3002"));
  afterEach(() => {
    unregisterMigrationRun(runId);
    vi.unstubAllEnvs();
  });

  it("does not abort another local run when durable owner cancellation is denied", async () => {
    bridge.cancelled = false;
    const victim = new AbortController();
    registerMigrationRun(runId, victim);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ cancelled: false });
    expect(victim.signal.aborted).toBe(false);
  });

  it("aborts the local provider only after durable owner cancellation succeeds", async () => {
    bridge.cancelled = true;
    const owned = new AbortController();
    registerMigrationRun(runId, owned);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ cancelled: true });
    expect(owned.signal.aborted).toBe(true);
  });
});
