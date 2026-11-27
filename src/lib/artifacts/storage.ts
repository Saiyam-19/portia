import 'server-only';
import { UTApi, UTFile } from 'uploadthing/server';
import { ArtifactError, MAX_MARKDOWN_BYTES } from './shared';

export function uploadthing() {
  if (!process.env.UPLOADTHING_TOKEN) throw new ArtifactError('File uploads are not configured. Add UPLOADTHING_TOKEN on the server.');
  return new UTApi({ token: process.env.UPLOADTHING_TOKEN });
}

export async function signedFileUrl(key: string) {
  return (await uploadthing().generateSignedURL(key, { expiresIn: 300 })).ufsUrl;
}

/** Bounded reads, including when the upstream omits Content-Length. */
export async function readStoredFile(key: string, limit: number): Promise<Uint8Array> {
  const response = await fetch(await signedFileUrl(key), { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) throw new ArtifactError('Could not read the stored file. Please retry.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new ArtifactError('Stored file exceeds the supported size.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return new Uint8Array(Buffer.concat(chunks, size));
}

export async function readStoredMarkdown(key: string) {
  return new TextDecoder('utf-8', { fatal: true }).decode(await readStoredFile(key, MAX_MARKDOWN_BYTES));
}

export async function storeMarkdown(id: string, revision: number, markdown: string) {
  const result = await uploadthing().uploadFiles(new UTFile([markdown], `${id}-${revision}.md`, { type: 'text/markdown' }));
  if (result.error || !result.data) throw new ArtifactError('Could not save the Markdown copy. Please retry.');
  return result.data.key;
}

export async function deleteStoredFiles(keys: string[]) {
  if (!keys.length) return;
  const result = await uploadthing().deleteFiles([...new Set(keys)]);
  if (!result.success) throw new ArtifactError('Could not delete the stored files. Please retry deletion.');
}
