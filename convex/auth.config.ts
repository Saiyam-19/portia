import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import type { AuthConfig } from "convex/server";
import { isMigrationDevEnabled } from "./lib/migrationGate";

export default {
  providers: isMigrationDevEnabled()
    ? [getAuthConfigProvider({ basePath: "/api/auth" })]
    : [],
} satisfies AuthConfig;
