# Acceptance — 2026-10-12

PASS: standalone prototype, real local Convex. No cloud or chat integration.

- Runtime: v22.23.2; just-bash 3.6.0; Convex SDK 1.46.0.
- Backend: precompiled-2026-09-28-5c7cb5b, loopback 3220/3221.
- Completed: 2026-10-12T09:26:03.059Z.
- TypeScript: npm run typecheck passed.
- Runtime contracts: npm test passed (3 tests). Initial pre-implementation run failed all 3 for missing persistence/deletion/validation.

| Integration scenario | Result |
| --- | --- |
| cold process and backend restart restores SQLite plus Markdown | PASS |
| simultaneous independent writers retain every update | PASS |
| idempotent retries do not duplicate writes; mismatched retry rejected | PASS |
| signed identities enforce cross-user, anonymous and forged-token isolation | PASS |
| crashed writer leaves a durable queue that another process recovers | PASS |
| expired leases, incorrect revisions and stale fencing tokens reject publication | PASS |
| forget purges persisted content, rejects stale writers and prevents resurrection | PASS |
| namespace deletion erases snapshots and queued payloads, and revokes in-flight work | PASS |

Tests use independent Node processes, real just-bash SQLite, actual backend termination/restart with the same disk store, and ephemeral signed JWTs. Simultaneous writers retained all 16 distinct updates. Deleted fixture text was absent from recalled facts, summary, scratchpads and raw SQLite image; old persisted snapshots and completed operation payloads were removed.

All prototype process groups stopped; 3220/3221 closed. Existing application listeners preserved. Process inventory and exact timing are in ignored .local/acceptance.json and its runDir.

Two earlier harness failures came from inspecting naturally exited macOS child processes during cleanup; the final harness awaits normal exits and separately verifies ownership for intentional termination. The one leftover backend from the first failure was identified by exact PID/group/command/cwd and stopped; later runs cleaned up automatically.

These results establish local persistence/concurrency behavior, not production capacity, hosted worker packaging, live user login integration, or physical erasure from underlying storage/backups.

## Tested source hashes

| File | SHA-256 |
| --- | --- |
| src/client.ts | 18be9a5435e5c53ea7578588cd9d4b63aadfe1600ad23e4fe60d556722cf8368 |
| src/runtime.ts | 519563e039660ed78ecbf41f3ff50315e2fd275d504556ec311f8b1ff6ca98c8 |
| convex/auth.config.ts | 002ceedd0f271b39e378684e5740258d28b944f85d74b7e714725c4c8d0eb6d6 |
| convex/memory.ts | 7cbfa15bdf386f3599def1a439f34f362f48a5282fcd96796eed3d6ab3db71cb |
| convex/schema.ts | 04a666628dee579a693924e8ac7a03d815b019ee014815bcb793a165a7fe2dbf |
| convex/validators.ts | fd761860610efb1f8c3e2753b853e6a126116d3e7236d3795cf39337afbcfc6f |
| scripts/client-process.ts | 76ee927e920e6551bf0a63dc53756859e9f78618b7d107c367cb798cd937a5e1 |
| scripts/integration.ts | e7af7815539f99075d59e8a73b95dce3340b71b736798a5dd2641659f7eb7d1a |
| tests/runtime.test.ts | 05275bee27f25d70fd17d55f3da348057804a3e70de7706381ec4245d4cb80a0 |
