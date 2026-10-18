# Mumbai cluster: official-source completion, 18 October 2026

Scope: Mumbai, Mumbai Cruise Terminal, ICTPL, BPCL Cargo Jetty and BPCL Liquid Cargo Jetty. Research only; no runtime, configuration or test edits; no paid inference and no external messages. Source bytes, retrieval timestamps, SHA256 values, page images, rules and 32 independently calculated examples are in [the evidence manifest](../../docs/portia-reliability/evidence/records/full-scope-20261018/mumbai-sources.json). Dates below are source applicability, not a claim that every service is implemented.

## Decisions that can be implemented now

**Mumbai ordinary services have current public source authority.** The [official homepage](https://www.mumbaiport.gov.in/) and [operational tariff index](https://www.mumbaiport.gov.in/show_content.php?lang=1&level=0&ls_id=14&lid=14) still identify the May 2026 SOR, updated 9 May, as current. Fresh PDF bytes match the retained SOR and May amendment. Both August “standardized SOR” notices are draft consultations, with comments due 28 August; they do not enact replacement rates. [Marine notice](https://www.mumbaiport.gov.in/WriteReadData/RTF1984/1787043422.pdf), [Traffic notice](https://www.mumbaiport.gov.in/WriteReadData/RTF1984/1786714893.pdf).

Use dated published ceiling components, correct vessel class, movement and event predicates. The [SOR](https://www.mumbaiport.gov.in/WriteReadData/RTF1984/1778833452.pdf) supplies:

| Branch | PDF pages / clauses | Implementation facts |
|---|---|---|
| Cargo pilotage/towage | 9-10, 2.1(A) and notes; 12-13, general notes | Minimum 1,000 GRT; progressive tables; half per inward/outward leg using that leg's status; routine tugs included in relevant berth branches. |
| Ordinary port dues | 20-21, 2.16 | Whole tonnage at selected bracket rate, per entry; segregated-ballast certificate reduction is specific to port dues. |
| Anchorage | 18-19, 2.15 | Point-specific, hourly or part thereof; cumulative stay excludes time away at berth/dry dock; named exemptions and separate barge rules. |
| Berth hire | 21-24, 2.17 and May amendment | Named berths, minimum tonnage, readiness cutoff, port delays, priority and special classes. Reuse existing valid evidence for unchanged branches. |
| Settlement | 5-7, 1.2 | Published ceilings; specified FX date/rate; tax separate; bill-level rupee ceiling. Do not round each component into an invoice. |

The machine packet contains complete pilotage tier numbers and ordinary port-dues boundary arithmetic. For example, ordinary foreign cargo, 10,000 certified GRT, Docks, one inward plus one outward: USD 6,322 pilotage/towage and USD 3,850 ordinary port-dues component. These exclude tax, FX settlement and special events. They are not a universal full-call invoice. Full cargo/storage/ancillary branch enumeration remains implementation work, not a request for user expertise.

## Cruise: dated scheme and charge inclusion

The [27 May 2026 circular](https://www.mumbaiport.gov.in/WriteReadData/RTF1984/1779878454.pdf), PDF 1-2, extends the special scheme from 1 April 2026 through 31 March 2027. First 12 hours: USD 0.085/GRT plus USD 6/passenger; beyond 12 hours: USD 0.0175/GRT/hour. Current call bands are 0% through 10, 10% for 11-35, 15% for 36-70, 20% above 70.

The earlier [9 December 2020 base circular](https://www.mumbaiport.gov.in/WriteReadData/RTF1984/1707284191.pdf), PDF 1, expressly excludes additional berth hire, port dues, pilotage and passenger fees for the first 12 hours. The [October 2022 notice](https://www.mumbaiport.gov.in/WriteReadData/RTF1984/1707284696.pdf) changes head tax from USD 5 to USD 6; [2023](https://www.mumbaiport.gov.in/WriteReadData/RTF1984/1707284711.pdf) extends; [2024](https://www.mumbaiport.gov.in/WriteReadData/RTF1984/1754457149.pdf) specifies the current excess rate and bands; [2025](https://www.mumbaiport.gov.in/WriteReadData/RTF1984/1762231645.pdf) and 2026 extend the ongoing scheme.

The intervening [July 2021 extension](https://www.mumbaiport.gov.in/WriteReadData/RTF1984/1707284204.pdf) and [September 2022 extension](https://www.mumbaiport.gov.in/WriteReadData/RTF1984/1707284227.pdf) were also retrieved and viewed. Both repeat the first-12-hour inclusion sentence; the former extends to 13 August 2022, the latter to 30 September 2022. Thus the continuation chain is documented rather than inferred across a missing year.

**Executive interpretation:** retain first-12-hour inclusion under the continued special scheme. Do not add ordinary marine/passenger fees or apply the general cruise/coastal percentage again. This is an explicit continuation inference from the source chain; the 2026 page alone does not repeat the inclusion sentence.

A 10,000-GRT vessel with 100 passengers, no rebate, has a published component of USD 1,450 at 12 hours and USD 2,500 at 18 exact hours. Annual rebate counting entity, year, base and retrospective treatment are not defined in the inspected current chain. The [2019 domestic scheme](https://www.mumbaiport.gov.in/WriteReadData/RTF1984/1707284372.pdf) used October-September, but had a different USD 0.35/100-call regime; do not silently import its rules. Excess part-hour treatment and private additions also remain outside the proven component.

The [29 September 2026 priority SOP](https://www.mumbaiport.gov.in/WriteReadData/RTF1984/1790742492.pdf), PDF 1-3, preserves the waiver of priority/ousting/shifting for cruise berthing when at least 30 days' advance intimation is given. Subsequent ship-convenience shifts remain chargeable. Without timely notice, the specified senior-vessel/ousting circumstances matter. These are operational facts Portia should ask only when relevant, not missing tariff interpretation.

## ICTPL: operating changes established, current berth multiplier unresolved

The [23 December 2025 circular](https://www.mumbaiport.gov.in/WriteReadData/RTF1984/1766570808.pdf) confirms resumed non-RoRo operations, extends the berth-allocation SOP until further advice and assigns wharfage collection to MbPA. The [26 December correction](https://www.mumbaiport.gov.in/WriteReadData/RTF1984/1766751047.pdf) sets the RoRo wharfage change to 15 January 2026. Do not charge both MbPA and ICTPL wharfage for the same service.

The [attached SOP](https://www.mumbaiport.gov.in/WriteReadData/RTF1984/1767279378.pdf), PDF 1-4, has berth-allocation and approved cargo constraints. Resumption does not mean every cargo category is accepted at OCT.

The [official regulator archive](https://www.abmp.gov.in/tarifforders/details/port-wise/6?folder=20&view_all=1) presently tops out at the [2020 extension](https://www.abmp.gov.in/uploads/tariff_orders_master/order_6a451062b5a99.pdf). Its PDF 3, section 6.1, ends the extension on 31 March 2021 or earlier specified event; section 7 connects the then-current MbPT tariff. The [2018 order](https://www.abmp.gov.in/uploads/tariff_orders_master/order_6a451062d2ea0.pdf), PDF 35, defines hourly berth hire at 1.3 times MbPT berth hire, but PDF 28 section 16.2 expressly lapses approval unless extended. Current operating circulars do not establish the replacement berth-rate authority or resolve which current base-row applies.

Thus the 130% history is real; a blanket current 130%-of-every-Mumbai-charge implementation is unsupported. Accounts can corroborate practice during their reporting period but cannot silently settle later contract amendments.

Deeper search located [FY 2024-25 official accounts](https://mumbaiport.gov.in/WriteReadData/RTF1984/1768915939.pdf): PDF 39 / printed 33, Hindi Notes to Accounts item 2, confirms 130% berth hire and 100% wharfage practice during that year. This narrows the historical evidence gap but does not resolve a later operating agreement or select a current berth base-row. This is stronger evidence than the prior FY 2023-24 account, without being a current tariff order.

## BPCL: current rates exist, conditions require a stronger chain

The [official JNPA facility page](https://www.jnport.gov.in/page/liquid-terminal/WnNzalhmU0NET0xXZ3FIaDREbmpOQT09) identifies BPCL-IOCL liquid berths LB01/LB02. Preserve the legacy generic `bpcl-cargo-jetty` identifier. Explicit JNPA BPCL liquid/LB01/LB02 requests can select the verified facility; an unqualified label cannot establish a second physical terminal or justify merging stored history.

The [2026 indexed rate sheet](https://www.jnport.gov.in/uploads/content_manager/Rates_fo_the_period_26-27.pdf) is genuine current publication from 1 May 2026. The cover specifies 0.39% indexation. Its seven rate pages omit units/general conditions; the foreign-water label explicitly uses USD. Do not mistake every foreign column for dollars.

The [2021 approval](https://www.abmp.gov.in/uploads/tariff_orders_master/order_6a45102f0f8dc.pdf) Annex IV, PDF 21-25, supplies definitions, units, rounding, coastal classification and delay treatment. Examples: water per MT; compressor per hour; hard/foam pigging and vaporizer per operation; nitrogen per MT; loading arm/pipeline/wharf management per MT. However, PDF 16 section 14.2 gives a three-year term with explicit lapse unless extended. The [BPCL regulator archive](https://www.abmp.gov.in/tarifforders/details/port-wise/4?folder=6&view_all=1) lists no later substantive order. A Hindi typographical corrigendum is separately indexed under 2021; it is not an extension.

The defensible gap is continuation/replacement of **conditions**, not absence of 2026 numbers. Do not manufacture rate units, contract minima or generic taxes to convert an incomplete sheet into a full quotation.

The national document named [Migration of Tariff Guidelines 2025](https://shipmin.gov.in/sites/default/files/Migration%20of%20Tariff%20Guidelines%202025_0.pdf) was checked, including its cover. It is expressly a consultation draft, requesting comments by 12 March 2025. Its draft provisions cannot establish that BPCL or ICTPL migrated or that an expired approval automatically continued. The bounded government/regulator search did not retrieve a later adoption instrument for either operator.

The [Cochin 2024 cruise notice](https://www.cochinport.gov.in/sites/default/files/inline-files/Trade%20Notice%2005_2024Cruise.pdf) cites the same national scheme but adds Cochin-specific security charges. It is retained solely to demonstrate that local ancillaries cannot be exported between ports. Chennai's indexed 2025 SOR text independently corroborated the no-other-standard-charge scheme, but direct-byte retrieval failed certificate validation; it is supplementary, not the Mumbai authority chain.

## What requires external evidence, not user tariff expertise

### BPCL reassessment addendum: ordinary component pricing can proceed

This addendum supersedes the earlier blanket block on all BPCL arithmetic. The [current JNPA terminal-tariff index](https://www.jnport.gov.in/page/terminal-sor/RHBVd096Y3Y3MXVISlRWU24ySE53Zz09), showing a 16 October 2026 update, positively links BPCL's signed 2026 sheet. Its cover publishes revised indexed rates effective 1 May 2026 onwards. A separate renewal of the 2021 approval is not necessary merely to recognize this later operator publication as current rate authority. No calendar end date is inferred from the filename.

**Executive decision:** permit normal published-component estimates using the current rate and the exact corresponding unit/currency in 2021 Annex IV. The document describes rate indexation, so unchanged unit/currency treatment is a supported continuity interpretation. It does **not** expressly name or reattach Annex IV; do not falsely describe that linkage as literal 2026 text, or treat it as renewal of every old penalty, contract or settlement provision. This distinction is sufficient for ordinary component estimates without asking the user to interpret tariffs.

The new machine addendum contains 46 cargo labels, 13 ancillary service mappings and 27 additional independent cases. Existing 32 examples remain unchanged. For example, 1,000 MT coastal LPG wharfage is INR 227,020; 1,000 MT coastal edible oil wharfage is INR 66,730; 100 MT foreign fresh water is USD 771. These are pre-tax components under the documented unit-continuity interpretation. They are not full invoices or a general statement that all foreign rates are dollars.

Original table images reveal precise exceptions:

| Issue | Decision |
|---|---|
| CBFS coastal export, material 4195 | Its rate cell is genuinely blank. Do not copy the adjacent row or treat it as zero. |
| AFS and ATF share material codes 4126-4129 | Match cargo label and traffic direction as well as code. |
| “Other A/B/C chemicals” | Require the applicable classification/MPCB-list predicate; not a fallback for any unidentified liquid. |
| Fractional measures, part-hours, overstay/fault, complete settlement | Need their own condition handling; initial new arithmetic examples use whole tariff units and normal services. |
| Coastal rates already printed | Use them directly; do not apply another 60% reduction or another 0.39% indexation. |

The current [ICTPL facility page](https://www.mumbaiport.gov.in/show_content.php?lang=1&level=2&ls_id=1095&lid=146) and [full approved OCT SOP](https://www.mumbaiport.gov.in/showfile.php?lang=1&level=1&lid=950&ls_id=1114), PDF 2-3 sections 5.2-5.3, further corroborate continued alternative operations and 130% berth-hire practice. The SOP's complete mixed HTTP response and exact extracted PDF slice are retained with hashes. A physical approach trestle from Indira Dock does not itself select a tariff base-row. No unambiguous current cargo berth base-row linkage was found, so automatic current ICTPL monetary mapping remains unsupported. This is a specific row-selection gap, not a demand for proof that no amendments exist.

No document or interpretation is requested from the user now. Continue government/regulator/operator-source research first. If still unavailable, precise unsent questions are recorded in the machine packet for official owners:

- MbPA Traffic Manager, `tmoffice@mumbaiport.gov.in`, +91-22-66564429, printed in the current cruise/OCT circulars: current ICTPL berth instrument/base-row; cruise rebate counting/base and residual private service charges.
- BPCL Liquid Cargo Jetty operations, +91-22-27240835 / 27240366 / 27240367, printed in the 2026 cover: current complete conditions or continuation instrument, units and billing rules; any genuinely separate facility behind the generic cargo label.

These are drafts only. No email, form submission or call was made. Missing factual call details (vessel certificate, service status, berth, passenger count, movement/timing/priority events) should be handled conversationally when needed. They are different from unresolved tariff authority.

## Verification boundary

Downloaded PDF originals are retained unmodified, hashes recorded, and material tables/circulars viewed as images. Old successful application tests were not rerun. The numeric examples were generated independently from inspected source tables before candidate outputs, using decimal arithmetic. No service, server, kernel or background worker was started; short download/extraction processes exited normally. Shared listeners were preserved.
