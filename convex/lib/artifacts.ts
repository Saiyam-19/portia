import { ConvexError } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { hasServerSecret, portiaEnabled } from './gate';
import { fail } from './chat';

export function requireArtifactServer(secret: string) {
  if (!portiaEnabled() || !hasServerSecret(secret)) throw new ConvexError({ code: 'FORBIDDEN', message: 'Server access denied.' });
}
export async function ownedArtifact(ctx: QueryCtx | MutationCtx, id: Id<'artifacts'>, ownerId: string) {
  const file = await ctx.db.get(id);
  if (!file || file.ownerId !== ownerId) fail('NOT_FOUND', 'File not found.');
  return file;
}
export function artifactRef(file: Doc<'artifacts'>) {
  return { id: file._id as string, name: file.name, mimeType: file.mimeType, size: file.size, revision: file.revision };
}
export function artifactView(file: Doc<'artifacts'>) {
  return { ...artifactRef(file), status: file.status, hasOriginal: !!file.fileKey, error: file.error ?? null, createdAt: file.createdAt, updatedAt: file.updatedAt };
}
export async function conversationArtifacts(ctx: QueryCtx | MutationCtx, conversation: Doc<'conversations'>) {
  const files = await Promise.all((conversation.artifactIds ?? []).map(id => ctx.db.get(id)));
  return files.filter((file): file is Doc<'artifacts'> => !!file && file.ownerId === conversation.ownerId && file.status === 'ready' && !!file.markdownKey);
}
