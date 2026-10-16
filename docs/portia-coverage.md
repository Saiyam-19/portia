# Portia coverage checkpoint — stages 0–2

**Inventory prepared; implementation and acceptance remain open.** Every current port identifier, historical source file and source section is represented. Current tariff correctness is not inferred from asset integrity.

- [Machine source/port registry](portia-source-registry.json): 16 identifiers, 17 files, 367 sections, 2,068 candidate evidence fragments; one empty file. Fragment count is not a count of distinct rules or passed tests.
- [Scope and capability register](portia-reliability/invariants-and-capabilities.md): 24 protected invariants; 27 product capability groups, expanded across port entries.
- [Official source review](portia-reliability/official-source-review.md): all-port candidates, dates, identity conflicts and unresolved dependencies.
- [B/C/D/E contracts](portia-reliability/contracts.md): concrete schema/validation/state interfaces and adversarial dispositions.
- [Independent reference obligations](portia-reliability/reference-obligations.json): immutable development-case mapping and source/operational oracle needs.

## Coverage semantics

`preserved` means the identifier/feature remains in scope. `bundled-reference` means local source bytes exist. `officialVersionVerified` requires original authoritative document reconciliation. `rule-approved` requires applicability/unit/rounding interpretation. `independent-oracle-frozen` requires independent expected results. `accepted` requires the corresponding candidate journey and evidence boundary. None of these statuses imply the next one.

Every source section has start/end lines and a stable ID. Numeric table rows and normative text get candidate IDs/hash references. Definitions, notes and nonnumeric sections remain represented even when the line scanner does not classify them as candidates. The scanner is a traceability aid: semantic branch enumeration must inspect each section, resolve OCR/merged columns and map conditions/exceptions into rules. No candidate is executable yet.

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
