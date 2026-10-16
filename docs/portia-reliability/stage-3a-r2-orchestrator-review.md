# Stage 3A R2 orchestrator review

2026-10-14T20:39:39.979869+00:00. **Changes required: three bounded findings.**

Pinned manifest SHA256 `b2dec40b2f3cfb0f88fbecc79034036532fdb709d37802cae69fbbf192b81d81`; all48 current hashes verified. Original B1–B6, the prior four regressions and exact historical-GT case now pass checked probes. The broader B language/source-role contract remains incomplete.

## Standards

Independent review: **0 actionable findings**. Shared classifiers/reducer remain coherent, prior tests and frozen inputs/assets unchanged; ordinary lint recorded zero errors and six existing warnings.

## Spec

Parent reproduced the same20 new probe outputs as the independent Spec reviewer.

### R2-1 P1: Negated preservation keeps rejected values
`src/lib/migration/request-semantics.ts:20`. Observed: AfterGT9000, No longer useGT9000 leaves it established; Do not keep/retainGT9000 preserves it.
Required: Classify the whole operation and its polarity before reduction. Cover use/keep/retain/change/replace with affirmative and negated forms; preserve and reject are distinct.

### R2-2 P1: Scalar expression fragments are promoted to quantities
`src/lib/migration/request-semantics.ts:126`. Observed: GT12/34 andGT12*34 establish12;12/34GT establishes34. GT9000 / NT5000 also loses NT.
Required: Consume or reject a complete scalar expression in prefix/postfix positions while distinguishing separators between labelled fields. Never establish an operand fragment as the quantity.

### R2-3 P2: Accepted Unicode signs can throw
`src/lib/migration/request-semantics.ts:178`. Observed: GT −2e−3 throws DecimalError while ASCII GT -2e-3 returns scoped INVALID_QUANTITY.
Required: Normalize every sign accepted by the lexer and catch conversion failures as scoped validation errors. Accepted tokens must never crash the request.

## R3 repair gate

Use systematic token/operation tests, not one-word exemptions: prefix and postfix scalar expressions, ordinary slash-separated field declarations, all accepted sign positions, and positive/negated preservation versus use/rejection. Scalar parsing must consume the entire candidate or produce scoped unresolved input; normalization must be total over accepted tokens. Do not evaluate user expressions as official vessel particulars or hide a false prefix behind a passing number test.

Preserve all earlier repairs, positive ordinary prose, exact scientific/feet/day conversions and current-issue recovery. Add main-agent generate/stream regressions showing rejection clarification and malformed-number handling do not crash or block unrelated valid tasks. No source/test fixture edits, provider calls, deployments, or broad refusals.

The comma-delimited historical/reference variants remain explicitly unresolved; do not claim B or financial-fact authority complete. Close known semantic/source-role obligations before trusting financial results. Later C/D/CE01/02/originalCE04 remain separate.

Evidence in `output/reliability-stage3a-r2-review-20261015/`; source probe retained as text, executable copies belong in an owned temporary directory.

Standards:0 findings. Spec:3 findings (2P1,1P2), highest impact: retaining rejected facts and establishing expression fragments. No end-to-end approval.
