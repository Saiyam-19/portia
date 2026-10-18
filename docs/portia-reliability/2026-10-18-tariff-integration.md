# Tariff evidence integration — 18 October 2026

This stage integrates the public evidence into Portia's existing agent and deterministic calculation tools. It does not perform repository cleanup, commits, deployment, or the future blind evaluation.

## Implemented behavior

| Facility | Available behavior | Limits retained in the response |
|---|---|---|
| ICTPL / OCT | Current published direct iron/steel wharfage; separate conditional 130% berth scenario | Wharfage includes the 30% convenience fee. Each item's gross weight is assessed separately; aggregate-only weight produces an unassessed reference. The source overlaps at exact 0.5-unit fractions, so those cases remain unresolved. Berth selection/formal renewal stays conditional, with the 100% alternative disclosed. |
| JSW JNPT Liquid Terminal | December 2025 cargo, named-commodity infrastructure and quantified ancillary references | Clearly dated, currentness unconfirmed, search-index provenance disclosed. Cargo and infrastructure remain separate. Actual ancillary usage required; ambiguous catch-all and negotiated charges remain unresolved. JNPA marine fees remain separately calculated. |
| Finolex / Ranpar | September 2023 berth, pilotage, towage, standby and mooring references | Berth uses LOA, not GT. Standby uses total vessel stay in port, not tug-attendance hours. Per-berthing/activity quantities stay distinct from vessel movements. Jetty applicability, currentness and unspecified fractional billing remain unconfirmed. |
| Redi | Dated anchorage, pilotage, ship-service and free-launch references | Anchorage uses commenced 24-hour periods. It is not renamed berth hire; private ship services are not statutory port dues. Currentness and other cargo/lighterage terms remain unresolved. |

The runtime now distinguishes `estimated` / `published-reference` results from ordinary calculated components. Public responses retain dates, source links and uncertainty. Reference amounts cannot establish definitive comparison rankings or quotation baselines. Saved-reference corrections and reloads recompute the qualified result; model-authored monetary prose cannot replace it. Mixed requests retain supported partial amounts and explicit unsupported services, regardless of service order.

No acceptance-prompt lookup or fixed answer table was added. New inputs are ordinary business facts: itemized cargo weights, handling method, LOA, port-stay hours and actual service quantities. Rates and evidence classification remain server-owned.

## Source preservation

Required runtime evidence resides in `data/reviewed-tariffs/full-scope-2026/`, not disposable logs. Nine selected source captures were added: original ICTPL/Mumbai supporting documents, dated GAC browser transcriptions and the JSW indexed extraction. Capture kind and limitations are explicit; transcription hashes are not presented as original-PDF hashes. The source registry and retained calculation data accompany these assets.

Cleanup must preserve this runtime evidence and its attribution. Required historical research and verification records were relocated during cleanup; the [evidence index](evidence/index.json) maps original hashes and paths. Disposable logs and duplicate extracts were removed.

The local packaging check discovered that Next's broad file trace included old research logs, lab state, Git files and local environment files. Explicit trace exclusions were added in `next.config.ts`; no local files were deleted. Required tariff assets remain explicitly included. This changes deployment packaging only, while local environment files and unrelated running services remain intact.

## Local verification

- Initial new regressions demonstrated missing behavior before implementation: 22 failures, six already-passing boundary cases.
- Independent source/spec and implementation reviewers found three concrete defects: per-item cargo-weight assessment, Finolex standby basis, and suppression of valid sibling components. New regressions reproduced them; all were repaired and independently rechecked.
- Final Node 22 checks: **394 tests across 17 focused files pass**, TypeScript passes, scoped ESLint passes. This includes 34 new development regressions. Some existing tests use scripted model outputs; this is not a blind language-understanding evaluation.
- Production-build and packaged-source verification are recorded in the final integration evidence manifest/report. The default Turbopack attempt hit a local worker-port permission error. Next's documented Webpack production build passed with permission to fetch the existing Google Fonts; the final rebuilt candidate also passed the trace-exclusion check. Both chat routes include all 12 required assets and no output, lab, Git, Vercel metadata or environment files. No application/font behavior was changed to bypass the environment error.
- No new paid model calls, browser acceptance run, deployment or production acceptance. Existing API-budget ledger is unchanged.

Evidence: [integration folder](evidence/records/tariff-integration-20261018/), including candidate hashes, final check logs, packaging and process records. Intermediate snapshots and failed-run logs were removed after cleanup verification.

## Review disposition

### Standards

No documented-standards violation confirmed. The sibling-blocker defect was a concrete implementation defect, repaired by checking component-local blockers. Both requested-service orders now retain the same valid partial amounts. No remaining finding in the reviewed correction.

### Spec

Two source-interpretation defects were confirmed and repaired: cargo assessment now respects per-item fractional weights and unresolved exact-half wording; Finolex standby now requires total port stay. No remaining finding in the reviewed correction. This review is not tariff certification or proof that every possible input is handled.

Closed findings: standards/implementation 1; spec 2. Remaining in reviewed corrections: 0; worst unresolved finding in either reviewed correction: none.

## Next stage requested by the user

Report this integration first. Then review cleanup scope, make detailed commits, deploy the intended frozen version, and evaluate independently authored unseen conversations using source-derived answers. Hold-out authors should receive requirements and source evidence without implementation or prior test scenarios. Record the first evaluation unchanged; no fixes during that evaluation. These later stages have not been performed here.

Final local build: `2lCcWi5qAYtzgmTCCmfyZ` (Webpack, Node22.23.2). No deployed evaluation was run.
