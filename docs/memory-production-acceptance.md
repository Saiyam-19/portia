# Production memory acceptance — 2026-10-12

**PASS.** The release is live at https://portia-berthing.vercel.app.

- Runtime commit: `56c274db7aa072bd86cf7c0c0b96e4cee833de26`, pushed to `main`.
- Vercel project: `saiyam-19s-projects/portia-berthing`; deployment `dpl_AMTo4LsZKMGF1FoyF5FA46TqkcMT`, Ready, Node 22.
- Convex production: `o-one-labs:portia:prod`, `joyous-kookabura-196`.
- Final hosted browser report: `2026-10-12T15:18:14.050Z`. Two synthetic real Better Auth users; real Model 1 requests, hosted Next routes, actual just-bash SQLite workers/WASM, and production Convex persistence. No mocked provider or storage.

## Hosted results

| Behavior | Observed evidence | Result |
| --- | --- | --- |
| Cross-chat recall | A saved two unique facts through model tools; a new chat returned the exact callsign without receiving it in the prompt | PASS |
| Scratchpad persistence | Model saved Markdown working notes; Memory panel displayed them after reload and fresh sign-in | PASS |
| Scratchpad isolation | New chat received no original-chat note marker | PASS |
| User isolation | User B saw none of A's facts; foreign conversation reads/deletes, forged owner, missing bridge secret and foreign Origin were rejected | PASS |
| Forget | Actual Memory-panel button removed one fact and notes, retained the other fact; new-chat recall could not retrieve the deleted value | PASS |
| Idempotent deletion | Repeating the exact deletion request returned success at the same epoch | PASS |
| Source-chat deletion | Actual Delete conversation UI removed the remaining derived fact; absence persisted after fresh sign-in; B's independent fact survived | PASS |
| Session revocation | Sign-out revoked memory access even with an unexpired prior JWT | PASS |
| Product cleanup | Clear-memory and conversation-delete APIs removed both fixtures' visible data | PASS |

The runner completed eight grouped journeys. All scenarios were rerun from cleared fixtures after an initial test-only timing failure: Forget remained pending beyond Playwright's five-second default. The original request returned HTTP 200 and Convex showed the deletion fully applied with no pending writer. The runner now waits for the actual response before inspecting the UI. The successful deletion took 6.694 seconds. Product code did not change between attempts.

No browser page errors or unexpected auth/chat/memory HTTP or console errors occurred. Existing `/terms` and `/privacy` links returned 404; those unrelated missing pages remain. Vercel's error-log scan over the acceptance window was empty. The observed provider account-usage delta during the successful rerun was approximately $0.010514; this is not a total for all diagnostic attempts.

## Release and source preservation

The exact production accounts, project IDs and deployment were checked before writes. The legacy Supabase source had zero users, conversations and messages, reconfirmed immediately before promotion. Convex production was empty and exported before its first deployment. Production received separate freshly generated auth/bridge secrets. Development `brilliant-whale-380` and the legacy Python API project were preserved.

Main passed 123 tests across 27 files, TypeScript and lint. Vercel's clean Linux production build passed. Staged login rendered and unauthenticated memory returned 401; canonical-origin browser acceptance followed promotion. Vercel metadata and canonical-URL inspection identified the runtime commit above. Later main commits document evidence and improve the excluded test harness; deployed application code remains the tested runtime revision.

Earlier unfinished UI work remains byte-verified in two stashes:

- Source: `3bbb3277e94814e552036a54413265e824ad6dca` (40 paths).
- Previously ignored mock assets: `784d328eeac04d91d1f1f729dfe8892901be6795` (six assets).

The verified integration UI is included in the release. Original migration/memory worktrees and private local environment files were preserved.

## Fixture and process cleanup

After product-level deletion, a temporary internal mutation restricted to the two exact fixture emails/IDs removed residual namespaces, snapshots, operation receipts, request budgets and auth children, then users. It required cleared memory, no conversations/runs/forms/notes and no active writer. It removed two users and 32 residual app rows. The mutation was then removed and the final backend redeployed; function metadata confirms it is absent.

Read-only post-cleanup audits found:

- All nine application tables empty, including SQLite snapshots and Markdown scratchpads.
- All seven audited Agent tables empty, including threads, messages and stream deltas.
- Zero auth users, sessions, accounts, verification or plugin-user records.
- Shared signing-key and rate-limit records preserved.
- Both deleted users' previously valid session cookies denied memory access with HTTP 401.

Both owned browser/runner process groups were verified stopped without respawn. Existing listeners on 3000, 3210/3211, 5174, 5198 and 9749 remained. No production server was stopped.

## Reproduction and evidence

`scripts/memory-production-e2e.mts` requires the exact canonical/Convex URLs, `MEMORY_PRODUCTION_ACCEPTANCE=authorized`, deployment ID, full release commit and a private evidence directory. Resumption rejects a different deployment/commit and preserves captured browser errors. Administrative fixture cleanup remains a separate exact-identity operation; the runner alone does not remove auth users or residual receipts.

Ignored `.local/production-release/` artifacts include deployment metadata, pre-cutover backup, upload manifest, successful `acceptance/chat-memory-acceptance.json`, screenshots, post-cleanup table audit, runtime-log scan and process inventories. Credentials and browser resumption state were removed after cleanup. These artifacts are not committed.

Hosted checks exercised fresh sessions and requests, not a forced restart of Vercel or Convex infrastructure. Actual process-restart recovery and concurrent writers were separately verified in the local integration/prototype acceptance. This release verifies explicit user-directed facts and per-chat notes, not automatic background learning. Deletion removes current application records and future recall; it does not erase already delivered text, provider records or historical backups.
