import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasServerSecret, isAllowedEmail, portiaEnabled } from "../../convex/lib/gate";

describe("Convex deployment gate", () => {
  beforeEach(() => {
    vi.stubEnv("PORTIA_ENABLED", "true");
    vi.stubEnv("PORTIA_CONVEX_DEPLOYMENT", "brilliant-whale-380");
    vi.stubEnv("CONVEX_SITE_URL", "https://brilliant-whale-380.convex.site");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("fails closed when the flag is absent or the deployment differs", () => {
    expect(portiaEnabled()).toBe(true);
    vi.stubEnv("PORTIA_ENABLED", "");
    expect(portiaEnabled()).toBe(false);
    vi.stubEnv("PORTIA_ENABLED", "true");
    vi.stubEnv("CONVEX_SITE_URL", "https://other.convex.site");
    expect(portiaEnabled()).toBe(false);
  });

  it("admits allowlisted emails in private mode and fresh ones in basic mode", () => {
    vi.stubEnv("PORTIA_ALLOWED_EMAILS", "First@Example.com, second@example.com");
    expect(isAllowedEmail("first@example.com")).toBe(true);
    expect(isAllowedEmail("fresh@example.com")).toBe(false);
    vi.stubEnv("PORTIA_AUTH_MODE", "basic");
    expect(isAllowedEmail("fresh@example.com")).toBe(true);
    expect(isAllowedEmail("synthetic@example.invalid")).toBe(false);
  });

  it("accepts only the exact server secret of at least 32 characters", () => {
    vi.stubEnv("PORTIA_SERVER_SECRET", "short");
    expect(hasServerSecret("short")).toBe(false);
    vi.stubEnv("PORTIA_SERVER_SECRET", "k".repeat(32));
    expect(hasServerSecret("k".repeat(32))).toBe(true);
    expect(hasServerSecret("k".repeat(31) + "j")).toBe(false);
    expect(hasServerSecret(undefined)).toBe(false);
  });
});
