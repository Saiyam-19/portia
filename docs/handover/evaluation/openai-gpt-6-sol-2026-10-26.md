# Everyday questions: openai/gpt-6-sol, 2026-10-26

30 of 32 answers passed every automatic check. Cost of this run: about US$ 0.774 from token counts (OpenRouter showed US$ 2.0363 spent of the US$ 9 limit when the run ended; its figure can lag).

Sample data used: one saved ship (MV Ocean Star), one charter-party passage and a 15% berth-hire discount at Hazira. Figures below come from the rule book; nothing was sent to anyone.

| Question | Tools | Checks | Steps | Seconds |
|---|---|---|---|---|
| estimate-paradip | estimate_port_call | pass | 2 | 7 |
| estimate-mundra-tanker | estimate_port_call | pass | 3 | 30 |
| voyage | estimate_port_call | pass | 2 | 18 |
| compare-berth-hire | compare_ports | pass | 2 | 6 |
| compare-whole-bill | compare_ports | pass | 2 | 8 |
| tariff-hazira-pilotage | port_tariff | pass | 2 | 10 |
| what-changed-paradip | port_tariff | pass | 2 | 13 |
| coverage | list_ports | pass | 2 | 6 |
| draft-chennai | search_port_documents | pass | 2 | 10 |
| documents-mundra | search_port_documents | pass | 2 | 12 |
| pilotage-compulsory-mumbai | search_port_documents | pass | 2 | 8 |
| night-pipavav | search_port_documents | pass | 2 | 6 |
| unsupported-port | estimate_port_call | **says don't cover / do not cover / not one of / isn't covered / not covered / only cover / isn't among / not among / isn't one of / isn't in / not in our / outside / isn't a port / not a port / does not cover / doesn't cover** | 2 | 7 |
| pilotage-jnpa | estimate_port_call | pass | 2 | 9 |
| kandla-tanker | estimate_port_call | pass | 2 | 15 |
| coastal-nmpa | estimate_port_call | pass | 2 | 7 |
| anchorage-chennai | estimate_port_call | pass | 2 | 7 |
| fleet-autofill | estimate_port_call | pass | 2 | 6 |
| fleet-save | save_ship | pass | 2 | 5 |
| company-docs | search_company_documents | pass | 2 | 5 |
| agreed-rates | estimate_port_call | pass | 2 | 6 |
| general-term | none | pass | 1 | 2 |
| fuel-surcharge-now | search_port_documents | **says twice a month / latest / revise** | 2 | 5 |
| rupees | estimate_port_call | pass | 2 | 12 |
| tariff-comparison | compare_ports | pass | 2 | 9 |
| kamarajar-container | estimate_port_call | pass | 2 | 7 |
| cheapest-small | compare_ports | pass | 2 | 17 |
| lng-mundra | estimate_port_call | pass | 2 | 11 |
| vlcc-chennai | estimate_port_call | pass | 2 | 8 |
| wharfage-coal | estimate_port_call | pass | 2 | 7 |
| wharfage-containers | estimate_port_call | pass | 2 | 7 |
| freshness-mumbai | port_tariff | pass | 2 | 7 |

## estimate-paradip

> What will it cost to berth a 32,000 GT bulk carrier at Paradip for 2 days?

The estimated cost to berth a **32,000 GT bulk carrier at Paradip for 2 days** is **USD 46,315.02 before GST**.

That includes port dues, pilotage and towage (guiding and assisting the ship in and out), and berth hire. The estimate assumes the ship is **foreign-going**, spends **48 hours alongside**, and makes an arrival and departure movement. If it is an Indian coastal voyage, the cost will differ.

Paradip’s tariff is stated in US dollars but collected in rupees at the applicable reference rate. I haven’t converted it because you haven’t given an exchange rate.

## estimate-mundra-tanker

> port charges at mundra for a 45k grt tanker staying 30 hrs

**Estimated Mundra port charges: USD 84,685.00 before GST** for a 45,000 GRT tanker staying alongside for 30 hours. GRT is the ship’s gross tonnage, used here to calculate several charges.

The main charges are pilotage with tugs (guidance into and out of port), USD 53,678.34; a fuel surcharge, USD 10,213.20; and berth hire, USD 15,638.40. The estimate assumes a foreign-going tanker making a normal arrival and departure at a berth.

**Check the fuel surcharge before relying on the total.** The rate used is from Mundra’s 1 October 2026 notice, and the port usually revises it about twice a month.

## voyage

> We're sailing from Mundra to Chennai with a 40,000 GRT bulk ship, about a day alongside at each. What will the port costs come to in total?

The estimated **total port cost is USD 131,580.28 before GST** for the Mundra–Chennai voyage.

- Mundra: USD 72,584.28
- Chennai: USD 58,996.00

This assumes a foreign-going bulk ship of 40,000 GRT (gross registered tonnage), 24 hours alongside at each port, and an arrival and departure movement at each. No cargo charge is included because you did not give a cargo quantity.

**Check before relying on the figure:** Mundra’s fuel surcharge can change, and the estimate uses its 1 October 2026 notice. Chennai’s published schedule does not say whether pilotage—the service of guiding the ship in and out—includes berthing tugs, so any separately hired tugs are not included.

## compare-berth-hire

> Compare berth hire at Mumbai and JNPA for a 25,000 GT container ship staying 18 hours

I can’t price or compare the berth hire yet. The rate depends on the berth at Mumbai and the terminal at JNPA, so neither total before GST is available.

Which **Mumbai berth** and **JNPA terminal** should I use? I’ve treated the ship as foreign-going; tell me if it’s trading coastally instead.

## compare-whole-bill

> Which is cheaper overall for a 30,000 GRT bulk carrier staying 24 hours: Kattupalli, Chennai or Kamarajar?

**I can’t rank all 3 ports yet.** Kattupalli’s bill includes rupees, while the other bills are in US dollars. The totals before GST are:

| Port | Estimated total |
|---|---:|
| Kattupalli | USD 34,017.30 + INR 3,43,200.00 |
| Chennai | USD 35,760.00 |
| Kamarajar | USD 37,620.00 |

**Chennai is cheaper than Kamarajar** on these estimates. To tell whether Kattupalli is cheapest overall, what INR-per-USD exchange rate should I use?

I assumed a foreign-going bulk carrier, 24 hours alongside, and an arrival and departure movement. No cargo charge is included.

## tariff-hazira-pilotage

> How does Hazira charge pilotage?

At Hazira, **pilotage includes the pilot’s assistance for 1 berthing and 1 unberthing, plus all tug charges**. For most ships, the charge is **USD 1.45331 per GRT**, subject to a minimum based on the ship’s size. GRT (gross registered tonnage) is a measure of the ship’s internal volume, not its weight.

| Ship size | Minimum pilotage charge |
|---|---:|
| Up to 3,000 GRT | USD 6,000 |
| Over 3,000 to 15,000 GRT | USD 14,500 |
| Over 15,000 GRT | USD 25,300 |

*Source: Adani Hazira Port Berthing Policy and Tariff Structure, issue 3 revision 14, p. 26, section IV.B(i).*

A **fuel surcharge of USD 0.225070 per GRT** is charged separately; it does **not** apply to LNG ships. That rate comes from the *Hazira fuel surcharge on pilotage* circular dated 1 October 2026, p. 1. The port reviews it fortnightly, so check the latest notice before relying on it.

## what-changed-paradip

> What changed in Paradip's port charges this year?

Paradip introduced a new **Scale of Rates effective 10 October 2026**. Compared with the schedule in force from 1 May 2026, the main changes for foreign-going ships are:

| Charge | Previous rate | New rate |
|---|---:|---:|
| Port dues | USD 0.34 per GRT | USD 0.408 per GRT |
| Pilotage and towage, up to 30,000 GRT | USD 0.7148 per GRT | USD 0.8578 per GRT |
| Berth hire | USD 0.003338 per GRT per hour | USD 0.004006 per GRT per hour |

**GRT** is a measure of a ship’s internal volume. *Pilotage and towage* covers the pilots and tugs used to move the ship in and out. Larger ships have banded pilotage and towage rates, which also changed. The new schedule lists cargo charges (*wharfage*), but the comparison does not give previous wharfage rates, so I can’t say how those changed.

These are tariff rates, not a port-call total. The schedule was last checked on 25 October 2026. Source: [Paradip Port Authority Scale of Rates 2026](https://www.paradipport.gov.in/uploads/2026/09/Scale-of-Rates-2026-_18092026_compressed.pdf), pp. 17, 18 and 25.

## coverage

> Which ports do you cover?

I cover these Indian ports:

- Mumbai
- Jawaharlal Nehru Port (JNPA/Nhava Sheva)
- JSW Jaigarh
- New Mangalore
- Paradip
- Deendayal (Kandla and Vadinar)
- Chennai
- Kamarajar (Ennore)
- Adani Mundra
- Adani Hazira
- Adani Kattupalli
- Gujarat Pipavav

Coverage includes port-call charges, though some terminals and specialised calls have pricing gaps. The rate schedules were last checked on 25 October 2026.

## draft-chennai

> What's the permissible draft at Chennai's berths?

Chennai Port Authority lists these **permissible drafts** by berth, as of 01 January 2026:

| Dock | Berth | Permissible draft |
|---|---|---:|
| Dr. Ambedkar | 19A North Quay | 8.50 m |
| Dr. Ambedkar | 18A West Quay 1 | 11.00 m |
| Dr. Ambedkar | 17A West Quay 2; 16A Centre Berth; 15A West Quay III | 12.00 m |
| Dr. Ambedkar | 14A West Quay IV | 11.00 m* |
| Dr. Ambedkar | 13A South Quay 1; 6A South Quay II | 9.50 m |
| Dr. Ambedkar | 5A, 4A and 3A CITPL-SCB | 15.00 m† |
| Jawahar | 12J JD-1; 09J JD-6 | 12.50 m‡ |
| Jawahar | 11J JD-3; 10J JD-5 | 13.00 m |
| Jawahar | 07J JD-2; 08J JD-4 | 14.00 m |
| Bharathi | 26B Bharathi Dock 1 | 14.60 m |
| Bharathi | 24B Bharathi Dock II; 27B Bharathi Dock III | 16.50 m§ |
| Bharathi | 20B–22B CCTPL-CTB 1–3 | 13.40 m |
| Bharathi | 23B CCTPL-CTB 4 | 15.00 m |
| Bharathi | 01B Coastal Berth 1 | 11.00 m |
| Bharathi | 02B Coastal Berth 2 | 10.00 m |
| Bharathi | Bunker Berth | 9.00 m |

\* The port adds a location-specific note for 14A: “11M upto 795 Mtrs. 9.5M upto 810 mtrs.”  
† For the CITPL-SCB berths, the port specifies **port side alongside from 12.5 m onwards**.  
‡ The port permits **13.00 m during high water** at 09J.  
§ The port permits **17.00 m during high water** at 27B.

Source: Chennai Port Authority, *BERTH DETAILS – Permissible Draft at Berths as on 01.01.2026*, p. 1.

## documents-mundra

> What documents do I need to submit before arriving at Mundra?

For a vessel arriving at **Mundra**, your agent should submit the pre-arrival documents through the port’s APMS/IPOS system. The port also requires **official vessel acceptance before the vessel is fixed to call at Mundra**. [Mundra vessel-declaration procedure, p. 1](https://www.adaniports.com/-/media/project/ports/portsandterminals/mundra-documents/marine-documents/standard-procedure-for-vessel-declarations-ndc-and-submission-of-documents.pdf)

**For every vessel declaration, prepare:**

- The berthing application, vessel and cargo particulars, and vessel-acceptance navigational checklist.
- Ship particulars and certificates for tonnage, registry, class, load line, safety equipment, safety construction, safety radio, safe manning, security, air-pollution prevention, oil-pollution prevention, and ballast-water management.
- The document of compliance, Safety Management Certificate, ship sanitation control exemption, P&I insurance certificate, wreck-removal liability certificate, the listed civil-liability certificates, and the owner’s or operator’s agency appointment letter.
- Pre-arrival notices at **5, 3, 2 and 1 days**, including the notice required under the ship-security code.

These are listed across pages 1–2 of the [Mundra vessel-declaration procedure](https://www.adaniports.com/-/media/project/ports/portsandterminals/mundra-documents/marine-documents/standard-procedure-for-vessel-declarations-ndc-and-submission-of-documents.pdf). The procedure also says to submit the **prior IGM to the Port Operations Centre 24 hours before arrival**. [p. 2](https://www.adaniports.com/-/media/project/ports/portsandterminals/mundra-documents/marine-documents/standard-procedure-for-vessel-declarations-ndc-and-submission-of-documents.pdf)

If this is the vessel’s **first Mundra call**, the agent must first create its vessel definition in IPOS and upload ship particulars, the international tonnage certificate, class certificate and registry certificate. The port says it will not generate the vessel-call number if the definition or required certificates are incomplete. [Procedure, pp. 1–2](https://www.adaniports.com/-/media/project/ports/portsandterminals/mundra-documents/marine-documents/standard-procedure-for-vessel-declarations-ndc-and-submission-of-documents.pdf)

**Extra documents depend on the cargo.** For bulk or breakbulk calls, the procedure lists a stowage plan and loading or discharge sequence, plus cargo-specific items such as a packing list for breakbulk. For liquid-cargo vessels, it lists a stowage plan and pre-arrival exchange-information checklist, with temperature reports and heating instructions for heated cargo. Older vessels and liquid tankers may need additional clearances or certificates. [Procedure, p. 2](https://www.adaniports.com/-/media/project/ports/portsandterminals/mundra-documents/marine-documents/standard-procedure-for-vessel-declarations-ndc-and-submission-of-documents.pdf)

Tell me the vessel type and cargo if you want the cargo-specific list narrowed down.

## pilotage-compulsory-mumbai

> Is pilotage compulsory in Mumbai?

Yes. Mumbai Port Authority says pilotage—having a port pilot guide the ship—is compulsory **in and out of the harbour** for ships of **100 net tons or more**. Net tonnage measures a ship’s usable internal space. The cited rule does not state whether smaller ships must use a pilot. [Mumbai Port Authority, *Pilotage*, p. 1](https://mumbaiport.gov.in/WriteReadData/RTF1984/1710398100.pdf)

## night-pipavav

> Can ships enter Pipavav at night?

Yes. Pipavav permits ships to enter and berth at night, **except LPG vessels, which are restricted to daytime navigation**. Night berthing is still subject to the port’s tidal and vessel-specific restrictions, and ships need a pilot to enter. [Our Port, p. 1](https://www.apmterminals.com/en/pipavav/about/our-terminal); [SAFE MEMO – PIPAVAV PORT – INDIA, pp. 1–2](https://cms-cd.apmterminals.com/pipavav/-/media/mainsite/asia-and-pacific/Pipavav/Information/Safe-Memo-Sep-2025.pdf).

## unsupported-port

> What would a call at Colombo cost for a 20,000 GT ship?

I can’t give a reliable cost for Colombo because I don’t have its tariff. I won’t substitute rates from another port.

You’ve given the ship’s gross tonnage (GT), but a call estimate would also need its time alongside and, depending on the tariff, details such as ship type and cargo.

## pilotage-jnpa

> How much is pilotage for a 10000 GT ship at JNPA?

At JNPA, the estimated **pilotage and towage charge is USD 3,464 before GST** for a 10,000 GT ship. JNPA prices them together, so a pilotage-only amount is not available from this rate.

The estimate assumes a foreign-going container ship making both an arrival and a departure movement. If your ship is coastal, or you need just 1 movement, the charge will differ.

## kandla-tanker

> berth hire at kandla for a 20k GT liquid tanker, 36 hours

**Estimated berth hire at Kandla: USD 6,048.00 before GST.** This is for a 20,000 GT liquid tanker alongside for 36 hours at a liquid-cargo berth. I assumed the ship is foreign-going.

This is **berth hire only**, not the full port-call bill. If the ship is coastal-going, or will use the port’s shore cranes, the charge may differ.

## coastal-nmpa

> Estimate port dues and pilotage at New Mangalore for a coastal general cargo ship of 8,000 GRT

At New Mangalore, **port dues and pilotage total ₹1,65,780.80 before GST** for a coastal general cargo ship of 8,000 GRT (gross registered tonnage).

- Port dues: ₹53,260.80
- Pilotage, including tugs and mooring: ₹1,12,520.00

This assumes 1 arrival and 1 departure. It is **not a full port-call estimate**; berth hire and other charges are excluded.

## anchorage-chennai

> What's the anchorage charge at Chennai for a 30,000 GRT bulk ship if it waits 72 hours?

The **anchorage charge at Chennai is USD 907.20 before GST** for a 30,000 GRT bulk ship waiting 72 hours. The first 48 hours are free, so the charge covers 24 hours.

I assumed the ship is foreign-going. The charge does **not** apply if the ship is ready in all respects and waiting for a berth, or if it is anchored for the port’s convenience. Source: *Chennai Port Authority revised Scale of Rates*, section 2.3.4, p. 15.

## fleet-autofill

> Port costs for MV Ocean Star at Paradip, 24 hours alongside

**Estimated port costs at Paradip: USD 43,773.93 before GST** for MV Ocean Star with 24 hours alongside.

The estimate uses the ship’s saved gross tonnage (GRT) of 32,450 and foreign-going status. It assumes an arrival and a departure. The total includes port dues, pilotage and towage, and berth hire. It does not include cargo charges because no cargo quantity was given.

Paradip’s tariff is stated in USD; the port converts it to rupees for payment.

## fleet-save

> Please save our ship Sea Breeze: 12,000 GRT general cargo ship, IMO 9123456

Saved **Sea Breeze** to your fleet: IMO 9123456, 12,000 GRT, general cargo.

I also sent length, net tonnage and trading-status details that you did not provide. They do **not** appear in the saved record.

## company-docs

> What does our charter party say about laytime?

Your **Sample charter party 2026** allows **72 running hours of laytime**, excluding Sundays and holidays. If that allowance is exceeded, demurrage is **USD 18,000 per day, calculated pro rata**. (*Sample charter party 2026*, p. 3, clause 14.)

The passage I found does not say when laytime starts or how notice of readiness works.

## agreed-rates

> Price a call at Hazira for a 30,000 GRT bulk ship for 24 hours, with our agreed rates

For a **30,000 GRT bulk ship alongside at Hazira for 24 hours**, the estimated total before GST is **USD 62,133.24 with your agreed rates**, versus **USD 63,528.60 at published rates**. The agreed rate applies to berth hire; the other charges use published rates.

I assumed a foreign-going ship, with arrival and departure movements. No cargo quantity was given, so **wharfage is not included**. The pilotage fuel surcharge comes from the 1 October 2026 notice and may have changed; check the latest notice before relying on the total.

## general-term

> What is pilotage, in simple words?

Pilotage is when a local navigation expert, called a **pilot**, helps guide a ship into or out of a port. The pilot knows the harbour’s channels, tides and local rules. The ship’s captain remains in command.

## fuel-surcharge-now

> How much is the fuel surcharge at Mundra right now?

Mundra’s published **fuel surcharge on pilotage is USD 0.22696 per GT** (gross tonnage, a measure of a ship’s size). It is added to the regular pilotage charge and took effect on 1 October 2026. The notice was retrieved on 25 October 2026; I can’t confirm from the documents held whether a newer notice has appeared since then. [Mundra fuel surcharge circular, p. 1](https://www.adaniports.com/-/media/project/ports/portsandterminals/mundra-documents/trade-notices/fs_mundra_dtd_01-10-2026.pdf)

## rupees

> Give me the total in rupees at 84.5 per dollar for a 30,000 GT bulk ship at Mundra for 24 hours

The estimated **Mundra port-call total is ₹46,00,028.75 before GST**, using your rate of ₹84.5 per US dollar.

This assumes the 30,000 GT bulk ship is foreign-going, stays alongside for 24 hours, and makes an arrival and a departure. **GT** means gross tonnage, a measure of the ship’s enclosed volume used to calculate these charges.

The estimate uses a fuel surcharge dated 1 October 2026. Mundra revises that surcharge regularly, so check the latest notice before relying on the total.

## tariff-comparison

> Compare how JNPA and Mundra charge container ships

**JNPA and Mundra charge container ships in different ways.** This is a comparison of published tariffs, not a cost estimate. I assumed a foreign-going container ship; without its gross tonnage (GRT), time alongside and terminal, there is no total before GST or reliable cheaper-port ranking.

| Charge | JNPA | Mundra |
|---|---|---|
| Port dues | USD 0.1558 per GRT | USD 0.024344 per GRT, minimum USD 400 |
| Pilotage and tugs | Combined charge with GRT bands | Combined charge with GRT bands, **plus** a fuel surcharge of USD 0.22696 per GRT |
| Berth hire | USD 0.0053 per GRT per started hour at GTI, NSICT and NSFT. NSIGT and BMCT instead publish rupee rates. | USD 0.011584 per GRT per hour, minimum USD 810 per day |
| Other ship charges | Anchorage is charged if used. | Mooring and a sustainability charge apply. An environment-protection charge also applies at the MICT container berths. Anchorage is charged if used. |

*GRT* measures a ship’s enclosed volume; it is not its cargo weight. *Pilotage* is the service of guiding the ship into or out of port.

JNPA’s berth-hire currency depends on the container terminal, so choosing a terminal matters. Mundra’s pilotage fuel surcharge can change with fuel prices; the rate shown is from its 1 October 2026 circular. These tariffs were checked on 25 October 2026.

Sources: [JNPA Scale of Rates, pp. 2–3, 6](https://www.jnport.gov.in/uploads/content_manager/SOR_w_e_f_01_05_2026_including_MBPA.pdf); [NSIGT Scale of Rates, p. 3](https://www.jnport.gov.in/uploads/content_manager/Scale_of_Rates_1st_April_2026.pdf); [BMCT Scale of Rates, p. 3](https://www.jnport.gov.in/uploads/content_manager/SoR-_BMCT_w_e_f_06-Apr-2026.pdf); [Mundra tariff, pp. 30–32](https://www.adaniports.com/-/media/project/ports/portsandterminals/mundra-documents/tariff/berthing-policy-and-tariff-structure-wef-15th-june-2026.pdf); [Mundra fuel-surcharge circular, p. 1](https://www.adaniports.com/-/media/project/ports/portsandterminals/mundra-documents/trade-notices/fs_mundra_dtd_01-10-2026.pdf).

## kamarajar-container

> Kamarajar charges for a 50,000 GT container ship, 20 hours alongside

The estimated **Kamarajar port-call cost is USD 75,710 before GST** for a 50,000 GT container ship alongside for 20 hours. This covers port dues, pilotage and towage, and berth hire at Adani Ennore Container Terminal. Pilotage is the service of guiding the ship into and out of port.

I assumed a foreign-going ship making an arrival and departure. No exchange rate was given, so I have not converted the total to rupees. The terminal’s berth-hire rate is a published ceiling and it may charge less. The port’s vessel-charge schedule may also be out of date; no later revision was found.

## cheapest-small

> What's cheaper for a 15,000 GRT general cargo ship staying 12 hours: Jaigarh or Pipavav?

I can’t reliably say which port is cheaper yet. The **before-GST figures are incomplete**, so they are not comparable:

- **Jaigarh:** USD 675.00 priced so far. Its remaining charges depend on the berth.
- **Pipavav:** USD 13,800.00 priced so far. Its published schedule has no berth-hire rate for a foreign-going general cargo ship.

I assumed the ship is **foreign-going** and makes an arrival and departure movement. Which berth would it use at Jaigarh?

## lng-mundra

> LNG carrier of 90,000 GT at Mundra for 2 days, what are the charges?

**Estimated Mundra charges: USD 171,179.99 before GST** for a 90,000 GT LNG carrier alongside for 2 days.

The largest charges are pilotage (the service of guiding the ship into and out of port) at USD 101,297.25, berth hire at USD 40,383.54, and a pilotage fuel surcharge of USD 20,426.40. The estimate also includes port dues and other standard charges.

I assumed a foreign-going ship at the LNG terminal, with an arrival and a departure. **Mooring is not priced** because the schedule does not give a rate for this ship. The fuel surcharge uses the notice dated 1 October 2026; Mundra revises it regularly, so check the latest notice before relying on the total.

## vlcc-chennai

> How much would a VLCC of 160,000 GT pay in berth hire at Chennai for a day?

**Berth hire at Chennai: USD 30,720 before GST** for a VLCC of 160,000 GT alongside for 24 hours.

I assumed it is a foreign-going ship. This is berth hire only, not the full port-call bill. The tariff says dollar-denominated charges are collected in rupees at the applicable reference rate; no conversion rate was provided.

## wharfage-coal

> We're discharging 50,000 tonnes of imported coal at Paradip from a foreign-going 32,000 GT bulk carrier. What will wharfage come to?

Wharfage for discharging **50,000 tonnes of imported coal at Paradip** is estimated at **₹30,21,500 before GST**. The calculation is 50,000 tonnes × ₹60.43 per tonne. Wharfage is a cargo charge, usually paid by the cargo owner; it is separate from the ship’s port-call charges.

This uses the conventional-handling rate for the smallest annual import-volume band. Larger annual volumes, or handling through the mechanised coal plant, would have different rates. Source: *Paradip Port Authority Scale of Rates 2026*, p. 32.

## wharfage-containers

> Berthing charges at Chennai for a 25,000 GRT container ship, 24 hours alongside, discharging 400 TEU

**Estimated Chennai charges before GST:** **USD 25,770.00** for the ship, plus **INR 5,29,600.00** in container wharfage. Wharfage is a cargo charge, usually paid by the cargo owner. The currencies are kept separate because you did not provide an exchange rate.

The estimate assumes a foreign-going ship, an arrival and departure, and that all **400 TEU** are loaded 20-foot containers. Chennai charges 40-foot containers at a different rate, so the wharfage will change if the mix differs.

The ship total includes port dues, pilotage (the charge for guiding the ship in and out), and berth hire for **24 hours**. **Tugs are not included:** Chennai’s schedule does not say whether they are covered by pilotage.

## freshness-mumbai

> Are your Mumbai rates up to date?

Yes. I last checked the Mumbai Port Authority rates on **25 October 2026**. The schedule I hold covers **1 May 2026 to 30 April 2027**, and I use the indexed berth-hire rates effective **9 May 2026**, rather than the lower base rates also shown in the amendment. Sources: *Mumbai Port Authority Scale of Rates (updated May 2026)*, p. 22, and *berth hire amendment (May 2026)*.

There is a coverage limit: the pilotage and towage rates I have entered are for ships berthing in the docks. I do not have those rates entered for the stream, Jawahar Dweep or Pir Pau, or for shifting movements.
