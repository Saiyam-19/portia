# Core agent contract repair — 20 October 2026

## Current checkpoint — implementation repaired, readiness unproven

General contracts were repaired in the isolated worktree: explicit create/update/read,
metadata and currency preservation, resource-time billing, percentage dependencies,
typed corrections, exact authority and reload continuity. One ordinary agent remains;
no model upgrade, second planner, framework migration or cloud deployment occurred.

Last independently frozen candidate (V3) scored **1 PASS / 2 FAIL / 3 budget-BLOCKED**.
S01 passed resource counts, actual/minimum duration, corrections, original baseline,
approvals and reload. S02 invented a percentage base while retaining a missing-base
condition, and the app included that unresolved amount in its subtotal. S03 read
quotes then emitted a generic approval form without preparing the comparison.
S04–S06 were blocked when the next dispatch could not reserve its maximum cost.
No failed first attempt was erased or rerun under a passing label.

Two subsequent GENERAL repairs are offline verified, not blind-model verified:

- Unscoped governing uncertainty exposes only raw valid fixed amounts and their
  exact currency sums. Derived rates, percentages, bounds, tax and rounding wait;
  recipes are retained. This deliberately also withholds unrelated derived lines
  within that quotation until uncertainty is scoped or resolved. Typed missing
  fields still block only their dependency branch.
- Clarification forms require current missing inputs established by business tools.
  The agent and route enforce this independently of pending approval. Rejected
  calls keep paired error history; omitted work remains explicitly incomplete.
  This does not prove the model will always prepare an omitted comparison, nor that
  it will always identify uncertainty correctly.

The original model/provider/privacy settings remain unchanged. V3 used36 provider
calls costing USD0.070821870. **Total task spend USD0.364534215**;
**original allowance remaining USD0.247762910**; total ceiling USD0.75.
The remaining allowance is below the immutable USD0.25 dispatch reserve.
All36 receipts, stream charges and key usage agree; unknown charges zero.
Both model execution releases are disabled. No further model calls were made.

V3 frozen source digest
`1e7d0976f59e259279d857f609b846476a5134aa4d6b5bcea1e1128e50bb390b`,
build `gCCAO31Sp0EweM2AtcUno`;323 files. Source archive, first-attempt scores,
receipts and billing remain in the private evidence root shown below.
A real Brave browser login and reload displayed S01's persisted revision1,
CHF298.20 total and CHF67.20 increase from CHF231.00. It made zero model calls.
This verifies persisted rendering/reload, not browser-submitted approval or the
later code changes' model behavior. Separate memory/new-chat smoke was not run.

Remaining production evidence: fresh unseen completion/usefulness on the final
source; deployed authentication, memory/isolation, cancellation and recovery;
current tariff applicability and uncovered invoice/service conditions. Passing
local checks is not a production-readiness claim. Final verification/process
cleanup records are appended below; older checkpoints are historical.

## Outcome

One existing ToolLoopAgent with business tools that preserve user intent and data
across varied wording, corrections and recall. Fix shared contracts; do not add
exceptions for previous test sentences. Production readiness remains an evidence
claim, not an implementation label.

Base: `782f0f2d8d457cadde27562b6afc53c9f3c4bc40`. Work in the attached
`agent-core-contracts` checkout. Preserve unrelated original-checkout changes,
canonical tariff evidence, prior scored inputs/answers/results, model/privacy
configuration, auth/run fencing, history and cancellation behavior.

## Contract requirements

1. Tools distinguish create, update, current-chat read and cross-chat recall.
   Read operations cannot accidentally enter quotation creation or require new
   pricing/consent. Retain compatibility with stored legacy tool messages.
2. Facility identity has a canonical catalog representation and original user
   wording. Prompt/schema/resolver agree. Resolve supported descriptions while
   preserving unknown, conflicting and ambiguous booked facilities; never guess
   a parent tariff from incidental geography.
3. User-supplied reference/location/context survive ingestion, approval, saving,
   correction and read-back. Pricing mode determines calculation authority;
   deleting context is not an authority boundary. Unusable inputs produce explicit
   errors/questions, never silent information loss.
4. Requested charge scope remains owned by the conversation, not mutable model
   attempts. Every requested component has a calculated or explicit unresolved
   disposition. Tool retries cannot erase a genuine outstanding requirement.
   Targeted user corrections preserve unrelated facts and charges.
5. The tariff capability surface agrees with executable rules and required
   particulars. Include the sourced vessel-age pilotage component and explicitly
   handle unimplemented requested services. No prompt-dependent numeric answers.
6. Supplied quote/comparison changes and cross-chat writes still require exact
   authenticated approval. Incomplete executable charge lines do not reach an
   approval as complete terms. Official calculations and unchanged approved reads
   retain their existing non-confirming behavior.

## Work slices

- **Contract review/design:** parent integrates a read-only independent review;
  choose the smallest coherent tool API change, including persistence compatibility.
- **Executable invariants:** public-interface tests vary references, wording,
  ordering, numeric quantities, correction order and ambiguity. Demonstrate the
  contract failures before changing implementation. Prior blind prompts become
  development regressions only.
- **Implementation:** one writer at a time. Consolidate conflicting validation;
  retain core SDK execution, persistence, provenance and approval boundaries.
- **Integration/review:** focused and neighboring tests, full regression/type/build
  checks where affected, independent adversarial review, synthetic full route/UI
  checks. Inspect real outputs and failures instead of counting tests alone.
- **Held-out verification:** a separate author receives the product contract and
  primary sources only. Its new cases/answers are sealed before candidate outputs;
  the implementing parent does not inspect them until the candidate is frozen.
  Preserve the first scored attempts; no fixes during scoring. Any paid checks
  must use the enforced existing budget and freshly reconciled counters, never
  reset the previous ledger or silently increase the cap.

## Acceptance evidence and reporting

Report per workflow: implemented, offline verified, real-model verified, deployed
verified. Unknown tariff authority remains explicit and cannot be fixed by model
confidence. A safe refusal is not a pass for an answerable requested calculation.
Readiness requires positive behavior as well as negative-boundary protection.

Budget from the last reconciled run: USD 0.135910640 cumulative. The previously
authorized additional USD 0.50 window used USD 0.023613515; preserve both histories
and the USD 0.75 total ceiling. No model calls during design/implementation.

No cloud deployment/promotion, model upgrade, new orchestration framework, file
uploads/RAG or automatic learning is part of this repair.

## First candidate checkpoint (20 October, local time)

Candidate frozen before independent prompts were inspected. Source tree digest
`657f426790498d6cdd4ba177f5f1c330b3dd18d5d4c2cbf72600809ca6780fe7`;
build `_CVJnHr8AKti2npGrRrhB`. Offline: 976 tests, 3 adversarial probes,
typecheck/build pass; lint zero errors and six existing warnings. These are not
production acceptance.

Private evidence root:
`/Users/saiyamchaplot/.codex/visualizations/2026/10/19/01a15418-6a4e-7452-b083-d44241f6336e`.
`core-repair-budget/` contains the preserved source manifest, build/check logs,
separate budget ledger, runtime launcher and exact freeze. The earlier budget
ledger remains intact. `core-repair-execution/` contains the independent public
HTTP adapter and first-attempt evidence; `core-repair-holdout/` contains the
unchanged independent packet.

The isolated runtime is owned by controller PID 978 (tool session 82242), app
PID 1424 on 3022, backend PID 1010 on 3220/3221. Runtime data and process registry
are in `.local/run-bQHKg6`. Stop through the controller's `stop` command, verify
owned descendants exited, preserve evidence before a new build. Shared product
services on 3000/3210/3211/5174/5198 and the graph daemon on 9749 remain in use.

The independent evaluator owns execution and exact approval review. Initial
loopback sandbox/origin/revision-number adapter faults are preserved separately;
the first four submitted model requests were recovered without resending them.
Native approval is submitted only when the displayed operation matches the
independent expected terms. Incorrect proposals block dependent events.

Confirmed early failures expose additional general contracts: explicit rate
units are silently coerced to flat amounts; independent service quantities and
minimum billable duration cannot be represented; pending approval prematurely
ends preparation of multiple quotations; declared equivalent comparison scope
is not representable. Preserve the complete first candidate's scores before any
source changes. A read-only supplied-billing audit and ordinary-tool approval
composition review are preparing general repairs, not sentence exceptions.

Do not edit candidate source while this run is active. After the evaluator
finishes: snapshot private tool receipts with `extract-local-evidence.py`,
reconcile provider receipts/counters, disable release, stop owned runtime,
archive first-candidate source/build evidence, then implement the reviewed
billing/operation contracts. Preserve the original USD0.50 window and USD0.75
total ceiling in any subsequent ledger. Remaining allowance must subtract this
first candidate's actual spend. Request a newly sealed independent packet for
the next candidate; never relabel the first run as passing after repairs.


## Second candidate preparation

The first candidate run is finished and archived: 8 pass / 14 fail / 2 ambiguous.
Its runtime was stopped, all requests settled, and release disabled before edits.
Source, build, private receipts and original scores remain in `core-repair-budget`.
Cumulative spend is USD0.211660265; remaining original additional allowance is
USD0.400636860. The USD0.75 ceiling is unchanged.

General billing contracts now preserve explicit units, independent quantities,
minimum durations, zero values, partial facts and typed correction semantics.
The agent prepares independent work before review; native approval groups retain
ordering, exact grants, persistent tool-call/result history and incomplete work
across clarification/reload. Rejected replacement leaves previous staged work
intact. Stale successors do not undo completed operations or mint new grants.

Reporting precision is a read-only view outside financial terms and receipt
hashes. Exact arithmetic, baselines and comparisons remain unchanged. Date-bound
rule explanations check supplied service/berth intervals. Input guidance retains
saved governing conditions and unsupported scope. Repaired calculator attempts
carry explicit error identity; unrelated successes cannot hide failures.

Offline evidence: full suite 1025/1025, plus six added native lifecycle cases
(backend file34/34); three adversarial probes; typecheck pass; lint0 errors/six
existing warnings. Independent parent-slice review17/17; no confirmed remaining
P1 in the bounded review. These remain offline checks, not production acceptance.
Fresh V2 holdout12 cases/31 turns remains sealed. V2 guard11/11 and provider
receipt/key reconciliation pass. `core-repair-budget-v2/active-config.json` is
held; local build and runtime setup cannot dispatch inference. No cloud deploy.

## Final local verification and cleanup

Final suite1070/1070 and3/3 adversarial probes passed; typecheck and production
build passed; lint0 errors/six existing warnings. The final bounded review found
no further defect in the uncertainty/form changes. These counts do not replace
the preserved V3 blind failures. No final-source provider calls occurred.

All owned local app/backend/build/controller process groups are stopped and
verified absent. Shared services on3000/3210/3211/5174/5198 and graph9749 remain.
The native temporary browser tab is closed. No cloud deployment or push occurred.
