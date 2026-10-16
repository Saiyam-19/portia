# Portia full-scope reliability plan

**Status:** Proposed execution plan; no implementation or live inference performed for this plan.

**Goal:** A user describes a vessel/port call or asks a tariff question in ordinary language. Portia identifies the requested scope, obtains only necessary missing facts, uses the applicable source, calculates correctly, explains the result, and handles corrections/comparisons/follow-ups across every existing port and feature.

**Binding constraints:** Preserve every existing port identifier and user-facing capability. Keep API costs low. Preserve original test inputs and unrelated dirty work. Retain the current Next.js / AI SDK / OpenRouter / Convex architecture unless a demonstrated requirement makes a narrowly scoped change necessary. No unrequested redesign, platform migration, paid-model switch, uploads/RAG, or automatic learning expansion.

**Approach:** Establish explicit contracts between request interpretation, tariff evidence, calculation, answer construction and durable execution. Retrofit those contracts into the existing tools and workflow. Use the model for language and evidence-grounded reasoning; use code to enforce provenance, applicability, units, calculations, state and publication. A successful refusal is not evidence of successful quoting.

## Verified starting position

- Current serving manifest: **16 port/terminal identifiers, 17 files**. All current file hashes match the manifest. `data/ports/bpcl-cargo-jetty/tarrifs.md` is empty. A matching hash proves asset integrity, not tariff correctness or freshness.
- Sources are bundled reference documents. Current official applicability must be established separately for each source and date; the plan does not assume it.
- Existing capabilities include port/rule questions, charge estimates, comparisons, supplied-rate arithmetic, elapsed-time calculations, vessel lookup/manual fallback, structured clarification, corrections, two model aliases, saved conversations, Stop, deletion and explicit memory/working notes. The baseline inventory must reconcile this list against actual UI, routes, tools and configuration before declaring it exhaustive.
- Last recorded verification: 309 local tests passed; typecheck, targeted lint and Webpack build passed. Last failed-case live rerun: 7 original checks passed, 4 blocked by the free-key quota. These are historical results, not fresh runs for this planning task, and do not certify complete quotations.
- Proven failures: invented dates/rates; swapped rejected timestamps; rewritten calculator results; wrong-port tariff substitution. The exact cause of five earlier execution interruptions remains unproven.
- Recent regex/source guards and form recovery are useful containment. They do not establish a general semantic model of requests or tariffs. Existing accepted numbers can still be assigned to the wrong charge; valid aliases can be over-rejected; old and new facts can be mixed.
- Source is extensively dirty. Local fixes and deployed artifacts differ. Prior Convex deployment is recorded, while the latest Next guards remain local. Reverify deployment identity at execution time.
- Graph discovery was attempted. Its recorded generation is 2026-10-13T18:25:09Z; changed/new files are stale or untracked in that graph. Current manifest and relevant agent/guard code were read directly. Do not infer completeness from the graph.

Evidence: `output/agent-root-causes-20261014/report.txt`, `assessments.json`, `saved-tool-traces.json`, `pre-port-guard-scenario01.json`, `rate-limit-diagnostic.json`; `docs/audit-remediation-2026-10-14.md`; `README.md`; `docs/architecture.md`.

## Scope lock and operating rules

Before changing application code, create a recoverable baseline of the current work and record commit, diff, source hashes, configuration identifiers, model mappings and deployed versions. Do not silently reset, commit, deploy or discard unrelated work. Inspect existing processes/listeners; reuse compatible servers, track owned processes and clean up only verified owned processes.

Create an invariant register with stable IDs. Preserve at least:

1. Every existing port/terminal entry, charge capability, rule explanation and comparison path.
2. Standalone supplied-rate and elapsed-time calculations without unnecessary tariff intake.
3. Conversation corrections, forms, cancellation notes, reload, history and search.
4. Vessel lookup when configured and truthful manual fallback when unavailable.
5. Model 1 / Model 2 routing and server-only provider identity/credentials.
6. Explicit remember/recall/forget/clear, working notes and source-deletion behavior.
7. Authentication, ownership, idempotency, revisions/fences, Stop, deletion, concurrency and recovery.
8. Existing request/byte limits, provider cancellation patch, bounded memory capabilities and accessibility behavior.

Each proposed change must name its requirement, owning workstream, affected invariants, counterexample, tests, cost impact and rollback. Do not close an issue by weakening an assertion, deleting a port, disabling a feature, changing a frozen input, or replacing an answerable request with a generic refusal. New product scope requires a separate decision. Routine repairs within this plan do not require repeated confirmation.

## MECE ownership

These are exclusive responsibility boundaries, not seven independent rewrites. Every requirement has one primary owner; interfaces and dependent tests are linked. Classify a failure by the earliest broken contract and record downstream symptoms separately.

| ID | Owns | Question it must settle | Output handed to the next layer |
|---|---|---|---|
| A | Product coverage and reference knowledge | What is supported, and which evidence/rules apply? | Versioned capability and tariff registry |
| B | User intent and conversational facts | What does this user currently want, and what facts are established? | Versioned request context with provenance |
| C | Charge applicability and computation | Which charges/rules apply, and what are the correct amounts? | Auditable calculation ledger |
| D | Answer completeness and presentation | Does the answer fulfil this request faithfully? | Validated answer payload with citations |
| E | Execution and product-state integrity | Does the whole interaction execute, persist and recover correctly? | Durable, owner-scoped run/form/memory state |
| F | Independent verification | What evidence proves the above, including unseen inputs? | Frozen tests, counterexamples and verdicts |
| G | Release, cost and drift control | Can this exact version run affordably and remain verifiable? | Versioned release evidence, spend limits and rollback |

Security/privacy ownership is E; source freshness is A; numerical correctness is C; unsupported claims are D; test independence is F; deployment/cost/version drift is G. They are not left as unowned cross-cutting concerns.

## A — Complete coverage and source authority

**Existing files:** `src/lib/migration/ports.ts`, `data/ports/`, `src/lib/migration/vessels.ts`. **New deliverables:** machine-readable capability/source registry plus `docs/portia-coverage.md`; exact filenames finalized in the baseline task.

**Change:** Inventory every existing port, terminal, charge type and non-price question capability. Map each to document, section, jurisdiction, applicable vessel/voyage/cargo conditions, effective period, currency, units, amendments and known exclusions. Explicitly distinguish historical quotations from current estimates. Keep port and terminal identities distinct; maintain reviewed aliases and ambiguous-alias candidates. Track dependencies such as vessel API configuration separately from tariff coverage.

Resolve empty/missing/outdated evidence through authoritative published sources, retaining previous versions and provenance. Obtain domain adjudication only for genuine interpretation ambiguity; record the adjudicator/source rather than inventing a resolution. An unavailable authoritative source is an unresolved dependency. Keep the port visible and provide a precise missing-evidence path; do not claim its requested quotation capability is complete.

**Adversarial challenge:** Same-name terminals; generic Adani/JNPT requests; Mumbai source offered for Chennai; expired schedules presented as current; amendments that affect only one charge; empty files; conflicting schedules; instructions embedded in tariff text.

**Acceptance:** All 16 entries and all inventoried capabilities have explicit evidence/status. No unexplained missing matrix rows. Every applicable rate/rule has a source/version/section. A source from another port or period cannot silently satisfy a request. Full-scope quoting readiness cannot be declared with unresolved source dependencies for promised quotes.

## B — Reliable request understanding and corrections

**Existing files:** `src/lib/migration/request-evidence.ts`, `contracts.ts`, `domain-agent.ts`; conversational context crosses the chat route and Convex history. **Proposed new module:** `src/lib/migration/call-context.ts`.

**Change:** Introduce a typed request context: requested tasks/charges, port/terminal candidates, vessel particulars with explicit tonnage type, voyage/cargo class, relevant events, durations, currency preferences, supplied quotations, exclusions and unresolved conflicts. Every value carries origin, source reference/raw span, unit, validity status and revision. Model extraction proposes values; code validates them against source evidence and supported conversions. Preserve ordinary shorthand and paraphrases.

Apply corrections to specific fields and invalidate only dependent calculations. Current explicit user corrections outrank older chat facts and memory; conflicting vessel lookup data is surfaced. Distinguish a new vessel/port leg from a correction to the old one. Memories and assistant-generated statements never become official tariff evidence.

Clarification is driven by requirements of the requested charge or rule. Group necessary missing questions; do not request already supplied or irrelevant particulars. Allow the user to answer in prose or through the current form flow. An invalid field must not erase independent valid work or block an unrelated requested answer.

Replace heuristic-only guards incrementally after equivalent positive and negative regressions pass. Do not make exact wording the condition for valid input.

**Adversarial challenge:** GT versus DWT/cargo tonnes; Unicode minus; zero/huge values; numeric/date ambiguity; clock zones; correction after form cancellation; repeated changes; port changes that leave old city names in history; two vessels; remembered stale details; a valid alias rejected by literal matching; ordinary non-price questions containing “estimate”.

**Acceptance:** Confirmed facts, uncertainties and requested scope match independent fixtures. Corrections preserve unchanged facts and invalidate stale derived results. All answerable requests remain answerable. No assistant fabrication is promoted into user evidence.

## C — Correct tariff application and arithmetic

**Existing files:** `calculator.ts`, `calculator-batch.ts`, `elapsed-time.ts`, `arithmetic-tools.ts`, `domain-agent.ts`. **Proposed new modules:** `tariff-rules.ts`, `calculation-ledger.ts` under `src/lib/migration/`.

**Dependencies:** A provides reviewed rules; B provides the current request. F supplies independent expected calculations before implementation.

**Change:** Encode the inventoried charge rules as versioned, constrained data/functions using the existing decimal engine. Each ledger item identifies request revision, port/terminal, tariff/version/section, eligibility decision, quantities, rates, units, formula/rule ID, rounding stage, currency and result. Derived totals reference ledger items. The model cannot establish validity merely by inventing an expression that happens to calculate correctly.

Cover actual source-defined rules: slabs, minimum/maximum charges, included periods, hourly/day/part-period rounding, concessions, priority/surcharges, shifting/anchorage treatment, tax applicability/order, FX source/date and effective-date boundaries. Encode only rules supported by evidence. Keep elapsed occupancy distinct from billable time. A supplied quotation remains its own labelled evidence class; do not add excluded taxes or port requirements.

Comparisons share explicit scope/assumptions. Keep different currencies separate until a supported conversion is requested. Never infer berth availability, acceptance or a guaranteed final invoice from a cost calculation.

**Adversarial challenge:** Correct multiplication of a wrong rate; GT used as DWT; an existing number attached to the wrong line item; hours billed as days; rounding twice; omitted minimum; surcharge order; included-period mislabelled as free; tax applied twice; comparing unlike scopes; stale totals after corrections; valid monotonicity assumptions broken by a tariff discount/slab.

**Acceptance:** Every distinct inventoried rule branch and boundary has independent deterministic tests. Line items and totals match reference values to the documented currency precision. Units, rule eligibility and source linkage pass separately from arithmetic. An arbitrary expression or mere numeric membership is insufficient evidence of correctness.

## D — Complete, faithful user answers

**Existing files:** `reviewed-report.ts`, `guarded-main-model.ts`, `domain-agent.ts`, `src/components/chat/chat-view.tsx`. **Proposed new module:** `src/lib/migration/answer-contract.ts`.

**Change:** Build a structured answer payload containing requested tasks, results, pending items, assumptions, exclusions, source/version citations and uncertainty. Render financial tables directly from the ledger. The language model may explain verified findings but must not rewrite numerical facts or invent applicability claims. Validate non-price tariff explanations against the referenced passages too.

Publication binds to the current run and request revision. Comparisons include every requested side/charge, or explicitly identify the unresolved part. A clarification returns useful verified partial work where appropriate. A source gap gives a concrete next requirement. Do not convert a recoverable model-format problem into a long generic refusal or an irrelevant form.

**Adversarial challenge:** Plausible citation from the wrong port; correct total with wrong formula; silent omission of one requested scenario; an estimate labelled guaranteed; prose contradicting its table; private model details; an outdated approved report after a user correction; refusal of an otherwise answerable request.

**Acceptance:** Every requested subtask maps to an answer, necessary clarification or evidenced limitation. Quotes match C exactly; citations establish the claims they accompany. Both usefulness and correctness pass. Format/wording variation cannot bypass verification or cause gratuitous refusal.

## E — Preserve the whole interaction and existing features

**Existing areas:** chat/cancel routes, `contracts.ts`, `client-state.ts`, `public-stream.ts`, `stream-finalizer.ts`, `safe-model.ts`, `response-errors.ts`, chat/form components, `convex/migration.ts`, `convex/schema.ts`, `src/lib/memory/`, `convex/memory.ts`, `convex/lib/memoryLifecycle.ts`, authenticated bridges and existing audit tests.

**Change:** Carry the new context/ledger contracts through the existing state machine with backward-compatible persisted data where required. Retain real form submission/cancellation, natural-language follow-ups, saved chat history, two model aliases, lookup fallback, explicit memory and working notes. Preserve ownership, revisions, fences, idempotency, exactly-once form consumption, Stop, deletion barriers and recovery.

Make structured-output recovery bounded and observable. Keep rate-limit/auth/budget/timeout/malformed-output/persistence failures distinguishable in sanitized diagnostics. Never save a partial response as complete or replay paid inference automatically after recovery. Keep production privacy settings intact; the previous retention exception was limited to synthetic local testing.

**Adversarial challenge:** Mixed/invalid tool output; truncated streams; tab close/Stop during nested tools; duplicate send/reload; overlapping corrections; stale form submission; login expiry; two users; deleted memory reappearing; cross-chat contamination; provider 429/402/5xx; offline vessel service; oversized Unicode fields; interrupted persistence; buffering that breaks cancellation or makes the composer unusable.

**Acceptance:** Existing baseline behavior and audit protections continue to pass. New metadata remains owner-scoped and cannot resurrect deleted facts. Run/UI state agrees with durable state. Each failure is recoverable or explicit and does not silently mutate user inputs. Accessibility and mobile usability of changed controls remain intact.

## F — Independent, adversarial evidence

**Existing tests/evidence:** `tests/migration/`, `tests/audit/`, `vitest.config.ts`, `vitest.audit.config.ts`, original frozen `output/independent-agent-test-20261014/inputs.json`, current saved responses/tool traces. **Proposed deliverables:** `tests/acceptance/portia/` fixtures and a machine-readable coverage/verdict ledger; integrate a dedicated runner if the current test include patterns require it.

**Independence:** Keep the original 19 scenarios byte-identical as a regression suite. New acceptance inputs must be written from the product brief and realistic user needs by an author without implementation or previous-response access. Expected tariff answers come from independently verified source interpretation and a separate reference calculation; never copy Portia's output or reuse its calculation implementation as the oracle. Implementation-level unit tests may inspect code; label them separately from independent acceptance evidence.

Freeze one development set and one unseen acceptance set before repairs. Once a held-out case is used to guide a fix, it becomes regression evidence and is replaced in the unseen pool. Adversarial review must actively seek a counterexample to each claimed invariant; merely approving the design or reusing the same prompt does not count.

**Test layers, in order:**

1. Offline schema, rule, arithmetic, boundary, property and state tests, including positive cases that guards could falsely reject.
2. Replay saved provider/tool responses through current code; mock malformed output, failures, concurrency and cancellation. Replays prove code behavior only.
3. Local production-build browser/API/Convex journeys with synthetic accounts. Verify displayed and persisted answers, not only HTTP success.
4. Real-model journeys only after cheaper gates pass. Resume unresolved 2/3/5/10 when free quota permits; final acceptance also covers the complete inventory and unseen cases on the intended production configurations.

Every port/terminal must have an appropriate successful price journey, a source-backed rule question and its relevant clarification path once source evidence is complete. Every charge-rule branch is tested offline. Every distinct conversation/product flow has end-to-end evidence. Use pairwise combinations for ordinary dimensions and exhaustive combinations for identified high-risk interactions; do not pretend a sample covers the full Cartesian product. Run both enabled model configurations through the applicable acceptance set. If cost blocks this, leave that configuration unverified rather than claiming the other model's result transfers.

**Scoring:** For each case report separately (a) correct facts/rules/numbers, (b) complete response to the requested work, (c) appropriate clarification/limitations, (d) persistence/UX integrity, (e) latency/calls/cost. Status is pass, fail, blocked or not run with a denominator. Necessary clarification is a pass only when that was the expected outcome; an answerable quotation ending in refusal fails task completion. Provider failure is blocked, not a correctness pass. LLM self-scoring is never the sole judge.

**Acceptance:** Traceability from every invariant, port, capability and rule to evidence. All frozen acceptance requirements pass on the final candidate; no skipped/blocklisted failures hidden in aggregates. Zero observed wrong-port rates, fabricated authoritative claims, material numeric errors, privacy violations or stale-result publication. These are release gates, not statistical guarantees about all future inputs.

## G — Cost controls, release and future drift

**Existing files/areas:** `model.ts`, `agent-policy.ts`, `domain-agent.ts`, `scripts/memory-chat-lab.mts`, deployment configuration/docs and provider error reporting. **New deliverables:** per-run cost/request ledger, release manifest and rollback checklist; reuse existing persistence where appropriate.

**Cost policy:**

- Planning, source inspection, deterministic tests and replay: **zero paid inference**.
- Record expected provider requests for each proposed live batch before running it, including nested specialists. Free requests still consume scarce quota.
- Use a single pinned free configuration for development diagnostics. On account quota exhaustion, stop further calls against that exhausted quota and report blocked work; no model/key hopping, repeated probes or paid fallback.
- Before final paid acceptance, calculate a conservative token/call cost bound using current endpoint pricing and set an explicit hard dollar cap. No new paid spend is authorized by this document. Reuse an already-authorized cap if one exists; otherwise establish it only when the reviewable test batch is ready.
- Enforce both per-run and suite budgets, including specialist calls and retries. Reserve worst-case cost before dispatch, handle concurrent reservations atomically, reconcile usage, and refuse a call when pricing/budget cannot be bounded. Log unknown usage as unknown, not zero.
- Batch related arithmetic and cache immutable tariff/rule data by version. Cache/replay evidence only with exact input, code, prompt, model and source version keys; never reuse a quote across changed context or owners.
- During fixes rerun affected cases plus their neighboring positive/boundary regressions. Run the entire offline suite at milestones. Reserve a single comprehensive live acceptance pass for the frozen candidate, with limited repetition of nondeterministic high-risk cases to expose inconsistent answers. Stop and diagnose the first systemic failure.
- Do not optimize tokens or calls by omitting requested charges, conditions or source evidence. Use recorded latency/cost baselines to set numerical regression budgets before release; do not invent an ETA or dollar estimate before the matrix is sized.

**Release order:** Freeze candidate and evidence → verify target account/configuration → deploy required compatible Convex changes first → build/deploy matching frontend → verify exact deployed code/source/model identifiers → run narrow production smoke journeys → verify actual canonical-origin auth/persistence and rollback readiness. Local builds and deployed releases receive separate verdicts. Never deploy the lab's local-backend artifact to production.

**Anti-drift:** Every release records code SHA/diff, tariff/rule hashes, prompt/config/schema versions, model/provider selection and the exact evidence set. Changes to any of these invalidate the relevant evidence. A bug gets a regression plus a neighboring counterexample. Retain known failures and compare per-capability completion/refusal rates, accuracy and cost. Scope changes require an explicit decision; a test regression cannot be renamed “expected behavior” to achieve a green report.

**Acceptance:** No protected invariant regresses; no unresolved material acceptance failure is hidden by a total score. Both configured aliases and all preserved features have appropriate final evidence. Budgets, quota handling, privacy settings, production configuration and rollback are verified. No orphaned agent-owned test processes remain. Monitoring/recurring jobs require a separate user request; none are scheduled by this plan.

## Execution sequence and stop gates

| Stage | Work | Gate before proceeding |
|---|---|---|
| 0 | Freeze current state, invariant register, environment identity and existing evidence | Scope and baseline are reproducible; no existing feature omitted |
| 1 | A inventory/source review; F prepares independent cases and reference answers | Every capability has a source/status/test obligation; ambiguous rules have named resolution needs |
| 2 | Define B/C/D/E interfaces; challenge the design with counterexamples | No stale fact, wrong source, invented expression, numeric reassignment or refusal loophole left unaddressed |
| 3 | Implement B, then C, then D in bounded changes; integrate E as each contract changes | Demonstrated failing regression before each behavioral fix; affected positive and negative tests pass afterward |
| 4 | Complete E lifecycle coverage and F offline/replay/local journeys; enforce G budgets | Full offline suite, typecheck, lint/build, auth/persistence/cancellation and scope parity pass |
| 5 | F real-model acceptance on the frozen candidate under G limits | Every required case has a truthful verdict; blocked cases remain open; no fabricated correctness claims |
| 6 | G deployment, production verification and handover | Exact deployed version has evidence; all promised capabilities meet the gate; rollback/process cleanup recorded |

No fixed completion ETA until Stage 1 sizes the number of unique tariff rules and source gaps. Source ambiguity or provider quota can block live completion while independent offline work proceeds.

## Counterarguments this plan must survive

| Claim | Adversarial objection | Required response |
|---|---|---|
| “309 tests pass, so the agent works.” | Most tests may verify plumbing, not user outcomes. | F reports user-task completion and independent financial correctness separately. |
| “The calculator returned that total.” | The model may have chosen the wrong rate, period or vessel measure. | C validates source, eligibility, units and operands before trusting arithmetic. |
| “Every number appeared in a source.” | Correct numbers can be attached to wrong charges or currencies. | C/D bind each displayed value to a typed ledger item and source/rule. |
| “The guard stopped bad quotes.” | It may now refuse correct queries or force unnecessary forms. | Positive completion and unnecessary-clarification regressions are release gates. |
| “All ports are still listed.” | An empty or stale tariff makes the capability unusable. | A resolves coverage dependencies; registry presence alone cannot mark completion. |
| “The original scenarios now pass.” | Repairs may overfit wording and known examples. | F uses blind inputs, unseen cases and property/boundary counterexamples. |
| “The free model failed, so buy a better model.” | The application may still accept wrong sources/state/results. | Diagnose layers independently; production-model acceptance follows code/data gates. |
| “The stronger model passed once.” | A stochastic or provider/config change can alter behavior. | G versions the configuration; F repeats targeted high-risk cases and preserves failures. |
| “A disclaimer makes the amount safe.” | A wrong calculation remains wrong. | Wrong answers fail; uncertainty language cannot substitute for correctness. |
| “All-local success means deployed success.” | Backend, frontend, data and configuration may differ. | G verifies the exact deployed combination and canonical browser flow. |

## Definition of done

Portia retains the full inventoried scope and completes answerable requests correctly, asks focused necessary questions, and explains real evidence limitations. Every preserved capability has passing independent evidence on the intended deployment/configuration. Every amount is traceable to current request facts and applicable source rules. Existing product and privacy/lifecycle protections remain intact. Costs are bounded and recorded. The final report states remaining limits plainly; it does not guarantee an unknowable future final invoice or claim perfect behavior on every possible prompt.

**If a necessary source or production-model check remains blocked, the honest outcome is “implementation complete; acceptance incomplete,” with the exact outstanding item. It is not full readiness.**

## Locked existing port/terminal identifiers

`bpcl-cargo-jetty`; `bpcl-liquid-cargo-jetty`; `gateway-terminals-india-pvt-ltd`; `ictpl`; `jaigarh`; `jawahar-nehru-port-authority-jnpa`; `jsw-jnpt-liquid-terminal`; `konkan-lng-ltd`; `mumbai`; `mumbai-container-terminal`; `mumbai-cruise-terminal`; `nhava-sheva-freeport-terminal`; `nhava-sheva-gateway-terminal`; `nhava-sheva-international-container-terminal`; `ranpar-finolex`; `redi`.

## Planned validation commands

Run from the correct checkout with Node 22; first inspect existing processes/listeners. These are planned commands, not executed results for this document.

```sh
npm test
npm run typecheck
npm run lint
npm run build -- --webpack
git diff --check
```

Add focused runs for newly integrated acceptance fixtures and the real local harness once its runtime prerequisites are confirmed. Before touching Next-specific APIs, read the relevant installed guide in `node_modules/next/dist/docs/`; use installed AI SDK documentation and current schema/tool contracts. Deploy commands are chosen only after the intended environment, compatible backend contract and rollback artifact are verified.
