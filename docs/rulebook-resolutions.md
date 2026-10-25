# Rule book: second reading and how differences were settled

Two readers entered the same 12 ports independently from `data/sources/`:

- **First reading:** `data/rulebook/` (Claude), commit `67057e0`.
- **Second reading:** Codex, commit `ffd6f16` on branch `codex/rulebook-second-reading` (`data/rulebook-codex/`). Codex did not see the first reading.

Both readings were run through the same calculator for every port, terminal, berth, vessel type, foreign and coastal status, call date and the ship sizes on either side of every band limit (14,700 calls, each priced with both readings). Every difference was checked against the source document. Outcomes:

- **Kept:** the first reading matches the document.
- **Fixed:** the second reading was right, or both missed something; `data/rulebook/` was corrected.
- **Note:** the charge is real but can't be priced reliably for a normal call, so it is explained in a note that the agent can quote.

Checked on 25 October 2026.

## Format changes this needed

- `minimumPer: "hour" | "day"`: minimums such as "US$ 810 per day" or "USD 9.82 per hour" now grow with the stay; each started day counts.
- `minimumHours`: "minimum for 24 hours" (Pipavav dry bulk).
- The calculator now ignores charges that have no rate for the ship (for example a port's general pilotage for an LNG carrier that pays the LNG terminal's tariff) instead of reporting them as missing or "included".
- The checker joins figures that a converted table split across cells ("32|,289").

## By port

| Port | Difference | Finding | Outcome |
|---|---|---|---|
| Mumbai | Port dues and pilotage only in the first reading | Codex could not fit the banded tables into one quote and left them out; first reading's bands match the tables. | Kept |
| JNPA | Pilotage minimum US$ 275.40 / Rs. 7,217.62 | Printed in note (2) of 2.2. Codex left it out. | Kept |
| JNPA | Berth hire at NSFT | NSFT's tariff covers container handling only and has no ship charges at all, so, as at GTI and NSICT, JNPA's all-berths rate applies. | Fixed: JNPA's rate applied (as Codex read it) |
| JNPA | Port dues for passenger ships | Row 2 covers "vessels of 10 tonne and upward other than those covered above". | Kept |
| Jaigarh | Berth hire started hours vs exact hours | Printed "per GRT per hour" without "or part thereof". | Fixed: exact hours |
| Jaigarh | Extra pilotage by ship age (J-8) | Only Codex noted it. | Note |
| New Mangalore | Pilotage minimum US$ 1,580.70 / Rs. 42,194 | Printed. Codex left it out. | Kept |
| New Mangalore | Per-hour berth hire minimums (US$ 8.10 / 9.82, Rs. 216.52 / 262.83) | Neither reading could apply them. | Fixed: `minimumPer: "hour"` |
| New Mangalore | Anchorage after sailing from the berth (coastal) | Pre-berthing anchorage is free; the post-berth foreign rate is printed as "USD 0.00075 cents". | Note |
| New Mangalore | SPM pilotage | Separate single point mooring rate. | Note (SPM calls not priced) |
| Paradip | Start of the new schedule: 11 vs 10 October 2026 | "After 30 days from notification" on 10 September. Paradip's own tariff page lists it as "w.e.f. 10/10/2026". | Fixed: 10 October (as Codex read it) |
| Paradip | Pilotage only in the first reading | Codex left the banded table out. The first reading's bases (21,444; 38,592; 45,025.50) match. | Kept |
| Paradip | Roadstead charge (Codex: anchorage) | Charged only to ships lying at the roads for reasons other than waiting for a berth or cargo. | Note in both versions |
| Paradip | SBM pilotage | Separate single buoy mooring tariff. | Note (SBM calls not priced) |
| Deendayal | Pilotage only in the first reading | Codex left the banded table out. | Kept |
| Deendayal | Kandla "mooring charges" (Codex: on every call) | Charged to ships at stream moorings instead of berths; adding it to berth calls would double-charge. | Kept (not priced) |
| Deendayal | Outer anchorage rates | Cheaper than the inner anchorage used. | Note |
| Chennai | Start date: 11 vs 10 July 2026 | "After expiry of 30 days" from 10 June, the same Tariff Policy clause Paradip reads as day 30. | Fixed: 10 July (as Codex read it) |
| Chennai | Codex pilotage of US$ 143,136 for a 500 GRT ship | Codex's tug-hire line was multiplied by the whole berth stay. Tugs are hired by the hour of use. | Kept (tug hire in a note) |
| Chennai | Coastal pilotage minimum Rs. 32,289 | Split across two cells; confirmed in the PDF. | Fixed |
| Chennai | Berth hire minimum US$ 909.62 / Rs. 24,256 | Printed. Codex left it out. | Kept |
| Chennai | Anchorage fee (first 48 hours free) | Only Codex entered it. | Fixed: added, only when anchorage time is given |
| Chennai | Cruise ships | Fixed cruise tariff instead of vessel charges. | Note |
| Kamarajar | Version start: 4 June 2019 vs 23 July 2025 | Vessel rates date from 2019; 2025 is the latest unrelated amendment. | Kept |
| Kamarajar | Per-hour berth hire minimums | Printed under the rates. | Fixed: `minimumPer: "hour"` |
| Kamarajar | Container pilotage minimum | The minimum row covers the container column. | Kept |
| Kamarajar | Container berth hire (Codex: "Others" rate) | The table covers coal, general cargo and finger-jetty berths only. | Kept (not priced) |
| Kamarajar | Dry bulk anchorage slabs | Unclear in the Scale of Rates; the 2016 trade notice that introduced them is reported to say "per GRT per hour or part thereof", but the port's site refused downloads. | Note (not priced until checked) |
| Mundra | Pilotage only in the first reading | Codex left the banded minimums out. | Kept |
| Mundra | LNG terminal tariff | Port dues "[Except SPM/LNG/MCOT/STS]"; LNG ships have their own port dues, pilotage, berth hire per day and anchorage per day. | Fixed: LNG carriers priced at the LNG tariff |
| Mundra | Mooring for LNG ships | "Mooring charges is not applicable to LNG". | Fixed |
| Mundra | Berth hire and anchorage rounding | Printed per hour without "or part thereof". | Fixed: exact hours |
| Mundra | Berth hire minimum US$ 810 per day | Neither reading could apply it. | Fixed: `minimumPer: "day"` |
| Mundra | Fuel surcharge for LNG carriers | The 2022 circular that introduced it applies it "for all the vessel coming at Mundra port"; Hazira's tariff, unlike Mundra's, exempts LNG. | Kept (applied); circular added to sources |
| Mundra | Environment charge for "other" ships and MICT container ships | Applies to ships calling for "miscellaneous activities" and at MICT (DP World) berths. | Fixed; container terminals added |
| Hazira | Pilotage minimums by size | Printed. Codex left them out. | Kept |
| Hazira | Tanker berth hire | Codex left it out because of a gap between "15001 to 30000" and "more than 30001". | Kept |
| Hazira | Berth hire rounding and US$ 900-per-day minimum | Exact hours; "Per day" is defined as 24 hours with any part counting as a full day. | Fixed |
| Kattupalli | Pilotage only in the first reading | Codex left the lump-sum and banded table out. | Kept |
| Kattupalli | Berth hire rounding and per-day minimum | Exact hours; US$ 805 / Rs. 13,420 per day. | Fixed |
| Kattupalli | TNMB anchorage | Rs. 0.90 per GT per day after the first 30 days, with daily minimums. | Fixed: added with 30 free days |
| Pipavav | Mooring and sustainability charges | Sections XI and XII; the first reading missed them. | Fixed |
| Pipavav | Pilotage minimum US$ 1,000 (non-container) | Printed. Codex left it out; the first reading missed it for Ro-Ro. | Fixed for Ro-Ro |
| Pipavav | Tanker and dry bulk berth hire minimums | "US$ 1000 for 24 hours" (same words in the 2025 tariff); "Minimum for 24 hours". Matters only for tankers under about 2,100 GRT. | Fixed (tankers per 24 hours; dry bulk at least 24 hours) |
| Several | Passenger ships | Codex left passenger ships out where the schedule has no passenger row; the first reading uses the "other vessels" row. | Kept |

## Not settled by reading

These need the port or the client to confirm. They are listed as known gaps for handover:

- Kamarajar: whether its dry bulk anchorage slabs are per hour (the 2016 trade notice could not be found on an official site).
- How Pipavav applies its tanker berth-hire minimum (only tankers under about 2,100 GRT are affected).

Settled after the first write-up (25 October 2026): Paradip's and Chennai's start dates, berth hire at NSFT, and Mundra's fuel surcharge for LNG carriers.

Settled later the same day: Kamarajar container berth hire (Adani Ennore Container Terminal reference tariff 2026-27, from 1 April 2026), Kattupalli coastal container pilotage (two rates read from the PDF), Kattupalli's 10% surcharge on port dues, and Chennai's VLCC berth hire. All 12 ports' questions for the client are in `docs/handover/port-questions.md`.
