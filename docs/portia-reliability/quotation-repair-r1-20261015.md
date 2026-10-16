# Three quotation-rule repairs; D01 still passes

Only production file changed: `src/lib/migration/supplied-quotation.ts`. Added `tests/migration/supplied-quote-rules.test.ts`. [Entry-relative diff](../../output/quotation-repair-r1-20261015/revision.patch) · [File hashes](../../output/quotation-repair-r1-20261015/changed-files.json).

| Review finding | Repair | Exact observed outcome |
|---|---|---|
| Nonnumeric governing clauses silently dropped | Mark complete supported charge, limit, duration and quantity clauses, plus neutral framing. Any uncovered text leaves this compiler. No blacklist of failing conditions. | Original free-first-hour and coastal-waiver probes no longer compile or verify a false USD150 result. Original input reaches existing agent handling intact. |
| Final-money rounding applied to time | Remove global `round…up` inference. Explicit whole-hour berth-stay rounding has a source binding and applies only to the supported hourly basis. Other targets/stages leave this path. | Original final-total rounding probe declines certification. Unrounded1.1hours givesUSD82.50; explicit whole-hour stay rounding givesUSD150. |
| Compound count truncated to a suffix | Require the supported quantity atom to begin at a complete quantity-clause boundary; unresolved quantity text is not covered. | Original `twenty one movements` probe declines certification. Numeric21 movements givesUSD27,075; supported word `twenty` givesUSD25,875. |

Unsupported waivers, free periods, money-rounding rules and compound word counts were **not implemented as new rule families**. Returning to existing handling is the intended bounded outcome; this packet does not claim that path now calculates those unsupported terms correctly.

The unchanged parent probe was copied into an owned temporary `.cjs`, executed and removed. Its four unsupported cases now decline; its plain linear control still compiles/verifiesUSD150. [Exact observations](../../output/quotation-repair-r1-20261015/parent-probe-after.json). Parent review/probe files and all original acceptance inputs remain unchanged.

Regression evidence:11 failures demonstrated before repair; final43 focused tests across5files pass, including19 new rule cases. D01, D11 and original scenario19 retain their assertions. Delayed/rejected publication checks still pass. Typecheck, final Webpack build including TypeScript, and changed-file lint pass. Parent's earlier full-suite562/56files result remains historical; no unchanged broad suite was repeated. Graph lookup remained stale/untracked for this module; current exact source was used.

On15Oct2026 at03:44IST, unchanged D01 passed the actual local browser→Next→Convex journey again: **USD1,875 berth + USD2,400 pilotage = USD4,275**, clean stream, completed saved message and identical reload text. One genuine request to the same pinned free model, HTTP200, zero price ceilings, no fallback/retry. Earlier genuine evidence remains untouched and tied to its earlier candidate.

[Displayed answer](../../output/quotation-repair-r1-20261015/live-display.png) · [Reload](../../output/quotation-repair-r1-20261015/live-reload.png) · [Live journey](../../output/quotation-repair-r1-20261015/live-journey.json) · [Provider events](../../output/quotation-repair-r1-20261015/provider-events.jsonl) · [Verification manifest](../../output/quotation-repair-r1-20261015/verification.json).

All17 source assets/16port slugs and three frozen inputs retain their hashes. Holdout unread. No source research, provider migration, UI change, paid inference or deployment in this repair slice. Existing broader B/C/D and source/oracle gaps remain open.

Owned backend/app/browser groups stopped and checked; all15 previous listener endpoints preserved. No existing service reused or stopped. Private local database retained under ignored `.local`. Write ownership released for review of these three repairs only.
