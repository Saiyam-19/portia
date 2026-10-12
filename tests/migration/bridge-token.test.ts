import { afterEach, describe, expect, it, vi } from "vitest";
import { MigrationTokenManager } from "../../src/lib/migration/bridge";

function token(sub: string, sessionId: string, expiresInSeconds: number) {
  const payload = Buffer.from(JSON.stringify({
    sub,
    sessionId,
    exp: Math.floor(Date.now() / 1_000) + expiresInSeconds,
  })).toString("base64url");
  return `header.${payload}.signature`;
}

function okToken(value: string) {
  return new Response(JSON.stringify({ token: value }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("migration token refresh", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function configure() {
    vi.stubEnv("MIGRATION_DEV_ENABLED", "true");
    vi.stubEnv("PORTIA_CONVEX_DEPLOYMENT", "brilliant-whale-380");
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://brilliant-whale-380.convex.cloud");
    vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://brilliant-whale-380.convex.site");
    vi.stubEnv("SITE_URL", "http://localhost:3002");
    vi.stubEnv("PORTIA_SERVER_SECRET", "x".repeat(32));
  }

  it("rejects a freshly fetched token whose remaining lifetime is too short", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn(async () => okToken(token("user-a", "session-a", 180))));
    const manager = new MigrationTokenManager("cookie=value", "http://localhost:3002", new AbortController());
    await expect(manager.initialize()).rejects.toThrow(/lifetime is too short/);
  });

  it("rejects a refresh that changes principal", async () => {
    configure();
    const responses = [token("user-a", "session-a", 900), token("user-b", "session-b", 900)];
    vi.stubGlobal("fetch", vi.fn(async () => okToken(responses.shift()!)));
    const manager = new MigrationTokenManager("cookie=value", "http://localhost:3002", new AbortController());
    await manager.initialize();
    await expect(manager.refresh()).rejects.toThrow(/principal changed/);
    manager.stop();
  });

  it("aborts an active run when periodic refresh fails", async () => {
    configure();
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okToken(token("user-a", "session-a", 900)))
      .mockResolvedValueOnce(new Response("denied", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const manager = new MigrationTokenManager("cookie=value", "http://localhost:3002", controller);
    await manager.initialize();
    await vi.advanceTimersByTimeAsync(45_000);
    expect(controller.signal.aborted).toBe(true);
    manager.stop();
  });
});
