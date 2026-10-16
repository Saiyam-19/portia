# Portia audit remediation results

14 October 2026. Changes based on `b64420fcfe0eea206918bfb34cf9cf38112b8302`. **All13 designs received independent adversarial approval before product implementation. Twelve findings are fixed; the dependency finding is remediated with patched versions and an explicitly approved capability restriction for the remaining unpatched advisory.**

**258/258 tests pass. Paid inference: zero calls, $0.** Validation used Node22.23.2, a production Next build, real isolated local Convex/Better Auth, the actual OpenRouter adapter, and synthetic model responses. No production data/configuration changes, deployment, commit or push occurred.

## Review process

Two independent reviewers, `standards_audit` and `adversarial_fix_design`, reviewed every T1–T6 and S1–S7 proposal. They initially rejected designs that could hang during cancellation, exceed the memory deadline, overgrow the deletion queue, duplicate initial requests, reject individually valid Unicode fields, or lose error priority.

Revision R2 resolved those objections. Both explicitly approved all13 designs with no remaining design blocker; implementation began afterward. The detailed decisions and required tests are in [the approved plan](superpowers/plans/2026-10-14-audit-remediation.md).

Post-implementation adversarial review found one additional counterexample: safe cancellation/timeout exceptions discarded their HTTP status. That was fixed and covered by repeated-sanitization tests. Both reviewers then approved their reviewed source scopes. This is an engineering review outcome, not an external security certification.

## Finding disposition

| ID | Result | Change and proof |
| --- | --- | --- |
| T1 | Fixed | Shared stream reader counts actual bytes, handles split UTF-8 and aborts pending reads. Rejecting or never-settling cancellation cannot hold the response open. Chat/cancel/memory and authenticated bridges use it. Boundary/error/lock tests pass. |
| T2 | Fixed | Abortable backoff replaces75ms polling. Both HTTP calls and waits honor the45s drain deadline. First-second contention drops from28 to at most8 calls; long-contention, deadline and abort tests pass. |
| T3 | Mitigated with residual advisory | Nested Undici resolves to7.30.0, selector parser7.1.6 and browser mapping2.11.28. Both memory runtimes expose only the registered SQLite command; printf aliases, awk, network, Python and JS paths fail. SQLite persistence and hostile-value tests pass. Details below. |
| T4 | Fixed | Login errors are alerts associated with fields; submission is guarded and tab switching disabled while pending. Browser observed the disabled tab and `auth-error` association; duplicate-submit regression passes. |
| T5 | Fixed | Mobile toggle exposes expansion/control IDs. Escape closes and restores internal focus, preserves external focus, and link navigation closes the disclosure. Browser keyboard/anchor checks pass. |
| T6 | Fixed | The provider adapter now returns its reader-cancellation promise. A version/hash-guarded postinstall patch is verified by build and test entry points. Actual-adapter tests cover pending body, partial output, disconnect, specialist work, independent SDK timeout/Stop and genuine errors. Changed-build cancellation completes with zero unhandled rejections. |
| S1 | Fixed | Empty/unrelated chat deletion does not change the global memory epoch. Applied, projected and queued provenance determine when a privacy barrier is required. Unrelated notes/runs survive; queued/overwritten source data still purges safely. |
| S2 | Fixed | Proven source deletion has bounded reserved admission, preserving atomic root revocation and stale-writer fencing. Effective-source saturation, memory-disabled deletion, partial-drain/refill, eventual purge and640-operation metadata stress cases pass. Ordinary quotas remain. |
| S3 | Fixed | Specialist check/increment is atomic after the asynchronous tariff load. Four simultaneous tool requests now start at most three specialists; ordinary limits and empty-data behavior remain covered. |
| S4 | Fixed | First question/model/request ID persist in an owner-scoped immutable intent. Creation deduplicates by owner/request ID; claim matches and consumes the intent atomically. URLs contain only conversation IDs. Browser sent4000 CJK characters successfully; stale query parameters cannot replace saved text/model. Failed claim retried with the same ID; concurrent real claims produced one provider invocation. |
| S5 | Fixed | Client/server share field limits; numeric-string and cancellation-note bounds are checked. Full serialized request bytes are validated before transport. Browser rejected eight2000-character CJK fields with actionable guidance, preserved every value, and retained a cancellation note after reload. |
| S6 | Fixed | Unsupported Pricing/Company/Legal links and false agreement copy removed. Remaining rendered internal links/anchors resolve. No legal policies, prices or contacts were fabricated. |
| S7 | Fixed | Allowlisted error types and HTTP status survive repeated sanitization with deterministic precedence. Network causes cannot mask timeouts or401/402/403 guidance. Private provider strings remain hidden. |

## Verification

| Check | Observed result |
| --- | --- |
| Complete baseline and adversarial suite | **258 passed, 0 failed; exit0**. Includes1000 independent arithmetic fixtures within one property test. |
| Real local API journeys | **19/19 passed**, including ownership, replay, form continuation, memory, revoked sessions and short-URL Unicode flow. |
| Concurrent real local mutations/claims | Two creations return one ID; simultaneous claims return200/409, save one user message and invoke provider once. |
| Fresh dependency install | `npm ci --omit=dev --ignore-scripts` succeeds; patch verification then intentionally rejects the missing patch. Running postinstall applies it and verification succeeds. Fresh tree resolves Undici7.30.0. |
| Fresh actual adapter tests | **11 passed** against the installed temporary package, including cancellation timings and real error propagation. |
| Standalone memory prototype | **4 passed**, including the new capability restriction. |
| Production build | **Passed**, local Convex target only. |
| Final TypeScript | **Passed**, no emit. |
| Final lint | **Passed**, existing generated-file/full-document-login warnings retained. |
| Browser | Login error/pending guard;4000-character question; stored intent beats legacy URL/model; reload; same-ID retry; aggregate form recovery; cancellation note; two tabs; mobile disclosure and focus. |
| Narrow layout | Requested320px; existing browser zoom produced291 CSS pixels. Document width291: no document overflow in inspected chat. Zoom preference preserved. |
| UI detector | Existing font-ramp advisory only on inspected changed surfaces; no new functional detector finding. |
| Server cancellation logs | **0 unhandled rejections** after changed-build cancellation that began inside the provider. Durable state `stopped`, active run cleared. |

The original audit's failures are retained in its historical evidence. New regressions are included in the ordinary `npm test` command as well as the focused audit configuration. They are not marked expected-failure or skipped.

## Dependency limitation

The production advisory scan changed from **1 high +6 moderate package records** to **0 high/critical +2 moderate records** (`sprintf-js` and its `just-bash` parent). `sprintf-js@1.1.3` has no published patched version in the checked registry; the [advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) also records no patched release.

The reviewed mitigation disables the affected printf command and other unused capabilities in serving and prototype memory runtimes. Application code invokes a fixed SQLite command with separate arguments and quotes stored values; it does not expose an arbitrary shell. Tests check printf aliases, `command`/`builtin` prefixes, awk, curl/wget, Python and JS, plus inert hostile stored strings.

This reduces demonstrated application reachability; it does **not** erase the upstream package advisory or claim a general-purpose secure shell. No vulnerable-version relabeling or advisory suppression was used. Reassess when upstream publishes a fix or when expanding memory capabilities.

## Provider patch maintenance

`scripts/patch-provider-cancellation.mjs` accepts only adapter3.1.0 and the reviewed pristine/patched SHA256 values. It changes one statement: `reader.cancel(reason)` becomes `return reader.cancel(reason)`. Unknown package versions/bytes fail closed; repeated application is idempotent. `postinstall` applies it; `prebuild`, `pretest` and the Vitest configuration verify it, including direct focused-test invocation.

The unchanged temporary adapter copy reproduced the rejection; the one-statement variation passed the same integration. The installed patched adapter and a fresh installation then passed. A future adapter upgrade requires explicit review of whether the patch is still needed and corresponding guard updates.

## Reproduce

Use Node22 and existing repository setup instructions:

```sh
npm ci
npm test
npm run typecheck
npm run lint
npm run build
node node_modules/vitest/vitest.mjs run --config vitest.audit.config.ts
```

The isolated local harness remains documented in the original audit. To keep evidence separate, use `PORTIA_AUDIT_OUTPUT_DIR` for both lab and API runner. The synthetic provider also supports a one-time preclaim interruption for `AUDIT_SAVED_RETRY` and an eight-field `AUDIT_FORM_MANY` fixture. These are audit-only behaviors, activated by the explicit Node preload; application source never imports the substitute.

Evidence: `.local/audit-fixes-20261014/final-tests.json`, `local-api.json`, `browser-and-install-evidence.json`, `browser-scenarios.json`, `claim-retry-events.jsonl`, screenshots and cancellation result. Command/process logs use `fixes-*` names in `.local/audit-20261014/`. The current local lab build/process records are identified by `.local/memory-chat-lab.json`.

## Scope and release status

Source changes are local and uncommitted. The new optional initial-intent fields/index require the matching Convex backend before the changed frontend is released. This task did not deploy either. The current `.next` artifact targets the isolated lab; rebuild for an intended deployment environment.

No real model answers, live vessel lookup or current-authority tariff certification were purchased/retested. Deterministic, adapter, persistence and browser evidence supports these fixes; it does not certify every possible future model or infrastructure behavior.

Cleanup status is recorded in `.local/audit-fixes-20261014/cleanup-summary.json`: owned lab/workers stopped, temporary browser tabs closed, responsive override reset, unrelated services preserved. Synthetic audit databases remain ignored and stopped; no real accounts/data were deleted.
