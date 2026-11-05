/** Shared limits and display types; this module contains no credentials or storage client. */
export const MAX_FILE_BYTES = 16 * 1024 * 1024;
export const MAX_MARKDOWN_BYTES = 256 * 1024;
export const MAX_TURN_ATTACHMENTS = 4;
export const MAX_CONVERSATION_FILES = 20;
export const ARTIFACT_ACCEPT = '.md,.txt,.csv,.json,.pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp,.gif,.mp3,.wav,.m4a,.ogg';

export type ArtifactRef = { id: string; name: string; mimeType: string; size: number; revision: number };
export type FilesContext = { files: ArtifactRef[]; removed: string[] };
export type MountedArtifact = ArtifactRef & { markdownKey: string };
export const artifactPath = (id: string) => `/files/${id}.md`;
export class ArtifactError extends Error {}

const EXTENSIONS = new Set(ARTIFACT_ACCEPT.split(',').map(value => value.slice(1)));
export function fileExtension(name: string) { return name.split('.').at(-1)?.toLowerCase() ?? ''; }
export function uploadError(file: { name: string; size: number }): string | null {
  if (!file.name.trim() || file.name.length > 180 || /[\x00-\x1f/\\]/.test(file.name)) return 'Use a filename of 1–180 characters without slashes.';
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_FILE_BYTES) return 'Files must be nonempty and at most 16 MB.';
  if (!EXTENSIONS.has(fileExtension(file.name))) return 'Supported: PDF, DOCX, XLSX, Markdown, text, CSV, JSON, images and audio.';
  return null;
}
export function fileSize(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
