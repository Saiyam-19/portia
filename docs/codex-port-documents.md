# Task for Codex: collect each port's rules, berth particulars and timings

Berthwise already holds every v1 port's **rate schedule** in `data/sources/<port>/`. Users also ask about a port's berths, depths, rules, compliance requirements and working timings, and the agent may answer those only from the port's own documents. Your job is to find and save those documents for the same 12 ports, so a search tool can quote them with page references.

## Rules

1. Work in your own worktree so the main checkout stays on `berthwise-v1` (another agent is working there):
   ```bash
   git worktree add ../portia-port-documents -b codex/port-documents berthwise-v1
   cd ../portia-port-documents && npm ci
   ```
2. Change nothing outside `data/sources/`. Don't edit code, tests, `data/rulebook/` or the existing rate-schedule files. Don't push or merge.
3. **Official sources only:** the port authority's or terminal operator's own website, or a government gazette. Don't use shipping-agency summaries, news sites, blogs or AI-written pages. If only an unofficial source exists, save nothing and say so in your report.
4. **No personal data.** Skip any document that lists individuals' personal phone numbers or email addresses (office contacts such as "Harbour Master, Port House" are fine).
5. Prefer the newest version. Skip documents more than five years old unless they are still the port's current rules, and say so.
6. At most 5 documents per port and 20 MB per file. Fewer, better documents beat many partial ones.

## What to collect, in priority order

For each port in the table below:

1. **Berth particulars:** every berth or terminal with depth or permissible draft, maximum length (LOA), and beam or DWT where given, plus the cargo it handles.
2. **Rules for a ship call:** documents and notices required before arrival (for example ETA notices, pre-arrival security information, crew and cargo declarations), pilotage rules (compulsory pilotage, boarding point, night or tidal restrictions), vessel acceptance criteria (age, size, draft), and safety, environment and dangerous-cargo rules.
3. **Working timings:** working hours and shifts, pilotage or berthing hours, Sunday and holiday working.

| id | Port | Notes |
|---|---|---|
| `mumbai` | Mumbai Port Authority | |
| `jnpa` | Jawaharlal Nehru Port Authority | Include the container terminals' own berth particulars if published |
| `jaigarh` | JSW Jaigarh Port | |
| `new-mangalore` | New Mangalore Port Authority | |
| `paradip` | Paradip Port Authority | |
| `deendayal` | Deendayal Port Authority (Kandla and Vadinar) | |
| `chennai` | Chennai Port Authority | |
| `kamarajar` | Kamarajar Port (Ennore) | Its website's TLS certificate had expired in October 2026; note it if so |
| `mundra` | Adani Mundra Port | The existing Berthing Policy and Tariff Structure already covers berths and timings; add only what is missing |
| `hazira` | Adani Hazira Port | Same as Mundra |
| `kattupalli` | Adani Kattupalli Port | Same as Mundra |
| `pipavav` | Gujarat Pipavav Port | |

## How to save each document

- **PDF:** save as `data/sources/<port>/rules/<short-name>.pdf`, then convert:
  ```bash
  python -I scripts/sources/pdf2md.py data/sources/<port>/rules/<short-name>.pdf data/sources/<port>/rules/<short-name>.md
  ```
  It needs `pip install pymupdf pymupdf4llm` and prints the page count, the pages without a text layer and the sha256.
- **Scanned pages** (no text layer) that hold berth tables or rules: transcribe them by hand into the Markdown under the page's `<!-- page N -->` marker, starting with the line `<!-- Transcribed by hand from a scanned page (no text layer). -->`. Leave other scanned pages as the converter's placeholder.
- **Web page** (no PDF): save the page as `data/sources/<port>/rules/<short-name>.html` and write `<short-name>.md` with the page's text under one `<!-- page 1 -->` marker. Keep tables as Markdown tables.
- **Add an entry** for every document to `data/sources/<port>/sources.json`, in the same format as the existing entries, plus `"kind": "rules"`:
  ```json
  {
    "file": "data/sources/<port>/rules/<short-name>.pdf",
    "title": "Title as printed",
    "issuer": "Who published it",
    "url": "https://… (the exact download link)",
    "retrievedOn": "YYYY-MM-DD",
    "publishedOn": "YYYY-MM-DD (only if printed)",
    "markdown": "data/sources/<port>/rules/<short-name>.md",
    "sha256": "…",
    "kind": "rules"
  }
  ```

## Check before finishing

```bash
npx vitest run tests/berthwise/sources.test.ts
```

It checks that every file is listed, every hash matches and every Markdown copy has page markers. Fix every problem it reports, then commit your files on `codex/port-documents` with a short message.

## Report back

A short plain-English report:
- for each port, the documents saved (title, date, what it covers) and what you could not find;
- pages you transcribed by hand;
- anything doubtful (old documents, conflicting figures, unofficial-only sources you skipped);
- the commit hash.
