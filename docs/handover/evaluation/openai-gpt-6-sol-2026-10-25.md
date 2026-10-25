# Everyday questions: openai/gpt-6-sol, 2026-10-25

30 of 30 answers passed every automatic check. Cost of this run: about US$ 0.61 from token counts (OpenRouter showed US$ 0.3344 spent of the US$ 9 limit when the run ended; its figure can lag).

Sample data used: one saved ship (MV Ocean Star), one charter-party passage and a 15% berth-hire discount at Hazira. Figures below come from the rule book; nothing was sent to anyone.

| Question | Tools | Checks | Steps | Seconds |
|---|---|---|---|---|
| estimate-paradip | calculate, estimate_port_call | pass | 3 | 10 |
| estimate-mundra-tanker | estimate_port_call | pass | 2 | 6 |
| voyage | estimate_port_call | pass | 2 | 8 |
| compare-berth-hire | compare_ports | pass | 2 | 5 |
| compare-whole-bill | compare_ports | pass | 2 | 7 |
| tariff-hazira-pilotage | port_tariff | pass | 2 | 5 |
| what-changed-paradip | port_tariff | pass | 2 | 6 |
| coverage | list_ports | pass | 2 | 5 |
| draft-chennai | search_port_documents | pass | 2 | 12 |
| documents-mundra | search_port_documents | pass | 2 | 8 |
| pilotage-compulsory-mumbai | search_port_documents | pass | 2 | 4 |
| night-pipavav | search_port_documents | pass | 2 | 5 |
| unsupported-port | estimate_port_call | pass | 2 | 4 |
| pilotage-jnpa | estimate_port_call | pass | 2 | 6 |
| kandla-tanker | estimate_port_call | pass | 2 | 5 |
| coastal-nmpa | estimate_port_call | pass | 2 | 6 |
| anchorage-chennai | estimate_port_call | pass | 2 | 6 |
| fleet-autofill | estimate_port_call | pass | 2 | 31 |
| fleet-save | save_ship | pass | 2 | 4 |
| company-docs | search_company_documents | pass | 2 | 4 |
| agreed-rates | estimate_port_call | pass | 2 | 6 |
| general-term | none | pass | 1 | 2 |
| fuel-surcharge-now | port_tariff | pass | 2 | 4 |
| rupees | estimate_port_call | pass | 2 | 5 |
| tariff-comparison | compare_ports | pass | 2 | 7 |
| kamarajar-container | estimate_port_call | pass | 2 | 6 |
| cheapest-small | compare_ports | pass | 2 | 5 |
| lng-mundra | estimate_port_call | pass | 2 | 6 |
| vlcc-chennai | estimate_port_call | pass | 2 | 6 |
| freshness-mumbai | port_tariff | pass | 2 | 4 |

## estimate-paradip

> What will it cost to berth a 32,000 GT bulk carrier at Paradip for 2 days?

The estimated **port-call cost at Paradip is USD 46,315.02 before GST** for a 32,000 GT bulk carrier alongside for 2 days. This includes port dues, berth hire, and pilotage and towage for arrival and departure. Pilotage is the service of guiding the ship into and out of port.

I assumed the ship is **foreign-going**. Anchorage, wharfage and other charges are **not priced** because they are not in the Paradip rate schedule we hold, so the final bill could be higher.

## estimate-mundra-tanker

> port charges at mundra for a 45k grt tanker staying 30 hrs

**Estimated Mundra port charges: USD 84,685.00 before GST** for a 45,000 GRT tanker alongside for 30 hours. GRT is the ship’s gross tonnage, used to calculate several charges.

This assumes a foreign-going tanker at a standard berth, with arrival and departure. The total includes pilotage (guidance by a port pilot), tugs, berth hire and other standard charges. It does **not** price a call at the single-point mooring or crude-oil jetty, which use contract rates.

The estimate uses the fuel surcharge notice dated 1 October 2026. Mundra revises that surcharge regularly, so check the latest notice before relying on the total.

## voyage

> We're sailing from Mundra to Chennai with a 40,000 GRT bulk ship, about a day alongside at each. What will the port costs come to in total?

**Estimated port costs: USD 131,580.28 before GST** for the Mundra departure and Chennai arrival.

| Port | Estimated cost |
|---|---:|
| Mundra | USD 72,584.28 |
| Chennai | USD 58,996.00 |

This assumes a foreign-going bulk ship of 40,000 GRT (gross tonnage), about 24 hours alongside at each port, and an arrival and departure movement at each. No anchorage waiting time was included.

**The total is incomplete.** Wharfage is not priced at either port. At Chennai, towage, mooring and other charges are also not priced in the schedule we hold. Mundra’s fuel surcharge uses the notice dated 1 October 2026; it is revised frequently, so the current notice should be checked.

Will the ship wait at anchorage at either port?

## compare-berth-hire

> Compare berth hire at Mumbai and JNPA for a 25,000 GT container ship staying 18 hours

I can’t compare the berth hire yet. Neither port has a priced total because the rate depends on the berth or terminal.

For your 25,000 GT container ship staying 18 hours, which **Mumbai berth** and **JNPA terminal** will it use? At Mumbai, the berth groups are Indira Dock, Ballard Pier, or Prince’s and Victoria Docks. At JNPA, the terminal choices include GTI, NSIGT, NSICT, NSFT and BMCT.

I treated the ship as foreign-going; please correct that if it’s on an Indian coastal voyage.

## compare-whole-bill

> Which is cheaper overall for a 30,000 GRT bulk carrier staying 24 hours: Kattupalli, Chennai or Kamarajar?

**I can’t rank all 3 ports yet.** Kattupalli has a charge in rupees, while the other totals are in dollars. Without an exchange rate, those totals must stay separate.

| Port | Estimated total before GST |
|---|---:|
| Kattupalli | USD 34,017.30 + INR 3,43,200.00 |
| Chennai | USD 35,760.00 |
| Kamarajar | USD 37,620.00 |

**Chennai is cheaper than Kamarajar** on these estimates. The calculation assumes a foreign-going bulk carrier, 24 hours alongside, and an arrival and departure. No charges were flagged as unpriced.

If you give me a rupees-per-dollar exchange rate, I can rank Kattupalli against the other ports.

## tariff-hazira-pilotage

> How does Hazira charge pilotage?

At Hazira, **pilotage includes tug charges** for 1 berthing and 1 unberthing. For most ships, the rate is **USD 1.45331 per GRT**, subject to these minimum charges:

| Gross registered tonnage (GRT) | Minimum |
|---|---:|
| Up to 3,000 | USD 6,000 |
| Over 3,000 up to 15,000 | USD 14,500 |
| Over 15,000 | USD 25,300 |

GRT is a measure of a ship’s enclosed volume, not its weight. These rates are from the *Adani Hazira Port Berthing Policy and Tariff Structure*, issue 3 revision 14, p. 26.

A **fuel surcharge** is added to pilotage for most ships: **USD 0.225070 per GRT** under the notice dated 1 October 2026. LNG ships are exempt. The surcharge is reviewed fortnightly, so check the latest notice before relying on that rate. Source: *Hazira fuel surcharge on pilotage*, p. 1.

## what-changed-paradip

> What changed in Paradip's port charges this year?

Paradip’s **new Scale of Rates took effect on 10 October 2026**. For a **foreign-going general-cargo ship**, these charges rose from the schedule in force immediately before it:

| Charge | Before | From 10 October 2026 |
|---|---:|---:|
| Port dues | USD 0.34 per GRT | USD 0.408 per GRT |
| Pilotage and towage, for ships up to 30,000 GRT | USD 0.7148 per GRT | USD 0.8578 per GRT |
| Berth hire | USD 0.003338 per GRT per hour | USD 0.004006 per GRT per hour |

**GRT** is gross tonnage, a measure of a ship’s internal volume. *Pilotage* is the service of a port pilot guiding the ship; the listed charge also covers towage. Larger ships have separate pilotage-and-towage bands, which also increased.

This is a comparison with the schedule effective from 1 May 2026, **not a review of every change during the year**. The new schedule was checked on 25 October 2026. Source: *Paradip Port Authority Scale of Rates 2026*, pp. 17, 18 and 25.

## coverage

> Which ports do you cover?

I cover these Indian ports:

- Mumbai
- Jawaharlal Nehru Port (JNPA / Nhava Sheva)
- JSW Jaigarh
- New Mangalore
- Paradip
- Deendayal (Kandla and Vadinar)
- Chennai
- Kamarajar (Ennore)
- Mundra
- Hazira
- Kattupalli
- Pipavav

I can estimate port-call charges and compare costs at these ports. Coverage varies by terminal and charge, so I’ll flag anything I can’t price. The rate schedules were last checked on 25 October 2026.

## draft-chennai

> What's the permissible draft at Chennai's berths?

Chennai’s **permissible draft varies by berth**. Draft is how deep a ship sits in the water. The port’s berth list, dated **01 January 2026**, gives these limits:

| Dock | Berth | Permissible draft |
|---|---|---:|
| Dr. Ambedkar | 19A North Quay | 8.50 m |
| | 18A West Quay 1 | 11.00 m |
| | 17A West Quay 2; 16A Centre Berth; 15A West Quay III | 12.00 m |
| | 14A West Quay IV | 11.00 m* |
| | 13A South Quay 1; 6A South Quay II | 9.50 m |
| | 5A, 4A and 3A CITPL | 15.00 m† |
| Jawahar | 12J JD-1; 09J JD-6 | 12.50 m‡ |
| | 11J JD-3; 10J JD-5 | 13.00 m |
| | 07J JD-2; 08J JD-4 | 14.00 m |
| Bharathi | 26B Bharathi Dock 1 | 14.60 m |
| | 24B Bharathi Dock II; 27B Bharathi Dock III | 16.50 m§ |
| | 20B, 21B and 22B CCTPL | 13.40 m |
| | 23B CCTPL | 15.00 m |
| | 01B Coastal Berth 1; 02B Coastal Berth 2 | 11.00 m; 10.00 m |
| | Bunker Berth | 9.00 m |

\* The port adds a length-dependent note for 14A: **11 m up to 795 m; 9.5 m up to 810 m**.  
† For the CITPL berths, the port specifies **port side alongside from 12.5 m draft onwards**.  
‡ JD-6 permits **13.0 m during high water**.  
§ Bharathi Dock III permits **17.0 m during high water**.

Source: Chennai Port Authority, *BERTH DETAILS – Permissible Draft at Berths as on 01.01.2026*, p. 1.

## documents-mundra

> What documents do I need to submit before arriving at Mundra?

For a vessel arriving at **Mundra**, your agent should obtain the port’s official vessel acceptance and submit the vessel declaration through Adani’s APMS/IPOS system. If this is the vessel’s first call, the agent must also create its vessel record and upload the ship particulars, International Tonnage Certificate, class certificate and Certificate of Registry. [Mundra vessel-declaration procedure, p. 1](https://www.adaniports.com/-/media/project/ports/portsandterminals/mundra-documents/marine-documents/standard-procedure-for-vessel-declarations-ndc-and-submission-of-documents.pdf)

**For the arrival declaration, have these ready to upload:**

- Berthing application; vessel and cargo particulars; and the vessel-acceptance navigational checklist.
- Ship particulars and certificates covering tonnage, registry, class, load line, safety equipment, construction and radio, safe manning, ship security, safety management, air and oil pollution prevention, ballast-water management, and ship sanitation control exemption.
- P&I insurance and wreck-removal liability certificates, the listed civil-liability certificates, documents of compliance, and the owner’s or operator’s agency appointment letter. [Mundra vessel-declaration procedure, pp. 1–2](https://www.adaniports.com/-/media/project/ports/portsandterminals/mundra-documents/marine-documents/standard-procedure-for-vessel-declarations-ndc-and-submission-of-documents.pdf)

Also send the **pre-arrival notices at 5, 3, 2 and 1 days**, including the notice required under the ship-security code. The procedure says to submit the prior import general manifest (**IGM**) to the Port Operation Center **24 hours before arrival**. It lists extra clearance for a vessel aged **25 years**, and extra condition and pollution-prevention certificates for a liquid tanker aged **more than 20 years**. [Mundra vessel-declaration procedure, p. 2](https://www.adaniports.com/-/media/project/ports/portsandterminals/mundra-documents/marine-documents/standard-procedure-for-vessel-declarations-ndc-and-submission-of-documents.pdf)

**Cargo-specific documents may also apply.** For bulk or breakbulk, the procedure lists items such as a stowage plan and loading or discharge sequence, with further documents for particular cargoes. For liquid cargo, it lists a stowage plan, pre-arrival exchange-information checklist, and—where relevant—temperature reports and heating instructions. [Mundra vessel-declaration procedure, p. 2](https://www.adaniports.com/-/media/project/ports/portsandterminals/mundra-documents/marine-documents/standard-procedure-for-vessel-declarations-ndc-and-submission-of-documents.pdf)

Tell me the vessel and cargo type if you want the cargo-specific part narrowed down.

## pilotage-compulsory-mumbai

> Is pilotage compulsory in Mumbai?

Yes. At Mumbai Port, pilotage—having a port pilot guide the ship—is compulsory when entering or leaving the harbour for ships of **100 net tons or more**. Net tonnage measures a ship’s usable internal space, not its weight. The document does not say that pilotage is compulsory for smaller ships. Source: Mumbai Port Authority, *Pilotage*, p. 1.

## night-pipavav

> Can ships enter Pipavav at night?

Yes. Pipavav permits night navigation and berthing for most ships, but **LPG vessels are daytime-only**. Dry-cargo and container ships must also meet the port’s tidal-window rules. A pilot is required for entry; an inbound ship must not cross the fairway buoy without one unless the pilot or Port Control expressly authorizes it. [*Our Port*, p. 1](https://www.apmterminals.com/en/pipavav/about/our-terminal); [*SAFE MEMO – PIPAVAV PORT – INDIA*, pp. 1–2](https://cms-cd.apmterminals.com/pipavav/-/media/mainsite/asia-and-pacific/Pipavav/Information/Safe-Memo-Sep-2025.pdf).

## unsupported-port

> What would a call at Colombo cost for a 20,000 GT ship?

I can’t estimate a Colombo call because Colombo isn’t among the ports I cover. I won’t substitute another port’s rates for your 20,000 GT ship.

## pilotage-jnpa

> How much is pilotage for a 10000 GT ship at JNPA?

At JNPA, the published charge for a **10,000 GT ship is USD 3,464 before GST**. This is a **combined pilotage and towage charge** for arrival and departure; the tariff does not separate pilotage from towage.

The estimate assumes a foreign-going ship and normal arrival and departure movements. If you mean pilotage for just one movement, let me know.

## kandla-tanker

> berth hire at kandla for a 20k GT liquid tanker, 36 hours

**Berth hire at Kandla: USD 6,048.00 before GST** for a 20,000 GT liquid tanker alongside for 36 hours.

This uses the foreign-going rate at Kandla’s liquid cargo berths. I assumed the ship is not using the port’s shore cranes; using them would change the rate. This is **berth hire only**, not the full port-call bill.

## coastal-nmpa

> Estimate port dues and pilotage at New Mangalore for a coastal general cargo ship of 8,000 GRT

**Estimated port dues and pilotage at New Mangalore: ₹1,65,780.80 before GST.**

- Port dues: ₹53,260.80
- Pilotage, including tugs and mooring: ₹1,12,520.00

This uses the coastal general-cargo rates for the ship’s 8,000 GRT (gross tonnage). It assumes 1 arrival and 1 departure. These are only the charges you asked for, not the full port-call bill.

Source: New Mangalore Port Authority *Indexed Scale of Rates*, pages 17–18.

## anchorage-chennai

> What's the anchorage charge at Chennai for a 30,000 GRT bulk ship if it waits 72 hours?

The **Chennai anchorage charge is estimated at USD 907.20 before GST** for a 30,000 GRT bulk ship waiting 72 hours. The tariff allows the first 48 hours free, leaving 24 chargeable hours. *(Chennai Port Authority revised Scale of Rates, section 2.3.4, p. 15.)*

This assumes a foreign-going ship. **The charge may be waived** if the ship is ready in all respects and waiting for a berth, or is anchored for the port’s convenience. Was it waiting for a berth after becoming ready?

## fleet-autofill

> Port costs for MV Ocean Star at Paradip, 24 hours alongside

The estimated **port-call cost for MV Ocean Star at Paradip is USD 43,773.93 before GST** for 24 hours alongside.

I used the ship’s saved particulars: a foreign-going bulk carrier of 32,450 GRT (gross tonnage). The estimate assumes an arrival and a departure. Pilotage, towage and mooring are included in the pilotage-and-towage charge.

**This is not a complete bill:** anchorage and wharfage were not priced because they are not in the Paradip rate schedule we hold.

## fleet-save

> Please save our ship Sea Breeze: 12,000 GRT general cargo ship, IMO 9123456

Saved **Sea Breeze** to your fleet: IMO 9123456, 12,000 GRT (gross tonnage), general cargo.

## company-docs

> What does our charter party say about laytime?

Your **Sample charter party 2026** allows **72 running hours of laytime**, with Sundays and holidays excluded. If that allowance is exceeded, demurrage is **USD 18,000 per day, pro rata**. The passage does not say when laytime starts. *Source: Sample charter party 2026, page 3, clause 14.*

## agreed-rates

> Price a call at Hazira for a 30,000 GRT bulk ship for 24 hours, with our agreed rates

For a **30,000 GRT bulk ship at Hazira for 24 hours alongside**, the estimated port-call cost **before GST** is:

- **Your agreed rates: USD 62,133.24**
- **Published rates: USD 63,528.60**

The agreed total applies your berth-hire discount; the other priced charges use published rates. GRT means gross tonnage, a measure of the ship’s enclosed volume used to calculate several charges.

I assumed the ship is foreign-going and makes an arrival and departure movement. Pilotage—the service of guiding the ship into and out of port—includes tugs here. **Wharfage is not priced** because it is not in the Hazira rate schedule we hold.

The fuel surcharge used is from the **1 October 2026** notice and may have changed; check the latest notice before relying on this estimate. How many hours, if any, will the ship wait at anchorage?

## general-term

> What is pilotage, in simple words?

Pilotage is the service of a local expert, called a pilot, guiding a ship through a port’s waters. The pilot advises the ship’s captain on the safest route and how to approach or leave the berth.

## fuel-surcharge-now

> How much is the fuel surcharge at Mundra right now?

Mundra’s fuel surcharge on pilotage is **USD 0.22696 per GRT** under the notice dated 1 October 2026. GRT (gross tonnage) is a measure of a ship’s enclosed volume; the surcharge applies to all ships calling at Mundra. Source: *Mundra fuel surcharge on pilotage*, p. 1.

That was the rate in the latest notice checked on 25 October 2026. Mundra usually revises it about twice a month, so check the latest trade notice before relying on it.

## rupees

> Give me the total in rupees at 84.5 per dollar for a 30,000 GT bulk ship at Mundra for 24 hours

**Estimated total at Mundra: ₹46,00,028.75 before GST**, using your rate of ₹84.5 per US dollar. The tariff total is US$54,438.21.

This assumes a foreign-going bulk ship, 24 hours alongside the berth, and arrival and departure movements. Pilotage—the service of guiding the ship into and out of port—includes tugs in this estimate.

The total is **incomplete**: wharfage is not priced in the Mundra schedule we hold, and anchorage waiting time is unknown. The fuel surcharge uses the 1 October 2026 notice; Mundra usually revises it about twice a month, so check the latest notice.

Will the ship wait at anchorage? If so, for how many hours?

## tariff-comparison

> Compare how JNPA and Mundra charge container ships

**JNPA and Mundra charge container ships differently.** JNPA’s berth-hire rate depends on the terminal. Mundra uses a port-wide berth-hire rate, with a daily minimum, and lists several additional vessel charges. This is a comparison of the published tariffs, **not a comparison of call totals**.

| Charge | JNPA | Mundra |
|---|---|---|
| Port dues | USD 0.1558 per GRT | USD 0.024344 per GRT; minimum USD 400 |
| Pilotage and tugs | Combined charge, with rates that change by GRT band | Combined charge, with rates and minimums that change by GRT band; a separate fuel surcharge of USD 0.22696 per GRT |
| Berth hire | USD 0.0053 per GRT per started hour at GTI, NSICT and NSFT; INR 2.0476 at NSIGT or INR 2.378 at BMCT | USD 0.011584 per GRT per hour; minimum USD 810 per day |
| Other listed vessel charges | Anchorage, if used | Mooring, sustainability, and anchorage if used. An environment-protection charge also applies at the MICT container berths, but not the other container terminals. |

**GRT** means gross tonnage, a measure of a ship’s enclosed volume. **Pilotage** is the charge for a local pilot guiding the ship. At both ports, the listed pilotage charge includes tug assistance for a standard arrival and departure.

I’ve assumed a **foreign-going container ship**. The exact JNPA terminal matters, and the Mundra fuel surcharge can change. Without the ship’s GRT, terminal and time alongside, this tariff comparison cannot say which **whole port call** is cheaper.

## kamarajar-container

> Kamarajar charges for a 50,000 GT container ship, 20 hours alongside

**Estimated Kamarajar port-call charges: USD 75,710 before GST** for a 50,000 GT container ship alongside for 20 hours. GT means gross tonnage, a measure of the ship’s internal volume.

The estimate assumes a foreign-going ship, with arrival and departure movements. It includes port dues, berth hire at Adani Ennore Container Terminal, and pilotage and towage. Pilotage is the service of guiding the ship into and out of port; the port’s charge also includes mooring crew.

**The total is incomplete:** anchorage, wharfage and other charges were not priced because they are not covered by the rate schedule held. The terminal’s berth-hire rate is a published ceiling, so the actual charge may be lower. Kamarajar’s vessel-charge schedule may also be out of date.

## cheapest-small

> What's cheaper for a 15,000 GRT general cargo ship staying 12 hours: Jaigarh or Pipavav?

I can’t say which port is cheaper yet. The **before-GST figures shown so far** are USD 675 for Jaigarh and USD 13,800 for Pipavav, but they are not comparable totals. Jaigarh still needs a berth selection before its main charges can be priced. Pipavav’s published schedule has no berth-hire rate for a foreign-going general cargo ship.

The comparison assumes a foreign-going ship and arrival and departure movements. **Which berth would the ship use at Jaigarh?**

## lng-mundra

> LNG carrier of 90,000 GT at Mundra for 2 days, what are the charges?

The **priced charges are USD 171,179.99 before GST** for an LNG carrier of 90,000 GT alongside at Mundra for 2 days. The largest items are pilotage (the service of guiding the ship into and out of port) at USD 101,297.25 and LNG berth hire at USD 40,383.54.

I assumed a foreign-going ship with an arrival and a departure. **The bill is incomplete:** towage and wharfage are not in the Mundra schedule we hold, and it gives no mooring rate for this ship. Anchorage waiting is not included.

The pilotage fuel surcharge uses the notice dated 1 October 2026. Mundra revises it regularly, so check the latest notice before relying on the estimate. How many hours will the ship wait at anchorage?

## vlcc-chennai

> How much would a VLCC of 160,000 GT pay in berth hire at Chennai for a day?

**Berth hire at Chennai: USD 30,720 before GST** for a VLCC of 160,000 GT alongside for 24 hours.

The published rate is USD 0.0080 per GT per hour. I assumed the ship is foreign-going and that “a day” means 24 hours alongside. If it is a coastal voyage, the rate will differ.

## freshness-mumbai

> Are your Mumbai rates up to date?

Yes. Our Mumbai Port Authority rates were last checked on **25 October 2026** against its updated May 2026 Scale of Rates and berth-hire amendment. The schedule shown covers **1 May 2026 to 30 April 2027**.

One detail matters: the berth-hire amendment lists both base and indexed rates. We use the **indexed rates**, which it says apply from **9 May 2026**. These are Mumbai Port Authority rates, not rates for a separate terminal such as JNPA.
