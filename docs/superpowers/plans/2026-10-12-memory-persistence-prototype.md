# Memory persistence and concurrency prototype

Goal: verify restart recovery, simultaneous writes, user isolation and deletion before chat integration.

Scope: standalone package in prototypes/memory-persistence; no app/chat changes, cloud deployment, live user data or model calls. Isolated managed worktree at ec30d1537edd5819b5c226e2ba670bf7bfba88ad; original UI and migration worktrees preserved.

Design: Node just-bash with SQLite and Markdown in a virtual filesystem. Convex owns user-scoped namespaces, durable operation queue, idempotency receipts, expiring writer leases and monotonic fencing tokens. One writer per namespace restores a checkpoint, applies a bounded ordered batch, and atomically publishes a snapshot/revision. Snapshot bytes are capped at 512 KiB in a Convex document for this prototype; publication, receipt updates and deletion of the previous snapshot share one transaction. No exposed object-store URLs.

Deletion: per-key tombstones reject later replays, remove values and regenerate summary; conservatively invalidate all scratchpads on forget. SQLite secure_delete plus VACUUM remove deleted content from current exported pages. Completed queue records retain hashes, not content. Namespace deletion revokes reads/writes and erases all bounded related rows. Copies already downloaded by authorized readers cannot be revoked.

1. Runtime contract tests first: restore SQLite + Markdown, forget and reject malformed inputs.
2. Convex coordination: auth-derived owner, bounded indexes/queue, idempotency, leases/fences, atomic checkpoint and erasure.
3. Process harness: ephemeral signed JWT identities, dedicated local backend, child writer processes, deterministic interruption, backend restart, owned process registry and cleanup.
4. Verify real backend: concurrent independent writers, crash-before-commit, expired writer rejection, retries, anonymous/forged/cross-user access, deletion and anti-resurrection.
5. Deliver reproducible commands and exact evidence; leave chat untouched.

Acceptance commands: npm test; npm run typecheck; npm run test:integration (requires cached Convex binary or MEMORY_CONVEX_BINARY). All local ports and artifacts belong to the harness; unrelated processes preserved.

Status: COMPLETE for prototype scope. Eight real-backend scenarios, three runtime contracts and TypeScript pass. See prototypes/memory-persistence/ACCEPTANCE.md. Chat integration not started.
