# Full migration acceptance — 2026-10-09

## Scope and result

Full legacy agent behavior is implemented in the normal dashboard and verified against Convex development using a local **production build**, not the former `/migration` prototype. Independent source review: PASS. Production cutover has not occurred. Work remains uncommitted in the attached migration worktree; the original checkout and its separate UI refactor are preserved.

The user confirmed an empty Supabase source and chose fresh email/password accounts without email verification for now. No historical data/credential import or email-provider setup is required. A read-only inventory at 2026-10-09T12:47:12Z found zero users and exact zero conversation/message counts; all OAuth providers were disabled.

## Verified evidence

| Check | Result / scope |
| --- | --- |
| Automated checks | 110 tests across 22 files; TypeScript, lint and production build pass |
| Independent review | Domain, auth, ownership, lifecycle, stream cleanup, draft recovery and provider compatibility fixes passed bounded review |
| Tariff assets | Both chat-route build traces include all 17 unique files; byte equality and SHA-256 checks against legacy assets pass |
| Fresh authentication | Two fresh basic accounts created through the actual auth endpoint; emailVerified remains false; browser signin/signout/account switching works |
| Isolation | Anonymous/revoked-session/cross-user reads denied; cross-user deletion denied; second browser account sees no first-account history and cannot open its URL |
| Forgery controls | Wrong origin 403; forged history and unknown alias 400; user JWT without server bridge secret 401 |
| Real form workflow | Model 1 generated the GRT form; reload preserved it; submission retained the additional note and resumed real inference |
| Model 1 domain | Real specialist/calculator produced INR 180,000 base + 32,400 GST = 212,400; changed GRT yielded 90,000 + 16,200 = 106,200 |
| Model 2 domain | Same saved conversation; real specialist/calculator produced INR 180,000 + 32,400 = 212,400; reload preserved answer |
| Calculator execution | Safe server metadata records three real calculator calls for each observed successful alias; deterministic tests cover arithmetic parity separately |
| Citations | Both live answers included bundled filename, effective date, validity caveat, supplied dated FX and charged included-period wording |
| Form cancellation | Explicit synthetic pending-form fixture; actual Cancel UI retained note; real model replied CANCEL_OK; saved form became cancelled |
| Durable Stop | Explicit synthetic active-run fixture with no inference; newly opened tab exposed Stop from stored state; cancellation cleared activeRunId and persisted stopped |
| Stream failure | A live provider error exposed missing cleanup; actual WebStreams regressions now prove EOF/error/pending-read cancel finalization exactly once; drafts await durable success |
| Deletion | Only two temporary lifecycle fixtures deleted; owner root access revoked immediately, with bounded scheduled cleanup |
| UI | Desktop and narrow mobile inspected; history drawer opens/closes; viewport restored; alias-only model UI retained |
| Runtime separation | No legacy runtime environment variables present; normal flow works without Supabase/Python configuration; browser bundle scan found no credentials or private model IDs |
| Dependency audit | Runtime audit: zero high/critical advisories; three moderate advisories remain |

The voyage and test accounts are synthetic. These checks prove execution and persistence, not current official tariff validity. VesselAPI was not configured in the source or replacement environment: manual fallback and bounded integration behavior are tested; a live upstream vessel lookup is not claimed. Semantic memory, uploads, extraction/chunking and retrieval are not legacy features and were not added.

## Findings repaired during live verification

1. OpenRouter rejected the optional `parallel_tool_calls` parameter under `require_parameters=true`. Neither selected paid model's eligible endpoint catalog advertised that parameter. It was removed; privacy and fallback constraints were retained. An actual SDK serialization regression failed before the fix and passed after it.
2. A Model 2 provider error left a run active because the SDK's TransformStream error path skipped its finish callback under Node 22. Explicit ReadableStream finalization now covers all terminal paths and always releases polling, token refresh and registry state.
3. Transport completion could clear a failed draft before durable acknowledgement. The reducer now requires matching persisted success and preserves edits made while acknowledgement is delayed.

The earlier provider error's exact upstream cause was not recovered from privacy-redacted logs. A bounded Model 2 calculator diagnostic and the full production-build retry both succeeded. No privacy relaxation or automatic paid fallback/retry was introduced.

## Cost and artifacts

Total additional OpenRouter usage for this verification, including diagnostics and cancellation acknowledgement: **$0.2129214**. Reported remaining credit: **$4.7750706**. Earlier prototype testing cost $0.012008 separately.

Ignored local evidence:

- `.local/full-migration-auth-acceptance.json`
- `.local/full-migration-live-runs.json`
- `.local/full-migration-lifecycle-acceptance.json`
- `.local/full-migration-provider-acceptance.json`
- `.local/full-migration-build-assets.json`
- `.local/full-migration-client-bundle-check.json`
- `.local/full-migration-final-build.log`
- `.local/full-migration-convex-push.log`
- `.local/full-migration-runtime-audit.json`

Screenshots in the task visualization directory: `full-migration-desktop.jpg`, `full-migration-mobile.jpg`, `full-migration-isolation.jpg`, `full-migration-cancel-form.jpg`, `full-migration-stop.jpg`. Credentials and auth sessions are not committed; transient API sessions were revoked. The browser retains the main synthetic tariff demonstration.

## Process ownership

The previous owned development process group 18497 was stopped after identity/cwd/ancestry verification, clearing pre-fix request timers; no survivors remained. The same port now serves the verified production build with `next start`: PID 46681, parent/group 46672, port 3002. It is intentionally retained as the user-facing preview. Unrelated ports 3000, 3210/3211, 5174 and 5198 remained served by their original processes. No temporary test/build worker remains.
