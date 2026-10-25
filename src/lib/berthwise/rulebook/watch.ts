import { portBooks } from "./books";
import type { Estimate } from "./calculate";
import type { PortBook } from "./schema";

/** Keeping rates current. Every rate document we read is re-downloaded monthly and
 * compared with the copy we hold. Adani's fuel surcharge is published as a new notice
 * about twice a month, under a new link, so its age is what tells us to check. */

export type WatchedDocument = { url: string; portId: string; documentId: string; title: string; sha256: string };
export type SourceStatus = { url: string; portId: string; documentId: string; status: "changed" | "unreachable"; since: number };

export const CHECK_EVERY_DAYS = 30;
export const FUEL_SURCHARGE_DAYS = 15;
const isFuelNotice = (title: string) => /fuel surcharge/i.test(title);

/** The rate documents behind schedules that are still in force or yet to start. */
export function watchList(books: PortBook[] = portBooks(), today = new Date().toISOString().slice(0, 10)): WatchedDocument[] {
  const seen = new Map<string, WatchedDocument>();
  for (const book of books) for (const version of book.versions) {
    if (version.effectiveTo && version.effectiveTo < today) continue;
    for (const doc of version.documents) {
      if (isFuelNotice(doc.title) || seen.has(doc.url)) continue;
      seen.set(doc.url, { url: doc.url, portId: book.id, documentId: doc.id, title: doc.title, sha256: doc.sha256 });
    }
  }
  return [...seen.values()];
}

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Plain-English warnings for an estimate: a rate document that changed on the port's
 * website, or a fuel surcharge older than a fortnight on the call date. */
export function freshnessNotices(book: PortBook, result: Estimate, statuses: SourceStatus[], callDate: string): string[] {
  const version = book.versions.find(item => item.id === result.version.id);
  if (!version) return [];
  const notices: string[] = [];
  for (const status of statuses.filter(item => item.portId === book.id)) {
    const doc = version.documents.find(item => item.id === status.documentId || item.url === status.url);
    if (!doc) continue;
    notices.push(status.status === "changed"
      ? `${doc.title} has changed on the port's website since we read it (noticed ${day(new Date(status.since).toISOString().slice(0, 10))}). These rates may be out of date until it is checked.`
      : `We couldn't reach ${doc.title} on the port's website recently, so we couldn't confirm it is unchanged.`);
  }
  const fuel = result.lines.find(line => /fuel surcharge/i.test(line.label));
  if (fuel) {
    const notice = version.documents.find(doc => doc.title === fuel.source.title && isFuelNotice(doc.title));
    const issued = notice?.publishedOn ?? version.effectiveFrom;
    const age = (Date.parse(`${callDate}T00:00:00Z`) - Date.parse(`${issued}T00:00:00Z`)) / 86_400_000;
    if (age > FUEL_SURCHARGE_DAYS) notices.push(`The fuel surcharge is from the notice of ${day(issued)}. ${book.name.replace(/ \(.*\)$/, "")} usually revises it about twice a month, so check the latest trade notice before relying on it.`);
  }
  return notices;
}
