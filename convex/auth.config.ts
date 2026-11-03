import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import type { AuthConfig } from "convex/server";
import { portiaEnabled } from "./lib/gate";

export default {
  providers: portiaEnabled()
    ? [getAuthConfigProvider({ basePath: "/api/auth" })]
    : [],
} satisfies AuthConfig;
