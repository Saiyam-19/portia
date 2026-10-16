# Stage 3A R2 — review resubmission

Scope: the four adjacent R1 regressions and the known historical-GT/reference case, under the authorized source-independent B repair batch. No tariff ingestion, provider requests, cloud changes or frozen-input changes. Final checks and ownership are recorded in `output/reliability-stage3a-r2-20261015/verification.json` and the progress JSON.

**Resubmitted; write ownership RELEASED.** 437 tests, typecheck, ordinary full lint (six existing warnings) and Webpack build pass. All 15 prior listener endpoints preserved; no owned process survivors. Orchestrator acceptance remains pending.

## Changes

| Requirement | Implementation | Observable result |
|---|---|---|
| R1-1: complete numeric tokens | A numeric lexer consumes the whole atom before validating grouping, decimal and exponent syntax. Adjacent scalar expressions/ranges remain unresolved. | `12.3.4`, malformed grouping/exponents and `12-34` cannot establish their first numeric prefix. Supported scientific notation and Western/Indian grouping preserve exact raw provenance. |
| R1-2: resolved issues stop blocking | Issues carry reducer sequence/revision and fact dependencies. Current unresolved facts determine active issues; resolved issues remain in `issueHistory`. Schema meaning conflicts resolve only from a later matching field clarification. | Reject GT9000 → correct GT9500, bad LOA unit → metres, and corrected form responses reach the model without obsolete blockers. Unrelated unresolved fields remain active. |
| R1-3: quantity/field/unit boundaries | Prefix declarations own their complete value/unit span. A following labelled field with its own number begins a new declaration. Postfix declarations, copulas and participial clauses are handled structurally. | GT/NT/LOA remain separate with or without commas; carrying/arriving/discharging prose is not treated as a unit. True unknown units stay unresolved. Exact feet/day conversions and existing DWT corrections remain valid. |
| R1-4: preserve versus reject | A shared operation classifier distinguishes assert, replace, reject, preserve and reference before fact reduction. Preserving a current matching value does not withdraw it. | “Do not change GT9000” keeps GT9000; “do not use GT9000” withdraws it; valid replacement clears the withdrawal issue. Selected-port preservation uses the same distinction. |
| Known historical GT | Recognized historical-source statements remain reference records unless explicitly adopted by the user. Current prompt projection omits reference/preserve-history duplicates. | The supplied old-record counterexample retains established GT9000 while retaining GT18000 as reference history. Explicit adoption of GT18000 still works. |

The implementation uses `request-semantics.ts` and the scoped reducer, not new dependencies or another inference pass. Raw values/spans and retired issues remain auditable. `context.issues` contains active blockers; `issueHistory` contains encountered issues with resolution state. The existing authenticated history/form persistence and public API schemas remain unchanged.

Issue history reconstructs parser/retraction issues encountered while reducing stored inputs, plus current validation issues. It is not a complete durable execution/error log; existing conversation/tool history remains separate.

## Evidence

- Entry snapshot: `.local/reliability-stage3a-r2-20261015/entry-baseline.tar.gz`, 488 tracked/nonignored files.
- All **22 adjacent reviewer observations** reproduced identically before edits (`adjacent-before.log`). The original and adjacent probes were copied byte-identically to owned temporary `.cjs` files, executed, then removed. Retained `.cjs.txt` inputs and prior observations were not edited.
- Initial test-first run: **31 failures / 8 positive passes** (`red.log`). Further token/projection boundaries and form-meaning recovery were demonstrated failing before their fixes (`red-boundaries.log`, `red-form-recovery.log`).
- **163 focused tests passed**. Generate/stream recovery tests confirm the main model receives corrected GT/LOA, preserved values and current facts after the historical-reference scenario.
- **437 tests / 53 files passed** in the full offline suite: the prior 394 tests plus 43 R2 tests. No prior assertions were weakened or deleted.
- `probe-verdicts.json` separates the four R2 findings, original B1–B6 controls and the known historical case. These are implementation-aware probes, not independent acceptance.
- Final typecheck, ordinary full lint, build, asset tracing, preservation and process results are in `verification.json`. Build is compile-only, with provider keys removed and inference disabled; it is not a production-configured release artifact.

One existing positive regression exposed the postfix copula in “22400 was DWT”; the grammar now treats that copula as a relationship to the measurement, not as a unit. The frozen/original test remained unchanged.

## Remaining limits

The **specific historical-GT counterexample is fixed** in offline probes and generate/stream tests. This does not certify general reference/coreference understanding. Unseen anaphora, indirect corrections, source-role variants and presupposed facts remain overall B acceptance requirements before financial facts are trusted. B and the full plan are not marked complete.

CE-01/02 ledger/publication correctness and original visible CE-04 remain later C/D work. Token/operation/issue repairs do not establish tariff eligibility, charge completeness or official quotations. Independent development scenarios, held-out cases, real models, browser journeys and production acceptance remain NOT_RUN for this batch. No D03/D04 oracle candidate was ingested.

All 16 port identifiers, 17 asset hashes, original 19-case input bytes and independent development input bytes remain preserved. Production model/privacy settings and persistence schemas are unchanged. API spend: **$0**, provider requests: **0**.

## Exact scope and handoff

Updated application files:

- `src/lib/migration/request-semantics.ts`
- `src/lib/migration/call-context.ts`
- `src/lib/migration/port-identity.ts`
- `src/lib/migration/request-evidence.ts`
- `src/lib/migration/domain-agent.ts`

New test: `tests/migration/context-recovery.test.ts`. Tracking/report changes: implementation status JSON/HTML and this packet. Evidence is under `output/reliability-stage3a-r2-20261015/`; local-only snapshot/check tooling is under `.local/reliability-stage3a-r2-20261015/`.

`revision.patch` compares the six application/test files against the R2 entry snapshot. `implementation.patch` compares the cumulative nine implementation/test files against the original archived dirty baseline. `changed-files.json` supplies exact hashes, input integrity and preservation results. No reset, stash, commit, push or deployment occurred.

Write ownership is released after final verification. Await orchestrator review; broader implementation and acceptance work continue in later approved batches.
