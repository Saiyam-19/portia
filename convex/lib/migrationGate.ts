import { localBackendTarget } from "../../src/lib/migration/local-target";
/** Shared explicit deployment/auth gate. Legacy enable flag is accepted during rollout. */
export function isMigrationDevEnabled(): boolean {
  const deployment = process.env.PORTIA_CONVEX_DEPLOYMENT;
  return Boolean(deployment && /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(deployment) &&
    (process.env.PORTIA_ENABLED === "true" || process.env.MIGRATION_DEV_ENABLED === "true") &&
    (process.env.PORTIA_LOCAL_BACKEND === "true" ? localBackendTarget(process.env,process.env.CONVEX_CLOUD_URL,process.env.CONVEX_SITE_URL) : process.env.CONVEX_SITE_URL === `https://${deployment}.convex.site`));
}
export function requireMigrationDevEnabled(): void {
  if (!isMigrationDevEnabled()) throw new Error("Portia runtime is disabled or deployment configuration is invalid.");
}
export function basicAuthEnabled(): boolean { return process.env.PORTIA_AUTH_MODE === "basic"; }
export function migrationAllowedEmails(): Set<string> {
  if (!isMigrationDevEnabled()) return new Set();
  return new Set((process.env.MIGRATION_ALLOWED_EMAILS ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean));
}
export function isAllowedEmail(email: unknown): boolean {
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  return Boolean(normalized && (basicAuthEnabled() ? !normalized.endsWith(".invalid") : migrationAllowedEmails().has(normalized)));
}
export function requireAllowedMigrationEmail(email: unknown): void {
  if (!isAllowedEmail(email)) throw new Error("This account is not allowed.");
}
