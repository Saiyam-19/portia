# Berthwise UI port — 21 October 2026

`raajveer-dev` starts at fetched `main` (`b64420f`). Visual source: `claude/ui-refactor` (`ec30d15`). Changes await human review; no commit or production deployment made.

The exploration's tokens, floating workspace, sidebar, composer, mentions, command picker, markdown and motion now wrap the working Convex/AI SDK app. No simulated engine, seed conversations, fake account actions or fabricated estimates were brought over. Rename and pin persist through an owner-checked Convex mutation. Existing drafts, run fencing, forms, cancellation and memory APIs remain in the serving path.

## Development setup

- Convex: `raajveer-khattar:berthwise-agent:dev/raajveer-khattar`, deployment `animated-parrot-287`. Created separately because the signed-in account cannot access `o-one-labs:portia`.
- Local app: `http://127.0.0.1:3002`. Start with `bun run dev --hostname 127.0.0.1 --port 3002`.
- Ignored `.env.development.local` holds the isolated dev configuration. The original provider-key file was never opened or printed by the assistant. Convex CLI automatically saved deployment metadata to `.env.local`; provider credentials were not copied into the separate settings file.
- `PORTIA_DEV_MODEL=deepseek/deepseek-v4.1-flash-1017` applies only when `NODE_ENV=development`; paid inference still requires `LLM_ALLOW_PAID=true`. Production aliases retain their existing mapping. Free test mode retains its zero-price restriction.

## Verification

`bun run test -- --maxWorkers=2`: **32 files / 153 tests pass**. Two workers avoid Windows contention seen with the default worker count. `bun run typecheck` and production build pass. Lint: zero errors; six existing generated-code/auth-navigation warnings. `git diff --check` passes.

Live Edge/Playwright checks against Convex dev and the requested DeepSeek model passed:

- Signup/signin and protected dashboard; real streamed supported-port response; reload.
- Port mention picker, keyboard command picker, search/empty state; persisted rename/pin.
- Light/dark desktop and 390 px mobile layout, drawer navigation, no horizontal overflow.
- SQLite/Convex memory write and recall in a different chat.
- Pending form reload, numeric input, optional note, submission and cancellation.
- Stop from another tab, persisted interrupted state, confirmed deletion and signout.

Local screenshots/results: ignored `.local/ui-evidence/`. Browser checks used synthetic accounts and data. A full real financial estimate and deployed-production acceptance were not run; tariff integrity, calculator and agent policy are covered by the passing suite.

## Runtime compatibility fixes

Tariff assets contain mixed canonical line endings. `.gitattributes` preserves their exact bytes so Windows checkout conversion cannot invalidate SHA-256 manifests. Tariff contents and manifest hashes are unchanged.

Next dev async hooks use the host clock, `WeakRef`, and stack-trace capture during just-bash SQLite execution. Development excludes only `performance_timing`, `weak_ref`, and `error_prepare_stack_trace` from just-bash's additional guards. Production retains every guard; filesystem/process environment guards remain active in development. The real memory/browser flow reproduced the failures and passed after this adjustment.

The separate GPT 6.1 Sol xhigh architecture audit is read-only and covers the full agent flow. The parallel fx/libfx comparison recommends retaining AI SDK for the current Convex architecture; no harness replacement was performed.

## Shell layout correction

Compared a temporary rendering of the exploration with the functional app at matching desktop sizes. Restored Inter, the source's welcome centering, borderless 268 px sidebar, consistent 1024 px mobile breakpoint, and the collapsed panel's 8 px inset. The mobile sheet also uses 268 px, with no empty strip beside its contents. Desktop expanded/collapsed, 900 px tablet and 390 px mobile states were checked visually. Temporary comparison routes/components were removed. Screenshot: `.local/ui-evidence/shell-spacing-fixed.png`.
