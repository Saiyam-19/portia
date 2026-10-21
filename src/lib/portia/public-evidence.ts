import "server-only";
import { TariffNumber } from "./tariff-number";
import finolex from "../../../data/reviewed-tariffs/full-scope-2026/gac-finolex-2023.json";
import redi from "../../../data/reviewed-tariffs/full-scope-2026/gac-redi-2023.json";
import jsw from "../../../data/reviewed-tariffs/full-scope-2026/jsw-dec2025-indexed.json";
import oct from "../../../data/reviewed-tariffs/full-scope-2026/oct-evidence.json";
import { Components, combineTariffResults, componentValidationFailure, dateOf } from "./published-components";
import { safe } from "./quotes";
import type { TariffInput, TariffResult } from "./tariff-types";

const D = TariffNumber;
const key = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
type Mode = "quote" | "rule";

/** Quantities describe actual services, never model-supplied prices or authority. */
function used(c: Components, service: string, unit: string, whole = true) {
  const matches = c.input.serviceQuantities?.filter(row => row.service === service) ?? [];
  if (matches.length !== 1 || matches[0].unit !== unit) {
    c.questions.push(`${service}: provide one actual service quantity in ${unit}; usage is not implied by a published price.`);
    return;
  }
  const raw = matches[0].quantity;
  if (typeof raw !== "string" || !/^\d+(?:\.\d+)?$/.test(raw) || raw.length > 48 || !new D(raw).isFinite() || new D(raw).lte(0) || new D(raw).gt("1e12") || whole && !new D(raw).isInteger()) {
    c.questions.push(`${service}: provide a positive ${whole ? "whole " : ""}${unit} quantity; fractional rounding is not established.`);
    return;
  }
  return new D(raw);
}

function finolexComponents(c: Components, services: string[]) {
  c.source("gac-finolex-2023.json", "GAC Hot Port News, 7 September 2023; retained browser transcription");
  c.estimate("GAC-reported revision effective 2023-09-07, checked 2026-10-18. Current applicability unconfirmed; no later public revision found. Application to the chemical/EDC versus coal jetty, contractual overrides, taxes, minima and fractional-hour treatment remain unverified.", "historical-published");
  const names: Record<string, { component: string; unit: string }> = {
    pilotage: { component: "Pilotage", unit: "berthing" }, towage: { component: "Towage", unit: "berthing" },
    "towage-standby": { component: "Towage standby", unit: "hour" }, mooring: { component: "Mooring and unmooring", unit: "activity" },
  };
  const berth = finolex.prices.find(row => row.component === "Berth hire")!;
  for (const service of services) {
    const row = service === "berth" ? berth : finolex.prices.find(row => row.component === names[service].component)!;
    c.explanations.push(`${row.component}: INR${row.rate} ${row.unit}. Dated GAC report effective 2023-09-07; currentness unconfirmed.`);
  }
  if (c.mode === "rule") { for (const service of services) c.period(finolex.reportedEffectiveFrom, undefined, service === "berth"); return; }
  for (const service of services) {
    if (!c.period(finolex.reportedEffectiveFrom, undefined, service === "berth")) continue;
    if (service === "berth") {
      const priorBlocks = c.blocked.length;
      c.ordinary(); if (c.blocked.length > priorBlocks) continue;
      const loa = c.number("loa", "Vessel LOA in metres"), hours = c.hours();
      if (!loa || !hours) continue;
      if (!hours.isInteger()) { c.blocked.push("Finolex fractional-hour billing is not established; no commenced-hour or pro-rata rule is invented."); continue; }
      c.add("berth:finolex:reference", "Finolex dated berth reference", "INR", loa.mul(hours).mul(berth.rate), `${loa} metres LOA × ${hours} whole hours × INR${berth.rate}/metre/hour`);
    } else {
      const { component, unit } = names[service], row = finolex.prices.find(row => row.component === component)!;
      const quantity = service === "towage-standby" ? c.number("portStayHours", "Total vessel stay in port, hours") : used(c, service, unit);
      if (service === "towage-standby" && quantity && !quantity.isInteger()) { c.blocked.push("Fractional port-stay-hour billing for Finolex standby is not established."); continue; }
      const basis = service === "towage-standby" ? "port-stay hours" : unit;
      if (quantity) c.add(`${service}:finolex:reference`, `Finolex ${component} reference`, "INR", quantity.mul(row.rate), `${quantity} ${basis} × INR${row.rate}/${basis}`);
    }
  }
}

function rediComponents(c: Components, services: string[]) {
  c.source("gac-redi-2023.json", "GAC Redi revision, 20 November 2023; retained browser transcription");
  c.source("gac-redi-2024.json", "GAC Redi tariff, 11 May 2024; retained browser transcription");
  c.estimate("GAC revision effective 2023-11-20, repeated on 2024-05-11 for 2023–24; checked 2026-10-18. Current applicability unconfirmed. Both reports are from the same publisher. GST is additional, with no tax rate inferred. Anchorage, private port services and statutory port dues are distinct charges.", "historical-published");
  const rates = redi.rates;
  const amounts: Record<string, number> = { pilotage: rates.pilotage.inr, "port-services": rates.port_services.inr };
  for (const service of services) {
    c.explanations.push(service === "anchorage" ? `Anchorage reference: INR${rates.anchorage.inr}/GRT per 24 hours or part, plus GST. This is not a berth-hire rate.` : service === "launch" ? "Launch service reported free; this does not make other marine services free." : `${service}: INR${amounts[service]}/GRT plus GST, as reported in 2023–24.`);
  }
  if (!c.period(redi.visible_publication_date) || c.mode === "rule") return;
  c.ordinary(); if (c.blocked.length) return;
  for (const service of services) {
    if (service === "launch") { c.add("launch:redi:reference", "Redi launch reference", "INR", "0", "Published launch charge: free"); continue; }
    const gt = c.number("gt", "Certified vessel GRT"); if (!gt) continue;
    if (service === "anchorage") {
      // Berth timestamps do not establish anchorage occupancy.
      if (c.input.berthStart || c.input.berthEnd) { c.blocked.push("Berth timestamps cannot establish Redi anchorage occupancy. Provide the actual anchorage duration separately."); continue; }
      const hours = c.hours(); if (!hours) continue;
      const days = hours.div(24).ceil();
      c.add("anchorage:redi:reference", "Redi anchorage reference", "INR", gt.mul(days).mul(rates.anchorage.inr), `${gt} GRT × ${days} commenced 24-hour periods × INR${rates.anchorage.inr}`);
    } else c.add(`${service}:redi:reference`, `Redi ${service} reference`, "INR", gt.mul(amounts[service]), `${gt} GRT × INR${amounts[service]}/GRT`);
  }
}

const commodityAliases: Record<string, string> = {
  edc: "ethylene dichloride edc", "ethylene dichloride": "ethylene dichloride edc",
  "high speed diesel": "hsd", "light diesel oil": "ldo", "furnace oil": "fo", "motor spirit": "ms",
  "aviation turbine fuel": "atf", "mono ethylene glycol": "meg", toluene: "toulene",
};
const ancillaryRows = [
  { row: 1, service: "hard-pigging", unit: "operation" }, { row: 2, service: "foam-pigging", unit: "operation" },
  { row: 3, service: "compressor", unit: "hour" }, { row: 4, service: "liquid-nitrogen", unit: "Nm3" },
  { row: 5, service: "gangway", unit: "vessel" }, { row: 6, service: "water", unit: "MT" },
  { row: 7, service: "loading-arm", unit: "MT" }, { row: 8, service: "idling", unit: "hour" },
  { row: 9, service: "sludge-truck", unit: "truck20kl" },
];
function jswComponents(c: Components, services: string[]) {
  c.source("jsw-dec2025-indexed.json", "JJLTPL scale effective 5 December 2025; retained search-index extraction of operator publication");
  c.estimate("Latest published JSW JNPT operator schedule located: effective 2025-12-05, checked 2026-10-18. Current applicability unconfirmed. Prices were recovered from the official publication's search index; the first definitions/general-conditions page and current original download remain unavailable. No old 31 March 2025 expiry is carried into this successor. JNPA marine services, tank-farm pumping, taxes and unlisted negotiated services are separate.", "latest-published-unconfirmed");
  const cargoRequested = services.some(service => ["cargo", "handling"].includes(service));
  if (cargoRequested) c.explanations.push(`Liquid cargo handling: INR${jsw.cargo_handling.inr_per_mt.exim_including_coastal_pol_and_crude_oil}/MT EXIM including coastal POL/crude; INR${jsw.cargo_handling.inr_per_mt.coastal_except_pol_and_crude_oil}/MT other coastal cargo. Manifested quantity; infrastructure is separate.`);
  if (services.includes("infrastructure")) c.explanations.push("Infrastructure, INR/MT of manifested cargo:\n\n| Commodity | INR/MT |\n|---|---:|\n" + jsw.infrastructure.map(row => `| ${row.commodity_as_published} | ${row.inr_per_mt} |`).join("\n") + "\nGeneric/catch-all rows require classification evidence and are not automatically selected.");
  for (const spec of ancillaryRows.filter(spec => services.includes(spec.service))) {
    const row = jsw.miscellaneous.find(row => row.row === spec.row)!;
    c.explanations.push(`${row.service_as_published}: ${row.amount_as_published} ${row.unit_as_published}. Actual usage required; unknown time/quantity rounding is not inferred.`);
  }
  if (!c.period(jsw.source.effective_from) || c.mode === "rule") return;
  if (c.input.rebate === true || c.input.otherAdjustments === true) { c.blocked.push("The JSW reference excludes unestablished rebates or other contractual adjustments."); return; }
  if (cargoRequested || services.includes("infrastructure")) {
    const rawName = c.input.cargoName;
    const name = rawName ? commodityAliases[key(rawName)] ?? key(rawName) : undefined;
    const row = name ? jsw.infrastructure.find(row => key(row.commodity_as_published) === name) : undefined;
    if (!rawName) c.questions.push("What is the actual named liquid commodity?");
    else if (!row || /other|MPCB/i.test(row.commodity_as_published)) c.blocked.push(`No exact executable commodity classification for ${safe(rawName)}; a catch-all or another cargo rate is not substituted.`);
    else {
      const tonnes = c.number("cargoTonnes", "Manifested cargo tonnes");
      if (cargoRequested) {
        const traffic = c.input.cargoTraffic;
        if (traffic !== "exim" && traffic !== "coastal") c.questions.push("Is the cargo EXIM or coastal traffic?");
        else if (tonnes) {
          const rate = traffic === "exim" || row.category === "Petroleum Products" ? jsw.cargo_handling.inr_per_mt.exim_including_coastal_pol_and_crude_oil : jsw.cargo_handling.inr_per_mt.coastal_except_pol_and_crude_oil;
          c.add("cargo:jsw-jnpt:reference", "JJLTPL cargo handling reference", "INR", tonnes.mul(rate), `${tonnes} manifested MT × INR${rate}/MT`);
        }
      }
      if (tonnes && services.includes("infrastructure")) c.add("infrastructure:jsw-jnpt:reference", `JJLTPL ${safe(row.commodity_as_published)} infrastructure reference`, "INR", tonnes.mul(row.inr_per_mt), `${tonnes} manifested MT × INR${row.inr_per_mt}/MT`);
    }
  }
  for (const spec of ancillaryRows.filter(spec => services.includes(spec.service))) {
    const row = jsw.miscellaneous.find(row => row.row === spec.row)!;
    const rate = /[\d,]+(?:\.\d+)?/.exec(row.amount_as_published)?.[0].replaceAll(",", "");
    if (!rate) throw new Error("The indexed ancillary price could not be read.");
    if (spec.service === "idling" && c.input.userCausedDelay !== true) { c.questions.push("Was this vessel idling caused by the user? Supply only chargeable hours beyond the two-hour grace, not total occupancy."); continue; }
    const quantity = used(c, spec.service, spec.unit, spec.unit !== "MT");
    if (quantity) c.add(`${spec.service}:jsw-jnpt:reference`, `JJLTPL ${spec.service} reference`, "INR", quantity.mul(rate), `${quantity} ${spec.unit} × INR${rate}/${spec.unit}${spec.service === "idling" ? "; explicitly supplied user-caused hours beyond the two-hour grace" : ""}`);
  }
}

function assessedCargoTonnes(c: Components) {
  if (!c.input.cargoItems) {
    const tonnes = c.number("cargoTonnes", "Gross cargo tonnes");
    if (tonnes) c.estimate("Unassessed aggregate-weight reference only. MbPA §1.2(x) assesses each individual item's gross weight; an aggregate cannot be assumed to be one item. Provide itemized gross weights for an assessed component. No final bill minimum or invoice rounding is applied here.", "conditional-scenario");
    return tonnes;
  }
  if (!Array.isArray(c.input.cargoItems) || !c.input.cargoItems.length || c.input.cargoItems.length > 50) { c.questions.push("Provide between 1 and 50 actual itemized gross cargo weights."); return; }
  const values: TariffNumber[] = [];
  for (const item of c.input.cargoItems) {
    const raw = item?.grossTonnes;
    if (typeof raw !== "string" || !/^\d+(?:\.\d+)?$/.test(raw) || raw.length > 48 || !new D(raw).isFinite() || new D(raw).lte(0) || new D(raw).gt("1e12")) { c.questions.push("Each cargo item needs a positive gross weight in tonnes within the supported range."); return; }
    values.push(new D(raw));
  }
  const gross = D.sum(...values);
  if (gross.gt("1e12")) { c.questions.push("Total itemized weight exceeds the supported range."); return; }
  if (c.input.cargoTonnes !== undefined) {
    const declared = c.number("cargoTonnes", "Total gross cargo tonnes");
    if (!declared) return;
    if (!declared.eq(gross)) { c.questions.push("The itemized gross weights do not match the stated cargo total; confirm the actual weights."); return; }
  }
  if (values.some(value => value.minus(value.floor()).eq("0.5"))) {
    c.blocked.push("MbPA §1.2(x) has overlapping wording at an exact 0.5-unit fraction. The applicable assessment for this item is not established; no half/whole choice is invented."); return;
  }
  const assessed = D.sum(...values.map(value => {
    const whole = value.floor(), fraction = value.minus(whole);
    return fraction.isZero() ? whole : whole.plus(fraction.lt("0.5") ? "0.5" : "1");
  }));
  c.notes.push(`MbPA §1.2(x) item assessment: ${values.map(value => value.toString()).join(" + ")} gross tonnes → ${assessed} assessed tonnes. Each item's fraction below 0.5 is assessed as 0.5; above 0.5 as 1. Exact-half ambiguity is excluded.`);
  return assessed;
}

function octComponents(c: Components, services: string[]) {
  c.source("mumbai-sor-may2026.pdf", "Current MbPA SOR updated 9 May 2026, §1.2(x) p6, §2.17 pp21–22 and §3.1(A) row13 pp27–29");
  c.evidenceStatus = "current-published";
  if (services.includes("berth")) {
    c.source("ictpl-2016.pdf", "TAMP January 2016 order p3: actual prior RoRo comparator, not withdrawn proposed rate");
    c.source("mumbai-legacy-sor.pdf", "Legacy MbPT SOR §2.17 p18: Indira/Ballard comparator");
    c.source("ictpl-2018.pdf", "TAMP 2018 OCT table §2.1 pp35–36; formal approval later expired");
    c.source("ictpl-full-sop.pdf", "MbPA full OCT SOP §5.2–5.3: 100%/130% alternatives and cargo practice");
    c.source("ictpl-dec2025-continuation.pdf", "MbPA 23 December 2025 operational SOP continuation; not express tariff renewal");
    c.estimate("Conditional OCT berth scenario: assuming the 130% MbPA arrangement applies. The SOP also records a 100% alternative. Formal historical approval expired; operational SOP continuation does not expressly renew it. Current selection is unconfirmed. Only ordinary RoRo or admitted iron/steel calls; special vessel categories and adjustments are excluded.", "conditional-scenario");
    c.explanations.push(`Conditional 130% berth scenario from 2026-05-09: foreign USD${oct.berth.currencyRates.foreign.base} × 1.3 = USD${oct.berth.currencyRates.foreign.derived}; coastal INR${oct.berth.currencyRates.coastal.base} × 1.3 = INR${oct.berth.currencyRates.coastal.derived}, per GRT per hour or part. Historical minimum 1000 GRT is carried as a continuity assumption; offshore supply is excluded. The 100%/130% choice is not established for this call.`);
  }
  if (services.includes("cargo")) {
    c.explanations.push(`Direct OCT iron/steel wharfage, excluding scrap, dross and ores: import INR${oct.wharfage.import.foreign}/tonne foreign or INR${oct.wharfage.import.coastal}/tonne coastal; export INR${oct.wharfage.export.foreign}/tonne foreign or INR${oct.wharfage.export.coastal}/tonne coastal. The 30% convenience fee is already included. Collected by MbPA; do not add duplicate private wharfage. Gross weight is assessed per individual item under §1.2(x): fractions below 0.5 become 0.5, above 0.5 become 1; the overlapping exact-0.5 wording remains unresolved. Aggregate-only quantities yield an unassessed reference.`);
    c.notes.push("OCT steel wharfage includes the 30% convenience fee. Direct handling only; no overside reduction, exemption or other special treatment is inferred.");
  }
  if (c.mode === "rule") { for (const service of services) c.period(oct.effectiveFrom, undefined, service === "berth"); return; }
  const date = dateOf(c.input.callDate ?? c.input.berthStart, c.input);
  const end = dateOf(c.input.berthEnd, c.input);
  if (date && date > oct.checkedOn || end && end > oct.checkedOn) c.estimate(`The requested service is after the source was checked on ${oct.checkedOn}; this is a future planning reference, not verified future tariff applicability.`, "latest-published-unconfirmed");
  const excluded = /\b(scrap|dross|ores?|ingots?|billets?|unmanufactured)\b/i.test(c.input.cargoName ?? "");
  for (const service of services) {
    if (!c.period(oct.effectiveFrom, undefined, service === "berth")) continue;
    if (service === "cargo") {
      if (excluded || c.input.cargoCategory !== "iron-steel") { c.blocked.push("This OCT row covers iron/steel materials only. Scrap, dross, ores and ambiguous ingot/billet classifications are not priced by this row."); continue; }
      if (c.input.cargoHandling !== "direct") {
        if (c.input.cargoHandling === "overside") c.blocked.push("Overside cargo requires its applicable adjustment; no direct-handling total is substituted.");
        else c.questions.push("Is this iron/steel cargo handled directly through OCT or overside?");
        continue;
      }
      if (c.input.rebate === true || c.input.otherAdjustments === true) { c.blocked.push("The ordinary OCT cargo row excludes unestablished rebates or other adjustments."); continue; }
      if (!["exim", "coastal"].includes(c.input.cargoTraffic ?? "")) { c.questions.push("Is this cargo EXIM or coastal traffic?"); continue; }
      if (c.input.cargoDirection !== "import" && c.input.cargoDirection !== "export") { c.questions.push("Is the cargo imported or exported?"); continue; }
      const tonnes = assessedCargoTonnes(c); if (!tonnes) continue;
      const traffic = c.input.cargoTraffic === "exim" ? "foreign" : "coastal";
      const rate = oct.wharfage[c.input.cargoDirection][traffic];
      c.add("cargo:oct:steel-direct", "OCT iron/steel wharfage", "INR", tonnes.mul(rate), `${tonnes} ${c.input.cargoItems ? "assessed" : "unassessed aggregate"} tonnes × INR${rate}/tonne; 30% convenience fee already included`);
    } else {
      if (c.input.vesselCategory !== "ro-ro" && !(c.input.vesselCategory === "general-cargo" && c.input.cargoCategory === "iron-steel" && !excluded)) { c.blocked.push("The conditional ordinary OCT berth scenario is limited to RoRo or admitted iron/steel general-cargo vessels; no other vessel/cargo category is inferred."); continue; }
      const priorBlocks = c.blocked.length;
      c.ordinary(); if (c.blocked.length > priorBlocks) continue;
      const service = c.status(), gt = c.number("gt", "Certified vessel GRT"), hours = c.hours();
      if (service && gt && hours) {
        const rate = oct.berth.currencyRates[service], chargeable = D.max(gt, 1000), billed = hours.ceil();
        c.add("berth:oct:130-percent-scenario", "OCT berth — conditional 130% scenario", rate.currency, chargeable.mul(billed).mul(rate.derived), `${chargeable} chargeable GRT × ${billed} commenced hours × ${rate.currency}${rate.derived}; assumes 130% arrangement and historical minimum/rounding continuity`);
      }
    }
  }
}

/** Bounded evidence routing by facility/service, not by acceptance prompts. */
export async function publicEvidenceComponents(input: TariffInput, mode: Mode): Promise<{ handled: string[]; result: TariffResult } | undefined> {
  const handlers: Record<string, { services: string[]; run: (c: Components, selected: string[]) => void }> = {
    "ranpar-finolex": { services: ["berth", "pilotage", "towage", "towage-standby", "mooring"], run: finolexComponents },
    redi: { services: ["anchorage", "pilotage", "port-services", "launch"], run: rediComponents },
    "jsw-jnpt-liquid-terminal": { services: ["cargo", "handling", "infrastructure", ...ancillaryRows.map(row => row.service)], run: jswComponents },
    ictpl: { services: ["berth", "cargo"], run: octComponents },
  };
  const handler = handlers[input.port ?? ""];
  if (!handler) return;
  const handled = input.charges.filter(service => handler.services.includes(service));
  if (!handled.length) return;
  // OCT cargo and the conditional berth scenario have different governing
  // source sets. A failed historical berth source cannot erase validated
  // cargo wharfage. Other handlers use one shared source packet; their
  // cargo/handling aliases remain one operation, never duplicate amounts.
  const groups = input.port === "ictpl" ? handled.map(service => [service]) : [handled];
  const results = await Promise.all(groups.map(async services => {
    const c = new Components({ ...input, charges: services }, mode);
    try { handler.run(c, services); return await c.result(); }
    catch { return componentValidationFailure(services, "published-reference"); }
  }));
  return { handled, result: combineTariffResults(results) };
}
