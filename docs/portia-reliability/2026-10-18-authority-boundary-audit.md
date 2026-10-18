# Exact-operation authority repair and current-runtime adversarial audit

**Local repair gate: PASS. AUTH-01 and AUTH-02 closed by code-enforced approval.**
No staging, commits, push, cloud deployment, paid inference or blind evaluation.
This is a bounded development audit, not proof that every bug has been found.

User policy: confirm each new or changed **supplied quotation** and cross-chat
memory write/forget operation. Also confirm supplied comparison FX/rounding.
Unchanged confirmed quotes can be read again. Official-source calculations without
supplied FX, automatic chat-only notes, and explicit Memory-panel actions retain
their existing behavior.

Base HEAD `2a77ead22c5a8dc365b58806f38accd4f959b2bd`, dirty branch
`pass1/golden-and-repairs`. The checkout already contained tariff integration,
engine replacement, cleanup and earlier safeguard repairs. The task-specific
[source hashes](evidence/authority-boundaries/source-hashes.json) identify 29 changed
or new code/test paths against this task's entry snapshot, rather than attributing
the entire dirty Git diff to this repair.

## What is enforced

1. **Proposal, not mutation.** Every actual `createMigrationMainAgent` binds an
   authority coordinator, including injected sessions. Supplied quote arguments
   become a normalized candidate without changing the saved quote or emitting an
   accepted receipt. Cross-chat model tools cannot call the original mutation.
   Direct run-originated memory enqueue, including clear, is rejected by Convex.
2. **Exact review.** Code renders the complete effective terms, changed prior
   terms/removals, original comparison amounts, and exact memory key/value. It
   visibly escapes control characters. Operative terms are never truncated: the
   versioned packet is limited to four operations/48KB and the review to12,000
   characters. Oversized operations must be split. Model-generated generic forms
   keep their500-character limit; only server review forms get the longer limit.
3. **Authenticated consent.** A private packet belongs to its server-created form,
   owner, conversation/revision and waiting-run fence. It expires after15minutes.
   Only `Approve exactly as shown` with a blank note grants execution. Reject,
   cancel, a correction note, wrong form/chat/owner, expiry, changed quote base or
   changed memory epoch/revision cannot approve it. Expired/corrupt reviews can
   still be cancelled, rejected or replaced with a correction.
4. **Deterministic execution.** The current Next route loads the private grant and
   executes its stored payload without a model/provider call. It cannot substitute
   new model-selected amounts. Approved quote/comparison receipts must match the
   stored candidate/input and bound revisions at completion. Approved execution
   cannot checkpoint intermediate records or open another approval form.
5. **Persistent price provenance.** Conversation state stores confirmed quote
   revision/digest bindings. Historical hashes prove integrity only; an old supplied
   receipt without approval cannot authorize a fresh calculation or ranking. Its
   full terms need review. Immutable historical uncertainty stays unresolved.
   Supplied prices cannot become official tariff evidence.
6. **Memory admission and deletion.** Approval atomically admits memory work with
   stable form/operation IDs; retries do not enqueue it again. Execution drains the
   real memory runtime before reporting saved/forgotten. Forget binds the old
   value by hash without copying it into its review. Conversation deletion revokes
   active grants and purges approved source-derived memory through the existing
   deletion barrier. Chat history remains separate from cross-chat memory.

Implementation: `src/lib/authority/{contract,session,execute}.ts`, current
`QuoteSession`, current domain agent/memory tools, current chat route/publication,
Convex form/run/memory boundaries, and the existing form UI. No replacement engine
or new model orchestration framework was introduced.

## Findings fixed during this deeper pass

| Finding | Consequence before repair | Enforcement / executable evidence |
| --- | --- | --- |
| AUTH-01: invented amount or official-to-supplied switch | Correct arithmetic could certify a model-invented price. | Original two adversarial model probes now leave zero accepted quotes; exact reviewed revision required before execution. |
| AUTH-02: write despite negative consent | Faulty `remember_memory` requested a write despite “do not remember.” | Original probe now requests no mutation; real model-facing tool proposes only; backend blocks direct agent writes. |
| Approved receipt checkpoint duplication | Checkpoint saved a receipt, then completion required it again; reload could reject duplicate revisions. | Approved executions cannot checkpoint. One atomic completion owns all receipts and ledger updates. |
| Comparison marked completed by prose | An approval digest could be recorded without the corresponding comparison execution. | Completion requires one exact comparison receipt; prose-only completion rejects. |
| Comparison followed by changed member | Later quote execution could remove an already calculated comparison from the final answer. | Mixed quote/comparison packets reject in both orders, at coordinator and packet parser. Confirm changes before comparing them. |
| Run-backed memory clear gap | Backend protected remember/forget but left clear outside that guard. | Every run-backed enqueue is denied; explicit no-run Memory-panel forget/clear remains tested. |
| Review formatting injection | Newlines or directional controls inside values could resemble separate review operations. | Visible escaping plus hostile multiline/bidi regressions; scalar content cannot create structural review lines. |
| Mislabelled NT form | A field named `nt` could carry a gross-tonnage/deadweight/cargo label and promote that answer into NT. | Current session requires the paired saved form metadata and rejects contradictory labels/units; valid labelled NT remains accepted. |
| Memory-only publication omission | Browser approval saved memory but returned only generic “operations applied.” | Executor records the actual saved/forgotten disposition after draining; unit and real local browser positives pass. |
| Generic/authority form bound mismatch | Extending every form to12k would allow model forms that the generic backend rejects at500. | Separate model input and server form limits; regression covers both. |

These are specific defects and integration gaps, not ten unrelated production
incidents. Some were found while implementing the new boundary. No deployed
exploitation frequency was measured.

## Verification and evidence

[Machine-readable results](evidence/authority-boundaries/validation.json) retain
commands, exit status, process groups and build identity.

| Surface | Result | What it establishes |
| --- | --- | --- |
| Current ordinary suite | **904 passed,77 files; zero failures** | Current runtime, source calculators, receipt import, forms, lifecycle, cancellation, memory and publication regressions. |
| Separate adversarial gate | **3 passed**; original baseline had3 failures | Scripted faulty-model outputs cannot immediately accept invented supplied prices or request unapproved memory writes. No expected-failure masking. |
| TypeScript | PASS | Current application, backend and test types. |
| ESLint | Zero errors;6 existing warnings | Four generated-file directives and two existing login navigation warnings. No new warning. |
| Production build | PASS, Node22.23.2 / Next16.3.8 / webpack | Build `NrPPqC4M04zMrmJBxj806` from the tested source. |
| Browser/API/data round trip | **7 verified behaviors**, zero page errors | Real production-build UI, current Next route, real isolated local Convex, real memory runtime; only model output synthetic. |
| Packaging/preservation | PASS | Both chat routes trace all79 canonical data files; no env, Git, local state, evidence archive or temporary provider driver bundled. All79 data hashes and both private config files unchanged. |

Focused authority coverage includes amount, currency, units, denominator, minimum,
maximum, bound removal, charge removal, tax, rounding/removal, occupancy, GT,
service scope, comparison FX, legacy receipt trust, approval display/payload
mismatch, bad hash/revision, stale memory epoch/revision/value, generic approval
forgery, wrong principal/root/form, reject/cancel/note, expiry/corrupt cancellation,
active replay, deleted active grants, approved-memory source deletion and queue
publication. Tests use current business/runtime and Convex functions. Lower-level
memory lifecycle fixtures now call the trusted queue helper solely to isolate
batching/corruption/deletion; they do not reopen an agent admission bypass.

The integrated test in `tests/authority/flow.test.ts` runs current agent proposal
through real Convex form persistence/resolution, deterministic execution,
completion, reload and unchanged quotation read. This is separate from domain
arithmetic tests that directly instantiate the pure quote calculator.

### Browser observations

The browser test independently asserts these local behaviors:

- Full review persists across reload; approval starts unselected; narrow viewport
  has no horizontal overflow. Expected USD137.50 + USD24.25 = **USD161.75**.
- Exact approval publishes that total without another provider call.
- Reloaded confirmed quote reads without another review.
- Rejected USD999 change leaves the original quotation unchanged; rejection makes
  no model call.
- Approve plus a correction note does not apply the proposed USD999 change.
- A malicious remember call after negative consent only proposes; rejection leaves
  cross-chat facts empty.
- Approved remember persists the exact key/value; approved forget removes it
  without repeating its value in the forget review/response. Both bypass model
  reinterpretation.

See [browser results](evidence/authority-boundaries/browser-results.json),
[desktop review](evidence/authority-boundaries/review-desktop.png) and
[narrow viewport](evidence/authority-boundaries/review-mobile.png). Screenshots
capture the visible chat scroller; they are not a claim of a full accessibility
or design audit.

Verification setup problems were corrected transparently: a TypeScript serialization
mismatch stopped the first build; the initial synthetic provider failed to read
its system message format, and waiting for Playwright's SSE `finished()` stalled
one later attempt. The driver now waits for a new rendered assistant response.
The memory-only outcome failure was a real application defect and received an
application fix plus a regression. Final browser run passes on the final build.
The retained drivers are synthetic development fixtures, not a blind evaluation
or evidence of real-model language reliability.

## Review method and limits

Three bounded reviews were used: backend implementation review, independent
specification review, and independent lifecycle/security review. Reviewers read
source and regression assertions; they did not independently execute the full
suite. Findings were fixed, and the lifecycle reviewer rechecked the repairs.
They reported no remaining confirmed authority bypass within inspected paths.
Graph coverage was checked for the twelve main evidence paths; generation
2026-10-18T16:42:18Z was ready with no recorded gaps. Direct source reads verified
subsequent edits. Coverage metadata is not proof of exhaustive discovery.

The previous engine-replacement safeguards remain exercised by the904 tests:
mixed arithmetic/lookup fallback; explicit partial failure; historical currency
and bounds; immutable unsupported historical terms; cancelled form values;
GT/NT/category evidence; source effective intervals; comparison invoice-rounding
preservation; authenticated history; run/owner/lease/epoch fencing; source deletion;
provider timeout/cancellation; persistence before final financial publication.
Historical implementations were reference material only; none was executed for
this acceptance result.

**Important partial-commit semantics:** approved memory is durably queued at the
approval transaction, before quote result publication. A later disconnect/expiry/
calculation failure can leave that approved memory applied while no quote result
is published. The failure response explicitly says to check Memory before retrying;
it does not claim that no changes occurred. This is not an all-or-nothing batch
transaction across the memory worker and quotation publication.

The confirmation boundary does not prove that a model extracted the right terms.
A user can still approve an incorrect proposal. Source applicability can remain
unverified, and current tariff authority is not established by these code tests.
Real-model behavior, production configuration, all combinations of four operations,
and every concurrent/disconnect timing are not certified by this audit. No claim
of “all bugs found” or universal unseen-conversation correctness is made.

## Why the earlier bugs were discovered late

The original lookup omission was a final-publication interaction: a successful
arithmetic answer concealed the unavailable-lookup fallback. The historical-money
bug was a migration interaction: the imported line currency could disagree with
its minimum/maximum/rate evidence. Earlier isolated arithmetic/happy-path checks
missed those combinations. Current-runtime mixed-task and historical-import
regressions exposed them; the earlier audit should have exercised these boundaries
sooner. A passing count did not establish replacement-engine parity.

The later authority probes deliberately made the model choose valid but wrong
arguments. That exposed a different weakness: deterministic tools validated and
calculated inputs without establishing their authority. Memory consent was also a
pre-existing prompt-only boundary, not evidence that every defect came from the
engine replacement. This repair changes those trust boundaries in code.

## Preservation and next gate

No canonical tariff/source data or private configuration changed. Provider ledger
remains1,106 rows/553 dispatches; no paid call was made and the prior budget is not
reset. Existing unrelated dirty work and services are preserved. Temporary local
Convex/Next/browser processes and all supervised checks were stopped; process and
listener evidence is retained. Disposable local lab databases are removed after
curated evidence capture.

**Stop here for user review.** No commit or blind evaluation was started. A future
blind run still needs independently authored unseen conversations, source-derived
answers, a frozen deployment/model/settings/source snapshot, a checked cumulative
budget guard, and no fixes during the scored run. Keep these development/adversarial
fixtures out of its held-out set.
