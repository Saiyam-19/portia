# Portia / Plisto

Maritime tariff assistant: Next.js 16, AI SDK 7 and OpenRouter; Convex owns authenticated conversations, runs, forms, and Agent-component message history. Better Auth provides fresh email/password accounts. The normal app is `/dashboard`; `/chat` redirects there.

## Local setup

Use Node 24 LTS (`24.x`), `npm install`, and the variables documented in [.env.example](.env.example). `PORTIA_CONVEX_DEPLOYMENT` must match both configured Convex URLs exactly. Next and Convex must share the frontend `SITE_URL`, auth mode, enable flag, and server bridge secret. Convex additionally needs `BETTER_AUTH_SECRET`.

Run `bun run dev` at `http://localhost:3001`; the dev command pins the hostname and port so Next cannot silently move to an origin auth does not trust. Set both `SITE_URL` and `NEXT_PUBLIC_SITE_URL` in the frontend, and `SITE_URL` on the selected Convex development deployment, to that exact origin. If you intentionally change the local origin, update both sides together. Reuse an existing healthy preview when present. Set `PORTIA_ENABLED=true` only after the matching Convex target and secrets are configured. Configure/push the explicitly selected Convex project separately; a local frontend build does not deploy Convex. Run `npm test`, `npm run typecheck`, and `npm run build` for local checks.

## Authentication

`PORTIA_AUTH_MODE=basic` enables fresh signup/signin with passwords of 8–128 characters. Email verification is intentionally disabled by the current product decision; accounts retain truthful `emailVerified=false`. Google, magic links and email password recovery are unavailable. `private` mode retains the allowlist and server-secret account provisioning restriction. The established session cookie prefix remains `portia-migration` for compatibility.

## Chat and safety boundaries

`/api/chat` and `/api/chat/cancel` are canonical; `/api/migration/chat` and `/api/migration/cancel` remain compatibility aliases. `/api/auth` is canonical, with the old auth URL rewritten to it. Browser users never receive provider model identifiers: only Model 1 / Model 2.

Conversation creation, reads and deletion require a live owner session. New chats create a saved empty conversation before navigation and first inference. Run claims and form continuations use revisions, idempotency, fencing, expiry, periodic session refresh, and per-user rolling limits. Stop applies across tabs. Deletion revokes the root immediately, fences the active run, then schedules bounded cleanup.

Tariff references live in `data/ports`; they include historical documents, not live tariff feeds. One agent reads them through its isolated workspace and uses the bounded Decimal batch calculator for financial arithmetic. Saved tool steps and interrupted work are distinguished from completed responses. No uploads or RAG have been added.

Python sources remain in `backend/` solely as reference/parity fixtures. They are excluded from the frontend deployment; their old Vercel serving configuration is archived in `docs/archive`. Frontend runtime has no Supabase or Python API dependency. No historical account/chat import is required for the empty source database.

See [architecture](docs/architecture.md), [verified development acceptance](docs/migration-acceptance.md), and [deployment configuration](docs/deployment.md). Production now runs on Vercel and Convex; see [production acceptance](docs/memory-production-acceptance.md) for the tested release and scope.

## Chat memory

See the current [agent workspace contracts](docs/agent-workspace.md). Earlier [chat memory integration](docs/memory-integration.md), [local acceptance](docs/memory-integration-acceptance.md), and [production acceptance](docs/memory-production-acceptance.md) retain the preceding release's evidence.
