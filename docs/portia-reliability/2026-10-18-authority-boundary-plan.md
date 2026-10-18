# Exact-operation authority plan

User-approved policy: confirm each new or changed supplied quote and cross-chat
memory operation. Comparisons must also confirm supplied FX/rounding. Official
source calculations and automatic chat-only working notes remain distinct.

No commit, deployment, paid-model test or blind evaluation in this task.

## Contract

1. Model outputs are proposals only. Code constructs a complete plaintext review
   from the actual normalized payload, including before/after state and removals.
   Reject oversized reviews; never truncate operative terms.
2. Persist a private versioned operation packet alongside a server-generated form.
   Bind owner, conversation, revision, expiry, prior quote hashes/revisions and
   memory epoch/revision. Generic model forms/prose/tool receipts grant nothing.
3. Approval is an authenticated form state transition. Cancel/reject, any correction
   note, expiry, stale root/revision, cross-owner/chat and replay mismatches deny.
4. Execute the stored packet deterministically, without another model choosing the
   payload. Memory queue admission is atomic with approval; direct agent enqueue
   cannot impersonate the explicit memory-panel path.
5. Record confirmed quote digests in conversation state. Old unapproved receipts
   are preserved but cannot authorize current supplied pricing/ranking. A read of
   unchanged confirmed terms needs no new approval.
6. Preserve existing run fencing, deletion barriers, publication-after-persistence,
   source currentness limitations and immutable historical uncertainty.

## Work and acceptance gates

- Pure shared packet parsing, canonicalization and complete review; tests for
  exactness, removals, bounded size and unsupported versions.
- Runtime proposal-only tools and deterministic executor; no model-visible grant.
- Convex private form/run binding, approvals and memory admission; real convex-test
  mutations for duplicate/stale/cancel/deletion/cross-owner/epoch races.
- Current route and existing form UI integration; persisted previews and exact
  execution without model reinterpretation.
- Adversarial matrix: forged evidence, forged approvals, wrong source class,
  altered money/units/FX, old receipts, corrections, negative consent, cross-chat
  contamination, replay, partial failure and legitimate positive controls.
- Independent specification and security reviews, whole current regression suite,
  explicit adversarial gate, typecheck/lint/build, packaging/source/hash audit.

Report tested surfaces and untested limits. Do not infer thoroughness from a test
count or claim absence of every possible bug. Preserve required tariff evidence,
private credentials, unrelated changes and the cumulative provider ledger.
