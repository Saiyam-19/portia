Stays: calculator and official tariff engine, persistence storage, UI, dispatch-snapshot stale checks.
Stays: negation, either/or-date, per-call/per-block cue checks; all R1 and D11 regression assertions.
Changes: model emits flat facts; code owns units, saved state, grounding and arithmetic.
Changes: enum yes/no fields, one internal schema repair, code-owned errors and tariff gaps.
Changes: keep instructions are no-ops; corrections replace the named line item.

**Stopped. Reliability goal NOT met.**

| Case | Frozen B | Pass 2 | Classification |
|---|---:|---:|---|
| D11 | 0/3 | 0/3 | interpretation + application |
| D19 including correction | 0/3 | 1/3 | interpretation + application / missing implementation |
| D24 | 0/3 | 0/3 | interpretation + application |
| original-19 | 0/3 | 0/3 | interpretation + application |
| D02 | 0/3 | 2/3 | time-block implementation fixed; remaining interpretation failure |

**3/15 complete cases; 4/18 turns. USD 0.0975605 spent**; rounded-up ledger USD 0.097567. No UI run, sealed-holdout access, deployment or readiness claim. No further inference.

Branch `pass1/golden-and-repairs`. Entry `6781157`; frozen inference revision `0e25f8392bba94473a60fe431ec1debe19279987`. All 93 frozen files unchanged throughout inference. Six user inputs matched frozen B exactly.

**Replay first / stop rule**

Unchanged 42 dispatches: reducer passes **2 → 2 after fix 1 → 6 after fix 2 → 7 final**. Six repair attempts included; five captures missing/incomplete. Every gate is recorded in [42-output gate report](../output/pass2/replay-gates.md); full diagnostics in [baseline](../output/pass2/replay-baseline.json) and [final](../output/pass2/replay-final.json).

Before editing, “clearly improved” was defined as four additional reducer passes with no regressions. After two changes: +4/42, zero regressions; continued. Reducer acceptance is not complete-case acceptance. Planner `complete` alone was also insufficient: an original-19 output had that flag despite rejected facts.

**Six separate test-first commits**

| Change | Commit | Red evidence |
|---|---|---|
| Full-stop evidence | `8e85cad` | 4 intended failures |
| Flat facts / code-owned units and dispatch structure | `2d86514` | 3 failures; added currency regression also failed first |
| Grounding, line-item arithmetic, D02 time blocks | `46f83a3` | 6 behavioral failures |
| Yes/no enums / one schema repair / code-owned errors | `b8fb451` | 6 failures |
| “no verified tariff yet” | `ac8ba76` | 3 failures |
| Keep no-op / named correction | `7cef65d` | 3 failures |

Harness, payload audit and harness type repair committed separately afterward. No implementation changed after live inference started.

**Literal before / after**

Representative exact excerpts, repetition 3. Before: frozen B UI text. After: headless text. Full paired strings for all 18 turns: [before-after.json](../output/pass2/before-after.json), [detailed report](../output/pass2/detailed-report.md).

| Case | Before literal | After literal |
|---|---|---|
| D11 | “A quoted term cannot be assigned to a different charge by its label.” | “The interpretation could not be validated. Your supplied details are saved; no estimate was published.” |
| D19 initial | “USD 1,280.00” | “USD 1,280.00” |
| D19 correction | “berth hire: rate” / “pilotage: rate” / “water supply: rate” | “USD 1,295.00”; retained “USD 825.00”, “USD 390.00”; water “USD 80.00” |
| D24 | “the adjustment conditions are conflicting or withdrawn; confirm the governing terms” | “The interpretation could not be validated. Your supplied details are saved; no estimate was published.” |
| original-19 | “A quoted term cannot be assigned to a different charge by its label.” | “The interpretation could not be validated. Your supplied details are saved; no estimate was published.” |
| D02 | “the start and end events with their full timestamps” / “berth: quoted rate units” | “30.5 hours” / “billable periods 6” / “INR 24,000.00” |

**Actual remaining gates**

- **D11:** all repetitions emitted a canonical port slug in `terminal`; literal terminal grounding rejected it. First also used `taxExemption=yes` for “No tax”.
- **D19:** R1/R2 used `taxExemption=yes`; their corrections then failed because two inputs remained pending. R3 completed both turns.
- **D24:** all repetitions used `taxExemption=yes`. R1 also supplied prose for `moneyRounding`; captured anonymous items lacked separate charge facts. Actual first gate: tax-exemption grounding.
- **original-19:** R1/R3 used `taxExemption=yes`; R2 proposed `minimum=0`, rejected as an unstated number.
- **D02:** R1 used `taxExemption=yes`; R2/R3 completed elapsed time and six-block arithmetic.

[Exact first-gate replay](../output/pass2/live-diagnostics.json). No missing tariff authority affects these fictional quotes. Offline unknown-port/BPCL tests return “no verified tariff yet” without rate questions; reviewed-but-unimplemented branches retain their implementation classification.

**Relaxed checks / limitations**

- Code fills omitted numeric units and normalizes matching currency labels. Wrong currencies, malformed numbers, unsupported dimensions and existing cue checks still reject.
- Preserve no longer requires fresh numeric evidence; it must match an established fact exactly and writes nothing.
- Model no longer supplies evidence spans, hashes, revisions or arithmetic-expression fields. All 18 captured outputs contain flat facts only; code binds dispatch state.
- Historical mock fixtures explicitly select legacy interpretation mode. Assertions unchanged; their coverage does not prove every old workflow through the new front door. Five new-path R1/D11 cue tests pass.
- Flat compilation supports one pending input: failed-turn recovery is an observed application/missing-implementation gap.
- Non-boolean fields retain string values. Wrong semantic categories/fields and grounding failures receive code-owned errors, not schema repairs. These remain reliability blockers.
- Persistence storage, UI, calculator and official tariff assets/handlers unchanged. Supplied-quote planning gained `time-period`. Historic receipt migration across changed validation semantics was not tested.

**Verification / controls**

Full offline suite: **812 pass, 2 fail / 814**. Same two documented pass1 assertion failures in `domain-agent.test.ts`; neither weakened. Additional budget (3), new-path cue (5), headless history (1), payload audit (1) tests pass separately. Focused final run: 110 pass. Final typecheck and scoped lint pass.

18 direct streaming calls; 5 cases × 3 repetitions plus D19 corrections. Same frozen B model `openai/gpt-6.1-sol`, OpenAI provider, requested reasoning enabled/medium, 8192 output limit, one schema repair maximum. Zero repairs, extra retries, fallbacks or transport timeouts. All responses reported zero reasoning tokens; internal reasoning is unmeasured. Temperature/seed remained provider defaults.

Every call reserved worst-case input/output cost before dispatch; next reservation had to remain below USD 0.80. Missing usage would retain the reservation. All usage returned. [Ledger](../output/pass2/live/ledger.json), [freeze](../output/pass2/live/freeze.json), [results](../output/pass2/live/results.json). Cost reporting follows [OpenRouter usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting).

Automatic approval review initially blocked transmission over payload sensitivity; no call sent. Fake-transport audit and an exact fictional-input/private-context guard resolved the concern; subsequent review allowed the run. No credential printed.

**Resources:** 40 tracked command groups exited; zero survivors. Existing ports 3000/3210/3211/5174/5198 preserved. No server started, stopped or reused. Uncertain product-owned cross-chat helpers preserved. [Cleanup verification](../output/pass2/cleanup-verification.json).

Stopped after reporting. Goal remains unmet; no readiness claim.
