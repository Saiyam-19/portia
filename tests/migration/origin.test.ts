import { afterEach, describe, expect, it, vi } from "vitest";
import { trustedMigrationOrigin } from "../../src/lib/migration/origin";

describe("migration public origin through a proxy", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts the configured browser origin despite Next's internal hostname", () => {
    vi.stubEnv("SITE_URL", "http://127.0.0.1:3002");
    expect(trustedMigrationOrigin(new Request("http://localhost:3002/api/migration/chat", {
      headers: { origin: "http://127.0.0.1:3002" },
    }))).toBe("http://127.0.0.1:3002");
  });

  it("rejects a forged host, foreign origin, or absent origin", () => {
    vi.stubEnv("SITE_URL", "http://127.0.0.1:3002");
    expect(trustedMigrationOrigin(new Request("http://attacker.invalid/api/migration/chat", {
      headers: { origin: "http://attacker.invalid", host: "127.0.0.1:3002" },
    }))).toBeNull();
    expect(trustedMigrationOrigin(new Request("http://127.0.0.1:3002/api/migration/chat"))).toBeNull();
  });

  it("fails closed without a valid configured origin", () => {
    vi.stubEnv("SITE_URL", "");
    const request = new Request("http://localhost:3002", { headers: { origin: "http://localhost:3002" } });
    expect(trustedMigrationOrigin(request)).toBeNull();
    vi.stubEnv("SITE_URL", "invalid");
    expect(trustedMigrationOrigin(request)).toBeNull();
  });
});
