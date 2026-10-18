import "server-only";
import { localBackendTarget } from "./local-target";
export function migrationServerConfig() {
  const deployment = process.env.PORTIA_CONVEX_DEPLOYMENT;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  const serverSecret = process.env.PORTIA_SERVER_SECRET;
  const siteUrl = process.env.SITE_URL;
  if (!convexUrl || !convexSiteUrl || !deployment || !/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(deployment) ||
      (process.env.PORTIA_ENABLED !== "true" && process.env.MIGRATION_DEV_ENABLED !== "true") ||
      (process.env.PORTIA_LOCAL_BACKEND === "true" ? !localBackendTarget(process.env,convexUrl,convexSiteUrl) : (convexUrl !== `https://${deployment}.convex.cloud` || convexSiteUrl !== `https://${deployment}.convex.site`)) ||
      !serverSecret || serverSecret.length < 32 || !siteUrl) throw new Error("Portia runtime configuration is invalid.");
  const site = new URL(siteUrl);
  if (site.origin !== siteUrl || (site.protocol !== "https:" && !(site.protocol === "http:" && ["localhost", "127.0.0.1"].includes(site.hostname)))) throw new Error("SITE_URL must be an explicit HTTPS origin or local development origin.");
  return { convexUrl, convexSiteUrl, serverSecret, siteUrl };
}
export function migrationPreviewEnabled(): boolean { try { migrationServerConfig(); return true; } catch { return false; } }
