# Everyday questions: openai/gpt-6-sol, 2026-10-26

30 of 32 answers passed every automatic check. Cost of this run: about US$ 0.7601 from token counts (OpenRouter showed US$ 2.6368 spent of the US$ 9 limit when the run ended; its figure can lag).

Sample data used: one saved ship (MV Ocean Star), one charter-party passage and a 15% berth-hire discount at Hazira. Figures below come from the rule book; nothing was sent to anyone.

| Question | Tools | Checks | Steps | Seconds |
|---|---|---|---|---|
| estimate-paradip | estimate_port_call | pass | 2 | 9 |
| estimate-mundra-tanker | estimate_port_call | pass | 2 | 10 |
| voyage | estimate_port_call | **says total / combined** | 2 | 10 |
| compare-berth-hire | compare_ports | pass | 2 | 8 |
| compare-whole-bill | compare_ports | pass | 2 | 8 |
| tariff-hazira-pilotage | search_port_documents | pass | 2 | 13 |
| what-changed-paradip | port_tariff | pass | 2 | 7 |
| coverage | list_ports | pass | 2 | 6 |
| draft-chennai | search_port_documents | pass | 2 | 9 |
| documents-mundra | search_port_documents | pass | 2 | 11 |
| pilotage-compulsory-mumbai | search_port_documents | pass | 2 | 6 |
| night-pipavav | search_port_documents | pass | 2 | 7 |
| unsupported-port | estimate_port_call | pass | 2 | 6 |
| pilotage-jnpa | estimate_port_call | pass | 2 | 10 |
| kandla-tanker | estimate_port_call | pass | 2 | 7 |
| coastal-nmpa | estimate_port_call | pass | 2 | 7 |
| anchorage-chennai | estimate_port_call | pass | 2 | 9 |
| fleet-autofill | estimate_port_call | pass | 2 | 7 |
| fleet-save | save_ship | pass | 2 | 5 |
| company-docs | search_company_documents | pass | 2 | 6 |
| agreed-rates | estimate_port_call | pass | 2 | 8 |
| general-term | none | pass | 1 | 3 |
| fuel-surcharge-now | search_port_documents | **says twice a month / latest / revise / newer** | 2 | 10 |
| rupees | estimate_port_call | pass | 2 | 8 |
| tariff-comparison | compare_ports | pass | 2 | 10 |
| kamarajar-container | estimate_port_call | pass | 2 | 14 |
| cheapest-small | compare_ports | pass | 2 | 10 |
| lng-mundra | estimate_port_call | pass | 2 | 7 |
| vlcc-chennai | estimate_port_call | pass | 2 | 7 |
| wharfage-coal | estimate_port_call | pass | 2 | 6 |
| wharfage-containers | estimate_port_call | pass | 2 | 8 |
| freshness-mumbai | port_tariff | pass | 2 | 7 |

## estimate-paradip

> What will it cost to berth a 32,000 GT bulk carrier at Paradip for 2 days?

The estimated **whole port-call cost at Paradip is USD 46,315.02 before GST** for the 32,000 GT bulk carrier alongside for 2 days. This is more than berth hire alone: it includes port dues, pilotage and towage, and berth hire. Pilotage is the service of guiding the ship into and out of port.

I assumed the ship is **foreign-going** and makes a normal arrival and departure. If it is trading coastally, or if “2 days” includes time waiting rather than time alongside, the estimate will need adjusting.

## estimate-mundra-tanker

> port charges at mundra for a 45k grt tanker staying 30 hrs

**Estimated Mundra port charges: USD 84,685.00 before GST** for a 45,000 GRT tanker staying alongside for 30 hours.

This assumes a foreign-going ship, a standard berth, and arrival and departure movements. It includes USD 15,638.40 in berth hire and USD 53,678.34 for pilotage with tugs. The total does not include cargo-related charges.

The pilotage fuel surcharge uses the notice dated 1 October 2026. Mundra revises it regularly, so check the latest notice before relying on the estimate. If the tanker will use the crude-oil jetty or single-point mooring, tell me: those calls are charged by contract and are **not priced by this estimate**.

## voyage

> We're sailing from Mundra to Chennai with a 40,000 GRT bulk ship, about a day alongside at each. What will the port costs come to in total?

**Estimated port costs: USD 131,580.28 before GST** for the Mundra-to-Chennai voyage.

- Mundra departure call: **USD 72,584.28**
- Chennai arrival call: **USD 58,996.00**

This assumes a foreign-going bulk ship of **40,000 GRT** (gross tonnage), **24 hours alongside at each port**, and arrival and departure movements at both ports. It does not include cargo wharfage because no cargo quantity was given.

Mundra’s pilotage fuel surcharge can change, so check the latest notice before relying on the estimate. Chennai’s published schedule does not say whether its pilotage charge includes tugs; separately hired tugs could add to the cost.

## compare-berth-hire

> Compare berth hire at Mumbai and JNPA for a 25,000 GT container ship staying 18 hours

I can’t price or rank berth hire yet. Mumbai’s rate depends on the **berth**, and JNPA’s depends on the **terminal**. The comparison assumes a foreign-going container ship with 25,000 GT (gross tonnage) staying alongside for 18 hours.

Which Mumbai berth and JNPA terminal should I use?

## compare-whole-bill

> Which is cheaper overall for a 30,000 GRT bulk carrier staying 24 hours: Kattupalli, Chennai or Kamarajar?

**Before GST**, the estimated standard port-call totals are:

| Port | Total |
|---|---:|
| Kattupalli | USD 34,017.30 **plus** INR 3,43,200.00 |
| Chennai | USD 35,760.00 |
| Kamarajar | USD 37,620.00 |

**Chennai is cheaper than Kamarajar.** I can’t say which is cheapest overall because Kattupalli’s bill includes rupees as well as dollars. If you give me a rupees-per-dollar exchange rate, I can rank all 3.

I assumed a foreign-going bulk carrier, 24 hours alongside, and an arrival and departure movement. GRT means gross tonnage, a measure of the ship’s size used to calculate these charges. No cargo quantity was given, so cargo wharfage is not included.

## tariff-hazira-pilotage

> How does Hazira charge pilotage?

Hazira charges **pilotage by the ship’s gross tonnage (GRT)**, a measure of the ship’s enclosed volume. The charge covers 1 berthing and 1 unberthing, with tug charges included. The rate depends on the vessel type:

| Vessel | Pilotage charge |
|---|---|
| LNG | USD 0.6691 per GRT |
| Container | USD 1.18566 per GRT; minimum USD 11,260 |
| Other vessels, including tankers and dry cargo | USD 1.45331 per GRT, subject to a minimum of USD 6,000 up to 3,000 GRT; USD 14,500 from 3,001–15,000 GRT; and USD 25,300 above 15,000 GRT |

A **fuel surcharge** is added to pilotage. The port’s circular sets it at **USD 0.225070 per GT from 1 October 2026**. [Adani Hazira Port Berthing Policy and Tariff Structure, p. 26](https://www.adaniports.com/-/media/project/ports/portsandterminals/hazira-port-documents/tariff/bpts_hazira_issue-03_rev-14_oct-2026.pdf); [Hazira fuel surcharge circular, p. 1](https://www.adaniports.com/-/media/project/ports/portsandterminals/hazira-port-documents/trade-notice/fs_hazira_dtd_01-10-2026.pdf).

If you give me the vessel type and GRT, I can estimate the charge.

## what-changed-paradip

> What changed in Paradip's port charges this year?

Paradip’s **new Scale of Rates took effect on 10 October 2026**. Compared with the schedule in force immediately before it, the main ship charges rose. For a foreign-going ship:

| Charge | Before | Now |
|---|---:|---:|
| Port dues | USD 0.34 per GRT | USD 0.408 per GRT |
| Pilotage and towage, up to 30,000 GRT | USD 0.7148 per GRT | USD 0.8578 per GRT |
| Berth hire | USD 0.003338 per GRT per hour | USD 0.004006 per GRT per hour |

**GRT** measures a ship’s enclosed volume. **Pilotage** is the service of guiding a ship into or out of port; Paradip’s listed charge combines it with tug assistance. Berth hire is charged for each started hour alongside.

The new schedule also lists cargo-specific **wharfage** rates, but the comparison available here does not give the previous wharfage rates. I therefore can’t say how much those changed.

Source: *Paradip Port Authority Scale of Rates 2026*, pp. 17, 18 and 25. The schedule was last checked on 25 October 2026.

## coverage

> Which ports do you cover?

I cover these Indian ports:

- Mumbai Port
- Jawaharlal Nehru Port (Nhava Sheva)
- JSW Jaigarh
- New Mangalore
- Paradip
- Deendayal Port (Kandla and Vadinar)
- Chennai
- Kamarajar Port (Ennore)
- Mundra
- Hazira
- Kattupalli
- Pipavav

Coverage includes port-call charges, but some terminals, vessel types and charges have gaps. Tell me the port and terminal you’re considering, and I can check what’s priced.

## draft-chennai

> What's the permissible draft at Chennai's berths?

Chennai Port Authority lists these **permissible drafts by berth**, as of 01 January 2026. Draft is the depth of a ship below the waterline.

| Dock | Berth | Permissible draft |
|---|---|---:|
| Dr. Ambedkar | 19A North Quay | 8.50 m |
| | 18A West Quay 1 | 11.00 m |
| | 17A West Quay 2; 16A Centre Berth; 15A West Quay III | 12.00 m each |
| | 14A West Quay IV | 11.00 m* |
| | 13A South Quay 1; 6A South Quay II | 9.50 m each |
| | 5A, 4A and 3A CITPL | 15.00 m each† |
| Jawahar | 12J JD-1; 09J JD-6 | 12.50 m each‡ |
| | 11J JD-3; 10J JD-5 | 13.00 m each |
| | 07J JD-2; 08J JD-4 | 14.00 m each |
| Bharathi | 26B Bharathi Dock 1 | 14.60 m |
| | 24B Bharathi Dock II; 27B Bharathi Dock III | 16.50 m each§ |
| | 20B, 21B and 22B CCTPL | 13.40 m each |
| | 23B CCTPL | 15.00 m |
| | 01B Coastal Berth 1 | 11.00 m |
| | 02B Coastal Berth 2 | 10.00 m |
| | Bunker Berth | 9.00 m |

\* The port adds a location-specific note for 14A: **11 m up to 795 m; 9.5 m up to 810 m**.  
† For the CITPL berths, the port specifies **port side alongside from 12.5 m onwards**.  
‡ The port notes **13.0 m during high water** at 09J.  
§ The port notes **17.0 m during high water** at 27B.

Source: Chennai Port Authority, *Berth Details – Permissible Draft at Berths as on 01.01.2026*, p. 1.

## documents-mundra

> What documents do I need to submit before arriving at Mundra?

For a vessel arriving at **Mundra**, your agent should obtain the port’s official vessel acceptance and submit the declaration through **APMS/IPOS**. If the ship has not called before, the agent must first create its vessel record and upload its ship particulars, international tonnage certificate, class certificate and registry certificate. The port says it will not generate a vessel call number if that record or its required certificates are incomplete. [Mundra vessel-declaration procedure, pp. 1–2](https://www.adaniports.com/-/media/project/ports/portsandterminals/mundra-documents/marine-documents/standard-procedure-for-vessel-declarations-ndc-and-submission-of-documents.pdf)

For **all vessel declarations**, the procedure lists:

- Berthing application; vessel and cargo particulars; and vessel-acceptance navigational checklist.
- Ship particulars and the international tonnage, class, registry, load line, safety equipment, safety construction, safety radio, safe manning and ship-sanitation-exemption certificates.
- Air-pollution, oil-pollution and ballast-water certificates; safety-management and document-of-compliance certificates; ship-security certificate; P&I insurance and wreck-removal liability certificates; and the listed civil-liability and bunker-pollution certificates.
- The owner’s or operator’s agency appointment letter and pre-arrival notices.

These are listed for upload in APMS; the procedure says not to upload or email documents the system generates automatically. [Mundra vessel-declaration procedure, pp. 1–2](https://www.adaniports.com/-/media/project/ports/portsandterminals/mundra-documents/marine-documents/standard-procedure-for-vessel-declarations-ndc-and-submission-of-documents.pdf)

**Before arrival**, send the pre-arrival security notice (PANS) and crew list to the addresses specified in the procedure. It says the vessel cannot enter port limits until PANS is received. Send arrival-time updates at **5/3/2/1 days** and **12/6 hours** before arrival. The procedure also calls for the import general manifest (IGM) to reach the Port Operations Centre **24 hours before arrival**. [Mundra vessel-declaration procedure, pp. 2–3](https://www.adaniports.com/-/media/project/ports/portsandterminals/mundra-documents/marine-documents/standard-procedure-for-vessel-declarations-ndc-and-submission-of-documents.pdf)

Extra documents depend on the ship and cargo. The procedure lists additional paperwork for bulk and break-bulk cargo, liquid cargo, older vessels and older liquid tankers. Tell me the **ship type and cargo**, and I can narrow that list down. [Mundra vessel-declaration procedure, p. 2](https://www.adaniports.com/-/media/project/ports/portsandterminals/mundra-documents/marine-documents/standard-procedure-for-vessel-declarations-ndc-and-submission-of-documents.pdf)

## pilotage-compulsory-mumbai

> Is pilotage compulsory in Mumbai?

Yes. At **Mumbai Port**, pilotage is compulsory for ships of **100 net tons and above** entering or leaving the harbour. Pilotage means a local pilot guides the ship through port waters. The port document does not say it is compulsory below that threshold. [Mumbai Port Authority, *Pilotage*, p. 1](https://mumbaiport.gov.in/WriteReadData/RTF1984/1710398100.pdf)

## night-pipavav

> Can ships enter Pipavav at night?

Yes. Pipavav allows ships to enter and berth at night, **except LPG vessels, which are limited to daytime navigation**. A pilot is mandatory, and the timing of berthing can depend on the tide, the ship and conditions. [APM Terminals Pipavav, *Our Port*, p. 1](https://www.apmterminals.com/en/pipavav/about/our-terminal); [*SAFE MEMO – PIPAVAV PORT – INDIA*, pp. 1–2](https://cms-cd.apmterminals.com/pipavav/-/media/mainsite/asia-and-pacific/Pipavav/Information/Safe-Memo-Sep-2025.pdf).

## unsupported-port

> What would a call at Colombo cost for a 20,000 GT ship?

I can’t give a reliable cost for a Colombo call by a 20,000 GT ship because Colombo isn’t covered by the port tariffs I have. I won’t substitute another port’s rates.

If you have Colombo’s tariff or a port agent’s quote, share it and I can help review the charges.

## pilotage-jnpa

> How much is pilotage for a 10000 GT ship at JNPA?

For a **10,000 GT ship at JNPA**, the published charge is **USD 3,464 before GST** for **pilotage and towage together**. JNPA does not price pilotage separately in this rate. The charge covers the ship’s arrival and departure movements.

I assumed a foreign-going ship and a normal arrival and departure. If it is a coastal voyage, tell me and I can check the applicable charge.

Source: *JNPA Scale of Rates effective 1 May 2026*, p. 3, §2.2 A.

## kandla-tanker

> berth hire at kandla for a 20k GT liquid tanker, 36 hours

**Berth hire at Kandla: USD 6,048.00 before GST** for a 20,000 GT liquid tanker alongside for 36 hours.

The estimate assumes a foreign-going ship at a liquid-cargo berth, without the port’s shore cranes. GT (gross tonnage) measures the ship’s enclosed volume. Berth hire is charged for the time alongside; this is **berth hire only**, not the full port-call bill. If the port’s shore cranes are used, the tariff says the berth-hire rate doubles.

Source: Deendayal Port Authority’s escalated rate schedule, p. 10.

## coastal-nmpa

> Estimate port dues and pilotage at New Mangalore for a coastal general cargo ship of 8,000 GRT

**Estimated port dues and pilotage at New Mangalore: ₹1,65,780.80 before GST.**

| Charge | Estimate |
|---|---:|
| Port dues | ₹53,260.80 |
| Pilotage, including tugs and mooring | ₹1,12,520.00 |

This uses the coastal general-cargo rate for the **8,000 GRT** you gave. GRT (gross register tonnage) is the ship-size measure used for these charges. The pilotage estimate assumes an arrival and a departure; pilotage is the service of guiding the ship into and out of port.

Sources: *New Mangalore Port Authority Indexed Scale of Rates, 1 May 2026 to 30 April 2027*, pp. 17–18.

## anchorage-chennai

> What's the anchorage charge at Chennai for a 30,000 GRT bulk ship if it waits 72 hours?

For a 30,000 GRT bulk ship waiting at anchorage for 72 hours at Chennai, the **anchorage charge is USD 907.20 before GST**. The tariff allows the first 48 hours free, then charges for the remaining 24 hours.

This assumes a foreign-going ship. The charge does **not** apply if the ship is ready in all respects and waiting for a berth, or if it is anchored for the port’s convenience. Source: *Chennai Port Authority revised Scale of Rates*, section 2.3.4, p. 15.

## fleet-autofill

> Port costs for MV Ocean Star at Paradip, 24 hours alongside

**Estimated port costs at Paradip: USD 43,773.93 before GST** for MV Ocean Star with 24 hours alongside.

This uses the ship particulars saved in your fleet: a foreign-going bulk ship of 32,450 GRT. GRT is a measure of the ship’s enclosed volume. The estimate assumes an arrival and a departure. The largest charge is USD 27,414.46 for pilotage and towage—the pilot and tug assistance for those movements.

The estimate is in USD because you have not provided an exchange rate. It does not include cargo wharfage; no cargo quantity was given.

## fleet-save

> Please save our ship Sea Breeze: 12,000 GRT general cargo ship, IMO 9123456

Saved **Sea Breeze** to your fleet with IMO **9123456**, **12,000 GRT** (gross tonnage), and ship type **general cargo**.

## company-docs

> What does our charter party say about laytime?

Your *Sample charter party 2026* allows **72 running hours of laytime**, excluding Sundays and holidays. Laytime is the time allowed for loading or unloading. If that allowance is exceeded, **demurrage is USD 18,000 per day, pro rata**—charged in proportion to the extra time used. (*Sample charter party 2026*, p. 3, clause 14.)

The passage does not say when laytime starts or specify other exceptions.

## agreed-rates

> Price a call at Hazira for a 30,000 GRT bulk ship for 24 hours, with our agreed rates

For the **Hazira call**, the estimated total before GST is **USD 62,133.24 with your agreed rates**, versus **USD 63,528.60 at published rates**. The agreed rate applies to berth hire; the other priced charges use published rates.

I assumed a foreign-going bulk ship, with arrival and departure included. The estimate uses your **30,000 GRT** and **24 hours alongside**. It does not include cargo charges because no cargo quantity was given.

The pilotage fuel surcharge uses the notice dated **1 October 2026**. It changes regularly, so check the latest notice before relying on this estimate.

## general-term

> What is pilotage, in simple words?

Pilotage is the service of having a local expert, called a pilot, guide a ship into or out of a port. The pilot knows the local channels, tides and port rules. The ship’s captain remains in command.

## fuel-surcharge-now

> How much is the fuel surcharge at Mundra right now?

Mundra’s **fuel surcharge on pilotage is USD 0.22696 per GT** (gross tonnage). It is added to the regular pilotage charge. The port’s circular says this rate took effect on **1 October 2026**; it can change with fuel prices, so I would confirm it with the port before billing a call. [Mundra fuel surcharge circular, p. 1](https://www.adaniports.com/-/media/project/ports/portsandterminals/mundra-documents/trade-notices/fs_mundra_dtd_01-10-2026.pdf)

If you give me the ship’s GT, I can work out the surcharge for that ship.

## rupees

> Give me the total in rupees at 84.5 per dollar for a 30,000 GT bulk ship at Mundra for 24 hours

**Estimated total at Mundra: ₹46,00,028.75 before GST**, using your rate of ₹84.5 per US dollar. The tariff total is **US$54,438.21** for a 30,000 GT bulk ship alongside for 24 hours.

This assumes a foreign-going ship, with arrival and departure pilotage. No cargo quantity was given, so cargo wharfage is not included.

The estimate uses the fuel surcharge notice dated 1 October 2026. Mundra usually revises that surcharge about twice a month, so check the latest notice before relying on the total.

## tariff-comparison

> Compare how JNPA and Mundra charge container ships

**JNPA and Mundra charge container ships differently.** Assuming a foreign-going container ship, here is how their published ship charges compare. This is a comparison of rates, not a cost estimate, so it does not establish which port would be cheaper for a particular call.

| Charge | JNPA | Mundra |
|---|---|---|
| **Port dues** — a charge for entering the port | USD 0.1558 per GRT | USD 0.024344 per GRT, minimum USD 400 |
| **Pilotage and tugs** — help moving the ship in and out | A combined charge with GRT bands | A combined charge with GRT bands and minimums, **plus** a fuel surcharge of USD 0.22696 per GRT |
| **Berth hire** — time alongside | At several terminals, USD 0.0053 per GRT for each started hour. NSIGT and BMCT instead publish berth hire in INR. | USD 0.011584 per GRT per hour, minimum USD 810 per day |
| **Other listed ship charges** | Anchorage, if used | Mooring and sustainability charges; anchorage, if used. An environment charge also applies at the MICT container berths. |

**GRT** means gross tonnage, a measure of a ship’s enclosed volume—not its cargo weight. At JNPA, the terminal matters particularly for berth hire. At Mundra, the pilotage fuel surcharge can change with fuel prices; the rate shown is from its 1 October 2026 circular.

If you give me the ship’s GRT, the terminal and expected hours alongside, I can compare estimated bills before GST rather than rates alone.

## kamarajar-container

> Kamarajar charges for a 50,000 GT container ship, 20 hours alongside

**Estimated Kamarajar port-call charges: USD 75,710.00 before GST** for a 50,000 GT container ship alongside for 20 hours.

| Charge | Amount |
|---|---:|
| Port dues | USD 15,900.00 |
| Pilotage and towage | USD 39,410.00 |
| Berth hire | USD 20,400.00 |

This assumes a foreign-going ship arriving and departing through the Adani Ennore Container Terminal. Pilotage and towage cover the port pilot, required tugs and mooring crew for those movements. No cargo quantity was given, so **wharfage**—a separate cargo charge—was not priced.

The berth-hire rate is the terminal’s published **reference tariff**, so the terminal may charge less. Kamarajar’s consolidated port schedule may be out of date; no 2026 revision to its vessel charges was found.

## cheapest-small

> What's cheaper for a 15,000 GRT general cargo ship staying 12 hours: Jaigarh or Pipavav?

I can’t say which port is cheaper yet. The **before-GST figures are incomplete**, so they are not comparable:

- **Jaigarh:** USD 675.00 priced so far. The berth is needed to price the remaining charges.
- **Pipavav:** USD 13,800.00 priced so far. Its schedule has no berth-hire rate for a foreign-going general cargo ship.

I assumed a foreign-going ship and arrival and departure movements. **Which berth would the ship use at Jaigarh?**

## lng-mundra

> LNG carrier of 90,000 GT at Mundra for 2 days, what are the charges?

**Estimated Mundra charges: USD 171,179.99 before GST** for a 90,000 GT LNG carrier alongside for 2 days. GT (gross tonnage) measures the ship’s enclosed volume; it is not the weight of LNG carried.

The largest items are pilotage (the service of guiding the ship into and out of port) at USD 101,297.25, berth hire at USD 40,383.54, and the pilotage fuel surcharge at USD 20,426.40. Port dues and other priced charges are included in the total.

I assumed a foreign-going ship with an arrival and departure. **Mooring is not priced**, because the schedule has no applicable rate, so the final bill may be higher. The fuel surcharge uses a notice dated 1 October 2026 and may have changed; check the latest notice before relying on the estimate.

## vlcc-chennai

> How much would a VLCC of 160,000 GT pay in berth hire at Chennai for a day?

**Berth hire at Chennai: USD 30,720 before GST** for a 160,000 GT VLCC alongside for 24 hours.

This assumes the ship is foreign-going. Chennai’s rate is USD 0.0080 per gross ton (GT, a measure of the ship’s enclosed size) per hour. This is **berth hire only**, not the full port-call bill. Source: *Chennai Port Authority revised Scale of Rates*, p. 13, §2.3.1.

## wharfage-coal

> We're discharging 50,000 tonnes of imported coal at Paradip from a foreign-going 32,000 GT bulk carrier. What will wharfage come to?

Estimated **wharfage is ₹30,21,500 before GST** for 50,000 tonnes of imported coal at Paradip. The rate used is ₹60.43 per tonne for conventional handling. Source: *Paradip Port Authority Scale of Rates 2026*, p. 32.

This assumes the lowest annual-volume band. Larger annual volumes or handling through the mechanised coal plant would change the rate. Wharfage is a cargo charge, usually paid by the cargo owner; it is separate from the ship’s port-call charges.

## wharfage-containers

> Berthing charges at Chennai for a 25,000 GRT container ship, 24 hours alongside, discharging 400 TEU

**Chennai estimate before GST:** **USD 25,770.00** in ship charges, plus **INR 5,29,600.00** in container wharfage. Wharfage is a cargo charge, usually paid by the cargo owner, so it is shown separately.

This assumes a foreign-going container ship, 24 hours alongside, an arrival and departure, and that all 400 TEU are loaded 20-foot containers. A TEU is the space taken by a 20-foot container; a 40-foot container counts as 2 TEU but has its own wharfage rate.

**Towage is not priced.** The Chennai schedule does not say whether the pilotage charge—the charge for guided ship movements—includes berthing tugs. No tug hire has been added, so the estimate may be incomplete if tugs are charged separately.

## freshness-mumbai

> Are your Mumbai rates up to date?

Yes—for **Mumbai Port Authority**, not JNPT, the rates I hold were checked against the port’s published schedule on **25 October 2026**. The schedule covers **1 May 2026 to 30 April 2027**, and the berth-hire rates include the amendment effective **9 May 2026**.

There is a coverage limit: the pilotage and towage rates I have are for ships berthing in the docks. I don’t have those rates entered for stream berths, Jawahar Dweep or Pir Pau, so I wouldn’t treat an estimate for those locations as complete.
