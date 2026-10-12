"use client";
import QueryBoundary from "./query-boundary";
import { useEffect } from "react";
import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";
import { migrationAuthClient } from "@/lib/migration/auth-client";
import { Button } from "@/components/ui/button";
export default function SessionGate({ userId, children }: { userId: string; children: React.ReactNode }) {
  const session = migrationAuthClient.useSession();
  const auth = useConvexAuth();
  const router = useRouter();
  const matching = session.data?.user.id === userId;
  useEffect(() => {
    if (!session.isPending && !matching && !session.error) { router.replace('/login'); router.refresh(); }
  }, [matching, session.isPending, session.error, router]);
  const failed = Boolean(session.error) || (!session.isPending && matching && !auth.isLoading && !auth.isAuthenticated);
  if (failed) return <div role="alert" className="grid h-dvh place-content-center gap-4 px-6 text-center text-sm">
    <p>Couldn’t reconnect your secure session.</p>
    <p className="text-muted-foreground">Your saved conversations and memories are still available. Try connecting again.</p>
    <div className="flex justify-center gap-3"><Button onClick={() => window.location.reload()}>Retry connection</Button><Button variant="outline" onClick={() => void migrationAuthClient.signOut().then(({error}) => { if (!error) { router.replace('/login'); router.refresh(); } }).catch(() => undefined)}>Sign out</Button></div>
  </div>;
  if (session.isPending || auth.isLoading || !matching || !auth.isAuthenticated) return <div role="status" className="grid h-dvh place-items-center text-sm text-muted-foreground">Connecting secure session…</div>;
  return <QueryBoundary key={userId}>{children}</QueryBoundary>;
}
