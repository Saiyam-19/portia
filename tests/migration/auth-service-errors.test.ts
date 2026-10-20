import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MigrationTokenManager } from "../../src/lib/migration/bridge";
import { AuthTokenError } from "../../src/lib/migration/auth-errors";
import { GET as memory } from "../../src/app/api/memory/route";
import { POST as chat } from "../../src/app/api/migration/chat/route";

beforeEach(() => {
  vi.stubEnv("MIGRATION_DEV_ENABLED", "true"); vi.stubEnv("PORTIA_MEMORY_ENABLED", "true");
  vi.stubEnv("PORTIA_CONVEX_DEPLOYMENT", "brilliant-whale-380");
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://brilliant-whale-380.convex.cloud");
  vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://brilliant-whale-380.convex.site");
  vi.stubEnv("SITE_URL", "http://localhost:3002"); vi.stubEnv("PORTIA_SERVER_SECRET", "x".repeat(32));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each([[401,401],[403,403],[429,429],[500,503],[503,503]])("preserves token-service %s as public %s without exposing upstream text", async (upstream, expected) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("private upstream details", { status: upstream, headers: { "Retry-After": "47" } })));
  const manager = new MigrationTokenManager("test-cookie", "http://localhost:3002", new AbortController());
  const failure = await manager.initialize().catch(error => error);
  expect(failure).toBeInstanceOf(AuthTokenError); expect(failure.statusCode).toBe(expected); expect(failure.message).not.toContain("private upstream");
  expect(failure.retryAfter).toBe("47"); manager.stop();
});

it.each(["memory", "chat"])("does not turn token-service throttling into a logout for %s", async target => {
  const fetch = vi.fn(async () => new Response("private upstream details", { status: 429, headers: { "Retry-After": "31" } })); vi.stubGlobal("fetch", fetch);
  const headers = { cookie: "test-cookie", origin: "http://localhost:3002", "content-type": "application/json" };
  const response = target === "memory" ? await memory(new Request("http://localhost:3002/api/memory", { headers }))
    : await chat(new Request("http://localhost:3002/api/chat", { method: "POST", headers, body: JSON.stringify({ kind: "question", question: "Synthetic request", conversationId: null, expectedRevision: null, requestId: "3a7a501d-e02b-4af8-84ee-501f0e6ee59d", modelAlias: "model-1" }) }));
  expect(response.status).toBe(429); expect(response.headers.get("Retry-After")).toBe("31");
  const body = await response.text(); expect(body).toContain("busy"); expect(body).not.toMatch(/Sign in|Unauthenticated|private upstream/);
  expect(fetch).toHaveBeenCalledTimes(1);
});
