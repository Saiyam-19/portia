/** Shared explicit deployment/auth gate. */
export function portiaEnabled(): boolean {
  const deployment = process.env.PORTIA_CONVEX_DEPLOYMENT;
  return Boolean(deployment && /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(deployment) &&
    process.env.PORTIA_ENABLED === "true" && process.env.CONVEX_SITE_URL === `https://${deployment}.convex.site`);
}
export function requirePortiaEnabled(): void {
  if (!portiaEnabled()) throw new Error("Portia runtime is disabled or deployment configuration is invalid.");
}
export function basicAuthEnabled(): boolean { return process.env.PORTIA_AUTH_MODE === "basic"; }
function allowedEmails(): Set<string> {
  return new Set((process.env.PORTIA_ALLOWED_EMAILS ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean));
}
export function isAllowedEmail(email: unknown): boolean {
  if (!portiaEnabled()) return false;
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  return Boolean(normalized && (basicAuthEnabled() ? !normalized.endsWith(".invalid") : allowedEmails().has(normalized)));
}
/** Constant-time comparison for the Next.js server's shared secret. */
export function hasServerSecret(supplied: string | null | undefined): boolean {
  const expected = process.env.PORTIA_SERVER_SECRET ?? "";
  if (expected.length < 32 || typeof supplied !== "string" || supplied.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) mismatch |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  return mismatch === 0;
}
