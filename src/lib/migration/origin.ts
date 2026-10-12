import "server-only";

/** Trust the configured public origin, not Next's internal/proxied request URL. */
export function trustedMigrationOrigin(request: Request): string | null {
  try {
    if (!process.env.SITE_URL) return null;
    const expected = new URL(process.env.SITE_URL).origin;
    return request.headers.get("origin") === expected ? expected : null;
  } catch {
    return null;
  }
}
