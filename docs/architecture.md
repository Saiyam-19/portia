# Architecture and API

The serving stack is Next.js 16 + Vercel AI SDK 7 + OpenRouter + Convex. Better Auth uses the Convex component for fresh email/password accounts. The normal UI is `/dashboard` and `/dashboard/chat/[id]`.

## Responsibilities

| Concern | Implementation |
| --- | --- |
| Main agent and port specialists | AI SDK `ToolLoopAgent`; one orchestration framework |
| Model access | OpenRouter, with two server-only mappings exposed as Model 1 / Model 2 |
| Tool execution | Typed server tools for port consultation, bounded decimal calculation, vessel search/detail and structured user input |
| Conversation memory | Convex Agent component threads/messages; application-owned conversation, run, form and budget tables |
| Durable execution | Fenced per-step checkpoints, request idempotency, pending forms, cancellation and scheduled lease recovery |
| Authentication | Better Auth + Convex, live session and owner checks at each access boundary |
| Current tariff documents | 17 byte-identical bundled files in `data/ports`, with an allowlisted slug and filename provenance |
| Future user-uploaded files | Convex Storage is the intended object store; upload ingestion is not implemented |
| Cross-chat memory / working notes | just-bash + SQLite snapshots and per-chat Markdown, durable Convex queues/fences, live-session ownership and deletion barriers; see memory-integration.md |\n| Future document retrieval | Explicit ingestion/chunking/embedding pipeline; not provided by memory tools |

The Convex Agent component is used for persistence, not as a second orchestration loop. No LangGraph or Python server is used at runtime. Current memory reconstructs the current conversation, including tool pairs and form responses. Explicit cross-conversation fact memory and per-chat working notes are implemented behind PORTIA_MEMORY_ENABLED. Document RAG and automatic background learning remain unimplemented.

## Request flow

1. Better Auth establishes a session; the server layout and client readiness gate protect the workspace.
2. A new chat creates an owner-scoped empty Convex conversation before navigation. A stable initial request ID and saved revision prevent reload from replaying the initial question.
3. `/api/chat` validates the exact frontend origin and strict bounded request body. The browser supplies only its new question or a response to an existing form, plus a public model alias and revision.
4. A narrow Convex bridge requires both a live session-backed JWT and the server bridge secret. Owner identity is derived from that session. Generated-message writes remain internal.
5. The atomic claim stores the input and acquires a run fence. The server reads complete stored history and constructs the main AI SDK agent. Specialists use the same immutable model alias as that run.
6. Closed tool steps are persisted before another provider step. An unresolved input tool and its pending form are saved atomically. Form submission/cancellation consumes the matching tool call exactly once and retains its note.
7. The AI SDK UI stream renders through the existing chat components. Reactive history reconciles by run/message/tool IDs. Drafts clear only after matching persisted success.
8. Stop persists cancellation; same-process abort plus durable polling handles the execution side. EOF, stream error and consumer cancellation all run explicit, exactly-once cleanup. A hard-killed process is recovered by its scheduled lease.

## Boundaries and limits

- Model IDs, credentials and provider metadata are excluded from public projections and the browser bundle. Prompt instructions alone are not a guarantee against model self-identification.
- Paid inference requires explicit configuration. Provider routing keeps parameter support required, data collection denied, ZDR required and provider fallback disabled. No automatic SDK retry occurs.
- Each agent permits 12 steps and 4,096 output tokens per call; a run shares a 16-provider-call budget and at most three specialist consultations. Route deadline: 240 seconds; lease: 270 seconds.
- Stored history remains paginated. Generation currently requires the complete conversation to fit within 200 messages and 200,000 serialized characters. Oversized history fails explicitly; it is not silently truncated or summarized.
- Per-user rolling limits default to 8 inference starts/minute, 60/hour; 6 empty chat creations/minute, 30/hour. Deletion does not erase rate usage. These are request limits, not a monetary ledger.
- The calculator accepts a restricted arithmetic grammar with 40-digit decimal precision, half-up rounding and explicit expression/value/scale bounds. It does not evaluate arbitrary code.
- Vessel lookup has a fixed host, no redirects, bounded responses and a 10-second timeout. Without a key or usable response, the agent asks for vessel particulars manually.
- Tariff documents are static reference data. Specialists preserve filenames/sections, dates, rounding, units, currency, GST and FX assumptions. Empty tariff data returns an explicit unavailable result. Truncated specialist output is never accepted as a completed estimate.

## Interfaces

| Interface | Purpose |
| --- | --- |
| `/api/auth/[...all]` | Better Auth signup, signin, session and signout |
| `POST /api/chat` | New question or stored form continuation; AI SDK UI message stream |
| `POST /api/chat/cancel` | Owner-checked durable cancellation |
| Convex public queries | Paginated owner-scoped conversations, messages and form state |
| Convex public mutations | Empty conversation creation and owned deletion |
| `/migration/bridge` on Convex HTTP | Server-credential plus user-JWT access to internal generated-state operations |

The old `/api/migration/*` paths are compatibility aliases. `/chat` and `/migration` redirect to the normal dashboard. Supabase clients, dependencies, token refresh and Python API fetches are removed from the serving path. Python sources remain only as parity references; old serving configuration is archived.

## Current product choices

The source Supabase project had zero users, conversations and messages when inventoried. The user explicitly chose fresh accounts with basic email/password and no verification for now. Accounts remain truthfully unverified; email password recovery, OAuth, uploads and semantic retrieval are not advertised as connected capabilities.

See [acceptance evidence](migration-acceptance.md) and [deployment configuration](deployment.md).
