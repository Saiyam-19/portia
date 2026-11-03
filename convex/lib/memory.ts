/** Limits and helpers shared by the Convex memory store and the agent workspace. */
const MEMORY_LIMITS = {
  files: 32,
  fileBytes: 4_096,
  totalBytes: 32_768,
  notesBytes: 8_000,
} as const;

/** `profile.md` or `vessels/mv-example.md`: lowercase, at most one directory level. */
export const MEMORY_PATH = /^[a-z0-9][a-z0-9_-]{0,47}(?:\/[a-z0-9][a-z0-9_-]{0,47})?\.md$/;

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/** FNV-1a 64-bit: a stable content fingerprint usable in queries, mutations and Node. */
export function contentHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

export function memoryFileError(path: string, content: string): string | null {
  if (!MEMORY_PATH.test(path)) return `Invalid memory path '${path}'. Use lowercase names like profile.md or vessels/name.md.`;
  if (!content.trim()) return `Memory file '${path}' is empty; delete it instead.`;
  if (content.includes("\0")) return `Memory file '${path}' contains binary data.`;
  if (utf8Bytes(content) > MEMORY_LIMITS.fileBytes) return `Memory file '${path}' exceeds ${MEMORY_LIMITS.fileBytes} bytes.`;
  return null;
}

export function memorySetError(files: ReadonlyArray<{ path: string; content: string }>): string | null {
  if (files.length > MEMORY_LIMITS.files) return `Memory is limited to ${MEMORY_LIMITS.files} files.`;
  const total = files.reduce((sum, file) => sum + utf8Bytes(file.content), 0);
  if (total > MEMORY_LIMITS.totalBytes) return `Memory is limited to ${MEMORY_LIMITS.totalBytes} bytes in total.`;
  for (const file of files) {
    const error = memoryFileError(file.path, file.content);
    if (error) return error;
  }
  return null;
}

export function notesError(content: string): string | null {
  if (content.includes("\0")) return "Notes contain binary data.";
  if (utf8Bytes(content) > MEMORY_LIMITS.notesBytes) return `Notes exceed ${MEMORY_LIMITS.notesBytes} bytes.`;
  return null;
}
