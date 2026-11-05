# Portia / Berthwise

Maritime tariff assistant on Next.js 16, [libfx](https://fx.sh/docs) and Convex. libfx runs the agent and stores each conversation as a durable session; Convex holds accounts (Better Auth), the conversation list, a display copy of each turn, and saved memory. The app is `/dashboard`; `/chat` redirects there.

`/` is the marketing site, ported from the `berthwise-landing` repo (WebGPU ocean, isometric harbour, GSAP and Lenis). It has its own root layout in `src/app/(site)` so its global styles never reach the app, whose routes live under `src/app/(app)`; moving between the two is a full page load. Its components are in `src/components/landing`, and its `.wgsl` shaders are compiled at build time by the Turbopack rule in `next.config.ts`. The hero composer and the closing email form only acknowledge input locally for now.

## Local setup

Use Node 24 (`24.x`), bun (`bun install`; `bun.lock` is the only lockfile), and the variables in [.env.example](.env.example). `PORTIA_CONVEX_DEPLOYMENT` must match both Convex URLs exactly. Next and Convex share `SITE_URL`, `PORTIA_AUTH_MODE`, `PORTIA_ENABLED` and `PORTIA_SERVER_SECRET`; Convex also needs `BETTER_AUTH_SECRET`, and `PORTIA_ALLOWED_EMAILS` in private mode.

`bun run dev` serves `http://localhost:3001` (hostname and port are pinned so auth's trusted origin cannot drift). Locally, `npx convex dev` pushes functions to your dev deployment. On Vercel, production builds run `convex deploy --cmd 'bun run build'` (see [vercel.json](vercel.json)): the Next build runs first against the production Convex URLs, then the functions are typechecked and deployed, so a failed build deploys nothing. This needs a production `CONVEX_DEPLOY_KEY` in Vercel's Production environment; preview and development builds only build the frontend. Checks: `bun run test`, `bun run typecheck` (TypeScript 7; the `typescript` package stays on 6 for typescript-eslint and Next, which need its compiler API), `bun run lint`, `bun run build`.

The model is mocked by default (`PORTIA_MODEL_MODE=mock`): a scripted OpenAI-compatible stream that exercises tools, forms, memory, prefix caching and compaction without network calls. `PORTIA_MODEL_MODE=openrouter` uses OpenRouter and requires `LLM_ALLOW_PAID=true` and `OPENROUTER_API_KEY`.

## Agent

- **Sessions.** One libfx session per conversation (`src/lib/agent`). The session log is the source of truth for model history; Convex `turns` is a projection for display, written when a turn ends. Turns stream to the browser as NDJSON public events; a reload reconnects through `/api/chat/stream`, which replays the session stream for the running turn.
- **Durability.** Locally sessions live in `.fx/sessions` (`local()`); on Vercel they use Vercel Workflow (`vercel()`), and `/api/libfx` receives queue deliveries that continue a turn after a function stops. Its trigger is in [vercel.json](vercel.json). libfx allows one configuration per agent name in a process, so the agent is kept on `globalThis` (`src/lib/agent/server.ts`); in development a reloaded module closes the previous agent, after its running turns finish, before making its own.
- **Tools.** `bash` runs in a per-conversation [just-bash](https://www.npmjs.com/package/just-bash) workspace with read-only tariffs under `/ports`, plus `calculate_charge_batch` (Decimal arithmetic), `search_vessels`, `get_vessel`, and `ask_user_input`. A form ends the turn; the user's answers arrive as the next prompt.
- **Caching.** The system prompt and tool list are byte-identical for every request. Anything that varies (date, memory, form answers) is sent in a `<context>` envelope at the start of each user turn, so history is append-only and every request reuses the previous prefix. The transport adds a sticky `session_id` per conversation, sets provider preferences (no data collection; fallbacks to another provider when one fails before answering, while a warm cache keeps a conversation on its provider), adds cache breakpoints for models that need them, and records cached-token usage per turn. A provider error that arrives before any output, such as a rate limit, is returned to libfx as an HTTP error so it retries with backoff instead of failing the turn.
- **Compaction.** The default 400k-token window with a 25k output reserve compacts at about 300k tokens (`PORTIA_CONTEXT_WINDOW` overrides it). After compaction the next turn resends full memory and notes.
- **Limits.** 24 model calls per turn, a 15-minute turn expiry, one running turn per conversation, and per-user rolling request limits.

## Memory

Memory is a set of small markdown files the agent edits with bash, not text pasted into the system prompt:

- `/memories/*.md` (at most one folder level) is shared across the user's conversations and changes only when the user asks. 32 files, 4 KiB each, 32 KiB in total.
- `/notes/current.md` holds the conversation's working notes and survives compaction.
- `/work` and `/tmp` are scratch space.

After each bash call the workspace diffs `/memories` and `/notes` and commits them to Convex with a version check, so concurrent conversations cannot overwrite each other; a rejected write is rolled back and reported to the model. Each conversation records which memory version it has seen, so a turn carries a full snapshot, only what changed, or nothing. Memory has no UI; to change or clear it, the user asks Berthwise.

## Authentication and boundaries

`PORTIA_AUTH_MODE=basic` allows fresh email/password signup (passwords of 8–128 characters, no email verification or recovery); `private` restricts accounts to `PORTIA_ALLOWED_EMAILS`. The session cookie prefix remains `portia-migration` for compatibility. Browsers only ever see Model 1 and Model 2, never provider model identifiers. The agent's Convex functions require the server secret; user functions require a live owner session. libfx has no session-delete API, so deleting a conversation removes its Convex records and drops the reference to its session.

Tariff references in `data/ports` are historical documents, not live tariff feeds.

## Attachments and Artifacts

Users upload from the chat's paperclip, drag/drop or paste, or from
`/dashboard/artifacts`. The Artifacts page lists, previews, downloads, renames,
replaces and deletes their files. Saved files can be attached to another chat.
Uploads belong to the signed-in account; only files attached to a conversation
are mounted there, as read-only `/files/<artifact-id>.md`. Original files and
their Markdown copies are public-by-link UploadThing objects; Convex stores ownership,
status, revisions and turn references. No file contents enter saved memory.

Setup: create an UploadThing Free app with its default public-read access and
set `UPLOADTHING_TOKEN` in the Next server's `.env.local` and deployment environment.
Never use a `NEXT_PUBLIC_` variable. Public-by-link storage was explicitly chosen
for this release: anyone holding an original or text-view URL can read it without
logging in. App authentication protects management and attachment selection, not
the object URL. The upload UI discloses this before use. Deploy the new
Convex functions/schema with the frontend using the existing deployment flow.

PDF, DOCX, XLSX, Markdown, UTF-8 text, CSV, JSON, PNG/JPEG/WebP/GIF, MP3/WAV/M4A/OGG
are accepted. Limits: 16 MB per original, four files per message, twenty files per
conversation, 256 KB per Markdown copy, one hundred PDF pages. Text PDFs, Word and
Excel are extracted locally. Images, audio and scanned PDFs need the existing
live OpenRouter configuration and a compatible model: one bounded Model 1 call
creates their reusable text view. Errors remain visible with Retry/Replace;
partial model output is never marked ready. No paid inference is used in tests.

Attachment changes append stable ids, paths and revisions to new user turns.
The system prompt and tools stay fixed; complete documents and temporary signed
URLs are not repeatedly inserted into model history. Before a bash command the
workspace refreshes changed/deleted mounts. Deleting an artifact removes future
file access and its storage objects; text already in chat/session history stays.
