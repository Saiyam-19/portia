# Reading a port's rate schedule into the rule book

This guide is for anyone (person or AI) entering a port's charges into Berthwise. Two readers enter every port independently, and the results are compared amount by amount, so following these rules exactly matters more than speed.

The format is defined in code: [`src/lib/berthwise/rulebook/schema.ts`](../src/lib/berthwise/rulebook/schema.ts). A worked, made-up example is in [`tests/berthwise/fixtures/example-port.json`](../tests/berthwise/fixtures/example-port.json). The calculator that uses these files is [`src/lib/berthwise/rulebook/calculate.ts`](../src/lib/berthwise/rulebook/calculate.ts).

## What to read

Read only the Markdown copies in `data/sources/<port>/*.md`. Each has `<!-- page N -->` markers matching the PDF's page numbers. `data/sources/<port>/sources.json` lists every document with its title, issuer, link, file paths, hash and retrieval date. Copy those into the `documents` list of your file. The PDF is there if a table in the Markdown is garbled; if you use it, say so in a note.

## One file per port

Write `<port-id>.json` in your output folder. Use these exact port ids:

| id | Port | Notes |
|---|---|---|
| `mumbai` | Mumbai Port Authority | Berths: Indira Dock group, Prince's & Victoria Docks group |
| `jnpa` | Jawaharlal Nehru Port Authority | Terminals (use these ids): `gti`, `nsigt`, `nsict`, `nsft`, `bmct`, `jsw-jnpt-liquid` |
| `jaigarh` | JSW Jaigarh Port | |
| `new-mangalore` | New Mangalore Port Authority | |
| `paradip` | Paradip Port Authority | Two versions (see below) |
| `deendayal` | Deendayal Port Authority (Kandla) | Kandla and Vadinar have separate rates: make them terminals `kandla` and `vadinar` |
| `chennai` | Chennai Port Authority | |
| `kamarajar` | Kamarajar Port (Ennore) | |
| `mundra` | Adani Mundra (APSEZ) | Add the fuel surcharge notice as a separate charge |
| `hazira` | Adani Hazira Port | Add the fuel surcharge notice as a separate charge |
| `kattupalli` | Adani Kattupalli Port (MIDPL) | Base tariff plus the July 2026 addendum plus the fuel surcharge notice |
| `pipavav` | Gujarat Pipavav Port | |

**Terminal and berth ids:** the name as printed, lowercase, words joined by hyphens, without "berth"/"terminal" filler words: "Indira Dock & its Harbour walls, Ballard Pier and Ballard Pier Extension" becomes `indira-dock`; "Princes & Victoria Docks and its harbour walls" becomes `princes-victoria-docks`. Use the shortest name that is unique within the port.

## What to enter (v1 scope)

For every port, enter the **vessel-related charges** a normal cargo ship pays:

1. **Port dues** (`port-dues`)
2. **Pilotage**, and **towage** if it is charged separately (`pilotage`, `towage`). If one combined charge covers both, use `pilotage-towage` with `"includes": ["pilotage", "towage"]`.
3. **Berth hire** (`berth-hire`)
4. **Mooring/unmooring**, if charged separately (`mooring`)
5. **Anchorage**, if published (`anchorage`)
6. **Surcharges that apply to every call**, such as Adani's fuel surcharge on pilotage: a separate charge with the same type as the charge it adds to, and a label that says what it is ("Fuel surcharge on pilotage").

**Optional:** wharfage (`wharfage`, basis `tonne` or `teu`) for at most five common cargo classes. Use cargo class ids such as `coal`, `iron-ore`, `steel`, `fertilizer`, `containers`.

**Leave out:** penal charges, idle-time and overstay penalties, cancellation fees, special-vessel rates (naval, cruise, dredgers, fishing), concessions and rebates. If a concession is common (for example ships in ballast), mention it in `conditions`.

## Rules for figures

- **Copy every figure exactly as printed**, as a decimal string: `"0.0137"`, `"18966"`, `"826732.12"`. Never round, convert currency or apply an escalation percentage yourself.
- If a schedule prints both a base rate and an escalated or indexed rate for the date, use the one in force for the version's dates, and say which in a note.
- If a coastal rate is described only as a percentage of the foreign rate and not printed, do **not** calculate it. Leave the coastal row out and add a note.
- `source.quote` is required for every charge: copy the table row or sentence verbatim from the Markdown, up to 400 characters. The checker confirms that the quote appears in the Markdown and that every rate, base and minimum you entered appears in the quote.
- `source.page` is the `<!-- page N -->` number in the Markdown.

## How to express common schedules

| Schedule says | Enter |
|---|---|
| "X per GRT" (per call) | `basis: "grt"`, one band `{ "rate": "X" }` |
| "X per GRT per hour or part thereof" | `basis: "grt-hour"`, `timeRounding: "started-hour"` |
| "X per GRT per day or part thereof" | `basis: "grt-day"`, `timeRounding: "started-day"` |
| "Up to 30,000 GRT: a per GRT; 30,001 to 60,000: b per GRT" (whole ship at the band's rate) | `bandMode: "whole"`, bands `{ "upTo": "30000", "rate": "a" }`, `{ "upTo": "60000", "rate": "b" }` |
| "US$ 18,966 for the first 30,000 GRT + 0.5058 per additional GRT" | `bandMode: "excess"`, bands `{ "upTo": "30000", "rate": "<first-band rate>" }`, `{ "upTo": "60000", "base": "18966", "rate": "0.5058" }` |
| "Minimum GRT 1,000" | `minimumQuantity: "1000"` |
| "Minimum charge US$ 200 per call" | `minimumAmount: "200"` on that rate row |
| Charge applies to each inward and outward movement | `per: "movement"` |
| Charge per tug | `perTug: true` |
| A fixed amount per call by ship size | `basis: "call"`, `bandOn: "grt"`, bands with the amount as `rate` |
| Different rates by berth, ship type, terminal or cargo | one rate row each, with `when` conditions |
| Foreign-going in USD, coastal in INR | one rate row each: `when.status` `["foreign"]` / `["coastal"]` |

Set `defaults` only from what the documents say: for example the tug count normally required by ship size, or the port's main cargo berth. Don't invent defaults.

## Versions and dates

- `effectiveFrom`/`effectiveTo` come from the document. If a notification says it takes effect "after 30 days from notification", count 30 days from the gazette date, put the result in `effectiveFrom`, and add a note quoting the sentence.
- **Paradip:** one version for the indexed schedule effective 1 May 2026 (`sor-indexed-2026-27`), ending the day before the new schedule starts, and one version for the new schedule notified in the Odisha Gazette of 10 September 2026 (`sor-2026-new-18092026`).
- `checkedOn` is the date you read the documents.

## Notes

Use `notes` for anything a user or reviewer should know and the format cannot express: an unclear table, a conflict between two documents, a rate that depends on something we don't ask for. Plain English, with a source reference. A note costs nothing; a guess can cost a client money.

## Checking your work

Run the checker on your folder before handing over:

```bash
RULEBOOK_DIR=<your-folder> npx vitest run tests/berthwise/rulebook-data.test.ts
```

It checks the format, the document hashes, that every quote is in the Markdown, that every figure is in its quote, and that the calculator can price a sample call at every port.
