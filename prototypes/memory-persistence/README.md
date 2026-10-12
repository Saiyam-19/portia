# Memory persistence prototype

Standalone server-side prototype: just-bash + SQLite + Markdown, persisted and coordinated by a **real local Convex backend**. No chat UI, model calls, cloud deployment, or existing application/auth changes.

## Run

Prerequisites: Node 22 (verified 22.23.2), npm, macOS `ps`/`lsof`, and a local `convex-local-backend` executable. The harness discovers cached Convex binaries under `~/.cache/convex/binaries`; alternatively set `MEMORY_CONVEX_BINARY` to its absolute path. It does not download or install a backend.

From this directory:

```sh
npm ci
npm test
npm run test:integration
npm run typecheck
```

Integration generates the ignored Convex bindings required by the final typecheck. It starts its own loopback backend on **3220/3221**, pushes only this package's schema/functions, generates ephemeral RSA-signed test identities, then stops all owned process groups. `MEMORY_PROTOTYPE_PORT` changes the port pair. An occupied port or existing run lock causes refusal; unrelated software is never terminated.

No cloud deployment variables or credentials are used. The harness passes an explicit loopback self-hosted URL/key to the pinned local Convex CLI. `MemoryClient` also refuses non-loopback URLs.

Outputs under ignored `.local/`:

- `acceptance.json`: last successful acceptance report.
- `run-*/processes.json`: PID, parent PID, group, command, cwd, ports and final cleanup state.
- `run-*/listeners-{before,after}.txt`: global listener preservation.
- Per-run backend data/logs, retained for inspection; all data is synthetic.
- `integration.lock`: prevents duplicate harnesses, removed during normal/signal/error cleanup. If the runner itself is forcibly killed, inspect its PID/registry and stop only verified owned survivors before removing its stale lock.

## Components

| File | Responsibility |
| --- | --- |
| `src/runtime.ts` | Disposable just-bash filesystem, SQLite facts/tombstones, Markdown summary/scratchpads, snapshot restore/export |
| `convex/schema.ts` | User/workspace namespaces, snapshots, durable operation queue/receipts, deletion tombstones |
| `convex/memory.ts` | Auth, enqueue, lease/fence, atomic publication, read, forget coordination and namespace deletion |
| `src/client.ts` | Trusted writer: claim, hydrate, apply, renew, publish; discard stale workspace and retry |
| `scripts/integration.ts` | Real backend, test JWT signing, independent child clients, restarts, assertions and owned-process cleanup |

The runtime uses the actual just-bash `sqlite3` command, including its WASM worker. No host filesystem is mounted and shell networking/Python/JavaScript are not enabled. No arbitrary shell interface is exposed to a user or chat at this stage.

## Commit protocol

1. User JWT establishes owner from Convex `tokenIdentifier`; caller cannot supply an owner ID.
2. `enqueue` atomically allocates a sequence and persists a validated operation. A request ID + SHA-256 payload hash makes retries idempotent; changed payload under the same ID is rejected.
3. A trusted writer needs both the owner JWT and a server-only worker secret. `claim` acquires a bounded lease with a fresh ownership token and increasing fence, and returns a consistent snapshot plus up to 16 ordered pending operations.
4. Writer restores a private filesystem, applies operations, renews the lease and exports a bounded checkpoint.
5. `publish` checks ownership, unexpired lease/token/fence, expected revision and exact batch boundary. In **one Convex mutation**, it inserts snapshot bytes, advances the active pointer/revision, erases the previous snapshot and strips completed operation bodies.
6. An expired or superseded writer cannot publish or renew. Another writer reloads the current snapshot and replays the still-pending queue. Independent namespaces never share locks.

Accepted operations are durable before processing. A caller must run `flush` to drain them; automatic worker scheduling is deferred until integration. The prototype has no unattended service.

## Deletion contract

- `forget` records an opaque-key tombstone at enqueue time, increments the namespace epoch and invalidates any existing writer lease.
- New writes to forgotten keys are rejected. An old idempotent request may return its prior receipt but cannot reapply data.
- Scratchpad submissions carrying a pre-deletion epoch are rejected.
- Processing the deletion removes the SQLite fact, regenerates the summary and **clears all scratchpads in that namespace**. Conservative invalidation avoids pretending arbitrary prose has reliable fact provenance.
- SQLite `secure_delete` plus `VACUUM` removes deleted values from the current exported database image.
- Deletion is complete when its receipt is `done`; reads can still see the preceding snapshot while deletion is pending. Publication removes the previous persisted snapshot and operation content atomically.
- Namespace deletion removes the current snapshot, all bounded queue/receipt rows and key tombstones, and permanently marks that namespace deleted. Old workers and attempts to recreate that workspace name are rejected.
- The guarantee concerns current application records and exported memory. It does **not** erase copies previously downloaded by authorized readers, low-level database history/backups, or information deliberately reintroduced under a different key. No model-generated inference or semantic forgetting is claimed.

## Deliberate prototype limits

- 512 KiB checkpoint document; SQLite image capped at 256 KiB.
- 64 lifetime operations per namespace; at most 32 pending, processed in batches of 16.
- Values: 1,024 UTF-8 bytes; source: 512 bytes; 16 scratchpads of at most 4,096 bytes each.
- Summary: deterministic projection capped at 8,000 characters, not LLM consolidation.
- Normal leases: 30 seconds; shell deadline: 10 seconds; SQLite query deadline: 5 seconds.
- Per-user private workspaces only. Shared-team membership is not implemented.
- Snapshot storage is Convex `bytes`, not Convex File Storage. This makes publication/deletion atomic within one transaction and avoids orphan uploads/bearer download URLs. Larger snapshots require a separately tested staged-upload/garbage-collection protocol.
- Ephemeral local JWT issuer proves backend token verification and authorization. Portia's live Better Auth session/revocation flow is not integrated.
- The surrounding app's TypeScript configuration excludes `prototypes/`; package dependencies and generated files are isolated.

## Acceptance

See [ACCEPTANCE.md](ACCEPTANCE.md). Chat integration remains intentionally unimplemented.
