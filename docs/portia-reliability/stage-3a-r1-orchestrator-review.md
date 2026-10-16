# Stage 3A R1 orchestrator review

2026-10-14T19:48:37.582496+00:00. **Changes required: four new neighboring regressions.**

Pinned repair manifest SHA256 `e5c6eba88ad46f5a7e76c8bac282898d3809c7c0a8592041906c2024b988be67`; all51 current file hashes match, authorized evidence rename verified. No unrelated baseline behavior or frozen inputs changed.

## Standards

Independent Standards pass: **0 actionable findings**. Both prior duplicated-classification concerns are addressed. Ordinary full lint passes with six prior warnings and no exclusion; CommonJS proof was repackaged byte-identically as a text artifact.

## Spec

Original B1–B6 fixes pass the unchanged probes. Independent Spec review found the following R1 regressions; parent reproduced the same22 adjacent probe outputs on Node22 with zero inference.

### R1-1 P1: Incomplete numeric tokens are accepted
`src/lib/migration/request-semantics.ts:96`. Observed: GT 12.3.4 establishes12.3.
Required: Consume/validate the complete numeric token before establishing a fact; retain malformed data as unresolved.

### R1-2 P1: Resolved corrections retain stale blocking issues
`src/lib/migration/call-context.ts:119`. Observed: GT9000 → reject9000 → CorrectionGT9500 still has FACT_RETRACTED and forced clarification; LOA150cubits →150metres retains the old unit error.
Required: Reconcile active issues against current unresolved facts/revisions. Preserve old issues as history, not active blockers; do not clear unrelated unresolved fields.

### R1-3 P2: Token boundaries reject ordinary prose/adjacent fields
`src/lib/migration/request-semantics.ts:100`. Observed: GT9000 carrying coal treats carrying as a unit; GT9000 NT5000 binds NT to9000 rather than5000; punctuation changes the result.
Required: Distinguish complete quantities, explicit units, next field labels and following prose. Preserve true incompatible/unsupported units. Avoid expanding a generic word blacklist as the parsing strategy.

### R1-4 P2: Negating an update retracts its value
`src/lib/migration/request-semantics.ts:21`. Observed: Keep current values; do not change GT9000 retracts9000.
Required: Separate preserve-current, reject-value and replace-value operations before reduction; negation of change is not rejection of the fact.

## Next repair gate

Implement one coherent quantity/assertion/issue lifecycle rather than per-prompt patches: complete token boundaries; field/value/unit association; separate preserve/reject/replace intent; active issue reconciliation scoped to current facts. Demonstrate red tests before repair and positive neighbors afterward. Preserve unknown-unit checks, negative GT rejection, exact feet/day conversions, new-leg isolation, corrected forms and valid partial work. Test correction recovery in actual generate/stream paths, not only internal arrays.

The known historical-GT/reference-coreference problem predates these changes. It remains an overall B requirement before financial facts can be trusted; address it within the same operation/source-role design if feasible and keep its status explicit. Do not hide it in a passed aggregate. Later C/D/CE01/02/originalCE04 work remains separate.

Run focused plus full offline checks, typecheck, ordinary lint and affected build; no providers, deployments, frozen-input edits or new dependencies without a demonstrated need. Preserve source/data scope and previous checks. Return exact hashes/diffs and release ownership again.

Evidence: `output/reliability-stage3a-r1-review-20261015/`. The probe is retained as `.cjs.txt` to keep documentary proof out of application lint; copy it to an owned temporary `.cjs` when reproducing. No source bytes were altered.

Standards:0 findings. Spec:4 findings (2P1,2P2); highest impact is false established numbers and blocked successful corrections. No end-to-end approval.
