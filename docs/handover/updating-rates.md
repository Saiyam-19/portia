# Keeping rates current

Berthwise prices calls from the rule book in `data/rulebook/`, one file per port, read from the port's own documents in `data/sources/`. This is how the rates stay current, and what to do when something changes.

## What runs automatically

- **Monthly link check.** A Convex job (`convex/sourceWatch.ts`, run daily by `convex/crons.ts`) re-downloads each rate document we read, about once a month, and compares it with the copy we hold. If the file has changed, every estimate for that port says the rates may be out of date until someone checks. A document that can't be reached twice running is reported the same way.
- **Fuel surcharges.** Adani revises its fuel surcharge on pilotage about twice a month and publishes each revision as a new notice under a new link, so the check above can't see it. Instead, estimates for Mundra, Hazira and Kattupalli warn once the fuel surcharge we hold is more than 15 days old on the call date.
- **New schedules under new links** (for example the annual indexation every 1 May) are not detected. A schedule's end date is in the rule book, so after it a port's estimate says no schedule we hold covers that date. Check each port's tariff page in late April.

## When a document has changed, or a new one is published

1. **Save the source.** Download the PDF into `data/sources/<port>/`, convert it with
   `python -I scripts/sources/pdf2md.py <file>.pdf <file>.md`, and add an entry to that port's `sources.json` (title, issuer, link, dates, sha256). Transcribe any scanned page that holds rates by hand, as the brief in `docs/codex-port-documents.md` describes.
2. **Add a version to the rule book.** In `data/rulebook/<port>.json`, end the current version the day before the new rates start (`effectiveTo`) and add a new version with the new document and charges. Follow `docs/rulebook-format.md` exactly: copy every figure as printed, with its quote and page.
   - For a new fuel-surcharge notice, copy the current version, change only the fuel surcharge rate, quote and document, and start it on the notice's date.
3. **Check it.**
   ```bash
   npx vitest run tests/berthwise/rulebook-data.test.ts tests/berthwise/sources.test.ts
   npx vitest run
   ```
4. **For a whole new schedule, have it read twice.** Give the documents to a second reader with `docs/codex-second-reading.md`, compare the two readings, and record how differences were settled, as in `docs/rulebook-resolutions.md`.
5. **Deploy.** Commit and deploy the app. Once the new file is in the rule book, the "may have changed" warning clears by itself.

## Who to ask

Points the documents leave unclear are listed for the client in `docs/handover/port-questions.md`.
