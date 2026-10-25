# Everyday questions: openai/gpt-6-luna, 2026-10-25

30 of 30 answers passed every automatic check. Cost of this run: about US$ 0.0361 from token counts (OpenRouter showed US$ 0.9184 spent of the US$ 9 limit when the run ended; its figure can lag).

Sample data used: one saved ship (MV Ocean Star), one charter-party passage and a 15% berth-hire discount at Hazira. Figures below come from the rule book; nothing was sent to anyone.

| Question | Tools | Checks | Steps | Seconds |
|---|---|---|---|---|
| estimate-paradip | estimate_port_call | pass | 2 | 5 |
| estimate-mundra-tanker | estimate_port_call | pass | 2 | 6 |
| voyage | estimate_port_call | pass | 2 | 5 |
| compare-berth-hire | compare_ports, list_ports | pass | 2 | 3 |
| compare-whole-bill | compare_ports, calculate | pass | 6 | 11 |
| tariff-hazira-pilotage | port_tariff | pass | 2 | 4 |
| what-changed-paradip | port_tariff, search_port_documents | pass | 3 | 5 |
| coverage | list_ports | pass | 2 | 5 |
| draft-chennai | search_port_documents | pass | 2 | 4 |
| documents-mundra | search_port_documents | pass | 2 | 5 |
| pilotage-compulsory-mumbai | search_port_documents | pass | 2 | 3 |
| night-pipavav | search_port_documents | pass | 2 | 5 |
| unsupported-port | estimate_port_call | pass | 2 | 3 |
| pilotage-jnpa | estimate_port_call | pass | 2 | 6 |
| kandla-tanker | estimate_port_call | pass | 2 | 5 |
| coastal-nmpa | estimate_port_call | pass | 2 | 4 |
| anchorage-chennai | estimate_port_call | pass | 2 | 4 |
| fleet-autofill | estimate_port_call | pass | 2 | 4 |
| fleet-save | save_ship | pass | 2 | 3 |
| company-docs | search_company_documents | pass | 2 | 3 |
| agreed-rates | estimate_port_call | pass | 2 | 5 |
| general-term | none | pass | 1 | 1 |
| fuel-surcharge-now | port_tariff | pass | 2 | 3 |
| rupees | estimate_port_call | pass | 2 | 5 |
| tariff-comparison | compare_ports | pass | 2 | 6 |
| kamarajar-container | estimate_port_call | pass | 2 | 6 |
| cheapest-small | compare_ports | pass | 2 | 4 |
| lng-mundra | estimate_port_call | pass | 2 | 5 |
| vlcc-chennai | estimate_port_call | pass | 2 | 5 |
| freshness-mumbai | port_tariff | pass | 2 | 3 |

## estimate-paradip

> What will it cost to berth a 32,000 GT bulk carrier at Paradip for 2 days?

**Estimated total before GST: USD 46,315.02.**

This is for a 32,000 GT bulk carrier alongside Paradip for 48 hours. It includes port dues, pilotage and towage, and berth hire. The tariff groups mooring with pilotage and towage.

I assumed the ship is foreign-going and that the call includes arrival and departure movements. The estimate uses Paradip’s schedule effective 10 October 2026. The tariff converts USD charges to rupees using the applicable RBI reference rate, or the SBI market buying rate if the RBI rate is unavailable; no rupee total is available here.

Anchorage and cargo wharfage are not included. Wharfage rates are not in the rule book we hold.

## estimate-mundra-tanker

> port charges at mundra for a 45k grt tanker staying 30 hrs

**Estimated port charges: USD 84,685.00 before GST.**

This assumes a foreign-going tanker of 45,000 GRT, 30 hours alongside, and 2 movements: arrival and departure. Pilotage includes tugs. GRT means gross register tonnage; pilotage is the service guiding the ship in and out of port.

Wharfage (cargo charges) isn’t included because it isn’t covered in the tariff information available. Anchorage time is also unknown, so anchorage charges aren’t included. How many hours will the ship wait at anchorage?

The fuel surcharge used is from the notice dated 1 October 2026; check for a newer notice before relying on the estimate.

## voyage

> We're sailing from Mundra to Chennai with a 40,000 GRT bulk ship, about a day alongside at each. What will the port costs come to in total?

**Estimated total before GST: USD 131,580.28** for both port calls.

- **Mundra:** USD 72,584.28
- **Chennai:** USD 58,996.00

The estimate assumes a foreign-going bulk ship, **40,000 GRT** (gross registered tonnage), and **24 hours alongside at each port**. It also assumes 2 movements at each port: arrival and departure. At Mundra, pilotage includes tugs.

**Not included:** wharfage (cargo charges) at either port. Chennai’s available schedule does not include towage or mooring charges. Anchorage time is unknown, so any anchorage charges are not included.

Mundra’s pilotage fuel surcharge is based on a notice dated 1 October 2026 and may have changed. The estimate uses USD throughout; it does not convert the total to rupees.

How many hours will the ship wait at anchorage at each port?

## compare-berth-hire

> Compare berth hire at Mumbai and JNPA for a 25,000 GT container ship staying 18 hours

I can’t price berth hire yet, so I can’t say which is cheaper.

Please tell me:
- **Mumbai:** which berth—Indira Dock, Ballard Pier, or Prince’s and Victoria Docks?
- **JNPA:** which terminal—GTI, NSIGT, NSICT, NSFT, BMCT, or JSW JNPT Liquid Terminal?

I assumed a foreign-going ship and 2 movements (arrival and departure).

## compare-whole-bill

> Which is cheaper overall for a 30,000 GRT bulk carrier staying 24 hours: Kattupalli, Chennai or Kamarajar?

**Chennai is cheapest overall** on the comparison, using the tool’s assumed exchange rate of **₹84 per US$** to convert Kattupalli’s rupee charges.

- **Chennai:** US$35,760.00 before GST
- **Kamarajar:** US$37,620.00 before GST
- **Kattupalli:** US$34,017.30 + ₹343,200 before GST, equivalent to about **US$38,103.01** at that rate

Assumptions: foreign-going bulk carrier; 24 hours alongside; 2 movements (arrival and departure). Kattupalli’s rupee port dues and surcharge are payable separately in rupees. The comparison included published standard charges; Kattupalli’s estimate also lists mooring and other charges, while these were not separately listed for Chennai or Kamarajar. Cargo-related wharfage is not included.

## tariff-hazira-pilotage

> How does Hazira charge pilotage?

Hazira charges **pilotage together with tug services**. It covers **1 berthing and 1 unberthing**, including all tug charges. The rate is **USD 1.45331 per GRT**, subject to a minimum based on the ship’s GRT band:

- Up to 3,000 GRT: minimum **USD 6,000**
- Over 3,000 to 15,000 GRT: minimum **USD 14,500**
- Over 15,000 GRT: minimum **USD 25,300**

There is also a separate **pilotage fuel surcharge** of **USD 0.225070 per GRT**. That rate took effect on 1 October 2026 and is reviewed about twice a month; check the latest notice before relying on it. LNG ships are exempt from this surcharge.

Source: *Adani Hazira Port Berthing Policy and Tariff Structure*, page 26; fuel surcharge circular dated 1 October 2026, page 1.

## what-changed-paradip

> What changed in Paradip's port charges this year?

Paradip’s new **Scale of Rates took effect on 10 October 2026**, replacing the schedule in force from 1 May to 9 October 2026. The port-tariff record shows increases to 3 main ship charges:

- **Port dues:** from **US$0.34 to US$0.408 per GRT**.
- **Pilotage and towage:** the per-GRT rates and band amounts increased. For example, up to 30,000 GRT, the rate went from **US$0.7148 to US$0.8578 per GRT**. The new schedule also specifies a **US$858 minimum**.
- **Berth hire:** from **US$0.003338 to US$0.004006 per GRT per hour**.

GRT means gross register tonnage, a measure of a vessel’s size. The new schedule was checked on **25 October 2026**. Those figures are for foreign-going vessels; coastal rates differ.

**Sources:** Paradip Port Authority Scale of Rates 2026, pages 17, 18 and 25. The tariff record compares it with the schedule effective from 1 May 2026.

## coverage

> Which ports do you cover?

We cover these **12 ports**:

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

Coverage varies by port and charge. Tell me which port or ports you’re interested in, and I can check the specific rates or rules we have.

## draft-chennai

> What's the permissible draft at Chennai's berths?

Chennai’s permissible draft varies by berth. The listed limits range from **8.50 m to 16.50 m**.

- **Dr. Ambedkar Dock:** 8.50–15.00 m
- **Jawahar Dock:** 12.50–14.00 m
- **Bharathi Dock:** 9.00–16.50 m

Some berths have special conditions—for example, a higher limit at high water or a reduced limit depending on vessel length. The figures are from Chennai Port Authority’s *Berth Details – Permissible Draft at Berths as on 01.01.2026*, page 1. Tell me the berth name and I can give its specific limit and any remarks.

## documents-mundra

> What documents do I need to submit before arriving at Mundra?

Mundra’s procedure asks the agent to upload the vessel declaration documents in APMS (the port’s vessel-management system). The list depends on the vessel and cargo.

**For all vessel declarations, the listed documents include:**
- Berthing application (MAR/F/003)
- Vessel and cargo particulars, Part A (MAR/F/011)
- Vessel acceptance navigational checklist, Part B
- International Tonnage Certificate and ship particulars
- International Air Pollution Prevention (IAPP) Certificate
- P&I certificate and Liability for the Removal of Wrecks Certificate
- Documents of Compliance and ISM Safety Management Certificate
- Civil Liability Convention (CLC) 1992 Certificate and Civil Liability for Bunker Oil Pollution Damage Certificate
- International Ship Security Certificate and International Oil Pollution Prevention (IOPP) Certificate
- Load Line, Safety Equipment, Safety Construction and Safety Radio certificates
- Ship Sanitation Control Exemption and Ballast Water Management System certificate
- Agency appointment letter and letter of appointment from the owner/operator
- Pre-arrival notices required under the ISPS Code
- Certificate of Class, Certificate of Registry and Safe Manning Certificate

If the vessel is calling Mundra for the first time, the procedure also calls for a vessel definition in APMS, including ship particulars, the International Tonnage Certificate, Class Society Certificate and Ship Registry Certificate. The port must approve the definition before the voyage request can proceed. **VCN issuance may be held up if required vessel details or certificates are missing.**

**Additional items depend on the call:**
- **IGM:** submit to the Port Operations Center before arrival.
- **Vessel aged 25 years:** GMB clearance is listed.
- **Liquid tanker aged over 20 years:** CAP and IOPP certificates for hull, machinery and cargo equipment are listed.
- **Bulk or break-bulk cargo:** cargo-related documents may be required, such as a stowage plan, loading/discharge sequence or cargo-specific clearances.
- **Liquid cargo:** stowage plan, temperature report for heated cargo, pre-arrival exchange information checklist and heating instructions are listed.

The port procedure also says to obtain official acceptance before fixing the vessel at Mundra. It does not make every item applicable to every call, so your vessel type, cargo and age determine the extra requirements.

**Source:** *Standard procedure for vessel declaration, submission of Pre-arrival documentation and NDC at APSEZL, Mundra*, pages 1–2.

## pilotage-compulsory-mumbai

> Is pilotage compulsory in Mumbai?

Yes. Mumbai Port Authority says pilotage—using a port pilot to guide a ship—is compulsory for ships of **100 tons net tonnage or more**, both entering and leaving the harbour. Source: *Pilotage*, page 1.

## night-pipavav

> Can ships enter Pipavav at night?

Yes. Pipavav generally allows ships to navigate and berth at night, but movements depend on the vessel and conditions.

The port’s safety memo says dry-cargo and container vessels can berth day or night, subject to a tidal window and other movement restrictions. The port’s website says night navigation is available to all vessels except LPG vessels, which are daytime-only. Pilotage is mandatory. **Sources:** *SAFE MEMO – PIPAVAV PORT – INDIA*, pages 1–2 (2 September 2025); APM Terminals Pipavav, *Our Port*, page 1.

So, if the ship is an LPG vessel, it cannot enter at night. For other vessels, the exact timing may depend on the tide, draft, vessel type and condition, and port instructions.

## unsupported-port

> What would a call at Colombo cost for a 20,000 GT ship?

Colombo isn’t a port covered by Berthwise, so I can’t price the call. We cover selected Indian ports, including Mumbai, Chennai, Mundra and Kandla.

## pilotage-jnpa

> How much is pilotage for a 10000 GT ship at JNPA?

JNPA’s published charge is **USD 3,464 before GST** for a 10,000 GT ship. The tariff combines pilotage and towage; it covers 1 inward and 1 outward movement.

I assumed a foreign-going container ship. The rate is from JNPA’s Scale of Rates effective 1 May 2026, page 3.

## kandla-tanker

> berth hire at kandla for a 20k GT liquid tanker, 36 hours

**Berth hire: USD 6,048 before GST.**

Assumptions: foreign-going tanker, using Kandla’s liquid-cargo berth, with arrival and departure movements. The rate is based on 20,000 GRT for 36 hours. GRT means gross register tonnage.

The rate schedule allows a different charge if port shore cranes are used or the ship is double-banked. Source: Deendayal Port Authority SOR, page 10, escalated schedule effective 1 May 2026.

## coastal-nmpa

> Estimate port dues and pilotage at New Mangalore for a coastal general cargo ship of 8,000 GRT

**Estimated total before GST: INR 1,65,780.80**

- Port dues: **INR 53,260.80**
- Pilotage: **INR 1,12,520.00**

This is for a coastal general cargo ship of **8,000 GRT**. GRT is a measure of a ship’s internal volume. I assumed a standard call with arrival and departure movements. The pilotage rate also includes tugs and mooring.

Rates are from New Mangalore Port Authority’s indexed Scale of Rates, effective **1 May 2026 to 30 April 2027**, checked **25 October 2026**. GST is not included.

## anchorage-chennai

> What's the anchorage charge at Chennai for a 30,000 GRT bulk ship if it waits 72 hours?

The anchorage charge is **USD 907.20 before GST**. The first **48 hours** are free; the charge covers the remaining **24 hours**.

This assumes the ship is foreign-going. No rupee equivalent is available without an exchange rate. The charge does not apply if the ship is ready in all respects and waiting for a berth, or if it is anchored for the port’s convenience.

Source: Chennai Port Authority revised Scale of Rates, section 2.3.4, page 15.

## fleet-autofill

> Port costs for MV Ocean Star at Paradip, 24 hours alongside

**Estimated total before GST: USD 43,773.93.**

This estimate uses MV Ocean Star’s saved particulars: a foreign-going bulk ship of 32,450 GRT. It assumes a standard call at Paradip, 24 hours alongside, and arrival and departure movements. Pilotage, towage and mooring are bundled together in the tariff.

Anchorage charges and wharfage are not included; the Paradip tariff information we hold does not price them. The estimate uses Paradip’s schedule effective 10 October 2026.

## fleet-save

> Please save our ship Sea Breeze: 12,000 GRT general cargo ship, IMO 9123456

Saved **Sea Breeze** to your fleet: IMO **9123456**, **12,000 GRT**, general cargo.

## company-docs

> What does our charter party say about laytime?

Your **Sample charter party 2026** says laytime is **72 running hours**, with Sundays and holidays excluded. It also sets demurrage at **USD 18,000 per day, pro rata**. (Clause 14, page 3)

## agreed-rates

> Price a call at Hazira for a 30,000 GRT bulk ship for 24 hours, with our agreed rates

**Estimated total before GST:** USD 63,528.60 at Adani Hazira Port.  
**With your agreed berth-hire rate:** USD 62,133.24.

The estimate assumes a foreign-going bulk ship and includes arrival and departure movements. It assumes 24 hours alongside. Pilotage includes tugs. Your agreed rate is a 15% discount on berth hire.

**Not included:** Wharfage, because Hazira cargo charges aren’t in the tariff data we hold. Anchorage charges are also not included; the estimate needs your anchorage waiting time.

The pilotage fuel surcharge is based on the notice dated 1 October 2026 and may have changed.

## general-term

> What is pilotage, in simple words?

Pilotage is a service where a local expert pilot guides a ship safely into or out of port. The pilot advises the ship’s captain on the local waters, channels and traffic.

## fuel-surcharge-now

> How much is the fuel surcharge at Mundra right now?

Mundra’s fuel surcharge on pilotage is **USD 0.22696 per GRT**. It applies to all ships calling at Mundra, including LNG carriers.

That rate is from the **1 October 2026** notice, checked **25 October 2026**. The port usually revises it about twice a month, so check its latest notice before relying on it. GRT is the ship’s gross tonnage.

## rupees

> Give me the total in rupees at 84.5 per dollar for a 30,000 GT bulk ship at Mundra for 24 hours

**Estimated total: ₹46,00,028.75 before GST** at ₹84.5 per US dollar.

Assumptions: foreign-going bulk ship; 2 movements (arrival and departure); pilotage includes tugs. The estimate uses the fuel surcharge dated 1 October 2026, which may have changed—check the latest notice before relying on it.

## tariff-comparison

> Compare how JNPA and Mundra charge container ships

## Tariff comparison

**For a foreign-going container ship**, JNPA and Mundra publish different kinds of charges. The rates below are from schedules checked on **25 October 2026** and apply on **26 October 2026**.

| Charge | JNPA | Mundra |
|---|---|---|
| **Port dues** — charge for entering the port | **USD 0.1558 per GRT** | **USD 0.024344 per GRT**, minimum **USD 400** |
| **Pilotage** — pilot-assisted vessel movements | **Pilotage and towage together:** **USD 0.3464 per GRT** up to **30,000 GRT**; higher bands apply above that | **Pilotage with tugs:** rate depends on GRT, with minimum charges. A **USD 0.22696 per GRT** fuel surcharge also applies |
| **Berth hire** — time alongside | Usually **USD 0.0053 per GRT per started hour**. At **NSIGT** and **BMCT**, it is instead charged in rupees: **INR 2.0476** or **INR 2.378 per GRT per started hour**, respectively | **USD 0.011584 per GRT per hour**, with a minimum of **USD 810 per day** |
| **Other listed charges** | Anchorage: **USD 0.0026 per GRT per started hour** | Mooring, sustainability, and a container-terminal environment, safety and dredging charge may also apply. Anchorage is **USD 0.001343 per GRT per hour** |

**GRT** means gross register tonnage, a measure used in port tariffs. The full pilotage rate bands and conditions are in the cited schedules: JNPA’s *Scale of Rates w.e.f. 1 May 2026*, sections 2.1–2.3; and Mundra’s *Berthing Policy and Tariff Structure w.e.f. 15 June 2026*, sections IV.A–IV.J. Mundra’s pilotage fuel surcharge comes from its circular dated **1 October 2026**.

**Terminal matters:** JNPA berth-hire rates vary by terminal; the **NSIGT** and **BMCT** rupee rates are separate from the usual JNPA rate. At Mundra, the environment charge applies at **MICT container berths**, but not at its other container terminals. The tariff result does not give terminal-specific rules for all charges, so confirm the terminal before relying on a full call-cost comparison.

This compares **published rates, not total costs**: no ship tonnage or call duration was supplied, and the port charges are not identical in scope. **Wharfage (cargo charges) is not included** in these rate schedules.

## kamarajar-container

> Kamarajar charges for a 50,000 GT container ship, 20 hours alongside

**Estimated total before GST: USD 75,710.00**

This estimate assumes the ship is foreign-going and makes both an arrival and a departure. It includes **port dues** (USD 15,900.00), **pilotage and towage** (USD 39,410.00), and **berth hire** (USD 20,400.00) for 20 hours.

Berth hire uses Adani Ennore Container Terminal’s published reference tariff; the terminal may charge less. Mooring is included with pilotage and towage. Anchorage and cargo-related wharfage aren’t included. The port’s consolidated schedule may be out of date, so some rates could have changed. USD charges are converted to rupees using the applicable rate on the ship’s arrival date.

## cheapest-small

> What's cheaper for a 15,000 GRT general cargo ship staying 12 hours: Jaigarh or Pipavav?

The available figures suggest **Jaigarh may be cheaper**, but the totals aren’t comparable yet.

- **Jaigarh:** USD 675 before GST. This includes mooring and an environmental charge. The berth is needed to price the remaining charges.
- **Pipavav:** USD 13,800 before GST. This includes port dues, pilotage and towage, mooring, and a sustainability charge. Berth hire isn’t priced for a foreign general cargo ship in the schedule.

I assumed a foreign-going ship and 2 movements, arrival and departure. **Which berth will the ship use at Jaigarh?** The available Jaigarh berth options don’t clearly match a general cargo ship.

## lng-mundra

> LNG carrier of 90,000 GT at Mundra for 2 days, what are the charges?

**Estimated total: USD 171,179.99 before GST.**

This is for an LNG carrier of 90,000 GT alongside at Mundra for 2 days. GT means gross tonnage. The estimate includes port dues, pilotage, the pilotage fuel surcharge, berth hire, and other listed port charges.

I assumed the ship is foreign-going and that the call includes arrival and departure movements. Towage and mooring are not included because the schedule we hold does not price them for this call. Wharfage is also excluded; cargo details were not provided, and cargo charges are not in the rule book we hold.

The estimate uses the fuel surcharge notice effective 1 October 2026. Mundra may revise that surcharge, so check the latest notice before relying on the estimate. How long will the ship wait at anchorage?

## vlcc-chennai

> How much would a VLCC of 160,000 GT pay in berth hire at Chennai for a day?

**Berth hire: USD 30,720 before GST** for 24 hours at Chennai.

This uses the foreign-going rate for a 160,000 GRT ship: 160,000 GRT × USD 0.0080 × 24 hours. The schedule counts each started time period. Source: *Tamil Nadu Government Gazette, Chennai Port Authority revised Scale of Rates*, page 13, section 2.3.1.

I assumed the ship is foreign-going. The estimate also assumes 2 movements, arrival and departure. The tariff’s USD charge is converted to rupees for collection at the applicable RBI reference rate (or SBI market buying rate if unavailable); no exchange rate was provided, so the rupee amount isn’t shown.

## freshness-mumbai

> Are your Mumbai rates up to date?

Yes. Mumbai Port Authority’s published schedule is current for **1 May 2026 to 30 April 2027**. It was last checked on **25 October 2026**.

The berth-hire rates include the indexation effective **9 May 2026**. The tariff notes that dollar-denominated charges are converted to rupees using the applicable bank rate on the day the vessel enters port limits.
