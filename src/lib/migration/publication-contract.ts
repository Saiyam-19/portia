/** The existing migration bridge limit, measured after JSON escaping and UTF-8
 * encoding. Publication never truncates text to fit this boundary. */
export const MAX_PUBLICATION_SERIALIZED_BYTES = 128_000;
export const PUBLICATION_LIMIT_MESSAGE = "This answer is too long to save. Nothing was published for this turn. Please ask for a smaller part, for example one port or one charge at a time.";

export class PublicationLimitError extends Error {
  constructor() { super(PUBLICATION_LIMIT_MESSAGE); this.name = "PublicationLimitError"; }
}
export function publicationFits(value: unknown): boolean {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength <= MAX_PUBLICATION_SERIALIZED_BYTES;
}
export function assertPublicationFits(value: unknown): void {
  if (!publicationFits(value)) throw new PublicationLimitError();
}
