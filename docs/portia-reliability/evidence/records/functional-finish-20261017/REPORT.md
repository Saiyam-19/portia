# Portia functional finish — bounded repairs, not accepted

**Local implementation applied; functional finish remains incomplete. Final screen:16 PASS /10 FAIL across26 conversations.** Six failures are provider/model stream failures; four are product/fact-fidelity failures. The permitted single evidence-based repair batch is exhausted. No further product edit or retry loop was performed after the final freeze. No production deployment, commit or push.

Final build: `TDdS44FsTSUIBrLOaGEvg`,170/170 hashes matched after all inference. Branch `pass1/golden-and-repairs`, unchanged HEAD `2a77ead22c5a8dc365b58806f38accd4f959b2bd`. The dirty handed-off replacement and unrelated changes were preserved. [Final manifest](candidate-final.json), [post-run verification](freeze-verification-final.json), [handoff-relative diff](repair.diff), [changed files](changed-files.json).

## Changes and observed improvements

- One catalog identity path validates supplied port/terminal/operator relationships before tariff selection. It recognises JSW Jaigarh's legal name and matching name/acronym pairs; known ambiguous Gateway/BPCL labels name their alternatives. Conflicts cannot select a tariff merely because the port argument matches.
- The existing ordinary agent distinguishes rules from calculations, receives one bounded information-step reminder, and keeps explicit rules-only/no-calculated-quotation publication. Code retains result kinds; model prose cannot turn a rule into a completed estimate. GTI quote-duration minutes now reach its hourly calculator.
- Pre-tax official requests exclude GST intake; source-date/rule gaps render as limitations. Supplied official tax rates—including zero—remain rejected, with a precise correction instruction for the agent. Genuine requested GST still requires its actual eligibility facts.
- Independent tool-call outputs keep their order and labels. Repeated same-quote updates replace that quote's current result. Comparison retains unrelated results and is invalidated when a member quote changes. Mixed memory/quote acknowledgements survive. Elapsed-time tools expose the existing supported timezone contract; no time engine was added.

Original GTI, NSFT, JSW Jaigarh and JNPA requests passed on the final build: USD2,122.12 /17,967.20 /2,000.00 /3,464.00, with the expected selected sources, stored quote records, literal output and reload. BPCL Cargo now gives its actual empty/dated-source gap instead of inventing a Mumbai conflict. Reworded1280→1295 correction passed with only water changed. Both independent rules and both arithmetic results survived.

These are conditional retained-source calculations, not verified-current official quotations. No rates, source assets, port coverage or provider/model choices were replaced.

## Exact remaining failures

| Case | Final outcome |
|---|---|
| C2 supplied1005→1020 flow | Opening request235 timed out; no quote. Correction/follow-up were not reached on the final build. |
| Original1280→1295 wording | Opening256–257 produced1280; correction258 timed out. The historical65/1280 record remained; it was not a newly calculated incorrect answer. |
| I01 GTI fractional-hour variant |263 timed out before tool execution. Requested780.16 was not delivered. |
| I04 JNPA12500GT variant |268 calculated/stored4330 correctly;269 failed before public completion. Private arithmetic pass, user-visible flow fail. |
| I05 explicit Mumbai+GTI conflict |270 timed out before tool execution. Direct conflict regressions and the earlier-build live conflict pass cannot substitute for this final-build failure. |
| I11 two elapsed-time outputs |285 timed out before tool execution. Final live90/150-minute results were not delivered; timezone/label changes have unit evidence only for this final case. |
| I03 Jaigarh variant |2640 calculation/source correct, but the saved quote also contains unprovided `vesselCategory: general-cargo`. It does not affect this J-1 amount; saved-fact fidelity still fails. |
| I08 partial NSFT input/correction |Missing empties→2756.88→2851.66 and delta94.78 are correct; saved/current heading still says23 laden after the quantity changes to24. Stale label survives reload. |
| I12 quotes + comparison + separate rule |Both itemized quotes/comparison survive correctly. The agent uses unsupported `Mumbai Indira Dock` as port, so the requested rule is absent. Both unrelated supplied quotes also inherit Mumbai/coastal facts from that separate rule request. |
| I14 tax-inclusive missing details |The same combined identity is rejected, preventing the required focused GST clarification. No inclusive total is invented. An automated unresolved-status check incorrectly looked successful; literal review fails it. |

[Independent final review](independent-review.md) and [acceptance dispositions](acceptance-results.json) govern the result. Automated `PASS_REQUIRES_LITERAL_REVIEW` labels are provisional: they do not override the fidelity failures above. JNPA's rule paragraph also repeats when both pilotage and towage are requested; no extra charge is calculated.

## Verification and evidence boundaries

| Check | Observed result |
|---|---|
| Focused post-repair tests |105/105 pass — [log](repair-batch-focused.log) |
| Full final suite |104 files,1014/1014 pass — [log](final-full-tests.log) |
| Typecheck / production build |Pass — [typecheck](repair-batch-typecheck.log), [build](final-build.log) |
| Source/Convex/affected-test lint |0 errors,6 existing warnings — [log](repair-batch-lint.log) |
| Repository-wide `npm run lint` |Fails scanning generated/history/evidence artifacts:923 errors,8983 warnings — [original log](lint.log). Not represented as a full lint pass. |
| Final functional conversations |16/26 pass;10 fail — [six-core capture](journey-final.json), [original/variant capture](variants-final.json) |
| Memory and persistence controls |Explicit mixed save, server-restart retention, cross-chat recall, forget, stale rejection and duplicate rejection pass. |
| Runtime configuration |All147 new dispatches checked: requested `openai/gpt-6-luna`, reasoning none, no fallback, deny/ZDR, output≤4096 — [evidence](configuration-verification.json) |

The final six-core capture covers literal browser output, public stored text, provider tools and reload. The20-case variant runner additionally captures actual browser UTF-8 response bytes and exact published/stored text equality on completed text replies; a zero-inference Unicode preflight passed. Deliberate waiting forms are assessed by their persisted form/display/reload rather than pretending they contain a published quotation.

The duplicate probe returned the correct409 `Already submitted` response and dispatched no inference. Its harness initially expected200; the raw failed harness boolean is preserved. Source `src/app/api/migration/chat/route.ts` explicitly returns409 for replay. The ledger shows293–294 recall immediately followed by295–296 forget, with no stale/duplicate inference between them. The stale-revision probe also returned409 without inference.

Initial failures and retries remain intact: [first-build independent review](independent-first-build-review.md), first-build manifest/source copies, segmented variant captures, raw provider attempts, failed harness captures and red regression logs. Early capture issues (system-query endpoint, page-size limit and CDP Unicode decoding) were corrected independently of product changes. The verifier stopped for capture failure; its interrupted177 attempt remains unpriced. Old-format chat compatibility is OUT OF SCOPE; its files/history were preserved.

## Cumulative inference cost

296 dispatches, including the prior149; no ledger reset. Provider-reported known cost **USD0.167901625**. **18 attempts remain unpriced**, conservatively reserved at USD0.194009600. Known plus unpriced reserve: **USD0.361911225**. Guard-accounted total: **USD0.393109125**, below the authorizedUSD1.50 cap. No pending attempts remain.

The guard is more conservative than reported usage: it still reserves003/011/043 despite recovered or explicitly reported usage. Reservations are not billed amounts; missing usage is never zero. [Cost summary](cost-summary.json), [reproducible reconciliation](summarize-cost.py), [append-only cumulative ledger](../ordinary-tools-20261017/calls.jsonl), [guard](record.cjs).

## Source gate and cleanup

The bounded functional milestone is **not accepted**. The full trustworthy/current-tariff milestone also remains open:16 catalog entries are not16 executable/current-approved ports. The [per-port/service/date table](../../docs/portia-coverage.md) and existing source registry retain explicit gaps; no broad tariff-research project was started.

Owned Next/Convex/browser process trees stopped; runner exited; ports3022/3220/3221 closed with no respawn or owned survivors. Existing3000/3210/3211/5174/5198 and graph9749 listeners were preserved. IPv6-only3000/5198 respond at their actual addresses (403/200); no unrelated server was stopped. The existing graph daemon and same owned lab were reused. Unmapped shared app/MCP helpers were preserved rather than terminated without verified ownership. [Cleanup](cleanup.json), [owned process registry](owned-processes.json), [related chat-state audit](related-task-states.json).

Test data/history remain under `.local/run-wxVejm`; the original recoverable checkout snapshot and this task's baseline copies remain intact. No new worktree, production migration, publication, purchase or external account change.
