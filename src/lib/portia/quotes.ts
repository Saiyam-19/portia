import DecimalJs from "decimal.js";
const Decimal = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_UP });
import { z } from "zod";
import { calculateTariffExpression } from "../migration/calculator";
import { calculateElapsedTime } from "../migration/elapsed-time";
import { tariffInputSchema, tariffServiceSchema } from "./tariff-input";
import type { TariffResult } from "./tariff-types";
import { PORT_ALIASES } from "../migration/ports";

export const decimal = z.string().regex(/^\d+(?:\.\d+)?$/).max(40).refine(value => {
  const n = new Decimal(value); return n.isFinite() && n.lte("1e18") && n.decimalPlaces() <= 20;
}, "Quantity exceeds supported precision or size.");
const positive = decimal.refine(value => new Decimal(value).gt(0), "Must be positive.");
const name = z.string().trim().min(1).max(120);
export const currencySchema = z.enum(["USD", "INR", "EUR", "GBP"]);
const limit = z.object({ amount: decimal, per: z.enum(["block", "call"]) }).strict();
export const lineSchema = z.object({
  name, currency: currencySchema.optional(), amount: decimal.optional(), rate: decimal.optional(),
  unit: z.enum(["amount", "time", "gt-time", "movement", "tonne"]).optional(),
  perQuantity: positive.optional().describe("Rate denominator; e.g. 100 for a price per 100 GT. Defaults to one unit."),
  periodHours: positive.optional(), commenced: z.boolean().optional(),
  minimum: limit.optional(), maximum: limit.optional(),
  removeMinimum: z.boolean().optional().describe("True only when explicitly removing an existing supplied minimum."),
  removeMaximum: z.boolean().optional().describe("True only when explicitly removing an existing supplied maximum."),
}).strict();
export const callSchema = tariffInputSchema.omit({ charges: true, durationHours: true, durationMinutes: true }).extend({
  terminal: tariffInputSchema.shape.terminal.describe("Only an explicitly supplied physical terminal/berth; otherwise null. Preserve user-stated conflicts, never invent this field. At JSW Jaigarh, J-1 is a port-dues tariff item, not an established terminal name; do not copy that row label here."),
  vesselName: name.optional(), nt: positive.optional().describe("Only an explicitly supplied NT/NRT/net-tonnage value. Never copy GT/GRT into NT or infer a conversion. Leave null when only gross tonnage is supplied; current vessel lookup does not provide NT."), dwt: positive.optional().describe("Deadweight tonnes, distinct from GT/GRT, NT/NRT and cargo mass. Never copy another measurement into this field."), loa: positive.optional(), draught: positive.optional(), cargoTonnes: decimal.optional(),
  anchorageArrival: z.string().max(160).optional(), cargoCompleted: z.string().max(160).optional(), portDeparture: z.string().max(160).optional(),
  intervalStart: z.string().max(160).optional(), intervalEnd: z.string().max(160).optional(),
  occupancy: z.object({ hours: decimal.optional(), minutes: decimal.optional() }).strict().refine(value => value.hours !== undefined || value.minutes !== undefined, "Provide a duration.").optional().describe("Complete replacement duration in original components, not a partial component patch. For 13 hours 10 minutes pass hours 13 and minutes 10. Omitted components mean zero; include retained hours when correcting only minutes. Code converts units."),
  service: z.enum(["coastal", "foreign"]).optional(),
  vesselCategory: z.enum(["general-cargo", "container", "tanker", "ro-ro", "offshore-supply", "naval", "coast-guard", "passenger", "cruise", "other"]).optional(),
  cargoOperation: z.enum(["loading", "discharging", "both", "none"]).optional(),
  cargoTraffic: z.enum(["exim", "coastal", "transshipment"]).optional().describe("Cargo traffic, separately from vessel service. Explicit coastal handling/cargo means coastal; explicit foreign EXIM cargo means exim. Supply this for handling/MUC/wharfage when known; do not leave it null merely because service is also coastal/foreign."),
  handlingMode: z.enum(["road", "rail", "ship-yard"]).optional(),
  cargoCategory: z.enum(["mechanized-bulk", "nonmechanized-bulk", "container", "lpg-chemical", "iron-steel", "other"]).optional(),
  flag: name.optional().describe("Country name, e.g. India for Indian flag."),
}).strict();
export const termsSchema = z.object({
  taxPercent: decimal.refine(value => new Decimal(value).lte(100)).optional().describe("SUPPLIED quotations only: zero when explicitly excluded. For OFFICIAL pricing this MUST be null, even if the user says no tax or before GST. Official pre-tax scope means omit gst from services; never pass taxPercent, including zero."),
  rounding: z.object({ stage: z.enum(["line", "total"]), decimals: z.number().int().min(0).max(8) }).strict().optional(),
  removeRounding: z.boolean().optional().describe("True only when explicitly removing existing monetary rounding."),
  unresolvedTerms: z.array(z.string().min(1).max(400)).max(16).optional().describe("Only genuinely unresolved material conditions that prevent the requested calculation. Never put explicit exclusions, a confirmed base-only scope, no tax/no conversion, or ordinary confirmed facts here: represent included services and omit excluded ones. Every entry blocks the quotation. Use [] to clear previously mistaken unresolved terms."),
}).strict();
// Historical validated records can carry more uncertainty than a single new
// tool update. Preserve every issue instead of truncating it to the wire limit.
export const storedTermsSchema = termsSchema.extend({ unresolvedTerms: z.array(z.string().min(1).max(4000)).max(4096).optional() });
export const quoteInputSchema = z.object({
  quoteId: z.string().min(1).max(100).optional().describe("Returned saved quote ID. Required for corrections/follow-ups; omit only for a new quote."),
  name: name.optional().describe("Only an explicit user-given quotation label, e.g. Amber. Otherwise null; the server assigns a stable label. Never generate a title containing quantities, vessel facts or tariff conditions."), pricing: z.enum(["official", "supplied"]).optional(),
  vesselCategoryEvidence: z.string().min(1).max(2000).optional().describe("Required only for NEW/CHANGED call.vesselCategory: copy a verbatim current human phrase or sentence explicitly classifying THIS vessel; include its name when given. The server validates the entire containing clause, including subject and negation. Cargo type does not establish vessel category. Otherwise null. For a requested missing-category reply, copy the actual answer."),
  call: callSchema.optional(), services: z.array(z.string().min(1).max(80)).min(1).max(20).optional(),
  lines: z.array(lineSchema).min(1).max(16).optional().describe("For supplied prices only. On update pass just changed named lines; other lines are retained."),
  removeLines: z.array(name).max(16).optional(), terms: termsSchema.optional(),
}).strict().superRefine((input, context) => {
  if (input.pricing === "supplied" || !input.call?.port || input.call.terminal?.trim().replace(/[\s-]+/g, "").toLowerCase() !== "j1") return;
  const identity = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (!PORT_ALIASES.jaigarh.some(alias => identity(alias) === identity(input.call!.port!))) return;
  context.addIssue({ code: "custom", path: ["call", "terminal"], message: "J-1 is the port-dues tariff row in the retained JSW Jaigarh source; it does not establish a physical terminal. If terminal was inferred from this tariff-item label, retry with terminal:null and keep all other supplied facts. If the user explicitly claims a booked terminal of that name, preserve their statement and ask for the actual facility identity. No quote was saved from this rejected call." });
});
export type QuoteInput = z.infer<typeof quoteInputSchema>;
// Constrain newly generated tool arguments without invalidating existing
// saved receipts that used supported prose aliases for their service names.
export const quoteToolInputSchema = quoteInputSchema.safeExtend({
  services: z.array(tariffServiceSchema).min(1).max(20).optional().describe("Canonical requested charge families only. Container road/rail/ship-yard scope belongs in call.handlingMode, not extra services. Cargo wharfage is cargo. Rounding means an explicitly requested final-invoice rule, not price display formatting; omit it for an ordinary base/scheme unless requested. For a genuinely unlisted charge, include other and retain its exact unresolved description in terms.unresolvedTerms; never drop it."),
  call: callSchema.extend({
    callDate: tariffInputSchema.shape.callDate.refine(value => value === undefined || !/[;\r\n]/.test(value), "callDate must contain one date/time only, without semicolon-separated annotations. Copy the supplied date and keep event descriptions out of this field."),
  }).optional(),
});
export type QuoteLine = z.infer<typeof lineSchema>;
export type Quote = {
  id: string; revision: number; name: string; pricing: "official" | "supplied";
  call: z.infer<typeof callSchema>; services: string[]; lines: QuoteLine[]; terms: z.infer<typeof termsSchema>;
  unresolvedHistory?: string[];
  baseline?: { totals: QuoteResult["totals"]; lines: QuoteLine[]; imported?: boolean };
};
export type QuoteResult = Omit<TariffResult, "sourceClass" | "applicability"> & {
  sourceClass: TariffResult["sourceClass"] | "user-supplied-quotation"; applicability?: TariffResult["applicability"];
};
export const key = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
export const safe = (value: string) => value.replace(/[|\n\r<>]/g, " ");
export const money = (currency: string, value: string) => { const [whole, fraction] = new Decimal(value).toFixed(Math.max(2, new Decimal(value).decimalPlaces())).split("."); return `${currency} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`; };
export function callParticulars(quote: Quote) {
  const { occupancy, ...call } = quote.call;
  return { ...call, charges: quote.services,
    ...(occupancy ? { durationMinutes: new Decimal(occupancy.hours ?? 0).mul(60).plus(occupancy.minutes ?? 0).toString() } : {}) };
}
export function calculateSupplied(quote: Quote): QuoteResult {
  const questions = [...(quote.terms.unresolvedTerms ?? []), ...(quote.unresolvedHistory ?? [])];
  if (quote.call.otherAdjustments) questions.push("The stated adjustment needs its governing supplier terms; it cannot be silently omitted.");
  const lines: Array<{ name: string; currency: string; amount: string; formula: string }> = [];
  const call = callParticulars(quote);
  let duration = call.durationMinutes;
  if (call.berthStart && call.berthEnd) {
    const elapsed = calculateElapsedTime({ start: call.berthStart, end: call.berthEnd, timeZone: call.timeZone, dateOrder: call.dateOrder });
    if (elapsed.status !== "ok") questions.push(elapsed.message);
    else if (duration && !new Decimal(duration).eq(elapsed.elapsedMinutes)) questions.push("Stated occupancy conflicts with the berth timestamps; confirm the corrected interval.");
    else duration = elapsed.elapsedMinutes;
  }
  for (const line of quote.lines) {
    const { currency, amount, rate, unit } = line;
    const missing = (message: string) => questions.push(`${line.name}: ${message}`);
    if (!currency) { missing("which currency applies?"); continue; }
    if (amount !== undefined && rate !== undefined) { missing("is this a flat amount or a unit rate? Both were supplied."); continue; }
    if (amount === undefined && rate === undefined) { missing("what amount or supplier rate was quoted?"); continue; }
    if (line.minimum && line.maximum && line.minimum.per === line.maximum.per && new Decimal(line.minimum.amount).gt(line.maximum.amount)) { missing("minimum exceeds maximum; confirm the supplier's terms."); continue; }
    let expression = amount ?? rate!, formula = `${currency} ${amount ?? rate} supplied amount`;
    if (amount !== undefined && unit && unit !== "amount") { missing("flat amount has conflicting rate units."); continue; }
    if (amount === undefined && unit !== "amount") {
      if (!unit) { missing("what are the rate's units?"); continue; }
      if (unit === "time" || unit === "gt-time") {
        if (duration === undefined) { missing("what is the occupancy, or the full start/end timestamps?"); continue; }
        if (!line.periodHours || line.commenced === undefined) { missing("what is the billing period, and are part periods charged in full?"); continue; }
        if (unit === "gt-time" && !call.gt) { missing("what is the vessel's GT/GRT?"); continue; }
        const periods = calculateTariffExpression(`${line.commenced ? "ceil" : ""}(${duration}/(${line.periodHours}*60))`);
        let block = unit === "gt-time" ? `(${call.gt}/${line.perQuantity ?? "1"})*${rate}` : rate!;
        for (const [which, fn] of [["minimum", "max"], ["maximum", "min"]] as const) if (line[which]?.per === "block") block = `${fn}(${block},${line[which]!.amount})`;
        expression = `(${block})*${periods}`;
        formula = `${unit === "gt-time" ? `${call.gt} GT / ${line.perQuantity ?? "1"} × ` : ""}${currency} ${rate} per ${line.periodHours}-hour ${line.commenced ? "commenced" : "exact"} period; occupancy ${duration} minutes; billable periods ${periods}`;
      } else {
        const quantity = unit === "movement" ? call.movements : call.cargoTonnes;
        if (!quantity) { missing(`what is the ${unit === "movement" ? "movement count" : "cargo tonnage"}?`); continue; }
        if (unit === "movement" && !new Decimal(quantity).isInteger()) { missing("movement count must be an integer."); continue; }
        expression = `(${quantity}/${line.perQuantity ?? "1"})*${rate}`;
        formula = `${quantity} ${unit}s / ${line.perQuantity ?? "1"} × ${currency} ${rate}`;
      }
    }
    for (const [which, fn] of [["minimum", "max"], ["maximum", "min"]] as const) {
      const bound = line[which]; if (!bound) continue;
      if (bound.per === "block" && !["time", "gt-time"].includes(unit ?? "amount")) { missing(`${which} per block cannot apply to this line's units.`); continue; }
      if (bound.per === "call") expression = `${fn}(${expression},${bound.amount})`;
      formula += `; ${which} ${currency} ${bound.amount}/${bound.per}`;
    }
    if (quote.terms.rounding?.stage === "line") expression = `round(${expression},${quote.terms.rounding.decimals})`;
    lines.push({ name: line.name, currency, amount: calculateTariffExpression(expression), formula });
  }
  if (!quote.lines.length) questions.push("Which supplied quotation lines should be included?");
  const totals = [...new Set(lines.map(line => line.currency))].map(currency => {
    const amounts = lines.filter(line => line.currency === currency).map(line => line.amount);
    const subtotal = Decimal.sum(...amounts), tax = subtotal.mul(quote.terms.taxPercent ?? 0).div(100);
    let total = subtotal.plus(tax);
    if (quote.terms.rounding?.stage === "total") total = total.toDecimalPlaces(quote.terms.rounding.decimals, Decimal.ROUND_HALF_UP);
    return { currency, amount: total.toString(), chargeIds: lines.filter(line => line.currency === currency).map(line => key(line.name)).concat(quote.terms.taxPercent !== undefined ? ["supplied-tax"] : []).sort(), lineAmounts: [...amounts, ...(quote.terms.taxPercent !== undefined ? [tax.toString()] : [])], basis: "scoped-quote" as const };
  });
  const body = lines.length ? `**${safe(quote.name)} — user-supplied quotation**\n\n| Charge | Amount |\n|---|---:|\n${lines.map(line => `| ${safe(line.name)} | ${money(line.currency, line.amount)} |`).join("\n")}\n${totals.map(total => `| **${questions.length ? "Identified subtotal" : "Total of supplied lines"}** | **${money(total.currency, total.amount)}** |`).join("\n")}\n\n${lines.map(line => `- **${safe(line.name)}:** ${line.formula}.`).join("\n")}\n\n${quote.terms.taxPercent === undefined ? "No tax rate supplied; tax is outside this calculation." : new Decimal(quote.terms.taxPercent).eq(0) ? "No tax, as supplied." : `Supplied tax ${quote.terms.taxPercent}% included in each currency total.`} ${quote.terms.rounding ? `Half-up monetary rounding per ${quote.terms.rounding.stage}, ${quote.terms.rounding.decimals} decimals.` : "Exact monetary values; no monetary rounding."} Unquoted services excluded. These are supplied prices, not official tariff rates.` : "";
  return { status: lines.length ? "calculated" : "unresolved", sourceClass: "user-supplied-quotation", body, questions: [...new Set(questions)], totals, calculation: { lines } };
}

export function quoteChanges(quote: Quote, result: QuoteResult): string {
  if (!quote.baseline || result.status !== "calculated" || !result.totals?.length || result.questions.length) return "";
  const baseline = quote.baseline;
  const changes = result.totals.flatMap(total => {
    const original = baseline.totals?.find(row => row.currency === total.currency);
    if (!original || new Decimal(total.amount).eq(original.amount)) return [];
    const difference = new Decimal(total.amount).minus(original.amount);
    return [`${difference.gte(0) ? "Increase" : "Decrease"} from ${baseline.imported ? "imported saved" : "original"} quotation: **${money(total.currency, difference.abs().toString())}** (${money(total.currency, original.amount)} → ${money(total.currency, total.amount)}).`];
  });
  const unchanged = quote.lines.filter(line => {
    const before = baseline.lines.filter(item => item.currency === line.currency).findIndex(item => key(item.name) === key(line.name));
    const after = quote.lines.filter(item => item.currency === line.currency).findIndex(item => key(item.name) === key(line.name));
    const original = baseline.totals?.find(total => total.currency === line.currency)?.lineAmounts?.[before];
    const current = result.totals?.find(total => total.currency === line.currency)?.lineAmounts?.[after];
    return original !== undefined && current !== undefined && new Decimal(original).eq(current);
  }).map(line => safe(line.name));
  if (changes.length && unchanged.length) changes.push(`Unchanged amounts: ${unchanged.join(", ")}.`);
  return changes.length ? "\n\n" + changes.join("\n\n") : "";
}
