# Everyday questions: openai/gpt-6-luna, 2026-10-25

30 of 30 answers passed every automatic check. Cost of this run: about US$ 0.0303 from token counts (OpenRouter showed US$ 0.0948 spent of the US$ 9 limit when the run ended; its figure can lag).

Sample data used: one saved ship (MV Ocean Star), one charter-party passage and a 15% berth-hire discount at Hazira. Figures below come from the rule book; nothing was sent to anyone.

| Question | Tools | Checks | Steps | Seconds |
|---|---|---|---|---|
| estimate-paradip | estimate_port_call | pass | 2 | 5 |
| estimate-mundra-tanker | estimate_port_call | pass | 2 | 5 |
| voyage | estimate_port_call | pass | 2 | 8 |
| compare-berth-hire | compare_ports | pass | 2 | 6 |
| compare-whole-bill | compare_ports | pass | 2 | 4 |
| tariff-hazira-pilotage | port_tariff | pass | 2 | 4 |
| what-changed-paradip | port_tariff | pass | 2 | 4 |
| coverage | list_ports | pass | 2 | 3 |
| draft-chennai | search_port_documents | pass | 2 | 4 |
| documents-mundra | search_port_documents | pass | 2 | 7 |
| pilotage-compulsory-mumbai | search_port_documents | pass | 2 | 6 |
| night-pipavav | search_port_documents | pass | 2 | 3 |
| unsupported-port | estimate_port_call | pass | 2 | 4 |
| pilotage-jnpa | estimate_port_call | pass | 2 | 5 |
| kandla-tanker | estimate_port_call | pass | 2 | 7 |
| coastal-nmpa | estimate_port_call | pass | 2 | 6 |
| anchorage-chennai | estimate_port_call | pass | 2 | 12 |
| fleet-autofill | estimate_port_call | pass | 2 | 5 |
| fleet-save | save_ship | pass | 2 | 5 |
| company-docs | search_company_documents | pass | 2 | 3 |
| agreed-rates | estimate_port_call | pass | 2 | 4 |
| general-term | none | pass | 1 | 3 |
| fuel-surcharge-now | port_tariff | pass | 2 | 4 |
| rupees | estimate_port_call | pass | 2 | 5 |
| tariff-comparison | compare_ports | pass | 2 | 10 |
| kamarajar-container | estimate_port_call | pass | 2 | 5 |
| cheapest-small | compare_ports | pass | 2 | 4 |
| lng-mundra | estimate_port_call | pass | 2 | 5 |
| vlcc-chennai | calculate_elapsed_time, compare_ports | pass | 3 | 6 |
| freshness-mumbai | port_tariff | pass | 2 | 4 |

## estimate-paradip

> What will it cost to berth a 32,000 GT bulk carrier at Paradip for 2 days?

**Estimated total before GST: USD 46,315.02.**

This assumes a foreign-going bulk carrier and includes port dues, pilotage and towage for arrival and departure, and berth hire for 48 hours. Mooring is included in the pilotage-and-towage charge.

The estimate uses Paradip’s schedule effective 10 October 2026. Anchorage, wharfage and other charges are not included because their rates aren’t available in the schedule we hold. USD charges are converted to rupees using the applicable RBI reference rate (or SBI market buying rate if unavailable); no conversion amount is shown here.

## estimate-mundra-tanker

> port charges at mundra for a 45k grt tanker staying 30 hrs

**Estimated total before GST: USD 84,685.00**

This estimate is for a 45,000 GRT tanker at Mundra, staying alongside for 30 hours. GRT is the vessel’s gross tonnage. The total includes port dues, pilotage and its fuel surcharge, mooring, berth hire, and other listed port charges.

**Assumptions:** foreign-going ship; 2 movements (arrival and departure); pilotage includes tugs. Wharfage isn’t priced because it isn’t in the Mundra schedule we hold. Anchorage waiting time wasn’t provided, so the total may change if the ship waits at anchor.

The fuel surcharge is based on the notice dated 1 October 2026; Mundra may revise it, so check the latest notice before relying on the estimate.

## voyage

> We're sailing from Mundra to Chennai with a 40,000 GRT bulk ship, about a day alongside at each. What will the port costs come to in total?

**Estimated total before GST: USD 131,580.28.**

That combines **USD 72,584.28 at Mundra** and **USD 58,996.00 at Chennai**.

Assumptions: foreign-going bulk ship; 40,000 GRT (gross register tonnage); 24 hours alongside at each port; and 2 pilotage movements at each port. At Mundra, pilotage includes tugs. I treated the voyage as a departure from Mundra and an arrival at Chennai.

The estimate is **incomplete**: anchorage waiting time wasn’t provided, so anchorage charges aren’t included. Wharfage isn’t priced at either port; towage, mooring and other charges aren’t priced at Chennai. Mundra’s fuel surcharge is based on the notice dated 1 October 2026 and may have changed, so check the latest notice before relying on the total.

## compare-berth-hire

> Compare berth hire at Mumbai and JNPA for a 25,000 GT container ship staying 18 hours

I can’t price or rank berth hire yet. The tariff depends on the specific berth at Mumbai and the terminal at JNPA.

Which Mumbai berth will the ship use: Indira Dock, Ballard Pier, or Prince’s/Victoria Docks? Which JNPA terminal: GTI, NSIGT, NSICT, NSFT, BMCT, or JSW JNPT Liquid Terminal?

## compare-whole-bill

> Which is cheaper overall for a 30,000 GRT bulk carrier staying 24 hours: Kattupalli, Chennai or Kamarajar?

I can’t rank them overall without an exchange rate: **Kattupalli’s total is split between INR and USD**, while Chennai and Kamarajar are quoted in USD.

**Before GST**, for a foreign-going bulk carrier of 30,000 GRT staying 24 hours:
- **Kattupalli:** INR 3,43,200 + USD 34,017.30
- **Chennai:** USD 35,760
- **Kamarajar:** USD 37,620

The comparison assumes 2 movements at each port: arrival and departure. Give me an INR-per-USD exchange rate and I can rank the totals.

## tariff-hazira-pilotage

> How does Hazira charge pilotage?

Hazira charges pilotage as a **per-GRT rate**, with a minimum charge for the ship’s tonnage band. GRT means the vessel’s gross tonnage.

- **Up to 3,000 GRT:** USD 1.45331 per GRT, minimum USD 6,000  
- **Over 3,000 up to 15,000 GRT:** USD 1.45331 per GRT, minimum USD 14,500  
- **Over 15,000 GRT:** USD 1.45331 per GRT, minimum USD 25,300  

This charge includes **one berthing and one unberthing, with all tug charges**. A separate fuel surcharge is currently listed at **USD 0.225070 per GRT**; it is reviewed about twice a month, so check the latest notice before relying on it. The surcharge does not apply to LNG ships.

Source: *Adani Hazira Port Berthing Policy and Tariff Structure*, page 26; fuel-surcharge circular dated 1 October 2026, page 1.

## what-changed-paradip

> What changed in Paradip's port charges this year?

Paradip’s new Scale of Rates took effect on **10 October 2026**. Compared with the schedule in force from **1 May to 9 October 2026**, the listed charges increased:

- **Port dues:** from **USD 0.34 to USD 0.408 per GRT** (gross tonnage).
- **Pilotage and towage:** the rates in each GRT band rose. For ships up to **30,000 GRT**, the rate went from **USD 0.7148 to USD 0.8578 per GRT**. The higher bands also increased; the new schedule states a **USD 858 minimum**.
- **Berth hire:** from **USD 0.003338 to USD 0.004006 per GRT per hour**. Each started hour counts.

The changes are listed in Paradip Port Authority’s **Scale of Rates 2026**, effective **10 October 2026**, checked **25 October 2026**. The rate schedule gives the detailed pilotage-and-towage bands on page **18**, port dues on page **17**, and berth hire on page **25**.

## coverage

> Which ports do you cover?

We cover these 12 Indian ports:

- Mumbai Port Authority
- Jawaharlal Nehru Port Authority (JNPA)
- JSW Jaigarh Port
- New Mangalore Port Authority
- Paradip Port Authority
- Deendayal Port Authority (Kandla)
- Chennai Port Authority
- Kamarajar Port (Ennore)
- Adani Mundra Port
- Adani Hazira Port
- Adani Kattupalli Port
- Gujarat Pipavav Port

Coverage includes port-call charges, but the charges and terminals available vary by port. Some tariffs have gaps—for example, certain berths or ship types may not be priced.

## draft-chennai

> What's the permissible draft at Chennai's berths?

Chennai’s permissible draft varies by berth. The published berth table lists:

- **Dr. Ambedkar Dock:** 8.5–15 m
- **Jawahar Dock:** 12.5–14 m
- **Bharathi Dock:** 9–16.5 m

Some berths have conditions—for example, **27B** lists **17 m during high water**, and **09J** lists **13 m during high water**. The table is titled *Permissible Draft at Berths as on 01.01.2026*, page 1, from Chennai Port Authority.

## documents-mundra

> What documents do I need to submit before arriving at Mundra?

Mundra’s procedure says the agent should first obtain **official acceptance from APSEZ** before fixing the vessel. Vessel declarations and supporting documents are submitted through APMS/IPOS. If it is the vessel’s first call, its vessel definition must be completed and approved first. **The port says it will not issue a VCN if the vessel definition is incomplete or required certificates are missing.** ( *Standard procedure for vessel declaration…*, pp. 1–2.)

**General vessel documents listed for declaration:**
- Berthing application (MAR/F/003)
- Vessel and cargo particulars, Part A (MAR/F/011)
- Vessel Acceptance Navigational Checklist, Part B
- Ship particulars and International Tonnage Certificate
- International Air Pollution Prevention (IAPP) Certificate
- P&I certificate and Liability for the Removal of Wrecks Certificate
- Document of Compliance and ISM Safety Management Certificate
- Civil Liability Convention (CLC) certificate and Civil Liability for Bunker Oil Pollution Damage certificate
- International Ship Security Certificate and International Oil Pollution Prevention (IOPP) Certificate
- Load Line, Safety Equipment, Safety Construction and Safety Radio certificates
- Ship Sanitation Control Exemption and Ballast Water Management System certificates
- Certificate of Class, Certificate of Registry and Safe Manning Certificate
- Agency appointment letter and letter of appointment from the owner/operator  
(*Same document, pp. 1–2.*)

**Also note:**
- Submit PANS (pre-arrival security information) and the crew list. The procedure says the vessel will not be allowed into port limits without PANS being received. It lists email recipients on page 3.
- Send the prior IGM to the Port Operations Centre 24 hours before arrival.
- Give ETA updates at the stated pre-arrival intervals; the procedure also asks for updates 12 and 6 hours before arrival.
- Additional documents apply to bulk/break-bulk and liquid vessels. For example, cargo plans and sequences are listed for those vessel types.
- There are age-related requirements: GMB clearance is listed for vessels aged 25 years or older; extra certificates are listed for liquid tankers older than 20 years. (*Same document, pp. 2–3.*)

The exact additional documents depend on vessel and cargo type. The port procedure is titled *Standard procedure for vessel declaration, submission of Pre-arrival documentation and NDC at APSEZL, Mundra*; the excerpts were retrieved 25 October 2026.

## pilotage-compulsory-mumbai

> Is pilotage compulsory in Mumbai?

Yes. **Pilotage is compulsory for ships of 100 net tons and above** when entering or leaving Mumbai Harbour, according to Mumbai Port Authority’s *Pilotage* document, page 1.

Net tonnage measures a ship’s usable internal capacity. The document excerpt does not specify exemptions.

## night-pipavav

> Can ships enter Pipavav at night?

Yes. Pipavav allows night navigation, and its safety memo says vessels can berth day or night. Entry and berthing still depend on the vessel, weather and tide; the memo sets a tidal window for pilot-on-board timing. Pilotage is mandatory.

One exception: LPG vessels are listed as daytime-only on APM Terminals’ “Our Port” page. Sources: *SAFE MEMO – PIPAVAV PORT – INDIA*, pages 1–2 (2 Sep 2025); APM Terminals Pipavav, “Our Port,” page 1.

## unsupported-port

> What would a call at Colombo cost for a 20,000 GT ship?

Colombo isn’t covered by the port-cost data I have, so I can’t estimate the call cost. I can price calls at the Indian ports listed in my coverage.

## pilotage-jnpa

> How much is pilotage for a 10000 GT ship at JNPA?

For a **10,000 GT** ship, JNPA’s indexed schedule shows **USD 3,464 before GST** for **pilotage and towage together**. That covers 1 inward and 1 outward movement.

This is not a pilotage-only price: JNPA’s tariff combines pilotage and towage. I assumed a foreign-going container ship. The rate is from *JNPA Scale of Rates w.e.f. 1 May 2026*, page 3, section 2.2 A.

## kandla-tanker

> berth hire at kandla for a 20k GT liquid tanker, 36 hours

**Berth hire: USD 6,048 before GST.**

Based on 20,000 GT and 36 hours at Kandla’s liquid-cargo berths. The estimate assumes a foreign-going tanker and includes arrival and departure movements. The tariff counts each started time period; no other berth-hire charges were priced.

The rate is from Deendayal Port Authority’s schedule effective 1 May 2026–30 April 2027, page 10. The USD charge is converted to rupees for recovery at the bank rate specified by the port; no exchange rate was provided, so no INR total is shown.

## coastal-nmpa

> Estimate port dues and pilotage at New Mangalore for a coastal general cargo ship of 8,000 GRT

**Estimated total before GST: INR 1,65,780.80**

- Port dues: INR 53,260.80
- Pilotage: INR 1,12,520.00

The ship’s **GRT** (gross register tonnage, a measure of its enclosed volume) is 8,000. I assumed a standard arrival and departure, and that the ship is not calling under a concession. The pilotage charge includes tugs and mooring for those movements.

Rates are from New Mangalore’s schedule effective 1 May 2026 to 30 April 2027, checked 25 October 2026.

## anchorage-chennai

> What's the anchorage charge at Chennai for a 30,000 GRT bulk ship if it waits 72 hours?

The anchorage charge is **USD 907.20 before GST** for 72 hours.

The first 48 hours are free. The remaining charge is based on 30,000 GRT for 24 hours. I assumed the ship is foreign-going. Chennai’s tariff says the fee does not apply if the ship is ready in all respects and waiting for a berth, or if it is anchored for the port’s convenience.

Source: *Chennai Port Authority revised Scale of Rates*, section 2.3.4, page 15.

## fleet-autofill

> Port costs for MV Ocean Star at Paradip, 24 hours alongside

**Estimated total before GST: USD 43,773.93.**

This estimate uses the saved fleet particulars for MV Ocean Star: **32,450 GRT**, foreign-going, bulk carrier. GRT is the measure used for the ship’s port charges. The fleet details differ from the particulars in your message; the estimate used the saved details.

Assumptions: Paradip call on **26 October 2026**, **24 hours alongside**, and 2 movements (arrival and departure). Pilotage, towage and mooring are combined in the tariff charge.

Anchorage, wharfage and other charges were not priced because they are not covered in the tariff held. The tariff converts USD charges to rupees using the RBI reference rate or, if unavailable, the SBI market buying rate; no rupee total is shown because no exchange rate was provided.

## fleet-save

> Please save our ship Sea Breeze: 12,000 GRT general cargo ship, IMO 9123456

Saved **Sea Breeze** to your fleet: IMO **9123456**, **12,000 GRT**, general cargo.

## company-docs

> What does our charter party say about laytime?

Your **Sample charter party 2026** says laytime is **72 running hours**, with **Sundays and holidays excepted**. If the allowed time is exceeded, demurrage is **USD 18,000 per day, pro rata**. (Clause 14, page 3)

The excerpt we have doesn’t state when laytime starts or mention despatch.

## agreed-rates

> Price a call at Hazira for a 30,000 GRT bulk ship for 24 hours, with our agreed rates

**Estimated total before GST:** USD 63,528.60 at the published rates.  
**With your agreed rate:** USD 62,133.24.

The agreed-rate total includes a 15% discount on berth hire. The estimate assumes a foreign-going bulk ship and includes arrival and departure pilotage, with tug charges included. Wharfage isn’t priced because it isn’t in the Hazira schedule we hold.

The fuel surcharge is based on a notice dated 1 October 2026; check for a newer notice before relying on it. How many hours will the ship wait at anchorage? The estimate may change if there is anchorage time.

## general-term

> What is pilotage, in simple words?

Pilotage is the service of a local expert, called a pilot, who guides a ship safely into or out of a port. The pilot advises the ship’s captain on local waters and navigation.

## fuel-surcharge-now

> How much is the fuel surcharge at Mundra right now?

Mundra’s fuel surcharge on pilotage is **USD 0.22696 per GRT**. GRT is the ship’s gross registered tonnage.

That rate is from the notice dated **1 October 2026** and was last checked on **25 October 2026**. Mundra usually revises it about twice a month, so it may have changed since then.

## rupees

> Give me the total in rupees at 84.5 per dollar for a 30,000 GT bulk ship at Mundra for 24 hours

**Estimated total before GST: ₹46,00,028.75.**

This is for a 30,000 GT bulk ship alongside at Mundra for 24 hours, converted at **₹84.5 per US dollar**. I assumed the ship is foreign-going and included one arrival and one departure movement. Pilotage includes tugs.

The estimate includes port dues, pilotage, fuel surcharge, mooring, berth hire and other listed port charges. The fuel surcharge is based on the notice dated 1 October 2026; check for a newer notice before relying on it.

## tariff-comparison

> Compare how JNPA and Mundra charge container ships

Here’s how the **published tariffs** charge foreign-going container ships. **GRT** (gross register tonnage) is the measure used for many ship charges; **pilotage** is the service of a local pilot guiding the ship.

| Charge | JNPA | Mundra |
|---|---|---|
| Port dues | USD 0.1558 per GRT | USD 0.024344 per GRT, with a USD 400 minimum |
| Pilotage / towage | Combined rate, from USD 0.3464 per GRT up to 30,000 GRT; higher bands apply above that | Pilotage includes 1 berthing and 1 unberthing, with rate bands and minimums; a fuel surcharge of USD 0.22696 per GRT also applies |
| Berth hire | Usually USD 0.0053 per GRT per started hour. **NSIGT and BMCT instead charge in rupees** at INR 2.0476 and INR 2.378 per GRT per started hour | USD 0.011584 per GRT per hour, with a minimum of USD 810 per day |
| Other listed charges | Anchorage: USD 0.0026 per GRT per started hour | Mooring and sustainability charges apply; an environment, safety and dredging charge applies at MICT container berths |
| Terminal variation | Berth-hire rate depends on the JNPA terminal | Mundra rates and some charges depend on terminal or call type |

**The main differences:** Mundra lists separate mooring, sustainability and pilotage fuel-surcharge charges. JNPA’s pilotage and towage are combined. At JNPA, the berth-hire currency and rate depend on the terminal. At Mundra, the environment charge applies to MICT container berths, but not to container ships at other container terminals.

This is a tariff comparison, not a cost comparison: no meaningful total or “cheaper port” ranking is available without the ship’s GRT, the terminal, and time alongside. For Mundra, the current fuel-surcharge rate is from the circular effective **1 October 2026**; the tariff schedules were checked **25 October 2026**.

## kamarajar-container

> Kamarajar charges for a 50,000 GT container ship, 20 hours alongside

**Estimated total before GST: USD 75,710.00.**

This estimate is for a 50,000 GT container ship alongside for 20 hours at Kamarajar. It includes port dues (USD 15,900), pilotage and towage (USD 39,410), and berth hire (USD 20,400).

I assumed a foreign-going ship and one arrival and one departure. Pilotage, towage and mooring are combined in the charge shown. Anchorage, wharfage and other charges were not priced.

**Rate notice:** The berth-hire figure uses Adani Ennore Container Terminal’s published 2026–27 reference tariff, which is a ceiling; the terminal may charge less. The port’s consolidated rate schedule may also be out of date: no 2026 revision was found.

## cheapest-small

> What's cheaper for a 15,000 GRT general cargo ship staying 12 hours: Jaigarh or Pipavav?

**I can’t reliably say which is cheaper yet.** Jaigarh’s estimate is incomplete because its tariff depends on the berth used.

- **Jaigarh:** USD 675 before GST, including mooring and the port environment and safety charge. I still need the berth type.
- **Pipavav:** USD 13,800 before GST. Berth hire is not priced for a foreign-going general cargo ship under the schedule.

Both estimates assume arrival and departure movements. Tell me which berth the ship would use at Jaigarh, and I can compare the totals.

## lng-mundra

> LNG carrier of 90,000 GT at Mundra for 2 days, what are the charges?

**Estimated total before GST: USD 171,179.99.**

This is for a 90,000 GT LNG carrier alongside at Mundra for 2 days. GRT is the ship’s registered tonnage used in many port tariffs. The estimate includes port dues, pilotage, berth hire and listed port charges.

Assumptions: foreign-going ship, 2 movements (arrival and departure), and no anchorage waiting time. The total is incomplete if the vessel will wait at anchorage.

Towage, mooring and wharfage are not included because the tariff we have does not provide a price for them. The fuel surcharge is based on the notice dated 1 October 2026 and may have changed; check the latest notice before relying on it.

## vlcc-chennai

> How much would a VLCC of 160,000 GT pay in berth hire at Chennai for a day?

**Berth hire for 24 hours: USD 30,720 before GST.**

This uses Chennai’s published rate of **USD 0.0080 per GRT per hour** for a foreign-going VLCC. The estimate assumes 2 movements—arrival and departure. The rate schedule was checked on 25 October 2026.

## freshness-mumbai

> Are your Mumbai rates up to date?

Yes. Mumbai’s foreign-going rates are based on the schedule effective from 1 May 2026, and were last checked on 25 October 2026. The berth-hire rates include an indexed update effective from 9 May 2026.
