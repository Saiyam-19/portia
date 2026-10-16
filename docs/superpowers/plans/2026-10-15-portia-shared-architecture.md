# Portia shared architecture implementation plan

**Status:** Implementation authorized by the human on15October2026, assigned to a new implementation chat. This replaces the failure-list-first delivery sequence. Existing failures are regression evidence; they do not define the architecture or completion.

**Governing goal:** Portia helps someone plan a port call and get trustworthy answers about its charges and tariff rules through normal conversation. The user supplies whatever details they know. Portia understands vessel, voyage, port and requested charges; asks only necessary questions; uses the correct tariff; calculates accurately with sources; handles corrections, follow-ups and comparisons across every existing port/feature; and identifies genuine missing or unverifiable information. The user need not understand tariff documents or supervise arithmetic.

**Scope:** Preserve all16 existing port/terminal identifiers, all existing charge/product capabilities,17 historical source assets, approved newer sources, privacy/lifecycle protections and unrelated dirty work. Keep Next.js/AI SDK/OpenRouter/Convex. No new product features, provider/platform migration or unrelated redesign. Complete the requested work scope: berth-only remains berth-only; existing broader charge requests and comparisons remain supported obligations.

## Current baseline and reason for change

HEAD is b64420fcfe0eea206918bfb34cf9cf38112b8302 plus extensive uncommitted audit and reliability work. Previous implementation chat01a13b84-a118-7460-b72c-e997865ec806 stopped and released ownership. Changes remain local and undeployed.

Verified examples include a supplied quotation withUSD4275total and an official coastalMumbaiIndiraDock berth-hire estimate ofINR51094includingGST, each through genuine free-model UI/backend/save/reload. Latest narrow input fixes have focused evidence. These are controls, not all-port or ordinary-conversation acceptance.

Source inspection shows that `prepareOfficialBerth` and `prepareSuppliedQuotation` inspect `context.latestText`, match specific wording, and require facts within that text. `domain-agent.ts` chooses separate quote paths and forced intake from those results. `call-context.ts` already has useful scoped facts/provenance/revisions, but its parsing is not a general language interface. Preserve validated arithmetic, provenance, source/version checks and fenced publication; replace phrase-specific conversational authority incrementally.

Graph project Users-saiyamchaplot-Documents-portia-main reports generation2026-10-13T18:25:09Z. Relevant symbols are missing or files stale/untracked; exact source reads were used. Recheck coverage before structural discovery; do not start duplicate reindex workers.

## Shared runtime design

`Authenticated conversation + explicit form/lookup/memory evidence → structured request proposal → validated context update → applicable rule requirements → focused clarification or calculation plan → verified result/answer → fenced persistence and display`

One path handles ports, supplied quotations, elapsed time, questions and comparisons through typed task/scope/source data. Port-specific differences live in reviewed tariff data or justified rule evaluators. They do not live in copies of conversational regexes. Existing separate main/specialist agents may remain orchestration participants; they must share the same context and result contracts.

### A. Language interpretation and conversation state

**Purpose:** Understand varied wording and information supplied over multiple turns without demanding a special prompt.

The free language model proposes structured tasks, vessel/call/scenario identities, fact operations, source references and unresolved ambiguities. Operations distinguish assertion, correction, rejection, preservation, reference/hypothetical and a new vessel/leg. Forms, prose replies and cancellation notes use the same reducer. Preserve raw authenticated inputs and provenance; an assistant message or memory must not silently become a current user fact or official rate.

Code validates schema, authenticated evidence references, units, supported conversions, ranges, operation targets and revision consistency. Exact evidence spans support auditability but do not alone establish semantic meaning. Ambiguous role/scope remains unresolved. Model confidence or a second model's agreement is not authority. Use bounded lexical utilities for numbers/dates/units, not whole-sentence acceptance lists. Do not require every ordinary word to match a handcrafted grammar.

Context persists or reconstructs deterministically from owner-scoped versioned evidence across reloads. Explicit current corrections supersede only affected facts and derived results. Unchanged facts survive. Comparisons and new calls retain separate scopes; previous/next voyage ports do not replace the requested port. Lookup results and explicit memory stay separate evidence classes, with existing deletion/epoch protection.

**Owning surfaces:** `call-context.ts`, `request-evidence.ts`, `request-semantics.ts`, `port-identity.ts`, `domain-agent.ts`, existing form contracts and Convex conversation/run state. Add a small schema/adapter module only where it owns a distinct interface; no parallel second framework.

### B. Source authority, rule selection and necessary questions

**Purpose:** Let tariff requirements determine missing information and applicability.

A reviewed rule identifies port/terminal, effective period, charge scope, required facts, eligibility and exclusion predicates, quantity/rate units, computation/rounding/tax/FX rules and exact authoritative references. Models propose rule IDs and evidence selections; server-owned registry validates them. Unreviewed model-extracted tariff clauses remain candidates, never automatically executable official rules.

Use the existing registry, source snapshots and independent adjudications. Resolve essential missing sources/interpretation for inventoried capabilities; do not repeat broad research or encode every extracted fragment as an approved rule. Preserve historical versions and cross-authority dependencies explicitly. Missing current-source authority is a named coverage blocker, not permission to substitute another port's tariff or remove the port.

The clarification planner takes requested tasks, current facts and candidate-rule requirements. It asks only unresolved questions that affect those tasks, groups related questions and retains useful partial results. Rule explanations do not inherit vessel-quote intake. Missing tariffs cannot be solved by asking irrelevant vessel questions. A previously provided value is not requested again unless conflicting or invalid.

**Owning surfaces:** `ports.ts`, source registry/approved data, existing specialist tools and source-backed calculator interfaces. Preserve all16catalog entries; approved coverage is tracked separately from catalog presence.

### C. Calculation and answer contracts

**Purpose:** Give complete answers whose source, conditions and arithmetic agree.

One calculation plan binds task/scenario, context revision, approved rule/source version, operands and dimensions. Code generates bounded Decimal calculations from rule operations, including time billing, minima/caps, condition-dependent adjustments, tax and FX where applicable. Supplied user quotations use the same machinery with a distinct evidence class and validated quoted terms; no implicit official authority. Explicit arithmetic remains usable independently.

Unsupported or ambiguous governing terms remain visible pending obligations. Never silently drop them and label the result complete. Every requested task/charge maps to calculated, not-applicable, explicitly excluded or unresolved status. Comparisons maintain the requested sides and compatible scope/currencies. Stale context invalidates dependent calculations and publication tokens.

Render financial rows, amounts, formulas, units and citations from the verified calculation record. Preserve natural useful explanations through source-bound claims/structured facts; avoid expanding a literal sentence-template library for every maritime question. Claims that alter a charge's applicability must be validated against the rule/evidence, not just a citation's existence. General conversation must stay usable, while labelling a financial claim general cannot bypass its validation.

Persist and publish through existing owner/run/fence/lease/revision/epoch checks. Financial output must not precede successful validation/durable completion. Keep safe progress and Stop responsive. Malformed model output has bounded explicit recovery; no silent paid retry and no generic refusal replacing independently answerable work.

**Owning surfaces:** existing Decimal calculator/batch/elapsed tools, `official-berth.ts`, `supplied-quotation.ts`, `guarded-main-model.ts`, reviewed report/public stream, chat route and Convex completion. Migrate reusable parts into shared contracts; do not leave unsafe legacy publication as an escape path for unrecognized wording.

### D. Product preservation

All27 capability groups and24 invariants in `docs/portia-reliability/invariants-and-capabilities.md` remain binding. Preserve model aliases, forms/cancel notes, vessel lookup/manual fallback, saved history/search/drafts, Stop/recovery, explicit memory/notes/forget/deletion, authentication/ownership, bounded inputs and accessibility. New state remains backward-compatible and owner-scoped. Production privacy and existing endpoints remain unchanged until an accepted compatible release.

## Implementation sequence and observable milestones

The new chat owns implementation end to end. Start with shared interfaces and working code; do not spend a full stage collecting another finite failure list or building another scripted demo. Record a concise design/migration note, then proceed autonomously within this approved plan. Review meaningful integrated milestones, not each phrase or helper function. Routine repairs require no renewed permission.

| Milestone | Deliverable | Observable acceptance |
|---|---|---|
| M1: shared conversation core | Structured interpretation, scoped reducer and requirement-driven clarification integrated into the real agent | An incomplete request can be completed over several turns; paraphrased facts/forms yield equivalent context; corrections preserve unrelated facts; reference values and new calls stay distinct. No branch on fixture ID/name or full prompt wording. |
| M2: shared sourced answer path | One rule/ledger/answer interface for existing official tariffs, supplied quotes, arithmetic and explanations | Existing positive journeys survive through shared contracts; changed quantities generate correct new amounts; independent tasks survive invalid unrelated facts; rule questions avoid intake; every requested item has an honest disposition. |
| M3: existing-port coverage and conversations | Migrate inventoried port/charge capabilities using the shared interfaces and reviewed sources | Port-by-port source status, successful price/rule/clarification evidence where authority permits; corrections/follow-ups/comparisons use the same orchestration. All ports retained; unresolved source-dependent quotes remain blockers to full readiness. |
| M4: independent product acceptance | Frozen candidate, original/development cases, unseen inputs and existing lifecycle journeys | Actual responses demonstrate correctness, completeness, focused clarification and persistence/UX integrity. No wrong source/rate, fabricated authority, stale result or privacy regression observed in required coverage. |
| M5: compatible release | Matching backend/frontend/config with rollback and canonical-origin verification | Only exact tested configurations receive a passing release verdict. Deployment and production smoke are separately evidenced. |

M1 andM2 should be developed as a coherent shared path and validated across multiple task types. Use existing approved Mumbai rules and supplied quotations as regression controls, not the architecture boundary. Implement M3 with common rule-operation families; port-specific domain rules are valid when sourced, prompt-specific parser forks are not.

## Verification strategy: capabilities and properties

Keep original19 inputs,24 development cases and12 sealed holdout cases unchanged. Do not open the holdout until candidate code/prompts/models/source versions and development results are frozen; used holdouts become regression evidence. Independent tariff expectations must come from source-only interpretation/calculation, not candidate outputs or encoded rule data.

Tests target invariant families: equivalent paraphrases and turn splits; fact-order variation; numeric/unit/time boundaries; corrections affecting only dependencies; same pipeline with different ports/rules; separate comparison sides; source/version mismatches; contradictions and reference roles; requested scope completeness; failed/stale persistence; cancellation/deletion/isolation. Derived implementation property tests are labelled code-aware, never falsely independent.

A finite test suite is evidence with limits, not proof of all possible prompts. Known failures are regression protection. Do not shrink an expected successful quote into a refusal, silently alter inputs, or count provider/source-blocked checks as passes. Separate free-model language behavior, deterministic rule/math correctness, local product journeys and deployed configurations. Do not certify the normal production models from a different free-model result.

## Source/evidence reuse and blockers

Use the existing independent source packages under the orchestrator's durable visualization directory. They contain approved components, conditional rules and unresolved full quotes; those statuses must be preserved. `portia-independent-all-port-coverage` is a coverage/gap matrix, not an all-port oracle. Jaigarh/NSICT supplemental candidates need their recorded second review before approval. The Mumbai demo packet has separate input/oracle approval. Do not open the sealed acceptance folder wholesale.

If a necessary tariff is unavailable or ambiguous, finish independent architectural/product work, retain the port and report exact missing evidence. Ask for domain input only when public source work cannot resolve a genuine governing ambiguity. Source freshness and production-model acceptance can block complete readiness without blocking unrelated implementation.

## Cost, execution and ownership

- Paid Portia inference remains$0. Use a currently available tool-capable free model, pinned per batch; the previously tested candidate is `nvidia/nemotron-3-super-120b-a12b:free`. Recheck metadata and credential validity when live tests are actually needed; no paidfallback, key/accountcycling or repeated exhausted-quota probes.
- Existing dedicated test credential location is supplied privately in the handoff, never its value. It expires2026-10-15T21:42:00Z. Read metadata without inference when needed. Its$0key ceiling previously allowed free calls; preserve zero provider-price ceilings and no fallback/retries.
- Start with offline structured proposals/replays and property/calculation checks. Small free live batches have a predeclared per-run/suite dispatch ceiling including extraction, main and specialists; reserve atomically, retain unknown/failed reservations, stop on systemic failure. Do not issue a live call simply to check quota.
- Reuse bounded context/proposals and immutable versioned source data where safe. No repeated model calls for unchanged extraction, no caches shared across owners, no stale quote reuse after a correction. Do not reduce requested scope to save tokens.
- Use Node22 and installed Next/AI SDK docs before relevant changes. Read Convex expert guidance before editing `convex/`. Run meaningful focused tests, typecheck/lint/build, and full offline checks at integrated milestones; avoid duplicate full-suite runs on unchanged code.
- One new implementation chat is the sole repository writer. The previous chat remains stopped. Orchestrator stays read-only while ownership held; read-only source/review helpers may be delegated where justified. Preserve dirty work and take a recoverable current-state snapshot before code changes; old archives are historical, not reset targets.
- Inspect process identities/listeners before starting runtimes, reuse only compatible healthy instances and never stop user/other-project services. Track ownedPID/PGID/PPID/cwd/ports/purpose and clean up verified owned trees. Avoid printing credential-bearing process arguments.
- Deploy only after the original acceptance gates and target/config/rollback checks. If intended production models require paid verification, keep that gate explicitly unverified; no paid authority is implied by implementation authorization.

## Progress against the human goal

Update the existing statusJSON and HTML checklist at meaningful milestones with these rows: ordinary request understanding; necessary clarification; correct tariff coverage; calculation/source-backed answer; corrections/follow-ups/comparisons; truthful evidence limits; preserved product/lifecycle; deployment.

For each, report implementation state, evidence boundary, concrete user outcome, remaining blocker and next step. Use statuses such as implemented, offline verified, live verified, blocked or not run. Never turn unit-test counts into completion percentages. All-port denominator is16; source-ready and user-journey-ready counts are separate.

Completion requires the governing goal across the existing supported scope on the intended configuration, with explicit unresolved external limits. A particular amount, wording, example or test count is not completion. The immediate expected progress is a shared working conversational foundation, followed by reusable source-backed execution and independent coverage evidence.

## Precedence and authorization

This plan implements the human's latest architecture-first approval and supersedes the failure-list-first sequence in the former15October delivery reset. The14October full-scope plan remains the detailed scope/invariant reference. Earlier strict phrase/template or narrow-demo design choices must be reconciled with the shared approach; they are not requirements to preserve. Existing financial correctness, source authority, lifecycle and privacy requirements remain binding.

The human has authorized implementation now and expressly requested a new chat. Routine implementation, local verification and free-model acceptance within these limits may proceed. No repeated permission gate between ordinary milestones. Meaningful scoped review may request corrections without expanding the feature brief.

## Approved bounded completion after resumption

The human superseded the stop and authorized continued work on the CURRENT implementation: no rewrite, scope expansion, new research wave or prompt-specific repairs. One integration pass, one full acceptance pass, then one targeted repair/retest pass. Report remaining blockers before widening. This chat remains the sole writer; root coordinates read-only reviewers.

Immediate gate: genuine browser → local backend → free interpretation → displayed/saved/reloaded answer, using unchanged MUMBAI-DEMO-001 and its independently approved INR51,094 oracle. D01 is only a supplied-rate connectivity fallback. Preserve prior failed reservations. The new `shared-architecture-live-r2-20261015` batch has eight total free upstream dispatches, at most four per user turn, retries zero, fallbacks false and prompt/completion/request price ceilings zero. Read credential/endpoint metadata first; stop this batch on systemic provider failure. Synthetic-local retention consent continues; production privacy is unchanged. Whole-suite inference receives a separately recorded budget before dispatch.

Then finish existing conversation flow; integrate the already-collected reviewed tariff packets and exact gaps for all16ports; run unchanged original19/development24 and compatibility acceptance. Root freezes the candidate before accessing sealed12. Deploy only after accepted exact-configuration and rollback gates. Existing offline/build evidence is reused unless code/configuration changes justify rerunning it.

### Human clarification,16October2026

Finish implementation first. Full original/development/holdout/live scenario runs are deferred until code implementation is marked done. Continue necessary focused regression, typecheck and build checks. Implementation completion is distinct from acceptance and deployment; the expired inference credential must not block independent code work. Remaining code is source-component coverage, comparison/lookup continuations and precise retained gaps across all16entries, within the existing architecture.
