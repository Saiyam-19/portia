import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { authHelpers } from '@/lib/auth/server';
import { errorResponse, guard, json } from '@/lib/chat/http';
import { artifactServer, processArtifact } from '@/lib/artifacts/server';
import { deleteStoredFiles, readStoredMarkdown, signedFileUrl } from '@/lib/artifacts/storage';

export const runtime = 'nodejs';
export const maxDuration = 300;
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const rejected = guard(request, { mutation: false });
  if (rejected) return rejected;
  try {
    const { id } = await context.params;
    const file = await authHelpers().fetchAuthQuery(api.artifacts.get, { artifactId: id as Id<'artifacts'> });
    if (file.status === 'deleting') return json({ error: 'This file is being deleted.' }, 404);
    if (!file.fileKey) return json({ error: 'The upload has not finished. Replace the file from Artifacts if it was interrupted.' }, 409);
    if (new URL(request.url).searchParams.get('view') === 'markdown') {
      if (!file.markdownKey || file.status !== 'ready') return json({ error: file.error ?? 'This file is still processing.' }, 409);
      return new Response(await readStoredMarkdown(file.markdownKey), { headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'private, no-store' } });
    }
    return new Response(null, { status: 302, headers: { location: await signedFileUrl(file.fileKey), 'cache-control': 'private, no-store' } });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, context: Context) {
  const rejected = guard(request, { mutation: true });
  if (rejected) return rejected;
  try {
    const artifactId = (await context.params).id as Id<'artifacts'>;
    const target = await authHelpers().fetchAuthMutation(api.artifacts.beginDelete, { artifactId });
    await deleteStoredFiles(target.keys);
    const { client, secret } = artifactServer();
    await client.mutation(api.artifacts.finishDelete, { secret, artifactId, ownerId: target.ownerId, revision: target.revision });
    return json({ deleted: true });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, context: Context) {
  const rejected = guard(request, { mutation: true });
  if (rejected) return rejected;
  try {
    const artifactId = (await context.params).id as Id<'artifacts'>;
    const target = await authHelpers().fetchAuthMutation(api.artifacts.retry, { artifactId });
    await processArtifact(artifactId, target.ownerId, target.revision);
    return json({ retried: true });
  } catch (error) { return errorResponse(error); }
}
