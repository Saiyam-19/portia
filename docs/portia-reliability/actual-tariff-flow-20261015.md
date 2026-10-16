# Actual Mumbai tariff estimate passed locally

The unchanged, independently authored `MUMBAI-DEMO-001` request completed through browser→Next→local Convex, using two genuine free-model dispatches. The answer was displayed, streamed cleanly, saved and identical after reload. Run:15Oct2026,04:23:01–04:23:09IST. No deployment.

| Component | Actual persisted response |
|---|---:|
| Berth hire:10,000GT × INR0.2165/GRT/hour-or-part ×20hours | INR43,300.00 |
| CGST9% | INR3,897.00 |
| SGST9% | INR3,897.00 |
| Total GST, included once | INR7,794.00 |
| Upward whole-rupee bill adjustment | INR0.00 |
| **Complete requested berth-hire estimate** | **INR51,094.00** |

Actual occupation19h40 becomes20commenced hours. Readiness03:30+4hours is later than departure03:40, so actual departure governs. The1,000GRT and INR100 minima are inactive. Other port-call services are explicitly excluded. Vessel, eligibility and transaction facts remain user-stipulated; no claim of independent operational verification.

[Actual saved response](../../output/actual-tariff-20261015/actual-response.txt) · [Displayed screenshot](../../output/actual-tariff-20261015/live-display.png) · [Reload screenshot](../../output/actual-tariff-20261015/live-reload.png) · [Full input/stream/messages/reload evidence](../../output/actual-tariff-20261015/live-journey.json).

## Sources and independent approval

- [Mumbai May2026 SOR](https://www.mumbaiport.gov.in/WriteReadData/RTF1984/1778833452.pdf): physicalp4§1.2 coastal classification; p6minimum bill, upward grand-total rounding, INR and tax exclusion; p22§2.17row1/notes; p23ordinary operational adjustments.
- [9May2026 amendment](https://www.mumbaiport.gov.in/WriteReadData/RTF1984/1778833405.pdf), p2: ordinary coastal INR0.2165. The underlying2028SOR end date does not freeze the indexed rate.
- [MbPA GST classification](https://mumbaiport.gov.in/WriteReadData/RTF1984/1688467921.pdf), p38: berth-hire SAC996752. Corroborated by current [CBIC heading9967, serial11](https://cbic-gst.gov.in/hindi/gst-goods-services-rates.html) and [intra-state FAQ85](https://cbic-gst.gov.in/faq.html).

All19 frozen source/input/oracle entries were hash-verified and copied separately. Input fileSHA:`aec51984f9a8cf3d683b32b18803144cd931a91277b501bc4e62c352599ea508`; freeze-manifestSHA:`0e0a145d1e94852d47cd6579b81855f9e493611786ed15aac79c50a51de32413`. The frozen oracle's pre-review status was preserved; the separate [second-review approval](../../output/actual-tariff-20261015/independent/second-review-approval-v1.json) approves this exact scope. Relevant PDF pages were visually inspected; CBIC pages were checked directly. The direct Mumbai PDF web fetch timed out, so its verified approved snapshot was used.

## Implementation and evidence

Five official source snapshots plus reviewed rule data were added under `data/ports/mumbai/approved-2026-05-09`; the original17assets remain byte-identical. The rule version applies from9May2026 and is verified through15Oct2026. Runtime source hashes, rule hash, target port/berth, current GT, coastal eligibility, event roles, operating exclusions and domestic tax facts bind the ledger to the current run/context.

The real main model called existing `consult_port_agent`; the real specialist called `calculate_approved_berth_hire` using approved rule/request receipts. It received the published rule/source metadata and bound user facts, never an oracle answer. Application code generated decimal expressions, validated the resulting ledger and rendered cited financial rows. Neither consultation prose nor successful free-form arithmetic can certify this path. The existing atomic run completion persists the verified answer before monetary publication; the public tool stream hides internal ledger/unbound draft values.

No case ID, input hash, vessel name or expected final amount appears in production rule/execution files. Positive checks alter GT, duration, assessed-tonnage floor, previous/next voyage ports and vessel name; removing NT/LOA/draft does not cause intake. Negatives cover wrong target/category/licence/date/tax/source/revision, extra governing clauses, altered ledgers and failed persistence. Unchanged D01/D11/scenario19 assertions remain passing.

Offline evidence:75 related checks across9files passed, then24 final official-path checks including two additional independence/irrelevant-particulars cases passed. These overlap; they are not99distinct tests. Final Webpack build including TypeScript and changed-file lint passed. The stale graph was used for discovery only, followed by exact source reads.

Genuine evidence:2of8allowed dispatches, both HTTP200; pinned `nvidia/nemotron-3-super-120b-a12b:free`, zero prompt/completion/request ceilings, retries0, fallbackfalse. Same dedicated credential; no key cycling or standalone quota probe. Browser child received no inference credential. [Provider events](../../output/actual-tariff-20261015/provider-events.jsonl) · [Verification manifest](../../output/actual-tariff-20261015/verification.json) · [Scoped entry-relative patch](../../output/actual-tariff-20261015/revision.patch) · [File hashes](../../output/actual-tariff-20261015/changed-files.json).

## Remaining limits and ownership

This certifies the demonstrated supported ordinary coastal Indira Dock scope, not all tariff categories, phrasings or ports. An earlier readiness cutoff requires additional waiting-exclusion facts; fractional-paise tax-rounding precedence remains unadjudicated. Later call dates require refreshed source approval. Broader original B/C/D, source/oracle and all-feature release gates remain open. The original19/development24/holdout12 inputs remain untouched; holdout unread.

Owned local backend/app/browser and check process groups stopped and verified; all15 prior listener endpoints remain. No existing service reused or stopped. Private local DB evidence retained under ignored `.local`. No commit, push or deployment. Write ownership released for bounded review.
