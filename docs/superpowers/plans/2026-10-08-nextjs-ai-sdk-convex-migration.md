# Portia stack migration implementation plan

## Execution update — 2026-10-09

The user confirmed there are no source users and chose fresh basic email/password signup without email verification for now. Read-only inventory found zero users, conversations and messages; historical credential/data import is therefore unnecessary unless that changes before cutover. The full legacy agent and normal dashboard are now implemented and verified; see [acceptance evidence](../../migration-acceptance.md). Uploads, semantic retrieval and document ingestion remain new capabilities outside legacy parity. Production publishing remains a separate final step.

Date: 2026-10-08 (Asia/Kolkata)

**Goal:** Run the existing Portia experience on Next.js + Vercel AI SDK + OpenRouter + Convex, with Supabase and the Python backend fully removed from the final runtime. Preserve users, conversation history, model selection, tariffs, calculator behavior, citations, vessel lookup, and structured follow-up forms.

**Current authorization (2026-10-09):** User approved independent review and an isolated working development slice. Production deployment, live-user/data migration, customer email and resource deletion remain outside this slice. The user confirmed eventual full Supabase removal through staged auth migration.

**Review verdict (2026-10-09):** Independent reviewer approved isolated development implementation, conditional on the corrections below. Runtime acceptance and production cutover remain gated on evidence. The original self-review is retained for provenance.

### Independent review corrections

- Use the Convex Agent component for authoritative message storage through internal Convex wrappers. Application tables retain ownership, runs, revisions and forms; Next.js retains the only inference loop. This supersedes the proposed custom `messages` table below. Component mutation calls preserve transaction boundaries; verify this integration in the slice.
- Require a fresh session-backed JWT with sufficient remaining lifetime before run admission. Periodic refresh checks retain the original principal. Authentication/refresh failure aborts inference; deadline recovery releases the run. Do not enable cached JWT admission without an explicit freshness check.
- Transactionally reject fresh questions while a required form is unresolved. Only validated submission or cancellation may create its continuation.
- Set `maxRetries: 0` on every inference call. Retryable provider errors must produce exactly one upstream attempt; retries require an explicit user action.
- Check an existing request ID and payload hash before rejecting a stale conversation revision. Increment revisions on state transitions and fence later writes against the claimed run/version.
- Compatibility checked against installed packages: AI SDK 7.0.134, OpenRouter provider 3.1.0, Convex 1.46.0, Agent component 0.7.7, Better Auth component 0.12.5 with Better Auth 1.6.33. Next.js 16.3.8 patches audited issues while staying on the existing major. Actual runtime checks remain required.
- Current source baseline is `ec30d1537edd5819b5c226e2ba670bf7bfba88ad`; worktree `/Users/saiyamchaplot/.codex/worktrees/portia-convex-migration/portia-main`. Original plan baseline below is historical.

## 1. Verified baseline and access

- Checkout: `main`, `8d3e79c824e09c758ff406b8eb7a592e43bb9c12`; clean before this document.
- Convex OAuth completed. Separate macOS Keychain profile: `portia`; prior global login restored by the existing `cx` wrapper. Read-only CLI status confirmed access to **O-One Labs's team (`o-one-labs`)**. A project/deployment has not been selected or provisioned.
- Next.js **16.2.9**, React **19.2.4**, npm; no AI SDK or Convex dependency in the current package manifest.
- `backend/main.py`: FastAPI conversation creation/list/history, streaming, form submission, Supabase persistence. `backend/agent.py`: main agent, port specialists, vessel tools, and `ask_user_input` suspension. `backend/models.py`: OpenRouter routing.
- Public model aliases are `model-1` and `model-2`. Current source maps them privately to `openai/gpt-6.1-sol` and `anthropic/claude-opus-5.5`. They require paid opt-in. Earlier free-model verification is not current selector verification. Availability, credits, limits, and routing eligibility need live checks before rollout.
- `backend/calculator.py`: Decimal arithmetic with 40-digit precision, half-up rounding, expression/resource bounds, and an explicit operator/function allowlist.
- `backend/ports/`: 16 port/terminal directories and 17 static reference files. Historical validity warnings, filenames, and tariff section citations matter. No new upload/RAG/global-coverage feature is part of this migration.
- `supabase/schema.sql`: conversations owned by Supabase user UUID; messages contain roles, text, tool calls, tool-call IDs, timestamps. RLS plus API ownership checks protect records.
- `src/components/chat/chat-view.tsx` owns a custom SSE parser, local model selection, stop behavior, history loading, and form continuation. Login, layouts, sidebar, callback, and `src/proxy.ts` depend on Supabase.
- `.vercelignore` excludes `backend/`; moving inference into Next.js without relocating tariff assets would break deployed specialists.
- Graph discovery used project `Users-saiyamchaplot-Documents-portia-main`, generation `2026-10-06T11:27:53Z`. Coverage detected stale agent/API/UI/model entries and a model test absent from the graph. Current source reads supersede those snippets; SQL was read directly. No completeness claim relies on the stale graph.
- No baseline tests or live app acceptance were run during this planning task. Prior successful journeys informed the preservation checklist only.

## 2. Architecture decisions

```text
Browser: existing Next.js UI + useChat
   | same-origin authenticated POST /api/chat
   v
Next.js Node route: validate input, load trusted history, claim run
   | AI SDK ToolLoopAgent -> explicit OpenRouter provider
   | specialist agents -> bundled tariffs + bounded Decimal calculator
   | optional VesselAPI tools
   | authenticated server-only persistence bridge
   v
Convex: ownership, conversations, messages, runs, pending forms
   ^ reactive history/sidebar/status queries
   |
Better Auth on Convex -> sessions, login, verification, recovery
```

1. Keep the existing Next.js major and UI. Use the current compatible AI SDK **7** release family and matching OpenRouter provider; pin exact tested versions in the lockfile during the compatibility spike. OpenRouter's current provider requires Node 22+ and ESM. Pin a supported Node 22+ runtime consistently in local tooling, CI, and Vercel. Do not copy SDK 5/6 examples into SDK 7. [Provider compatibility](https://github.com/OpenRouterTeam/ai-sdk-provider)
2. Use an explicit `createOpenRouter` provider instance. Preserve server-only aliases, paid opt-in, required-parameter routing, zero-data-retention/data-collection restrictions, and no silent paid fallback. Do not accidentally invoke AI Gateway through an unqualified SDK model string.
3. Run inference and document loading in a Next.js Node route. Convex owns transactional state and authorization; it does not run the same agent loop again. Retain main/specialist semantics before considering prompt or architecture optimizations.
4. Use **Better Auth with the official Convex component** for final authentication. It has documented Next.js server and client integration. Convex Auth's own documentation still labels Next.js server integration experimental, so it is not the default for this SSR application. This adds an auth library hosted on Convex, not another database service. [Next.js integration](https://labs.convex.dev/better-auth/framework-guides/next), [Convex Auth status](https://docs.convex.dev/auth/convex-auth)
5. Use SDK typed UI message parts and supported transport, preserving the current form renderer and visual behavior. Persist authoritative tool calls/results server-side; SDK client tool output is not an authorization boundary. [Tool UI](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage)
6. Ship bounded request streaming with durable checkpoints. Reload restores persisted state; interruption is visible and retry is explicit. Transparent replay of every stream byte, Redis, a second workflow engine, and automatic replay of paid inference are out of scope. This keeps Stop meaningful. [Stream lifecycle](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams)

### Trust boundary between Next.js and Convex

Browser-callable queries/mutations may read owned data, create an empty conversation, and request cancellation. They must not accept arbitrary assistant content, authoritative tool results, owner IDs, run completion, or usage totals.

Return explicit public projections: display text, safe citations, form schema/state, public alias and status. Keep provider IDs/options, raw specialist scaffolding, credentials, internal errors and private run metadata out of public queries and stream parts. Server history includes the validated internal context; browser history need not expose it.

Next.js writes generated state through a small allowlisted Convex HTTP bridge. Every request requires both a valid user JWT (verified by Convex) and a separate environment-specific server credential. The bridge derives the principal from `ctx.auth`, verifies conversation/run ownership, validates the operation, then invokes internal queries/mutations. It is not a generic function dispatcher. Use constant-time credential comparison, rotate secrets, and exclude credentials from errors/logs. No Convex deploy/admin key in application request handling.

An authenticated user JWT alone must fail on this bridge; a server credential without a valid user must also fail. Internal functions cannot be called directly by the Next.js client; the bridge is intentional. [HTTP action authentication](https://docs.convex.dev/auth/functions-auth), [Internal functions](https://docs.convex.dev/functions/internal-functions)

## 3. Durable state and contracts

These are proposed new schemas, not existing APIs. Use explicit Convex argument/return validators and indexed access. Read the Convex expert skill before implementation.

| Record | Responsibility and indexes |
| --- | --- |
| `appUsers` | Stable application principal; source UUID retained as `legacyUserId`; status includes disabled/deleted. Unique mapping enforced transactionally. |
| `identityLinks` | Verified `(issuer, subject)` to application principal. Index by identity and principal. Never link using browser-supplied UUID or unverified email. |
| `conversations` | Principal, stable external ID, legacy UUID, title, timestamps, next sequence, active run. Index by owner/update time and external/legacy ID. Keep old chat URLs resolvable. |
| `messages` | Conversation, stable message ID, sequence, schema version, typed parts, source timestamp, run reference. Index by conversation/sequence and conversation/message ID. |
| `runs` | Request ID, request hash, parent continuation, owner/conversation, model alias and private mapping revision, state, attempt/fencing version, lease/deadline, usage and error code. Index by owner/request ID and state/deadline. |
| `pendingForms` | Conversation, origin run, assistant message/tool-call IDs, validated field schema, state, response, continuation run. Index by conversation/state and conversation/tool-call ID. |
| `migrationBatches` | Source snapshot ID, source-key mapping, per-record checksum, checkpoint, totals, rejected records; restricted to migration tooling. |

Store paginated messages, not a whole conversation in one document. Set input, form, tool output, message, and context budgets below platform limits; explicitly reject or split oversized records. Retain full legacy payloads in a protected migration archive when typed conversion cannot preserve them in one record. Convex documents currently have a 1 MiB limit. [Limits](https://docs.convex.dev/production/state/limits)

Proposed application request contracts:

- New question: `{conversationId, requestId, expectedRevision, modelAlias, text}`.
- Form continuation: `{conversationId, requestId, expectedRevision, modelAlias, toolCallId, data, note, cancelled}`.
- Stop: `{conversationId, runId}`; owner checked, idempotent.
- Read: owner-checked paginated history, sidebar, and run/form state. Resolve external IDs to internal IDs only after authentication.

Load model context from Convex; never trust client-submitted historical assistant/tool messages. Validate persisted parts before model conversion and preserve originals on conversion errors rather than silently starting an empty chat. [Message persistence](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence)

Run invariants:

1. Claiming a run, appending the new user message, assigning sequence, and setting the conversation lock happen in one mutation. Duplicate request ID plus identical hash returns the original run; a changed payload returns conflict. Two different concurrent submissions cannot both own the conversation.
2. States: `running -> completed | awaiting_input | cancelled | failed | interrupted`. A form resolution atomically consumes the pending form and creates one continuation run; retries return that continuation. The originating run remains linked for audit.
3. An inference attempt has an immutable model alias. A form continuation can use the user's newly selected alias, preserving current behavior; its specialists inherit that selection. Never use mutable global model state.
4. Persist validated form and tool-call state before displaying an actionable card. Validate submitted fields against the stored schema, including field names, required flags, number bounds and radio choices. Reject forged, cross-conversation, already-consumed and stale tool-call IDs.
5. Persist each tool boundary and bounded text checkpoints, then finalize text, usage, title and status atomically. Do not write every token. Use server-created stable message IDs to reconcile SDK UI and Convex history without duplicates.
6. Explicit Stop persists cancellation and aborts main/specialist/provider requests. Each active route observes cancellation at tool boundaries and on a bounded interval while awaiting a provider; a cross-tab Stop must also work. Disconnect aborts that attempt and preserves its last checkpoint. Hard termination is handled by a deadline/lease recovery job marking it interrupted.
7. Lease expiration never automatically starts another paid call. A new attempt requires explicit retry; stale writers are rejected by fencing version and terminal state. If a provider may already have charged before a crash, report usage as unknown rather than promising exactly-once billing.
8. Preserve 240-second total and 60-second provider deadlines as starting ceilings; reserve time for final persistence within the hosting limit. LangGraph recursion counts and SDK step counts differ: establish equivalent bounds through fixtures, then apply one aggregate call/token/spend budget across nested agents. Waiting for a human consumes no active request.

## 4. Delivery sequence

### Phase 0 — Target manifest and compatibility spike

**Files:** `package.json`, lockfile, proposed `docs/migration-targets.md` with non-secret IDs; disposable fixtures outside production code.

- Confirm the existing/new Convex project in `o-one-labs`, dev/preview/prod deployment IDs, Vercel frontend project, existing Supabase project, regions, Node runtime and rollback deployment IDs. OAuth grants account access, not a selected deployment.
- Use the `portia` Keychain profile explicitly. Current directory-aware `convex` routing covers other repositories and refuses this path; arrange project-local invocation of the installed CLI through `cx portia`, without modifying those projects or exposing tokens.
- Resolve and pin compatible `ai`, `@ai-sdk/react`, `@openrouter/ai-sdk-provider`, `convex`, Better Auth/component, validation and Decimal-library versions. Consult installed docs after installation. Do not install dependencies in this planning-only task.
- Prove one authenticated Next.js route, Convex identity, server-only write, OpenRouter streamed tool call and form pause/reload/continuation in an isolated development target. Include server JWT expiry/refresh and invalid bridge credential tests.
- Spike legacy password verification in the actual Convex auth runtime. The generic Better Auth Supabase migration guide targets SQL and cannot be executed unchanged against the Convex component.

**Exit gate:** Compatibility matrix, actual deployment/account manifest, successful spike, and a chosen credential migration mechanism. Failure here changes the plan before wider implementation.

### Phase 1 — Freeze behavior as executable fixtures

**Sources:** `backend/test_runtime.py`, `backend/test_model_selection.py`, `backend/calculator.py`, `backend/agent.py`, `backend/main.py`, `supabase/schema.sql`, existing chat components.

**New:** `tests/fixtures/`, `tests/ai/`, `tests/migration/`; select one TypeScript runner and a browser runner.

- Capture synthetic transcripts for ordinary questions, both aliases, specialist routing, multi-port comparison, missing vessel data, form submit/cancel, stopped output, provider errors and reload.
- Export calculator inputs/expected outputs from Python into shared fixtures: negative values, half-up ties, precision, ceil/floor, exponent limits, divide-by-zero, unsupported syntax and abuse bounds. Test semantic output and formatting separately.
- Inventory all 16 slugs/17 documents with filenames and content hashes. Preserve historical labeling and citation provenance.
- Add migration fixtures with mixed text/tool rows, unresolved/resolved/cancelled forms, duplicate timestamps, malformed tool arguments, orphan results, long messages and disabled users. Do not use customer data in committed fixtures.

**Exit gate:** Current offline suites establish the baseline; all proposed parity cases have explicit expectations. Existing defects are documented, not silently canonized (notably unchecked tool-call IDs in form submission and chunk-fragile custom SSE parsing).

### Phase 2 — Convex data and authorization foundation

**New:** `convex/schema.ts`, `convex/conversations.ts`, `convex/messages.ts`, `convex/runs.ts`, `convex/forms.ts`, `convex/identityLinks.ts`, `convex/http.ts`, `convex/serverBridge.ts`, `convex/lib/authorization.ts`, `src/lib/server/convex-bridge.ts`.

- Implement the contracts and indexes above, run claiming, sequence allocation, idempotency, fencing, bounded reads and recovery.
- Centralize owner checks. Validate identity status on every protected operation; disabling a user denies further work even if a token has not expired.
- Enforce per-user concurrent-run and daily call/token/spend budgets transactionally before inference, including attempts in different conversations. Add IP/user throttling for login, recovery and chat ingress; use platform/library controls where available. Define concrete limits in configuration during the spike and test limit exhaustion. Do not rely on UI disabling or process-local counters.
- Keep migration and generated-message mutations internal. Do not re-create unrestricted service-role access through a public mutation.
- A temporary Supabase JWT provider may identify existing users while the data layer is rehearsed; constrain issuer, audience and ES256/RS256 explicitly. Remove it in the final auth phase. [Custom JWT configuration](https://docs.convex.dev/auth/advanced/custom-jwt)

**Exit gate:** Anonymous/cross-user reads and writes fail for every public entry point; direct forged assistant writes fail; duplicate and concurrent attempts satisfy invariants. Test through public endpoints as well as internal mutation tests.

### Phase 3 — Port AI execution into TypeScript

**New:** `src/lib/server/ai/{models,agent,port-agent,tools,forms}.ts`, `src/lib/server/calculator.ts`, `src/lib/server/tariffs.ts`, `data/ports/`, `src/app/api/chat/route.ts`, `src/app/api/chat/cancel/route.ts`.

**Change:** `next.config.ts`, `.vercelignore`, environment examples and build scripts as needed for asset inclusion.

- Use SDK `ToolLoopAgent` with explicit model instances and bounded loops. Verify SDK 7 names such as `isStepCount`, message stream conversion and lifecycle hooks against the pinned package, not older examples. [Agent reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent)
- Port the calculator with a tokenizer/parser and Decimal library: no `eval`, `Function`, arbitrary identifiers or executable model code. Decimal inputs must preserve lexical precision; Python exponent semantics, associativity, unary precedence, scale and half-up behavior need parity tests.
- Copy tariff files byte-for-byte to `data/ports/`, retaining exact filenames, including existing spelling. Build a slug allowlist/manifest, explicitly include assets in the deployed Node function, and verify checksums from the built/deployed environment.
- Keep specialist prompt provenance, dates, currency/GST clarifications and source citations. Do not assert current tariffs merely because arithmetic passes.
- Port VesselAPI search/detail with fixed upstream host, validated IDs, timeout, bounded output and manual fallback. Treat document and vessel output as untrusted data.
- Handle `ask_user_input` as a durable human-input boundary. If emitted alongside other tools, resolve executed calls and pending calls into a valid history; never drop a call or invent a result merely to satisfy SDK validation.
- Propagate deadlines/cancellation through specialists and tools. Preserve provider privacy options; fail visibly if no eligible provider exists. Redact errors and log metadata/usage rather than full prompts, passwords or tokens.

**Exit gate:** Exact calculator fixtures, tool and routing contract tests, malformed/mixed tool-call tests, cancellation tests and packaged tariff verification pass. Both aliases must separately pass live tool calls before release; configuration presence is insufficient.

### Phase 4 — Integrate chat without redesign

**Change:** `src/components/chat/chat-view.tsx`, `form-card.tsx`, `message.tsx`, `tool-notification.tsx`, `model-selector.tsx`, `src/components/dashboard/sidebar.tsx`, `src/app/dashboard/page.tsx`, `src/app/dashboard/chat/[id]/page.tsx`, `src/app/layout.tsx`.

**New:** `src/app/ConvexClientProvider.tsx`, shared typed message/form contracts.

- Replace manual SSE parsing with `useChat` and a typed transport to the same-origin route. Client sends only the new question or explicit form response contract.
- Preserve neutral Model 1/Model 2 labels, existing per-browser selection and disabled-during-request behavior. Store the execution selection on each run for audit; do not expose provider mappings in browser metadata.
- Render persisted text, citations, progress and form parts through existing components. Persist before showing a resolved form; on failure keep it retryable. Reconcile stream and reactive history by stable IDs.
- Use paginated Convex subscriptions for sidebar/history. Keep old chat URLs, prevent initial `?q=` replay on remount/reload, and clear chat state on sign-out/account change.
- Stop, interruption and retry states must be distinct; partial output cannot appear as a completed tariff answer.

**Exit gate:** Browser parity for new chat, both aliases, follow-up, submit/cancel form, reload, stop, two tabs and sign-out. Simulate split network frames and disconnects. No duplicate initial question or assistant message.

### Phase 5 — Rehearse full auth and data migration

**New:** `convex/{convex.config,auth,auth.config}.ts`, `src/lib/{auth-client,auth-server}.ts`, `src/app/api/auth/[...all]/route.ts`, `scripts/migration/`, `docs/migration-runbook.md`.

**Change:** `src/app/login/page.tsx`, dashboard server layouts/pages, `src/proxy.ts`, providers and callback handling.

- Set up Better Auth through its Convex component. Preserve email/password login, verification status, disabled/banned status and enabled OAuth identities; inventory MFA/phone/anonymous accounts before choosing handling. No migration-induced account linking by email alone.
- Prefer importing password hashes with a tested compatible verifier so passwords keep working. Supabase uses bcrypt whereas Better Auth defaults to scrypt; prove safe verification/import within the component runtime and store credential data only in the auth component. If compatibility fails, require a reviewed re-enrollment/reset path with working email delivery before cutover. Never generate shared/default passwords or silently mark users verified. [Auth migration guidance](https://better-auth.com/docs/guides/supabase-migration-guide)
- Map imported auth identities to stable application principals using the trusted source manifest. Preserve users with no conversations too. New registration cannot claim a pre-existing principal by supplying its email/legacy ID.
- Do not migrate active sessions or outstanding reset links; require re-login at auth cutover. Verify callback origins, cookie/session handling, logout, reset-token replay protection, cross-origin request rejection and server-side access checks. Proxy redirects alone are insufficient authorization.
- Build an idempotent, paginated importer. Retain source IDs/timestamps/raw tool payloads, map conversation/message IDs, convert tool call/result pairs to typed parts, reconstruct pending forms and resolve legacy URLs. Use deterministic ordering with a documented tie-breaker for equal timestamps; quarantine ambiguous histories that cannot safely resume.
- Run imports twice in an isolated deployment. Reconcile per-user counts, source-key uniqueness, content hashes, references, and form states. Every source record must be imported or explicitly reported; unresolved rejected records block cutover.
- Rehearse a bounded write freeze: block old chat/create/form endpoints including direct legacy API access, drain in-flight streams, freeze signup/password/email/account changes, take final consistent data/auth snapshots, reconcile deletions and updates, then validate the new target before reopening writes. If the required freeze cannot be enforced or its measured duration is unacceptable, stop and design a change-log strategy; do not infer a safe delta solely from message creation timestamps.

**Exit gate:** Existing user login, new signup, verification/reset delivery where required, history and form continuation all work in the rehearsal. Two-user isolation holds after import. No unresolved identity collisions or data discrepancies. Customer notifications or reset emails require a separately authorized send; synthetic verification accounts suffice for rehearsal.

### Phase 6 — Release, rollback and remove legacy runtime

**Change:** `README.md`, `docs/architecture.md`, `docs/deployment.md`, `vercel.json`, package/scripts/env examples. Remove obsolete Supabase clients/proxy refresh, dependencies, and Python serving configuration only after gates pass. Retain tariff data and equivalent regression fixtures.

- Deploy backward-compatible Convex schema/functions before the matching Next.js preview. Bind preview to an isolated Convex target and separate server credentials; never point preview builds at production by default.
- Record the intended Vercel account/project, Convex project/deployment, production release IDs and export location. Recheck live state immediately before any authorized publish/import.
- Complete freeze/export/import/reconciliation rehearsal timings, then present the exact production release and cutover runbook for approval. Cut over storage first with the temporary identity bridge if useful, then switch login after credential parity passes. Stage cleanup only after the new auth path is verified.
- **Before the first Convex user write:** return to the untouched legacy source and reopen its write gate if acceptance fails.
- **After Convex accepts writes:** Convex is authoritative. Roll back only to a tested previous Next.js release/schema combination that still reads/writes Convex. Do not point users back to a stale Supabase snapshot. Keep such a compatible fallback release ready before opening writes. A reverse migration to Supabase is a separate freeze/export/import operation, including new users and credentials, and needs its own rehearsal.
- After final auth cutover, remove Supabase JWT trust, SDK dependencies, environment usage and legacy frontend/backend network paths. Prove login/chat still work when Supabase and the Python API are unavailable. Old services remain preserved during the agreed recovery period; deleting provider resources is separate from removing runtime dependencies.

**Exit gate:** All acceptance below passes against the exact release; rollback is rehearsed; no application dependency on Supabase/Python remains. External resource deletion is not implied by this plan.

## 5. Adversarial review and required evidence

| Attack or failure | Plan response | Mandatory proof |
| --- | --- | --- |
| OAuth selects another customer's deployment | Named `portia` profile plus non-secret target manifest; no automatic project choice | Team/project/deployment match before every cloud write |
| Browser forges a successful calculator/tool/assistant result | Server-credential + user-JWT bridge; internal generated-state mutations | Same-owner and cross-owner direct requests fail |
| User supplies another person's conversation or legacy UUID | Principal derived from verified identity; owner check on resolution and every operation | Two users cannot read, subscribe, append, cancel or resume each other's data |
| Forged/replayed form response | Stored schema, pending tool-call validation and atomic consume/continuation | Double-click, stale tab, wrong tool ID, extra fields and cross-chat replay tests |
| Two requests race or crash after charging | Atomic claim, request hash, lease/fencing, explicit retry | One logical message/run for identical request; stale writes fail; unknown billing is surfaced |
| Run hangs after navigation or Stop | Abort propagation, persisted cancellation, deadline recovery | Slow provider, cross-tab Stop, disconnect and terminated route tests |
| Mixed human/server tools corrupt model history | Persist each call/result; validate before conversion; no invented results | Mixed/parallel tools and unresolved legacy histories tested |
| Decimal port changes money | Shared Python/TypeScript fixtures; restricted parser and explicit rounding | Exact values, precision, bounds and abuse cases match |
| Deployment omits tariff files | Relocated data plus build inclusion and manifest verification | All 17 deployed files match source hashes |
| Model selection leaks across users or gets more expensive | Immutable per-attempt config, nested budget, privacy constraints and no silent fallback | Concurrent aliases, continuation alias change, 402/429/timeout/ineligible provider tests |
| User floods many conversations or recovery emails | Atomic per-user budgets, concurrency caps and ingress/auth throttling | Concurrent budget-boundary requests admit only the configured allowance |
| Auth migration loses accounts or enables takeover | Trusted identity manifest; compatible password verifier; no email-only linking | Old password, disabled/unverified user, collision, recovery and forged-link tests |
| Import misses writes/deletes or changes form history | Enforced freeze, final snapshot, deterministic conversion and reconciliation | Repeated import produces identical records; zero unexplained discrepancies |
| Rollback loses new chats/users | Post-write rollback remains on Convex; compatible fallback release | Chat and new account created after cutover survive rollback rehearsal |
| SDK examples target another major | Pinned compatibility matrix; bundled documentation; small vertical spike | Typecheck plus real streamed tool/form path on chosen versions |
| Prompt injection/SSRF or secret leakage | Reference text treated as data; bounded fixed-host tools; no arbitrary execution | Malicious document/vessel payloads, forged URLs, unsafe Markdown and redacted errors |

**Review findings incorporated:** obsolete free-model assumption rejected; experimental Next.js auth default rejected; publicly forgeable generated-message persistence rejected; finish-only persistence rejected; timestamp-only migration deltas rejected; redeploy-only rollback rejected. All are addressed above with executable release gates.

**Approval boundary:** Self-review finds the plan suitable to implement. It does not establish independent approval, password-import compatibility, operational readiness, data parity, provider availability, or production safety. Any failed exit gate blocks its dependent phase.

## 6. Validation and completion checklist

Baseline commands (run during implementation; not run for this document):

```sh
npm run lint
npm run build
PYTHONPATH=backend backend/.venv/bin/python -m unittest test_runtime test_model_selection -v
```

Add documented scripts for TypeScript checking, unit/Convex integration tests, migration rehearsal and browser tests. Do not claim those scripts exist yet. The build currently fetches fonts and may need network access. Keep the credential-dependent `backend/test_vesselapi.py` manual probe outside offline test discovery.

Release evidence must include:

- Calculator and both-model contract parity; authenticated browser question/follow-up/form submit/form cancel/reload/stop; source citations and historical labels; optional VesselAPI or manual fallback.
- Anonymous/two-user isolation through routes, Convex public APIs, subscriptions and server bridge; forged history/tool/model/identity tests.
- Credential migration and reconciliation manifest; oldest/newest messages, pending forms and legacy URLs; restart and rollback evidence.
- Exact code/dependency versions, targets, asset hashes, request/run IDs and sanitized screenshots/logs. Separate mocks, preview and production observations.
- Matched fixtures/model/provider settings for cold/warm time-to-first-token, completion latency, model/tool call counts, token cost and Convex operation volume. No latency/cost improvement claim without measurements. Establish a baseline and agree regression limits before cutover.
- Final source/build/network checks show no Supabase or Python runtime dependency. Cleanup retains unrelated dirty files, secrets and active services.

## 7. Remaining deployment gates

1. Select/confirm Convex project and dev/preview/prod targets within the verified team.
2. Prove pinned AI SDK/OpenRouter/Better Auth compatibility and password migration in the actual target runtime.
3. Inventory live user/data volumes, identity types, email delivery, provider credit/privacy eligibility and hosting limits. No customer data or secret values belong in this document.
4. Establish enforceable legacy write/auth freeze and measure its duration; reconcile every record.
5. Prepare exact release, compatible rollback artifact and production approval request after implementation/rehearsal.

## 8. Process ownership for this planning task

Inspected existing listeners and relevant process working directories before OAuth. Existing Kiraidaar/Dental preview servers and local Convex database were unrelated and left running. No Portia server, build, watcher or database was started or reused.

Convex OAuth used CLI PID `89630`, running from this repository under `cx login portia`; it completed successfully and its tool session exited. The follow-up read-only login-status CLI PID `90752` also exited. Both were absent at final process inspection. Their parent/group metadata was not captured before exit. The wrapper supplied restoration traps for global login state. No owned process needed termination. Existing software still listened on ports 5198, 5174, 3210, 3211 and 3000; no existing process was reused. Ambiguous unrelated ownership was preserved rather than used as grounds to kill a process.
