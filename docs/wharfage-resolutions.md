# Wharfage: second reading and how differences were settled

Two readers entered wharfage for the 12 ports independently from `data/sources/`:

- **First reading:** `data/rulebook/` (Claude), entered by `scripts/rulebook/wharfage.py`, commit `393f6f2`.
- **Second reading:** Codex, commit `71f07b6` on branch `codex/wharfage-second-reading` (`data/rulebook-codex/wharfage/`), following [codex-wharfage-reading.md](codex-wharfage-reading.md). Codex did not see the first reading.

Both readings were compared rate by rate: each cargo kind, unit (per tonne, per 20-foot or 40-foot box), part (box or cargo inside), import or export, and terminal, for foreign and coastal cargo. **140 rates were identical and 37 differed.** Each difference was checked against the document; after the fixes 143 match, and the 20 that remain are deliberate (Kept or Note below). Checked on 26 October 2026.

- **Fixed:** the second reading was right; `scripts/rulebook/wharfage.py` and `data/rulebook/` were corrected.
- **Kept:** the first reading matches the document for a normal call.
- **Note:** not priced, with the reason shown in the estimate.

| Port | Difference | Finding | Outcome |
|---|---|---|---|
| Pipavav | Liquid cargo (crude, oil products, LPG, LNG, chemicals, edible oil) priced per tonne in the first reading only | Definition 20 (page 3): for liquids in bulk lighter than water, a "tonne" is 1,000 litres, so a cargo weight would undercharge oil by about a fifth. | Fixed: not priced, with that reason |
| Pipavav | Fertiliser raw materials | Rock phosphate Rs. 60 is printed (page 17); sulphur is Rs. 80. As at Hazira, the rock phosphate row is used and sulphur is named. | Fixed: Rs. 60, sulphur in the conditions |
| Mumbai | Crude oil, liquid chemicals and edible oil at Jawahar Dweep and Pir Pau rates (section 3.2) in the first reading only | The docks rows (page 28) differ from 3.2 (page 36), and the rule book prices Mumbai's docks only, as it already did for oil products. | Fixed: not priced, with the reason |
| Mumbai | Export containers: Rs. 2,489 / 1,493 per 20-foot and Rs. 3,733 / 2,241 per 40-foot box on the cargo inside, in the second reading only | Section 4(E)(5), page 49; the PDF confirms the sizes the Markdown lost. Import containers pay commodity wharfage (4(E)(1)). | Fixed: export rates added; import containers not priced, with the reason |
| Mumbai | Steel at the Port Authority's berths (import Rs. 299 / 179, export Rs. 199 / 120) | Codex left steel out because the Offshore Container Terminal's rates differ. Berthwise prices calls at the Port Authority's docks, where these rates apply; the OCT rates are in the conditions. | Kept |
| JNPA | Liquid cargo at the JSW JNPT Liquid Terminal (Rs. 252 / 151.20 a tonne) in the second reading only | The terminal's tariff says its cargo charges apply "till 31st March 2025" (page 3), and no later rate is in our documents. | Note: not priced, the reason names the expiry |
| New Mangalore | Container wharfage from table 4.1(b) (Rs. 536.76 / 322.05 per 20-foot box) in the second reading only | A loaded container pays the composite box rate, which "covers wharfage"; 4.1(b) is headed "other types of containers (including Reefer)". Asked of the client ([port-questions.md](handover/port-questions.md), question 7). | Kept: not priced |
| New Mangalore | Crude oil Rs. 96.60 | Row (d) is the ordinary crude rate at a berth; crude through the single point mooring (Rs. 34.90) is in the conditions. Berthwise prices berth calls. | Kept |
| Deendayal | Crude oil: Rs. 28.38 at Vadinar (single buoy moorings), Rs. 36.50 at Kandla (oil jetties) | The schedule ties its SBMs to Vadinar (pages 7 and 12) but also mentions jetties there. The split is kept and shown as an assumption on the estimate. | Kept, with the assumption shown |
| Deendayal | 40-foot loaded containers (Rs. 1,503.29 / 901.97) in the second reading only | The 20-foot row's decimal points are lost in the Markdown (Codex read Rs. 1,010.41 / 606.25 in the PDF). Pricing only 40-foot boxes would leave 20-foot boxes out silently. | Note: not priced until the Markdown copy is regenerated |
| Deendayal | Diesel, petrol, naphtha, fuel oil and jet fuel at the general "POL Products" rate (Rs. 70.96) | Codex entered only the general row; Berthwise falls back to it for each product anyway, so prices are the same. | Kept |
| Mundra | Fuel oil: Rs. 115 (Furnace Oil) against Rs. 95 ("Lubricating Oil (fuel oil)") | Both rows are printed (pages 45 and 46). The furnace oil row is used, the other is named in the conditions, and the client is asked (question 8). | Kept |
| Hazira | "Oil products" priced from the petrol/diesel/SKO/furnace oil row | That row names products; a general oil-products request should ask which product, as Codex read it. | Fixed |
| Kattupalli | Coal at "All other minerals" (Rs. 60.50) in the second reading only | Coal isn't named; the tariff refers unlisted cargo to the Tamil Nadu Maritime Board's own scale, which we don't hold. | Kept: not priced, with the reason |

Codex also listed cargo kinds with no printed row at each port (for example coal and LPG at Chennai). In both readings these aren't priced; Berthwise says it holds no wharfage rate for that cargo at that port.
