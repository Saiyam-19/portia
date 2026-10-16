# Stages 0–2 review packet

**Ready for orchestrator review. Application implementation has not started. Write ownership released at this checkpoint.** Continue stage 3 only after the orchestrator's review/continuation in this chat. This is not completion of the end-to-end reliability task.

## Scope and baseline

Checkout `/Users/saiyamchaplot/Documents/portia-main`, `main`, HEAD `b64420fcfe0eea206918bfb34cf9cf38112b8302`, plus all pre-existing dirty changes. A hash-verified 357-file recoverable archive and staged/unstaged binary patches are retained under `.local/reliability-gate-20261014/`. No reset, stash, commit, push, deploy, application edit, tariff replacement or private-environment edit occurred.

Only the two existing implementation tracking files changed; all other pre-existing tracked/nonignored files retain baseline hashes. The original 19-case input SHA256 remains `25aa0523922b5b60eed304a52282ee1111e94dbf7568559ac745ef4ec86c0592`.

| Check | Fresh result | Evidence |
|---|---|---|
| Node/runtime | Node 22.23.2; installed Next 16.3.8, AI SDK 7.0.134 | package/config source; baseline summary |
| Offline tests | **309 passed / 49 files**, 0 failures | `output/reliability-gate-20261014/tests.log`, `checks.json` |
| Provider cancellation patch | Verified by pretest | tests log |
| TypeScript | Passed | `typecheck.log` |
| Full ESLint | Passed, **6 existing warnings** | `lint.log`; generated disable comments and intentional login navigation |
| Diff whitespace | Passed | `diff-check.log`; rerun after artifacts |
| New inventory utility | Syntax and focused ESLint passed; deterministic regeneration | `artifact-verification.json` |
| Inventory consistency | 16 IDs / 17 hashes / every line covered by section inventory; JSON/reference integrity passed | same verification file |
| Build/browser/live inference | **Not rerun** at this documentation-only checkpoint | No historical pass promoted to fresh proof |
| API cost | **0 Portia provider requests, 0 vessel API requests, $0 paid inference** | Offline tests/probes; source research and deployment metadata reads only |
| Processes | All owned check processes exited; 15 prior listener endpoints preserved; no services started, reused or stopped | `process-before.json`, `process-after.json` |

Graph-first discovery used the indexed project and traces; coverage reported the 2026-10-13T18:25:09Z generation, stale changed agent/route/contracts and untracked guards. Exact source reads filled those gaps. No reindex worker was launched by this task; existing product/MCP helpers were preserved.

Vercel project/team and production alias metadata were verified read-only. Canonical `portia-berthing.vercel.app` is assigned to `dpl_7oQfybiyXH2w6gCU54LFmukDVWSC`, READY, production, metadata SHA `b64420f…`; prior READY deployment `dpl_AmFoNpXh6Tg4juz7KknwJWQjjuYy` is marked a rollback candidate. Connector returned 403; existing CLI credentials succeeded for the exact linked project/team. **Metadata SHA is not byte-level deployment parity.** Production settings, canonical authenticated journeys and Convex module/config parity were not reverified. Handoff's Convex target `o-one-labs:portia / joyous-kookabura-196` remains historical until release checks. Root `.env.local` contains only legacy Supabase/backend configuration, so it is not a runnable current-stack environment. No private credentials were copied into reports.

## Inventory and independent evidence

[Coverage entry point](../portia-coverage.md) links all deliverables. Machine registry covers all 16 preserved entries, 17 files, 367 sections and **2,068 candidate evidence fragments**. These are not approved rules, distinct-rule counts, verified tariff coverage or acceptance passes. Every section survives, including nonnumeric definitions/notes. All manifests match; BPCL cargo remains empty.

The [scope register](invariants-and-capabilities.md) locks 24 invariants and 27 capability groups: quotations/rules/comparisons, supplied-rate and elapsed arithmetic, corrections/forms, vessel lookup/fallback, model aliases, saved history/search/drafts/copy, memory/notes/deletion, auth/ownership, Stop/recovery, API compatibility, accessibility/mobile/theme, privacy and budgets. Per-port required success/rule/clarification journeys remain explicit obligations.

The independent author supplied **24 development cases**, spanning all 16 catalog entries, with **25 development numerical checks**. Imported `tests/acceptance/portia/development.json` byte-identically, SHA256 `97cee8ab42e2377e15a703d3d44fc4d17601d01e5471084f0c876094bad5d63d`. Evaluation notes also copied byte-identically, SHA256 `4214ca61c1eb684b07b61feaf9eb646c3f9ec1b46cd53d291d45d327c9f63224`. Every candidate verdict is **NOT_RUN**. Fourteen development cases require unresolved external tariff oracles. Orchestration retains **12 sealed holdout cases**; this implementation chat did not read them or their validation report. The orchestrator reports 46 numeric checks across the combined pack; that is authoring evidence, not Portia evidence.

[Reference obligations](reference-obligations.json) maps each development case to ports, capabilities, source IDs, external-oracle scope and operational fixtures. The pack is finite and does not cover every rule or every per-port journey. F must derive tariff expectations from original authoritative documents independently of both candidate output and newly encoded rule data. Existing implementation tests/probes are labelled separately.

## Source gaps and resolution owners

[Official-source review](official-source-review.md) provides primary links for every entry and named resolution needs. Material findings:

- BPCL cargo identity/source missing; BPCL liquid rows have ambiguous units/merged columns and duplicate national appendix.
- Newer 2026 schedules located for multiple ports/terminals; original bytes, charge-level interpretation and amendments still need review. No automatic ingestion.
- GTI's newer PDF still repeats an expired MUC subclause; JSW liquid sections expire March 2025. Neither is cured by a general publication date.
- KLL November 2026 revision is future-effective for October calls; numerical table/FX/cap interpretation still open.
- `mumbai-container-terminal` bundle is BMCT at JNPA; preserve slug and resolve identity, not silently substitute Mumbai Port.
- JNPA legitimately references conditional MBPA dues. ICTPL's multiplier is charge-specific. Cross-authority dependencies must be explicit, not universally forbidden or permitted.
- Mumbai amendment/cruise retrieval and current Finolex/Redi primary tariff remain unresolved.
- Shared “Lighterage” content concerns national marine aids to navigation dues; payment validity/deduplication and applicability need one reviewed authority rule.

Owner A resolves source identity/validity; F independently resolves reference expectations. These gaps block affected official-price acceptance, **not review of this packet or source-independent implementation**. No affected capability is removed or counted successful via refusal.

## Concrete interfaces and review responses

[Contracts](contracts.md) specifies:

- **B**: immutable field facts with raw authenticated evidence, units/status/revision, vessel/leg scope, correction reducer and dependency invalidation. Cancelled field values cannot override cancellation notes. Clarification follows task/rule requirements.
- **C**: approved versioned source rules, explicit cross-authority dependencies, typed operands and decimal operation traces. Tariff expressions come from reviewed templates; generic calculator success is not tariff validity. Totals carry completeness, requested/pending/excluded/not-applicable identities and mandatory-dependent obligations. Incomplete scope can only render a labelled partial subtotal.
- **D**: every fresh answer uses the same envelope and publication validator; TaskKind is not authorization. Numbers, labels, claims and citations render from approved ledger/rule/definition/template references. No unrestricted explanatory-text slot or new legacy/general completion bypass. General-answer usefulness remains a parity gate, not an excuse for blanket refusal.
- **E**: owner/run/fence/context/hash/epoch-bound snapshots and atomic completion; optional additive persisted metadata for legacy compatibility; no re-certification of old answers. Deletion/forget invalidate derived state; partial steps stay partial; no automatic inference retry.
- **G**: preserve existing call ceilings; add atomic run/suite worst-case monetary reservation before dispatch, including specialists, with unknown usage held as unknown. Current cap remains $0.

The four preliminary review requirements are incorporated: total completeness identities; model-classification bypass protection and positive general-question neighbors; candidates remain candidates and mandatory dependencies differ from explicit exclusions; independent oracles do not inspect encoded rules.

## Reproduced adversarial failures

All six are zero-inference **implementation-aware design probes**, not independent acceptance. Exact probe code and observed outputs are in `output/reliability-gate-20261014/design-probes.mts` and `design-counterexamples.json`.

| ID | Baseline behavior | Required positive neighbor |
|---|---|---|
| CE-01 | Swapped berth/pilotage amounts accepted because numbers occur elsewhere | Correct charge-bound table passes |
| CE-02 | Invented `666*999` accepted after any supplied rate exists | Explicit arithmetic request remains answerable |
| CE-03 | Valid GTI alias rejected | Reviewed alias works; ambiguous Gateway remains unresolved |
| CE-04 | Reversed timestamp suppresses independent `2+3` answer | Return 5 while clarifying only reversed interval |
| CE-05 | Cancelled GT2000 overrides correction note GT3000 | Preserve GT3000 and unchanged 10h stay |
| CE-06 | End-time correction loses original start; no duration | Preserve start and return corrected 3h interval |

Additional adversarial requirements cover stale publication tokens, prose/TaskKind bypass, future/expired clauses, legitimate cross-authority rules, duplicate dues, wrong units/tax/FX order, source deletion, concurrent reservations and over-refusal. Dispositions are proposals, not independent approval.

## Exact changed files

Modified existing files:

- `docs/portia-implementation-status.json`
- `docs/portia-implementation-checklist.html`

New documentation/data/utility/fixture:

- `docs/portia-coverage.md`
- `docs/portia-source-registry.json`
- `docs/portia-reliability/source-annotations.json`
- `docs/portia-reliability/official-source-review.md`
- `docs/portia-reliability/invariants-and-capabilities.md`
- `docs/portia-reliability/contracts.md`
- `docs/portia-reliability/reference-obligations.json`
- `docs/portia-reliability/independent-evaluation-risks.md`
- `docs/portia-reliability/stages-0-2-review.md`
- `scripts/audit/inventory-reliability.mjs`
- `tests/acceptance/portia/development.json`

New evidence under `output/reliability-gate-20261014/`:

- `baseline-summary.json`, `checks.json`, `environment.json`, `vercel-baseline.json`
- `tests.log`, `typecheck.log`, `lint.log`, `diff-check.log`
- `design-probes.mts`, `design-counterexamples.json`
- `process-before.json`, `process-after.json`
- `artifact-verification.json`, `changed-files.json`

Local-only recovery/tooling under `.local/reliability-gate-20261014/`: baseline archive/manifest/status/patches, check supervisor, probe source, source outline and raw deployment metadata reads. None is a production build or deployable artifact. `changed-files.json` is the exact machine list/hash record for reviewable files; all prior application/data/test files remain baseline-identical.

## Gate and next action

Stage 0 local baseline verified; remote runtime parity deferred explicitly. Stage 1 inventory and independent obligations prepared; source/oracle resolution open. Stage 2 concrete interfaces/counterexamples prepared; final orchestrator review pending. Stages 3–6 not started.

**Write ownership: RELEASED.** Orchestrator may review this packet now. On approved continuation, implement B's six reproduced defects with positive regressions, then source-independent C/D contracts and additive E integration, while A/F resolve tariff/oracle dependencies. Do not open holdout or perform paid inference. No additional user confirmation is needed for already-authorized implementation after this review gate.
