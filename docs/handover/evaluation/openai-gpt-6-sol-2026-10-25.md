# Everyday questions: openai/gpt-6-sol, 2026-10-25

30 of 30 answers passed every automatic check. Cost of this run: about US$ 0.6242 from token counts (OpenRouter showed US$ 1.3433 spent of the US$ 9 limit when the run ended; its figure can lag).

Sample data used: one saved ship (MV Ocean Star), one charter-party passage and a 15% berth-hire discount at Hazira. Figures below come from the rule book; nothing was sent to anyone.

| Question | Tools | Checks | Steps | Seconds |
|---|---|---|---|---|
| estimate-paradip | calculate, estimate_port_call | pass | 3 | 9 |
| estimate-mundra-tanker | estimate_port_call | pass | 2 | 7 |
| voyage | estimate_port_call | pass | 2 | 9 |
| compare-berth-hire | compare_ports | pass | 2 | 6 |
| compare-whole-bill | compare_ports | pass | 2 | 5 |
| tariff-hazira-pilotage | search_port_documents | pass | 2 | 6 |
| what-changed-paradip | port_tariff | pass | 2 | 5 |
| coverage | list_ports | pass | 2 | 5 |
| draft-chennai | search_port_documents | pass | 2 | 8 |
| documents-mundra | search_port_documents | pass | 2 | 7 |
| pilotage-compulsory-mumbai | search_port_documents | pass | 2 | 5 |
| night-pipavav | search_port_documents | pass | 2 | 5 |
| unsupported-port | estimate_port_call | pass | 2 | 5 |
| pilotage-jnpa | estimate_port_call | pass | 2 | 6 |
| kandla-tanker | estimate_port_call | pass | 2 | 5 |
| coastal-nmpa | estimate_port_call | pass | 2 | 6 |
| anchorage-chennai | estimate_port_call | pass | 2 | 6 |
| fleet-autofill | estimate_port_call | pass | 2 | 6 |
| fleet-save | save_ship | pass | 2 | 4 |
| company-docs | search_company_documents | pass | 2 | 5 |
| agreed-rates | estimate_port_call, search_company_documents | pass | 2 | 7 |
| general-term | none | pass | 1 | 2 |
| fuel-surcharge-now | search_port_documents | pass | 2 | 5 |
| rupees | estimate_port_call | pass | 2 | 6 |
| tariff-comparison | compare_ports | pass | 2 | 7 |
| kamarajar-container | estimate_port_call | pass | 2 | 7 |
| cheapest-small | compare_ports | pass | 2 | 5 |
| lng-mundra | estimate_port_call | pass | 2 | 6 |
| vlcc-chennai | estimate_port_call | pass | 2 | 5 |
| freshness-mumbai | port_tariff | pass | 2 | 6 |

## estimate-paradip

> What will it cost to berth a 32,000 GT bulk carrier at Paradip for 2 days?

The estimated **whole port-call bill at Paradip is USD 46,315.02 before GST** for a 32,000 GT bulk carrier alongside for 2 days. That includes port dues, berth hire, and pilotage and towage for arrival and departure.

I assumed the ship is **foreign-going**. If it is trading coastally, the estimate may change. Anchorage, other charges, and cargo-handling charges (wharfage) are not included because they are not priced in the rate schedule we hold.

## estimate-mundra-tanker

> port charges at mundra for a 45k grt tanker staying 30 hrs

The estimated **Mundra port-call charge is USD 84,685.00 before GST** for a 45,000 GRT tanker alongside for 30 hours. GRT is the ship’s gross tonnage, a measure of its enclosed volume.

This assumes a foreign-going tanker, with 1 arrival and 1 departure. The estimate includes berth hire, port dues, pilotage (the port pilot’s service), tugs and other standard marine charges. **Wharfage**, a cargo-handling charge, is not included because it is not in the rule book.

The pilotage fuel surcharge uses a notice dated 1 October 2026. Mundra revises it regularly, so check the latest notice before relying on the total.

**Will the tanker wait at anchorage?** If so, how many hours?

## voyage

> We're sailing from Mundra to Chennai with a 40,000 GRT bulk ship, about a day alongside at each. What will the port costs come to in total?

**Estimated port costs: USD 129,580.28 before GST** for the Mundra departure and Chennai arrival together.

- Mundra: USD 70,584.28
- Chennai: USD 58,996.00

I used your 40,000 GRT bulk ship and assumed about 24 hours alongside at each port. GRT is a measure of the ship’s enclosed volume used to set some port charges. The estimate also assumes a foreign-going ship and arrival and departure movements at each port.

**The total is incomplete:** Chennai towage and mooring were not priced because they are not in the rate schedule we hold. Mundra’s pilotage charge includes tugs, but its fuel surcharge can change; the estimate uses the notice dated 1 October 2026.

## compare-berth-hire

> Compare berth hire at Mumbai and JNPA for a 25,000 GT container ship staying 18 hours

I can’t price or compare the berth hire yet. Mumbai’s rate depends on the berth, and JNPA’s depends on the terminal. The comparison card has no totals before GST, so neither port can be ranked.

Which **Mumbai berth** and **JNPA terminal** should I use? I’ve used your 25,000 GT container ship and 18 hours alongside; the comparison assumed it is foreign-going.

## compare-whole-bill

> Which is cheaper overall for a 30,000 GRT bulk carrier staying 24 hours: Kattupalli, Chennai or Kamarajar?

I can’t say which port is cheapest overall without a USD-to-INR exchange rate. Kattupalli’s bill is in both currencies, so it cannot be ranked against the other 2 totals as shown.

| Port | Estimated total before GST |
|---|---:|
| Kattupalli | USD 34,017.30 **plus** INR 3,43,200.00 |
| Chennai | USD 35,760.00 |
| Kamarajar | USD 37,620.00 |

The estimates assume a foreign-going bulk carrier, 24 hours alongside, and arrival and departure movements. No cargo-handling charges are included. If you give me a USD-to-INR exchange rate, I can rank all 3.

## tariff-hazira-pilotage

> How does Hazira charge pilotage?

Hazira charges **pilotage**—the service that guides a ship into and out of port—by the ship’s **GRT** (gross registered tonnage, a measure of its enclosed volume). The published pilotage charge includes 1 berthing and 1 unberthing, with tug charges included. [Adani Hazira Port Berthing Policy and Tariff Structure, p. 26](https://www.adaniports.com/-/media/project/ports/portsandterminals/hazira-port-documents/tariff/bpts_hazira_issue-03_rev-14_oct-2026.pdf)

| Vessel | Pilotage charge |
|---|---|
| LNG | USD 0.6691 per GRT |
| Container | USD 1.18566 per GRT; minimum USD 11,260 |
| Other vessels, including tankers and dry cargo, up to 3,000 GRT | Minimum USD 6,000 |
| Other vessels, 3,001–15,000 GRT | USD 1.45331 per GRT; minimum USD 14,500 |
| Other vessels, 15,001 GRT and above | USD 1.45331 per GRT; minimum USD 25,300 |

The rate and minimums are from the tariff’s pilotage table. [Adani Hazira Port Berthing Policy and Tariff Structure, p. 26](https://www.adaniports.com/-/media/project/ports/portsandterminals/hazira-port-documents/tariff/bpts_hazira_issue-03_rev-14_oct-2026.pdf)

A **fuel surcharge on pilotage** also applies. Hazira’s circular sets it at **USD 0.225070 per GT**, effective **1 October 2026**. [Hazira fuel surcharge on pilotage circular, p. 1](https://www.adaniports.com/-/media/project/ports/portsandterminals/hazira-port-documents/trade-notice/fs_hazira_dtd_01-10-2026.pdf)

## what-changed-paradip

> What changed in Paradip's port charges this year?

Paradip introduced a new Scale of Rates effective **10 October 2026**. Compared with the schedule in force from **1 May 2026**, the main foreign-going ship charges changed as follows:

| Charge | Earlier rate | Current rate |
|---|---:|---:|
| Port dues | USD 0.34 per GRT | USD 0.408 per GRT |
| Pilotage and towage, up to 30,000 GRT | USD 0.7148 per GRT | USD 0.8578 per GRT |
| Berth hire | USD 0.003338 per GRT per hour | USD 0.004006 per GRT per hour |

**GRT** means gross tonnage, a measure of a ship’s enclosed volume. *Pilotage* is the service of guiding a ship into or out of port; Paradip’s listed charge combines it with towage. The pilotage-and-towage rates also changed for ships above 30,000 GRT, with different rates by size band.

These are **foreign-going rates**, not a quote for a particular ship. The rates were last checked on **25 October 2026**. Source: *Paradip Port Authority Scale of Rates 2026*, §§2.1.1, 2.2.1 and 2.3.1, pp. 17, 18 and 25.

## coverage

> Which ports do you cover?

I cover these Indian ports:

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

I can estimate standard port-call charges and compare these ports, though some terminals and charges have gaps in coverage. Tell me the port or route you’re considering, and I’ll flag any gaps that matter.

## draft-chennai

> What's the permissible draft at Chennai's berths?

Chennai’s published **permissible draft** varies by berth. The figures below are in metres, from the port’s berth list dated 01 January 2026. [Chennai Port Authority, *Berth Details*, p. 1](https://www.chennaiport.gov.in/cargo-facilities)

| Dock | Berth | Permissible draft |
|---|---|---:|
| Dr. Ambedkar | 19A North Quay | 8.50 m |
| | 18A West Quay 1 | 11.00 m |
| | 17A West Quay 2; 16A Centre Berth; 15A West Quay III | 12.00 m |
| | 14A West Quay IV | 11.00 m* |
| | 13A South Quay 1; 6A South Quay II | 9.50 m |
| | 5A, 4A, 3A CITPL | 15.00 m† |
| Jawahar | 12J J.D.-1; 09J J.D.-6 | 12.50 m‡ |
| | 11J J.D.-3; 10J J.D.-5 | 13.00 m |
| | 07J J.D.-2; 08J J.D.-4 | 14.00 m |
| Bharathi | 26B Bharathi Dock 1 | 14.60 m |
| | 24B Bharathi Dock II; 27B Bharathi Dock III | 16.50 m§ |
| | 20B, 21B, 22B CCTPL | 13.40 m |
| | 23B CCTPL | 15.00 m |
| | 01B Coastal Berth 1; 02B Coastal Berth 2 | 11.00 m; 10.00 m, respectively |
| | Bunker Berth | 9.00 m |

\* The port adds a location-specific note for 14A: **11 m up to 795 m; 9.5 m up to 810 m**.  
† For the CITPL berths, the port notes **port side alongside from 12.5 m draft onwards**.  
‡ The port notes **13.0 m during high water** at 09J.  
§ The port notes **17.0 m during high water** at 27B. [Chennai Port Authority, *Berth Details*, p. 1](https://www.chennaiport.gov.in/cargo-facilities)

## documents-mundra

> What documents do I need to submit before arriving at Mundra?

For a vessel arriving at **Mundra**, your agent should obtain the port’s official vessel acceptance and submit the vessel declaration through APMS/IPOS. If this is the vessel’s first call, the agent must first create its vessel record and upload the ship particulars, International Tonnage Certificate, class certificate and Certificate of Registry. The port says a voyage number will not be generated if the vessel record or required certificates are incomplete. [Mundra pre-arrival procedure, pp. 1–2](https://www.adaniports.com/-/media/project/ports/portsandterminals/mundra-documents/marine-documents/standard-procedure-for-vessel-declarations-ndc-and-submission-of-documents.pdf)

**For the voyage declaration, upload:**

- Berthing application; vessel and cargo particulars; and the vessel-acceptance navigational checklist.
- Ship particulars and certificates for tonnage, registry, class, load line, safety equipment, safety construction, safety radio, safe manning, security, air-pollution prevention, oil-pollution prevention, ballast-water management and ship sanitation.
- Document of Compliance, Safety Management Certificate, P&I insurance certificate, wreck-removal liability certificate, civil-liability certificates for oil and bunker pollution, and the owner’s or operator’s agency appointment letter. [Mundra pre-arrival procedure, pp. 1–2](https://www.adaniports.com/-/media/project/ports/portsandterminals/mundra-documents/marine-documents/standard-procedure-for-vessel-declarations-ndc-and-submission-of-documents.pdf)

Also send the required **pre-arrival notices at 5, 3, 2 and 1 days**, and submit the prior IGM to the Port Operations Centre **24 hours before arrival**. Additional documents apply to bulk, break-bulk and liquid-cargo vessels, and to vessels meeting the procedure’s age conditions. [Mundra pre-arrival procedure, p. 2](https://www.adaniports.com/-/media/project/ports/portsandterminals/mundra-documents/marine-documents/standard-procedure-for-vessel-declarations-ndc-and-submission-of-documents.pdf)

If you tell me the vessel and cargo type, I can narrow down the additional documents.

## pilotage-compulsory-mumbai

> Is pilotage compulsory in Mumbai?

Yes. At **Mumbai Port**, pilotage—having a port pilot guide the ship—is compulsory for ships of **100 net tons or more** entering or leaving the harbour. The document does not say whether smaller ships must use a pilot in other circumstances. [Mumbai Port Authority, *Pilotage*, p. 1](https://mumbaiport.gov.in/WriteReadData/RTF1984/1710398100.pdf)

## night-pipavav

> Can ships enter Pipavav at night?

Yes—**most ships can enter Pipavav at night**, subject to the port’s navigation and tidal restrictions. **LPG vessels are daytime-only**, according to the port’s *Our Port* page (p. 1).

For other vessels, the port’s *SAFE MEMO – PIPAVAV PORT – INDIA* says berthing can take place day or night, but the movement depends on the tidal window and the ship’s draft, size and condition. A pilot is mandatory for entry (pp. 1–2).

## unsupported-port

> What would a call at Colombo cost for a 20,000 GT ship?

I can’t estimate a Colombo call because Colombo isn’t covered by the port tariffs I have. I won’t substitute another port’s rates. Your ship’s 20,000 GT is noted, but I don’t have a reliable Colombo total before GST.

## pilotage-jnpa

> How much is pilotage for a 10000 GT ship at JNPA?

At JNPA, the published charge for a **10,000 GT ship** is **USD 3,464.00 before GST** for pilotage **and towage together**. It covers the inward and outward movements, including pilots, tugs and craft. The tariff does not give a separate pilotage-only price. (JNPA *Scale of Rates*, effective 1 May 2026, p. 3, §2.2 A.)

This assumes a foreign-going ship and normal arrival and departure movements.

## kandla-tanker

> berth hire at kandla for a 20k GT liquid tanker, 36 hours

**Berth hire at Kandla: USD 6,048.00 before GST** for a 20,000 GT liquid tanker alongside for 36 hours.

This assumes a foreign-going ship at a liquid-cargo berth, without port shore cranes. It is **berth hire only**, not the full port-call bill. The rate comes from Deendayal Port Authority’s escalated Schedule of Rates, p. 10.

## coastal-nmpa

> Estimate port dues and pilotage at New Mangalore for a coastal general cargo ship of 8,000 GRT

**Estimated port dues and pilotage at New Mangalore: ₹1,65,780.80 before GST.**

| Charge | Estimate |
|---|---:|
| Port dues | ₹53,260.80 |
| Pilotage, including tugs and mooring | ₹1,12,520.00 |

This uses the coastal general-cargo rate for **8,000 GRT**. GRT is the ship’s gross tonnage, a measure of its enclosed volume. The pilotage charge assumes an arrival and a departure. These are only the charges you asked for, not a full port-call bill.

Source: *New Mangalore Port Authority Indexed Scale of Rates*, effective 1 May 2026, pp. 17–18.

## anchorage-chennai

> What's the anchorage charge at Chennai for a 30,000 GRT bulk ship if it waits 72 hours?

The estimated **anchorage charge at Chennai is USD 907.20 before GST** for a 30,000 GRT bulk ship waiting 72 hours.

The tariff allows the first 48 hours free. The charge is for the remaining 24 hours. I assumed the ship is foreign-going.

**This charge may not apply** if the ship is ready in all respects and waiting for a berth, or is anchored for the port’s convenience. Is either the case here?

## fleet-autofill

> Port costs for MV Ocean Star at Paradip, 24 hours alongside

**Estimated port costs for MV Ocean Star at Paradip: USD 43,773.93 before GST** for 24 hours alongside.

I used Ocean Star’s saved particulars: a foreign-going bulk ship of 32,450 GRT (gross tonnage). The estimate assumes an arrival and a departure. It includes port dues, pilotage and towage, berth hire, and mooring, which is covered by the pilotage-and-towage charge.

Cargo charges (wharfage) are **not included** because they are not yet in the rule book.

## fleet-save

> Please save our ship Sea Breeze: 12,000 GRT general cargo ship, IMO 9123456

Saved **Sea Breeze** to your fleet with IMO **9123456**, **12,000 GRT** (gross tonnage), and ship type **general cargo**.

## company-docs

> What does our charter party say about laytime?

Your charter party allows **72 running hours of laytime**, with Sundays and holidays excluded. If laytime is exceeded, demurrage is **USD 18,000 per day, pro rata**. (*Sample charter party 2026*, p. 3, clause 14.)

The passage I found does not say when laytime starts or how notice of readiness is handled.

## agreed-rates

> Price a call at Hazira for a 30,000 GRT bulk ship for 24 hours, with our agreed rates

For a **30,000 GRT bulk ship alongside at Hazira for 24 hours**, the estimated port-call cost is **USD 62,133.24 before GST with your agreed berth-hire rate**, versus **USD 63,528.60 before GST at published rates**. GRT is the ship’s gross tonnage, used to calculate several charges.

I assumed a foreign-going ship, with arrival and departure movements. Pilotage—the service of guiding the ship in and out—includes tugs in this tariff.

**The total is incomplete.** I haven’t included anchorage because you didn’t say whether the ship will wait there, and wharfage (cargo-handling charges) isn’t in the rule book. The fuel surcharge used is from the 1 October 2026 notice and may have changed. Will the ship wait at anchorage?

## general-term

> What is pilotage, in simple words?

Pilotage is the service of a local marine expert guiding a ship into or out of port. The expert, called a pilot, knows the local channels, tides and hazards. The ship’s captain remains in command.

## fuel-surcharge-now

> How much is the fuel surcharge at Mundra right now?

Mundra’s **fuel surcharge on pilotage is USD 0.22696 per GT**, effective from 1 October 2026, according to the latest circular in the port documents we hold. GT means gross tonnage, a measure of a ship’s size. The surcharge is added to the regular pilotage charge, not charged instead of it. [Mundra fuel surcharge on pilotage circular, 1 October 2026, p. 1](https://www.adaniports.com/-/media/project/ports/portsandterminals/mundra-documents/trade-notices/fs_mundra_dtd_01-10-2026.pdf)

The circular says this rate can change with fuel prices, so confirm the latest trade notice before billing.

## rupees

> Give me the total in rupees at 84.5 per dollar for a 30,000 GT bulk ship at Mundra for 24 hours

**Estimated Mundra port-call cost: ₹46,00,028.75 before GST**, using your rate of ₹84.5 per US dollar.

This assumes a foreign-going bulk ship of 30,000 GT (gross tonnage), 24 hours alongside, and arrival and departure. It includes pilotage (a pilot guiding the ship) and tugs.

The total is **incomplete**: cargo charges (wharfage) are not in our rule book, and any anchorage waiting has not been priced. The fuel surcharge used is from 1 October 2026 and may have changed. Will the ship wait at anchorage?

## tariff-comparison

> Compare how JNPA and Mundra charge container ships

**JNPA and Mundra charge container ships differently.** JNPA’s berth-hire rate depends on the container terminal; Mundra uses a general berth-hire rate and adds several separate vessel charges. This is a comparison of published tariffs, **not a priced call**, so it does not establish which port would be cheaper.

| Charge | JNPA | Mundra |
|---|---|---|
| Port dues | USD 0.1558 per GRT | USD 0.024344 per GRT; minimum USD 400 |
| Pilotage and tugs | Combined charge, with rates that change by ship-size band | Combined charge, with rates and minimums that change by ship-size band; a separate fuel surcharge of USD 0.22696 per GRT |
| Berth hire | USD 0.0053 per GRT per started hour at GTI, NSICT and NSFT; INR 2.0476 at NSIGT or INR 2.378 at BMCT, on the same basis | USD 0.011584 per GRT per hour; minimum USD 810 per day |
| Other vessel charges | Anchorage, if used | Mooring, a sustainability charge, and anchorage if used. An environment-protection charge also applies at MICT, but not at Mundra’s other container terminals. |

*GRT* means gross tonnage, a measure of a ship’s overall size used to calculate these charges. *Pilotage* is the service of guiding a ship into or out of port.

I assumed a **foreign-going container ship**. The terminal matters at both ports, and the ship’s GRT and time alongside are needed to compare actual bills. Mundra’s pilotage fuel surcharge can change with fuel prices; the rate shown is from its circular dated 1 October 2026.

## kamarajar-container

> Kamarajar charges for a 50,000 GT container ship, 20 hours alongside

**Estimated Kamarajar port-call charges: USD 75,710 before GST** for a 50,000 GT container ship alongside for 20 hours. GT (gross tonnage) is a measure of the ship’s internal volume.

The estimate assumes a foreign-going ship, with 1 arrival and 1 departure. It includes port dues, pilotage and towage, mooring, and berth hire at Adani Ennore Container Terminal. Pilotage means guiding the ship into and out of port.

**Not included:** anchorage, cargo charges (wharfage), and other charges that could not be priced from the schedules held. The terminal’s berth-hire rate is a published ceiling, so the amount charged may be lower. Kamarajar’s vessel-charge schedule may also be out of date; no newer revision was found.

## cheapest-small

> What's cheaper for a 15,000 GRT general cargo ship staying 12 hours: Jaigarh or Pipavav?

I can’t say which is cheaper yet. The **before-GST figures are incomplete**, so the apparent gap is not a reliable comparison:

- **Jaigarh:** USD 675 priced so far. The berth is needed to price the remaining charges.
- **Pipavav:** USD 13,800 priced so far. Its schedule has no berth-hire rate for a foreign-going general cargo ship, so berth hire is missing.

I assumed a **foreign-going** ship, **12 hours alongside**, and arrival and departure movements. Which berth would the ship use at Jaigarh? And is this a foreign-going or coastal voyage?

## lng-mundra

> LNG carrier of 90,000 GT at Mundra for 2 days, what are the charges?

**Estimated charges at Mundra: USD 171,179.99 before GST** for an LNG carrier of 90,000 GT alongside for 2 days. This is **incomplete**, not a final port bill.

I assumed a foreign-going ship at the LNG terminal, with arrival and departure included. The estimate covers port dues, pilotage, berth hire and the listed surcharges. Towage and mooring were not priced from the rates we hold. Wharfage, a cargo-handling charge, is not included.

The pilotage fuel surcharge uses the notice dated 1 October 2026. Mundra revises it regularly, so please check the latest notice before relying on this estimate.

**Will the ship wait at anchorage? If so, for how many hours?**

## vlcc-chennai

> How much would a VLCC of 160,000 GT pay in berth hire at Chennai for a day?

For a **160,000 GT VLCC** alongside at Chennai for **24 hours**, estimated **berth hire is USD 30,720 before GST**. That is berth hire only, not the full port-call bill.

I assumed the ship is **foreign-going**. Chennai’s tariff counts each started hour, so a stay beyond 24 hours could cost more. Source: *Chennai Port Authority revised Scale of Rates*, p. 13.

## freshness-mumbai

> Are your Mumbai rates up to date?

Yes. The Mumbai Port Authority rates I hold were **last checked on 25 October 2026**. The schedule shown is for **1 May 2026 to 30 April 2027**, and the berth-hire rates reflect the indexed rates that apply from **9 May 2026**.

I can’t guarantee that the port has made no change since that check. Coverage also varies by berth: the pilotage and towage rates I hold are for ships berthing in the docks, not every Mumbai location. If you mean a particular berth or terminal, tell me which one.
