import { cancelRequestSchema } from "@/lib/migration/contracts";
import { callMigrationBridge, MigrationTokenManager } from "@/lib/migration/bridge";
import { abortMigrationRun } from "@/lib/migration/run-registry";
import { migrationPreviewEnabled } from "@/lib/migration/config";
import { trustedMigrationOrigin } from "@/lib/migration/origin";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!migrationPreviewEnabled()) return new Response("Not found", { status: 404 });
  const origin = trustedMigrationOrigin(request);
  if (!origin) {
    return Response.json({ error: "Cross-origin request denied." }, { status: 403 });
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 4_000) {
    return Response.json({ error: "Invalid cancel request." }, { status: 400 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid cancel request." }, { status: 400 });
  }
  const parsed = cancelRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid cancel request." }, { status: 400 });

  const controller = new AbortController();
  const manager = new MigrationTokenManager(
    request.headers.get("cookie") ?? "",
    origin,
    controller,
  );
  try {
    await manager.initialize();
    const cancelled = await callMigrationBridge<boolean>(manager, {
      op: "cancel",
      args: { runId: parsed.data.runId },
    });
    if (cancelled) abortMigrationRun(parsed.data.runId);
    return Response.json({ cancelled }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Unable to stop this run." }, { status: 409 });
  } finally {
    manager.stop();
  }
}
