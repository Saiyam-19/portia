import "server-only";
import { api } from "../../../convex/_generated/api";
import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";
import { migrationPreviewEnabled, migrationServerConfig } from "./config";

type Helpers = ReturnType<typeof convexBetterAuthNextJs>;
let cachedHelpers: Helpers | null = null;

function helpers(): Helpers {
  if (cachedHelpers) return cachedHelpers;
  const config = migrationServerConfig();
  cachedHelpers = convexBetterAuthNextJs({
    convexUrl: config.convexUrl,
    convexSiteUrl: config.convexSiteUrl,
    basePath: "/api/auth",
    cookiePrefix: "portia-migration",
  });
  return cachedHelpers;
}

const disabled = () => new Response("Not found", { status: 404 });

export const migrationAuthHandler = {
  GET: (request: Request) =>
    migrationPreviewEnabled() ? helpers().handler.GET(request) : disabled(),
  POST: (request: Request) =>
    migrationPreviewEnabled() ? helpers().handler.POST(request) : disabled(),
};

export async function getMigrationToken(): Promise<string | undefined> {
  if (!migrationPreviewEnabled()) return undefined;
  return await helpers().getToken();
}

export async function isMigrationAuthenticated(): Promise<boolean> {
  if (!migrationPreviewEnabled()) return false;
  return await helpers().isAuthenticated();
}

export async function getCurrentUser() {
  if (!migrationPreviewEnabled()) return null;
  return helpers().fetchAuthQuery(api.auth.getCurrentUser, {});
}
