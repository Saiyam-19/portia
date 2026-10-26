# Architecture and API

The serving stack is Next.js 16 + Vercel AI SDK 7 + OpenRouter + Convex. Better Auth uses the Convex component for fresh email/password accounts. The normal UI is `/dashboard` and `/dashboard/chat/[id]`.

## Responsibilities

| Concern | Implementation |
| --- | --- |
| Main agent | One AI SDK `ToolLoopAgent` with reusable business and memory tools |
| Model access | OpenRouter; both compatibility aliases resolve to the configured server-only model |
| Tool execution | Typed server tools: port-call estimates and comparisons from the rule book, port tariffs, port-document search, company-document search, the fleet, agreed rates and bounded decimal calculation (`src/lib/berthwise/tools.ts`) |
| Conversation memory | Convex Agent component threads/messages; application-owned conversation, run and budget tables |
| Durable execution | Fenced per-step checkpoints, request idempotency, cancellation and scheduled lease recovery |
| Authentication | Better Auth + Convex, live session and owner checks at each access boundary |
| Tariff evidence | One reviewed rule-book file per port in `data/rulebook/`, read twice and checked against verbatim quotes from `data/sources/` |
| Company documents | Uploaded to Convex Storage; a background Node action reads PDF, Word, Excel, CSV and text into page-numbered passages with a full-text search index |
| Cross-chat memory / working notes | just-bash + SQLite snapshots and per-chat Markdown, durable Convex queues/fences, live-session ownership and deletion barriers; see memory-integration.md |
| Port documents | Markdown copies of the ports' official documents, searched by keyword (BM25) at request time |

The Convex Agent component is used for persistence, not as a second orchestration loop. No LangGraph or Python server is used at runtime. Current memory reconstructs the current conversation, including tool pairs. Explicit cross-conversation fact memory and per-chat working notes are implemented behind PORTIA_MEMORY_ENABLED. Automatic background learning remains unimplemented.

## Request flow

1. Better Auth establishes a session; the server layout and client readiness gate protect the workspace.
2. A new chat creates an owner-scoped empty Convex conversation before navigation. A stable initial request ID and saved revision prevent reload from replaying the initial question.
3. `/api/chat` validates the exact frontend origin and strict bounded request body. The browser supplies only its new question, plus a public model alias and revision.
4. A narrow Convex bridge requires both a live session-backed JWT and the server bridge secret. Owner identity is derived from that session. Generated-message writes remain internal.
5. The atomic claim stores the input and acquires a run fence. The server reads complete stored history and constructs the main AI SDK agent. The agent uses server-owned tools; there is no specialist dispatch loop.
6. Closed tool steps are persisted before another provider step.
7. The AI SDK UI stream renders through the existing chat components. Reactive history reconciles by run/message/tool IDs. Drafts clear only after matching persisted success.
8. Stop persists cancellation; same-process abort plus durable polling handles the execution side. EOF, stream error and consumer cancellation all run explicit, exactly-once cleanup. A hard-killed process is recovered by its scheduled lease.

## Boundaries and limits

- Credentials and provider routing metadata remain server-side. Compatibility aliases map to the same selected model; the current UI displays its label.
- Paid inference requires explicit configuration. Provider routing keeps parameter support required, data collection denied, ZDR required and provider fallback disabled. SDK retries are disabled; the complete-step wrapper permits one bounded retry of retryable incomplete provider output before publication.
- The agent permits 12 steps and 4,096 output tokens per call. Route deadline: 240 seconds; lease: 270 seconds.
- Stored history remains paginated. Generation currently requires the complete conversation to fit within 200 messages and 200,000 serialized characters. Oversized history fails explicitly; it is not silently truncated or summarized.
- Per-user rolling limits default to 8 inference starts/minute, 60/hour; 6 empty chat creations/minute, 30/hour. Deletion does not erase rate usage. These are request limits, not a monetary ledger.
- The calculator accepts a restricted arithmetic grammar with 40-digit decimal precision, half-up rounding and explicit expression/value/scale bounds. It does not evaluate arbitrary code.
- There is no paid vessel look-up: ship particulars come from the user or the company's saved fleet.
- Rates are static and date-scoped. Code does the arithmetic; every figure in a reply must come from the user or a tool result, and ship details, stays, cargo and exchange rates the user didn't give are dropped.

## Interfaces

| Interface | Purpose |
| --- | --- |
| `/api/auth/[...all]` | Better Auth signup, signin, session and signout |
| `POST /api/chat` | New question; AI SDK UI message stream |
| `POST /api/chat/cancel` | Owner-checked durable cancellation |
| Convex public queries | Paginated owner-scoped conversations and messages; the fleet, company documents and agreed rates |
| Convex public mutations | Empty conversation creation and owned deletion; saving ships, uploading documents and agreed rates |
| `/migration/bridge` on Convex HTTP | Server-credential plus user-JWT access to internal generated-state operations |

The old `/api/migration/*` paths are compatibility aliases. `/chat` and `/migration` redirect to the normal dashboard. Supabase clients, dependencies, token refresh and Python API fetches are removed from the serving path. The retired implementations were removed in the 18 October cleanup; historical tracked code remains in Git.

## Current product choices

The source Supabase project had zero users, conversations and messages when inventoried. The user explicitly chose fresh accounts with basic email/password and no verification for now. Accounts remain truthfully unverified; email password recovery and OAuth are not advertised as connected capabilities. Chats saved before Berthwise v1 keep their old form fields as legacy values.

See [deployment configuration](deployment.md) and the [handover pack](handover/README.md).
