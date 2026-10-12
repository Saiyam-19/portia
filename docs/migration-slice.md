# Historical migration checkpoints

**Final verification:** see [full migration acceptance](migration-acceptance.md). Both paid aliases now pass the normal dashboard specialist/calculator workflow. The development runtime is complete; production cutover remains separate.

Current runtime now uses the normal `/dashboard` with fresh basic email/password signup (intentionally unverified), canonical `/api/auth` and `/api/chat`, and no Supabase/Python runtime. No user/history import is needed for the empty source database. See [current setup](../README.md) and [deployment configuration](deployment.md). Entries below are retained as historical evidence and do not describe the final auth/UI state.

# Migration development slice

**Current status (2026-10-09): paid models restored at the user's request; a small paid chat/form smoke test passed.** The configured key now has purchased credit. Temporary free mode and the earlier funding blocker below are historical.

`/migration` is an isolated development environment for the Next.js + AI SDK + Convex migration. It does not replace the legacy app. The current source includes the legacy bundled tariff-specialist domain, bounded calculator semantics, vessel lookup/manual fallback, structured forms, and durable tool history. Existing-user/history migration and production cutover remain separate.

Implemented path:

- Better Auth email/password sign-in under `/api/migration/auth`; public sign-up is blocked. Account provisioning requires the private server provisioning header as well as the email allowlist.
- Two public model aliases mapped privately to the existing backend model IDs. An optional test override works only when test mode is enabled and the model is explicitly free; the UI labels this state.
- AI SDK `ToolLoopAgent` main and port-specialist orchestration with `maxRetries: 0`, 12-step/4,096-output-token per-agent limits, a shared 16-provider-call/three-specialist budget, 60-second provider gaps, and a 240-second route deadline.
- OpenRouter requests require parameter support, deny data collection, require ZDR, and disable provider fallback.
- Convex Agent component owns model messages and threads. Application tables store ownership, run leases/fences, idempotency, and durable pending forms.
- Every closed model/tool step is checkpointed under the active run fence before the next provider step. The final unresolved `ask_user_input` message and durable form are persisted atomically; completion does not duplicate checkpointed messages.
- All 17 files under `data/ports` are copied byte-for-byte from the legacy source, verified by SHA-256, allowlisted by slug, and explicitly included in the chat route deployment trace.
- Port specialists preserve document filename/section citations, effective-date and expiry warnings, rounding/units, source currency, dated FX questions, GST handling and static-reference labeling. The restricted Decimal parser matches the legacy 40-digit arithmetic, half-up `round`, precedence and abuse bounds.
- Vessel calls use only `https://api.vesselapi.com`, reject redirects, enforce 10-second cancellation-aware timeouts and bounded upstream/tool output, and ask for GRT/DWT/LOA/draught when no key or safe result is available.
- The browser can submit only a bounded question or stored form response. It cannot supply history, assistant messages, tool results, provider IDs, or generated state.
- The narrow Convex HTTP bridge requires a fresh session-backed JWT and `PORTIA_SERVER_SECRET`, validates the live Better Auth session, and calls only internal functions.
- Pending forms block new questions transactionally. Form submissions validate the stored schema and consume the matching tool call once.
- Stop persists cancellation and aborts the local provider request; a two-second Convex status poll covers cancellation from another Next worker. Scheduled lease recovery releases hard-terminated runs.
- Sidebar and message history use paginated, owner-checked public queries with safe projections.
- Safe history projections include bounded text plus stable tool call ID/name/status only; raw inputs, outputs, provider metadata/options and private mappings remain server-side. Form responses accept a bounded optional note.

## Full domain source update — 2026-10-09

The previous verification sections below describe earlier vertical-slice checkpoints. The current source now ports the complete legacy `backend/agent.py` domain surface: main orchestration, all 16 port slugs/17 tariff files, specialist calculation, vessel search/detail, and structured-input suspension/continuation. This update is covered by deterministic mock-provider, calculator, checksum, vessel, fencing, checkpoint and malformed-tool-history tests. Parent-owned cloud deployment and paid live domain inference remain required before live acceptance; no model call or deployment was performed during this source update.

Current local source validation for this domain update: 87 migration tests across 19 files pass; TypeScript is clean; focused lint has zero errors and four generated-file warnings; `git diff --check` passes. A production build was intentionally left to the parent because the existing review server owns this worktree's `.next` directory.

Development target is fixed to `brilliant-whale-380`. Both Next.js and Convex fail closed unless `MIGRATION_DEV_ENABLED=true` and their configured Convex URLs match that target. Migration cookies use the `portia-migration` prefix so they do not overwrite legacy sessions on another localhost port.

Required server configuration names are documented without values: `MIGRATION_DEV_ENABLED`, `MIGRATION_ALLOWED_EMAILS`, `PORTIA_SERVER_SECRET`, `BETTER_AUTH_SECRET`, `SITE_URL`, `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `OPENROUTER_API_KEY`, and `LLM_ALLOW_PAID`. `MIGRATION_TEST_MODE` plus `MIGRATION_MODEL_OVERRIDE` is optional and restricted to explicit free model IDs.

Checks (Node 22):

```sh
npm run typecheck
npm test
npm run lint
```

The tests are offline and mocked for provider behavior. They cover Convex isolation, session denial, idempotency ordering, pending-form blocking, form validation/one-time consumption, fencing/cancellation, malicious browser payload rejection, deployment gate failure, actual SDK transport serialization, token freshness/refresh, safe output/error projections, proxy origin handling, and one-call behavior for retryable provider errors.

## Verified on 2026-10-09

- Independent adversarial source review: PASS for this development slice after correction/recheck rounds. This is not production approval.
- 33 migration tests across 14 files pass; TypeScript and production build pass on Node 22.23.2 / Next.js 16.3.8. Full lint: zero errors, four generated-file warnings and one existing sidebar hook warning.
- The existing Python backend's 19 offline tests pass at the source baseline.
- Convex deployment/code generation succeeds on `o-one-labs/portia`, development deployment `brilliant-whale-380`.
- Real auth: unauthorized signup returns 403; private synthetic-account provisioning and sign-in succeed. Revoked sessions cannot use an unexpired JWT on the server bridge.
- Real persisted data: duplicate requests do not create another run; pending forms block new questions; forged tool IDs are rejected. A second user and an anonymous caller receive no protected conversation data. Public reads return null/empty on session loss to avoid reactive-query logout races; writes retain strict authorization.
- Brave browser: login, saved-history/form reload, form submission, second-user isolation, Stop loaded from persisted run state, and logout verified. The final browser pass produced no new console errors.
- The browser-submitted form values persisted exactly. OpenRouter returned **HTTP 402: the account has no purchased credits**. The failed run released its lock and retained submitted form values.
- Successful model generation and model-driven form creation/continuation are **not accepted yet**. The stored form used for persistence checks was an explicitly labeled synthetic fixture, not an AI-generated response. Active Stop verification likewise used a labeled synthetic run; cancellation of actual paid inference across workers remains unmeasured.
- Existing users/history have not been migrated. Full tariff/calculator/vessel/specialist parity, password-import rehearsal and production cutover remain later phases.

At that checkpoint the user had not yet authorized a free override. The user has since explicitly authorized temporary free models; see the live verification update below. No credits were purchased.

## Live free-model verification update

This section records the earlier free-mode checkpoint; paid mode is now active.

The configured server-only override is `apodex/apodex-1.1-mini:free`. Both public aliases use it while `MIGRATION_TEST_MODE=true`; `LLM_ALLOW_PAID=false` prevents accidental paid routing. Provider constraints remain `max_price` zero for prompt/completion/request, ZDR required, data collection denied, required parameters, and no provider fallback. Other free candidates were rejected when their endpoints could not meet the existing retention policy; those restrictions were not weakened.

Real browser checks with synthetic input and real model responses passed:

- Model-generated vessel/port form, persisted before display.
- Reload with the form pending, submission, and a successful response using the exact submitted values.
- Complete answer persistence after another reload.
- Follow-up using saved context; both public aliases exercised.
- Form cancellation followed by a model acknowledgement, without re-asking.
- Stop after actual answer tokens started streaming; stored state became `stopped` and its active run was cleared.
- Second-user denial for every exercised conversation.

OpenRouter account usage and key usage both remained **0** after these requests. The free-model tool-call probe also reported cost **0**. These were real model calls, unlike the earlier seeded form fixture.

The long-response test found an actual blank-answer defect: the model exhausted 1,200 output tokens on reasoning and returned no visible text. Free mode now disables optional reasoning. A Convex regression additionally prevents any reasoning-only/blank result without a valid form from finalizing successfully; the test failed before the fix and passed afterward. Paid model reasoning settings remain unchanged. Stopped partial output is currently discarded; preserving partial answers is part of later chat parity work.

The free-routing and empty-answer changes received a bounded independent source-review PASS. A real Stop test also exposed expected aborts being treated as errors; cancellation now preserves `AbortError` semantics and skips post-abort completion writes. That fix passed bounded review and a repeated live Stop test with no new browser errors.

Final checks: **38 tests in 15 files, TypeScript and production build pass**; lint has no errors and five existing/generated warnings. Evidence: `.local/free-model-live-acceptance.json`, `.local/free-model-tests.log`, `.local/free-model-build.log`, and the `free-model-chat-verified.jpg` screenshot. This verifies the chat path, not full tariff/calculator/vessel parity or production cutover.

To restore paid models later, only after explicit user approval and funded provider access: set `MIGRATION_TEST_MODE=false` and `LLM_ALLOW_PAID=true`, then restart/redeploy the relevant Next.js environment and reverify both aliases. Original private mappings remain intact. Leaving paid opt-in false fails closed if the free override is disabled.

## Paid smoke test — 2026-10-09

The user explicitly requested paid routing again and a very small complete-path test. The existing migration and legacy-backend keys match; the key was verified funded with $5 account credit before testing. Private migration configuration now has `MIGRATION_TEST_MODE=false`, an empty override, and `LLM_ALLOW_PAID=true`. Provider mappings and privacy settings were preserved.

The test exposed an advertised-tool/storage mismatch: a text field could legally include `options` in the model-facing schema, while storage rejected it. Two initial Model 1 calls failed to persist. A regression reproduced the defect; shared model/storage input schemas now use distinct field variants, allowing/requiring options only for radio fields. Persisted error states also produce a visible generic error instead of an unexplained blank response. The fix received bounded independent review.

After the fix, Model 1 generated and persisted a one-field port form. The form survived reload; Model 2 continued with the submitted value and answered exactly **`Port: Mumbai`**. That answer also survived reload. Run records confirm both aliases were exercised. No new browser console errors were observed during this smoke test.

Observed key usage increased by **$0.012008** total, including the two diagnostic calls; remaining reported account credit was **$4.987992**. No further inference calls were used for checks. Final local validation: **41 tests across 15 files, TypeScript and production build pass**; lint has zero errors and five existing/generated warnings. Evidence is in ignored `.local/paid-smoke-acceptance.json`, `.local/paid-smoke-tests.log`, `.local/paid-smoke-build.log`, and `paid-smoke-verified.jpg`.

This validates the currently implemented authenticated chat/form/persistence path. Full tariff/calculator/vessel parity, existing-user/history migration and production cutover remain unfinished.

## Review corrections

The independent reviewer identified and rechecked ownership-conditioned cancellation, strict transport payloads, authenticated query mounting/account reset, expired-run fences, exact unanswered tool/form pairing, private account provisioning, persisted cross-tab Stop state, finalization polling races, and safe stream projections. Real browser verification additionally found the Next.js internal-hostname origin mismatch and the logout subscription race; both received regressions and bounded source re-review.

Provider errors are sanitized with the SDK's supported model middleware because this pinned `ToolLoopAgent` does not expose an `onError` option. Thrown errors, error chunks and asynchronous stream failures are redacted before the SDK logger sees them; status-only telemetry and cancellation forwarding are tested.

## Handoff and local operation

Work remains uncommitted in the attached managed worktree based on `ec30d1537edd5819b5c226e2ba670bf7bfba88ad`. The original checkout is preserved. Port 3001 was already stopped when the free-model follow-up began; unrelated running services remain untouched. No push or production deployment occurred.

The paid-model preview is intentionally retained for interactive review at `http://127.0.0.1:3002/migration`. The existing server was reused: supervisor PID/PGID `18497`, Node PID `18505`, Next server PID `18506`; cwd is this worktree. Cleanup traps are installed on the supervisor. Revalidate those identities before any later termination. Start it only when no compatible instance is running:

```sh
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run dev -- --hostname 127.0.0.1 --port 3002
```

Local development credentials remain in ignored mode-600 `.env.local`; synthetic test credentials are in ignored `.local/migration-test-users.json`. The two synthetic accounts and labeled fixtures remain on the isolated development target. Extra HTTP verification sessions were revoked and their temporary session file removed. The browser tab remains open on the verified saved reply, signed into the synthetic development account for review.

Ignored evidence: `.local/migration-final-acceptance.json`, `.local/migration-cloud-proof.json`, `.local/migration-browser-continuation-proof.json`, `.local/final-tests.log`, `.local/final-build.log`, `.local/final-lint.log`. These contain test evidence rather than production acceptance. The screenshot is a synthetic persisted-form proof.
