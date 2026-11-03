import "server-only";

/** Validated runtime configuration shared by auth, chat and agent routes. */
export function serverConfig() {
  const deployment = process.env.PORTIA_CONVEX_DEPLOYMENT;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  const serverSecret = process.env.PORTIA_SERVER_SECRET;
  const siteUrl = process.env.SITE_URL;
  if (process.env.PORTIA_ENABLED !== "true" || !deployment || !/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(deployment) ||
      convexUrl !== `https://${deployment}.convex.cloud` || convexSiteUrl !== `https://${deployment}.convex.site` ||
      !serverSecret || serverSecret.length < 32 || !siteUrl) {
    throw new Error("Portia runtime configuration is invalid.");
  }
  const site = new URL(siteUrl);
  if (site.origin !== siteUrl || (site.protocol !== "https:" && !(site.protocol === "http:" && ["localhost", "127.0.0.1"].includes(site.hostname)))) {
    throw new Error("SITE_URL must be an explicit HTTPS origin or local development origin.");
  }
  return { convexUrl, convexSiteUrl, serverSecret, siteUrl };
}

export function portiaEnabled(): boolean {
  try { serverConfig(); return true; } catch { return false; }
}
