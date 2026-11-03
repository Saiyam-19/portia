import { afterEach, describe, expect, it, vi } from "vitest";
import { trustedOrigin } from "../../src/lib/auth/origin";

describe("public origin through a proxy", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts the configured browser origin despite Next's internal hostname", () => {
    vi.stubEnv("SITE_URL", "http://127.0.0.1:3002");
    expect(trustedOrigin(new Request("http://localhost:3002/api/chat", {
      headers: { origin: "http://127.0.0.1:3002" },
    }))).toBe("http://127.0.0.1:3002");
  });

  it("rejects a forged host, foreign origin, or absent origin", () => {
    vi.stubEnv("SITE_URL", "http://127.0.0.1:3002");
    expect(trustedOrigin(new Request("http://attacker.invalid/api/chat", {
      headers: { origin: "http://attacker.invalid", host: "127.0.0.1:3002" },
    }))).toBeNull();
    expect(trustedOrigin(new Request("http://127.0.0.1:3002/api/chat"))).toBeNull();
  });

  it("fails closed without a valid configured origin", () => {
    vi.stubEnv("SITE_URL", "");
    const request = new Request("http://localhost:3002", { headers: { origin: "http://localhost:3002" } });
    expect(trustedOrigin(request)).toBeNull();
    vi.stubEnv("SITE_URL", "invalid");
    expect(trustedOrigin(request)).toBeNull();
  });
});
