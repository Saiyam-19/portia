# Portia chat memory integration

Goal: cross-chat recall, scratchpad persistence, restart recovery, isolation and deletion in the real chat UI.

Baseline: this chat's memory-persistence-prototype worktree, ec30d1537edd5819b5c226e2ba670bf7bfba88ad; 162 allowlisted completed-migration files copied read-only from the other worktree. Import hashes under .local/chat-integration-baseline.json. Original source checkouts/private environments preserved.

Implementation:
1. Promote bounded just-bash/SQLite memory runtime into the app; retain the standalone prototype and its acceptance suite.
2. Add internal owner-scoped Convex queue/leases/revision snapshots under the existing live Better Auth JWT + server-secret bridge. Per-chat Markdown working notes use separate owner/chat/epoch records. No public snapshot read/write endpoint.
3. Add memory tools and bounded untrusted memory context to each AI SDK step. Writes carry active run/fence/epoch and stable tool-call IDs; fail closed on persistence errors. Do not automatically replay model inference.
4. Add an incumbent-style Memory panel to inspect/forget facts and inspect the current chat's notes. Forget/clear invalidates old run epochs and working notes. Conversation deletion removes notes and facts with that source.
5. Actual local Convex + Better Auth + Next production-build browser E2E, live Model 1 using the existing configured provider, separate synthetic accounts. Restart local backend/app with their disk state preserved. No cloud deployment or changes to existing provider configuration.

Acceptance: automated epoch/fence/queue and tool regressions; existing migration tests; TypeScript, lint, build; browser save in chat A, recall in chat B, working-note save/reload/restore, app+backend restart, two-user denial, revoked-session denial, forget and source-chat deletion with no recall in new chats. Keep direct source data in chat history distinct from saved memory deletion. Record model usage without credentials.

Open validation risks: just-bash workers in the Next production bundle; Better Auth's local deployment configuration; deletion during an active stream; session revocation with a cached JWT; bounded storage/queue limits. Parent owns code; subagent review read-only.

Status: COMPLETE for requested local integration. Seven actual browser/model journeys and 123 tests pass; build, TypeScript and lint pass. Independent source and scoped visual reviews pass. Hosted deployment not performed. See docs/memory-integration-acceptance.md.
