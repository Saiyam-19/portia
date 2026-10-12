import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const migrationAuthClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [convexClient()],
});
