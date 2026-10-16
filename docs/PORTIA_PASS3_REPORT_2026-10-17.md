Stays: calculator, official tariff handlers, storage, UI, dispatch-snapshot checks and required cue regressions; legacy retained.
Changes: strict semantic enums; catalog identities; code-owned numbered items; atomic multi-input recovery.
Scope: offline replay first, then one frozen headless run. No sealed holdout, UI run or readiness claim.

**Result: live regression. Goal NOT met. Stopped after the bounded run.**

| Case | Pass2 full cases | Pass3 full cases | Classification |
|---|---:|---:|---|
| D11 | 0/3 | 0/3 | interpretation + application |
| D19 including correction | 1/3 | 0/3 | interpretation + application |
| D24 | 0/3 | 0/3 | interpretation + application |
| original-19 | 0/3 | 0/3 | interpretation + application |
| D02 | 2/3 | 0/3 | interpretation + application; time-block arithmetic implemented |

**0/15 complete cases; 0/18 turns. USD 0.1771121 actual cost**, USD 0.177117 conservative accounting. User cap under USD 1; reservation stop USD 0.80. Eighteen calls; zero repairs, fallbacks, extra retries or timeouts. No changes during inference; no further calls afterward.

Branch `pass1/golden-and-repairs`; entry `2ad38a5`; inference revision `e1741e4c6c1026e944b476c0a8e1da9a4f2b6164`. All 94 frozen files and 119 original capture files checked unchanged; the one originally absent response file remains absent.

**Offline replay and stop rule**

| Stage | Original v1: accepted / 42 | Saved pass2 v2: accepted / 18 | Complete expected answers / 60 |
|---|---:|---:|---:|
| Baseline | 7 | 4 | 8 |
| 1. Semantic contract | 7 | 13 | 14 |
| 2. Catalog identity | 7 | 16 | 17 |
| 3. Numbered items | 7 | 16 | 20 |
| 4. Failed-turn recovery | 7 | 18 | 22 |
| 5. Baseline assertions | 7 | 18 | 22 |
| Final guards / pre-live | 7 | 18 | 22 |

After two changes: 11 → 23 reducer acceptances, no regressions. The recorded threshold was the same minimum 9.5 percentage-point improvement: at least six additional acceptances across 60. Stop gate passed. Every implementation change was followed by the 60-capture replay.

All 18 saved pass2 outputs now reach their expected answers **offline through compatibility decoding**. This is not fresh-model success. The retained v1 reducer still rejects its original malformed/unsupported proposals. [All 60 gates](../output/pass3/replay-gates.md); per-stage JSON under `output/pass3/replay-*.json`.

**Why live failed**

- Every new output omitted `request`. None emitted any categorical-enum field (`tax`, `currency`, `basis`, `rounding`, etc.). All facts came from the scalar branch of the 22-branch `anyOf` wire schema.
- Two outputs contained 244 and 237 repetitions of `taxPercent:0`. The compiler accepts duplicate facts and falls back to `facts` when request intent is missing. Four turns hit grounding errors; fourteen returned fact summaries instead of requested calculations.
- A structural miss remains: the inherited numeric normalizer still accepts `taxPercent:0` from “No tax”. The new model schema permits literal zero percentages for genuine numeric input, but the downstream implied-zero exception lets this invalid representation through. The requested `tax:none` invariant is therefore **not fully enforced**.
- Schema/provider interaction is a hypothesis, not an established cause. The emitted schema has single-field `const` enum branches, and the model used only the scalar branch. No extra provider experiment was run to attribute causality.

These are interpretation/application failures. Missing implementation remains in requested-work coverage validation: a financial request can incorrectly finish as a fact summary. No missing tariff authority affects the five supplied fictional quotations.

**Literal before / after**

Exact representative excerpts from repetition 3; full strings and all repetitions in [literal comparison](../output/pass3/literal-before-after.md) and [JSON](../output/pass3/before-after.json).

| Case | Before: pass2 | After: pass3 |
|---|---|---|
| D11 | “The interpretation could not be validated. Your supplied details are saved; no estimate was published.” | “vesselName: MV Glass Petrel; port: nhava-sheva-international-container-terminal; GT: 9000 GT; durationHours: 25 hours; taxPercent: 0 percent” |
| D19 initial | “USD 1,280.00” | “taxPercent: 0 percent” |
| D19 correction | “USD 1,295.00” | “taxPercent: 0 percent; supplyState: USD 80” |
| D24 | “The interpretation could not be validated. Your supplied details are saved; no estimate was published.” | “The interpretation could not be validated. Your supplied details are saved; no estimate was published.” Actual gate: “The durationHours number is not in the user's message.” |
| original-19 | “The interpretation could not be validated. Your supplied details are saved; no estimate was published.” | “GT: 10000 GT; durationHours: 24 hours; taxPercent: 0 percent” |
| D02 | “30.5 hours”, “billable periods 6”, “INR 24,000.00” | “vesselName: MV Cedar Kite; port: jaigarh; berthStart: 18 October 2026 at 22:45 timestamp; berthEnd: 20 October 2026 at 05:15 timestamp; timeZone: +05:30; taxPercent: 0 percent” |

[New-capture diagnostics](../output/pass3/live-diagnostics.json) distinguish rejection gates from accepted wrong-task summaries. [Output-shape audit](../output/pass3/live-output-shape.json) retains duplicate and field counts.

**Changes and test-first evidence**

| Change | Commit | Evidence |
|---|---|---|
| Semantic enums / numeric-date-only grounding | `1c8969d` | New contract fixtures fail before; strict schema, none vs not_stated, no fabricated bound zero tested afterward. Remaining tax-zero loophole disclosed above. |
| Catalog identity | `75b62da` | Four alias/canonical-identity cases fail before; mismatch/ambiguity controls retained. |
| Numbered unnamed items | `36de88c` | Missing-charge and duplicate-amount cases fail before; positional coverage now enforced. |
| Multi-input recovery | `47d4929` | Failed-turn, three-input and merged-fact cases fail before; receipt replay, latest correction and scope isolation pass afterward. |
| Baseline assertions | `5e4493a` | Both pre-existing failures reproduced at entry, then corrected with written reasons. |
| Supplemental guards | `fe466ff` | Five failures caught introduced timezone, contradictory-bound, saved-context and enum-absence problems; repaired before freeze. |

**Both baseline tests: behavior retained, assertions corrected.** Mumbai’s dated reviewed rule legitimately needs the absent call date; asking again for supplied tonnage/rates is forbidden by the strengthened test. Empty BPCL now correctly says “no verified tariff yet”; no specialist or amount is permitted. [Written decisions](PORTIA_PASS3_BASELINE_TEST_DECISIONS.md).

**Legacy / new flows**

- Current `/api/chat` and `/api/migration/chat`, both model aliases: v3 entrypoint for quotes, corrections, comparisons, elapsed time, official rules, general/lookup/memory and form replies. Broader behavioral acceptance not claimed.
- Historical receipts: retained v1 reducer/replay. Explicit `interpretationFormat:'legacy'`: retained v1, used by historical regression fixtures, not selected by application routes.
- Saved v2 facts: internal compatibility decoder, not the new live model schema.
- Retained Python stream/form-response endpoints: original Python agent, unchanged; current Next.js chat does not route there.

[Source-backed flow map](PORTIA_PASS3_INTERPRETER_FLOWS.md). No legacy deletion or automatic fallback added.

**Relaxed checks / remaining limitations**

- Non-arithmetic semantic facts no longer require literal value/name containment. Enums constrain categories, not semantic truth. Numeric/date validation, catalog mismatch/ambiguity, negation, either/or dates and bound-scope contradictions remain tested.
- Compatibility decoding recognizes old tax-exemption/no-tax, no-minimum zero, yes/no-adjustment and rounding representations. This improves old-capture replay without proving fresh v3 inference.
- None/not_stated are distinct. Missing values do not erase saved terms. Model-supplied zero is still wrongly accepted in the tax case described above.
- Recovery processes inputs chronologically, then commits one snapshot-bound receipt. When earlier model facts are unavailable, deterministic recovery is bounded to explicit named flat amounts and named corrections; it does not reconstruct arbitrary unreviewed tariff rules or silently merge another vessel.
- Existing R1/D11 assertions retained. Mock fixtures were updated for the requested new wire representation; 852 passing tests did not detect the live schema/intent failure.
- No duplicate-row rejection or required-request coverage gate was added. This is now a confirmed application gap. No post-run code patch masked the result.

**Verification / spend / resources**

Full offline suite: **852/852 pass**; typecheck and scoped lint pass. Same frozen model `openai/gpt-6.1-sol`, OpenAI provider pin, enabled/medium reasoning request, 8192 output limit, one schema-repair maximum, and unchanged budget guard. All responses reported zero reasoning tokens; internal reasoning is unmeasured. Temperature/seed stayed at provider defaults.

The fake-transport payload audit passed before live calls; the live guard allowed only the six frozen fictional user inputs and synthetic history. No private configuration or unrelated user text sent. Ledger persists reservations before dispatch; every response returned usage. [Freeze](../output/pass3/live/freeze.json), [ledger](../output/pass3/live/ledger.json), [results](../output/pass3/live/results.json).

All owned foreground process groups exited; existing application/database listeners preserved. No server started, reused or stopped. Uncertain product-owned helpers left running. [Cleanup audit](../output/pass3/cleanup-verification.json).

Stopped after this report. No UI run, sealed holdout access, push, deployment or readiness claim.
