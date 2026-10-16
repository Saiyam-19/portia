import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import rules from "../../../data/reviewed-tariffs/jnpa-2026/rules.json";
import explanationSources from "../../../data/reviewed-tariffs/bounded-explanations-2026/sources.json";
import extensions from "../../../data/reviewed-tariffs/component-extensions-2026/rules.json";
import mumbaiSources from "../../../data/ports/mumbai/approved-2026-05-09/rules.json";
import { calculateElapsedTime } from "./elapsed-time";
import { calculateChargeBatch } from "./calculator-batch";
import { currentConversationFact as fact, unresolvedConversationField, type ConversationState, type ConversationTask } from "./conversation";
import type { AnswerItem } from "./conversation-rules";
const eligiblePorts = ["gateway-terminals-india-pvt-ltd", "jsw-jnpt-liquid-terminal", "jawahar-nehru-port-authority-jnpa"];

async function verifiedSources() {
  for (const source of rules.sources) {
    const data = await readFile(path.join(process.cwd(), "data/reviewed-tariffs/jnpa-2026", source.file));
    if (createHash("sha256").update(data).digest("hex") !== source.sha256) throw new Error("Reviewed component source hash changed.");
  }
}
function callDate(state: ConversationState, task: ConversationTask) {
  const get = (field: "callDate" | "berthStart" | "timeZone" | "dateOrder") => fact(state, task.scopeId, field)?.value;
  const raw = get("callDate") ?? get("berthStart"); if (!raw) return;
  const stamp = /\d{1,2}:\d{2}/.test(raw) ? raw : `${raw} 00:00 UTC`;
  const parsed = calculateElapsedTime({ start: stamp, end: stamp, timeZone: get("timeZone"), dateOrder: get("dateOrder") as "DMY" | "MDY" | undefined });
  return parsed.status === "ok" ? parsed.startUtc.slice(0, 10) : undefined;
}
const format = (value: string) => `USD ${new Decimal(value).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

/** Published component arithmetic only; invoice additions are never implied. */
async function extendedComponents(state: ConversationState, task: ConversationTask, port: string): Promise<AnswerItem | undefined> {
  if (!["quote","rule"].includes(task.kind) || task.source !== "official") return;
  const get = (field: Parameters<typeof fact>[2]) => fact(state, task.scopeId, field)?.value;
  const nsft = port === "nhava-sheva-freeport-terminal", nsigt = port === "nhava-sheva-gateway-terminal", nsict = port === "nhava-sheva-international-container-terminal";
  const mumbai = port === "mumbai", jaigarh = port === "jaigarh";
  if (!(nsft || nsigt || nsict || mumbai || jaigarh) || mumbai && get("service") === "coastal") return;
  const wanted = [...new Set(task.charges)], pending: string[] = [];
  const handles=(nsft||nsigt||nsict)&&wanted.some(c=>["handling","container-handling","cargo-handling","cargo"].includes(c))||(mumbai||nsigt)&&wanted.includes("berth")||jaigarh&&wanted.includes("port-dues");
  if(!handles)return;
  const base = { taskId: task.id, scopeId: task.scopeId, kind: task.kind, sourceClass: "official-tariff" as const,
    dependencies: state.facts.filter(f => f.scopeId === task.scopeId && f.status === "established").map(f => f.id) };
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
  if(task.kind==="rule"){
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
    for(const c of wanted)if(!supported.has(c))pending.push(`${c}: outside the reviewed component explanation`);
    return{...base,status:"explained",body:statements.join("\n\n")+`\n\nSources: ${files.map(f=>`[${f.file}](${f.url})`).join("; ")}. ${source.reference}. Effective ${source.effectiveFrom}; verified ${extensions.verifiedOn}. These are conditional component rules, not a complete bill or a current-call eligibility decision.`,pending};
  }
  const parseDate = (raw: string) => {
    const stamp = /\d{1,2}:\d{2}/.test(raw) ? raw : `${raw} 00:00 IST`;
    const parsed = calculateElapsedTime({ start: stamp, end: stamp, timeZone: get("timeZone"), dateOrder: get("dateOrder") as "DMY" | "MDY" | undefined });
    if (parsed.status !== "ok") return;
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(parsed.startUtc));
    return ["year", "month", "day"].map(type => parts.find(p => p.type === type)!.value).join("-");
  };
  const dateRaw = (mumbai || nsigt && wanted.includes("berth")) ? get("berthStart") ?? get("callDate") : get("callDate") ?? get("berthStart");
  const date = dateRaw ? parseDate(dateRaw) : undefined;
  if (!date) pending.push("call date, with unambiguous date order/time zone when a timestamp is supplied");
  else if (date < source.effectiveFrom || through && date > through) pending.push("a reviewed source version covering the requested call date");
  if (get("berthEnd") && (mumbai || nsigt && wanted.includes("berth"))) {
    const end = parseDate(get("berthEnd")!);
    if (!end || end < source.effectiveFrom || through && end > through) pending.push("a reviewed source version covering the complete berth interval");
  }
  if (pending.length) return { ...base, status: "unresolved", body: "", pending };
  const number = (field: Parameters<typeof fact>[2], positive = false, integer = false) => {
    const raw = get(field);
    if (raw === undefined || !/^\d+(?:\.\d+)?$/.test(raw) || !new Decimal(raw).isFinite() || positive && new Decimal(raw).lte(0) || integer && !new Decimal(raw).isInteger()) {
      pending.push(`${field}: an explicit valid ${positive ? "positive" : "nonnegative"}${integer ? " integer" : ""} quantity is required`); return;
    }
    return raw;
  };
  const hours = () => {
    let duration = get("durationHours");
    if (get("durationMinutes") !== undefined) {
      const minutes = number("durationMinutes", true); if (!minutes) return;
      const converted = new Decimal(minutes).div(60).toString();
      if (duration !== undefined && !new Decimal(duration).eq(converted)) { pending.push("durationHours and durationMinutes disagree"); return; }
      duration ??= converted;
    }
    if (get("berthStart") && get("berthEnd")) {
      const elapsed = calculateElapsedTime({ start: get("berthStart")!, end: get("berthEnd")!, timeZone: get("timeZone"), dateOrder: get("dateOrder") as "DMY" | "MDY" | undefined });
      if (elapsed.status !== "ok") { pending.push(elapsed.message); return; }
      if (duration !== undefined && !new Decimal(duration).eq(elapsed.elapsedHours)) { pending.push("duration and berth timestamps disagree"); return; }
      duration ??= elapsed.elapsedHours;
    }
    if (duration === undefined || !/^\d+(?:\.\d+)?$/.test(duration) || new Decimal(duration).lte(0)) { pending.push("positive ordinary berth occupancy duration or ordered berth timestamps"); return; }
    return duration;
  };
  const add = (charge: string, expression: string, formula: string) => {
    const id = `component_${rows.length}`;
    expressions.push({ id, expression }); rows.push({ id, charge, currency: source.currency, formula, section: source.reference });
  };
  const handlingNames = ["handling", "container-handling", "cargo-handling", "cargo"];
  if ((nsft || nsigt || nsict) && wanted.some(charge => handlingNames.includes(charge))) {
    const before = pending.length;
    if (get("service") !== "foreign") pending.push("handling: explicit foreign-going service is required for this reviewed component");
    if (get("cargoTraffic") !== "exim") pending.push("handling: normal EXIM cargo traffic must be established; coastal/transshipment not covered");
    if (get("containerSize") !== "20") pending.push("handling: explicit 20-foot container size is required");
    if (get("specialCargo") !== "false") pending.push("handling: normal containers without hazardous, ODC, reefer ancillary or other special handling must be explicit");
    const laden = number("ladenContainers", false, true), empty = number("emptyContainers", false, true), mode = get("handlingMode");
    let ladenRate: string | undefined, emptyRate: string | undefined, label = "";
    if (nsft) {
      if (mode !== "road" && mode !== "rail") pending.push("handling: NSFT road or rail bundle must be selected explicitly");
      else { [ladenRate, emptyRate] = extensions.containers["nhava-sheva-freeport-terminal"][mode]; label = `NSFT ${mode} bundle including its corresponding landside leg`; }
    } else if (nsigt) {
      const r = extensions.containers["nhava-sheva-gateway-terminal"];
      if (!["road", "rail", "ship-yard"].includes(mode ?? "")) pending.push("handling: explicit ship-yard-only, road or ICD-rail service scope is required");
      else {
        if (mode === "rail" && get("icdRail") !== "true") pending.push("handling: NSIGT rail requires explicit ICD rail applicability");
        const addition = mode === "road" ? r.roadAdd : mode === "rail" ? r.railAdd : "0";
        ladenRate = new Decimal(r.shipYard[0]).plus(addition).toString(); emptyRate = new Decimal(r.shipYard[1]).plus(addition).toString();
        label = `NSIGT ship-yard${mode === "ship-yard" ? " only" : mode === "road" ? " plus yard-truck direct-delivery/export-intake leg" : " plus ICD yard-rail leg"} (ceiling component)`;
      }
    } else {
      if (mode !== "ship-yard") pending.push("handling: this NSICT approval is ship-yard/yard-ship only; no landside leg");
      if (get("portCrane") !== "true") pending.push("handling: NSICT section1(A) requires explicit use of port crane");
      [ladenRate, emptyRate] = extensions.containers["nhava-sheva-international-container-terminal"].shipYard;
      label = "NSICT ship-yard/yard-ship using port crane";
    }
    if (pending.length === before && laden !== undefined && empty !== undefined && ladenRate && emptyRate) add("handling", `${laden}*${ladenRate}+${empty}*${emptyRate}`, `${label}: ${laden} laden × ${source.currency} ${ladenRate} + ${empty} empty × ${source.currency} ${emptyRate}; per 20-foot container`);
  }
  if ((mumbai || nsigt) && wanted.includes("berth")) {
    const before = pending.length;
    if (get("service") !== "foreign") pending.push("berth: coastal or foreign service must be established; this is the foreign-going component");
    if (mumbai && get("vesselCategory") !== "general-cargo") pending.push("berth: this reviewed Mumbai branch requires an ordinary general-cargo vessel");
    const gt = number("gt", true), duration = hours();
    let rate: string | undefined;
    if (mumbai) {
      const terminal = get("terminal");
      const match = Object.entries(extensions.mumbaiForeign.rates).find(([name]) => name.toLowerCase() === terminal?.trim().toLowerCase());
      if (!match) pending.push("berth: confirm Indira Dock, Ballard Pier, Princes Dock or Victoria Dock; no berth branch selected");
      rate = match?.[1];
    } else rate = extensions.containers["nhava-sheva-gateway-terminal"].berthRate;
    if (pending.length === before && gt && duration && rate) {
      const assessed = mumbai ? `max(${gt},${extensions.mumbaiForeign.minimumGt})` : gt;
      add("berth", `${assessed}*${rate}*ceil(${duration})`, `${mumbai ? get("terminal") : "NSIGT operator berth (ceiling component)"}: ${assessed} GT × ${source.currency} ${rate}/GRT/started hour × ceil(${duration}) hours`);
      knownBerthModifiers = (["priority", "idleTime", "penalty", "otherAdjustments", "shifting", "falseReadiness", "ousting", "rebate"] as const).filter(field => get(field) === "true");
      if (knownBerthModifiers.length) pending.push(`berth: stated ${knownBerthModifiers.join(", ")} requires its applicable adjustment; only the unadjusted base is calculated, not a complete adjusted berth charge`);
    }
  }
  if (jaigarh && wanted.includes("port-dues")) {
    const before = pending.length;
    if (!/^JSW(?:\s+Jaig(?:arh|ad)(?:\s+Port(?:\s+Limited)?)?)?$/i.test(get("operator")?.trim() ?? "")) pending.push("port-dues: explicit JSW Jaigarh operator identity is required; generic Jaigarh does not select an operator");
    if (get("cargoCategory") !== "mechanized-bulk") pending.push("port-dues: explicit mechanized-bulk category is required");
    const gt = number("gt", true), days = number("callDays", true);
    if (days && new Decimal(days).gt(extensions.jaigarh.maximumValidityDays)) pending.push("port-dues: single-call duration exceeds maximum 30-day dues validity; renewal charging is not approved");
    if (pending.length === before && gt && days) add("port-dues", `max(${gt}*${extensions.jaigarh.rate},${extensions.jaigarh.minimum})`, `JSW Jaigarh J-1 single-call mechanized-bulk dues: max(${gt} GRT × USD ${extensions.jaigarh.rate}, USD ${extensions.jaigarh.minimum} monetary minimum); ${days}-day call within maximum 30-day dues validity`);
  }
  for (const charge of wanted) if (!rows.some(row => row.charge === charge || row.charge === "handling" && handlingNames.includes(charge)) && !pending.some(item => item.startsWith(`${charge}:`))) pending.push(`${charge}: requested component is unresolved or outside these reviewed rules; no amount assigned`);
  if (!rows.length) return { ...base, status: "unresolved", body: "", pending: [...new Set(pending)] };
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
  return { ...base, status: "calculated", body, pending: [...new Set(pending)], totals: [{ currency: source.currency, amount: values.get("subtotal")!, chargeIds, basis: "component" }], calculation: { sourceHashes: files.map(file => file.sha256), calculations, rows, currencies: [source.currency], dispositions: wanted.map(charge => ({ charge, status: rows.some(row => row.charge === charge || row.charge === "handling" && handlingNames.includes(charge)) ? "calculated" : "unresolved" })) } };
}

/** These packets approve explanations, not executable call/invoice rules. */
async function reviewedExplanation(state: ConversationState, task: ConversationTask, port: string): Promise<AnswerItem | undefined> {
  if (task.kind !== "rule" || task.source !== "official") return;
  let supported: string[], sourceIds: string[], review: string, body: string, pending: string[];
  let from: string | undefined, through: string | undefined;
  switch (port) {
    case "bpcl-liquid-cargo-jetty":
      supported = ["berth"]; sourceIds = ["JNPA26", "BPCL21", "BPCL26"]; review = "bpcl-ictpl";
      from = "2026-05-01"; through = "2027-04-30";
      body = "**BPCL Liquid Cargo Jetty — bounded hourly-rule explanation**\n\nThe located JNPA ordinary merchant-vessel berth clause uses GRT per hour or part thereof: a partial billable hour is a started hour, not a started day. Its published period is 1 May 2026–30 April 2027. Readiness, eligible idling, priority and penal provisions can change chargeable time. No general daily minimum appears in this ordinary table; that is not proof that every minimum is absent.\n\nHistorical BPCL 2021 clauses refer to berth hire payable to JNPT. The BPCL 2026 document covers CRC/other services and does not establish continuation of every historical berth condition. This explanation does not identify the separate BPCL Cargo Jetty catalog entry.";
      pending = ["The applicable minimum clause, category, version and basis (per call/day/block/tonnage), including its interaction with time, remain unresolved.", "Current BPCL contractual continuation beyond the bounded ordinary-rule source trail remains unresolved."];
      break;
    case "ictpl":
      supported = ["berth"]; sourceIds = ["ICTPL18", "ICTPL20"]; review = "bpcl-ictpl";
      body = "**ICTPL — Historical rule explanation only**\n\nThe 2018 approved SOR defines a calendar day as midnight-to-midnight, but its ordinary berth table explicitly charges per GRT per hour or part thereof at 1.3 times the applicable MBPT berth basis. The minimum assessed GRT is 1,000 except for offshore supply vessels. The calendar-day definition does not replace that hourly unit; the berth multiplier is not an all-charge multiplier.\n\nThe 2020 extension reaches 31 March 2021 or the stated earlier triggers. Neither document establishes current ICTPL prices or resolves an unidentified 2021 charge sheet. Consecutive started 24-hour blocks and calendar dates are different bases; the actual charge clause must select the basis.";
      pending = ["The actual charge line, day definition and source version are needed to interpret a particular sheet; an operative current instrument is needed for current applicability."];
      break;
    case "konkan-lng-ltd":
      supported = ["berth", "pilotage"]; sourceIds = ["KLL25", "KLL26"]; review = "jsw-kll"; from = "2025-10-01";
      body = "**Konkan LNG — dated notice explanation for LNG vessels**\n\nThe notice effective 1 October 2025 covers up to 36 hours from first line ashore to cast off. Its additional berth-hire trigger is excess time attributable to the vessel, at USD 0.0041/GRT/hour. Terminal-only excess does not satisfy that particular trigger; this is not a base-fee waiver or refund. Mixed-delay attribution remains unresolved.\n\nThe revision signed 5 October 2026 becomes effective 1 November 2026, not for October calls. It combines berth hire and pilotage at USD 0.359/GRT, with no cap; do not charge that rate separately for each component. Its FX basis is SBI TT selling rate on the scheduled berthing day, using the preceding bank working day if that day is a bank holiday. The new notice does not reconcile the old 36-hour/delay footnote. No expiry of the entire old notice or automatic continuation of that footnote is inferred.";
      pending = ["Post-1 November continuation of the 36-hour/delay footnote, mixed-delay allocation, rounding/tax interactions and any formal base-fee relief or claim procedure remain unresolved."];
      break;
    case "mumbai-cruise-terminal":
      supported = ["berth", "head-tax", "passenger", "rebate"]; sourceIds = ["CRUISE26", "MBPA26"]; review = "terminals-cruise";
      from = "2026-04-01"; through = "2027-03-31";
      body = "**Mumbai Port cruise structure — bounded public-rule explanation**\n\nThe 27 May 2026 circular extends the concessional structure from 1 April 2026 through 31 March 2027. The first 12-hour regime has a fixed ship element of USD 0.085/GRT plus USD 6/passenger head tax. Beyond 12 hours, the ship-time element is USD 0.0175/GRT/hour. These are different charging bases, not a vessel total or a repeated-head-tax rule.\n\nPublished annual-call rebate bands: up to 10 calls, none; 11–35, 10%; 36–70, 15%; above 70, 20%. The general SOR separately lists INR 346 per embarking cruise passenger, INR 303 per disembarking passenger and INR 115 per bona fide visitor. Its general cruise provision is 60% of relevant ordinary charges, not a 60% discount. Do not automatically stack these charges or reductions with the special circular.";
      pending = ["Rebate base/counting entity/year, retrospective or prospective application, ancillary/head-tax interaction and discount stacking remain unresolved.", "Private-terminal additions and a complete invoice's currency/tax/rounding treatment require their applicable authority and transaction facts."];
      break;
    default: return;
  }
  if (!task.charges.some(charge => supported.includes(charge))) return;
  for (const charge of task.charges.filter(charge => !supported.includes(charge))) pending.push(`${charge}: the requested explanation is outside this reviewed packet's scope.`);
  const sources = explanationSources.sources.filter(source => sourceIds.includes(source.id));
  const approval = explanationSources.reviews.find(source => source.file === `${review}-second-review.json`)!;
  for (const source of [...sources, approval]) {
    const bytes = await readFile(path.join(process.cwd(), "data/reviewed-tariffs/bounded-explanations-2026", source.file));
    if (createHash("sha256").update(bytes).digest("hex") !== source.sha256) throw new Error("Reviewed explanation source hash changed.");
  }
  const explicitDate = fact(state, task.scopeId, "callDate") ?? fact(state, task.scopeId, "berthStart");
  if (explicitDate) {
    const date = callDate(state, task);
    if (!date) pending.push("The supplied call date could not be resolved; these dated clauses are explanatory only.");
    else if ((from && date < from) || (through && date > through)) pending.push("The requested call date is outside this packet's stated period; a matching authoritative version is needed before applying it.");
  }
  if (fact(state, task.scopeId, "terminal")) pending.push("This port-level explanation does not establish the supplied berth's specific applicability.");
  const dependencies = state.facts.filter(f => f.scopeId === task.scopeId && f.status === "established" && ["port", "terminal", "callDate", "berthStart", "timeZone", "dateOrder"].includes(f.field)).map(f => f.id);
  return { taskId: task.id, scopeId: task.scopeId, kind: task.kind, sourceClass: "official-tariff", status: "explained", dependencies, pending,
    body: body + `\n\nSources: ${sources.map(source => `[${source.reference}](${source.url})`).join("; ")}. Reviewed ${explanationSources.verifiedOn}; later amendments not verified. Explanation only, not current-call applicability or a complete monetary quote.` };
}

/** Reusable ordinary component operations. Partial source approval never turns
 * into a complete bill, and unavailable charges remain explicit obligations. */
export async function reviewedComponents(state: ConversationState, task: ConversationTask): Promise<AnswerItem | undefined> {
  const get = (field: Parameters<typeof fact>[2]) => fact(state, task.scopeId, field)?.value;
  const port = get("port"); if (!port) return;
  if(port==="ranpar-finolex"&&task.kind==="rule"&&task.charges.every(c=>["other","identity","capacity"].includes(c))){
    const s=extensions.finolexIdentity;const bytes=await readFile(path.join(process.cwd(),"data/reviewed-tariffs/component-extensions-2026",s.file));if(createHash("sha256").update(bytes).digest("hex")!==s.sha256)throw new Error("Reviewed identity source hash changed.");
    return{taskId:task.id,scopeId:task.scopeId,kind:task.kind,status:"explained",sourceClass:"official-tariff",dependencies:[fact(state,task.scopeId,"port")!.id],pending:[],body:`Finolex Terminal is associated with Ranpar/Pawas, Ratnagiri. Distinguish the booked chemical/EDC jetty from the coal facility. Capacity figures in the retained terminal-information sheet are displacement tonnes, not GT/GRT; they cannot be substituted for tariff gross tonnage. This facility sheet has no established dated berth-hire schedule and is not vessel-specific berth acceptance. [Operator terminal-information sheet, p1](${s.url}).`};
  }
  const explanation = await reviewedExplanation(state, task, port);
  if (explanation) return explanation;
  const extended = await extendedComponents(state, task, port);
  if (extended) return extended;
  if (!eligiblePorts.includes(port)) return;
  await verifiedSources();
  const base = { taskId: task.id, scopeId: task.scopeId, kind: task.kind, sourceClass: "official-tariff" as const,
    dependencies: state.facts.filter(f => f.scopeId === task.scopeId && f.status === "established").map(f => f.id) };
  const pending: string[] = [];
  const sources = `[JNPA SOR, effective ${rules.effectiveFrom}–${rules.effectiveThrough}](${rules.sources[0].url})` + (port === "gateway-terminals-india-pvt-ltd" ? `; [GTI general note 5, p11](${rules.sources[1].url})` : port === "jsw-jnpt-liquid-terminal" ? `; [JSW JNPT general conditions, pp1–4](${rules.sources[2].url})` : "");
  if (task.kind === "rule") {
    const statements: string[] = [];
    for (const charge of task.charges) {
      if (charge === "berth") statements.push(`Ordinary foreign-going berth hire is USD ${rules.berth.rate}/GRT per hour or part. It is hourly billing; a commenced hour is rounded up, not a whole day. Readiness cessation, port-attributable idling, priority and penalty clauses can change the charge. ${rules.berth.section}.`);
      else if (charge === "pilotage" || charge === "towage") statements.push(`Ordinary foreign-going pilotage-cum-towage up to ${rules.pilotage.maximumGt} GRT uses USD ${rules.pilotage.rate}/GRT, minimum USD ${rules.pilotage.minimumVisit}/visit. Inward and outward are each 50% at that leg's status; routine pilot/tug assistance is included. Separate hired-craft services require their own rule. ${rules.pilotage.section}.`);
      else pending.push(`The requested ${charge} explanation requires its applicable reviewed rule.`);
    }
    return { ...base, status: statements.length ? "explained" : "unresolved", body: statements.length ? statements.join("\n\n") + `\n\nSources: ${sources}. Verified ${rules.verifiedOn}; later amendments not verified.` : "", pending };
  }
  const date = callDate(state, task);
  if (!date) pending.push("call date (and the timestamp zone/date order if needed)");
  else if (date < rules.effectiveFrom || date > rules.effectiveThrough) pending.push("a reviewed source version covering the requested call date");
  if (!get("gt")) pending.push("gross tonnage (GT/GRT)");
  if (!get("service")) pending.push("coastal or foreign-going service");
  else if (get("service") !== "foreign") pending.push("a reviewed coastal-service rule for these components");
  if (pending.length) return { ...base, status: "unresolved", body: "", pending };
  const gt = get("gt")!; const rows: Array<{ id: string; charge: string; formula: string; section: string }> = [];
  const expressions: Array<{ id: string; expression: string }> = [];
  const wanted = [...new Set(task.charges)];
  for (const [index, charge] of wanted.entries()) {
    const id = `component_${index}`;
    if (charge === "berth" && port !== "jawahar-nehru-port-authority-jnpa") {
      let hours = get("durationHours");
      if (get("berthStart") && get("berthEnd")) {
        const time = calculateElapsedTime({ start: get("berthStart")!, end: get("berthEnd")!, timeZone: get("timeZone"), dateOrder: get("dateOrder") as "DMY" | "MDY" | undefined });
        if (time.status !== "ok") { pending.push(time.message); continue; }
        if (hours && !new Decimal(hours).eq(time.elapsedHours)) { pending.push("duration and timestamps disagree"); continue; }
        hours ??= time.elapsedHours;
      }
      if (!hours) { pending.push("berth occupancy duration or berth start/end times"); continue; }
      expressions.push({ id, expression: `${gt}*${rules.berth.rate}*ceil(${hours})` });
      rows.push({ id, charge: "Ordinary berth base", formula: `${gt} GT × USD ${rules.berth.rate}/GT/hour × ceil(${hours}) hours`, section: rules.berth.section });
    } else if (charge === "pilotage" || charge === "towage") {
      if (charge === "towage" && wanted.includes("pilotage")) continue;
      if (new Decimal(gt).gt(rules.pilotage.maximumGt)) { pending.push("reviewed higher-tonnage pilotage slab"); continue; }
      const movements = get("movements");
      if (movements !== "2") { pending.push("whether the ordinary pilotage includes one inward and one outward movement, both foreign-going"); continue; }
      expressions.push({ id, expression: `max(${gt}*${rules.pilotage.rate},${rules.pilotage.minimumVisit})` });
      rows.push({ id, charge: "Ordinary pilotage-cum-towage (inward + outward)", formula: `max(${gt} GT × USD ${rules.pilotage.rate}/GT, USD ${rules.pilotage.minimumVisit})`, section: rules.pilotage.section });
    } else if (charge === "port-dues" && port === "jsw-jnpt-liquid-terminal" && get("vesselCategory") === "tanker" && ["loading", "discharging", "both"].includes(get("cargoOperation") ?? "")) {
      expressions.push({ id, expression: `${gt}*${rules.portDues.rate}` }); rows.push({ id, charge: "Ordinary JNPA port-dues base", formula: `${gt} GT × USD ${rules.portDues.rate}/GT`, section: rules.portDues.section });
    } else pending.push(`${charge}: governing applicability/source remains unresolved; no amount assigned`);
  }
  if (!rows.length) return { ...base, status: "unresolved", body: "", pending: [...new Set(pending)] };
  expressions.push({ id: "subtotal", expression: rows.map(r => `$${r.id}`).join("+") });
  const calculations = calculateChargeBatch(expressions); const amounts = new Map(calculations.map(c => [c.id, c.result]));
  const body = `**Conditional ordinary pre-tax components — not a complete bill**\n\n| Component | Amount |\n|---|---:|\n${rows.map(r => `| ${r.charge} | ${format(amounts.get(r.id)!)} |`).join("\n")}\n| Identified component subtotal | ${format(amounts.get("subtotal")!)} |\n\n${rows.map(r => `- **${r.charge}:** ${r.formula}.`).join("\n")}\n\nAssumes ordinary unadjusted occupancy/operations. This does not assert that no adjustment applies. Routine pilotage tugs are not charged twice.\n\nSources: ${sources}. ${rows.map(r => r.section).join("; ")}. Published validity ${rules.effectiveFrom}–${rules.effectiveThrough}; verified ${rules.verifiedOn}. Recheck subsequent amendments before actual invoicing.`;
  if(wanted.includes("berth")){
    const modifiers=(["priority","idleTime","penalty","otherAdjustments","shifting","falseReadiness","ousting","rebate"] as const).filter(f=>get(f)==="true"||unresolvedConversationField(state,task.scopeId,f));
    if(modifiers.length)pending.push(`berth: ${modifiers.join(", ")} needs its governing adjustment; only the unadjusted base is shown`);
  }
  const chargeIds=rows.flatMap(r=>r.charge.includes("berth")?["berth:ordinary-foreign:gt-hour"]:r.charge.includes("pilotage")?["pilotage-towage:ordinary-foreign:inward-outward"]:["port-dues:jnpa:ordinary-cargo"]);
  return { ...base, status: "calculated", body:body+"\n\nFor a complete invoice, separately establish: "+rules.pending.join("; ")+(port==="jsw-jnpt-liquid-terminal"?". "+rules.jswSourceGap:""),pending:[...new Set(pending)],totals:[{currency:"USD",amount:amounts.get("subtotal")!,chargeIds,basis:"component",lineAmounts:rows.map(r=>amounts.get(r.id)!)}],calculation:{sourceHashes:rules.sources.map(s=>s.sha256),calculations} };
}
