# Scope lock — 14 October 2026

Application baseline: `b64420fcfe0eea206918bfb34cf9cf38112b8302` plus the pre-existing dirty tree. This milestone changes documentation/inventory utilities only. Existing features below are preservation requirements, not claims that all paths currently work. Fresh offline baseline: 49 files, 309 tests passed. Independent tariff and product acceptance remain separate.

The recoverable snapshot is `.local/reliability-gate-20261014/worktree-baseline.tar.gz`; its per-file hashes are in `baseline.json` beside it. It covers 357 tracked/nonignored untracked files, with binary staged/unstaged patches. Ignored private configuration, dependencies and build outputs remain untouched in place. Do not restore the archive over newer work; recover selected files into an isolated directory and compare first.

## Protected invariants

| ID | Required behavior | Primary owner | Current evidence surface / remaining obligation |
|---|---|---|---|
| INV-01 | Preserve all 16 exact port identifiers and all 17 historical assets | A | `ports.ts`; machine registry checks exact hashes; new versions must be additive |
| INV-02 | Answerable prices succeed with every requested charge/scenario | D | New task-to-answer coverage gate; refusal is not price success |
| INV-03 | Rule/definition questions remain answerable without full quote intake | B | `domain-agent.ts`; new positive rule-question acceptance |
| INV-04 | Supplied-rate arithmetic needs no port or lookup; respect exclusions | C | arithmetic tools; independent calculation and exclusion oracles |
| INV-05 | Elapsed time works even for unsupported ports; distinct billable time | C | `elapsed-time.ts`; preserve raw dates/zones and focused clarification |
| INV-06 | Corrections supersede only targeted facts and dependent results | B | `request-evidence.ts` has reproduced defects; field revision/dependency tests needed |
| INV-07 | Multiple vessels, legs and comparisons retain separate scope | B | No flat global latest-number accumulator; comparison coverage tests needed |
| INV-08 | GT/GRT, NT/NRT, DWT, displacement, cargo mass and LOA never silently interchange | C | Dimensional validation separate from arithmetic |
| INV-09 | Port/terminal, source version and effective conditions bind every rule | A | Source registry; cross-authority dependencies must be explicit |
| INV-10 | Financial line labels/amounts/formulas/currencies cannot be reassigned by prose | D | CE-01/02; typed ledger and deterministic rendering |
| INV-11 | Clarify only unresolved fields necessary for requested subtasks | B | Current forms max 8 fields; prose continuation retained |
| INV-12 | Form submit/cancel consumed exactly once; cancellation note remains a correction | E | `resolveFormAndClaim`; cancelled field values must not override note |
| INV-13 | New chat saves initial intent before navigation; reload/retry doesn't replay inference | E | initial-intent audit; request hash/idempotency retained |
| INV-14 | Saved history, pagination, title search, drafts and copy response retained | E | dashboard sidebar, chat-view, message; title search currently covers loaded pages only |
| INV-15 | Vessel search/detail when configured; truthful manual fallback otherwise | E | `vessels.ts`; no repeated unavailable lookup; no override of explicit correction |
| INV-16 | Model 1/2 immutable per run; provider IDs/credentials remain server-side | G | `model.ts`, `public-stream.ts`; production model acceptance unverified |
| INV-17 | Explicit remember/recall/forget/clear and chat-only notes retained | E | memory tools, API and panel; historical memory is not tariff authority |
| INV-18 | Owner, auth, epoch/fence/lease and source-deletion protections persist | E | Convex run/memory checks; new derived objects inherit same checks |
| INV-19 | Stop/disconnect/deletion abort nested work; partial saved steps never become complete quotes | E | finalizer/provider patch, lifecycle tests; new publication race tests |
| INV-20 | Bounded requests, Unicode bytes, tool/form/history/output limits remain enforced | E | bounded-body, contracts, audit tests; new metadata bounded too |
| INV-21 | No implicit paid retry, fallback, quota evasion or production privacy relaxation | G | maxRetries=0, no fallback, production ZDR/data-collection settings; hard monetary reservation still needed |
| INV-22 | Basic/private auth, signup/signin/signout, redirects and mobile/accessibility behavior retained | E | login/layout gates, sidebar/menu/form semantics |
| INV-23 | Exact frozen original inputs unchanged | F | SHA256 `25aa0523922b5b60eed304a52282ee1111e94dbf7568559ac745ef4ec86c0592` |
| INV-24 | Local, replay, live-model and deployed evidence remain distinct | G | No synthetic success promoted into production acceptance |

## Product capability register

Every row requires a positive completion journey and relevant negative/neighboring case; test presence is not independent acceptance. All rows currently have independent acceptance status **pending**. Port-specific prices/rules/clarification expand across every `PORT-*` entry in `../portia-source-registry.json`.

| Capability | Scope / entry point | Invariants | Existing baseline tests or source evidence | New obligation |
|---|---|---|---|---|
| CAP-01 | Supported-port listing / exact slug dispatch | 01,09 | `port-assets`, `domain-agent` | 16 IDs identical; reviewed aliases; ambiguous names stay distinct |
| CAP-02 | Tariff price / scoped and complete call estimate | 02,08–10 | `domain-agent`, calculator tests | Successful quote per port plus each approved rule branch |
| CAP-03 | Tariff rule, definition, applicability, exclusion question | 03,09 | specialist bundle/prompt | Cited correct passage; zero irrelevant vessel fields |
| CAP-04 | Historical quote versus current/future schedule | 09,24 | static source wording | Effective boundaries, amendments and expired subclauses |
| CAP-05 | Port/scenario comparison | 02,07,10 | specialist budget supports 3 consultations | All requested sides; shared scope; unlike currencies separated |
| CAP-06 | Supplied-rate quotation and arithmetic check | 04,08,10 | `independent-calculations`, calculator-batch | Independent expected values; taxes/minima only as supplied |
| CAP-07 | Raw elapsed-time calculation | 05,06 | `elapsed-time`, `request-evidence` | Missing zone/date order; DST offsets; reversed interval; valid partial result |
| CAP-08 | Natural-language corrections / follow-ups | 06,07 | current guard probes CE-05/06 | Repeated and scoped correction; unchanged facts retained |
| CAP-09 | Clarification forms and prose replies | 11,12 | `form-render`, `pending-form-composer`, `contracts` | Required-field minimality; matching form IDs; same data in prose |
| CAP-10 | Cancel form, with/without note | 06,12 | `form-cancel-response`, state tests | Cancelled values ignored; empty cancel $0 provider calls; note continues task |
| CAP-11 | Vessel name/IMO/MMSI/callsign search and detail | 15 | `vessels` | Configured success, 404/timeout, conflicting lookup, manual fallback |
| CAP-12 | General maritime/non-price question | 03 | main-agent direct path | No forced financial intake from words such as “estimate” alone |
| CAP-13 | Unsupported port with useful partial work | 02,04,05 | guard tests | Arithmetic/time answer plus exact tariff gap; no wrong-port substitution |
| CAP-14 | New chat and saved initial intent | 13 | initial-intent audit | Reload, double click, same-ID retry, no duplicate inference |
| CAP-15 | Saved messages, pagination, current title search, conversation navigation | 14 | sidebar + state/lifecycle tests | Reload displayed/persisted answer parity and pagination; search scope unchanged |
| CAP-16 | Composer draft preservation, pending form question, copy, autoscroll | 14,20 | `client-state`, pending-form composer | Editing during response/reconnect; keyboard/copy feedback |
| CAP-17 | Model selector Model 1/2 | 16 | `model-routing`, state tests | Alias after reload/form continuation; no provider identity leak |
| CAP-18 | Stop, disconnect and explicit retry/recovery | 19 | cancel-route, cancellation-matrix, finalizer | Nested tool/persistence races; no auto-replay; actual adapter cancellation |
| CAP-19 | Conversation deletion and related-source memory cleanup | 18,19 | memory-deletion/lifecycle | Active run deleted; unrelated chat notes preserved; no resurrection |
| CAP-20 | Explicit save/recall/update fact | 17,18 | agent-memory/lifecycle | Two chats; raw provenance; current correction outranks memory |
| CAP-21 | Forget one fact / clear memory | 17,18 | memory lifecycle + API/panel | In-flight deletion barriers; history retained by current product contract |
| CAP-22 | Read/write working notes and memory panel refresh | 17,18 | session-recovery, memory-wait | Chat isolation; bounded queues/polling; sanitized tool failure |
| CAP-23 | Basic/private signup/signin/signout and owner isolation | 18,22 | auth-render, gate, login-navigation | Canonical origin with two users; session expiry and signout |
| CAP-24 | Canonical and compatibility API/routes | 20,22 | transport/origin/layout tests | `/api/chat`, cancel, memory, auth; `/api/migration/*` aliases; `/chat`/`migration` redirects |
| CAP-25 | Theme, mobile sidebar, public navbar and accessible controls | 22 | UI audit + current components | Light/dark/system; 320px; focus/labels/keyboard unchanged |
| CAP-26 | Sanitized diagnostic/error recovery | 19–21 | safe-model, response-errors, error-precedence | Distinguish rate-limit/auth/payment/timeout/output/persistence; unknown usage stays unknown |
| CAP-27 | Server execution bounds and provider privacy | 20,21,24 | policy, body, dependency/cancellation audit | Existing 16-call/3-specialist caps plus atomic dollar reservations; no privacy drift |

No new uploads, RAG, automatic learning, OAuth, magic links, email verification or password recovery is added by this plan. Legacy Python/Supabase files are parity/history assets, not another serving stack.

## Change accountability

Every stage-3 batch must record requirement/CAP ID, primary A–G owner, affected INV IDs, pre-fix counterexample, positive neighbor, exact changed files, cost impact and rollback. A fix cannot close an obligation by dropping a capability, source section, port, assertion or frozen input. Source registry statuses may improve only with linked authority/adjudication evidence.
