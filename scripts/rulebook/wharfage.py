"""Enters wharfage into data/rulebook/<port>.json from the rows listed in WHARFAGE.

Each row is found in the port's Markdown copy by a verbatim piece of its table line;
the figures written here must appear in that line, and the line itself becomes the
charge's quote, so tests/berthwise/rulebook-data.test.ts can check them again.
Re-running replaces the wharfage charges it wrote before.

    python3 -I scripts/rulebook/wharfage.py
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
POL = ["petroleum-products", "diesel", "petrol", "naphtha", "fuel-oil", "jet-fuel"]


def row(needle, foreign=None, coastal=None, when=None, rate=None):
    return {"needle": needle, "foreign": foreign, "coastal": coastal, "rate": rate, "when": when or {}}


def charge(key, label, classes, rows, basis="tonne", context=(), conditions=()):
    return {"key": key, "label": label, "classes": classes, "rows": rows, "basis": basis, "context": list(context), "conditions": list(conditions)}


WHARFAGE = {
    "mumbai": {
        "doc": "sor-2026-05", "versions": ["mumbai-indexed-2026-27"],
        "conditions": ["Charged on the gross weight in the bill of lading or manifest; cargo handled overside pays half."],
        "charges": [
            charge("coal", "coal", ["coal", "coking-coal"], [row("|(ii)|Coal and Fire Wood|Tonne|124|124|", "124", "124")]),
            charge("iron-ore", "iron ore", ["iron-ore"], [row("|(iii)|Iron ore and Iron ore pellets|Tonne|89|89|", "89", "89")]),
            charge("fertilizer", "fertilisers and raw materials", ["fertilizer", "fertilizer-raw-materials"], [row("|(iii)|Sulphur, Fertilisers and Fertiliser<br>raw materials|Tonne|111|66|", "111", "66")]),
            charge("food-grains", "food grains", ["food-grains"], [row("|(iv)|Foodgrains, Oilseeds, Cereals and<br>Pulses.|Tonne|89|53|", "89", "53")]),
            charge("cement", "cement and clinker", ["cement"], [row("|4 (i)|Cement, Clinker|Tonne|89|53|", "89", "53")]),
            charge("steel", "iron and steel", ["steel"], [
                row("||Import|Tonne|299|179|", "299", "179", {"directions": ["import"]}),
                row("||Export|Tonne|199|120|", "199", "120", {"directions": ["export"]}),
            ], context=["|13|Iron and Steel Materials (excluding<br>scrap, dross and ores)||||", "||At MbPA berths||||"],
                conditions=["Rates at the Port Authority's own berths; steel at the Offshore Container Terminal (OCT) berths pays Rs 389 a tonne on import and Rs 259 on export (foreign cargo)."]),
            charge("crude-oil", "crude oil", ["crude-oil"], [row("Crude Oil|108.79|108.79|", "108.79", "108.79")],
                context=["##### **3.2** **<u>Wharfage charges leviable at Jawahar Dweep and Pir Pau</u>**"], conditions=["Rate at Jawahar Dweep."]),
            charge("chemicals", "liquid chemicals", ["chemicals"], [row("in bulk|183.77|110.26|", "183.77", "110.26")],
                context=["##### **3.2** **<u>Wharfage charges leviable at Jawahar Dweep and Pir Pau</u>**"]),
            charge("edible-oil", "edible oil", ["edible-oil"], [row("|3.|Edible oil handled at Pir Pau|50.11|30.05|", "50.11", "30.05")], conditions=["Rate at Pir Pau."]),
        ],
        "notPriced": [
            {"type": "wharfage", "cargoClasses": POL + ["lpg"], "reason": "At Mumbai, wharfage on oil products and LPG differs between Jawahar Dweep and Pir Pau, so it isn't included.", "page": 36},
            {"type": "wharfage", "cargoClasses": ["containers"], "reason": "At Mumbai, containers pay wharfage on the cargo inside them by commodity, so container wharfage isn't priced separately.", "page": 47},
        ],
    },
    "jnpa": {
        "doc": "nsict-2026", "versions": ["jnpa-indexed-2026-27"], "charges": [],
        "notPriced": [
            {"type": "wharfage", "cargoClasses": ["containers"], "reason": "At JNPA, wharfage on containers is part of each container terminal's handling charge, which this estimate doesn't include.", "needle": "**2.10** The consolidated charges as above include"},
            {"type": "wharfage", "reason": "JNPA's schedules we hold don't price wharfage on bulk or liquid cargo, so it isn't included."},
        ],
    },
    "jaigarh": {
        "doc": "tariff-2026-05", "versions": ["jaigarh-2026-05"],
        "conditions": ["Maharashtra Maritime Board wharfage, collected by the port."],
        "charges": [
            charge("coal", "coal and coke", ["coal", "coking-coal"], [row("|Coal, Coke, Charcoal, Firewood|M.Ton|40|", rate="40")]),
            charge("iron-ore", "iron ore", ["iron-ore"], [row("|Iron Ore and Iron Ore Pellets|M.Ton|40|", rate="40")]),
            charge("fertilizer", "fertilisers and raw materials", ["fertilizer", "fertilizer-raw-materials"], [row("|Fertiliser and Fertiliser Raw Materials|M.Ton|90|", rate="90")]),
            charge("steel", "steel coils", ["steel"], [row("|HR / CR Coils|M.Ton|90|", rate="90")], conditions=["Steel pipes, plates and sheets pay Rs 100 a tonne."]),
            charge("lpg", "LPG", ["lpg"], [row("|LPG, Butane, Propane|M.Ton|370|", rate="370")]),
            charge("edible-oil", "vegetable oil", ["edible-oil"], [row("|Seeds, Vegetable Oil (Bulk)|M.Ton|90|", rate="90")]),
            charge("food-grains", "food grains", ["food-grains"], [row("|Food grains and pulses|M.Ton|90|", rate="90")]),
            charge("cement", "cement and clinker", ["cement"], [row("|Cement, Clinker|M.Ton|45|", rate="45")]),
        ],
        "context": ["**_J-20 Wharfage Charges Asper Maharashtra Maritime Board as amended time to time.(effecti_**"],
    },
    "mundra": {
        "doc": "bpts-2026-06-15", "versions": ["mundra-bpts-2026-06-15-fs-2026-10-01"],
        "charges": [
            charge("coal", "coal", ["coal"], [row("||Coal(Except Cokingcoal)|**M.Ton**|**60/-**|", rate="60")]),
            charge("coking-coal", "coking coal", ["coking-coal"], [row("||Cokingcoal|**M.Ton**|**90/-**|", rate="90")]),
            charge("iron-ore", "iron ore", ["iron-ore"], [row("Iron ore in bulk,<br>Limestone|**M.Ton**|**41/-**|", rate="41")]),
            charge("fertilizer", "fertilisers", ["fertilizer"], [row("||Fertilizers of all types|**M.Ton**|**68/-**|", rate="68")]),
            charge("steel", "steel coils", ["steel"], [row("||Hot rolled and Cold Rolled Coils|**M.Ton**|**85/-**|", rate="85")], conditions=["Steel pipes pay Rs 48 a freight tonne."]),
            charge("oil-products", "oil products", POL, [
                row("||Other Liquid Petroleumproducts|**M.Ton**|**115/-**|", rate="115"),
            ], context=["||HSD|**M.Ton**|**115/-**|", "||Kerosene|**M.Ton**|**115/-**|", "||Naphtha|**M.Ton**|**115/-**|", "||Petrol, LDO|**M.Ton**|**115/-**|", "||Furnace Oil|**M.Ton**|**115/-**|"],
                conditions=["Lubricating oil pays Rs 95 a tonne."]),
            charge("lpg", "LPG", ["lpg"], [row("||LPG|**M.Ton**|**350/-**|", rate="350")]),
            charge("lng", "LNG", ["lng"], [row("||LNG|**M.Ton**|**179.16/-**|", rate="179.16")]),
            charge("chemicals", "liquid chemicals", ["chemicals"], [row("||All other liquid chemicals which are not<br>petroleum orpetroleum derivatives|**M.Ton**|**85/-**|", rate="85")],
                conditions=["Liquid ammonia, phosphoric acid and ethylene pay Rs 160 a tonne."]),
            charge("edible-oil", "edible oil", ["edible-oil"], [row("||Edible oil(bulk)|**M.Ton**|**69/-**|", rate="69")]),
            charge("food-grains", "food grains", ["food-grains"], [row("||Foodgrains and Pulses|**M.Ton**|**68/-**|", rate="68")]),
            charge("cement", "cement and clinker", ["cement"], [row("||Cement, Clinker|**M.Ton**|**75/-**|", rate="75")]),
        ],
        "notPriced": [{"type": "wharfage", "cargoClasses": ["containers"], "reason": "Mundra's tariff we hold has no wharfage on containers; each container terminal charges for container handling itself."}],
    },
    "hazira": {
        "doc": "bpts-rev14-2026-10", "versions": ["hazira-bpts-rev14-2026-10-01"],
        "conditions": ["Hazira Port wharfage (waterfront royalty)."],
        "charges": [
            charge("coal", "coal and coke", ["coal", "coking-coal"], [row("||d|Coal / Steam Coal / Met Coke / Coking<br>Coal / Foundry Coke / Anthrasite Coal<br>/ Pet Coke|**MT**|66|", rate="66")]),
            charge("iron-ore", "iron ore", ["iron-ore"], [row("||e|Iron Ore Pallets / Iron Ore Fines / Iron<br>Ore Coarse / Lumpy Ore|**MT**|74|", rate="74")]),
            charge("fertilizer", "fertilisers and rock phosphate", ["fertilizer", "fertilizer-raw-materials"], [row("||c|Fertilizers & FRM (Rock Phosphate)<br>(DAP, Urea, NPK, MOP)|<br>**MT**|75|", rate="75")], conditions=["Sulphur pays Rs 84 a tonne."]),
            charge("steel", "steel", ["steel"], [row("||a||Steel Coils|**MT**|94|", rate="94")],
                context=["||b|Steel Pipes, Steel Plates / Steel Angles<br>/ Steel Bar / Steel Rebar / Steel<br>Bends/Steel Rail/Any Steel product|**MT**|94|"]),
            charge("crude-oil", "crude oil", ["crude-oil"], [row("||c|Crude Oil|**MT**|135|", rate="135")]),
            charge("oil-products", "petrol, diesel, kerosene and fuel oil", ["petroleum-products", "diesel", "petrol", "fuel-oil", "jet-fuel"], [row("||d|Petrol /Diesel/SKO<br>Furnace oil, bitumen, CBFS|**MT**|135|", rate="135")],
                conditions=["Lube and base oil pay Rs 110 a tonne."]),
            charge("naphtha", "naphtha", ["naphtha"], [row("||a|Naphtha/Ammonia|**MT**|175|", rate="175")]),
            charge("chemicals", "liquid chemicals", ["chemicals"], [row("||a|<sup>All other Liquid Chemicals and</sup><br>Petrochemicals|**MT**|115|", rate="115")], conditions=["Ammonia pays Rs 175 a tonne."]),
            charge("edible-oil", "edible oil", ["edible-oil"], [row("||a|Edible Oil / Vegetable Oil|**MT**|110|", rate="110")]),
            charge("food-grains", "food grains", ["food-grains"], [row("||b|Grains / Chick Peas / Wheat / Yellow<br>Peas / Red Lentils / Rice / Mung Dal/|**MT**|65|", rate="65")]),
            charge("cement", "cement and clinker", ["cement"], [row("||b|Cement, Clinker|**MT**|74|", rate="74")]),
            charge("containers-20", "loaded 20-foot containers", ["containers"], [row("||a|Loaded|**TEU**|696|", rate="696")], basis="box20"),
            charge("containers-40", "loaded 40-foot containers", ["containers"], [row("||b|Loaded|**FEU**|1008|", rate="1008")], basis="box40"),
        ],
    },
    "kattupalli": {
        "doc": "bpts-2025-10-15", "versions": ["kattupalli-bpts-2025-10-15-fs-2026-10-01"],
        "conditions": ["Landing and shipping charges payable to the Tamil Nadu Maritime Board."],
        "charges": [
            charge("containers-20", "loaded 20-foot containers", ["containers"], [row("|b) Landing & Shipping Charges|INR 207.40|INR 311.05|INR 311.05|", rate="207.40")], basis="box20"),
            charge("containers-40", "loaded 40-foot containers", ["containers"], [row("|b) Landing & Shipping Charges|INR 207.40|INR 311.05|INR 311.05|", rate="311.05")], basis="box40"),
            charge("iron-ore", "iron ore (all other minerals)", ["iron-ore"], [row("|2|All other minerals<br>Ton|INR 60.50|", rate="60.50")]),
            charge("steel", "steel coils", ["steel"], [row("|2|Ton<br>Hot rolled and cold rolled coils|INR<br>86.40|", rate="86.40")]),
            charge("food-grains", "food grains", ["food-grains"], [row("|**D**|**Food Grains and Food Products**<br>Ton|INR 43.20|", rate="43.20")]),
            charge("cement", "cement", ["cement"], [row("|**E**|**Cement**<br>Ton|INR 51.85|", rate="51.85")]),
        ],
        "notes": ["Kattupalli's tariff lists only some cargo for the Tamil Nadu Maritime Board's landing and shipping charges and refers to the Board's own scale for the rest, which we don't hold."],
    },
    "pipavav": {
        "doc": "tariffs-2026-01-01", "versions": ["pipavav-2026-01-01"],
        "conditions": ["Payable in rupees by the importer or exporter, on the manifested quantity."],
        "charges": [
            charge("coal", "coal and coke", ["coal", "coking-coal"], [row("|COAL & COKE|T|60|", rate="60")]),
            charge("iron-ore", "iron ore", ["iron-ore"], [row("|IRON ORE|T|70|", rate="70")]),
            charge("fertilizer", "fertiliser", ["fertilizer"], [row("|FERTILIZER|T|65|", rate="65")]),
            charge("steel", "hot-rolled steel coils", ["steel"], [row("|H.R. COILS|T|74|", rate="74")], conditions=["Pipes, plates, sheets and billets pay Rs 80 a tonne; hot and cold rolled slabs Rs 84."]),
            charge("crude-oil", "crude oil", ["crude-oil"], [row("|CRUDE OIL|T|118|", rate="118")]),
            charge("diesel", "diesel and kerosene", ["diesel", "jet-fuel"], [row("|DIESEL/KEROSENE|T|118|", rate="118")]),
            charge("petrol", "petrol and naphtha", ["petrol", "naphtha"], [row("|PETROL/NAPHTHA/LDO & SKL|T|118|", rate="118")]),
            charge("fuel-oil", "fuel oil and lubricating oil", ["fuel-oil"], [row("|LUBRICATING OIL / FUEL OIL / BASE OIL|T|106|", rate="106")]),
            charge("lng", "LNG", ["lng"], [row("|LNG|T|303|", rate="303")]),
            charge("lpg", "LPG", ["lpg"], [row("|LPG / LPG MIX / PROPANE / BUTANE|T|275|", rate="275")]),
            charge("chemicals", "liquid chemicals", ["chemicals"], [row("|ALL OTHER LIQUID CHEMICALS WHICH ARE NOT PETROLEUM<br>PRODUCTS OR DERIVATIVES|T|106|", rate="106")], conditions=["Acids, ammonia and EDC pay Rs 120 a tonne."]),
            charge("edible-oil", "edible oil in bulk", ["edible-oil"], [row("|Oil vegetable & edible bulk|T|80|", rate="80")]),
            charge("food-grains", "food grains", ["food-grains"], [row("|FOODGRAINS, OIL SEEDS, PULSES|T|44|", rate="44")]),
            charge("cement", "cement and clinker", ["cement"], [row("|CEMENT/CLINKER|T|48|", rate="48")]),
        ],
        "notPriced": [{"type": "wharfage", "cargoClasses": ["containers"], "reason": "At Pipavav, wharfage on containers is part of the container terminal's consolidated handling charge, which this estimate doesn't include.", "needle": "wharfage on tare weight of the containers"}],
    },
    "chennai": {
        "doc": "tn-gazette-2026-sor", "versions": ["chennai-sor-2026"],
        "conditions": ["Hazardous cargo pays 50% more."],
        "charges": [
            charge("crude-oil", "crude oil", ["crude-oil"], [row("|**(a).**|Crude Oil|M.T.|94.27|94.27|", "94.27", "94.27")]),
            charge("diesel", "diesel", ["diesel"], [row("|(i).|Diesel Oil|M.T.|114.11|114.11|", "114.11", "114.11")]),
            charge("fuel-oil", "furnace oil", ["fuel-oil"], [row("|(ii).|Furnace Oil|M.T.|100.89|100.89|", "100.89", "100.89")]),
            charge("jet-fuel", "kerosene and jet fuel", ["jet-fuel"], [row("|(iii).|Kerosene Oil|M.T.|120.73|120.73|", "120.73", "120.73")], context=["|(iv).|Aviation Turbine Fuel (ATF)|M.T.|120.73|120.73|"]),
            charge("petrol", "petrol", ["petrol"], [row("|(v).|Petrol|M.T.|133.96|133.96|", "133.96", "133.96")]),
            charge("naphtha", "naphtha", ["naphtha"], [row("|(ix).|Naphtha|M.T.|127.35|127.35|", "127.35", "127.35")]),
            charge("oil-products", "other oil products", ["petroleum-products"], [row("|(xiii).|Other POL Products|M.T.|133.96|133.96|", "133.96", "133.96")]),
            charge("chemicals", "liquid chemicals", ["chemicals"], [row("|(v).|Other chemicals of all kinds", "209.48", "125.69")], conditions=["Acids pay Rs 151.60 a tonne (foreign)."]),
            charge("edible-oil", "edible oil", ["edible-oil"], [row("|(i).|Palm Oil, Vegetable Oil & Fats etc.|M.T.|83.84|139.73|", "139.73", "83.84")]),
            charge("fertilizer", "finished fertilisers", ["fertilizer"], [row("|(i).|Finished Fertilizer i.e. Urea", "62.02", "37.21")]),
            charge("fertilizer-raw", "fertiliser raw materials", ["fertilizer-raw-materials"], [row("|(ii).|Fertilizer raw material i.e. Sulphur, Rock Phosphate,<br>etc.|M.T.|37.21|62.02|", "62.02", "37.21")]),
            charge("iron-ore", "iron ore", ["iron-ore"], [row("|(vi).|Iron Ore Pellets / Lumps|M.T.|74.43|74.43|", "74.43", "74.43")]),
            charge("cement", "cement and clinker", ["cement"], [row("|(iii).|Cement Clinker|M.T.|40.94|68.23|", "68.23", "40.94")]),
            charge("food-grains", "food grains", ["food-grains"], [row("|(xvi).|Food grains, cereals, pulses, rice and oilseeds of<br>all kinds|M.T.|37.21|62.02|", "62.02", "37.21")]),
            charge("steel", "iron and steel", ["steel"], [row("|(xvi).|Metals (Ferrous/ non- ferrous) (including plates, pig<br>iron, steelpipes, Wire Rod Coils, other steel coils)|M.T.|74.41|124.03|", "124.03", "74.41")]),
            charge("containers-20", "loaded 20-foot containers", ["containers"], [row("||(a). Upto 20 Feet|Each|795|1324|", "1324", "795")], basis="box20"),
            charge("containers-40", "loaded 40-foot containers", ["containers"], [row("||(b). Above 20 Feet and upto 40 Feet|Each|1192|1986|", "1986", "1192")], basis="box40"),
        ],
    },
    "kamarajar": {
        "doc": "sor-consolidated", "versions": ["kamarajar-sor-consolidated", "kamarajar-sor-with-aectpl-2026-27"],
        "conditions": ["Applies at the port's own berths and terminals."],
        "charges": [
            charge("coal", "coal and coke (coastal cargo)", ["coal", "coking-coal"], [row("|1|Coal and Coke|1 Tonne|146.92|--|", coastal="146.92")],
                conditions=["The schedule prints this rate for coastal cargo only."]),
            charge("petrol", "petrol", ["petrol"], [row("|(i)|Motor Spirit|1 Tonne|89|89|", "89", "89")]),
            charge("diesel", "diesel", ["diesel"], [row("|(ii)|High Speed Diesel|1 Tonne|76|76|", "76", "76")]),
            charge("jet-fuel", "kerosene, jet fuel and lubricants", ["jet-fuel"], [row("|(iii)|Kerosene Oil & Aviation Turbine Fuel<br>(ATF),Base Oil & Lubricants|1 Tonne|80|80|", "80", "80")]),
            charge("fuel-oil", "furnace oil", ["fuel-oil"], [row("|(iv)|Furnace Oil|1 Tonne|67|67|", "67", "67")]),
            charge("naphtha", "naphtha", ["naphtha"], [row("|(v)|Naptha|1 Tonne|85|85|", "85", "85")]),
        ],
        "notes": ["Kamarajar's schedule says cargo it doesn't list pays the rate of nearby major ports; Berthwise doesn't apply other ports' rates."],
    },
    "new-mangalore": {
        "doc": "sor-2026-27", "versions": ["new-mangalore-indexed-2026-27"],
        "charges": [
            charge("oil-products", "oil products", POL, [row("||(o)Others|M**.**T**.**|96.60|96.60|", "96.60", "96.60")],
                context=["||(a) Motor spirit/Motor Gasoline (Petrol) to be<br>beld with Ethanol|M**.**T**.**|96.60|96.60|", "||(b) Superior KeroseneOil|M**.**T**.**|96.60|96.60|", "||(c) Diesel Oil/ HSD /HFHSD/Auto Motive<br>Diesel Fuel/Light Diesel Oil(LDO)|M**.**T**.**|96.60|96.60|", "||(e)Naphtha|M**.**T**.**|96.60|96.60|", "||(f)Furnace Oil|M**.**T**.**|96.60|96.60|"]),
            charge("crude-oil", "crude oil", ["crude-oil"], [row("||(d)Crude Oil|M**.**T**.**|96.60|96.60|", "96.60", "96.60")], conditions=["Crude oil through the single point mooring pays Rs 34.90 a tonne."]),
            charge("chemicals", "liquid chemicals", ["chemicals"], [row("||(k) Acids/ Acrylic Acid/ Chemicals of all kinds<br>in crystals liquids not specified above|M**.**T**.**|49.65|81.86|", "81.86", "49.65")], conditions=["Ammonia pays Rs 96.60 a tonne (foreign)."]),
            charge("gas", "LPG and LNG", ["lpg", "lng"], [row("|a)LPG/LNG or any gas in anyother form|M**.**T**.**|147.61|245.57|", "245.57", "147.61")]),
            charge("edible-oil", "edible oil", ["edible-oil"], [row("|a) Palm Oil, vegetable oil etc./ /Palm Acid|M**.**T**.**|41.59|68.45|", "68.45", "41.59")]),
            charge("food-grains", "food grains", ["food-grains"], [row("|a)Rice,Wheat,Maize,Pulses|M.T.|30.47|52.04|", "52.04", "30.47")]),
            charge("fertilizer", "finished fertilisers", ["fertilizer"], [row("|a) MOP  SOP Urea DAP NPK CAN|M.T|26.65|45.71|", "45.71", "26.65")]),
            charge("fertilizer-raw", "fertiliser raw materials", ["fertilizer-raw-materials"], [row("|b) Sulphate/ Rockphosphate|M.T|30.47|52.04|", "52.04", "30.47")]),
            charge("steel", "iron and steel", ["steel"], [row("|(b)Pigiron/Sponge iron/ Hot rolled coils|M**.**T**.**|39.35|64.75|", "64.75", "39.35")],
                context=["|g) Iron and Steel Plates,Pipes, tubes,steel wire<br>coils (irrespective of the weight of individual<br>piece)|M.T.|39.35|64.75|"]),
            charge("iron-ore", "iron ore fines and lumps", ["iron-ore"], [row("|(j)Iron Ore Fines/Lumps|M**.**T**.**|43.16|43.16|", "43.16", "43.16")], conditions=["Iron ore pellets pay Rs 45.71 a tonne."]),
            charge("coal", "thermal coal", ["coal"], [row("|(a)Thermal Coal(other than UPCL)|M**.**T**.**|31.73|31.73|", "31.73", "31.73")]),
            charge("coking-coal", "coal other than thermal coal, and coke", ["coking-coal"], [row("|(b)Coal(other than Thermal Coal)and coke|M**.**T**.**|19.02|31.73|", "31.73", "19.02")]),
            charge("cement", "cement", ["cement"], [row("|(a)upto 3.00 lakh tonnesper annum|M**.**T**.**|49.65|81.86|", "81.86", "49.65")],
                context=["|V**Construction Materials/ Cement**||||"], conditions=["Rate for users handling up to 3 lakh tonnes a year; larger users pay less. Clinker pays Rs 39.35 a tonne (foreign)."]),
        ],
        "notPriced": [{"type": "wharfage", "cargoClasses": ["containers"], "reason": "At New Mangalore, container wharfage is part of the composite box rate for container handling, which this estimate doesn't include.", "needle": "**Note:** Composite box-rate for container prescribed above covers wharfage"}],
    },
    "paradip": {
        "doc": "sor-2026-new-18092026", "versions": ["paradip-sor-2026"],
        "charges": [
            charge("diesel", "diesel, fuel oil and kerosene", ["diesel", "fuel-oil", "jet-fuel"], [row("||In bulk Upto 2.00 MMTPA|M**.**T**.**|42.99|42.99|", "42.99", "42.99")],
                context=["|(i).|POL and its products such as High<br>Speed Diesel, Aviation Turbine Fuel,<br>Fuel Oil, Light Cycle Oil, Superior<br>Kerosene Oil"], conditions=["Rate for up to 2 million tonnes a year; Rs 40.11 above that."]),
            charge("petrol", "petrol and naphtha", ["petrol", "naphtha"], [row("Butane|M**.**T**.**|95.55|95.55|", "95.55", "95.55")], context=["|(ii).|POL and its products such as Motor<br>Spirit, Naptha"]),
            charge("chemicals", "liquid chemicals", ["chemicals"], [row("|(iv).|Liquid bulk including Acid, Fatty Acid<br>and Ammonia|M**.**T**.**|71.45|71.45|", "71.45", "71.45")]),
            charge("gas", "LPG and LNG", ["lpg", "lng"], [row("|(vi).|LPG and LNG|M**.**T**.**|57.34|95.55|", "95.55", "57.34")]),
            charge("edible-oil", "edible oil", ["edible-oil"], [row("|.|Upto 50,000 MT (per user) / per<br>commodity|M**.**T**.**|57.34|95.55|", "95.55", "57.34")],
                context=["|(ix).|Edible Oil||||"], conditions=["Rate for up to 50,000 tonnes a year per user; larger users pay less."]),
            charge("coal", "coal and coke", ["coal", "coking-coal"], [
                row("|<br>(a). Peruser/per commodity import|M**.**T**.**|36.26|60.43|", "60.43", "36.26", {"directions": ["import"]}),
                row("|(d).Per user shipment of all types of<br>coal upto3.5million tonnes per annum<br>-conventional handling|M**.**T**.**|39.56|65.90|", "65.90", "39.56", {"directions": ["export"]}),
            ], context=["|(iv). All types of Coal/Coke||||"],
                conditions=["Conventional handling, at the rate for the smallest annual volumes (imports up to 5 lakh tonnes, shipments up to 3.5 million tonnes a year); larger users pay less, and coal through the mechanised coal plant pays its own rates."]),
            charge("iron-ore", "iron ore", ["iron-ore"], [row("|(xi).|Iron Ore/ Iron Ore Pellet/ Standard<br>magnetite Concentrate|M**.**T**.**|32.95|32.95|", "32.95", "32.95")]),
            charge("cement", "cement and clinker", ["cement"], [row("|<br>(a). Upto 2.00 Lakhs Tons (per user) /<br>per commodity|M**.**T**.**|45.89|76.43|", "76.43", "45.89")],
                context=["|(vi).Cement, Clinker, Limestone, Dolomite,<br>Gypsum"], conditions=["Rate for up to 2 lakh tonnes a year per user; larger users pay less."]),
            charge("fertilizer", "fertilisers and raw materials", ["fertilizer", "fertilizer-raw-materials"], [row("|<br>(vii). Finished Fertilizer/FRM|M**.**T**.**|22.91|38.22|", "38.22", "22.91")]),
            charge("food-grains", "food grains", ["food-grains"], [row("|<br>(a). Upto 50,000 MT (per user) /per<br>commodity|M**.**T**.**|57.34|95.55|", "95.55", "57.34")],
                context=["|(viii). Food grains, Oil seeds, cereals, pulses||||"], conditions=["Rate for up to 50,000 tonnes a year per user; larger users pay less."]),
            charge("steel", "iron and steel", ["steel"], [row("|(i).|Iron & Steel<br>[Steel coils, slabs, steel pipes, steel<br>rails, plates, iron rods etc.]|M**.**T**.**|42.99|71.67|", "71.67", "42.99")]),
            charge("container-box-20", "20-foot containers (the box)", ["containers"], [row("|1.|Wharfage<br>on<br>Container (Box<br>only)|57.34|95.55|86.00|143.34|114.65|191.10|", "95.55", "57.34")], basis="box20"),
            charge("container-box-40", "40-foot containers (the box)", ["containers"], [row("|1.|Wharfage<br>on<br>Container (Box<br>only)|57.34|95.55|86.00|143.34|114.65|191.10|", "143.34", "86.00")], basis="box40"),
            charge("container-cargo-20", "cargo in 20-foot containers", ["containers"], [row("|3.|Wharfage<br>on<br>Non-Reefer<br>Cargo (Per Box)|372.66|621.08|558.99|931.63|745.30|1,242.18|", "621.08", "372.66")], basis="box20",
                conditions=["Reefer cargo pays Rs 764.41 a 20-foot box (foreign)."]),
            charge("container-cargo-40", "cargo in 40-foot containers", ["containers"], [row("|3.|Wharfage<br>on<br>Non-Reefer<br>Cargo (Per Box)|372.66|621.08|558.99|931.63|745.30|1,242.18|", "931.63", "558.99")], basis="box40",
                conditions=["Reefer cargo pays Rs 1,146.61 a 40-foot box (foreign)."]),
        ],
    },
    "deendayal": {
        "doc": "sor-escalated-2026-27", "versions": ["deendayal-escalated-2026-27"],
        "charges": [
            charge("crude-oil", "crude oil", ["crude-oil"], [
                row("|(a).|Crude Oil to be handled at SPM|M**.**T**.**|28.38|28.38|", "28.38", "28.38", {"terminals": ["vadinar"]}),
                row("|(d).|Crude oil to be handled at Oil Jetties||36.50|36.50|", "36.50", "36.50", {"terminals": ["kandla"]}),
            ]),
            charge("oil-products", "oil products", POL, [row("|(b).|POL Products|M**.**T**.**|70.96|70.96|", "70.96", "70.96")]),
            charge("edible-oil", "edible oil", ["edible-oil"], [row("|2.|Edible oil – crude and refined|M**.**T**.**|41.07|68.46|", "68.46", "41.07")]),
            charge("chemicals", "liquid chemicals", ["chemicals"], [row("|3.|Non Hazardous chemicals|M**.**T**.**|41.07|68.46|", "68.46", "41.07")], context=["|4.|Hazardous chemicals|M**.**T**.**|41.07|68.46|"]),
            charge("fertilizer", "fertilisers and raw materials in bulk", ["fertilizer", "fertilizer-raw-materials"], [row("|1.|Fertiliser and raw material including sulphur|M**.**T**.**|45.75|76.24|", "76.24", "45.75")],
                context=["|**(B) **|**Dry Cargoes (Bulk)**<br>||||"], conditions=["Rate for bulk cargo; in bags (break bulk) it is Rs 70.64 a tonne (foreign)."]),
            charge("food-grains", "food grains in bulk", ["food-grains"], [row("|2.|Food grains**,**cereals**,**pulses and oilseeds||42.57|70.98|", "70.98", "42.57")], conditions=["Rate for bulk cargo; in bags it is Rs 118.43 a tonne (foreign)."]),
            charge("cement", "cement and clinker in bulk", ["cement"], [row("|3.|Cement & clinker|M**.**T**.**|18.48|30.80|", "30.80", "18.48")], conditions=["Rate for bulk cargo; in bags it is Rs 216.53 a tonne (foreign)."]),
            charge("iron-ore", "ores and minerals in bulk", ["iron-ore"], [row("|4.|Ores and minerals including Mill scale &<br>Limestone(inall forms)|M**.**T**.**|30.42|50.69|", "50.69", "30.42")]),
            charge("coal", "coal and coke in bulk", ["coal", "coking-coal"], [row("|14.|Coal and coke (including firewood)|M**.**T**.**|29.74|49.58|", "49.58", "29.74")]),
            charge("steel", "iron and steel (break bulk)", ["steel"], [row("othersteelcoils)|M**.**T**.**|71.58|119.32|", "119.32", "71.58")],
                context=["|**(C)**|**Dry Cargoes (Break bulk)**||||"], conditions=["Rate for break-bulk steel; metals moved in bulk pay Rs 51.35 a tonne (foreign)."]),
        ],
        "notPriced": [
            {"type": "wharfage", "cargoClasses": ["lpg"], "reason": "Deendayal charges propane and butane differently, so LPG wharfage isn't included."},
            {"type": "wharfage", "cargoClasses": ["containers"], "reason": "Deendayal's printed rate for loaded 20-foot containers can't be read reliably in our copy of the schedule, so container wharfage isn't included."},
        ],
    },
}


def numbers(text):
    return [float(item.replace(",", "")) for item in re.findall(r"\d[\d,]*(?:\.\d+)?", text)]


def main():
    problems = []
    for port, spec in WHARFAGE.items():
        path = ROOT / "data/rulebook" / f"{port}.json"
        book = json.loads(path.read_text())
        version0 = next(v for v in book["versions"] if v["id"] == spec["versions"][0])
        document = next(d for d in version0["documents"] if d["id"] == spec["doc"])
        lines = (ROOT / document["markdown"]).read_text().splitlines()

        def find(needle):
            hits = [i for i, line in enumerate(lines) if needle in line]
            if not hits:
                problems.append(f"{port}: not found: {needle}")
                return None, None
            index = hits[0]
            page = next((int(m.group(1)) for line in reversed(lines[:index + 1]) if (m := re.search(r"<!-- page (\d+) -->", line))), 1)
            return lines[index], page

        def snippet(line, figures=()):
            # The quote is the table line, cut at a cell boundary to stay under 400 characters.
            text = line.strip()
            while len(text) > 400:
                cut = text.find("|", 1)
                if cut == -1:
                    break
                text = text[cut:]
            if len(text) > 400:
                text = text[:400]
            for figure in figures:
                if float(figure) not in numbers(text):
                    problems.append(f"{port}: {figure} not in quoted line: {text[:80]}")
            return text

        charges = []
        for item in spec["charges"]:
            rates, quotes, page = [], [], None
            for context in item["context"] + spec.get("context", []):
                line, _ = find(context)
                if line:
                    quotes.append(snippet(line))
            for r in item["rows"]:
                line, at = find(r["needle"])
                if not line:
                    continue
                page = page or at
                figures = [f for f in (r["foreign"], r["coastal"], r["rate"]) if f]
                quotes.append(snippet(line, figures))
                when = {"cargoClasses": item["classes"], **r["when"]}
                if r["rate"] or (r["foreign"] and r["foreign"] == r["coastal"]):
                    rates.append({"when": when, "currency": "INR", "bands": [{"rate": r["rate"] or r["foreign"]}]})
                else:
                    if r["foreign"]:
                        rates.append({"when": {"status": ["foreign"], **when}, "currency": "INR", "bands": [{"rate": r["foreign"]}]})
                    if r["coastal"]:
                        rates.append({"when": {"status": ["coastal"], **when}, "currency": "INR", "bands": [{"rate": r["coastal"]}]})
            quotes = list(dict.fromkeys(quotes))
            if len(quotes) > 8:
                problems.append(f"{port}: {item['key']} has more than 8 quotes")
            charges.append({
                "id": f"wharfage-{item['key']}", "type": "wharfage", "label": f"Wharfage on {item['label']}", "basis": item["basis"],
                "rates": rates, "conditions": item["conditions"] + spec.get("conditions", []),
                "source": {"document": spec["doc"], "page": page or 1, "quote": quotes[0] if len(quotes) == 1 else quotes},
            })

        not_priced = []
        for entry in spec.get("notPriced", []):
            out = {"type": entry["type"], **({"cargoClasses": entry["cargoClasses"]} if "cargoClasses" in entry else {}), "reason": entry["reason"]}
            if "needle" in entry:
                line, at = find(entry["needle"])
                if line:
                    out["source"] = {"document": spec["doc"], "page": at}
            elif "page" in entry:
                out["source"] = {"document": spec["doc"], "page": entry["page"]}
            not_priced.append(out)

        for version in book["versions"]:
            if version["id"] not in spec["versions"]:
                continue
            version["charges"] = [c for c in version["charges"] if c["type"] != "wharfage"] + charges
            version["notPriced"] = not_priced
            notes = version.get("notes", [])
            for text in spec.get("notes", []):
                if not any(note["text"] == text for note in notes):
                    notes.append({"text": text})
            version["notes"] = notes
        path.write_text(json.dumps(book, indent=2, ensure_ascii=False) + "\n")
        print(f"{port}: {len(charges)} wharfage charges, {len(not_priced)} not priced")
    if problems:
        print("\n".join(problems))
        sys.exit(1)


main()
