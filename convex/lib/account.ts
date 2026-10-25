import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import { authComponent } from "../auth";
import { isAllowedEmail, isMigrationDevEnabled } from "./migrationGate";

/** The signed-in account that owns company data (one login is one company in v1), or null. */
export async function accountOwner(ctx: QueryCtx): Promise<string | null> {
  if (!isMigrationDevEnabled()) return null;
  const user = await authComponent.safeGetAuthUser(ctx);
  return user && isAllowedEmail(user.email) ? String(user._id) : null;
}

export function fail(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

export async function requireAccount(ctx: QueryCtx): Promise<string> {
  return await accountOwner(ctx) ?? fail("UNAUTHENTICATED", "Sign in required.");
}
