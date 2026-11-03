import "server-only";
import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";
import { api } from "../../../convex/_generated/api";
import { portiaEnabled, serverConfig } from "../config";

type Helpers = ReturnType<typeof convexBetterAuthNextJs>;
let cachedHelpers: Helpers | null = null;

/** Better Auth helpers bound to the signed-in user's cookies, for routes and server components. */
export function authHelpers(): Helpers {
  if (cachedHelpers) return cachedHelpers;
  const config = serverConfig();
  cachedHelpers = convexBetterAuthNextJs({
    convexUrl: config.convexUrl,
    convexSiteUrl: config.convexSiteUrl,
    basePath: "/api/auth",
    cookiePrefix: "portia-migration",
  });
  return cachedHelpers;
}

const disabled = () => new Response("Not found", { status: 404 });

export const authHandler = {
  GET: (request: Request) => portiaEnabled() ? authHelpers().handler.GET(request) : disabled(),
  POST: (request: Request) => portiaEnabled() ? authHelpers().handler.POST(request) : disabled(),
};

export async function getAuthToken(): Promise<string | undefined> {
  if (!portiaEnabled()) return undefined;
  return await authHelpers().getToken();
}

export async function isAuthenticated(): Promise<boolean> {
  if (!portiaEnabled()) return false;
  return await authHelpers().isAuthenticated();
}

export async function getCurrentUser() {
  if (!portiaEnabled()) return null;
  return authHelpers().fetchAuthQuery(api.auth.getCurrentUser, {});
}
