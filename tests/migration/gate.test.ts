import { afterEach, describe, expect, it, vi } from "vitest";
import { isMigrationDevEnabled } from "../../convex/lib/migrationGate";

describe("migration deployment gate", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("fails closed when the flag is absent", () => {
    vi.stubEnv("MIGRATION_DEV_ENABLED", "");
    vi.stubEnv("CONVEX_SITE_URL", "https://brilliant-whale-380.convex.site");
    expect(isMigrationDevEnabled()).toBe(false);
  });

  it("fails closed on a different deployment", () => {
    vi.stubEnv("MIGRATION_DEV_ENABLED", "true");
    vi.stubEnv("PORTIA_CONVEX_DEPLOYMENT", "brilliant-whale-380");
    vi.stubEnv("CONVEX_SITE_URL", "https://other.convex.site");
    expect(isMigrationDevEnabled()).toBe(false);
  });
});

import { isAllowedEmail } from '../../convex/lib/migrationGate';
it('basic mode accepts fresh addresses but keeps synthetic .invalid accounts private', () => {
  vi.stubEnv('PORTIA_AUTH_MODE','basic');
  expect(isAllowedEmail('fresh@example.com')).toBe(true);
  expect(isAllowedEmail('synthetic@example.invalid')).toBe(false);
  vi.unstubAllEnvs();
});
