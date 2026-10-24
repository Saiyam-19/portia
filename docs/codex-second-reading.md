# Task for Codex: independent second reading of 12 port rate schedules

You are the second, independent reader of Indian port rate schedules for the Berthwise agent. Another reader is entering the same ports separately. Afterwards both readings are run through the same calculator and every difference is checked against the documents. Your reading is only useful if it is **independent and literal**.

## Rules

1. Work only from the commit you were given on branch `berthwise-v1`. Create a new local branch `codex/rulebook-second-reading` from it.
2. **Do not look at** `data/rulebook/` (if it exists), any other branch, git history after your starting commit, or the older files in `data/reviewed-tariffs/` and `data/ports/`. Read only `data/sources/<port>/*.md` (and the PDFs beside them when a table is unclear).
3. Change nothing outside `data/rulebook-codex/`. Don't edit code, tests or documents. Don't push or merge.
4. Don't use the internet. Everything you need is in `data/sources/`.

## What to produce

One file per port in `data/rulebook-codex/`, following [`docs/rulebook-format.md`](rulebook-format.md) exactly:

`mumbai.json`, `jnpa.json`, `jaigarh.json`, `new-mangalore.json`, `paradip.json`, `deendayal.json`, `chennai.json`, `kamarajar.json`, `mundra.json`, `hazira.json`, `kattupalli.json`, `pipavav.json`

- Copy every figure exactly as printed. Never calculate, round, convert or escalate a rate.
- Give every charge a verbatim `source.quote` from the Markdown and the page number.
- When something is unclear, choose the most literal reading, and explain it in `notes` with a source reference. Don't skip a charge silently: if you can't enter it, say why in a note.

## Check before finishing

```bash
RULEBOOK_DIR=data/rulebook-codex npx vitest run tests/berthwise/rulebook-data.test.ts
```

Fix every reported problem until all 12 files pass. Then commit the 12 files on `codex/rulebook-second-reading` with a short message.

## Report back

Finish with a short plain-English report:
- for each port, the charges you entered and anything you could not enter;
- every judgement call (unclear tables, conflicting documents, effective dates you had to work out);
- the commit hash on `codex/rulebook-second-reading`.
