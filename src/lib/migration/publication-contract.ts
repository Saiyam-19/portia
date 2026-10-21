/** The existing migration bridge limit, measured after JSON escaping and UTF-8
 * encoding. Publication never truncates text to fit this boundary. */
export const MAX_PUBLICATION_SERIALIZED_BYTES = 128_000;
export const PUBLICATION_LIMIT_MESSAGE = "The result exceeds the publication limit. This turn remains incomplete; no complete answer was published. Check saved work before requesting a narrower result.";

export const PUBLICATION_LIMIT_AFTER_APPROVAL_MESSAGE = PUBLICATION_LIMIT_MESSAGE + " Exact approval was accepted; approved memory changes may already have been applied. Check Memory before retrying.";

export class PublicationLimitError extends Error {
  constructor() { super(PUBLICATION_LIMIT_MESSAGE); this.name = "PublicationLimitError"; }
}
export function publicationFits(value: unknown): boolean {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength <= MAX_PUBLICATION_SERIALIZED_BYTES;
}
export function assertPublicationFits(value: unknown): void {
  if (!publicationFits(value)) throw new PublicationLimitError();
}
