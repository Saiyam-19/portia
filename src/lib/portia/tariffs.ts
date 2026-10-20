import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import rules from "../../../data/reviewed-tariffs/jnpa-2026/rules.json";
import explanationSources from "../../../data/reviewed-tariffs/bounded-explanations-2026/sources.json";
import extensions from "../../../data/reviewed-tariffs/component-extensions-2026/rules.json";
import mumbaiSources from "../../../data/ports/mumbai/approved-2026-05-09/rules.json";
import { calculateElapsedTime } from "../migration/elapsed-time";
import { calculateChargeBatch } from "../migration/calculator-batch";
import type { TariffInput, TariffResult, TariffApplicability, TariffSource } from "./tariff-types";
export type { TariffInput, TariffResult } from "./tariff-types";
export { tariffInputSchema } from "./tariff-input";
import { SUPPORTED_PORTS, PORT_ALIASES, AMBIGUOUS_PORT_NAMES } from "../migration/ports";
import { resolvePortIdentity } from "../migration/port-identity";
import coverageGaps from "../../../data/reviewed-tariffs/coverage-gaps.json";
import { publishedComponents, combineTariffResults, berthPeriodIssue, rulePeriodIssues } from "./published-components";
import { publicEvidenceComponents } from "./public-evidence";
import { ancillaryServiceSchema } from "./tariff-input";

const conditionalMessage = "Conditional arithmetic from retained official source rules. Current-call tariff applicability, later amendments and complete invoice eligibility have not been verified.";
function applicability(mode: "quote" | "rule"): TariffApplicability {
  return { status: mode === "rule" ? "explanation-only" : "conditional-retained-rule", currentTariffVerified: false,
    message: mode === "rule" ? "Retained source-rule explanation; not a current-call eligibility decision or monetary quotation." : conditionalMessage };
}
function detail(input: TariffInput, field: keyof Omit<TariffInput, "charges">): string | undefined {
  const value = input[field];
  return value === undefined ? undefined : String(value);
}
function sourceLinks(sources: Array<{ url: string; file: string; sha256: string; reference?: string }>): TariffSource[] {
  return sources.map(source => ({ url: source.url, sha256: source.sha256, reference: source.reference ?? source.file }));
}
function money(currency: string, raw: string) {
  const amount = new Decimal(raw);
  const [whole, fraction] = amount.toFixed(Math.max(2, amount.decimalPlaces())).split(".");
  return `${currency} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}
function indianDate(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
}
function unresolved(questions: string[], body = ""): TariffResult {
  return { status: "unresolved", sourceClass: "official-tariff", body, questions: [...new Set(questions)],
    applicability: { status: "unverified", currentTariffVerified: false, message: "No complete applicable tariff calculation established." } };
}

const eligiblePorts = ["gateway-terminals-india-pvt-ltd", "jsw-jnpt-liquid-terminal", "jawahar-nehru-port-authority-jnpa"];

async function verifiedSources() {
  for (const source of rules.sources) {
    const data = await readFile(path.join(process.cwd(), "data/reviewed-tariffs/jnpa-2026", source.file));
    if (createHash("sha256").update(data).digest("hex") !== source.sha256) throw new Error("Reviewed component source hash changed.");
  }
}
function callDate(input: TariffInput) {
  const get = (field: "callDate" | "berthStart" | "timeZone" | "dateOrder") => input[field];
  const raw = get("callDate") ?? get("berthStart"); if (!raw) return;
  const stamp = /\d{1,2}:\d{2}/.test(raw) ? raw : `${raw} 00:00 IST`;
  const parsed = calculateElapsedTime({ start: stamp, end: stamp, timeZone: get("timeZone"), dateOrder: get("dateOrder") as "DMY" | "MDY" | undefined });
  return parsed.status === "ok" ? indianDate(parsed.startUtc) : undefined;
}
const format = (value: string) => money("USD", value);

/** Published component arithmetic only; invoice additions are never implied. */
async function extendedComponents(input: TariffInput, mode: "quote" | "rule", port: string): Promise<TariffResult | undefined> {
  if (!["quote","rule"].includes(mode)) return;
  const get = (field: keyof Omit<TariffInput, "charges">) => detail(input, field);
  const nsft = port === "nhava-sheva-freeport-terminal", nsigt = port === "nhava-sheva-gateway-terminal", nsict = port === "nhava-sheva-international-container-terminal";
  const mumbai = port === "mumbai", jaigarh = port === "jaigarh";
  if (!(nsft || nsigt || nsict || mumbai || jaigarh) || mumbai && get("service") === "coastal") return;
  const wanted = [...new Set(input.charges)], questions: string[] = [], limitations: string[] = [];
  const handles=(nsft||nsigt||nsict)&&wanted.some(c=>["handling","container-handling","cargo-handling","cargo"].includes(c))||(mumbai||nsigt)&&wanted.includes("berth")||jaigarh&&wanted.includes("port-dues");
  if(!handles)return;
  const base = { sourceClass: "official-tariff" as const, applicability: applicability(mode) };
  const rows: Array<{ id: string; charge: string; currency: string; formula: string; section: string }> = [];
  let knownBerthModifiers: string[] = [];
  const expressions: Array<{ id: string; expression: string }> = [];
  const source = nsft ? extensions.containers["nhava-sheva-freeport-terminal"] : nsigt ? extensions.containers["nhava-sheva-gateway-terminal"] : nsict ? extensions.containers["nhava-sheva-international-container-terminal"] : jaigarh ? extensions.jaigarh : extensions.mumbaiForeign;
  const through = "effectiveThrough" in source && typeof source.effectiveThrough === "string" ? source.effectiveThrough : undefined;
  const files = mumbai ? mumbaiSources.sources.slice(0, 2).map(s => ({ ...s, root: "data/ports/mumbai/approved-2026-05-09" })) : [{ ...extensions.sources["source" in source ? source.source : 0], root: "data/reviewed-tariffs/component-extensions-2026" }];
  for (const item of files) {
    const bytes = await readFile(path.join(process.cwd(), item.root, item.file));
    if (createHash("sha256").update(bytes).digest("hex") !== item.sha256) throw new Error("Reviewed component source hash changed.");
  }
  if(mode==="rule"){
    if(mumbai&&get("service")!=="foreign")return;
    const statements:string[]=[];
    if((nsft||nsigt||nsict)&&wanted.some(c=>["handling","container-handling","cargo-handling","cargo"].includes(c))){
      if(nsft){const r=extensions.containers[port as "nhava-sheva-freeport-terminal"];statements.push(`Normal20-foot foreign/EXIM containers: road bundle USD ${r.road[0]} laden / ${r.road[1]} empty; rail bundle USD ${r.rail[0]} laden / ${r.rail[1]} empty per container. The corresponding landside leg is already included; do not add it twice.`);}
      if(nsigt){const r=extensions.containers["nhava-sheva-gateway-terminal"];statements.push(`Normal20-foot foreign/EXIM ship-yard handling: INR ${r.shipYard[0]} laden / ${r.shipYard[1]} empty per container. Add INR ${r.roadAdd}/box for the matching road leg, or INR ${r.railAdd}/box only for applicable ICD rail. Rail mode alone does not establish ICD status. Published ceiling components, not a complete invoice.`);}
      if(nsict){const r=extensions.containers["nhava-sheva-international-container-terminal"];statements.push(`Section1(A) normal20-foot foreign/EXIM ship-yard/yard-ship USING PORT CRANE: INR ${r.shipYard[0]} laden / ${r.shipYard[1]} empty per container. Other equipment/services, landside legs, storage and separately dated MUC need their own rules; their exclusion from this component is not a waiver.`);}
    }
    if(nsigt&&wanted.includes("berth"))statements.push(`The reviewed NSIGT operator berth component is INR ${extensions.containers["nhava-sheva-gateway-terminal"].berthRate}/GRT/hour for the stated foreign-going ordinary basis. Port/private additivity and actual event adjustments remain separate obligations.`);
    if(mumbai&&wanted.includes("berth"))statements.push(`Ordinary foreign berth hire: Indira Dock/Ballard Pier USD0.0137/GRT/started hour; Princes/Victoria Dock USD0.0109. Minimum assessed tonnage1000GRT. Select the actual berth and billable occupancy; do not substitute elapsed port stay or apply unverified readiness/idling/priority adjustments.`);
    if(jaigarh&&wanted.includes("port-dues"))statements.push(`JSW Jaigarh J-1 mechanized-bulk port dues are max(GRT × USD${extensions.jaigarh.rate}, USD${extensions.jaigarh.minimum}) per call, with maximum30-day dues validity. The minimum is monetary, not a GRT floor;30days is not tariff expiry. Other operators, renewals, repeat-entry credits and other marine fees are not covered.`);
    const supported=new Set([...(nsft||nsigt||nsict?["handling","container-handling","cargo-handling","cargo"]:[]),...(mumbai||nsigt?["berth"]:[]),...(jaigarh?["port-dues"]:[])]);
    for(const c of wanted)if(!supported.has(c))questions.push(`${c}: outside the reviewed component explanation`);
    return{...base,status:"explained",sources:sourceLinks(files),body:statements.join("\n\n")+`\n\nSources: ${files.map(f=>`[${f.file}](${f.url})`).join("; ")}. ${source.reference}. Effective ${source.effectiveFrom}; verified ${extensions.verifiedOn}. These are conditional component rules, not a complete bill or a current-call eligibility decision.`,questions,limitations:rulePeriodIssues(input,source.effectiveFrom,through,wanted.includes("berth"))};
  }
  const parseDate = (raw: string) => {
    const stamp = /\d{1,2}:\d{2}/.test(raw) ? raw : `${raw} 00:00 IST`;
    const parsed = calculateElapsedTime({ start: stamp, end: stamp, timeZone: get("timeZone"), dateOrder: get("dateOrder") as "DMY" | "MDY" | undefined });
    if (parsed.status !== "ok") return;
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(parsed.startUtc));
    return ["year", "month", "day"].map(type => parts.find(p => p.type === type)!.value).join("-");
  };
  if ((mumbai || nsigt) && wanted.includes("berth")) {
    const intervalIssue = berthPeriodIssue(input, source.effectiveFrom, through);
    if (intervalIssue) questions.push(intervalIssue);
  }
  const dateRaw = (mumbai || nsigt && wanted.includes("berth")) ? get("berthStart") ?? get("callDate") : get("callDate") ?? get("berthStart");
  const date = dateRaw ? parseDate(dateRaw) : undefined;
  if (!date) questions.push("call date, with unambiguous date order/time zone when a timestamp is supplied");
  else if (date < source.effectiveFrom || through && date > through) limitations.push(`The retained source period (${source.effectiveFrom}${through ? " through " + through : " onward"}) does not cover the requested call date. A matching reviewed source version is unavailable; no quotation has been calculated.`);
  if (get("berthEnd") && (mumbai || nsigt && wanted.includes("berth"))) {
    const end = parseDate(get("berthEnd")!);
    if (!end) questions.push("an unambiguous berth end date");
    else if (end < source.effectiveFrom || through && end > through) limitations.push("The retained source does not cover the complete berth interval. No quotation has been calculated.");
  }
  if (questions.length || limitations.length) return { ...base, status: "unresolved", body: "", questions, limitations };
  const number = (field: keyof Omit<TariffInput, "charges">, positive = false, integer = false) => {
    const raw = get(field);
    if (raw === undefined || !/^\d+(?:\.\d+)?$/.test(raw) || !new Decimal(raw).isFinite() || positive && new Decimal(raw).lte(0) || integer && !new Decimal(raw).isInteger()) {
      questions.push(`${field}: an explicit valid ${positive ? "positive" : "nonnegative"}${integer ? " integer" : ""} quantity is required`); return;
    }
    return raw;
  };
  const hours = () => {
    let duration = get("durationHours");
    if (get("durationMinutes") !== undefined) {
      const minutes = number("durationMinutes", true); if (!minutes) return;
      const converted = new Decimal(minutes).div(60).toString();
      if (duration !== undefined && !new Decimal(duration).eq(converted)) { questions.push("durationHours and durationMinutes disagree"); return; }
      duration ??= converted;
    }
    if (get("berthStart") && get("berthEnd")) {
      const elapsed = calculateElapsedTime({ start: get("berthStart")!, end: get("berthEnd")!, timeZone: get("timeZone"), dateOrder: get("dateOrder") as "DMY" | "MDY" | undefined });
      if (elapsed.status !== "ok") { questions.push(elapsed.message); return; }
      if (duration !== undefined && !new Decimal(duration).eq(elapsed.elapsedHours)) { questions.push("duration and berth timestamps disagree"); return; }
      duration ??= elapsed.elapsedHours;
    }
    if (duration === undefined || !/^\d+(?:\.\d+)?$/.test(duration) || new Decimal(duration).lte(0)) { questions.push("positive ordinary berth occupancy duration or ordered berth timestamps"); return; }
    return duration;
  };
  const add = (charge: string, expression: string, formula: string) => {
    const id = `component_${rows.length}`;
    expressions.push({ id, expression }); rows.push({ id, charge, currency: source.currency, formula, section: source.reference });
  };
  const handlingNames = ["handling", "container-handling", "cargo-handling", "cargo"];
  if ((nsft || nsigt || nsict) && wanted.some(charge => handlingNames.includes(charge))) {
    const before = questions.length;
    if (get("service") !== "foreign") questions.push("handling: explicit foreign-going service is required for this reviewed component");
    if (get("cargoTraffic") !== "exim") questions.push("handling: normal EXIM cargo traffic must be established; coastal/transshipment not covered");
    if (get("containerSize") !== "20") questions.push("handling: explicit 20-foot container size is required");
    if (get("specialCargo") !== "false") questions.push("handling: normal containers without hazardous, ODC, reefer ancillary or other special handling must be explicit");
    const laden = number("ladenContainers", false, true), empty = number("emptyContainers", false, true), mode = get("handlingMode");
    let ladenRate: string | undefined, emptyRate: string | undefined, label = "";
    if (nsft) {
      if (mode !== "road" && mode !== "rail") questions.push("handling: NSFT road or rail bundle must be selected explicitly");
      else { [ladenRate, emptyRate] = extensions.containers["nhava-sheva-freeport-terminal"][mode]; label = `NSFT ${mode} bundle including its corresponding landside leg`; }
    } else if (nsigt) {
      const r = extensions.containers["nhava-sheva-gateway-terminal"];
      if (!["road", "rail", "ship-yard"].includes(mode ?? "")) questions.push("handling: explicit ship-yard-only, road or ICD-rail service scope is required");
      else {
        if (mode === "rail" && get("icdRail") !== "true") questions.push("handling: NSIGT rail requires explicit ICD rail applicability");
        const addition = mode === "road" ? r.roadAdd : mode === "rail" ? r.railAdd : "0";
        ladenRate = new Decimal(r.shipYard[0]).plus(addition).toString(); emptyRate = new Decimal(r.shipYard[1]).plus(addition).toString();
        label = `NSIGT ship-yard${mode === "ship-yard" ? " only" : mode === "road" ? " plus yard-truck direct-delivery/export-intake leg" : " plus ICD yard-rail leg"} (ceiling component)`;
      }
    } else {
      if (mode !== "ship-yard") questions.push("handling: this NSICT approval is ship-yard/yard-ship only; no landside leg");
      if (get("portCrane") !== "true") questions.push("handling: NSICT section1(A) requires explicit use of port crane");
      [ladenRate, emptyRate] = extensions.containers["nhava-sheva-international-container-terminal"].shipYard;
      label = "NSICT ship-yard/yard-ship using port crane";
    }
    if (questions.length === before && laden !== undefined && empty !== undefined && ladenRate && emptyRate) add("handling", `${laden}*${ladenRate}+${empty}*${emptyRate}`, `${label}: ${laden} laden × ${source.currency} ${ladenRate} + ${empty} empty × ${source.currency} ${emptyRate}; per 20-foot container`);
  }
  if ((mumbai || nsigt) && wanted.includes("berth")) {
    const before = questions.length;
    if (get("service") !== "foreign") questions.push("berth: coastal or foreign service must be established; this is the foreign-going component");
    if (mumbai && get("vesselCategory") !== "general-cargo") questions.push("berth: this reviewed Mumbai branch requires an ordinary general-cargo vessel");
    const gt = number("gt", true), duration = hours();
    let rate: string | undefined;
    if (mumbai) {
      const terminal = get("terminal");
      const match = Object.entries(extensions.mumbaiForeign.rates).find(([name]) => name.toLowerCase() === terminal?.trim().toLowerCase());
      if (!match) questions.push("berth: confirm Indira Dock, Ballard Pier, Princes Dock or Victoria Dock; no berth branch selected");
      rate = match?.[1];
    } else rate = extensions.containers["nhava-sheva-gateway-terminal"].berthRate;
    if (questions.length === before && gt && duration && rate) {
      const assessed = mumbai ? `max(${gt},${extensions.mumbaiForeign.minimumGt})` : gt;
      add("berth", `${assessed}*${rate}*ceil(${duration})`, `${mumbai ? get("terminal") : "NSIGT operator berth (ceiling component)"}: ${assessed} GT × ${source.currency} ${rate}/GRT/started hour × ceil(${duration}) hours`);
      knownBerthModifiers = (["priority", "idleTime", "penalty", "otherAdjustments", "shifting", "falseReadiness", "ousting", "rebate"] as const).filter(field => get(field) === "true");
      if (knownBerthModifiers.length) questions.push(`berth: stated ${knownBerthModifiers.join(", ")} requires its applicable adjustment; only the unadjusted base is calculated, not a complete adjusted berth charge`);
    }
  }
  if (jaigarh && wanted.includes("port-dues")) {
    const before = questions.length;
    if (!/^JSW(?:\s+Jaig(?:arh|ad)(?:\s+Port(?:\s+Limited)?)?)?$/i.test(get("operator")?.trim() ?? "")) questions.push("port-dues: explicit JSW Jaigarh operator identity is required; generic Jaigarh does not select an operator");
    if (get("cargoCategory") !== "mechanized-bulk") questions.push("port-dues: explicit mechanized-bulk category is required");
    const gt = number("gt", true), days = number("callDays", true);
    if (days && new Decimal(days).gt(extensions.jaigarh.maximumValidityDays)) questions.push("port-dues: single-call duration exceeds maximum 30-day dues validity; renewal charging is not approved");
    if (questions.length === before && gt && days) add("port-dues", `max(${gt}*${extensions.jaigarh.rate},${extensions.jaigarh.minimum})`, `JSW Jaigarh J-1 single-call mechanized-bulk dues: max(${gt} GRT × USD ${extensions.jaigarh.rate}, USD ${extensions.jaigarh.minimum} monetary minimum); ${days}-day call within maximum 30-day dues validity`);
  }
  for (const charge of wanted) if (!rows.some(row => row.charge === charge || row.charge === "handling" && handlingNames.includes(charge)) && !questions.some(item => item.startsWith(`${charge}:`))) questions.push(`${charge}: requested component is unresolved or outside these reviewed rules; no amount assigned`);
  if (!rows.length) return { ...base, status: "unresolved", body: "", questions: [...new Set(questions)] };
  expressions.push({ id: "subtotal", expression: rows.map(row => `$${row.id}`).join("+") });
  const calculations = calculateChargeBatch(expressions), values = new Map(calculations.map(c => [c.id, c.result]));
  const money = (value: string) => { const amount = new Decimal(value); const [whole, fraction] = amount.toFixed(Math.max(2, amount.decimalPlaces())).split("."); return `${source.currency} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`; };
  const chargeIds = rows.flatMap(row => {
    if (row.charge === "handling") {
      const ids = ["container:20ft:normal-exim:ship-yard"];
      if (get("handlingMode") === "road") ids.push("container:20ft:normal-exim:yard-road");
      if (get("handlingMode") === "rail") ids.push(`container:20ft:normal-exim:yard-rail${get("icdRail") === "true" ? "-icd" : ""}`);
      return ids;
    }
    if (row.charge === "berth") return ["berth:ordinary-foreign:gt-hour"];
    return ["port-dues:jsw-jaigarh:mechanized-bulk:single-call"];
  });
  const limits = ["Published source-pinned, conditional pre-tax components; not a complete bill. Actual-date amendments, contracts/concessions and billable-event adjustments are not certified. Taxes, FX conversion and invoice-level rounding are outside these components; no invoice rule is applied to component lines."];
  if (nsft || nsigt) limits.push("Matching landside service is included only as selected. NSFT berth ownership/basis and port/private berth additivity are unresolved; no JNPA berth charge is silently added. Keep USD and INR separate; this does not establish a complete comparison winner.");
  if (nsict) limits.push("Section1(A) port-crane movement only. Yard-truck, ICD yard-rail, storage, special services and separately dated MUC are excluded, not waived. Grand-total upward rupee rounding is not applied to this isolated component.");
  if (jaigarh) limits.push("J-1 per-call component only: 30 days is maximum dues validity, not tariff expiry. No prior-payment credit, repeat-entry reuse, renewal formula, berth/pilotage or other fee is included. Actual-call/date invoice applicability is not approved by the source-pinned arithmetic review.");
  if (mumbai || rows.some(row => row.charge === "berth")) limits.push("Ordinary unadjusted berth base assumes the supplied duration is billable occupancy. Readiness/idling/priority/penal adjustments require their actual predicates; elapsed port stay is not automatically berth occupancy.");
  if (knownBerthModifiers.length) limits.push(`Known berth modifiers: ${knownBerthModifiers.join(", ")}. Their adjustments remain unresolved; the displayed amount is the unadjusted base and cannot establish a complete adjusted charge or comparison winner.`);
  const body = `**Conditional published components — not a complete bill**\n\n| Component | Amount |\n|---|---:|\n${rows.map(row => `| ${row.charge} | ${money(values.get(row.id)!)} |`).join("\n")}\n| Identified component subtotal | ${money(values.get("subtotal")!)} |\n\n${rows.map(row => `- ${row.formula}.`).join("\n")}\n\n${limits.join("\n\n")}\n\nSources: ${files.map(item => `[${item.file}](${item.url})`).join("; ")}. ${source.reference}. Effective ${source.effectiveFrom}${"effectiveThrough" in source ? ` through ${source.effectiveThrough}` : " (no universal closed expiry inferred)"}; verified ${extensions.verifiedOn}.`;
  return { ...base, status: "calculated", sources: sourceLinks(files), body, questions: [...new Set(questions)], totals: [{ currency: source.currency, amount: values.get("subtotal")!, chargeIds, lineAmounts: rows.map(row => values.get(row.id)!), basis: "component" }], calculation: { sourceHashes: files.map(file => file.sha256), calculations, rows, currencies: [source.currency], dispositions: wanted.map(charge => ({ charge, status: rows.some(row => row.charge === charge || row.charge === "handling" && handlingNames.includes(charge)) ? "calculated" : "unresolved" })) } };
}

/** These packets approve explanations, not executable call/invoice rules. */
async function reviewedExplanation(input: TariffInput, mode: "quote" | "rule", port: string): Promise<TariffResult | undefined> {
  if (mode !== "rule") return;
  let supported: string[], sourceIds: string[], review: string, body: string, questions: string[];
  let from: string | undefined, through: string | undefined;
  switch (port) {
    case "bpcl-liquid-cargo-jetty":
      supported = ["berth"]; sourceIds = ["JNPA26", "BPCL21", "BPCL26"]; review = "bpcl-ictpl";
      from = "2026-05-01"; through = "2027-04-30";
      body = "**BPCL Liquid Cargo Jetty — bounded hourly-rule explanation**\n\nThe located JNPA ordinary merchant-vessel berth clause uses GRT per hour or part thereof: a partial billable hour is a started hour, not a started day. Its published period is 1 May 2026–30 April 2027. Readiness, eligible idling, priority and penal provisions can change chargeable time. No general daily minimum appears in this ordinary table; that is not proof that every minimum is absent.\n\nHistorical BPCL 2021 clauses refer to berth hire payable to JNPT. The BPCL 2026 document covers CRC/other services and does not establish continuation of every historical berth condition. This explanation does not identify the separate BPCL Cargo Jetty catalog entry.";
      questions = ["The applicable minimum clause, category, version and basis (per call/day/block/tonnage), including its interaction with time, remain unresolved.", "Current BPCL contractual continuation beyond the bounded ordinary-rule source trail remains unresolved."];
      break;
    case "ictpl":
      supported = ["berth"]; sourceIds = ["ICTPL18", "ICTPL20"]; review = "bpcl-ictpl";
      body = "**ICTPL — Historical rule explanation only**\n\nThe 2018 approved SOR defines a calendar day as midnight-to-midnight, but its ordinary berth table explicitly charges per GRT per hour or part thereof at 1.3 times the applicable MBPT berth basis. The minimum assessed GRT is 1,000 except for offshore supply vessels. The calendar-day definition does not replace that hourly unit; the berth multiplier is not an all-charge multiplier.\n\nThe 2020 extension reaches 31 March 2021 or the stated earlier triggers. Neither document establishes current ICTPL prices or resolves an unidentified 2021 charge sheet. Consecutive started 24-hour blocks and calendar dates are different bases; the actual charge clause must select the basis.";
      questions = ["The actual charge line, day definition and source version are needed to interpret a particular sheet; an operative current instrument is needed for current applicability."];
      break;
    case "konkan-lng-ltd":
      supported = ["berth", "pilotage"]; sourceIds = ["KLL25", "KLL26"]; review = "jsw-kll"; from = "2025-10-01";
      body = "**Konkan LNG — dated notice explanation for LNG vessels**\n\nThe notice effective 1 October 2025 covers up to 36 hours from first line ashore to cast off. Its additional berth-hire trigger is excess time attributable to the vessel, at USD 0.0041/GRT/hour. Terminal-only excess does not satisfy that particular trigger; this is not a base-fee waiver or refund. Mixed-delay attribution remains unresolved.\n\nThe revision signed 5 October 2026 becomes effective 1 November 2026, not for October calls. It combines berth hire and pilotage at USD 0.359/GRT, with no cap; do not charge that rate separately for each component. Its FX basis is SBI TT selling rate on the scheduled berthing day, using the preceding bank working day if that day is a bank holiday. The new notice does not reconcile the old 36-hour/delay footnote. No expiry of the entire old notice or automatic continuation of that footnote is inferred.";
      questions = ["Post-1 November continuation of the 36-hour/delay footnote, mixed-delay allocation, rounding/tax interactions and any formal base-fee relief or claim procedure remain unresolved."];
      break;
    case "mumbai-cruise-terminal":
      supported = ["berth", "head-tax", "passenger", "rebate"]; sourceIds = ["CRUISE26", "MBPA26"]; review = "terminals-cruise";
      from = "2026-04-01"; through = "2027-03-31";
      body = "**Mumbai Port cruise structure — bounded public-rule explanation**\n\nThe 27 May 2026 circular extends the concessional structure from 1 April 2026 through 31 March 2027. The first 12-hour regime has a fixed ship element of USD 0.085/GRT plus USD 6/passenger head tax. Beyond 12 hours, the ship-time element is USD 0.0175/GRT/hour. These are different charging bases, not a vessel total or a repeated-head-tax rule.\n\nPublished annual-call rebate bands: up to 10 calls, none; 11–35, 10%; 36–70, 15%; above 70, 20%. The general SOR separately lists INR 346 per embarking cruise passenger, INR 303 per disembarking passenger and INR 115 per bona fide visitor. Its general cruise provision is 60% of relevant ordinary charges, not a 60% discount. Do not automatically stack these charges or reductions with the special circular.";
      questions = ["Rebate base/counting entity/year, retrospective or prospective application, ancillary/head-tax interaction and discount stacking remain unresolved.", "Private-terminal additions and a complete invoice's currency/tax/rounding treatment require their applicable authority and transaction facts."];
      break;
    default: return;
  }
  if (!input.charges.some(charge => supported.includes(charge))) return;
  for (const charge of input.charges.filter(charge => !supported.includes(charge))) questions.push(`${charge}: the requested explanation is outside this reviewed packet's scope.`);
  const sources = explanationSources.sources.filter(source => sourceIds.includes(source.id));
  const approval = explanationSources.reviews.find(source => source.file === `${review}-second-review.json`)!;
  for (const source of [...sources, approval]) {
    const bytes = await readFile(path.join(process.cwd(), "data/reviewed-tariffs/bounded-explanations-2026", source.file));
    if (createHash("sha256").update(bytes).digest("hex") !== source.sha256) throw new Error("Reviewed explanation source hash changed.");
  }
  if (from) questions.push(...rulePeriodIssues(input, from, through, input.charges.includes("berth")));
  if (input.terminal) questions.push("This port-level explanation does not establish the supplied berth's specific applicability.");
  return { sourceClass: "official-tariff", status: "explained", applicability: applicability(mode), sources: sourceLinks(sources), questions,
    body: body + `\n\nSources: ${sources.map(source => `[${source.reference}](${source.url})`).join("; ")}. Reviewed ${explanationSources.verifiedOn}; later amendments not verified. Explanation only, not current-call applicability or a complete monetary quote.` };
}

/** Reusable ordinary component operations. Partial source approval never turns
 * into a complete bill, and unavailable charges remain explicit obligations. */
async function reviewedComponents(input: TariffInput, mode: "quote" | "rule"): Promise<TariffResult | undefined> {
  const get = (field: keyof Omit<TariffInput, "charges">) => detail(input, field);
  const port = get("port"); if (!port) return;
  if(port==="ranpar-finolex"&&mode==="rule"&&input.charges.every(c=>["other","identity","capacity"].includes(c))){
    const s=extensions.finolexIdentity;const bytes=await readFile(path.join(process.cwd(),"data/reviewed-tariffs/component-extensions-2026",s.file));if(createHash("sha256").update(bytes).digest("hex")!==s.sha256)throw new Error("Reviewed identity source hash changed.");
    return{status:"explained",sourceClass:"official-tariff",applicability:applicability(mode),sources:sourceLinks([s]),questions:[],body:`Finolex Terminal is associated with Ranpar/Pawas, Ratnagiri. Distinguish the booked chemical/EDC jetty from the coal facility. Capacity figures in the retained terminal-information sheet are displacement tonnes, not GT/GRT; they cannot be substituted for tariff gross tonnage. This facility sheet has no established dated berth-hire schedule and is not vessel-specific berth acceptance. [Operator terminal-information sheet, p1](${s.url}).`};
  }
  const explanation = await reviewedExplanation(input, mode, port);
  if (explanation) return explanation;
  const extended = await extendedComponents(input, mode, port);
  if (extended) return extended;
  if (!eligiblePorts.includes(port)) return;
  await verifiedSources();
  const base = { sourceClass: "official-tariff" as const, applicability: applicability(mode) };
  const questions: string[] = [];
  const selectedSources = rules.sources.filter((_, index) => index === 0 || index === (port === "gateway-terminals-india-pvt-ltd" ? 1 : port === "jsw-jnpt-liquid-terminal" ? 2 : -1));
  const sources = `[JNPA SOR, effective ${rules.effectiveFrom}–${rules.effectiveThrough}](${rules.sources[0].url})` + (port === "gateway-terminals-india-pvt-ltd" ? `; [GTI general note 5, p11](${rules.sources[1].url})` : port === "jsw-jnpt-liquid-terminal" ? `; [JSW JNPT general conditions, pp1–4](${rules.sources[2].url})` : "");
  if (mode === "rule") {
    const statements: string[] = [];
    for (const charge of input.charges) {
      if (charge === "berth") statements.push(`Ordinary foreign-going berth hire is USD ${rules.berth.rate}/GRT per hour or part. It is hourly billing; a commenced hour is rounded up, not a whole day. Readiness cessation, port-attributable idling, priority and penalty clauses can change the charge. ${rules.berth.section}.`);
      else if (charge === "pilotage" || charge === "towage") statements.push(`Ordinary foreign-going pilotage-cum-towage up to ${rules.pilotage.maximumGt} GRT uses USD ${rules.pilotage.rate}/GRT, minimum USD ${rules.pilotage.minimumVisit}/visit. Inward and outward are each 50% at that leg's status; routine pilot/tug assistance is included. Separate hired-craft services require their own rule. ${rules.pilotage.section}.`);
      else questions.push(`The requested ${charge} explanation requires its applicable reviewed rule.`);
    }
    return { ...base, sources: sourceLinks(selectedSources), status: statements.length ? "explained" : "unresolved", body: statements.length ? statements.join("\n\n") + `\n\nSources: ${sources}. Verified ${rules.verifiedOn}; later amendments not verified.` : "", questions, limitations: rulePeriodIssues(input, rules.effectiveFrom, rules.effectiveThrough, input.charges.includes("berth")) };
  }
  const date = callDate(input);
  const limitations: string[] = [];
  if (!date) questions.push("call date (and the timestamp zone/date order if needed)");
  else if (date < rules.effectiveFrom || date > rules.effectiveThrough) limitations.push(`The retained governing schedule covers ${rules.effectiveFrom} through ${rules.effectiveThrough}, not the requested call date. A matching reviewed source version is unavailable. No quotation has been calculated.`);
  if (!get("gt")) questions.push("gross tonnage (GT/GRT)");
  if (!get("service")) questions.push("coastal or foreign-going service");
  else if (get("service") !== "foreign") limitations.push("A reviewed coastal-service rule for these components is unavailable.");
  if (questions.length || limitations.length) return { ...base, status: "unresolved", body: "", questions, limitations };
  const gt = get("gt")!; const rows: Array<{ id: string; charge: string; formula: string; section: string }> = [];
  const expressions: Array<{ id: string; expression: string }> = [];
  const wanted = [...new Set(input.charges)];
  for (const [index, charge] of wanted.entries()) {
    const id = `component_${index}`;
    if (charge === "berth" && port !== "jawahar-nehru-port-authority-jnpa") {
      const intervalIssue = berthPeriodIssue(input, rules.effectiveFrom, rules.effectiveThrough);
      if (intervalIssue) { questions.push(intervalIssue); continue; }
      let hours = get("durationHours");
      if (get("durationMinutes") !== undefined) {
        const converted = new Decimal(get("durationMinutes")!).div(60).toString();
        if (hours !== undefined && !new Decimal(hours).eq(converted)) { questions.push("durationHours and durationMinutes disagree"); continue; }
        hours ??= converted;
      }
      if (get("berthStart") && get("berthEnd")) {
        const time = calculateElapsedTime({ start: get("berthStart")!, end: get("berthEnd")!, timeZone: get("timeZone"), dateOrder: get("dateOrder") as "DMY" | "MDY" | undefined });
        if (time.status !== "ok") { questions.push(time.message); continue; }
        if (hours && !new Decimal(hours).eq(time.elapsedHours)) { questions.push("duration and timestamps disagree"); continue; }
        hours ??= time.elapsedHours;
      }
      if (!hours) { questions.push("berth occupancy duration or berth start/end times"); continue; }
      expressions.push({ id, expression: `${gt}*${rules.berth.rate}*ceil(${hours})` });
      rows.push({ id, charge: "Ordinary berth base", formula: `${gt} GT × USD ${rules.berth.rate}/GT/hour × ceil(${hours}) hours`, section: rules.berth.section });
    } else if (charge === "pilotage" || charge === "towage") {
      if (charge === "towage" && wanted.includes("pilotage")) continue;
      if (new Decimal(gt).gt(rules.pilotage.maximumGt)) { questions.push("reviewed higher-tonnage pilotage slab"); continue; }
      const movements = get("movements");
      if (movements !== "2") { questions.push("whether the ordinary pilotage includes one inward and one outward movement, both foreign-going"); continue; }
      expressions.push({ id, expression: `max(${gt}*${rules.pilotage.rate},${rules.pilotage.minimumVisit})` });
      rows.push({ id, charge: "Ordinary pilotage-cum-towage (inward + outward)", formula: `max(${gt} GT × USD ${rules.pilotage.rate}/GT, USD ${rules.pilotage.minimumVisit})`, section: rules.pilotage.section });
    } else if (charge === "port-dues" && port === "jsw-jnpt-liquid-terminal" && get("vesselCategory") === "tanker" && ["loading", "discharging", "both"].includes(get("cargoOperation") ?? "")) {
      expressions.push({ id, expression: `${gt}*${rules.portDues.rate}` }); rows.push({ id, charge: "Ordinary JNPA port-dues base", formula: `${gt} GT × USD ${rules.portDues.rate}/GT`, section: rules.portDues.section });
    } else questions.push(`${charge}: governing applicability/source remains unresolved; no amount assigned`);
  }
  if (!rows.length) return { ...base, status: "unresolved", body: "", questions: [...new Set(questions)] };
  expressions.push({ id: "subtotal", expression: rows.map(r => `$${r.id}`).join("+") });
  const calculations = calculateChargeBatch(expressions); const amounts = new Map(calculations.map(c => [c.id, c.result]));
  const body = `**Conditional ordinary pre-tax components — not a complete bill**\n\n| Component | Amount |\n|---|---:|\n${rows.map(r => `| ${r.charge} | ${format(amounts.get(r.id)!)} |`).join("\n")}\n| Identified component subtotal | ${format(amounts.get("subtotal")!)} |\n\n${rows.map(r => `- **${r.charge}:** ${r.formula}.`).join("\n")}\n\nAssumes ordinary unadjusted occupancy/operations. This does not assert that no adjustment applies. Routine pilotage tugs are not charged twice.\n\nSources: ${sources}. ${rows.map(r => r.section).join("; ")}. Published validity ${rules.effectiveFrom}–${rules.effectiveThrough}; verified ${rules.verifiedOn}. Recheck subsequent amendments before actual invoicing.`;
  if(wanted.includes("berth")){
    const modifiers=(["priority","idleTime","penalty","otherAdjustments","shifting","falseReadiness","ousting","rebate"] as const).filter(f=>get(f)==="true");
    if(modifiers.length)questions.push(`berth: ${modifiers.join(", ")} needs its governing adjustment; only the unadjusted base is shown`);
  }
  const chargeIds=rows.flatMap(r=>r.charge.includes("berth")?["berth:ordinary-foreign:gt-hour"]:r.charge.includes("pilotage")?["pilotage-towage:ordinary-foreign:inward-outward"]:["port-dues:jnpa:ordinary-cargo"]);
  return { ...base, sources: sourceLinks(selectedSources), status: "calculated", body:body+"\n\nFor a complete invoice, separately establish: "+rules.pending.join("; ")+(port==="jsw-jnpt-liquid-terminal"?". "+rules.jswSourceGap:""),questions:[...new Set(questions)],totals:[{currency:"USD",amount:amounts.get("subtotal")!,chargeIds,basis:"component",lineAmounts:rows.map(r=>amounts.get(r.id)!)}],calculation:{sourceHashes:rules.sources.map(s=>s.sha256),calculations} };
}

const coastalConditions = {
  terminal: "Indira Dock", vesselCategory: "general-cargo", flag: "India", service: "coastal", coastalLicence: "true", berthAllotted: "true", readinessValid: "true", favourableConditions: "true",
  idleTime: "false", shifting: "false", falseReadiness: "false", priority: "false", ousting: "false", penalty: "false", rebate: "false",
} as const;
const domesticTaxConditions = {
  directBilling: "true", registeredCustomer: "true", privateCustomer: "true", supplierState: "Maharashtra", supplyState: "Maharashtra", sez: "false", taxExemption: "false",
} as const;
const descriptions: Partial<Record<keyof TariffInput, string>> = {
  gt: "gross tonnage (GT/GRT)", terminal: "berth/terminal", vesselCategory: "vessel category", flag: "vessel flag", service: "coastal or foreign-going service",
  berthStart: "when the berth was taken, with date and time", berthEnd: "when the berth was left, with date and time", readinessTime: "readiness-to-sail date and time", cargoOperation: "loading/discharging operation",
  coastalLicence: "whether a dedicated coastal licence was valid throughout this call", berthAllotted: "whether the berth had been allotted", readinessValid: "whether the readiness-to-sail signal was valid", favourableConditions: "whether tide and weather were favourable",
  idleTime: "whether there was port-caused idle time", shifting: "whether there was shifting", falseReadiness: "whether there was a false readiness signal", priority: "whether priority berthing applied", ousting: "whether there was an ousting arrangement", penalty: "whether any penalty applied", rebate: "whether any special rebate applied",
  directBilling: "whether the port supplied and billed this service directly", registeredCustomer: "whether the customer is regularly GST registered", privateCustomer: "whether the customer is a private shipping company", supplierState: "supplier location state", supplyState: "place-of-supply state", sez: "whether the customer is an SEZ unit", taxExemption: "whether a tax exemption or concession applies", standaloneBill: "whether berth hire is a standalone bill",
};

/** The retained Mumbai arithmetic is independent of conversation interpretation and quote storage. */
async function coastalMumbai(input: TariffInput, mode: "quote" | "rule"): Promise<TariffResult> {
  const r = mumbaiSources;
  for (const source of r.sources) {
    const bytes = await readFile(path.join(process.cwd(), "data/ports/mumbai/approved-2026-05-09", source.file));
    if (createHash("sha256").update(bytes).digest("hex") !== source.sha256) throw new Error("Approved tariff source checksum mismatch.");
  }
  const base = { sourceClass: "official-tariff" as const, sources: sourceLinks(r.sources), applicability: { ...applicability(mode), effectiveFrom: r.effectiveFrom } };
  if (mode === "rule") {
    if (input.terminal && input.terminal !== r.berth || input.vesselCategory && input.vesselCategory !== "general-cargo" || input.service && input.service !== "coastal") {
      return unresolved(["The retained ordinary coastal Indira Dock rule does not establish this berth/category/service. A matching rule is needed."]);
    }
    return { ...base, status: "explained", questions: [], limitations: rulePeriodIssues(input, r.effectiveFrom, r.verifiedThrough, true), body: `The retained May 2026 ordinary coastal Indira Dock rule charges INR ${r.ratePerGrtStartedHour} per GRT per commenced hour: any part hour counts as a whole hour. It has a ${r.minimumGrt}-GRT floor and INR ${r.minimumBill} bill minimum. Readiness and operation conditions affect chargeable occupancy. This is a rule explanation, not a vessel quote or confirmation of current October applicability. Rate effective ${r.effectiveFrom}. [MbPA SOR §2.17](${r.sources[0].url}); [May amendment](${r.sources[1].url}).${input.charges.includes("gst") ? `\n\nFor a directly billed ordinary private registered customer with supplier location and place of supply both Maharashtra, no SEZ status or exemption/concession, the retained treatment is CGST ${r.cgstPercent}% plus SGST ${r.sgstPercent}%, SAC ${r.sac}. This conditional explanation does not decide your tax status. [MbPA GST classification p38](${r.sources[2].url}); [CBIC heading9967](${r.sources[3].url}); [intra-state supply FAQ85](${r.sources[4].url}).` : ""} Other berth/category/tax conditions require their applicable rules.` };
  }
  if (!input.charges.includes("berth")) return unresolved(["The base service and applicable rule for the requested tax/rounding scope are needed."]);
  const includeTax = input.charges.includes("gst"), includeRounding = input.charges.includes("rounding");
  const conditions = { ...coastalConditions, ...(includeTax ? domesticTaxConditions : {}), ...(includeRounding ? { standaloneBill: "true" } : {}) };
  const required: Array<keyof Omit<TariffInput, "charges">> = ["gt", "berthStart", "berthEnd", "readinessTime", "cargoOperation", ...Object.keys(conditions) as Array<keyof typeof conditions>];
  const missing = required.filter(key => detail(input, key) === undefined).map(key => descriptions[key] ?? key);
  const mismatched = Object.entries(conditions).filter(([key, expected]) => detail(input, key as keyof typeof conditions) !== undefined && detail(input, key as keyof typeof conditions) !== expected);
  if (mismatched.length || detail(input, "otherAdjustments") === "true") return unresolved([`The retained ordinary coastal rule does not cover these current conditions: ${[...mismatched.map(([key]) => descriptions[key as keyof TariffInput] ?? key), ...(detail(input, "otherAdjustments") === "true" ? ["other adjustments"] : [])].join(", ")}. A matching rule is needed; do not change the facts to fit this rule.`]);
  if (missing.length) return unresolved(missing);
  if (!["loading", "discharging", "both"].includes(input.cargoOperation!)) return unresolved(["The applicable non-cargo operation rule is not established."]);
  const time = calculateElapsedTime({ start: input.berthStart!, end: input.berthEnd!, timeZone: input.timeZone, dateOrder: input.dateOrder });
  if (time.status !== "ok") return unresolved([time.message]);
  const rawReadiness = input.readinessTime!;
  const candidateYears = [...new Set([time.startUtc.slice(0, 4), time.endUtc.slice(0, 4)])];
  const readinessCandidates = /\b\d{4}\b/.test(rawReadiness) ? [rawReadiness] : candidateYears.map(year => rawReadiness.replace(/(\b\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?))(?=\s|$)/i, `$1 ${year}`));
  const checked = readinessCandidates.map(end => calculateElapsedTime({ start: input.berthStart!, end, timeZone: input.timeZone, dateOrder: input.dateOrder }));
  const valid = checked.filter(result => result.status === "ok" && Date.parse(result.endUtc) <= Date.parse(time.endUtc));
  if (!/\b\d{4}\b/.test(rawReadiness) && valid.length !== 1) return unresolved(["The readiness date's year is not uniquely determined by the berth interval."]);
  const readiness = valid.length === 1 ? valid[0] : checked[0];
  if (readiness.status !== "ok") return unresolved([readiness.message]);
  if (Date.parse(readiness.endUtc) > Date.parse(time.endUtc) || new Decimal(time.elapsedHours).lte(0)) return unresolved(["Ordered berth, readiness and departure times are required."]);
  if (input.durationHours && !new Decimal(input.durationHours).eq(time.elapsedHours) || input.durationMinutes && !new Decimal(input.durationMinutes).eq(time.elapsedMinutes)) return unresolved(["The stated duration conflicts with the berth timestamps."]);
  if (Date.parse(readiness.endUtc) + Number(r.readinessAllowanceHours) * 3600000 < Date.parse(time.endUtc)) return unresolved(["Readiness-clock exclusions need review before applying a cutoff earlier than departure."]);
  if (Date.parse(time.startUtc) < Date.parse(r.effectiveFrom + "T00:00:00+05:30") || Date.parse(time.endUtc) > Date.parse(r.verifiedThrough + "T23:59:59+05:30")) return unresolved([`The call lies outside this retained rule packet's bounded arithmetic period (${r.effectiveFrom} through ${r.verifiedThrough}); a matching source version is needed. These metadata dates do not certify current tariff applicability.`]);

  const fullBill = includeTax && includeRounding;
  const expressions = [
    { id: "hours", expression: `ceil(${time.elapsedHours})` },
    { id: "assessed_gt", expression: `max(${input.gt},${r.minimumGrt})` },
    { id: "berth_raw", expression: `$assessed_gt*${r.ratePerGrtStartedHour}*$hours` },
    { id: "berth", expression: fullBill ? `max(${r.minimumBill},$berth_raw)` : "$berth_raw" },
    ...(includeTax ? [
      { id: "cgst", expression: `$berth*${r.cgstPercent}/100` }, { id: "sgst", expression: `$berth*${r.sgstPercent}/100` },
      { id: "gst", expression: "$cgst+$sgst" }, { id: "unrounded_total", expression: "$berth+$gst" },
    ] : [{ id: "unrounded_total", expression: "$berth" }]),
    { id: "total", expression: fullBill ? "ceil($unrounded_total)" : "$unrounded_total" },
    { id: "rounding", expression: "$total-$unrounded_total" },
  ];
  const calculations = calculateChargeBatch(expressions), values = new Map(calculations.map(item => [item.id, item.result]));
  const amount = (key: string) => values.get(key)!;
  const questions: string[] = [];
  if (includeTax && ["cgst", "sgst"].some(key => new Decimal(amount(key)).decimalPlaces() > 2)) return unresolved(["Fractional-paise tax rounding requires an approved rule; no complete tax total is established."]);
  if (!fullBill && new Decimal(amount("berth")).lt(r.minimumBill)) questions.push("The bill scope is needed before allocating the minimum bill charge.");
  if (includeRounding && !includeTax) questions.push("Final bill rounding needs the complete bill total and tax treatment.");
  const lines = [
    { charge: "Berth hire", amount: amount("berth") },
    ...(includeTax ? [{ charge: `CGST ${r.cgstPercent}%`, amount: amount("cgst") }, { charge: `SGST ${r.sgstPercent}%`, amount: amount("sgst") }] : []),
    ...(fullBill ? [{ charge: "Upward whole-rupee bill adjustment", amount: amount("rounding") }] : []),
  ];
  const sourceText = `[MbPA May 2026 SOR §1.2 and §2.17, pp4,6,22–23](${r.sources[0].url}); [9 May 2026 amendment p2](${r.sources[1].url})${includeTax ? `; [MbPA GST classification p38](${r.sources[2].url}); [CBIC heading9967](${r.sources[3].url}); [intra-state supply FAQ85](${r.sources[4].url})` : ""}`;
  const body = `**Mumbai Indira Dock — conditional retained-May-rule estimate${includeTax ? " including GST" : ", before tax"}**\n\nCurrent October tariff applicability is unverified. The amounts below apply the retained May 2026 rule to your stated eligibility, operating and tax conditions; they are not a verified-current tariff quote.\n\n| Component | Amount |\n|---|---:|\n${lines.map(line => `| ${line.charge} | ${money("INR", line.amount)} |`).join("\n")}\n| **Conditional ${fullBill ? "scoped total" : "component total"}** | **${money("INR", amount("total"))}** |\n\n- **Time:** ${input.berthStart} → ${input.berthEnd}; ${time.elapsedMinutes} elapsed minutes, ${amount("hours")} commenced hours. Valid readiness ${input.readinessTime} + ${r.readinessAllowanceHours}h is no earlier than actual departure, so departure ends this charge.\n- **Berth formula:** max(${input.gt}, ${r.minimumGrt}) GT × INR ${r.ratePerGrtStartedHour}/GRT/commenced hour × ${amount("hours")} hours = ${money("INR", amount("berth_raw"))}. ${fullBill ? `INR ${r.minimumBill} minimum bill checked. Final total rounds upward to whole INR.` : `The INR ${r.minimumBill} bill minimum and final invoice rounding require the whole bill scope.`}\n${includeTax ? `- **GST:** SAC ${r.sac}; CGST ${r.cgstPercent}% + SGST ${r.sgstPercent}%, included once. Supplier and place of supply both Maharashtra; no IGST added.\n` : ""}- **Scope:** requested berth${includeTax ? ", GST" : ""}${fullBill ? " and bill rounding" : ""} only. Other port-call services and settlement adjustments excluded. The coastal INR rate is used directly; no additional coastal reduction or FX.\n\nSources: ${sourceText}. Retained rate effective ${r.effectiveFrom}; later amendments/current October applicability have not been established.`;
  return { ...base, status: "calculated", body, questions, totals: [{ currency: "INR", amount: amount("total"), chargeIds: ["berth", ...(includeTax ? ["gst"] : []), ...(fullBill ? ["bill-rounding"] : [])], lineAmounts: lines.map(line => line.amount), basis: fullBill ? "scoped-quote" : "component" }],
    calculation: { sourceHashes: r.sources.map(source => source.sha256), calculations, rows: lines, elapsedMinutes: time.elapsedMinutes, billableHours: amount("hours"), suppliedGt: input.gt, assessedGt: amount("assessed_gt"), startUtc: time.startUtc, endUtc: time.endUtc, readinessUtc: readiness.endUtc } };
}

function sourceGap(input: TariffInput): TariffResult {
  const entry = (coverageGaps.ports as Record<string, { approvedComponents: Array<{ charges: string[]; scope: string }>; gaps: Array<{ charges: string[]; cause: string; message: string }> }>)[input.port!];
  if (!entry) return unresolved([], "Missing tariff authority: no verified tariff yet for this service.");
  const gaps: string[] = [];
  for (const charge of input.charges) {
    const invoice = (coverageGaps.invoiceGaps as Record<string, { message: string }>)[charge];
    if (invoice) { gaps.push(invoice.message); continue; }
    const matching = entry.gaps.filter(gap => gap.charges.includes(charge) || gap.charges.includes("*") && gap.cause !== "identity");
    gaps.push(...matching.map(gap => gap.message));
    if (!matching.length) gaps.push(`${charge}: no reviewed executable rule for the requested scope.`);
  }
  if (!input.operator && !input.terminal) gaps.push(...entry.gaps.filter(gap => gap.cause === "identity" && gap.charges.includes("*")).map(gap => gap.message));
  return unresolved([], "Missing tariff authority or rule coverage. No source-validated amount has been established.\n\n" + [...new Set(gaps)].join("\n\n"));
}

const identityKey = (name: string) => name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function resolveTariffPort(name: string): string | undefined {
  const normalized = identityKey(name);
  const exact = SUPPORTED_PORTS.find(port => port === name.trim().toLowerCase() || PORT_ALIASES[port]?.some(alias => identityKey(alias) === normalized));
  if (exact) return exact;
  // A bounded name/acronym pair is equivalent only when BOTH catalog identities
  // resolve independently to the same entry. Generic or conflicting labels stay unresolved.
  const pair = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(name) ?? /^([^,]+),\s*([^,]+)$/.exec(name);
  if (!pair) return;
  const full = resolveTariffPort(pair[1]), short = resolveTariffPort(pair[2]);
  return full && full === short ? full : undefined;
}
// Catalog relationships establish identity only, never pricing authority.
const parentPorts: Record<string, string> = {
  "gateway-terminals-india-pvt-ltd": "jawahar-nehru-port-authority-jnpa",
  "jsw-jnpt-liquid-terminal": "jawahar-nehru-port-authority-jnpa",
  "nhava-sheva-freeport-terminal": "jawahar-nehru-port-authority-jnpa",
  "nhava-sheva-gateway-terminal": "jawahar-nehru-port-authority-jnpa",
  "nhava-sheva-international-container-terminal": "jawahar-nehru-port-authority-jnpa",
  "mumbai-container-terminal": "jawahar-nehru-port-authority-jnpa",
  "bpcl-liquid-cargo-jetty": "jawahar-nehru-port-authority-jnpa",
  ictpl: "mumbai", "mumbai-cruise-terminal": "mumbai",
};
const mumbaiBerths = ["Indira Dock", "Ballard Pier", "Princes Dock", "Victoria Dock"];
const berthPorts: Record<string, string> = Object.fromEntries(mumbaiBerths.map(name => [identityKey(name), "mumbai"]));
function finolexJetty(name: string): string | undefined {
  const key = identityKey(name);
  if (["EDC jetty", "chemical jetty", "chemical EDC jetty", "Finolex EDC jetty", "Finolex chemical jetty", "Finolex chemical EDC jetty", "Ranpar/Finolex chemical EDC jetty"].some(label => identityKey(label) === key)) return "EDC jetty";
  if (["coal jetty", "Finolex coal jetty", "Ranpar/Finolex coal jetty"].some(label => identityKey(label) === key)) return "coal jetty";
}
function combinedMumbaiBerth(name: string): string | undefined {
  const normalized = identityKey(name);
  for (const berth of mumbaiBerths) for (const parent of PORT_ALIASES.mumbai) {
    if ([`${identityKey(parent)} ${identityKey(berth)}`, `${identityKey(berth)} ${identityKey(parent)}`].includes(normalized)) return berth;
  }
}
type FacilityInput = TariffInput & { facilityId?: string };
type FacilityIdentity = { port?: string; terminal?: string; operator?: string; question?: string };
function catalogIdentity(name: string | undefined, allowDescription = false): { id?: string; question?: string } {
  if (!name?.trim()) return {};
  const combinedBerth = combinedMumbaiBerth(name);
  if (combinedBerth || mumbaiBerths.some(berth => identityKey(berth) === identityKey(name))) return { id: "mumbai" };
  if (finolexJetty(name)) return { id: "ranpar-finolex" };
  const exact = resolveTariffPort(name);
  if (exact) return { id: exact };
  if (!allowDescription) return {};
  const selection = resolvePortIdentity(name);
  if (!selection) return {};
  if (selection.status !== "identified" || selection.candidates.length !== 1) {
    return { question: `Ambiguous facility identity ${name}; choose the exact booked catalog facility. A model-selected catalog ID cannot override ambiguous raw wording.` };
  }
  return { id: selection.candidates[0] };
}
function facilityIdentity(input: FacilityInput): FacilityIdentity {
  const combinedBerth = combinedMumbaiBerth(input.port ?? "");
  const portIdentity = catalogIdentity(input.port, !!input.facilityId);
  if (portIdentity.question) return { question: portIdentity.question };
  const requested = input.facilityId;
  if (requested && !SUPPORTED_PORTS.includes(requested)) return { question: `Unknown canonical facility ID ${requested}; choose an ID from the catalog or leave it empty.` };
  if (requested && !portIdentity.id && input.port) return { question: `The booked port identity ${input.port} cannot be validated against canonical facility ID ${requested}. Preserve the raw wording and ask for the exact booked catalog facility; no tariff has been selected.` };
  if (requested && portIdentity.id && portIdentity.id !== requested && parentPorts[requested] !== portIdentity.id) {
    return { question: `Facility identity conflict: canonical facility ID ${requested} does not match port ${input.port}. Confirm the booked port/terminal/operator; no tariff has been selected.` };
  }
  const port = requested ?? portIdentity.id ?? (combinedBerth ? "mumbai" : resolveTariffPort(input.port ?? ""));
  if (!port) return {};
  const explicitBerth = combinedBerth ?? combinedMumbaiBerth(input.terminal ?? "") ?? mumbaiBerths.find(berth => identityKey(berth) === identityKey(input.terminal ?? ""));
  const bookedFinolexJetty = port === "ranpar-finolex" ? finolexJetty(input.port ?? "") : undefined;
  let selected = port;
  for (const field of ["terminal", "operator"] as const) {
    const name = input[field]; if (!name?.trim()) continue;
    if (selected === "ranpar-finolex" && field === "terminal" && finolexJetty(name)) {
      if (bookedFinolexJetty && bookedFinolexJetty !== finolexJetty(name)) return { question: `Facility identity conflict: port ${input.port}, terminal ${name}. Confirm the booked chemical/EDC or coal jetty.` };
      continue;
    }
    const berth = combinedMumbaiBerth(name) ?? mumbaiBerths.find(berth => identityKey(berth) === identityKey(name));
    if (field === "terminal" && berth && selected === "mumbai") {
      if (combinedBerth && combinedBerth !== berth) return { question: `Facility identity conflict: port ${input.port}, terminal ${name}. Which booked berth is correct?` };
      continue;
    }
    const fieldIdentity = catalogIdentity(name, !!requested);
    if (fieldIdentity.question) return { question: fieldIdentity.question };
    const id = fieldIdentity.id;
    if (id) {
      if (explicitBerth && id !== "mumbai") return { question: `Facility identity conflict: the supplied ${explicitBerth} berth has no established compatibility with ${field} ${name}. Confirm the booked berth and terminal/operator; no tariff has been selected.` };
      if (requested && id !== requested && parentPorts[requested] !== id) return { question: `Facility identity conflict: canonical facility ID ${requested} does not match ${field} ${name}. Confirm the booked port/terminal/operator; no tariff has been selected.` };
      if (id === selected || parentPorts[selected] === id) continue;
      if (parentPorts[id] === selected) { selected = id; continue; }
      return { question: `Facility identity conflict: port ${input.port}, ${field} ${name}. Which booked port/terminal/operator is correct?` };
    }
    if (field === "terminal" && berthPorts[identityKey(name)] === selected) continue;
    // Generic operator labels can corroborate an already selected facility;
    // they cannot select a facility on their own.
    if (field === "operator" && identityKey(name) === "jsw" && ["jaigarh", "jsw-jnpt-liquid-terminal"].includes(selected)) continue;
    return { question: `The ${field} ${name} cannot be validated against ${[input.port, field === "operator" ? input.terminal : undefined].filter(Boolean).join(" / ")}; confirm the conflicting or unverified booked identities. No tariff has been selected.` };
  }
  if (requested && selected !== requested) return { question: `Canonical facility ID ${requested} is not the most specific facility established by the supplied identities. Confirm the exact booked catalog facility; no tariff has been selected.` };
  if (requested && ![input.port, input.terminal, input.operator].some(value => catalogIdentity(value, true).id === requested)) return { question: `Canonical facility ID ${requested} is not grounded in the supplied booked identity fields. Preserve the raw wording and confirm the exact catalog facility; no tariff has been selected.` };
  const jswJaigarh = selected === "jaigarh" && [input.port, input.terminal, input.operator].some(value => value && identityKey(value).startsWith("jsw jaigarh"));
  return { port: selected, terminal: bookedFinolexJetty ?? (selected === "ranpar-finolex" ? finolexJetty(input.terminal ?? "") : undefined) ?? combinedBerth ?? combinedMumbaiBerth(input.terminal ?? "") ?? input.terminal, operator: jswJaigarh ? "JSW Jaigarh Port Limited" : input.operator };
}

export function validateFacilityIdentity(input: Pick<FacilityInput, "facilityId" | "port" | "terminal" | "operator">): string | undefined {
  return facilityIdentity({ ...input, charges: [] }).question;
}

function invalidQuantities(input: TariffInput): string[] {
  const invalid: string[] = [];
  const validate = (value: string | undefined, name: string, positive = true, integer = false, maximum = "1000000000000") => {
    if (value === undefined) return;
    if (typeof value !== "string" || value.length > 48 || !/^\d+(?:\.\d+)?$/.test(value)) { invalid.push(`${name}: provide an unsigned decimal quantity.`); return; }
    const number = new Decimal(value);
    if (!number.isFinite() || positive && number.lte(0) || number.gt(maximum) || integer && !number.isInteger()) invalid.push(`${name}: provide a valid ${positive ? "positive" : "nonnegative"}${integer ? " integer" : ""} quantity within the supported range.`);
  };
  validate(input.gt, "GT/GRT", true, false, "10000000");
  validate(input.durationHours, "Berth duration in hours"); validate(input.durationMinutes, "Berth duration in minutes");
  validate(input.callDays, "Call duration in days"); validate(input.movements, "Movement count", false, true);
  validate(input.ladenContainers, "Laden container count", false, true); validate(input.emptyContainers, "Empty container count", false, true);
  return invalid;
}


export function normalizeService(raw: string): string[] {
  const name = raw.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (["pilotage and towage", "pilotage cum towage"].includes(name)) return ["pilotage", "towage"];
  if (["age pilotage", "age related pilotage", "vessel age pilotage", "vessel age additional pilotage", "age related additional pilotage", "additional pilotage as per vessel age", "additional pilotage as per vessel age in years", "additional pilotage charges as per vessel age", "additional pilotage by vessel age"].includes(name)) return ["age-pilotage"];
  const ancillary = ancillaryServiceSchema.options.find(service => service.replace(/-/g, " ") === name);
  if (ancillary) return [ancillary];
  if (["wharfage", "cargo wharfage"].includes(name)) return ["cargo"];
  const names: Record<string, string> = { "berth hire": "berth", "berthing": "berth", "goods and services tax": "gst", "final bill rounding": "rounding", "bill rounding": "rounding", "port dues": "port-dues", "container handling": "handling", "cargo handling": "handling", "pilot attendance": "pilot-attendance", "passenger fee": "passenger-fee", "mandatory user charges": "muc", "mandatory user charge": "muc", "environmental charges": "environment" };
  return [names[name] ?? name];
}

function ruleResult(result: TariffResult): TariffResult {
  return { ...result, limitations: [...result.limitations ?? [], ...result.questions], questions: [] };
}

/** Direct business lookup. It never constructs or reads a generic conversation fact table. */
export async function lookupTariff(input: FacilityInput, mode: "quote" | "rule" = "quote"): Promise<TariffResult> {
  if (!input.port?.trim()) return unresolved(["Which port or terminal is this call for?"]);
  if (!Array.isArray(input.charges) || !input.charges.length || input.charges.length > 20 || input.charges.some(charge => typeof charge !== "string" || !charge.trim() || charge.length > 80)) return unresolved(["Which service or charges should be calculated or explained?"]);
  const identity = facilityIdentity(input);
  if (identity.question) return unresolved([identity.question]);
  const port = identity.port;
  if (!port) {
    const ambiguous = Object.entries(AMBIGUOUS_PORT_NAMES).find(([name]) => identityKey(name) === identityKey(input.port!));
    if (ambiguous) return unresolved(["Which exact booked port or terminal is intended?"], `Ambiguous facility label ${input.port}: ${ambiguous[1].map(id => PORT_ALIASES[id][0]).join(" or ")}. The label alone does not establish one booked facility. No other port or terminal has been substituted.`);
    return unresolved([], `No exact supported tariff identity established for ${input.port}. No other port or terminal has been substituted. Please identify the booked port/operator/terminal; a matching authoritative source may still be unavailable.`);
  }
  input = { ...input, port, terminal: identity.terminal, operator: identity.operator, charges: [...new Set(input.charges.flatMap(normalizeService))] };
  if (mode === "quote") { const invalid = invalidQuantities(input); if (invalid.length) return unresolved(invalid); }
  try {
    const published = await publishedComponents(input, mode);
    const evidence = await publicEvidenceComponents(input, mode);
    const handled = [...published?.handled ?? [], ...evidence?.handled ?? []];
    const remaining = input.charges.filter(charge => !handled.includes(charge));
    const invoice = published || evidence ? remaining.filter(charge => ["gst", "rounding"].includes(charge)) : [];
    if (invoice.length) remaining.splice(0, remaining.length, ...remaining.filter(charge => !invoice.includes(charge)));
    const legacyInput = { ...input, charges: remaining };
    const legacy = remaining.length ? await reviewedComponents(legacyInput, mode)
      ?? (port === "mumbai" && remaining.every(charge => ["berth", "gst", "rounding"].includes(charge)) ? await coastalMumbai(legacyInput, mode) : sourceGap(legacyInput)) : undefined;
    const invoiceLimit = `Requested ${invoice.join(" and ")} requires the combined service/tax base. Tax or final rounding on only one component would omit other requested charges; no combined tax-inclusive invoice total has been established.`;
    const result = combineTariffResults([...(published ? [published.result] : []), ...(evidence ? [evidence.result] : []), ...(legacy ? [legacy] : []), ...(invoice.length ? [{ ...unresolved([], invoiceLimit), limitations: [invoiceLimit] }] : [])]);
    return { ...(mode === "rule" ? ruleResult(result) : result), facility: port };
  } catch (error) {
    return { status: "error", sourceClass: "official-tariff", body: "The retained tariff source or calculation could not be validated. No complete estimate is available; retry after the source integrity issue is resolved.", questions: [],
      applicability: { status: "unverified", currentTariffVerified: false, message: error instanceof Error ? error.message : "Source/rule validation failed." } };
  }
}
