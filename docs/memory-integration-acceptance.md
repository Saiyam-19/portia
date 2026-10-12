# Chat memory integration acceptance — 2026-10-12

**Result: PASS for local development acceptance.** Portia's normal chat UI now uses the memory layer. No hosted deployment or production cutover was performed.

## Browser → model → storage → UI

Actual Next.js production build on loopback 3022, actual local Convex on 3220/3221, real Better Auth accounts, real Model 1 requests, and real just-bash/SQLite tools. All account contents are synthetic.

| Requested behavior | Evidence | Result |
| --- | --- | --- |
| Cross-chat recall | Chat A invoked remember tools for unique facts; chat B answered the exact saved callsign without that value in its prompt | PASS |
| Scratchpad persistence | Chat A saved a unique Markdown line through a tool; header Memory panel showed it after reload and both service restarts | PASS |
| Scratchpad isolation | Chat B did not receive chat A's working-note marker | PASS |
| Restart recovery | Next and Convex processes were terminated/restarted against the retained backend store; sessions, facts and notes survived; new model recall succeeded | PASS |
| User isolation | Two actual accounts; foreign conversation/memory read and delete denied; forged owner and missing server secret rejected; second model saw no first-user canary | PASS |
| Memory deletion | Memory panel Forget removed the fact and working notes, preserved another fact, rejected resurrection in new-chat recall; exact deletion retry was idempotent | PASS |
| Source-chat deletion | Actual Delete conversation UI removed the remaining chat-derived fact; deletion survived another app/backend restart; second user's fact remained | PASS |
| Session revocation | A JWT still within expiry was rejected after real sign-out; memory endpoint returned 401 | PASS |

The resumable acceptance runner completed seven grouped journeys. Two already-passed memory journeys were retained while later journeys were rerun after an auth-bootstrap-only correction; the memory core for those retained checks was unchanged. The final report was recorded at 2026-10-12T10:29:07.263Z.

No browser page errors were recorded. Pre-existing Terms/Privacy link prefetch 404s were not treated as memory regressions. Negative security probes intentionally returned rejection statuses.

## Automated checks

- **123 tests across 27 files pass**, including 110 existing migration regressions.
- TypeScript passes.
- ESLint passes; generated Convex files retain pre-existing unused-disable warnings.
- Next production build passes.
- Route traces for /api/chat, /api/migration/chat and /api/memory include SQLite workers and sql-wasm.wasm.
- Client JavaScript scan found no just-bash, provider credential names, bridge-secret name or private model identifiers.

New cases cover fresh context before generation; tool failure abort before another provider call/checkpoint; deletion beyond a 16-operation batch; stale run/writer rejection; multi-source provenance; per-chat note isolation; exact retry after an epoch change; out-of-order scratchpad replay; invalid snapshots preserving the previous state; malformed SQLite round-trip rejection; explicit loopback guards; and recoverable auth bootstrap.

## Defects found and repaired

1. A snapshot projection's property order changed after Convex serialization. Explicit canonical field ordering fixes false mismatch on subsequent batches.
2. The public JWKS endpoint hit the generic auth rate limit under repeated JWT validation. Only that public-key path is exempt.
3. Token bootstrap hit the shared-IP 30/min bucket during real navigation/reload/restart. The authenticated token route now has a bounded 120/min allowance; sign-in remains 8/min and signup 4/min. Convex reuses its already-confirmed initial token and the UI exposes Retry instead of an endless spinner.
4. Review found swallowed memory-tool errors, stale note replay, deletion-response retry ordering, incomplete note-receipt cleanup, and snapshot validation gaps. Direct regressions now cover those corrections.

## Independent review

- Source/security reviewer: **APPROVED for local development acceptance; no remaining P0/P1 blocker** after bounded corrections and evidence review.
- Visual reviewer: **PASS** for the scoped populated light-theme desktop/mobile UI. No material findings; existing Plisto design preserved. Clear-all sits below the mobile panel fold and remains in its scroll region.
- Visual review does not establish runtime semantics. Dark mode, screen-reader behavior and the rendered terminal auth-error state were not separately inspected; the auth-error state has an automated component test.

## Evidence artifacts

Ignored local artifacts (not for Git):
- .local/chat-integration-baseline.json — exact imported migration-source hashes.
- .local/run-JBWAUL/chat-memory-acceptance.json — real browser/model result and measured usage.
- .local/run-JBWAUL/synthetic-memory-desktop.png
- .local/run-JBWAUL/synthetic-memory-mobile.png
- .local/run-JBWAUL/processes.json — owned PID/group/cwd/port tracking.
- .local/run-JBWAUL/build.log — production build.
- .local/run-JBWAUL/listeners-before.txt and listeners-after.txt — cleanup evidence.

The recorded resumable acceptance case consumed approximately **$0.012891** of provider usage. This is that measured case, not a claim about all earlier diagnostic attempts. Private browser resumption credentials were removed after success.

## Boundaries

Current records and future memory recall are covered. Previously delivered chat/provider text, backups and physical-disk remnants are not retroactively erased. Existing chat history remains unless that conversation is deleted. A write already durably accepted before disconnect/revocation remains approved; paid inference is never automatically replayed.

Capacity, deployment flags, typed-tool scope and local reproduction are documented in [memory-integration.md](memory-integration.md). All 162 imported source paths were rechecked unchanged in the original migration checkout. Original UI changes were preserved.

## Cleanup

All 40 tracked process records/groups were verified stopped, with no respawn. Local test ports 3022/3220/3221 closed; all original listener PID/address pairs preserved. Private browser-resumption files were removed. Final source fingerprints are in .local/run-JBWAUL/verified-source-sha256.json.
