import 'server-only';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { serverConfig } from '../config';
import { artifactMarkdown } from './markdown';
import { ArtifactError, MAX_FILE_BYTES } from './shared';
import { deleteStoredFiles, readStoredFile, storeMarkdown } from './storage';

export function artifactServer() {
  const config = serverConfig();
  return { client: new ConvexHttpClient(config.convexUrl), secret: config.serverSecret };
}

export async function processArtifact(artifactId: Id<'artifacts'>, ownerId: string, revision: number) {
  const { client, secret } = artifactServer();
  let markdownKey: string | undefined;
  try {
    const file = await client.query(api.artifacts.forServer, { secret, artifactId, ownerId });
    if (file.revision !== revision || file.status !== 'processing') return;
    const bytes = await readStoredFile(file.fileKey, MAX_FILE_BYTES);
    const markdown = await artifactMarkdown({ name: file.sourceName ?? file.name, mimeType: file.mimeType, bytes });
    markdownKey = await storeMarkdown(artifactId, revision, markdown);
    const saved = await client.mutation(api.artifacts.conversionResult, { secret, artifactId, ownerId, revision, markdownKey });
    if (!saved) { await deleteStoredFiles([markdownKey]); return; }
    if (file.retiredKeys?.length) {
      try {
        await deleteStoredFiles(file.retiredKeys);
        await client.mutation(api.artifacts.cleanedUp, { secret, artifactId, ownerId, keys: file.retiredKeys });
      } catch { console.error('[artifacts] Superseded files await cleanup on deletion', { artifactId }); }
    }
  } catch (error) {
    if (markdownKey) await deleteStoredFiles([markdownKey]).catch(() => undefined);
    // Only our own messages reach the UI; SDK/parser/provider payloads can contain private data.
    const safe = error instanceof ArtifactError ? error.message.slice(0, 500) : 'Could not create the text view. Check file storage and model configuration, then retry from Artifacts.';
    await client.mutation(api.artifacts.conversionResult, { secret, artifactId, ownerId, revision, error: safe });
  }
}
