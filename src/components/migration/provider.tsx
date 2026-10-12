"use client";

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { ConvexReactClient } from "convex/react";
import { type ComponentProps, useMemo } from "react";
import { migrationAuthClient } from "@/lib/migration/auth-client";

export function MigrationProvider({
  children,
  initialToken,
}: {
  children: React.ReactNode;
  initialToken?: string | null;
}) {
  const client = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) throw new Error("Migration Convex URL is not configured.");
    return new ConvexReactClient(url, { initialAuthTokenReuse: true });
  }, []);
  const providerAuthClient = migrationAuthClient as unknown as ComponentProps<
    typeof ConvexBetterAuthProvider
  >["authClient"];

  return (
    <ConvexBetterAuthProvider
      client={client}
      authClient={providerAuthClient}
      initialToken={initialToken}
    >
      {children}
    </ConvexBetterAuthProvider>
  );
}
