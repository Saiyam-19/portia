import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import type { BetterAuthOptions } from "better-auth/minimal";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";
import {
  isMigrationDevEnabled,
  isAllowedEmail,
  basicAuthEnabled,
} from "./lib/migrationGate";

const AUTH_BASE_PATH = "/api/auth";
const COOKIE_PREFIX = "portia-migration";
const siteUrl = process.env.SITE_URL;

export const authComponent = createClient<DataModel>(components.betterAuth);

function assertAuthRequestAllowed(path: string, email: unknown): void {
  if (!isMigrationDevEnabled()) {
    throw new APIError("SERVICE_UNAVAILABLE", {
      message: "Migration development preview is disabled.",
    });
  }
  if (path !== "/sign-up/email" && path !== "/sign-in/email") return;
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalized || !isAllowedEmail(normalized)) {
    throw new APIError("FORBIDDEN", {
      message: "This account is not allowed in the migration preview.",
    });
  }
}

function hasProvisioningSecret(supplied: string | null): boolean {
  const expected = process.env.PORTIA_SERVER_SECRET ?? "";
  if (expected.length < 32 || supplied?.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  }
  return mismatch === 0;
}

export const createAuthOptions = (ctx: GenericCtx<DataModel>) =>
  ({
    appName: "Plisto",
    baseURL: siteUrl,
    basePath: AUTH_BASE_PATH,
    secret: process.env.BETTER_AUTH_SECRET,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    advanced: { cookiePrefix: COOKIE_PREFIX },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30, customRules: { "/convex/jwks": false, "/convex/token": { window: 60, max: 120 }, "/sign-in/email": { window: 60, max: 8 }, "/sign-up/email": { window: 60, max: 4 } } },
    hooks: {
      before: createAuthMiddleware(async (hookCtx) => {
        assertAuthRequestAllowed(hookCtx.path, hookCtx.body?.email);
        if (
          hookCtx.path === "/sign-up/email" && !basicAuthEnabled() &&
          !hasProvisioningSecret(hookCtx.headers?.get("x-portia-provision-secret") ?? null)
        ) {
          throw new APIError("FORBIDDEN", {
            message: "Account provisioning is restricted.",
          });
        }
      }),
    },
    plugins: [
      convex({
        authConfig,
        options: { basePath: AUTH_BASE_PATH },
        jwt: { expirationSeconds: 15 * 60 },
      }),
    ],
  }) satisfies BetterAuthOptions;

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth(createAuthOptions(ctx));

const currentUserValidator = v.union(
  v.object({ id: v.string(), email: v.string(), name: v.string() }),
  v.null(),
);

export const getCurrentUser = query({
  args: {},
  returns: currentUserValidator,
  handler: async (ctx) => {
    if (!isMigrationDevEnabled()) return null;
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user || !isAllowedEmail(user.email)) return null;
    return { id: user._id, email: user.email, name: user.name };
  },
});
