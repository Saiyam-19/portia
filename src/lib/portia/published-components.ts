import "server-only";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { TariffNumber } from "./tariff-number";
import packet from "../../../data/reviewed-tariffs/full-scope-2026/rules.json";
import { calculateElapsedTime } from "../migration/elapsed-time";
import type { TariffInput, TariffResult, TariffSource, TariffIssue } from "./tariff-types";
import { addRational, compareRational, multiplyRational, rational, type ExactRational } from "./fx-conversion";

const D = TariffNumber;
const JNPA = "jawahar-nehru-port-authority-jnpa", BMCT = "mumbai-container-terminal";
const NSIGT = "nhava-sheva-gateway-terminal", NSICT = "nhava-sheva-international-container-terminal";
const NSFT = "nhava-sheva-freeport-terminal", GTI = "gateway-terminals-india-pvt-ltd";
const family = new Set([JNPA, BMCT, NSIGT, NSICT, NSFT, GTI, "jsw-jnpt-liquid-terminal"]);
type Row = { id: string; label: string; currency: string; amount: string; formula: string };
type Mode = "quote" | "rule";

export function dateOf(raw: string | undefined, input: TariffInput): string | undefined {
  if (!raw) return;
  const stamp = /\d{1,2}:\d{2}/.test(raw) ? raw : `${raw} 00:00 IST`;
  const parsed = calculateElapsedTime({ start: stamp, end: stamp, timeZone: input.timeZone, dateOrder: input.dateOrder });
  if (parsed.status !== "ok") return;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(parsed.startUtc));
  return ["year", "month", "day"].map(type => parts.find(p => p.type === type)!.value).join("-");
}
const durationIssue = (code: string, message: string, field?: keyof TariffInput): TariffIssue =>
  ({ kind: "input", code, message, service: "berth", ...(field ? { field } : {}) });
function suppliedDurationMilliseconds(input: TariffInput): { milliseconds?: ExactRational; issue?: TariffIssue } {
  let milliseconds: ExactRational | undefined;
  for (const [field, scale] of [["durationHours", "3600000"], ["durationMinutes", "60000"]] as const) {
    const raw = input[field];
    if (raw === undefined) continue;
    if (typeof raw !== "string" || raw.length > 48 || !/^\d+(?:\.\d+)?$/.test(raw)
      || compareRational(rational(raw), rational("0")) <= 0 || compareRational(rational(raw), rational("1e12")) > 0) {
      return { issue: durationIssue("invalid-duration", `${field}: provide a positive decimal quantity within the supported range.`, field) };
    }
    const converted = multiplyRational(rational(raw), rational(scale));
    if (milliseconds && compareRational(milliseconds, converted) !== 0) {
      return { issue: durationIssue("duration-units-disagree", "The stated hours and minutes disagree; confirm total occupancy.") };
    }
    milliseconds = converted;
  }
  return { milliseconds };
}

/** One duration path for every tariff family. Original decimal quantities are
 * compared in exact rational milliseconds with parsed timestamp instants,
 * never with rounded decimal-hour output from the elapsed-time tool. */
export function occupancyDuration(input: TariffInput): { milliseconds: ExactRational; hours: TariffNumber } | { issue: TariffIssue } {
  const supplied = suppliedDurationMilliseconds(input);
  if (supplied.issue) return { issue: supplied.issue };
  let milliseconds = supplied.milliseconds;
  if (input.berthStart && input.berthEnd) {
    const time = calculateElapsedTime({ start: input.berthStart, end: input.berthEnd, timeZone: input.timeZone, dateOrder: input.dateOrder });
    if (time.status !== "ok") return { issue: durationIssue("invalid-occupancy-interval", time.message) };
    // Each parsed instant is a safe integer; subtract as bigint so even a
    // calendar-spanning interval cannot lose an integer millisecond.
    const elapsed = { numerator: BigInt(Date.parse(time.endUtc)) - BigInt(Date.parse(time.startUtc)), denominator: BigInt(1) };
    if (milliseconds && compareRational(milliseconds, elapsed) !== 0) {
      return { issue: durationIssue("duration-timestamps-disagree", "The occupancy duration and berth timestamps disagree.") };
    }
    milliseconds = elapsed;
  }
  if (!milliseconds || compareRational(milliseconds, rational("0")) <= 0) {
    return { issue: durationIssue("missing-positive-occupancy", "What is the positive berth occupancy duration, or full start/end timestamps?") };
  }
  return { milliseconds, hours: new D(milliseconds).div(3600000) };
}

/** A dated rule must cover occupancy, not just the supplied call day. Date-only
 * starts represent an entire day; never invent midnight to fit an expiry. */
export function berthPeriodProblem(input: TariffInput, from: string, through?: string): TariffIssue | undefined {
  const raw = input.berthStart ?? input.callDate, startDay = dateOf(raw, input);
  if (!startDay) return durationIssue("missing-berth-date", "Provide the unambiguous berth start or call date.", input.berthStart ? "berthStart" : "callDate");
  const outside = (day: string) => day < from || !!through && day > through;
  const uncovered = (message: string): TariffIssue => ({ kind: "source", code: "uncovered-berth-period", message, service: "berth" });
  if (outside(startDay)) return uncovered(`The published period ${from}${through ? ` through ${through}` : " onward"} does not cover the berth start.`);
  if (input.berthEnd) {
    const endDay = dateOf(input.berthEnd, input);
    if (!endDay) return durationIssue("invalid-berth-end", "Provide the unambiguous berth end date/time.", "berthEnd");
    if (outside(endDay)) return uncovered("The published schedule does not cover the complete berth interval; a matching source for the uncovered period is required.");
    return;
  }
  const supplied = suppliedDurationMilliseconds(input);
  if (supplied.issue) return supplied.issue;
  if (!supplied.milliseconds || !through) return;
  if (raw && /\d{1,2}:\d{2}/.test(raw)) {
    const start = calculateElapsedTime({ start: raw, end: raw, timeZone: input.timeZone, dateOrder: input.dateOrder });
    if (start.status !== "ok") return durationIssue("invalid-berth-start", start.message, "berthStart");
    const endMs = addRational(rational(String(Date.parse(start.startUtc))), supplied.milliseconds);
    if (compareRational(endMs, rational("8640000000000000")) > 0) return durationIssue("occupancy-calendar-range", "The stated occupancy exceeds the supported calendar range.");
    const expiry = Date.parse(through + "T00:00:00+05:30") + 86_400_000;
    if (compareRational(endMs, rational(String(expiry))) >= 0) return uncovered("The published schedule does not cover the complete berth interval; a matching source for the uncovered period is required.");
  } else {
    const lastPossibleEnd = addRational(rational(String(Date.parse(startDay + "T00:00:00Z") + 86_400_000 - 1)), supplied.milliseconds);
    const expiry = Date.parse(through + "T00:00:00Z") + 86_400_000;
    if (compareRational(lastPossibleEnd, rational(String(expiry))) >= 0) return durationIssue("ambiguous-expiry-boundary", "Provide full berth start/end timestamps at the tariff expiry boundary; the date and occupancy alone do not establish coverage of the complete interval.");
  }
}

/** Historical string API for explanation callers. Quote intake uses the typed
 * problem so unavailable authority cannot become a missing-input form. */
export function berthPeriodIssue(input: TariffInput, from: string, through?: string): string | undefined {
  return berthPeriodProblem(input, from, through)?.message;
}

/** Explanation requests need no invented date or vessel intake. If the human
 * supplies an event/interval, the explanation must state its temporal limits. */
export function rulePeriodProblems(input: TariffInput, from: string, through?: string, occupancy = false): TariffIssue[] {
  const dates = occupancy ? [["berth start", input.berthStart ?? input.callDate], ["berth end", input.berthEnd]] : [["service date", input.callDate ?? input.berthStart]];
  const issues: TariffIssue[] = [];
  for (const [label, raw] of dates) {
    if (!raw) continue;
    const day = dateOf(raw, input);
    if (!day) issues.push({ kind: "input", code: "invalid-service-date", message: `The supplied ${label} is ambiguous or invalid; temporal applicability is not established.` });
    else if (day < from || through && day > through) issues.push({ kind: "source", code: "uncovered-service-period", message: `The retained evidence period ${from}${through ? ` through ${through}` : " onward"} does not cover the requested ${label} (${day}). This source does not establish the rate for that date; a matching dated source is needed.` });
  }
  if (occupancy && (input.berthStart || input.callDate) && !issues.length) {
    const issue = berthPeriodProblem(input, from, through);
    if (issue) issues.push(issue);
  }
  return issues;
}
export function rulePeriodIssues(input: TariffInput, from: string, through?: string, occupancy = false): string[] {
  return [...new Set(rulePeriodProblems(input, from, through, occupancy).map(issue => issue.message))];
}

const amountText = (currency: string, value: string) => {
  const [whole, fraction] = new D(value).toFixed(Math.max(2, new D(value).decimalPlaces())).split(".");
  return `${currency} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
};

/** Each component owns its intake and source. Unresolved siblings cannot turn
 * a valid component into a complete quote, or be silently dropped. */
export class Components {
  rows: Row[] = [];
  questions: string[] = [];
  blocked: string[] = [];
  notes: string[] = [];
  explanations: string[] = [];
  issues: TariffIssue[] = [];
  sources = new Map<string, TariffSource>();
  estimated = false;
  evidenceStatus?: TariffResult["applicability"]["evidenceStatus"];
  constructor(readonly input: TariffInput, readonly mode: Mode) {}
  issue(issue: TariffIssue) {
    this.issues.push(issue);
    (this.mode === "quote" && issue.kind === "input" ? this.questions : this.blocked).push(issue.message);
  }
  estimate(note: string, evidenceStatus: NonNullable<TariffResult["applicability"]["evidenceStatus"]>) {
    this.estimated = true;
    this.evidenceStatus = evidenceStatus;
    this.notes.push(note);
  }
  source(file: string, reference: string) {
    const source = packet.sources.find(s => s.file === file);
    if (!source) throw new Error(`Published source missing: ${file}`);
    const existing = this.sources.get(file)?.reference;
    this.sources.set(file, { url: source.url, sha256: source.sha256, reference: existing && existing !== reference ? `${existing}; ${reference}` : reference });
  }
  period(from: string, through?: string, occupancy = false) {
    if (this.mode === "rule") {
      const issues = rulePeriodProblems(this.input, from, through, occupancy);
      issues.forEach(issue => this.issue(issue)); return !issues.length;
    }
    if (occupancy) {
      const issue = berthPeriodProblem(this.input, from, through);
      if (issue) { this.issue(issue); return false; }
      return true;
    }
    const day = dateOf(this.input.callDate ?? this.input.berthStart, this.input);
    if (!day) { this.issue({ kind: "input", code: "missing-service-date", message: "What is the call/service date? Use an unambiguous date and explicit zone for timestamps.", field: "callDate" }); return false; }
    if (day < from || through && day > through) {
      this.issue({ kind: "source", code: "uncovered-service-period", message: `The published rule period ${from}${through ? ` through ${through}` : " onward"} does not cover the requested service date.` }); return false;
    }
    return true;
  }
  number(field: keyof TariffInput, label: string, positive = true, integer = false): TariffNumber | undefined {
    const raw = this.input[field];
    if (typeof raw !== "string" || !/^\d+(?:\.\d+)?$/.test(raw) || raw.length > 48 || !new D(raw).isFinite() || new D(raw).gt("1e12") || positive && new D(raw).lte(0) || integer && !new D(raw).isInteger()) {
      this.questions.push(`${label}: provide a ${positive ? "positive" : "nonnegative"}${integer ? " whole-number" : ""} quantity.`); return;
    }
    return new D(raw);
  }
  hours(): TariffNumber | undefined {
    const duration = occupancyDuration(this.input);
    if ("issue" in duration) { this.issue(duration.issue); return; }
    return duration.hours;
  }
  status(): "foreign" | "coastal" | undefined {
    if (this.input.service !== "foreign" && this.input.service !== "coastal") { this.questions.push("Is this service foreign-going or coastal?"); return; }
    if (this.input.service === "coastal" && this.input.coastalLicence !== true) { this.questions.push("Is the vessel licensed/converted for this coastal service?"); return; }
    return this.input.service;
  }
  ordinary() {
    const modifiers = (["idleTime", "shifting", "falseReadiness", "priority", "ousting", "penalty", "rebate", "otherAdjustments"] as const).filter(field => this.input[field] === true || this.input[field] === "true");
    if (modifiers.length || this.input.readinessTime) this.blocked.push(`Only the ordinary unadjusted component is available here; ${[...modifiers, ...(this.input.readinessTime ? ["readiness cessation"] : [])].join(", ")} needs its applicable adjustment.`);
    this.notes.push("Ordinary unadjusted component only. No exemption, penalty waiver or complete invoice is implied.");
  }
  add(id: string, label: string, currency: string, amount: TariffNumber | string, formula: string) {
    if (!this.rows.some(row => row.id === id)) this.rows.push({ id, label, currency, amount: new D(amount).toString(), formula });
  }
  async result(): Promise<TariffResult> {
    for (const [file, source] of this.sources) {
      const bytes = await readFile(path.join(process.cwd(), "data/reviewed-tariffs/full-scope-2026", file));
      if (createHash("sha256").update(bytes).digest("hex") !== source.sha256) throw new Error(`Published source checksum changed: ${file}`);
    }
    const totals = [...new Set(this.rows.map(r => r.currency))].map(currency => {
      const rows = this.rows.filter(r => r.currency === currency);
      return { currency, amount: D.sum(...rows.map(r => r.amount)).toString(), chargeIds: rows.map(r => r.id), lineAmounts: rows.map(r => r.amount), basis: this.estimated ? "reference" as const : "component" as const };
    });
    const incomplete = this.questions.length > 0 || this.blocked.length > 0;
    const heading = this.estimated ? "Reference estimate — current applicability unconfirmed" : "Published tariff components — not a complete bill";
    const body = this.mode === "rule" ? this.explanations.join("\n\n") : this.rows.length ? `**${heading}**\n\n| Component | Amount |\n|---|---:|\n${this.rows.map(r => `| ${r.label} | ${amountText(r.currency, r.amount)} |`).join("\n")}\n${totals.map(t => `| Identified component subtotal | ${amountText(t.currency, t.amount)} |`).join("\n")}\n\n${this.rows.map(r => `${r.label}: ${r.formula}.`).join("\n\n")}` : "No source-validated amount established for this scope.";
    return { status: this.mode === "rule" ? "explained" : incomplete || !this.rows.length ? "unresolved" : this.estimated ? "estimated" : "calculated", sourceClass: this.estimated ? "published-reference" : "official-tariff", questions: [...new Set(this.questions)], limitations: [...new Set(this.blocked)], ...(this.issues.length ? { issues: this.issues } : {}),
      body: body + `\n\n${[...new Set(this.notes)].join(" ")}\n\nSources checked ${packet.checkedOn}: ${[...this.sources.values()].map(s => `[${s.reference}](${s.url})`).join("; ")}. Exact component arithmetic; tax, currency conversion and final invoice rounding are excluded unless explicitly shown.`,
      ...(totals.length ? { totals } : {}), calculation: this.rows.length ? { lines: this.rows } : undefined, sources: [...this.sources.values()],
      applicability: { status: this.mode === "rule" ? "explanation-only" : incomplete ? "unverified" : this.estimated ? "published-reference" : "conditional-retained-rule", currentTariffVerified: false, sourceCheckedOn: packet.checkedOn, ...(this.evidenceStatus ? { evidenceStatus: this.evidenceStatus } : {}), message: this.estimated ? "Dated published reference or conditional scenario only. Current applicability is unconfirmed; this is not an authoritative quotation or complete bill." : "Official publications checked for these dated components. Actual call eligibility, commercial discounts and complete invoice treatment remain conditional." } };
  }
}

function pilotage(c: Components, mumbai: boolean) {
  c.source(mumbai ? "mumbai-sor-may2026.pdf" : "jnpa-2026.pdf", mumbai ? "MbPA SOR 2.1(A), pp9–13" : "JNPA SOR 2.2, pp3–4");
  c.explanations.push(mumbai ? "Ordinary cargo pilotage uses the actual movement area, minimum 1,000 GRT, and the published progressive bands at 30,000/60,000 GRT. One inward and outward movement are included. Dock/Jawahar Dweep/Pir Pau rates include required tugs; stream/shifting without-tug rows exclude them." : "JNPA pilotage-cum-towage includes one inward and outward movement. Published fixed bases above 30,000/60,000 GRT must be used, with a per-visit minimum. Routine tugs are included; mixed-status legs, cold moves and extra hired tugs need separate treatment.");
  if (c.mode === "rule") {
    if (mumbai) {
      const rule = packet.mumbai.find(r => r.id === "mumbai-cargo-pilotage-towage")!;
      c.explanations.push("Effective 1 May 2026. Let G = max(certified GRT, 1000). For G ≤30000 use G × first rate; for 30000<G≤60000 use first base + (G−30000) × second rate; above60000 use second base + (G−60000) × third rate.");
      c.explanations.push("| Movement area | Currency/status | First rate | First base | Second rate | Second base | Third rate |\n|---|---|---:|---:|---:|---:|---:|\n" + Object.entries(rule.rates!).flatMap(([area, currencies]) => (["USD", "INR"] as const).map(currency => `| ${area} | ${currency}/${currency === "USD" ? "foreign" : "coastal"} | ${currencies[currency].join(" | ")} |`)).join("\n"));
      c.explanations.push("The shiftingWithoutTugs row is a separate requested shift, not an inward/outward cycle. Each ordinary inward/outward leg is 50% at that leg's status; cold/dead-ship and extra tug service need separate rules.");
    } else {
      c.explanations.push("Effective 1 May 2026–30 April 2027. Inward and outward each use 50% of the rate applicable on that leg's date and status; never redate an earlier inward leg using the berth/sailing date.");
      c.explanations.push("| Status | Currency | GRT ≤30000 | 30001–60000 GRT | Above60000 GRT | Per-visit minimum |\n|---|---|---|---|---|---:|\n" + (["foreign", "coastal"] as const).map(status => {
        const r = packet.jnpa.jnpa.pilotage[status];
        return `| ${status} | ${r.currency} | GRT × ${r.bands[0].rate} | ${r.bands[1].base} + (GRT−30000) × ${r.bands[1].marginalRate} | ${r.bands[2].base} + (GRT−60000) × ${r.bands[2].marginalRate} | ${r.minimum} |`;
      }).join("\n"));
    }
  }
  // Inward pilotage belongs to the arrival/service date, not the later berth
  // start. JNPA's commencement note assigns inward and outward legs separately.
  // Both the supplied call date and occupancy interval must fit this packet;
  // a crossing needs the applicable leg rates, never one new full-cycle rate.
  if (!c.period("2026-05-01", mumbai ? undefined : "2027-04-30") || !c.period("2026-05-01", mumbai ? undefined : "2027-04-30", true) || c.mode === "rule") return;
  const gt = c.number("gt", "Gross tonnage (GT/GRT)", true, true), status = c.status();
  if (!gt || !status) return;
  if (c.input.movements !== "2") { c.questions.push("Does this include one inward and one outward movement, both at the stated coastal/foreign status?"); return; }
  if (c.input.selfPropelled === false) { c.blocked.push("Cold/dead-ship movement requires its surcharge and additional tug rules; the ordinary pilotage price cannot be used."); return; }
  const currency = status === "foreign" ? "USD" : "INR";
  let rates: string[], tonnage = gt, minimum = "0";
  if (mumbai) {
    if (c.input.selfPropelled !== true) { c.questions.push("Will the vessel move under its own power?"); return; }
    if (!["general-cargo", "container", "tanker"].includes(c.input.vesselCategory ?? "")) { c.questions.push("vessel category"); return; }
    const rule = packet.mumbai.find(r => r.id === "mumbai-cargo-pilotage-towage")!;
    const area = c.input.pilotageArea as keyof NonNullable<typeof rule.rates>;
    if (!area || !rule.rates?.[area] || area === "shiftingWithoutTugs") { c.questions.push("Which pilotage movement area: docks, stream without tugs, or Jawahar Dweep/Pir Pau? Requested shifting needs its separate movement scope."); return; }
    if (area === "streamWithoutTugs" && c.input.charges.includes("towage")) c.blocked.push("The stream pilotage row excludes tugs; requested towage remains unpriced.");
    rates = rule.rates[area][currency as "USD" | "INR"]; tonnage = D.max(gt, 1000);
  } else {
    const rule = packet.jnpa.jnpa.pilotage[status];
    rates = [rule.bands[0].rate!, rule.bands[1].base!, rule.bands[1].marginalRate!, rule.bands[2].base!, rule.bands[2].marginalRate!]; minimum = rule.minimum;
  }
  const base = tonnage.lte(30000) ? tonnage.mul(rates[0]) : tonnage.lte(60000) ? new D(rates[1]).plus(tonnage.minus(30000).mul(rates[2])) : new D(rates[3]).plus(tonnage.minus(60000).mul(rates[4]));
  const withoutTugs = mumbai && c.input.pilotageArea === "streamWithoutTugs";
  c.add(`${withoutTugs ? "pilotage-only" : "pilotage-towage"}:ordinary-${status}:inward-outward`, `Ordinary inward + outward pilotage (${withoutTugs ? "excludes tugs" : "routine towage included"})`, currency, D.max(base, minimum), `published band at ${tonnage} GRT; ${mumbai ? "minimum assessed tonnage 1000 GRT" : `per-visit minimum ${currency} ${minimum}`}; one inward plus one outward, not twice the full-cycle tariff`);
  c.ordinary();
}

function operatorBerth(c: Components, bmct: boolean) {
  const rule = bmct ? packet.jnpa.bmct : packet.jnpa.nsigt;
  c.source(bmct ? "bmct-2026-04-06-jnpa.pdf" : "nsigt-2026.pdf", `${bmct ? "BMCT" : "NSIGT"} SOR, berth table p3`);
  const berthRates = bmct ? { foreign: packet.jnpa.bmct.berth.foreignRate, coastal: packet.jnpa.bmct.berth.coastalRate } : packet.jnpa.nsigt.berthINRPerGRTStartedHour;
  c.explanations.push(`${bmct ? "BMCT" : "NSIGT"} ordinary berth ceiling is INR ${berthRates.foreign} foreign / ${berthRates.coastal} coastal per GRT per started hour. Use the operator berth charge once; do not add JNPA berth hire. Final upward-rupee rounding belongs to the complete invoice, not each component.`);
  if (!c.period(bmct ? packet.jnpa.bmct.effectiveFromConservative : packet.jnpa.nsigt.effectiveFrom, rule.effectiveThrough, true) || c.mode === "rule") return;
  const gt = c.number("gt", "Gross tonnage (GT/GRT)"), status = c.status(), hours = c.hours();
  if (!gt || !status || !hours) return;
  const rate = bmct ? status === "foreign" ? packet.jnpa.bmct.berth.foreignRate : packet.jnpa.bmct.berth.coastalRate : packet.jnpa.nsigt.berthINRPerGRTStartedHour[status];
  c.add(`berth:ordinary-${status}:gt-hour`, "Ordinary operator berth hire", "INR", gt.mul(rate).mul(hours.ceil()), `${gt} GRT × INR ${rate} × ${hours.ceil()} commenced hours`); c.ordinary();
}

function containerHandling(c: Components, port: string) {
  const key = port === BMCT ? "bmct" : port === NSIGT ? "nsigt" : port === NSICT ? "nsict" : port === NSFT ? "nsft" : "gti";
  c.source(key === "bmct" ? "bmct-2026-04-06-jnpa.pdf" : `${key}-2026.pdf`, `${key.toUpperCase()} SOR normal container handling table`);
  c.explanations.push("Normal container handling uses the printed size and cargo-status rows. Ship-yard and the requested road/ICD rail leg are distinct unless the source explicitly bundles them. Count physical laden and empty containers separately. Special cargo and storage need their own rules; no automatic coastal discount on already coastal rows.");
  if (c.mode === "rule") {
    if (key === "bmct" || key === "nsigt") {
      const rows = key === "bmct" ? packet.jnpa.bmct.normalHandling : packet.jnpa.nsigt.normalHandlingINRPer20ft;
      c.explanations.push("INR per normal20-foot container; for over20 through40 feet multiply each selected component by 1.5. Add only the selected matching landside leg.\n\n| Status | Ship-yard laden | Ship-yard empty | Road addition/box | ICD rail addition/box |\n|---|---:|---:|---:|---:|\n" + (["foreign", "coastal"] as const).map(s => `| ${s} | ${rows[s].shipYardLaden} | ${rows[s].shipYardEmpty} | ${rows[s].yardTruck} | ${rows[s].yardRailICD} |`).join("\n"));
    } else if (key === "nsft") {
      c.explanations.push("Normal foreign USD bundles, including the matching landside leg once:\n\n| Feet | Road laden | Road empty | Rail laden | Rail empty |\n|---|---:|---:|---:|---:|\n" + Object.entries(packet.jnpa.nsft.normalHandlingUSD).map(([size, r]) => `| ${size} | ${r.roadLaden} | ${r.roadEmpty} | ${r.railLaden} | ${r.railEmpty} |`).join("\n"));
      c.explanations.push("Coastal stevedoring is 60% of EXIM, while other charges remain at EXIM rates. Do not reduce the entire bundle by 40%; coastal settlement needs the separately defined legs and prescribed dated FX.");
    } else if (key === "nsict") {
      c.explanations.push("INR normal ship-yard using port crane; matching road/ICD rail leg is added once per box:\n\n| Feet | Foreign laden | Foreign empty | Coastal laden | Coastal empty | Road/ICD rail addition |\n|---|---:|---:|---:|---:|---:|\n" + Object.entries(packet.jnpa.nsict.normalHandlingINR).map(([size, r]) => `| ${size} | ${r.foreignLaden} | ${r.foreignEmpty} | ${r.coastalLaden} | ${r.coastalEmpty} | ${r.yardRoadOrICDRail} |`).join("\n"));
    } else {
      c.explanations.push("INR normal ship-yard using port crane; effective 1 May 2026 at 00:01 IST:\n\n| Feet | Foreign laden | Foreign ICD laden | Foreign empty | Coastal laden | Coastal ICD laden | Coastal empty | Foreign road/ICD rail addition |\n|---|---:|---:|---:|---:|---:|---:|---:|\n" + Object.entries(packet.jnpa.gti.normalHandlingINR).map(([size, r]) => `| ${size} | ${r.foreignLaden} | ${r.foreignICDLaden} | ${r.foreignEmpty} | ${r.coastalLaden} | ${r.coastalICDLaden} | ${r.coastalEmpty} | ${r.foreignYardRoadOrICDRail} |`).join("\n"));
      c.explanations.push("The landside table is foreign-going only; do not infer a coastal landside price. Use the printed ICD laden row, including its 20-foot one-paise distinction.");
    }
  }
  const from = key === "bmct" ? "2026-04-06" : key === "nsigt" ? "2026-04-01" : "2026-05-01";
  if (!c.period(from, ["bmct", "nsigt"].includes(key) ? "2027-03-31" : undefined) || c.mode === "rule") return;
  if (key === "gti" && dateOf(c.input.callDate ?? c.input.berthStart, c.input) === "2026-05-01") {
    const event = c.input.callDate ?? c.input.berthStart!;
    if (!/\d{1,2}:\d{2}/.test(event)) { c.questions.push("What is the exact service event time on 1 May 2026, with its zone? GTI's revised tariff starts at 00:01 IST."); return; }
    const parsed = calculateElapsedTime({ start: event, end: event, timeZone: c.input.timeZone, dateOrder: c.input.dateOrder });
    if (parsed.status !== "ok") { c.questions.push(parsed.message); return; }
    if (Date.parse(parsed.startUtc) < Date.parse(packet.jnpa.gti.effectiveFrom)) { c.blocked.push("GTI's revised tariff starts at 00:01 IST on 1 May; the supplied service event precedes commencement."); return; }
  }
  const laden = c.number("ladenContainers", "Laden container count", false, true), empty = c.number("emptyContainers", "Empty container count", false, true), size = c.number("containerSize", "Container length in feet");
  if (c.input.specialCargo !== false) { c.questions.push("Are these normal containers, without hazardous/oversize or other special handling?"); return; }
  const traffic = c.input.cargoTraffic;
  if (!["exim", "coastal"].includes(traffic ?? "")) { c.questions.push("Is the cargo EXIM, coastal or transshipment? This normal row does not price transshipment."); return; }
  if (traffic === "coastal" && c.input.coastalLicence !== true) { c.questions.push("Is the coastal cargo eligible under the vessel's applicable trading licence/conversion?"); return; }
  const mode = c.input.handlingMode;
  if (!["road", "rail", "ship-yard"].includes(mode ?? "")) { c.questions.push("Which handling scope: ship-yard only, road, or ICD rail?"); return; }
  if (mode === "rail" && key !== "nsft" && c.input.icdRail !== true) { c.questions.push("Is this the terminal's ICD rail movement?"); return; }
  if (!laden || !empty || !size) return;
  const coastal = traffic === "coastal";
  let ladenRate: string, emptyRate: string, land = "0", multiplier = new D(1), currency = "INR";
  if (key === "bmct" || key === "nsigt") {
    if (size.lt(20) || size.gt(40)) { c.blocked.push("This source branch does not establish handling rates outside 20–40-foot containers."); return; }
    multiplier = size.eq(20) ? new D(1) : new D("1.5");
    const r = key === "bmct" ? packet.jnpa.bmct.normalHandling[coastal ? "coastal" : "foreign"] : packet.jnpa.nsigt.normalHandlingINRPer20ft[coastal ? "coastal" : "foreign"];
    ladenRate = r.shipYardLaden; emptyRate = r.shipYardEmpty;
    land = mode === "road" ? r.yardTruck : mode === "rail" ? r.yardRailICD : "0";
  } else if (key === "nsft") {
    if (coastal || mode === "ship-yard") { c.blocked.push("NSFT's quoted row bundles ship-yard and the matching landside leg. Coastal conversion requires splitting stevedoring from the other leg; a blanket 60% bundle is not authorized."); return; }
    const r = packet.jnpa.nsft.normalHandlingUSD[size.eq(20) ? "20" : size.eq(40) ? "40" : "over40"];
    if (!size.eq(20) && !size.eq(40) && !size.gt(40)) { c.blocked.push("No printed NSFT row established for this container length."); return; }
    ladenRate = mode === "road" ? r.roadLaden : r.railLaden; emptyRate = mode === "road" ? r.roadEmpty : r.railEmpty; currency = "USD";
  } else {
    if (c.input.portCrane !== true) { c.questions.push("Will the terminal's port crane handle these containers?"); return; }
    if (!size.eq(20) && !size.eq(40) && !(size.gt(40) && (key === "gti" || size.lte(45)))) { c.blocked.push("No printed normal-handling size row established for this length."); return; }
    if (key === "nsict") {
      const r = packet.jnpa.nsict.normalHandlingINR[size.eq(20) ? "20" : size.eq(40) ? "40" : "over40To45"];
      ladenRate = coastal ? r.coastalLaden : r.foreignLaden; emptyRate = coastal ? r.coastalEmpty : r.foreignEmpty; if (mode !== "ship-yard") land = r.yardRoadOrICDRail;
    } else {
      const r = packet.jnpa.gti.normalHandlingINR[size.eq(20) ? "20" : size.eq(40) ? "40" : "over40"];
      if (coastal && mode !== "ship-yard") { c.blocked.push("GTI's landside table is explicitly foreign-going; no coastal landside price is inferred."); return; }
      ladenRate = coastal ? r.coastalLaden : mode === "rail" ? r.foreignICDLaden : r.foreignLaden; emptyRate = coastal ? r.coastalEmpty : r.foreignEmpty; if (mode !== "ship-yard") land = r.foreignYardRoadOrICDRail;
    }
  }
  const base = laden.mul(ladenRate).plus(empty.mul(emptyRate)).plus(laden.plus(empty).mul(land)).mul(multiplier);
  c.add(`container:${size}ft:normal-${traffic}:${mode}`, `Normal ${size}-foot ${mode} handling`, currency, base, `(${laden} laden × ${ladenRate} + ${empty} empty × ${emptyRate} + ${laden.plus(empty)} boxes × ${land} landside) × ${multiplier}`);
  c.notes.push(key === "nsft" ? "The matching landside leg is already included in the bundle." : "Only the selected ship-yard and matching landside scope is included.");
}

function muc(c: Components) {
  c.source("paradip-muc-ministry-order-2024.pdf", "MoPSW 5 Nov 2024 order, Annex I pp2–3"); c.source("nldsl-muc-2024-2027.pdf", "NLDSL 6 Nov 2024 letter, p2");
  c.explanations.push("MUC ceiling INR145 plus fixed INR25 maritime development fund per physical container, excluding GST, from 28 October 2024 through 30 September 2027. Coastal and transshipment containers are exempt. No TEU multiplier or collection-commission discount. Lower MUC requires NLDSL authorization; the fixed fund is unchanged.");
  if (!c.period("2024-10-28", "2027-09-30") || c.mode === "rule") return;
  if (!["exim", "coastal", "transshipment"].includes(c.input.cargoTraffic ?? "")) { c.questions.push("Are the containers EXIM, coastal or transshipment cargo?"); return; }
  let count: TariffNumber | undefined;
  if (c.input.containerCount !== undefined) count = c.number("containerCount", "Physical container count", false, true);
  else if (c.input.ladenContainers !== undefined && c.input.emptyContainers !== undefined) {
    const a = c.number("ladenContainers", "Laden container count", false, true), b = c.number("emptyContainers", "Empty container count", false, true); if (a && b) count = a.plus(b);
  } else c.questions.push("How many physical containers? Count boxes, not TEUs.");
  if (!count) return;
  if (c.input.containerCount !== undefined && c.input.ladenContainers !== undefined && c.input.emptyContainers !== undefined && !count.eq(new D(c.input.ladenContainers).plus(c.input.emptyContainers))) { c.questions.push("The physical container count disagrees with laden plus empty containers."); return; }
  const exempt = c.input.cargoTraffic !== "exim";
  c.add("muc:physical-container:ceiling", "MUC + maritime development fund", "INR", exempt ? "0" : count.mul(170), exempt ? `${c.input.cargoTraffic} containers explicitly excluded` : `${count} physical containers × (INR145 ceiling + INR25 fixed fund), excluding GST`);
}

function calendarAnniversary(date: string, years: number): string | undefined {
  const [year, month, day] = date.split("-").map(Number), target = year + years;
  const stamp = new Date(Date.UTC(target, month - 1, day));
  if (stamp.getUTCFullYear() !== target || stamp.getUTCMonth() !== month - 1 || stamp.getUTCDate() !== day) return;
  return `${target.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function jaigarhAgePilotage(c: Components, gt: TariffNumber) {
  const keel = dateOf(c.input.keelLaidDate, c.input), call = dateOf(c.input.callDate, c.input);
  if (!c.input.keelLaidDate || !keel) { c.questions.push("Provide the unambiguous keel-laid date; build, launch, delivery and registration dates do not establish J-8 vessel age."); return; }
  if (!c.input.callDate || !call) { c.questions.push("Provide the unambiguous call/service date for the J-8 age assessment."); return; }
  if (keel > call) { c.questions.push("The keel-laid date is after the call/service date; confirm the vessel dates."); return; }
  const boundaries = [5, 10, 15, 20, 25].map(years => ({ years, day: calendarAnniversary(keel, years) }));
  if (boundaries.some(boundary => !boundary.day)) { c.blocked.push("A 29 February keel-laid date needs an explicit anniversary convention before J-8 age can be selected; no average-day year conversion was used."); return; }
  const overlap = boundaries.find(boundary => boundary.day === call);
  if (overlap) { c.blocked.push(`J-8 prints overlapping age bands at the exact ${overlap.years}-year keel-laid anniversary; no rate selected.`); return; }
  const [five, ten, fifteen, twenty, twentyFive] = boundaries.map(boundary => boundary.day!);
  const rate = call < five ? "0.0" : call < ten ? "0.017744" : call < fifteen ? "0.026616" : call < twenty ? "0.039924" : call < twentyFive ? "0.053232" : "0.0600";
  c.add("age-pilotage:jaigarh:keel-age", "J-8 additional pilotage by vessel age", "USD", gt.mul(rate), `${gt} GRT × USD${rate}, selected once by calendar anniversaries from keel laid ${keel} to call ${call}`);
  c.notes.push("J-8 is a single requested USD/GRT component selected by calendar anniversaries from the keel-laid date. No movement multiplier, minimum, cap, coastal discount, tax or currency conversion is inferred.");
}

function jaigarh(c: Components, charges: string[]) {
  if (charges.some(charge => charge !== "age-pilotage")) {
    c.source("jaigarh-2026.pdf", "JSW Jaigarh May 2026 tariff, p1 J-1–J-5");
    c.explanations.push("JSW Jaigarh J-1 port dues: max(USD0.33/GRT, USD2,000/call), or USD0.45/GRT for LPG/chemical, with 30-day validity. J-2 uses whole-GRT bands, includes one berth/unberth cycle and has a conflicting exact-45,000 endpoint. J-3 mooring: max(USD0.035/GRT, USD200). J-4 environmental base: USD100/150/200 at ≤10,000 / 10,001–30,000 / above30,000 GRT; pollution costs extra. J-5 requested pilot attendance: USD100/hour; fractional-hour treatment unestablished.");
    c.explanations.push("J-2 USD/GRT for one ordinary berthing/unberthing cycle: through35000, 1.60 for all four cargo categories; 35001–44999, 1.75 for mechanized bulk and 0.90 for nonmechanized bulk/container/LPG-chemical; above45000, 2.10 and 1.10 respectively. These are selected bands, not progressive marginal slabs; exactly45000 remains unresolved because printed bands overlap.");
  }
  if (charges.includes("age-pilotage")) {
    c.source("jaigarh-2026.pdf", "JSW Jaigarh May 2026 tariff, p2 J-8");
    c.explanations.push("J-8 additional pilotage is one USD/GRT component selected from vessel age as per keel laid: 0–5 years 0.0; 5–10 0.017744; 10–15 0.026616; 15–20 0.039924; 20–25 0.053232; 25 or more 0.0600. Exact 5/10/15/20/25-year anniversaries overlap in print and remain unresolved. Age uses calendar anniversaries, never an average-day-year approximation.");
  }
  if (!c.period("2026-05-01") || c.mode === "rule") return;
  if (!/^(?:JSW|JSW Jaigarh Port Limited)$/i.test(c.input.operator ?? "")) { c.questions.push("Is this JSW Jaigarh Port, rather than another Jaigarh operator?"); return; }
  for (const charge of charges) {
    if (charge === "pilot-attendance") {
      const hours = c.number("pilotAttendanceHours", "Master-requested pilot attendance hours", true, true);
      if (hours) c.add("pilot-attendance:requested", "Requested pilot attendance", "USD", hours.mul(100), `${hours} whole hours × USD100`);
      continue;
    }
    const gt = c.number("gt", "Gross tonnage (GT/GRT)", true, charge !== "age-pilotage");
    if (!gt) continue;
    if (charge === "age-pilotage") { jaigarhAgePilotage(c, gt); continue; }
    if (charge === "port-dues" || charge === "pilotage" || charge === "towage") {
      const category = c.input.cargoCategory;
      if (!["mechanized-bulk", "nonmechanized-bulk", "container", "lpg-chemical"].includes(category ?? "")) { c.questions.push("Which cargo category: mechanized bulk, nonmechanized bulk, container, or LPG/chemical?"); continue; }
      if (charge === "port-dues") {
        const days = c.number("callDays", "Call duration in days"); if (!days) continue;
        if (days.gt(30)) { c.blocked.push("The call exceeds J-1's 30-day dues validity; renewal is not priced by this branch."); continue; }
        const rate = category === "lpg-chemical" ? ".45" : ".33";
        c.add("port-dues:jaigarh:per-call", "J-1 port dues", "USD", D.max(gt.mul(rate), 2000), `max(${gt} GRT × USD${rate}, USD2000/call)`);
      } else {
        if (gt.eq(45000)) { c.blocked.push("J-2 prints overlapping differently priced bands at exactly 45,000 GRT; no rate selected."); continue; }
        if (c.input.movements !== "2") { c.questions.push("Does the pilotage scope include one berthing and one unberthing?"); continue; }
        if (c.input.selfPropelled === false) { c.blocked.push("Cold movement is outside the ordinary J-2 component."); continue; }
        const rate = gt.lte(35000) ? "1.60" : gt.lt(45000) ? category === "mechanized-bulk" ? "1.75" : ".90" : category === "mechanized-bulk" ? "2.10" : "1.10";
        c.add("pilotage-towage:jaigarh:inward-outward", "J-2 ordinary pilotage cycle", "USD", gt.mul(rate), `${gt} GRT × USD${rate}, one included berth/unberth cycle`);
      }
    } else if (charge === "mooring") c.add("mooring:jaigarh:per-call", "J-3 mooring", "USD", D.max(gt.mul(".035"), 200), `max(${gt} GRT × USD0.035, USD200)`);
    else if (charge === "environment") {
      c.add("environment:jaigarh:base", "J-4 environmental base", "USD", gt.lte(10000) ? "100" : gt.lte(30000) ? "150" : "200", `published ${gt} GRT band`);
      c.notes.push("Pollution-related USD500 and actual cleaning costs are outside the environmental base; no waiver is implied.");
    }
  }
  c.ordinary();
}

function kll(c: Components, charges: string[]) {
  const date = dateOf(c.input.berthStart ?? c.input.callDate, c.input);
  c.source("kll-2025.pdf", "KLL 2025 port-charges notice, p1"); c.source("kll-2026.pdf", "KLL November 2026 revision, p1");
  c.explanations.push("Until 31 October 2026: berth USD0.1/GRT capped at INR1m and pilotage USD0.2/GRT capped at INR2m; GST18% follows the caps. The base berth period is 36 hours. Prescribed FX is SBI TT selling on the day before scheduled berthing, or prior bank working day. From 1 November: one uncapped combined berth+pilotage USD0.359/GRT component; new FX event is scheduled berthing day. The revision does not establish old excess-stay/tax continuity.");
  c.explanations.push("The 2025 notice measures berth stay from first line ashore to cast off. Beyond36 hours, vessel-attributable excess triggers USD0.0041/GRT/hour; terminal-only delay does not satisfy that trigger and does not waive the base fee. Mixed delay, cap allocation and post-November continuation of this footnote remain unresolved.");
  if (!c.period("2025-10-01", undefined, true) || c.mode === "rule") return;
  const gt = c.number("gt", "Gross tonnage (GT/GRT)"); if (!gt || !date) return;
  if (date >= "2026-11-01") {
    c.add("berth-pilotage:kll:combined", "Combined berth + pilotage base", "USD", gt.mul(".359"), `${gt} GRT × USD0.359, once, without cap`);
    if (charges.includes("gst")) c.blocked.push("The November revision does not state the governing GST rate/continuity; no tax amount added.");
    c.notes.push("This is the published combined base only. Excess stay and final tax/FX settlement remain separate; the old 36-hour footnote is not silently carried forward.");
    return;
  }
  if (!c.period("2025-10-01", "2026-10-31", true)) return;
  if (c.input.berthEnd && (dateOf(c.input.berthEnd, c.input) ?? "") >= "2026-11-01") { c.blocked.push("This occupancy crosses the KLL tariff revision; a single old cap cannot price the interval."); return; }
  let berthReady = true;
  if (charges.includes("berth")) {
    const hours = c.hours();
    if (!hours) berthReady = false;
    else if (hours.gt(36)) {
      c.issue({ kind: "unsupported", code: "kll-excess-berth-allocation", service: "berth", message: "KLL excess stay beyond 36 hours needs the applicable delay/cap allocation; no complete berth amount established." });
      berthReady = false;
    }
  }
  const fx = c.number("fxInrPerUsd", "Supplied SBI TT selling INR per USD exchange rate");
  const scheduled = dateOf(c.input.scheduledBerthingDate, c.input), fxDate = dateOf(c.input.fxDate, c.input);
  if (!scheduled || !fxDate || c.input.fxBasis !== "SBI-TT-selling") { c.questions.push("Provide scheduled berthing date and the dated SBI TT selling INR/USD rate prescribed for the day before it (previous bank working day if a holiday)."); return; }
  const event = new Date(`${scheduled}T00:00:00Z`); event.setUTCDate(event.getUTCDate() - 1); const expected = event.toISOString().slice(0, 10);
  if (fxDate !== expected && !(fxDate < expected && c.input.fxPreviousWorkingDay === true)) { c.questions.push(`The prescribed FX date is ${expected}; confirm the prior bank working day only if that date was a bank holiday.`); return; }
  if (!fx) return;
  let base = new D(0);
  for (const [service, rate, cap] of [["berth", ".1", "1000000"], ["pilotage", ".2", "2000000"]] as const) if (charges.includes(service)) {
    if (service === "berth" && !berthReady) continue;
    const value = D.min(gt.mul(rate).mul(fx), cap); base = base.plus(value);
    c.add(`${service}:kll:capped`, `KLL ${service} capped base`, "INR", value, `min(${gt} GRT × USD${rate} × supplied INR/USD ${fx}, INR${cap})`);
  }
  if (charges.includes("gst")) {
    if (charges.includes("berth") && !berthReady) c.issue({ kind: "unsupported", code: "kll-incomplete-tax-base", service: "gst", message: "The requested KLL combined GST remains incomplete because its berth base is unresolved. The independent pilotage base is shown without treating it as the whole tax base." });
    else c.add("gst:kll:18-percent", "KLL GST18%", "INR", base.mul(".18"), `18% × capped base INR${base}`);
  }
  c.notes.push(`FX supplied by the user: SBI TT selling ${fxDate}; not independently verified market data.`);
}

function cruise(c: Components) {
  for (const file of ["mumbai-cruise-2020.pdf", "mumbai-cruise-2021.pdf", "mumbai-cruise-oct2022.pdf", "mumbai-cruise-2023.pdf", "mumbai-cruise-2024.pdf", "mumbai-cruise-extension-2025.pdf", "mumbai-cruise-rationalisation-2026.pdf"]) c.source(file, file.replace(".pdf", ""));
  c.source("mumbai-sor-may2026.pdf", "MbPA SOR 2.1: ordinary composite pilotage/towage scope; no ordinary rates added to the cruise scheme");
  c.explanations.push("Mumbai's cruise scheme through 31 March 2027: first12 hours USD0.085/GRT plus USD6/passenger; excess USD0.0175/GRT/hour. Ordinary berth hire, port dues, pilotage and passenger fee are included in the first12-hour scheme, not added again. Annual-call rebates and fractional excess hours require their own established treatment.");
  c.explanations.push("The ordinary included pilotage service includes its routine tug assistance; do not add ordinary towage a second time. Separately hired craft, cold movements and special operations are not waived by this ordinary component.");
  c.explanations.push("Published annual-call rebate bands: through10 calls none; 11–35 calls10%; 36–70 calls15%; above70 calls20%. The counting entity/year, eligible base and prospective/retrospective application remain unestablished; the calculator does not infer a rebate from a count alone.");
  if (!c.period("2026-04-01", "2027-03-31", true) || c.mode === "rule") return;
  if (c.input.vesselCategory && c.input.vesselCategory !== "cruise") { c.blocked.push("The supplied vessel category is not cruise; the cruise scheme cannot price this vessel merely because the terminal is named Mumbai Cruise Terminal."); return; }
  if (c.input.selfPropelled === false) c.blocked.push("The known cold/dead-ship movement needs its applicable special towage treatment; the ordinary cruise base alone does not resolve that requested scope.");
  const gt = c.number("gt", "Gross tonnage (GT/GRT)"), passengers = c.number("passengers", "Passenger count", false, true), hours = c.hours();
  if (!gt || !passengers || !hours) return;
  const excess = D.max(hours.minus(12), 0);
  if (!excess.isInteger()) { c.blocked.push("The cruise circular does not establish fractional excess-hour rounding; no complete cruise amount calculated."); return; }
  if (c.input.rebate === true || c.input.rebate === "true") c.blocked.push("Annual-call rebate entitlement/base/counting requires confirmation from the governing scheme; only the undiscounted base is shown.");
  const modifiers = (["priority", "shifting", "ousting", "penalty", "otherAdjustments"] as const).filter(field => c.input[field] === true || c.input[field] === "true");
  if (modifiers.length) c.blocked.push(`The stated ${modifiers.join(", ")} conditions need their governing cruise adjustments; only the undiscounted base is shown.`);
  c.add("cruise:mumbai:scheme-base", "Undiscounted cruise scheme", "USD", gt.mul(".085").plus(passengers.mul(6)).plus(gt.mul(".0175").mul(excess)), `${gt} GRT × USD0.085 + ${passengers} passengers × USD6 + ${excess} excess whole hours × ${gt} GRT × USD0.0175`);
  c.notes.push("Undiscounted published scheme base. No annual-call rebate applied; this is not a finding of rebate ineligibility. Included ordinary marine fees are not duplicated.");
}

function bpcl(c: Components, services: string[]) {
  c.source("bpcl-2026-27.pdf", "BPCL signed indexed SOR, 2026–27 pp1–8");
  c.source("bpcl-2021-approved-sor.pdf", "BPCL approved SOR Annex IV, exact corresponding units pp24–25");
  c.notes.push("Executive source interpretation: the new rate-only indexation publication carries forward the exact corresponding units/currencies in the approved Annex IV. This does not renew every old penalty or contractual term. No second indexation or coastal discount is applied.");
  c.explanations.push("BPCL's 2026 indexed publication supplies current named-cargo and ancillary-service prices. Exact corresponding INR/MT and service units come from approved Annex IV; foreign fresh water is explicitly USD/MT. The CBFS coastal-export row is blank and cannot be copied from import. Unidentified chemicals cannot be assigned the MPCB catch-all without classification evidence.");
  if (c.mode === "rule") {
    c.period("2026-05-01");
    if (services.includes("cargo")) c.explanations.push("Cargo handling INR/MT; effective 1 May 2026 onwards, without inferring an expiry from the filename:\n\n| Named cargo | Foreign | Coastal |\n|---|---:|---:|\n" + packet.bpcl.cargoRateGroups.map(r => `| ${r.cargoLabels.join(", ")} | ${r.foreignINRperMT} | ${r.coastalINRperMT} |`).join("\n"));
    for (const service of services.filter(s => s !== "cargo")) {
      const r = packet.bpcl.ancillaryRates.find(row => row.service === service)!;
      c.explanations.push(`${service}: foreign ${r.foreignCurrency}${r.foreignRate}/${r.unit}; coastal ${r.coastalCurrency}${r.coastalRate}/${r.unit}. ${r.actualServicePredicate}`);
    }
    return;
  }
  if (!c.period("2026-05-01")) return;
  for (const service of services) {
    if (service === "cargo") {
      const name = c.input.cargoName?.trim().toUpperCase().replace(/\s+/g, " ");
      if (!name) { c.questions.push("What exact commodity is being handled?"); continue; }
      const group = packet.bpcl.cargoRateGroups.find(r => r.cargoLabels.includes(name));
      if (!group || name.startsWith("OTHER A/B/C")) { c.blocked.push(`No exact approved commodity classification established for ${name.replace(/[|<>\n]/g, " ")}; no other liquid cargo rate substituted.`); continue; }
      if (!["exim", "coastal"].includes(c.input.cargoTraffic ?? "")) { c.questions.push("Is this cargo EXIM or coastal traffic?"); continue; }
      if (!c.input.cargoDirection) { c.questions.push("Is the cargo imported or exported?"); continue; }
      if (name === "CBFS" && c.input.cargoTraffic === "coastal" && c.input.cargoDirection === "export") { c.blocked.push("BPCL's current CBFS coastal-export material4195 rate is blank; no amount established."); continue; }
      const tonnes = c.number("cargoTonnes", "Cargo quantity in tariff metric tonnes", true, true); if (!tonnes) continue;
      const rate = c.input.cargoTraffic === "coastal" ? group.coastalINRperMT : group.foreignINRperMT;
      c.add(`cargo:bpcl:${name}:${c.input.cargoTraffic}:${c.input.cargoDirection}`, `${name} wharfage`, "INR", tonnes.mul(rate), `${tonnes} whole MT × INR${rate}/MT`);
    } else {
      const rule = packet.bpcl.ancillaryRates.find(r => r.service === service)!;
      const supplied = c.input.serviceQuantities?.filter(q => q.service === service) ?? [];
      if (supplied.length !== 1 || supplied[0].unit !== rule.unit) { c.questions.push(`${service}: provide one actual quantity in ${rule.unit}. ${rule.actualServicePredicate}`); continue; }
      const raw = supplied[0].quantity;
      if (!/^\d+(?:\.\d+)?$/.test(raw) || raw.length > 48 || !new D(raw).isInteger() || new D(raw).lte(0) || new D(raw).gt("1e12")) { c.questions.push(`${service}: positive whole ${rule.unit} quantity required; fractional measurement/rounding is not established in this branch.`); continue; }
      const status = c.status(); if (!status) continue;
      const rate = status === "foreign" ? rule.foreignRate : rule.coastalRate, currency = status === "foreign" ? rule.foreignCurrency : rule.coastalCurrency;
      c.add(`${service}:bpcl:${rule.unit}`, `BPCL ${service}`, currency, new D(raw).mul(rate), `${raw} ${rule.unit} × ${currency}${rate}/${rule.unit}; ${rule.actualServicePredicate}`);
    }
  }
}

/** Returns exactly the services claimed by this packet; caller retains all others. */
export async function publishedComponents(input: TariffInput, mode: Mode): Promise<{ handled: string[]; result: TariffResult } | undefined> {
  const port = input.port!, handled = new Set<string>(), results: Array<Promise<TariffResult>> = [];
  const take = (services: string[], run: (component: Components, selected: string[]) => void) => {
    const selected = input.charges.filter(s => services.includes(s) && !handled.has(s));
    if (!selected.length) return;
    selected.forEach(s => handled.add(s));
    // A group retains shared source/dependency scope: inward/outward towage,
    // KLL base+tax, aliases of one handling row and the composite cruise fee.
    // Unrelated groups never share unverified rows or source-check failures.
    results.push((async () => {
      const component = new Components({ ...input, charges: selected }, mode);
      try { run(component, selected); return await component.result(); }
      catch { return componentValidationFailure(selected); }
    })());
  };
  if (family.has(port) || port === "mumbai") take(["muc"], c => muc(c));
  if (family.has(port)) take(["pilotage", "towage"], c => pilotage(c, false));
  if (port === "mumbai" && input.vesselCategory !== "cruise") take(["pilotage", "towage"], c => pilotage(c, true));
  if (port === BMCT || port === NSIGT && input.service === "coastal") take(["berth"], c => operatorBerth(c, port === BMCT));
  if ([BMCT, NSIGT, NSICT, NSFT, GTI].includes(port)) take(["handling", "cargo"], c => containerHandling(c, port));
  if (port === "jaigarh" && (input.cargoCategory !== "mechanized-bulk" || input.charges.some(s => ["pilotage", "age-pilotage", "towage", "mooring", "environment", "pilot-attendance"].includes(s)))) take(["port-dues", "pilotage", "age-pilotage", "towage", "mooring", "environment", "pilot-attendance"], (c, services) => jaigarh(c, services));
  if (port === "konkan-lng-ltd" && input.charges.some(s => s === "berth" || s === "pilotage")) take(["berth", "pilotage", "gst"], (c, services) => kll(c, services));
  if (port === "mumbai-cruise-terminal" || port === "mumbai" && input.vesselCategory === "cruise") take(["cruise", "berth", "pilotage", "towage", "port-dues", "passenger-fee"], c => cruise(c));
  if (port === "bpcl-liquid-cargo-jetty") take(["cargo", ...packet.bpcl.ancillaryRates.map(r => r.service)], (c, services) => bpcl(c, services));
  return handled.size ? { handled: [...handled], result: combineTariffResults(await Promise.all(results)) } : undefined;
}

/** Fail closed only for the source/dependency group that could not validate.
 * Do not expose its amounts, pretend its services were zero, or silently
 * retry another tariff family. Validated siblings may still be displayed. */
export function componentValidationFailure(services: readonly string[], sourceClass: TariffResult["sourceClass"] = "official-tariff"): TariffResult {
  const names = services.map(service => service.replace(/[<>|\r\n]/g, " ")).join(", ");
  const message = `${names}: retained source or calculation validation failed. No amount from this affected group is published; its requested services remain unresolved.`;
  return { status: "error", sourceClass, body: message, questions: [], limitations: [message],
    issues: services.map(service => ({ kind: "source", code: "component-validation-failed", service, message })),
    applicability: { status: "unverified", currentTariffVerified: false, message } };
}

export function combineTariffResults(results: TariffResult[]): TariffResult {
  if (results.length === 1) return results[0];
  const totals = [...new Set(results.flatMap(r => r.totals?.map(t => t.currency) ?? []))].map(currency => {
    const rows = results.flatMap(r => r.totals?.filter(t => t.currency === currency) ?? []);
    const completeLines = rows.every(t => t.lineAmounts?.length && D.sum(...t.lineAmounts).eq(t.amount));
    return { currency, amount: D.sum(...rows.map(t => t.amount)).toString(), chargeIds: rows.flatMap(t => t.chargeIds), ...(completeLines ? { lineAmounts: rows.flatMap(t => t.lineAmounts!) } : {}), basis: rows.some(row => row.basis === "reference") ? "reference" as const : "component" as const };
  });
  const resolved = results.every(r => r.status === "calculated" && !r.questions.length);
  const reference = results.some(r => r.sourceClass === "published-reference" || r.totals?.some(t => t.basis === "reference"));
  const estimated = reference && results.every(r => ["calculated", "estimated"].includes(r.status) && !r.questions.length);
  const explained = results.every(r => r.status === "explained");
  return { status: estimated ? "estimated" : resolved ? "calculated" : explained ? "explained" : "unresolved", sourceClass: reference ? "published-reference" : "official-tariff", body: (estimated ? "**Reference estimate — current applicability unconfirmed.**\n\n" : resolved || explained ? "" : "**Requested estimate incomplete; only identified components are shown.**\n\n") + results.map(r => r.body).join("\n\n") + ((resolved || estimated) && totals.length ? `\n\nCombined ${estimated ? "reference" : "requested component"} subtotal: ${totals.map(t => amountText(t.currency, t.amount)).join(" + ")}.` : ""), questions: [...new Set(results.flatMap(r => r.questions))], limitations: [...new Set(results.flatMap(r => r.limitations ?? []))], issues: results.flatMap(r => r.issues ?? []), ...(totals.length ? { totals } : {}), sources: [...new Map(results.flatMap(r => r.sources ?? []).map(s => [s.url, s])).values()], applicability: { status: estimated ? "published-reference" : resolved ? "conditional-retained-rule" : explained ? "explanation-only" : "unverified", currentTariffVerified: false, sourceCheckedOn: packet.checkedOn, ...(reference ? { evidenceStatus: "mixed-unconfirmed" as const } : {}), message: "Each component retains its source and applicability limitations. A missing requested charge is not zero. Reference estimates cannot support a definitive price ranking." } };
}
