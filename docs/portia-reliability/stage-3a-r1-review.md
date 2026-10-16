# Stage 3A R1 — review resubmission

Scope: repair B1–B6 from `stage-3a-orchestrator-review.md`. No tariff ingestion, cloud mutation, inference or acceptance-oracle changes. Final verification/ownership are recorded in the progress JSON and `output/reliability-stage3a-r1-20261015/verification.json`.

**Resubmitted for review; write ownership RELEASED.** 394 tests, typecheck, ordinary full lint (six existing warnings) and Webpack build pass. All 15 prior listener endpoints preserved; no owned process survivors. B1–B6 pass implementation-aware offline probes/integration; orchestration acceptance is pending.

## Repairs

| Finding | Cause | Change and evidence |
|---|---|---|
| B1 — negated form labels | Emission and conflict detection classified the same label differently | One canonical `fieldMentions`/`classifyFormField` pipeline uses maximal spans, assertion polarity and direct-versus-denominator meaning. “DWT, not GT” establishes DWT only. Negated displayed event meanings cannot revive a generic machine key. |
| B2 — silently replaced units | Values and units were parsed separately; bound forms also ran the prose extractor | Parse each bound quantity once, validate explicit and form units against the measurement, then normalize only supported conversions. Conflicting `12000 DWT` in a GT form remains unestablished. Feet convert exactly using 0.3048, with raw unit/value and conversion provenance retained. Unsupported units remain scoped issues. |
| B3 — rejected corrections | Duration/timestamp paths ignored negation | The reducer distinguishes assertion and rejection before replacing a fact. Rejected 30h does not replace valid 10h; corrected 13:00 survives rejected 12:00. Explicit rejection of the current value withdraws that value and asks for its replacement; independent fields remain. Indirect historical coreference remains open separately. |
| B4 — next leg reused old call | Vessel identity and call scope were the same object | New legs create a fresh call identity/index with vessel provenance. Only established GT, NT, DWT and LOA carry across the same vessel. Timings, duration, draught, port and service state do not carry. The old call remains unchanged; ordinary same-call corrections still update it. |
| B5 — form events differed from prose | Separate event classifiers plus generic endpoints appended to the event timeline | Forms and prose use the same event dictionary. Specific displayed roles refine compatible generic field keys. Intervals are explicit role pairs within one scope; generic endpoints never redefine the full recorded visit. Semantic endpoint reversal is reported, never repaired by sorting timestamps. Valid berth occupancy remains visible beside an invalid visit event. |
| B6 — rejected names leaked aliases | Long names were discarded before nested-name suppression | Resolve maximal spans first, then apply assertion/rejection to the entire mention. Rejected JSW JNPT cannot authorize nested JNPA. Positive long names and reviewed aliases still resolve. |

Shared implementation: `src/lib/migration/request-semantics.ts`, consumed by both context extraction and port identity. Fact reduction remains in `call-context.ts`; public context/clarification integration remains in `request-evidence.ts`. No second model call, external parser, new dependency, schema migration or shared cross-user cache was introduced.

Unit conversion whitelist is deliberately bounded. Metres/feet and hours/days have explicit exact factors; other unit expressions are not silently relabelled. The elapsed-time tool's existing timestamp/minute support remains unchanged. Neither identity matching nor unit normalization establishes a tariff rule or price.

## Evidence and test boundaries

- Entry snapshot: `.local/reliability-stage3a-r1-20261015/entry-baseline.tar.gz`, 435 tracked/nonignored files; includes the prior review artifacts.
- The original 12 reviewer observations were reproduced identically before repair (`original-probes-before.log`). Original probe source and prior observations remain unchanged.
- Test-first baseline: **27 failures, 6 positive passes** in the new B1–B6 suite before application edits (`red.log`). Complete form definitions are validated through the existing form schema.
- Additional adversarial neighbors exposed four failures before their repair (`red-adjacent.log`): rate-denominator labels, negated generic event meaning, independent arithmetic suppressed by a new unit conflict, and valid berth occupancy suppressed by an invalid visit event.
- Generate/stream tests exercise the actual main-agent path for all six findings. Additional round trips execute the real elapsed-time and arithmetic tools under synthetic model output, checking visible results and current context.
- A new integration assertion initially expected padded `5.0000`; the existing calculator correctly returns exact integer `5`. The test was corrected to inspect the actual named tool result, without changing the expected amount, frozen inputs or production arithmetic.
- Final test/typecheck/lint/build results and process checks are in `verification.json`. These are implementation regressions and synthetic integration, not independent tariff/model/browser/production acceptance.

Final verification: **394 tests / 52 files passed**, including 42 new R1 tests; 120 focused tests passed. Typecheck and Webpack build passed. Both built chat routes retain all 17 tariff assets.

The first ordinary lint run reported five CommonJS-import errors in the reviewer artifact `output/reliability-stage3a-review-20261015/probe.cjs`. Orchestration explicitly authorized renaming it to `probe.cjs.txt` without changing bytes/hash and updating the review's reproduction note. This evidence-packaging change is recorded separately in `evidence-packaging.json`. No counterexamples, observations, ESLint rules or configuration changed. Ordinary full `npm run lint` passed after packaging; the earlier single-file-exclusion diagnostic is not the final lint gate. A fresh temporary executable copy reproduced all 12 final observations and was removed.

The final original-probe verdict record (`probe-verdicts.json`) distinguishes repaired B findings, preserved controls and the intentionally open historical-GT case. No broad score hides that remaining failure.

## Open work

The pre-existing historical-GT counterexample still fails: “The old record says GT 18000; that value is wrong. Keep the current GT” can replace established GT9000. Direct scoped negation is handled; indirect rejection via historical coreference is **not** claimed fixed or newly introduced by this batch.

CE-01/02 remain later C/D ledger/publication obligations. Original CE-04 (valid arithmetic suppressed by the pre-existing invalid GT/time guard) remains open. This repair prevents new unit-conflict refusals from blocking an independent arithmetic task and preserves valid time intervals alongside new event-order errors; it does not claim a general complete partial-answer contract.

Extraction remains bounded. No claim of universal paraphrase/coreference coverage, official tariff validity, live-provider behavior, complete quotations, browser acceptance or production readiness. Independent development and holdout inputs are untouched; no held-out data opened. D03/D04 reference candidates were not ingested.

## Exact scope and handoff

R1 application changes:

- New `src/lib/migration/request-semantics.ts`
- Updated `src/lib/migration/call-context.ts`
- Updated `src/lib/migration/port-identity.ts`
- Updated `src/lib/migration/request-evidence.ts`
- New `tests/migration/context-review-regressions.test.ts`

Tracking/report changes: implementation status JSON/HTML and this review packet. Evidence: `output/reliability-stage3a-r1-20261015/`. Separately authorized packaging: `output/reliability-stage3a-review-20261015/probe.cjs` → `probe.cjs.txt` (identical bytes), plus `docs/portia-reliability/stage-3a-orchestrator-review.md`'s artifact path/reproduction note.

`revision.patch` compares those five files against the reviewed stage-3A entry. `implementation.patch` compares the cumulative eight implementation/test files against the original archived dirty baseline. `changed-files.json` supplies exact file hashes and preservation results. No unrelated dirty work, original tests, source assets or private configuration was reset/discarded.

Budget: **0 provider requests, $0 paid inference**. No service was needed; owned checks must exit and prior listener endpoints remain preserved before ownership release. Continue only after orchestration reviews this resubmission.
