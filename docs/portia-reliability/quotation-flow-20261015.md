# Local quotation flow: D01 passed

Unchanged independent D01 completed through the actual browser, Next route, local Convex backend, streamed answer, durable messages and browser reload. Genuine run: 2026-10-14 22:00:05–22:00:11 UTC. Local only; no deployment.

| Charge | Verified result |
|---|---:|
| Berth hire: 2 started 24-hour blocks × max(12,500 × USD 0.075, USD 900) | USD 1,875.00 |
| Pilotage: 2 movements × USD 1,200 | USD 2,400.00 |
| Total | **USD 4,275.00** |

[Displayed answer](../../output/quotation-flow-20261015/live-display.png) · [After reload](../../output/quotation-flow-20261015/live-reload.png) · [Input, stream and persisted messages](../../output/quotation-flow-20261015/live-journey.json) · [Verification manifest](../../output/quotation-flow-20261015/verification.json)

## Implemented slice

- Compile supported, self-contained supplied quotations into typed facts with exact source spans, units, billing periods, minima/caps and scenarios. Unsupported scopes retain the existing agent path.
- Bind the plan to source hash, conversation, run, fence and context revision. The model dispatches a receipt; it cannot supply monetary expressions or final amounts on this path.
- Calculate a typed ledger with the existing decimal batch calculator. Recompute and compare it before publication. Altered amounts, formulas, source bindings or revision bindings are rejected.
- Commit the ledger's closed tool history and deterministic answer through the existing atomic owner/run/fence/lease/memory-epoch checks before publishing monetary text. Redact the internal ledger from the public tool event.
- Render a compact amount table and separate calculation details. Preserve the quoted USD 0.075 precision. Skip post-completion memory reads on the synthetic final rendering step.

This closes the ledger-to-answer and commit-before-display gaps **for this supplied-quotation path only**. It does not certify official Mumbai tariffs or all quotation wording.

## Evidence boundaries

The genuine journey used exactly one OpenRouter request to `nvidia/nemotron-3-super-120b-a12b:free`, HTTP 200, with zero prompt/completion/request price caps, no fallback and no inference retry. The provider selected the bound calculation tool; application code calculated and rendered the monetary answer. The synthetic-local retention exception was enabled only in the isolated local environment. The user-supplied credential stayed server-side and is absent from evidence files.

The saved user question equals frozen D01. The backend ended idle at revision 2. The response stream contains USD 4,275.00 with no error/abort event. Display and reload contain USD 1,875.00, USD 2,400.00 and USD 4,275.00. Screenshots were visually inspected.

Before that genuine request, synthetic provider/browser checks exercised the same application and backend. The synthetic provider only dispatched the current receipt; it had no fixture-specific rates, formulas or answers. Early attempts exposed an evidence-reader page limit, instruction-content formatting in the synthetic dispatcher, a post-commit memory read and an overwide answer table. These were corrected before the final synthetic and genuine passes; intermediate evidence is retained.

Focused verification: 52 tests across 7 files passed, including D01, D11's per-call minimum/cap, original scenario 19's distinct rounded-hour cases, altered ledgers, delayed/rejected persistence and existing agent/model/state behavior. Final Webpack production build passed, including TypeScript. Changed-file lint passed without warnings. This is focused verification, not a fresh full-suite or full-product acceptance claim.

[Provider events](../../output/quotation-flow-20261015/provider-events.jsonl) · [Focused checks](../../output/quotation-flow-20261015/quote-regression.log) · [Build](../../output/quotation-flow-20261015/build.log) · [Entry-relative patch](../../output/quotation-flow-20261015/revision.patch) · [Changed-file hashes](../../output/quotation-flow-20261015/changed-files.json)

## Preserved and remaining

All 17 source assets across 16 port slugs and the three frozen input/evaluation files retain their entry hashes. Holdout cases remain unread. Model aliases and production privacy settings remain unchanged. No paid inference, production mutation, commit or push.

Broader work remains: old-reference comma variants, quoted hypothetical examples, other quotation forms, general C/D bindings, official-source/oracle adjudication and full release acceptance. D11 and scenario 19 have local agent evidence only; the sole genuine browser run was D01.

Both isolated backend/app lifecycles and owned verification process groups were stopped and checked. All 15 prior listener endpoints remain. No existing server was reused or terminated. Local database evidence remains under ignored `.local`; this local build must not be promoted as a production-configured artifact.

Write ownership released after this packet. No additional review/parser wave started.
