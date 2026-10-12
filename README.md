# Portia / Plisto

Maritime tariff assistant: Next.js 16, AI SDK 7 and OpenRouter; Convex owns authenticated conversations, runs, forms, and Agent-component message history. Better Auth provides fresh email/password accounts. The normal app is `/dashboard`; `/chat` redirects there.

## Local setup

Use Node 22, `npm install`, and the variables documented in [.env.example](.env.example). `PORTIA_CONVEX_DEPLOYMENT` must match both configured Convex URLs exactly. Next and Convex must share the frontend `SITE_URL`, auth mode, enable flag, and server bridge secret. Convex additionally needs `BETTER_AUTH_SECRET`.

For the example origin, run `npm run dev -- --hostname 127.0.0.1 --port 3002` only after checking existing processes and ports; reuse the existing healthy preview when present. Set `PORTIA_ENABLED=true` only after the matching Convex target and secrets are configured. Configure/push the explicitly selected Convex project separately; a local frontend build does not deploy Convex. Run `npm test`, `npm run typecheck`, and `npm run build` for local checks.

## Authentication

`PORTIA_AUTH_MODE=basic` enables fresh signup/signin with passwords of 8–128 characters. Email verification is intentionally disabled by the current product decision; accounts retain truthful `emailVerified=false`. Google, magic links and email password recovery are unavailable. `private` mode retains the allowlist and server-secret account provisioning restriction. The established session cookie prefix remains `portia-migration` for compatibility.

## Chat and safety boundaries

`/api/chat` and `/api/chat/cancel` are canonical; `/api/migration/chat` and `/api/migration/cancel` remain compatibility aliases. `/api/auth` is canonical, with the old auth URL rewritten to it. Browser users never receive provider model identifiers: only Model 1 / Model 2.

Conversation creation, reads and deletion require a live owner session. New chats create a saved empty conversation before navigation and first inference. Run claims and form continuations use revisions, idempotency, fencing, expiry, periodic session refresh, and per-user rolling limits. Stop applies across tabs. Deletion revokes the root immediately, fences the active run, then schedules bounded cleanup.

Tariff references live in `data/ports`; they include historical documents, not live tariff feeds. Specialists use the bounded decimal calculator and must finish cleanly before returning tariff output. Saved tool steps and interrupted work are distinguished from completed responses. No uploads or RAG have been added.

Python sources remain in `backend/` solely as reference/parity fixtures. They are excluded from the frontend deployment; their old Vercel serving configuration is archived in `docs/archive`. Frontend runtime has no Supabase or Python API dependency. No historical account/chat import is required for the empty source database.

See [architecture](docs/architecture.md), [verified development acceptance](docs/migration-acceptance.md), and [deployment configuration](docs/deployment.md). Production now runs on Vercel and Convex; see [production acceptance](docs/memory-production-acceptance.md) for the tested release and scope.

## Chat memory

See [chat memory integration](docs/memory-integration.md), [local acceptance](docs/memory-integration-acceptance.md), and [production acceptance](docs/memory-production-acceptance.md) for just-bash, SQLite and Convex persistence.
