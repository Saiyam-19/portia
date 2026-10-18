# Portia chat memory

Implemented in the attached **memory-persistence-prototype** worktree. It contains an allowlisted copy of the completed Convex migration plus this integration. The original UI and migration worktrees were preserved. No cloud deployment or production cutover occurred.

## User flow

- Ask Plisto to **remember** a fact for future conversations. The model uses a real persistence tool; success follows durable publication.
- Open a new conversation to recall saved facts. A bounded summary is refreshed before each model step; an exact recall tool is available.
- Ask Plisto to update **working notes**. Markdown notes belong only to that conversation and survive reloads/restarts.
- Open **Memory** in the chat header to inspect saved facts and current-chat notes. Forget a fact or clear all saved memory.
- Deleting a conversation also removes its working notes and its provenance from saved facts. A fact supported by another surviving source chat remains.
- Forgetting invalidates working notes to avoid retaining deleted information in unstructured prose. Saved memory deletion does not delete existing chat-history text or copies already delivered to a user/provider.

## Implementation

| Layer | Code |
| --- | --- |
| Agent tools + fresh context | src/lib/memory/session.ts; src/lib/migration/domain-agent.ts |
| just-bash / SQLite / virtual Markdown | src/lib/memory/runtime.ts; format.ts |
| Internal Convex coordinator | convex/memory.ts; lib/memoryLifecycle.ts |
| Authenticated bridge | convex/memoryHttp.ts |
| Management endpoint | src/app/api/memory/route.ts |
| UI | src/components/memory; dashboard/workspace-header.tsx |
| Run and source-chat deletion fencing | convex/migration.ts |

All memory operations derive the owner from a **live Better Auth session** through the existing JWT + server-secret bridge. Clients/models cannot supply an owner or choose another chat's notes. SQLite images and provenance stay server-side; the model sees bounded key/value data explicitly marked untrusted.

Shared memory is a private per-user namespace. A bounded durable queue, request hashes, expiring leases, increasing fencing tokens and expected revisions serialize writers. Publication updates the snapshot pointer, applied projection and receipts and deletes the preceding snapshot atomically. The worker validates exported SQLite before publication; Convex independently checks the typed manifest against that exact queue batch. Notes have a separate per-chat document and bounded request receipts.

Forget/clear/source deletion increments a memory epoch, invalidates the writer and blocks context reads until the deletion barrier has been applied—even across multiple batches. Old runs cannot checkpoint, complete, change notes or resurrect memory. A current new request may explicitly save the key again. Completed operation receipts retain bounded hashes/metadata, not memory payloads.

A disconnected worker leaves approved operations queued. The next authenticated memory/context request drains them; paid model inference is never automatically replayed. A write accepted before cancellation/session revocation is not retroactively rolled back. Information already sent to a running provider cannot be retracted; deletion fences future context and persisted writes.

Limits: 64 active facts, 8 sources/fact, 1,024 UTF-8 bytes/value, 6,000 bytes/chat notes, 256 KiB SQLite image, 512 KiB checkpoint, 16 operations/batch, 32 ordinary pending operations (deletion reserve to 96), 128 completed request receipts. Capacity failures are explicit. Automatic background extraction/consolidation and a general-purpose agent shell remain outside this slice; typed tools use just-bash internally.

## Configuration

Set PORTIA_MEMORY_ENABLED=true in both the Next server and the matching Convex deployment. Memory UI availability comes from the server-rendered feature context. Existing cloud deployment matching remains strict.

Local verification requires PORTIA_LOCAL_BACKEND=true, the exact deployment name local-memory-integration, an explicit loopback API/site pair and a loopback app origin. These guards never accept a mixed cloud/local target.

The local lab configures fresh backend/auth/bridge secrets and synthetic accounts, uses the existing configured model credential (or an explicit OPENROUTER_API_KEY / PORTIA_VERIFY_ENV), and changes no existing deployment. The lab uses the current runtime model/provider settings. Retired free/mock model-switch environment variables are rejected before launching anything; this is a live paid-inference harness when used with real credentials.

## Reproduce locally

Use Node 22. The harness requires macOS ps/lsof, a cached convex-local-backend (or MEMORY_CONVEX_BINARY), and an installed Chromium (or MEMORY_CHROMIUM_PATH).

From this worktree:

~~~sh
npm ci
npm run memory:lab
~~~

The lab uses Node 22 native TypeScript stripping; no prototype install is needed. It starts Convex on 3220/3221 and a Next production build on 3022; conflicting ports/run locks cause refusal. At READY, enter:

~~~text
verify
~~~

Other commands: restart, deploy (local only), rebuild, stop. The browser journey uses the actual UI, real Better Auth, actual Model 1 and real SQLite memory tools. Synthetic cookies/passwords used for interrupted-test resumption are permission-restricted, ignored and removed after acceptance completes. Process groups, parents, directories, ports and cleanup are recorded.

Regression commands:

~~~sh
npm test
npm run typecheck
npm run lint
~~~

The standalone prototype remains independently runnable. It is excluded from app TypeScript/lint/test traversal.

## Evidence and limits

See [memory-integration-acceptance.md](memory-integration-acceptance.md). This establishes the local production-build flow, not a hosted production release. No backup/physical-disk erasure guarantee or automatic learning beyond explicit memory tools is claimed.
