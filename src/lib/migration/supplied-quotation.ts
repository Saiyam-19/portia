import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { currentFacts, type CallContext } from "./call-context";
import { calculateChargeBatch } from "./calculator-batch";
import { operationAt } from "./request-semantics";

export type QuoteBinding = { runId: string; fence: number; revision: number; conversationId?: string };
type SourceRef = { id: string; role: string; start: number; end: number; raw: string; value: string };
type BoundValue = { value: string; sourceId: string };
type Limit = BoundValue & { scope: "block" | "call" };
type Charge = { id: "berth" | "pilotage"; currency: string; rate: BoundValue; unitSourceId: string;
  basis: "gt-period" | "movement"; periodHours?: BoundValue; rounding?: "started" | "exact";
  minimum?: Limit; maximum?: Limit; movements?: BoundValue; roundingSourceId?: string };
type Scenario = { id: string; label: string; hours: BoundValue; minutes?: BoundValue };
export type SuppliedQuotePlan = {
  version: 1; id: string; sourceClass: "user-supplied-quotation"; sourceHash: string;
  binding: QuoteBinding; gt: BoundValue; sources: SourceRef[]; charges: Charge[]; scenarios: Scenario[];
  exclusions: string[];
};
export type SuppliedQuoteLedger = {
  version: 1; quoteId: string; binding: QuoteBinding; sourceHash: string; sourceClass: "user-supplied-quotation";
  completeness: "scoped-complete"; allInPortInvoice: false; pending: string[]; excluded: string[];
  requestedChargeIds: string[]; sourceRefs: SourceRef[];
  lines: Array<{ id: string; scenarioId: string; scenario: string; chargeId: string; label: string; currency: string;
    exactAmount: string; displayAmount: string; formula: string; sourceIds: string[]; periods?: string }>;
  totals: Array<{ scenarioId: string; scenario: string; currency: string; itemIds: string[]; exactAmount: string; displayAmount: string }>;
  calculations: Array<{ id: string; expression: string; result: string }>;
};
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const numeric = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?";
const words: Record<string, string> = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20" };
const scalar = (raw: string) => words[raw.toLowerCase()] ?? new Decimal(raw.replaceAll(",", "")).toString();
const moneyPattern = new RegExp(`(USD|US\\$|INR|EUR|GBP|[$₹€£])\\s*(${numeric})`, "gi");
const currency = (raw: string) => ({ "US$": "USD", "₹": "INR", "€": "EUR", "£": "GBP" }[raw.toUpperCase()] ?? raw.toUpperCase());
const within = (value: string, positive = false) => { const n = new Decimal(value); return n.isFinite() && n.gte(positive ? "0.0000000001" : 0) && n.lte("1e18") && n.decimalPlaces() <= 20; };

/** A small source compiler for explicitly supplied quotation rules. It never
 * imports fixtures, invents a rate, reads a tariff or accepts a model expression.
 * Unsupported/mixed scopes stay on the existing agent path. */
export function prepareSuppliedQuotation(context: CallContext, binding: QuoteBinding): SuppliedQuotePlan | undefined {
  const text = context.latestText;
  if (!/\bquot(?:e|ation)\b/i.test(text) || !/\bno\b[^.!?\n]{0,180}\btax(?:es)?\b/i.test(text)) return;
  if (!/\b(?:calculate|calculation|total|breakdown|payable|arithmetic)\b/i.test(text)) return;
  if (/\b(?:remember|forget|recall|upload|guarantee|official|convert|exchange rate)\b/i.test(text)) return;
  if (/\b(?:towage|anchorage|wharfage|port dues|water supply|garbage|ISPS)\b/i.test(text)) return;
  const gtFacts = currentFacts(context).filter(f => f.field === "gt" && f.status === "established" && f.origin.text === text);
  if (gtFacts.length !== 1) return;
  const sources: SourceRef[] = [];
  // Successful extraction of numbers is insufficient: every clause must have
  // a supported interpretation. Mark only complete grammar productions; any
  // remaining words leave this compiler and preserve the existing agent path.
  const covered = new Uint8Array(text.length);
  const cover = (start: number, end: number) => covered.fill(1, start, end);
  const coverMatch = (m: RegExpMatchArray, offset = 0) => cover(offset + m.index!, offset + m.index! + m[0].length);
  const bind = (start: number, end: number, role: string, value?: string): BoundValue => {
    const raw = text.slice(start, end); const amount = value ?? scalar(raw);
    if (operationAt(text, start) === "reject" || /(?:[-−]|\bminus)\s*$/i.test(text.slice(0, start))) throw new Error("Rejected quoted quantity.");
    if (!within(amount)) throw new Error("Unsupported quoted quantity.");
    const id = `source_${sources.length + 1}`; sources.push({ id, role, start, end, raw, value: amount }); return { value: amount, sourceId: id };
  };
  const bindMatch = (m: RegExpMatchArray, group: number, role: string, offset = 0) => {
    const start = offset + m.index! + m[0].indexOf(m[group]); return bind(start, start + m[group].length, role);
  };
  try {
    const fact = gtFacts[0]; const gt = bind(fact.origin.start, fact.origin.end, "gross-tonnage", fact.value);
    if (!within(gt.value, true)) return;
    const gtTerms = [...text.matchAll(new RegExp(`(?:\\b(?:GT|GRT)\\s*:?\\s*${numeric}|${numeric}\\s*(?:GT|GRT)\\b)`, "gi"))];
    for (const m of gtTerms) if (m.index! <= fact.origin.start && m.index! + m[0].length >= fact.origin.end) coverMatch(m);
    const timeRounding = [...text.matchAll(/\bround\s+(?:the\s+)?(?:total\s+)?(?:berth\s+)?(?:stay|duration)\s+up\s+to\s+(?:(?:the\s+)?next\s+|the\s+)?whole\s+hour\b/gi)];
    if (timeRounding.length > 1) return;
    const rounding = timeRounding[0];
    const roundingSource = rounding ? bind(rounding.index!, rounding.index! + rounding[0].length, "berth-stay-rounding-to-whole-hour", "1") : undefined;
    if (rounding) coverMatch(rounding);
    const scenarios: Scenario[] = [];
    const rows = [...text.matchAll(new RegExp(`^\\s*([A-Za-z][A-Za-z0-9 _-]{0,39})[.:]\\s*(${numeric})\\s*hours?(?:\\s+and\\s+(${numeric})\\s*minutes?)?(?:\\s+exactly\\b)?`, "gmi"))];
    for (const [i, m] of rows.entries()) {
      scenarios.push({ id: `scenario_${i + 1}`, label: m[1].trim(), hours: bindMatch(m, 2, "stay-hours"), ...(m[3] ? { minutes: bindMatch(m, 3, "stay-minutes") } : {}) });
      coverMatch(m);
    }
    if (!scenarios.length) {
      const forward = [...text.matchAll(new RegExp(`\\b(?:alongside|stay|occupancy)\\s*(?:for|is|of|:)?\\s*(${numeric})\\s*hours?`, "gi"))];
      const reverse = [...text.matchAll(new RegExp(`(${numeric})\\s*hours?\\s+(?:alongside|stay|occupancy)\\b`, "gi"))];
      const times = [...forward, ...reverse];
      if (times.length !== 1) return;
      scenarios.push({ id: "scenario_1", label: "Quotation", hours: bindMatch(times[0], 1, "stay-hours") });
      coverMatch(times[0]);
    }
    if (scenarios.length > 8 || new Set(scenarios.map(s => s.label)).size !== scenarios.length) return;
    const headings = [...text.matchAll(/\b(berth[ -]hire|pilotage)\b/gi)];
    const charges: Charge[] = [];
    for (let i = 0; i < headings.length; i++) {
      const h = headings[i]; const start = h.index! + h[0].length; const end = headings[i + 1]?.index ?? text.length;
      const section = text.slice(start, end); const monies = [...section.matchAll(new RegExp(moneyPattern))];
      if (!monies.length) continue;
      const id = /^berth/i.test(h[0]) ? "berth" : "pilotage";
      if (charges.some(c => c.id === id)) return;
      const first = monies[0]; const rate = bindMatch(first, 2, `${id}-rate`, start); const cur = currency(first[1]);
      if (!/^\s*(?:is\s*|:\s*)?$/i.test(section.slice(0, first.index))) return;
      const after = section.slice(first.index! + first[0].length);
      let charge: Charge;
      if (id === "berth") {
        const unit = /^\s*(?:per|\/)\s*(?:GT|GRT)\b\s*(?:for\s+each\s+(?:started|commenced)\s+(\d+(?:\.\d+)?)[ -]*hours?(?:\s+blocks?)?|(?:per|\/)\s*hour\b(?:\s+or\s+part\s+thereof)?)/i.exec(after);
        if (!unit) return;
        const unitStart = start + first.index! + first[0].length;
        const period = unit[1] ? bindMatch(unit, 1, "billing-period-hours", unitStart) : bind(unitStart, unitStart + unit[0].length, "billing-period-hours", "1");
        if (!within(period.value, true)) return;
        // This explicit rounding production governs whole-hour berth stays.
        // Other units/stages need their own rules, not a global round/up hint.
        if (roundingSource && !new Decimal(period.value).eq(1)) return;
        cover(h.index!, unitStart + unit[0].length);
        charge = { id, currency: cur, rate, unitSourceId: period.sourceId, basis: "gt-period", periodHours: period,
          ...(roundingSource ? { roundingSourceId: roundingSource.sourceId } : {}),
          rounding: /started|commenced|part\s+thereof/i.test(unit[0]) || roundingSource ? "started" : "exact" };
      } else {
        const unit = /^\s*(?:for\s+each|per|\/)\s*movement\b/i.exec(after); if (!unit) return;
        const countPattern = new RegExp(`\\b(${numeric}|${Object.keys(words).join("|")})\\s+(?:movements?|moves)\\b`, "gi");
        const counts = [...text.matchAll(countPattern)].filter(m => !/\b(?:per|each)\s*$/i.test(text.slice(0, m.index)));
        if (counts.length !== 1) return;
        // An atom is a count only at a complete quantity-clause boundary.
        // E.g. the trailing 'one' in 'we have twenty one' is not a quantity.
        if (!/(?:^|[.;,:!?\n]|\bwe\s+have)\s*$/i.test(text.slice(0, counts[0].index))) return;
        const movements = bindMatch(counts[0], 1, "movement-count"); if (!new Decimal(movements.value).isInteger()) return;
        coverMatch(counts[0]);
        const unitStart = start + first.index! + first[0].length;
        const unitRef = bind(unitStart, unitStart + unit[0].length, "movement-unit", "1");
        cover(h.index!, unitStart + unit[0].length);
        charge = { id, currency: cur, rate, unitSourceId: unitRef.sourceId, basis: "movement", movements };
      }
      for (let j = 1; j < monies.length; j++) {
        if (id !== "berth" || currency(monies[j][1]) !== cur) return;
        const m = monies[j]; const left = section.slice(monies[j - 1].index! + monies[j - 1][0].length, m.index);
        const right = section.slice(m.index! + m[0].length, monies[j + 1]?.index ?? section.length);
        const beforeRole = /\b(minimum|maximum|cap)\s*$/i.exec(left)?.[1];
        const afterRole = /^\s*(minimum|maximum|cap)\b/i.exec(right)?.[1];
        const role = beforeRole ?? afterRole; if (!role) return;
        const roleStart = beforeRole ? start + m.index! - left.match(/(?:minimum|maximum|cap)\s*$/i)![0].length : start + m.index!;
        const scope = /^\s*(?:(?:minimum|maximum|cap)\s+)?(?:per\s+(?:call|visit|(?:billed\s+)?block)|for\s+each\s+(?:billed\s+)?(?:(\d+(?:\.\d+)?)[ -]*hours?[ -]*)?block)\b/i.exec(right);
        if (!scope) return;
        cover(roleStart, start + m.index! + m[0].length + scope[0].length);
        const wording = right.split(/[.!?\n]/)[0];
        const isCall = /\bper\s+(?:call|visit)\b/i.test(wording);
        const block = /(?:per\s+(?:billed\s+)?block|for\s+each\s+(?:billed\s+)?(?:(\d+(?:\.\d+)?)[ -]*hours?[ -]*)?block)/i.exec(wording);
        if (!isCall && !block || isCall && block) return;
        if (block?.[1]) {
          const repeated = bindMatch(block, 1, "minimum-maximum-period-hours", start + m.index! + m[0].length);
          if (!new Decimal(repeated.value).eq(charge.periodHours!.value)) return;
        }
        const value = bindMatch(m, 2, `${id}-${/minimum/i.test(role) ? "minimum" : "maximum"}`, start);
        const key = /minimum/i.test(role) ? "minimum" : "maximum";
        if (charge[key]) return;
        charge[key] = { ...value, scope: isCall ? "call" : "block" };
      }
      if (charge.minimum && charge.maximum && charge.minimum.scope === charge.maximum.scope && new Decimal(charge.minimum.value).gt(charge.maximum.value)) return;
      charges.push(charge);
    }
    if (!charges.length || !charges.some(c => c.id === "berth")) return;
    if ([...new Set(headings.map(h => /^berth/i.test(h[0]) ? "berth" : "pilotage"))].some(id => !charges.some(c => c.id === id))) return;
    if (new Set(charges.map(c => c.currency)).size !== 1) return;
    if (scenarios.length * (1 + charges.reduce((count, c) => count + (c.basis === "gt-period" ? 3 : 1), 0)) > 24) return;
    // Every numeric and monetary token must have a declared role. This excludes
    // partially compiled quotations instead of silently dropping another charge.
    const numericTokens = [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)];
    if (numericTokens.some(m => !sources.some(ref => ref.start <= m.index! && ref.end >= m.index! + m[0].length))) return;
    const allMoney = [...text.matchAll(new RegExp(moneyPattern))];
    if (allMoney.some(m => !sources.some(ref => ref.start >= m.index! && ref.end <= m.index! + m[0].length))) return;
    // Only neutral request/identity framing and explicit absence of adjustments
    // remain outside the compiled charge, limit, duration and quantity clauses.
    const framing = [
      /\b(?:please\s+)?check\s+our\s+agent[’']s\s+calculation\s+using\s+only\s+the\s+quotation\s+below\b/gi,
      /\b(?:please\s+)?check\s+this\s+(?:[A-Za-z][A-Za-z -]{0,80}\s+)?quote\s+for\s+(?:my|our|the)\s+(?:fictional\s+)?vessel\s+(?:MV\s+)?[A-Za-z][A-Za-z '-]{0,80}(?=\s*:)/gi,
      /\bcheck\s+a\s+quote\s+labelled\s+[A-Za-z][A-Za-z -]{0,100}\s+for\s+(?:fictional\s+)?(?:MV\s+)?[A-Za-z][A-Za-z '-]{0,80}(?=[.!?\n])/gi,
      /\b(?:supplied\s+)?quotation\b/gi,
      /\bno\s+(?:minimum\s+charge|discounts?|surcharges?|tax(?:es)?|other\s+charges)(?:(?:\s*,\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+)(?:minimum\s+charge|discounts?|surcharges?|tax(?:es)?|other\s+charges))*(?:\s+apply(?:\s+to\s+this\s+exercise)?)?\b/gi,
      /\b(?:what\s+is\s+(?:the\s+)?(?:breakdown\s+and\s+total|payable|total)|calculate(?:\s+the)?\s+total|calculate\s+separately\s+for|show\s+billable\s+hours\s+and\s+each\s+total)\b/gi,
      /\b(?:it\s+says|we\s+are|we\s+have|and(?:\s+a)?|with\s+a)\b/gi,
    ];
    for (const pattern of framing) for (const match of text.matchAll(pattern)) coverMatch(match);
    if (text.split("").some((char, index) => !covered[index] && !/[\s.,;:!?]/.test(char))) return;
    const sourceHash = digest(text);
    const plan = { version: 1 as const, sourceClass: "user-supplied-quotation" as const, sourceHash, binding: { ...binding }, gt, sources, charges, scenarios,
      exclusions: ["Taxes, as excluded by the quotation", "Unquoted services and charges"] };
    return { ...plan, id: digest(plan) };
  } catch { return; }
}

const display = (value: string) => {
  const [whole, fraction] = new Decimal(value).toFixed(2, Decimal.ROUND_HALF_UP).split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + fraction;
};
const amount = (currency: string, value: string) => `${currency} ${display(value)}`;
const quotedAmount = (currency: string, value: string) => `${currency} ${new Decimal(value).toString()}`;
const labelFor = (id: string) => id === "berth" ? "Berth hire" : "Pilotage";

export function calculateSuppliedQuotation(plan: SuppliedQuotePlan): SuppliedQuoteLedger {
  const { id, ...unsigned } = plan;
  if (digest(unsigned) !== id) throw new Error("Quotation bindings changed.");
  const expressions: Array<{ id: string; expression: string }> = [];
  const lines: SuppliedQuoteLedger["lines"] = []; const totals: SuppliedQuoteLedger["totals"] = [];
  const limit = (expression: string, charge: Charge, scope: "block" | "call") => {
    let result = expression;
    if (charge.minimum?.scope === scope) result = `max(${result},${charge.minimum.value})`;
    if (charge.maximum?.scope === scope) result = `min(${result},${charge.maximum.value})`;
    return result;
  };
  for (const scenario of plan.scenarios) {
    const itemIds: string[] = [];
    for (const charge of plan.charges) {
      const lineId = `${scenario.id}_${charge.id}`; const refs = [charge.rate.sourceId, charge.unitSourceId];
      let formula: string;
      if (charge.basis === "gt-period") {
        const periodId = `${lineId}_periods`; const unitId = `${lineId}_unit`;
        const duration = `(${scenario.hours.value}*60+${scenario.minutes?.value ?? "0"})`;
        const quotient = `${duration}/(${charge.periodHours!.value}*60)`;
        expressions.push({ id: periodId, expression: charge.rounding === "started" ? `ceil(${quotient})` : quotient });
        expressions.push({ id: unitId, expression: limit(`${plan.gt.value}*${charge.rate.value}`, charge, "block") });
        expressions.push({ id: lineId, expression: limit(`$${unitId}*$${periodId}`, charge, "call") });
        refs.push(plan.gt.sourceId, scenario.hours.sourceId, ...(scenario.minutes ? [scenario.minutes.sourceId] : []), ...(charge.minimum ? [charge.minimum.sourceId] : []), ...(charge.maximum ? [charge.maximum.sourceId] : []), ...(charge.roundingSourceId ? [charge.roundingSourceId] : []));
        formula = `${plan.gt.value} GT × ${quotedAmount(charge.currency, charge.rate.value)}/GT per ${charge.periodHours!.value}h ${charge.rounding === "started" ? "started block" : "period"}`;
        if (charge.minimum) formula += `; minimum ${quotedAmount(charge.currency, charge.minimum.value)}/${charge.minimum.scope}`;
        if (charge.maximum) formula += `; cap ${quotedAmount(charge.currency, charge.maximum.value)}/${charge.maximum.scope}`;
      } else {
        expressions.push({ id: lineId, expression: `${charge.rate.value}*${charge.movements!.value}` });
        refs.push(charge.movements!.sourceId); formula = `${amount(charge.currency, charge.rate.value)}/movement × ${charge.movements!.value} movements`;
      }
      itemIds.push(lineId);
      lines.push({ id: lineId, scenarioId: scenario.id, scenario: scenario.label, chargeId: charge.id, label: labelFor(charge.id), currency: charge.currency, exactAmount: "", displayAmount: "", formula, sourceIds: [...new Set(refs)] });
    }
    const totalId = `${scenario.id}_total`; expressions.push({ id: totalId, expression: itemIds.map(item => `$${item}`).join("+") });
    totals.push({ scenarioId: scenario.id, scenario: scenario.label, currency: plan.charges[0].currency, itemIds, exactAmount: "", displayAmount: "" });
  }
  const calculations = calculateChargeBatch(expressions);
  const result = new Map(calculations.map(c => [c.id, c.result]));
  for (const line of lines) {
    line.exactAmount = result.get(line.id)!; line.displayAmount = amount(line.currency, line.exactAmount);
    const periods = result.get(`${line.id}_periods`);
    if (periods !== undefined) { line.periods = periods; line.formula += `; billable periods ${new Decimal(periods).toString()}; amount/block ${amount(line.currency, result.get(`${line.id}_unit`)!)}`; }
  }
  for (const total of totals) { total.exactAmount = result.get(`${total.scenarioId}_total`)!; total.displayAmount = amount(total.currency, total.exactAmount); }
  return { version: 1, quoteId: plan.id, binding: plan.binding, sourceHash: plan.sourceHash, sourceClass: plan.sourceClass,
    completeness: "scoped-complete", allInPortInvoice: false, pending: [], excluded: plan.exclusions,
    requestedChargeIds: plan.charges.map(c => c.id), sourceRefs: plan.sources, lines, totals, calculations };
}

export function verifySuppliedQuotation(ledger: unknown, plan: SuppliedQuotePlan): ledger is SuppliedQuoteLedger {
  return digest(ledger) === digest(calculateSuppliedQuotation(plan));
}
export function renderSuppliedQuotation(ledger: SuppliedQuoteLedger): string {
  const sections: string[] = [];
  for (const total of ledger.totals) {
    const lines = ledger.lines.filter(l => l.scenarioId === total.scenarioId);
    const rows = lines.map(line => `| ${line.label} | ${line.displayAmount} |`);
    rows.push(`| **Total** | **${total.displayAmount}** |`);
    sections.push(`${ledger.totals.length > 1 ? `**${total.scenario}**\n\n` : ""}| Charge | Amount |\n|---|---:|\n${rows.join("\n")}\n\n${lines.map(line => `- **${line.label}:** ${line.formula}.`).join("\n")}`);
  }
  return `Based only on your supplied quotation — **not an official port tariff or guaranteed final invoice**.\n\n${sections.join("\n\n")}\n\nTaxes and unquoted charges are excluded as requested. Totals use unrounded line values; amounts are displayed to two decimal places (half-up).`;
}
