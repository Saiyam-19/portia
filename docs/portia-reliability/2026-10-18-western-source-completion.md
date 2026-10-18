# Western port source completion — 18 October 2026

This is a primary-source audit for Jaigarh, JSW JNPT Liquid Terminal, Konkan LNG, Ranpar/Finolex and Redi. It is not application acceptance or a claim that every current amendment was found. No paid inference, external message, application edit or persistent process was made. Source requests below are prepared, **not sent**. The user need not interpret tariff rules.

The machine handoff is [western-sources.json](../../docs/portia-reliability/evidence/records/full-scope-20261018/western-sources.json). It contains retrieval UTC timestamps, original-byte SHA256 hashes, date/FX contracts and 71 independent synthetic arithmetic/guard cases. Original PDFs are mapped in [sources/western](evidence/index.json). Expected amounts were calculated with Decimal directly from visually inspected tables, without reading or running application calculation code. Synthetic FX examples are tests, not evidence of real exchange rates.

## Source decisions

| Facility | What can be used now | What remains unresolved |
|---|---|---|
| JSW Jaigarh | Official May 2026 original, including clear J-1 through J-5 component branches | Exact 45,000-GT J-2 overlap, selected age endpoints, INR minimum conversion source, MMB amendment chain, full invoice treatment |
| JSW JNPT Liquid Terminal | Historical 2024 original and marine-charge ownership; current JNPA rules must be assessed separately | Original current operator successor: April, June and December 2025 candidates exist, but current bytes were not recovered |
| Konkan LNG | Original 2025 and November 2026 notices; unambiguous dated base calculations and specified FX event | Excess/cap and delay allocation, old footnote continuity after November, later tax/rounding treatment |
| Ranpar/Finolex | Facility identity and undated MARPOL service explanation | Dated marine/cargo schedule for both EDC/chemical and coal jetties |
| Redi | Operator identity and official contact channel | Dated operator marine/cargo tariff; distinguish berth, anchorage and lighterage |

### Jaigarh

The [operator page](https://www.jswinfrastructure.in/ports/jaigarh-port) currently links an [October 2025 PDF](https://jswin.s3.ap-south-1.amazonaws.com/jswinfrastructure/uploads/2026/02/JSW-Jaigarh-Port-Tariff-wef-01.10.2025.pdf). A later [official May 2026 original](https://www.jswinfrastructure.in/sites/default/files/assets/industry/infrastructure/jaigarh/JSW-Jaigarh-Port-Tariff-wef-01.05.2026.pdf) was retrieved successfully. A stale index label does not invalidate its explicit effective date or require operator approval for every clear component.

Page 1 permits these dated components: J-1 USD0.33/GT for mechanized bulk, nonmechanized bulk and containers; USD0.45/GT for LPG/chemical; USD2,000 minimum per call, maximum 30-day validity. J-2 selects a whole-GT rate and includes one berthing and unberthing. At exactly 45,000 GT, differently priced bands overlap: do not guess. J-3 is max(0.035 × GT, USD200). J-4 base bands are USD100/150/200 at ≤10,000 / 10,001–30,000 / ≥30,001 GT; pollution cleaning is additional and not quantified. J-5 ordinary attendance is USD100/hour when its trigger applies.

J-6 has INR25,000/50,000 minima, distinct from USD hourly rates. Page 6 specifies the valuation date but no rate bank/source. J-8 age endpoints overlap. J-20, page 7, cites amended MMB wharfage. These issues limit their affected branches; they do not invalidate unrelated clear components.

### JSW JNPT Liquid Terminal

The [JNPA-hosted 2024 original](https://www.jnport.gov.in/uploads/content_manager/JSW_JNPT_Liquid_Terminal_Pvt_Ltd_Tariff_wef_05112024.pdf), pages 3–4, limits cargo/infrastructure prices to 31 March 2025. Page 3 routes JNPA-owned marine services to JNPA's changing tariff; this is not a terminal-cargo price.

Search identified original operator URLs for [April 2025](https://group.jsw.in/sites/default/files/assets/infrastructure/JSW-JNPT-Liquid-Terminal-Pvt-Ltd-Tariff_wef-01042025.pdf), [June 2025](https://www.jsw.in/sites/default/files/assets/infrastructure/JSW-JNPT-Liquid-Terminal-Private-Limited-tariff-w-e-f-01-06-2025.pdf), and [December 2025](https://group.jsw.in/sites/default/files/assets/infrastructure/JSW-JNPT-Liquid-Terminal-Private-Limited-tariff-w-e-f-Dec-5-2025.pdf). Their direct originals failed with DNS/404/502; JSW and JSW Infrastructure hostname alternatives also failed. Official-domain searches found no downloadable successor mirror at JNPA or the operator's S3 host. The live [terminal page](https://www.jswinfrastructure.in/terminals/jnpt-liquid-terminal/) exposes no PDF tariff link.

June's cached extraction materially differs from 2024 on overstay and pigging permission. It cannot be silently substituted for original custody, and the indexed December successor means June cannot be assumed latest. This search establishes a retrieval gap, not tariff absence.

### Konkan LNG

The [2025 notice](https://konkanlng.in/media/2025/09/NOTICE-FOR-PORT-CHARGES.pdf), page 1, starts 1 October 2025: berth USD0.1/GT, INR1m cap, and pilotage USD0.2/GT, INR2m cap, excluding GST18%. Berth covers up to 36 hours, first line ashore to cast off. Vessel-attributed excess has a separate USD0.0041/GT/hour trigger; cap interaction and mixed causes remain unresolved. INR cap comparison requires the prescribed SBI TT selling rate, not an arbitrary currency rate.

The [November 2026 notice](https://konkanlng.in/media/2026/10/Notice-for-revision-in-port-charges-at-KLL.pdf), page 1, changes the base to **one** combined USD0.359/GT line, uncapped, effective 1 November. It changes the FX event from the day before scheduled berthing to scheduled berthing day, using the previous bank working day when that event date is a holiday. The [operator homepage](https://konkanlng.in/) links the revision.

Both fresh originals match retained bytes. Clear base calculations need no new operator interpretation. The revision does not explain old excess-footnote continuity or state a new GST/rounding rule; do not invent these or claim a complete invoice from base arithmetic alone.

### Ranpar/Finolex and Redi

Finolex's [terminal information](https://www.finolexpipes.com/site/assets/files/1776/finolex_terminal_information.pdf), page 1, distinguishes EDC/chemical and coal jetties. Its vessel size limits are displacement tonnes, not GT. The [reception tariff](https://www.finolexpipes.com/site/assets/files/4563/tariff_for_reception_facility.pdf), page 1, concerns MARPOL waste only and carries no effective date; it cannot price berth hire.

[Redi's operator site](https://www.rediport.com/) and [heritage page](https://www.rediport.com/our-heritage/) describe the port, not a charge schedule. Direct homepage download returned 403; browser-search extraction was available. The [actual contact page](https://www.rediport.com/contact-us/) supplies business contacts. Template pages with `yoursite.com` addresses were rejected.

Bounded searches covered operator-domain tariff/berth/scale-of-rates queries, MMB Finolex/Redi tariff queries, and the known facility pages. They located no dated governing marine/cargo schedule. This does not prove that no public document exists.

## Prepared source requests — not sent

These requests are owned by the project, not homework for the user. Public-source decisions above can proceed independently. Sending requires permission to contact the named organisations, the sender identity and reply destination.

### Finolex terminal commercial team

Contact published in the undated terminal PDF: Terminal Manager, `ram@finolexind.com`, +91 2352 238015 / +91 9552546958. These are document-listed contacts, not independently confirmed current personnel.

**Subject:** Current Ranpar/Finolex terminal tariff and effective amendments

Please provide the currently operative original tariff and effective amendments for both the EDC/chemical jetty and coal jetty at Ranpar/Pawas, including berth/anchorage, pilotage/tugs/mooring, port/statutory dues and cargo services. Please identify effective dates, units, minimum charges, time rounding, inclusions, coastal/foreign differences, applicable tax/FX rules, and whether commercial booking terms override published rates. The publicly available terminal-information and MARPOL reception sheets do not contain these marine/cargo prices. A dated standard quotation with its governing terms is suitable if the schedule is not publicly published.

### Redi Port commercial team

Official contact page: [Redi contact](https://www.rediport.com/contact-us/), +91 22 40392000 / +91 22 22872696; head office Earnest House, 10th Floor, NCPA Marg, Nariman Point, Mumbai 400021. The page has a contact form; no verified public email was found.

**Subject:** Current Redi port marine/cargo tariff and applicability

Please provide the operative dated tariff and amendments for port calls at Redi, separating berth occupancy, anchorage, lighterage and other marine/cargo services. Please include effective dates, eligible vessel/cargo categories, units and minima, included services, statutory/MMB dues, time rounding, taxes/FX, and any contractual quotation requirements. Please identify any services unavailable at present rather than supplying a rate from a proposed facility.

### JSW JNPT Liquid Terminal commercial team

Verified operator contact: [JSW Infrastructure form](https://www.jswinfrastructure.in/contact-us), +91 22 42861000; request routing to JJLTPL commercial/tariff owner.

**Subject:** Original current JJLTPL Scale of Rates and supersession chain

Please provide the original currently operative JJLTPL Scale of Rates, including the document indexed effective 5 December 2025 and subsequent amendments. The public 2024 schedule's cargo/infrastructure prices expired 31 March 2025; April/June/December 2025 operator URLs currently fail download. Please confirm effective intervals and the current cargo/infra, overstay/idling, pigging, compressor, water and gangway terms, including units, rounding and tax treatment. Please confirm the division between JJLTPL charges and JNPA marine charges and identify any separately contracted cargo services.

### Jaigarh marine/commercial team

The May 2026 tariff, page 8, publishes `mct.jpl@jsw.in`; the current JSW contact form above is an alternative.

**Subject:** Clarification of limited Jaigarh May 2026 tariff branches

Please provide subsequent amendments to the May 2026 tariff and confirm the applicable J-2 rate at exactly 45,000 GT, where two differently priced printed ranges overlap. Please specify J-8 treatment at exact age endpoints, the bank/rate type used for INR conversion and berth minimum comparison, invoice rounding/tax treatment, and the governing MMB wharfage notification with amendments. Please clarify any individual-contract exclusions. We can apply other clear May 2026 components without waiting for these unrelated clarifications.

### Konkan LNG marine team

Signed notices list `md.pandey@konkanlng.in`, +91 7972402899 / +91 9422003048. Operator general contact is `info@konkanlng.in`.

**Subject:** KLL November 2026 tariff — excess stay and invoice terms

Please confirm whether the 2025 36-hour base period and vessel-attributed excess-stay rule continue after 1 November 2026, and supply the governing clause. For pre-November excess stay, please clarify cap interaction, fractional-hour treatment and allocation of mixed terminal/vessel delay. For November onward, please confirm GST and invoice rounding. We recognise the new combined USD0.359/GT base, removal of the cap, and revised scheduled-berthing-day SBI TT selling conversion rule; these are not requests to reinterpret clear published terms.

## Resource and verification boundary

All original download successes/failures are preserved. Seven PDFs were extracted; relevant rendered tables were visually inspected. No application source/tests, secret key, provider API, service or database was touched. Short retrieval/extraction commands completed. Shared listeners, including 3000, 3210/3211, 5174, 5198 and graph 9749, were preserved. No process was stopped or reused as an owned process.

## Deeper government/archive follow-up

At the user's further request, government and regulatory archives were searched before treating any operator request as the next required action. The initial seven-PDF statement above describes the first pass; this follow-up adds the sources below. [Government source findings](evidence/records/full-scope-20261018/western-sources.json) preserves the research conclusions; [retrieval provenance](evidence/records/full-scope-20261018/western-sources.json) preserves URLs, failures and hashes. No request was sent. The original 71 Jaigarh/KLL oracle entries are unchanged and separately hash-frozen.

### Primary archive recovered

MMB's government pages are a JavaScript application, so ordinary web extraction appeared empty. Its publicly linked client bundle exposes the actual document paths and read-only publication API. This recovered original statutory documents instead of relying on search snippets:

- [MMB port-dues notification, 22 October 2001](https://mahammb.maharashtra.gov.in/assets/12_Notification%20for%20Port%20Dues%20-%2822.10.2001%29-D-6dJp6R.pdf), English pages 8–13: Redi is explicitly in the Vengurla group. Foreign-going vessels use GRT; powered non-foreign vessels use NRT. The ordinary rate is INR3/GRT for foreign-going vessels and INR3/NRT for powered non-foreign vessels of at least 10 NRT. Lower-tonnage and unpowered bands differ. The document includes same-group 30-day reuse, specific half/three-quarter dues and re-entry balances, fishing/repair exceptions, and whole-tonne half-up measurement. Six independent historical arithmetic references are in the JSON addendum. **These are statutory-dues references, not operator berth/pilotage prices or automatic current charges.**
- [2017 concession notification](https://mahammb.maharashtra.gov.in/assets/14_Notification%20for%20Concession%20in%20port%20dues-%20%2825.05.2017%29-DRMYbxfX.pdf), page 2: specified greenfield developers with a qualifying concession agreement receive exemptions for construction/cargo vessel movements; other movements remain chargeable. Private-port status alone does not establish this entitlement.
- [MMB landing/shipping amendment signed 5 April 2011](https://mahammb.maharashtra.gov.in/assets/6_%20MMB%20Landing%20and%20Shipping%20fees%20Regulations_%202011-%20%285.4.2011%29-BNR2wlhj.pdf), English pages 6–9: separate captive, MMB-with-service, MMB-without-service and multipurpose columns. EDC, coal and iron ore have distinct rates. The liquid measurement rule depends on density: at or below 1 g/cm³, the stated unit is 1,000 litres; above that, 1,000 kg. GT is never the cargo quantity. Gazette publication is 7 July 2011; the footnote specifies retrospective effect from 31 March 2010. Do not mistake upload timing for validity.
- [2015 coastal amendment](https://mahammb.maharashtra.gov.in/assets/8_MMB%20Landing%20and%20Shipping%20fees%20%28Amendment%29%20Regulations_%202015%20%28Wharfage_Charges%29%20-%20%2810.09.2015%20%29-C_JgJqoR.pdf), page 2: specified small-vessel coastal movements between Maharashtra non-major ports avoid repeated wharfage recovery on the same cargo. This requires its actual shipment predicates, not a universal coastal discount.
- [MMB Maritime Development Policy 2023](https://mahammb.maharashtra.gov.in/assets/1_Maharashtra%20Maritime%20Development%20Port%20Policy%202023%20%2818-8-2023%29-DhOu7RT0.pdf), PDF pages 23, 26 and 55–56, clauses 7.4, 8.4, 8.5 and 23.2: WFR may depend on the facility agreement; specified categories use a SOR with five-financial-year escalation. Existing captive terms otherwise follow their agreements. The policy alone does not establish the base schedule/escalation anchor or a specific facility's exemptions.

The [Indian Ports Act 2025](https://shipmin.gov.in/sites/default/files/FINAL%20ACT%2027%20of%202015%20-%20indian%20Ports%20Act%2C%202025-2.pdf), page 25, section 85(2)(a), expressly preserves earlier notifications until replaced. Therefore an old document must not be declared expired merely because it is old. Conversely, this saving provision is not proof that no later amendment or exemption exists. The Act's section 1(2) requires commencement by notification; this research does not make a general commencement determination.

### Important exclusions resolved

The [MMB 2012–13 report hosted by Maharashtra's legislature](https://mls.org.in/pdf/Mahamandal_ahwal_Rainy2016/MMB2012-13.pdf), PDF page 35 / printed page 36, gives a captive-jetty policy summary without berthing dues and explicitly lists Finolex liquid and coal facilities. It is useful historical policy evidence. It does **not** prove every current commercial terminal service is free. [GAC's Finolex report](https://www.gac.com/hot-port-news/revised-port-charges-at-terminal) describes separate operator berth and marine charges; it supplies no original governing notice in the retrieved page. It remains a lead, not an activated tariff.

The [1987 tug/mooring notification](https://mahammb.maharashtra.gov.in/assets/9_Schedule%20of%20rates%20for%20tug%20attendance_%20towage%20of%20ships_%20vessels%20_%20Other%20craft%20_%20use%20of%20mooring%20boats%2001-08-1987-akWSfHJX.pdf), page 1, expressly applies to **Bhagwati Port, Mirya Bay**. It cannot be transplanted to Pawas/Finolex or Redi. The [2024 transshipment remission](https://mahammb.maharashtra.gov.in/assets/21_Notification%20for%20Remittance%20of%20Transshipment%20tax%20-%20%2812.02.2024%29-alx1-K3m.pdf), page 2, concerns Ro-Ro/Ro-Pax ticket/passenger levies on specified routes, not general cargo charges.

Statutory MMB dues must not be added to operator tariffs without establishing who collects what and whether the operator rate already includes the statutory component. These recovered documents reduce unknowns but do not establish a complete 2026 Finolex or Redi invoice.

### Latest-source attempts and result

- MMB's public API searches for tariff, wharfage, port dues, Finolex, Redi and the `0124` notification reference were retrieved and retained. The legal/operational records clarify facility identity and regulatory ownership; no current operator tariff emerged.
- Maharashtra's official gazette search timed out via both web retrieval and a bounded direct request. Secondary indexes mention September 2026 notifications under `MISC-0124/C.R.19/Ports-1`; their originals were not obtained and their summaries were not activated.
- The [ABMP JNPA archive](https://www.abmp.gov.in/tarifforders/details/port-wise/4?folder=22&view_all=1) contains historical liquid-terminal reference orders, but this bounded review found no December 2025 JJLTPL operator successor.
- JSW's sitemap first rejected content negotiation with 406, then returned 200 with ordinary browser headers. It leads to the same terminal page and exposes no successor tariff attachment. Official-domain and exact-filename searches still yielded only the failed original December 2025 URL.
- [GAC's Redi report](https://www.gac.com/hot-port-news/redi-port-tariff) expressly describes 2023–24 and provides no original attachment. Its anchorage, pilotage and ship-service charges cannot be relabelled as 2026 rates. Exact-rate searches for both GAC leads did not locate the owning primary notice. Direct GAC HTML snapshots returned 403; accessible web extracts were used only for lead tracing.

### What remains needed after this work

The project still needs original operative operator schedules/contractual terms for Finolex and Redi; applicable MMB schedule/escalation and concession/exemption evidence; and the current JJLTPL original. These are requests for documentary evidence, **not requests for the user to decide tariff interpretation**. Clear Jaigarh/KLL components can proceed independently.

MMB's current published facility records also provide more specific contact routes: [Finolex](https://mahammb.maharashtra.gov.in/port-cargo/port-operations/ports-captive-jetties/finolex-industries), Sumedh Kulkarni (PFSO), `ksr@finolexind.com`, 8275001802; [Redi](https://mahammb.maharashtra.gov.in/port-cargo/port-operations/ports-captive-jetties/redi-port), Sandeep Chauhan (PFSO), `sandeep@earnestjohn.com`, 9545710311. These can route a commercial-source request if deeper public research remains insufficient. No contact has been made.
