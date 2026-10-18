# JNPA and five container terminals: official-source completion

Research date: 18 October 2026, India. Scope: JNPA, GTI, NSFT, NSIGT, NSICT and PSA BMCT (the retained `mumbai-container-terminal` identifier). No paid inference, external messages, runtime edits or application processes. This is a source and independent-arithmetic handoff, not a claim that every source branch is already implemented or accepted.

## Material decisions

1. **BMCT's current source-version conflict is resolved for calls from 6 April 2026.** The [PSA operator page](https://india.globalpsa.com/psa-mumbai/) explicitly labels its April-folder link effective 6 April; the [JNPA terminal index](https://www.jnport.gov.in/page/terminal-sor/RHBVd096Y3Y3MXVISlRWU24ySE53Zz09) links a document named 6 April. Those PDFs are byte-identical. The earlier March-folder PDF has different rates. Do not treat the filename in PSA's April folder, which still says `01-Apr`, as governing over the operator's link label and the authority's matching copy.
2. **The MUC extension has been found, including the original Ministry order and annex on a government website.** The stale October 2024 expiry in GTI's 2026 schedule is superseded by the dated general Major Port/BOT instruction. Published charges are INR 145 MUC plus INR 25 Maritime Sector Development Fund per eligible container, excluding GST, through 30 September 2027. INR 145 is a ceiling; an NLDSL-authorized lower MUC is possible. The INR 25 fund remains fixed. [Ministry order and Annex I, physical pp2–3](https://www.paradipport.gov.in/uploads/2025/10/MUC_19112024.pdf), [NLDSL 6 November 2024 letter, physical p2](https://www.dpworld.com/india/-/media/project/dpwg/dpwg-tenant/apac/india/media-files/ports-and-terminals/cochin/customer-advisory/tn-199.pdf?rev=88368489f5e044b2bf4ee0d5e3dc6829).
3. **The current JNPA schedule supports pilotage above 30,000 GRT.** The fixed published bases must be retained, including the small foreign-currency discontinuities at 30,001 and 60,001 GRT. Routine tugs are included; a separate tug hire must represent a distinct requested service. [JNPA 2026 schedule, physical pp3–5](https://www.jnport.gov.in/uploads/content_manager/SOR_w_e_f_01_05_2026_including_MBPA.pdf).
4. **Existing passed evidence can be reused where inputs/rules are unchanged.** Fresh JNPA, GTI, NSFT, NSIGT and NSICT downloads exactly match their retained PDF hashes. This verifies source bytes, not exhaustive rule interpretation or any deployment.

Machine-readable facts, hashes, source page references and 68 independent arithmetic and disposition cases are in [jnpa-sources.json](../../docs/portia-reliability/evidence/records/full-scope-20261018/jnpa-sources.json). Original source bytes are retained through [sources/jnpa](evidence/index.json). A network-denied attempt and a PSA index HTTP 403 are retained in the download manifest; PSA's index was readable through the web tool, and both PSA PDF downloads succeeded.

## Source versions and freshness

| Facility | Source/effective interval | Fresh verification |
|---|---|---|
| JNPA | [1 May 2026 schedule](https://www.jnport.gov.in/uploads/content_manager/SOR_w_e_f_01_05_2026_including_MBPA.pdf); authority index explicitly ends 30 April 2027 | SHA256 `6a0853b86c086a8983a5aaaa2a6c6d5dec0a6435df7d373cebebea3f7fb70095`; unchanged |
| GTI | [Commercial tariff effective 1 May 2026 00:01](https://www.jnport.gov.in/uploads/content_manager/Commercial_2026_Tariff_-_Effective_01st_May_2026_0001_hrs.pdf) | SHA256 `613c33f6c67c4f9e2f81749469dcdc2beae585292e35d583467b0020e169b554`; unchanged; APM lists it among current versions |
| NSFT | [1 May 2026 schedule](https://www.nsft.com/uploads/NSFTPL_Terminal%20Tariff.pdf) | Operator and JNPA copies match SHA256 `337c9ec529dd4959f3186565d0b147f98b5f68e1cef4d4aa5367f3d57c50a95e`; unchanged |
| NSIGT | [1 April 2026 schedule](https://www.jnport.gov.in/uploads/content_manager/Scale_of_Rates_1st_April_2026.pdf), annual ceiling period to 31 March 2027 | SHA256 `e1e7b142ca42f384b8f7a0e2cf5fdd1946faa1bbea2d31a86ef2967f865420c6`; unchanged |
| NSICT | [1 May 2026 schedule](https://www.jnport.gov.in/uploads/content_manager/NSICT_Tariff_2026.pdf) | SHA256 `572e163b2995cb6ed9f1649771f08fd3830afa04adfa3d7cb565ee82a5e048e7`; unchanged |
| BMCT | [JNPA current 6 April copy](https://www.jnport.gov.in/uploads/content_manager/SoR-_BMCT_w_e_f_06-Apr-2026.pdf), [matching PSA April-folder copy](https://india.globalpsa.com/wp-content/uploads/2026/04/SoR-BMCT-w.e.f-01-Apr-2026.pdf) | SHA256 `efed96a2230d2ffd36dde38bc995114b43af2871406ef3bd6c933edaaf3d8740`; both 273,984 bytes |
| BMCT earlier | [PSA March-folder 1 April copy](https://india.globalpsa.com/wp-content/uploads/2026/03/SoR-BMCT-w.e.f-01-Apr-2026.pdf) | Distinct SHA256 `78bfdb1912dd4d1a9c1a8549d415cd066250b80fc91de249c41459f4e74fe207`; retain historically, never silently substitute |

The JNPA SOR, terminal and circular indexes were freshly read; displayed last-update date was 16 October 2026. No newer general JNPA vessel tariff was found in that bounded inspection. A latest-index search is evidence of what was published there, not proof that no private agreement or unlisted notice exists.

## Ready for implementation: BMCT ordinary components

Use an explicit PSA Mumbai/BMCT identity. A generic Mumbai port label cannot select this terminal.

Physical p3 of the current BMCT PDF gives INR **2.378 foreign** or **1.427 coastal per GRT per hour or part**. For an ordinary continuous occupancy interval, billed hours are `ceil(minutes / 60)`. These are operator ceiling components. The generic annual indexation note on p11 establishes the April–March rate cycle; use the conservative 6 April 2026 start and 31 March 2027 ceiling-period end. Historical 1–5 April revision treatment remains a separate question.

The table's coastal rate requires the relevant licensed/certified coastal vessel status; cargo origin alone does not establish vessel status. Avoid applying another 60% reduction to the printed coastal rate. Next-higher-rupee rounding applies to the grand total of each complete bill (p3), not each component.

For ordinary quoting, explicitly exclude adjustments that require event facts: late cargo commencement, continuous vessel-caused idling, post-completion delay, readiness-to-sail cessation, false readiness, operator-caused downtime, priority or a contractual lower rate. The source specifies two hours' post-cargo grace, commencement within one hour, continuous idling over two hours, a four-hour readiness cap with listed waiting exclusions, and no base berth hire for operator-attributable idling (pp3–4). The penalty table is **INR per GRT**, not explicitly per GRT-hour; do not invent hourly or progressive application.

Normal 20ft handling on p5 is independently leg-based: foreign ship-yard INR 6,538.65 laden / 5,281.24 empty; matching yard-truck INR 1,005.97 per box; actual ICD rail INR 3,269.34 per box. Coastal ship-yard is INR 3,923.22 laden / 3,168.75 empty; the landside rows remain the same as foreign. Containers over 20ft and up to 40ft use the explicit 1.5 multiplier (p4). This source does not justify a generic 45ft multiplier. Reefer handling has the same base table, with additional services separate. Transshipment bands require a financial-year line/agent volume, so a single-vessel box count cannot select that band.

## Ready for implementation: complete ordinary JNPA pilotage bands

Physical p3, §2.2(A), gives these whole-visit amounts before the per-visit minimum:

| GRT | Foreign USD | Coastal INR |
|---|---|---|
| Up to 30,000 | `GRT × 0.3464` | `GRT × 9.0792` |
| 30,001–60,000 | `10393 + (GRT−30000) × 0.2776` | `272376 + (GRT−30000) × 7.2605` |
| Above 60,000 | `18722 + (GRT−60000) × 0.2429` | `490191 + (GRT−60000) × 6.3584` |

Minimum full visit: USD 275.40 foreign or INR 7,217.62 coastal (§2.2 notes, p4). One inward and one outward operation, routine pilots/tugs/craft and port-convenience shifts are included. User/terminal-requested shifts are separate. Each leg is 50% according to that leg's vessel status; mixed-status minimum allocation is not resolved by simply applying a full minimum to each half. Restrict the ordinary implementation to same-status full visits unless that separate interpretation is implemented.

Use the published fixed bases, not a smoothed progressive reconstruction. At 30,000 GRT the foreign amount is USD 10,392; at 30,001 it is USD 10,393.2776. At 60,000 it is USD 18,721; at 60,001 it is USD 18,722.2429. The document's integer ranges leave fractional-GRT boundary gaps; certified whole-number GRT avoids guessing those gaps.

Cold movements, no-tug pilotage and shifting have their own rows and predicates. A no-tug rate is not a discount selected just because the user omitted tug details. Other clearly published simple components—water, garbage visit, bunker-oil wharfage, VIA cancellation and separately requisitioned craft/manpower/fire tender—are retained in the facts JSON with their actual units and minimum four-hour rules where stated. They still need their own inputs and executable handlers; do not label an ordinary pilotage result a complete call invoice.

The source's p13 transition rule splits berth hire at midnight 30 April and applies new outbound pilotage rates after that boundary. It does not reprice every service using only the departure date.

## MUC: original authority and minimal inputs

Government-hosted file SHA256 `0a41ed78a31d81cdf94486e0af8d08902c5bed8084ea03f1bf516d6559671906` contains the Paradip forwarding notice (p1), MoPSW letter **PD-14033/34/2017-PD-V, 5 November 2024** (p2), and Annex I (p3). Annex I applies to all Major Port Authorities and BOT terminals operating there. Thus it covers the JNPA terminals, including GTI; this is not an inference from a Cochin-only rate.

The [NLDSL letter reproduced by DP World](https://www.dpworld.com/india/-/media/project/dpwg/dpwg-tenant/apac/india/media-files/ports-and-terminals/cochin/customer-advisory/tn-199.pdf?rev=88368489f5e044b2bf4ee0d5e3dc6829), physical p2, supplies the precise **28 October 2024–30 September 2027** interval and states the amount excludes GST. NSICT's current p10 repeats that extension. The original ministry annex says the cycle ends September 2027 and permits NLDSL-authorized lower MUC; the INR 25 fund remains unchanged.

Minimum facts for a scoped MUC answer: eligible terminal, charge date, **container count** and whether those containers are coastal or transshipment. No vessel GRT, berth time, size/TEU multiplier, road/rail mode or FX is needed. Laden and empty ordinary EXIM containers fall within the broad all-container rule. Exclude coastal and transshipment; when traffic classification is unknown, ask only that classification. The fee is per container, not TEU, so one 40ft container has the same published INR 170 ceiling as one 20ft container. Avoid adding it again where an explicitly supplied all-inclusive amount already includes it.

The Ministry source does not establish a numerical GST rate or the terminal's complete invoice rounding. The NLDSL collection commission of 5% is a remittance to the collecting port/terminal, not a user discount. Do not subtract it from INR 170. The invoice annex referenced by the NLDSL letter was not included in the operator's two-page reproduction; the Ministry annex itself is now retained separately.

## Other terminal implementation opportunities

- **NSFT:** the road and rail bundles explicitly include matching landside handling. Both 40ft and over-40ft rows are printed; use them instead of approximate multipliers. Coastal stevedoring is 60% of EXIM, other charges remain equivalent; coastal collection is INR and requires the nominated bank's dated rate. Import FX date is vessel port entry; export is container terminal arrival. Normal road/rail, hazardous 1.5×, ODC 2×/3× with special gear, reefer four-hour blocks, hatch-cover and transshipment rules are present. All need their stated service/event predicates. No separate marine berth table appears in the current terminal sheet. [NSFT pp2–6](https://www.nsft.com/uploads/NSFTPL_Terminal%20Tariff.pdf).
- **NSIGT:** ordinary berth is INR 2.0476 foreign / 1.2283 coastal per GRT/started hour. Normal ship-yard and actual ICD rail or truck legs are distinct. 40ft is 1.5×; printed coastal landside rates equal foreign, so do not discount again. Tariffs are ceilings and final next-higher-rupee rounding applies to each bill's grand total. [NSIGT pp2–5](https://www.jnport.gov.in/uploads/content_manager/Scale_of_Rates_1st_April_2026.pdf).
- **NSICT:** normal/reefer port-crane ship-yard tables explicitly cover 20ft, 40ft and over-40ft up to 45ft. Matching road or actual ICD rail legs are separate; monitoring and special categories have their own services. Printed size rows avoid one-paise differences from re-multiplication. Cargo coastal eligibility and vessel coastal status are distinct. [NSICT pp2–4](https://www.jnport.gov.in/uploads/content_manager/NSICT_Tariff_2026.pdf).
- **GTI:** normal ship-yard and landside handling are separately tabulated in INR. The 20ft ICD-laden ship-yard row is INR 3,943.05, while the ordinary loaded row is INR 3,943.04; preserve that difference. Landside tables on p2 are headed foreign-going, so a coastal landside amount cannot be invented by applying 60%. Original table values and all major headings are retained. [GTI pp2,10–11](https://www.jnport.gov.in/uploads/content_manager/Commercial_2026_Tariff_-_Effective_01st_May_2026_0001_hrs.pdf).

## Berth ownership: reasoned mapping, no automatic double charge

Current GTI p11 note 5 and NSICT p3 §2.12 expressly refer to berth hire payable to JNPA. Current BMCT and NSIGT have their own operator berth schedules. The [JNPA 19 December 2024 Chabahar notice and SOP](https://www.jnport.gov.in/uploads/content_manager/Trade_notice_for_Discount_on_CRC_VRC_on_vessel_coming_from_Chabahar_Port.pdf), physical p3(c)–(e), explicitly distinguishes JNPA berth collection from NSIGT/BMCT operator berth collection and lists NSFT among the covered terminals.

**Decision:** choose one owner for the ordinary berth component: BMCT/NSIGT operator schedule; GTI/NSICT JNPA schedule. NSFT's JNPA ownership has historical explicit support but no fresh standalone marine billing statement was located; retain that qualification. The 2024 document's **40% discount expired 31 December 2024**. Its ownership explanation is historical corroboration, not authority to apply that discount in 2026. This source chain does not establish every private contractual addition or a complete invoice.

## Amendment traps resolved during the search

- The JNPA **8 June 2026 ground-rent notice** provides a claim-based 50% reimbursement from day nine, for specified laden road imports discharged within its stated window and removed by 20 June. It is not an automatic 50% reduction on all 2026 storage. [Notice](https://www.jnport.gov.in/uploads/content_manager/Trade_Notice_9_6_2026.pdf).
- The **Middle East stranded-export waiver** is restricted by container location/gate-in and destination. Its April extension ends **5 April 2026 at 24:00**, despite the index displaying a December expiry. [Base notice](https://www.jnport.gov.in/uploads/content_manager/1773215092.pdf), [extension](https://www.jnport.gov.in/uploads/content_manager/1775399647.jpeg).
- **Road toll** from 1 February 2025 is INR 598.95 per TEU, 24.20/MT project/liquid cargo and 5.50/MT cement/LPG. The corrigendum restricts it to road goods traffic; it is not a rail levy. The body says interim until approved revised rates, not the index's expiry. Additional supersession validation is needed before a current toll handler. [Notice](https://www.jnport.gov.in/uploads/content_manager/Toll__Trade_Notice_MJPRCL_01_02_2025.pdf), [corrigendum](https://www.jnport.gov.in/uploads/content_manager/2025_02_01_Corrigendum_Trade_Notice_MJPRCL.pdf).
- The **Seafarers' Club notice** is actually dated 12 July 2024, effective after 30 days, and levies INR 1,500 plus applicable taxes per foreign vessel berthing. Its web-index posting date differs. It is a published additional-charge candidate, not included by the pilotage table. [Notice](https://www.jnport.gov.in/uploads/content_manager/Levy_of_Seafarers_Club_Charges_Trade_Notice.pdf).

## Residual work and precise inquiries

No tariff interpretation or personal port contacts are needed from the user to implement the unambiguous components above. Coding, per-branch tests, source-backed explanations and final acceptance remain the implementation team's work. Source uncertainty must stay attached to the affected component rather than blocking unrelated arithmetic.

If public evidence remains insufficient, the following are ready-to-send inquiry subjects; **none were sent**:

| Recipient/source route | Exact inquiry | Only affects |
|---|---|---|
| JNPA Finance, `info@jnport.gov.in`, finance contact in official notices | Supply current consolidated marine general conditions, selected currency conversion source/date rules, invoice rounding, and confirm whether NSFT berth hire is collected by JNPA under §2.3 with no separate operator berth component. | Complete INR invoices and NSFT berth ownership |
| [PSA Mumbai official contact](https://india.globalpsa.com/psa-mumbai/), published phone +91 22 27248000 | Confirm whether the revised rates linked as effective 6 April 2026 are retrospective to 1 April, and provide any applicable lower published rates. | Historical 1–5 April and discounted BMCT quotes |
| [DP World NSIGT tools/contact](https://www.dpworld.com/en/ports-terminals/india/nsigt/tools-documents) and PSA Mumbai | Clarify whether the penalty bands expressed only as INR/GRT are one bracket charge, repeated time blocks or another basis; provide one worked penalty invoice for a 7-hour eligible delay. | Penalty branches, not ordinary berth |
| [APM Mumbai tariffs](https://www2.apmterminals.com/en/mumbai/services/tariffs-and-terms) | Supply current coastal yard-to-truck/ICD-rail applicable rows where the published table is headed foreign-going, and confirm replacement of the stale MUC paragraph. | GTI coastal landside and publication cleanup |
| [NSFT operator](https://www.nsft.com/), published phone +91 8657895585 | Confirm nominated FX bank/rate publication and provide the dated marine billing/berth ownership statement for NSFT. | Actual INR conversion and complete NSFT marine invoice |
| NLDSL, `contactus@nldsl.in` from its signed letter | Supply the invoice/GST annex referenced by NLDSL/MUC/01/2024-25 and any authorized lower-rate order applicable to JNPA terminals. | GST invoice treatment and contracted lower MUC |

Do not ask the user to decide units, tariff applicability or whether a charge is included. A quote may need ordinary operational facts such as call date, traffic classification, quantity and requested service; those are normal conversational inputs, not requests for tariff expertise.
