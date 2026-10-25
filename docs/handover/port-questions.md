# Port questions for the client

Berthwise v1 prices port calls at 12 Indian ports from each port's published rate schedule. Two independent readings of every schedule were compared and every difference was checked against the documents (see `docs/rulebook-resolutions.md`). A few points remain where the port's own wording is unclear. Your invoices are the quickest way to settle them.

Last updated: 25 October 2026.

## The 12 ports stay

No port is being swapped. Every port has a few gaps like the ones below, and the alternatives checked (V.O. Chidambaranar, Cochin, Visakhapatnam) don't have cleaner current documents. Kamarajar is the weakest, and its two missing documents are being fetched. It would be replaced only if they can't be found.

## Please confirm

Most important first. "What Berthwise does now" is how estimates behave until you answer.

| # | Port | Question | Why it matters | What Berthwise does now | Source |
|---|---|---|---|---|---|
| 1 | Chennai | Does pilotage include the berthing tugs, or are tugs billed separately per hour (Rs. 39,354 / US$ 1,491 per tug per hour, minimum 2 hours)? | If separate, a typical call could be missing about US$ 12,000 (2 tugs for 2 hours, arriving and leaving). | Tugs are not added; the estimate says so. | Tamil Nadu Gazette, 10 June 2026, pages 11 and 13 |
| 2 | Kamarajar | Is dry bulk anchorage after the first 48 hours charged per GRT **per hour**, or once per time band? | Ships waiting more than 2 days. | Anchorage is not priced. | Scale of Rates, page 8, section 5 |
| 3 | Kamarajar | At the container terminals, who charges berth hire, and at what rate? | Container ships only. | Container berth hire is not priced. | Scale of Rates, page 7, section 4 |
| 4 | Jaigarh | Berth hire is in US dollars but its minimum is in rupees (Rs. 25,000 up to 30,000 GT, Rs. 50,000 above). How is the minimum applied? | Small ships. | The minimum is not applied. | Tariff 1 May 2026, page 1, table J-6 |
| 5 | Jaigarh | Is a part day at anchorage billed as a full day? | Short anchorage stays. | Exact days are used. | Tariff 1 May 2026, page 2, table J-7 |
| 6 | Pipavav | The tanker berth-hire minimum reads "US$ 1000 for 24 hours". Is it per day, or once per call? | Only tankers under about 2,100 GRT (gas tankers under about 1,750 GRT). | Read as US$ 1,000 for each 24 hours. | Tariffs 1 January 2026, page 9 |
| 7 | New Mangalore | Anchorage after leaving the berth: the foreign rate is printed as "USD 0.00075 cents" (minimum USD 1.52 per hour). What is the real rate? | Rare: waiting before berthing is free. | Not priced. | Scale of Rates 2026-27, page 35 |

## Being fixed by the team (no answer needed)

- **Kattupalli, coastal container ships:** the pilotage table was garbled when converted to text; it will be read from the PDF.
- **Kattupalli, port dues:** the Tamil Nadu Maritime Board's 10% surcharge on port dues will be added (about INR 31,200 for a 30,000 GRT ship).
- **Chennai, very large crude carriers (VLCCs):** their higher berth-hire rate will be added.
- **Kamarajar:** the 2016 anchorage notice and the container terminals' tariffs are being fetched.

## Already settled

| Port | Point | Answer and evidence |
|---|---|---|
| Paradip | Start of the 2026 schedule | 10 October 2026: the port's tariff page lists "Scale of Rate w.e.f. 10/10/2026". |
| Chennai | Start of the 2026 schedule | 10 July 2026: same "after 30 days" rule, counted as Paradip counts it. |
| JNPA | Berth hire at NSFT | NSFT's tariff has no ship charges at all, so JNPA's berth hire applies, as at GTI and NSICT. |
| Mundra | Fuel surcharge for LNG carriers | Charged: the 2022 circular applies it "for all the vessel coming at Mundra port". |

## Not priced in v1

These are shown to users as "not priced", with the reason.

- Calls at offshore buoy moorings (SPM/SBM) at Paradip, New Mangalore and Mundra, and Mundra's crude oil jetty: charged by contract or by their own tariffs.
- Cruise ships at Chennai: a separate cruise tariff.
- Jaigarh's extra pilotage by ship age: Berthwise doesn't ask for a ship's age.
- Pipavav: berth hire for general cargo ships, and pilotage for tankers over 60,000 GRT, aren't published.
- Paradip's roadstead charge: it applies only to ships lying at the roads for reasons other than waiting for a berth or cargo.
- JNPA's share of Mumbai port dues for ships calling at both ports (rare).
- Ship details: users type a ship's details once and they are remembered ("My fleet"). There is no automatic look-up by IMO number, because the services that provide tonnage by IMO number are paid.
