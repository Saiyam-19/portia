/** What a company may upload, shared by the upload screen and the Convex functions. */

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const MAX_DOCUMENTS = 200;

export const DOCUMENT_TYPES = {
  pdf: { mime: "application/pdf", label: "PDF" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "Excel" },
  csv: { mime: "text/csv", label: "CSV" },
  txt: { mime: "text/plain", label: "Text" },
  md: { mime: "text/markdown", label: "Text" },
} as const;
export type DocumentFormat = keyof typeof DOCUMENT_TYPES;

export const ACCEPT = Object.entries(DOCUMENT_TYPES).map(([extension, type]) => `.${extension},${type.mime}`).join(",");

/** The file's format from its name, or undefined when it isn't supported. */
export function documentFormat(fileName: string): DocumentFormat | undefined {
  const extension = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return extension && extension in DOCUMENT_TYPES ? extension as DocumentFormat : undefined;
}

export function uploadProblem(file: { name: string; size: number }): string | undefined {
  if (!documentFormat(file.name)) return `${file.name}: only PDF, Word (.docx), Excel (.xlsx), CSV and text files can be uploaded.`;
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > MAX_DOCUMENT_BYTES) return `${file.name} is larger than 20 MB.`;
  return undefined;
}
