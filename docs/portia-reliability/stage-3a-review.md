# Stage 3A review packet

Batch scope: typed request/fact context, scoped corrections, form provenance, reviewed identity aliases and per-task/partial-result interfaces. This is the approved source-independent B batch, not the C/D quotation engine, source ingestion or overall plan completion.

**Final local verification: 352 tests passed; typecheck, lint (six existing warnings) and Webpack build passed. Write ownership RELEASED for orchestrator review.** All 15 prior listener endpoints preserved; no owned process survivors. Zero inference requests/spend.

## Behavior changed

- `call-context.ts` reconstructs current facts from authenticated user turns and persisted `ask_user_input` results. Facts retain scope, exact raw span, message hash/index, field/tool provenance, unit, status, revision and superseded identities. Assistant prose, lookup results and memory tool output do not become user facts. The existing persisted history/form schema stays compatible.
- Explicit cancelled-form values are ignored; the note remains current user evidence. Recognized submitted form fields use stored labels/units, with conflicting meanings/units kept unresolved. Model-written labels cannot manufacture a supplied tariff rate. Explicit DMY/MDY form choices work without locale guessing.
- Field corrections preserve unchanged timestamps/particulars; superseded timestamps cannot be used by the elapsed-time tool. Explicitly named vessels retain separate scopes. A correction with multiple possible scopes asks which scope; a new vessel does not inherit the old vessel's GT/events. Recognized port switches/rejections revoke old identity selection.
- `port-identity.ts` resolves exact identifiers and source-reviewed names/acronyms. Longest-span matching distinguishes BMCT from Mumbai Port, JSW JNPT from JNPA and GTI from generic Gateway. Ambiguous BPCL/Gateway/Nhava Sheva/Adani/Mumbai-container wording stays ambiguous. Identity resolution does not establish tariff validity or berth applicability.
- `RequestEvidence` uses the context through the existing main-agent generate/stream and specialist handoff paths. Current scoped facts take precedence over superseded history in prompts. General/paraphrased answers remain on the existing open-ended path; no closed answer-template restriction was added.
- Context tasks distinguish ready arithmetic from an invalid elapsed-time task. `ContextResult` has actual elapsed/arithmetic/lookup/memory variants without fake currency/rate fields. Dependency revalidation invalidates changed facts, rebinds unchanged measurements and rejects unprovenanced stale results; it never resurrects an already-invalid result.

The context is a transient per-run history projection, not a new owner-shared cache or durable authority record. Existing authenticated bridge, owner/fence/epoch checks, forms, cancellation and memory persistence are unchanged. Result interfaces/revalidation are foundations for subsequent C/D/E integration; they do not certify historical model answers or arbitrary calculator output. New durable records and publication tokens still require the planned owner/run/fence/context/epoch bindings.

## Regression evidence

All tests are implementation regressions/synthetic SDK integration, **not independent acceptance**. No provider requests were made.

| Evidence | Result |
|---|---|
| `red.log` | 19 intended baseline failures, 4 positive passes before implementation; includes real agent generate/stream paths |
| `red-neighbors.log` | 7 failures exposed ambiguous scopes, form unit conflict, provenance-less result reuse, leading port scope, date validation and irrelevant timezone refusal |
| `red-provenance.log` | 4 failures exposed assistant-label rate contamination, equal-fact revalidation, rejected old location and truncated numeric shorthand |
| `red-boundaries.log` | 3 failures exposed conflicting form meanings, explicit date-order form continuation and irrelevant DWT suppression |
| `focused-final.log` | 78 tests passed across new and neighboring evidence/agent/guard suites |
| `full-tests-final.log` | **352 tests / 51 files passed**; original 309 tests retained plus 43 new tests |
| `verification.json` | Final typecheck, lint/build, integrity and cleanup results; authoritative final check statuses |

CE-03/05/06 have passing offline public-path regressions: GTI specialist dispatch, cancellation correction in main-model instructions, and corrected elapsed time in generated/streamed visible text. No browser or real-provider behavior is claimed. The six original design probes remain frozen as historical baseline evidence; they were not edited to turn old failures green.

Full lint initially found an `any` in this agent's earlier **local-only** stage-0 probe. The helper was aligned with the already-typed saved probe (`ModelMessage[]`); no lint rule was weakened. Sandbox build first failed DNS access to Google Fonts. The network retry removes provider/vessel keys and sets paid/test inference disabled; it is a compile check, not a production configuration or deployment artifact. Rebuild under verified production settings before any release.

## Limits and open obligations

- **CE-01/02 open:** numeric membership and free-form calculator expressions still do not prove charge, operand, source or unit correctness. No ledger correctness claim.
- **CE-04 visible behavior open:** typed task validity distinguishes independent work, but existing global GT/time containment can still suppress a valid partial answer. It is not marked fixed. New unrelated DWT invalidity is not added to that blanket guard.
- Extraction is bounded and deterministic, not a complete natural-language semantic engine. Unrecognized prose remains available to the agent. Omitted-year/clock-only event corrections, complicated coreference, source-backed task requirements, exclusions, tariff rules and final answer/publication validation still need subsequent work. Do not count generic refusal as success.
- No new tariff rates, official quote oracles or source bytes were ingested. All 16 identifiers and 17 asset hashes remain unchanged. D03/D04 independent oracle work stays with orchestration.
- Original 19-case inputs and imported 24-case development inputs remain byte-identical; development candidate execution remains NOT_RUN. Holdout was not opened.
- No Convex schema/bridge mutation, production privacy/model change, provider call, deployment, commit or push. API inference spend **$0**.

## Exact code/test changes

Modified against the archived dirty baseline:

- `src/lib/migration/request-evidence.ts`
- `src/lib/migration/domain-agent.ts`

New:

- `src/lib/migration/call-context.ts`
- `src/lib/migration/port-identity.ts`
- `tests/migration/call-context.test.ts`
- `tests/migration/request-context-regressions.test.ts`

Tracking/report changes: `docs/portia-implementation-status.json`, `docs/portia-implementation-checklist.html`, this packet. Evidence: `output/reliability-stage3a-20261015/`. Local-only check supervisor, progress renderer and entry snapshot: `.local/reliability-stage3a-20261015/`; typed cleanup of `.local/reliability-gate-20261014/design-probes.mts` noted above.

`changed-files.json` contains exact file SHA256 values and preservation results. `implementation.patch` compares only these six code/test files with the original archived **dirty** baseline, not clean HEAD, so earlier audit changes are not attributed to this batch. Stage entry was also archived separately (384 files) before edits. Never restore either archive over newer user work.

## Review handoff

Final ownership/verification state is recorded in the progress JSON and `verification.json`. This batch releases sole write ownership to orchestration for review. Continue implementation only on that review's continuation. Full plan implementation, independent tariff/model acceptance and deployment remain open.
