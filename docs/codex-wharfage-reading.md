# Task for Codex: independent second reading of wharfage at 12 ports

Berthwise now prices **wharfage** (the port's charge on cargo loaded or discharged) for the main cargo types. Another reader has entered it. You are the second, independent reader. Afterwards both readings are compared rate by rate, and every difference is settled against the documents. Your reading is only useful if it is **independent and literal**.

## Rules

1. Work only from the commit you were given on branch `berthwise-v1`. Create a new local branch `codex/wharfage-second-reading` from it.
2. **Do not look at** `data/rulebook/`, `scripts/rulebook/`, `tests/berthwise/wharfage.test.ts`, `data/rulebook-codex/` (except the folder you write), any other branch, or git history after your starting commit. Read only `data/sources/<port>/*.md` (and the PDFs beside them when a table is unclear).
3. Change nothing outside `data/rulebook-codex/wharfage/`. Don't edit code, tests or documents. Don't push or merge.
4. Don't use the internet.

## Which document to read

| Port id | Document (`data/sources/<port>/<document>.md`) |
|---|---|
| `mumbai` | `sor-2026-05` |
| `jnpa` | `sor-2026-27` and the terminal schedules (`gti-2026`, `nsigt-2026`, `nsict-2026`, `nsft-2026`, `bmct-2026`, `jsw-jnpt-liquid-2024`) |
| `jaigarh` | `tariff-2026-05` |
| `new-mangalore` | `sor-2026-27` |
| `paradip` | `sor-2026-new-18092026` (the schedule in force from 10 October 2026) |
| `deendayal` | `sor-escalated-2026-27` (Kandla and Vadinar; ignore Chapter V, Tuna port) |
| `chennai` | `tn-gazette-2026-sor` |
| `kamarajar` | `sor-consolidated` |
| `mundra` | `bpts-2026-06-15` |
| `hazira` | `bpts-rev14-2026-10` |
| `kattupalli` | `bpts-2025-10-15` |
| `pipavav` | `tariffs-2026-01-01` |

Some schedules call wharfage something else: at Kattupalli it is the Tamil Nadu Maritime Board's "landing and shipping charges", at Hazira "wharfage / waterfront royalty", at Jaigarh the Maharashtra Maritime Board's wharfage. At JNPA, write `"document": "sor-2026-27"` unless you quote a terminal schedule.

## What to produce

One file per port, `data/rulebook-codex/wharfage/<port-id>.json`, in this format (checked by `tests/berthwise/wharfage-reading.test.ts`):

```json
{
  "port": "paradip",
  "document": "sor-2026-new-18092026",
  "rates": [
    { "cargo": "coal", "unit": "tonne", "foreign": "60.43", "coastal": "36.26", "direction": "import", "page": 32,
      "quote": ["|(iv). All types of Coal/Coke||||", "<the table line with the figures, copied verbatim>"],
      "note": "First volume slab." }
  ],
  "notPriced": [{ "cargo": ["containers"], "reason": "Container wharfage is part of the terminal's handling charge.", "page": 5 }],
  "notes": []
}
```

- `cargo` is one of these kinds: `containers`, `coal` (steam/thermal coal, or coal and coke together), `coking-coal`, `iron-ore`, `fertilizer` (finished fertilisers), `fertilizer-raw-materials` (rock phosphate, sulphur), `steel`, `crude-oil`, `petroleum-products` (only a general or "other POL products" row), `diesel`, `petrol`, `naphtha`, `fuel-oil`, `jet-fuel` (kerosene, ATF), `lpg`, `lng`, `chemicals` (liquid chemicals), `edible-oil`, `food-grains`, `cement` (cement and clinker).
- `unit`: `tonne` for per-tonne rates; `box20` and `box40` for rates per loaded container up to 20 feet and over 20 up to 40 feet. If a port charges the box and the cargo inside it separately, give one entry each with `part` `"box"` or `"cargo"`.
- `foreign` and `coastal`: the rates **in rupees** as printed, for foreign and coastal cargo. If the schedule prints a single rate, give it in both. Leave one out if the schedule prints none for it.
- `direction`: only when the schedule prints different rates for import (discharged) and export (loaded) cargo; give one entry each.
- `terminal`: only when the rate depends on where it is handled: use `kandla` or `vadinar` at Deendayal.
- `page` is the `<!-- page N -->` number in the Markdown; `quote` the table line(s) copied verbatim (up to 8 snippets of 400 characters). Every figure you enter must appear in its quote.

## How to choose a row

Enter one rate per cargo kind (per unit, part, direction and terminal), choosing the row that kind of cargo normally pays:

1. **Copy figures exactly.** Never calculate, round, convert or escalate.
2. **Volume slabs** (rates that fall with a user's annual volume): enter the first slab (smallest volume) and say so in `note`.
3. **Bulk and break bulk** priced apart: use the bulk row for coal, ores, fertilisers, grains and cement; the break-bulk row for steel.
4. **Steel** split by product: use the hot-rolled coils row if there is one, otherwise the general iron and steel row. Mention the others in `note`.
5. **Iron ore** split into fines/lumps and pellets: use fines/lumps.
6. **Oil products**: enter each product the schedule prices (`diesel`, `petrol`, `naphtha`, `fuel-oil`, `jet-fuel`); use `petroleum-products` only for a general or "other POL products" row. A row covering several products gives one entry per product.
7. **Mechanised plants** with their own rates (e.g. a mechanised coal handling plant): use the conventional rate, and note the plant's rate.
8. **Where it's handled**: if the schedule prices a cargo by location and you can't tell which applies to a normal call, don't enter it; add it to `notPriced` with the reason.
9. **Don't enter** ad valorem rates, rates per unit, per cubic metre or per freight tonne, empty containers, transhipment, hazardous premiums or penalties.
10. If a port's container wharfage is included in a terminal's handling charge, or a schedule prints a figure you can't read reliably, add it to `notPriced` with the reason and page. Don't skip silently.

## Check before finishing

```bash
npx vitest run tests/berthwise/wharfage-reading.test.ts
```

Fix every reported problem until all 12 files pass. Then commit the 12 files on `codex/wharfage-second-reading` with a short message.

## Report back

A short plain-English report: for each port, what you entered and what you couldn't; every judgement call (unclear tables, slabs, figures you couldn't read); and the commit hash.
