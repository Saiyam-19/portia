# Portia / Plisto

Maritime tariff assistant: Next.js 16, AI SDK 7 and OpenRouter; Convex owns authenticated conversations, runs, forms, and Agent-component message history. Better Auth provides fresh email/password accounts. The normal app is `/dashboard`; `/chat` redirects there.

## Local setup

Use Node 22, `npm install`, and the variables documented in [.env.example](.env.example). `PORTIA_CONVEX_DEPLOYMENT` must match both configured Convex URLs exactly. Next and Convex must share the frontend `SITE_URL`, auth mode, enable flag, and server bridge secret. Convex additionally needs `BETTER_AUTH_SECRET`.

For the example origin, run `npm run dev -- --hostname 127.0.0.1 --port 3002` only after checking existing processes and ports; reuse the existing healthy preview when present. Set `PORTIA_ENABLED=true` only after the matching Convex target and secrets are configured. Configure/push the explicitly selected Convex project separately; a local frontend build does not deploy Convex. Run `npm test`, `npm run typecheck`, and `npm run build` for local checks.

## Authentication

`PORTIA_AUTH_MODE=basic` enables fresh signup/signin with passwords of 8–128 characters. Email verification is intentionally disabled by the current product decision; accounts retain truthful `emailVerified=false`. Google, magic links and email password recovery are unavailable. `private` mode retains the allowlist and server-secret account provisioning restriction. The established session cookie prefix remains `portia-migration` for compatibility.

## Chat and safety boundaries

`/api/chat` and `/api/chat/cancel` are canonical; `/api/migration/chat` and `/api/migration/cancel` remain compatibility aliases. `/api/auth` is canonical, with the old auth URL rewritten to it. Historical Model 1 / Model 2 aliases remain accepted; the current UI labels the selected model. Credentials and provider routing remain server-side.

Conversation creation, reads and deletion require a live owner session. New chats create a saved empty conversation before navigation and first inference. Run claims and form continuations use revisions, idempotency, fencing, expiry, periodic session refresh, and per-user rolling limits. Stop applies across tabs. Deletion revokes the root immediately, fences the active run, then schedules bounded cleanup.

One `ToolLoopAgent` uses typed tariff, quotation, comparison, arithmetic, vessel and memory tools. Code owns tariff arithmetic and saved quotation rendering. Canonical sources live in `data/ports` and `data/reviewed-tariffs`; published references retain date and applicability limitations. See [current coverage](docs/portia-coverage.md).

The retired Python/Supabase implementation, duplicate corpus, prototype and interpreter experiment harnesses have been removed. Historical tracked implementations remain in Git. Saved-receipt compatibility remains in the serving code.

See [architecture](docs/architecture.md), [deployment configuration](docs/deployment.md), [tariff integration](docs/portia-reliability/2026-10-18-tariff-integration.md), and [test evidence limits](docs/portia-reliability/2026-10-18-test-evidence-audit.md). Historical production acceptance documents describe their dated releases; the current dirty checkout has not been deployed or independently evaluated on unseen conversations.

[Current adversarial audit](docs/portia-reliability/2026-10-18-runtime-safeguard-audit.md): the original two defects are repaired, but supplied-price provenance and memory-consent probes remain blocking. Run both `npm test` and `npm run test:adversarial`; passing the ordinary suite alone does not satisfy readiness.

[Cleanup report](docs/portia-reliability/2026-10-18-repository-cleanup.md) records retained evidence and known gaps. Disposable runs belong in ignored `output/` or `.local/`; durable evidence belongs in `data/` or `docs/portia-reliability/evidence/`.

## Chat memory

See [chat memory integration](docs/memory-integration.md), [local acceptance](docs/memory-integration-acceptance.md), and [production acceptance](docs/memory-production-acceptance.md) for just-bash, SQLite and Convex persistence.
