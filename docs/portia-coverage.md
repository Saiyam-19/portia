# Portia coverage checkpoint — stages 0–2

**Latest integration checkpoint — 18 October 2026:** all 16 identifiers preserved. Thirteen facilities have selected source-backed executable components, including new OCT steel wharfage. Finolex and Redi additionally offer dated references, leaving generic BPCL Cargo Jetty unpriced. JSW operator prices and OCT berth scenarios retain explicit uncertainty. OCT itemized weight assessment, aggregate-only references, and the exact-half ambiguity are handled separately. These are component capabilities, not complete invoices or proof of unseen-conversation reliability. See the [tariff integration report](portia-reliability/2026-10-18-tariff-integration.md). The earlier 12-price/four-gap live-screen evidence and tables below are historical; no new live-model evaluation is claimed.

**Historical inventory plus bounded runtime checkpoint below; full source/current-tariff acceptance remains open.** Every current port identifier, historical source file and source section is represented. Current tariff correctness is not inferred from asset integrity.

- [Machine source/port registry](portia-source-registry.json): 16 identifiers, 17 files, 367 sections, 2,068 candidate evidence fragments; one empty file. Fragment count is not a count of distinct rules or passed tests.
- [Scope and capability register](portia-reliability/invariants-and-capabilities.md): 24 protected invariants; 27 product capability groups, expanded across port entries.
- [Official source review](portia-reliability/official-source-review.md): all-port candidates, dates, identity conflicts and unresolved dependencies.
- [B/C/D/E contracts](portia-reliability/contracts.md): concrete schema/validation/state interfaces and adversarial dispositions.
- [Independent reference obligations](portia-reliability/reference-obligations.json): immutable development-case mapping and source/operational oracle needs.

## Coverage semantics

`preserved` means the identifier/feature remains in scope. `bundled-reference` means local source bytes exist. `officialVersionVerified` requires original authoritative document reconciliation. `rule-approved` requires applicability/unit/rounding interpretation. `independent-oracle-frozen` requires independent expected results. `accepted` requires the corresponding candidate journey and evidence boundary. None of these statuses imply the next one.

Every source section has start/end lines and a stable ID. Numeric table rows and normative text get candidate IDs/hash references. Definitions, notes and nonnumeric sections remain represented even when the line scanner does not classify them as candidates. The scanner is a traceability aid: semantic branch enumeration must inspect each section, resolve OCR/merged columns and map conditions/exceptions into rules. At the original inventory checkpoint no candidate was executable; the bounded runtime checkpoint below supersedes that execution status only.

Every port requires successful in-scope price, source-backed rule explanation, necessary clarification, date-boundary and positive-alias evidence once source truth is available. The initial independent development pack spans the catalog, but does not provide all three journeys for each entry or every rule boundary. The obligation ledger keeps those additional cells open; catalog coverage is not quotation coverage.

## Rule-branch obligations

For each approved source rule, freeze independent expected below/at/above boundary cases for every applicable branch: flat/linear rate, bracket-selected versus progressive slabs, minimum/maximum, included period/excess, time blocks/part period, calendar-day definitions/free periods, duration and delay-attribution exemptions, surcharge/rebate order, cargo/container classification, per-activity count, FX date/rate, tax treatment/order, rounding stage, cross-authority dependency and paid-validity reuse. Include a positive neighbor when a guard rejects an invalid case. Property checks need rule-specific assumptions; discounts/slabs can invalidate naive monotonicity.

## Known gaps, without scope reduction

- Empty BPCL cargo evidence; uncertain equivalence with the liquid identifier.
- Several undated/old bundles; available newer primary schedules still need original-table and amendment review.
- BPCL material-code units/merged columns; ICTPL exact base-rule reference; JSW expired sections; GTI MUC extension; KLL future effective date/cap/FX rules.
- BMCT/JNPA identity behind `mumbai-container-terminal`; generic JNPA/Adani/Gateway aliases cannot select a terminal automatically.
- Mumbai latest amendments/cruise circular retrieval; Finolex and Redi current primary tariffs unavailable in bounded search.
- National navigation-dues applicability and duplicate payment across port calls.
- Independent tariff oracles, remaining per-port success journeys, live vessel lookup, production-model execution and deployed acceptance remain open.

Rebuild the registry with Node 22: `node scripts/audit/inventory-reliability.mjs`. The utility checks all manifest hashes and exact annotated identifier parity; it does not change runtime source files or tests.


## Bounded runtime coverage — 17 October 2026

This table describes existing executable code and retained reviewed packets, not a current official tariff approval. Every calculated official component still carries `currentTariffVerified: false`. Dates are packet bounds; an open end does not establish continuing validity. The [source registry](portia-source-registry.json) remains the inventory; [retained rules](../data/reviewed-tariffs/coverage-gaps.json) retain narrower service gaps. No new source research or port coverage was added in this pass.

| Catalog facility | Executable retained-reviewed scope | Packet dates | Other available scope / current-source gap |
|---|---|---|---|
| BPCL Cargo Jetty | Unavailable | No dated source | Empty asset; distinct from liquid jetty |
| BPCL Liquid Cargo Jetty | Unavailable | Historical 2021 + bounded 2026 trail | Explanation only; contractual continuation/minimum unresolved |
| GTI | Ordinary foreign berth; ordinary pilotage/towage | 2026-05-01–2027-04-30 | JNPA governing source + GTI identity note; amendments/invoice/MUC unresolved |
| ICTPL | Unavailable | 2018, extension through 2021-03-31 | Historical hourly multiplier explanation only; current base unresolved |
| JSW Jaigarh | J-1 mechanized-bulk per-call port dues, up to 30-day validity | From 2026-05-01; no universal expiry inferred | Renewal, other services and current applicability unresolved |
| JNPA | Ordinary foreign pilotage/towage, up to 30,000 GT | 2026-05-01–2027-04-30 | Routine tugs included; other requested services need own rules |
| JSW JNPT Liquid Terminal | Ordinary foreign berth, pilotage/towage, tanker cargo port-dues base | JNPA 2026-05-01–2027-04-30; operator 2024 | Newer operator terms/ancillaries unresolved; no complete bill |
| Konkan LNG | Unavailable | 2025-10-01; new notice 2026-11-01 | Dated explanation only; delay/old-footnote reconciliation unresolved |
| Mumbai | Scoped coastal Indira Dock berth/GST/rounding; four named ordinary foreign berths | Coastal bounded 2026-05-09–2026-10-15; foreign from 2026-05-09 | October current authority unverified; conditions/adjustments remain required |
| Mumbai Container Terminal / BMCT | Unavailable | No executable reviewed packet | Exact BMCT identity retained; generic label ambiguous with ICTPL |
| Mumbai Cruise Terminal | Unavailable | 2026-04-01–2027-03-31 | Explanation only; rebate/stacking/private additions unresolved |
| NSFT | Normal 20ft foreign EXIM road/rail bundle | From 2026-05-01 | Matching landside once; berth/invoice/current amendments unresolved |
| NSIGT | Normal 20ft foreign EXIM ship-yard/road/ICD-rail; ordinary foreign berth | 2026-04-01–2027-03-31 | Ceiling components; additivity/current amendments unresolved |
| NSICT | Normal 20ft foreign EXIM ship-yard using port crane | From 2026-05-01 | Landside/storage/special services/MUC excluded, not waived |
| Ranpar / Finolex | Unavailable | Undated facility information | Identity/measurement explanation only; no dated berth schedule |
| Redi | Unavailable | Old/undated retained material | No reviewed executable scope or current primary tariff |

Functional acceptance and current official tariff acceptance are separate milestones. Functional evidence for this repair pass is in [the verification folder](portia-reliability/evidence/records/functional-finish-20261017/); it must pass on one frozen build before claiming the bounded repairs complete. The full trustworthy-tariff goal remains open until authoritative schedules/amendments covering the intended dates, rule interpretation and independent oracles satisfy the source gate.
