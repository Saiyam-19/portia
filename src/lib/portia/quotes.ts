import DecimalJs from "decimal.js";
const Decimal = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_UP });
import { z } from "zod";
import { calculateExactExpression } from "./exact-expression";
import { addRational, compareRational, divideRational, exactValue, finiteDecimal, multiplyRational, rational, roundRational, sameExact, subtractRational, sumExact } from "./fx-conversion";
import { calculateElapsedTime } from "../migration/elapsed-time";
import { tariffInputSchema, tariffServiceSchema } from "./tariff-input";
import type { TariffResult } from "./tariff-types";
import { PORT_ALIASES } from "../migration/ports";

export const decimal = z.string().regex(/^\d+(?:\.\d+)?$/).max(40).refine(value => {
  const n = new Decimal(value); return n.isFinite() && n.lte("1e18") && n.decimalPlaces() <= 20;
}, "Quantity exceeds supported precision or size.");
const positive = decimal.refine(value => new Decimal(value).gt(0), "Must be positive.");
const name = z.string().trim().min(1).max(120);
// Node/browser ICU exposes its retained ISO 4217 currency catalog. The wire
// shape remains any uppercase three-letter code so an unknown user value can
// be preserved and reported, rather than replaced with a familiar currency.
export const currencyCodeCatalog = new Set(Intl.supportedValuesOf("currency"));
export const currencySchema = z.string().regex(/^[A-Z]{3}$/, "Use the supplied uppercase three-letter currency code.");
export const knownCurrencyCode = (value: string): boolean => currencyCodeCatalog.has(value);
const limit = z.object({ amount: decimal, per: z.enum(["block", "call"]), basis: z.enum(["unit", "line"]).optional().describe("Required when a time line has multiple resources: unit applies the bound to each resource before multiplication; line applies it to the combined line.") }).strict();
const duration = z.object({ hours: decimal.optional(), minutes: decimal.optional() }).strict()
  .refine(value => value.hours !== undefined || value.minutes !== undefined, "Provide a duration component; explicit zero is retained.");
export const lineFieldSchema = z.enum(["billing", "price", "currency", "quantity", "quantityLabel", "duration", "periodHours", "commenced", "perQuantity", "movements", "perMovements", "resourceQuantity", "resourceLabel", "perResourceQuantity", "percent", "baseLines", "minimum", "maximum", "minimumDurationHours", "statedExtension"]);
export type LineField = z.infer<typeof lineFieldSchema>;
export const lineSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  coverage: z.array(name).min(1).max(16).optional(),
  name, currency: currencySchema.optional().describe("Original uppercase three-letter currency code. Preserve unknown codes for explicit resolution."), amount: decimal.optional(), rate: decimal.optional(),
  amountBasis: z.literal("user-stated-flat").optional(),
  billingScope: z.literal("line").optional().describe("Present on new typed line billing. Omitted historical lines retain legacy call-wide quantity fallback."),
  unit: z.enum(["amount", "time", "gt-time", "movement", "tonne", "tonne-movement", "quantity", "percentage"]).optional(),
  movements: decimal.optional(), perMovements: positive.optional(),
  perQuantity: positive.optional().describe("Rate denominator; e.g. 100 for a price per 100 GT. Defaults to one unit."),
  periodHours: positive.optional(), commenced: z.boolean().optional(),
  quantity: decimal.optional(), quantityLabel: name.optional(), duration: duration.optional(), minimumDurationHours: positive.optional(),
  resourceQuantity: decimal.optional(), resourceLabel: name.optional(), perResourceQuantity: positive.optional(),
  percent: decimal.optional(), baseLines: z.array(name).min(1).max(16).optional(),
  statedExtension: decimal.optional().describe("Non-authoritative stated extension checked against backend arithmetic after explicit line rounding."),
  minimum: limit.optional(), maximum: limit.optional(),
  removeMinimum: z.boolean().optional().describe("True only when explicitly removing an existing supplied minimum."),
  removeMaximum: z.boolean().optional().describe("True only when explicitly removing an existing supplied maximum."),
  removeMinimumDuration: z.boolean().optional(), removeStatedExtension: z.boolean().optional(),
  unresolvedFields: z.array(lineFieldSchema).min(1).max(18).optional(),
}).strict();

const billingBase = { price: decimal.optional().describe("Original supplied price when known. Omit when unknown; code never invents zero.") };
export const billingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("flat"), ...billingBase, basis: z.literal("user-stated-flat") }).strict(),
  z.object({ kind: z.literal("time"), ...billingBase, periodHours: positive.optional(), commenced: z.boolean().optional(), duration: duration.optional(), resourceQuantity: decimal.optional().describe("Independent count of resources each billed for the stated duration."), resourceLabel: name.optional(), perResourceQuantity: positive.optional() }).strict(),
  z.object({ kind: z.literal("gt-time"), ...billingBase, periodHours: positive.optional(), commenced: z.boolean().optional(), duration: duration.optional(), perQuantity: positive.optional().describe("GT denominator only."), resourceQuantity: decimal.optional().describe("Independent resource count, separate from GT."), resourceLabel: name.optional(), perResourceQuantity: positive.optional() }).strict(),
  z.object({ kind: z.literal("movement"), ...billingBase, quantity: decimal.optional(), perQuantity: positive.optional() }).strict(),
  z.object({ kind: z.literal("tonne"), ...billingBase, quantity: decimal.optional(), perQuantity: positive.optional() }).strict(),
  z.object({ kind: z.literal("tonne-movement"), ...billingBase, quantity: decimal.optional().describe("Original tonnes, not tonnes multiplied by movements."), movements: decimal.optional(), perQuantity: positive.optional(), perMovements: positive.optional() }).strict(),
  z.object({ kind: z.literal("quantity"), ...billingBase, quantity: decimal.optional(), quantityLabel: name, perQuantity: positive.optional() }).strict(),
  z.object({ kind: z.literal("percentage"), percent: decimal.optional().describe("Explicit supplied percentage, including zero; not a precomputed price."), baseLines: z.array(name).min(1).max(16).optional().describe("Exact named charge lines forming the percentage base.") }).strict(),
]);
export const commandLineSchema = z.object({
  lineId: z.string().min(1).max(100).optional().describe("Returned stable line ID for correction/rename; omit for new lines."),
  coverage: z.array(name).min(1).max(16).optional().describe("Explicit supplied service coverage, separate from charge label and tax. Do not infer equivalence from similar labels."),
  name, currency: currencySchema.optional().describe("Copy the original uppercase three-letter currency code. Do not substitute a familiar currency for an unknown code."),
  billing: billingSchema.optional().describe("Complete typed billing recipe for a new line or explicit unit/kind replacement. Omit on ordinary price-only correction."),
  price: decimal.optional().describe("Price-only correction for an existing line. Preserves its billing kind, quantities, durations, currency and constraints."),
  minimumDurationHours: positive.optional().describe("Minimum billable duration in hours, distinct from a monetary minimum."),
  removeMinimumDuration: z.boolean().optional().describe("True only when explicitly removing an existing minimum billable duration."),
  statedExtension: decimal.optional().describe("Human-stated or pre-rounded extension used only to check backend arithmetic; never arithmetic authority."),
  removeStatedExtension: z.boolean().optional(),
  minimum: limit.optional().describe("Monetary minimum in the line currency."), maximum: limit.optional().describe("Monetary maximum in the line currency."),
  removeMinimum: z.boolean().optional(), removeMaximum: z.boolean().optional(),
  clearFields: z.array(lineFieldSchema).min(1).max(18).optional().describe("Explicitly withdraw these line facts to unknown; never zero, default one, or no bound. Use current human scopeChangeEvidence. Null preserves fields."),
}).strict().superRefine((line, context) => {
  const issue = (field: keyof typeof line, message: string) => context.addIssue({ code: "custom", path: [field], message });
  if (line.billing && line.price !== undefined) issue("price", "Use a complete billing recipe or a price-only correction, not both.");
  if (line.minimumDurationHours !== undefined && line.removeMinimumDuration) issue("removeMinimumDuration", "Cannot set and remove minimum billable duration together.");
  if (line.statedExtension !== undefined && line.removeStatedExtension) issue("removeStatedExtension", "Cannot set and remove the stated extension together.");
  if (line.minimum && line.removeMinimum) issue("removeMinimum", "Cannot set and remove the monetary minimum together.");
  if (line.maximum && line.removeMaximum) issue("removeMaximum", "Cannot set and remove the monetary maximum together.");
  if (line.billing?.kind === "flat" && line.statedExtension !== undefined) issue("statedExtension", "A flat supplier-stated amount is already the extension; statedExtension is only a check for backend-derived billing.");
  if (line.billing && !["time", "gt-time"].includes(line.billing.kind) && line.minimumDurationHours !== undefined) issue("minimumDurationHours", "Minimum billable duration applies only to time billing.");
  if (line.billing && !["time", "gt-time"].includes(line.billing.kind) && [line.minimum?.per, line.maximum?.per].includes("block")) issue("minimum", "Per-block monetary bounds require time billing.");
  for (const field of line.clearFields ?? []) if (explicitLineFields(line).has(field)) issue("clearFields", `Cannot set/remove and withdraw ${field} together.`);
});

function explicitLineFields(line: { currency?: string; price?: string; billing?: object; minimum?: object; maximum?: object; minimumDurationHours?: string; statedExtension?: string; removeMinimum?: boolean; removeMaximum?: boolean; removeMinimumDuration?: boolean; removeStatedExtension?: boolean }): Set<LineField> {
  const fields = new Set<LineField>();
  if (line.currency !== undefined) fields.add("currency");
  if (line.price !== undefined) fields.add("price");
  if (line.billing) {
    fields.add("billing");
    for (const [key, value] of Object.entries(line.billing)) if (value !== undefined && lineFieldSchema.safeParse(key).success) fields.add(key as LineField);
  }
  for (const field of ["minimum", "maximum", "minimumDurationHours", "statedExtension"] as const) if (line[field] !== undefined) fields.add(field);
  if (line.removeMinimum) fields.add("minimum");
  if (line.removeMaximum) fields.add("maximum");
  if (line.removeMinimumDuration) fields.add("minimumDurationHours");
  if (line.removeStatedExtension) fields.add("statedExtension");
  return fields;
}

export function lineFieldApplies(field: LineField, kind?: string): boolean {
  if (["billing", "price", "currency", "minimum", "maximum"].includes(field)) return field !== "price" || kind !== "percentage";
  if (field === "statedExtension") return kind !== "flat";
  if (["duration", "periodHours", "commenced", "resourceQuantity", "resourceLabel", "perResourceQuantity", "minimumDurationHours"].includes(field)) return kind === "time" || kind === "gt-time";
  if (field === "perQuantity") return ["gt-time", "movement", "tonne", "tonne-movement", "quantity"].includes(kind ?? "");
  if (field === "quantity") return ["movement", "tonne", "tonne-movement", "quantity"].includes(kind ?? "");
  if (field === "movements" || field === "perMovements") return kind === "tonne-movement";
  if (field === "quantityLabel") return kind === "quantity";
  return kind === "percentage";
}

/** Server-created markers prevent withdrawn facts from regaining defaults after reload. */
export function applyLineFieldPatches(previous: QuoteLine | undefined, patch: CommandLine, line: QuoteLine): QuoteLine {
  const kind = line.amount !== undefined || line.unit === "amount" || line.amountBasis ? "flat" : line.unit;
  const unresolved = new Set((previous?.unresolvedFields ?? []).filter(field => lineFieldApplies(field, kind)));
  for (const field of explicitLineFields(patch)) unresolved.delete(field);
  for (const field of patch.clearFields ?? []) {
    unresolved.add(field);
    if (field === "price") { delete line.amount; delete line.rate; }
    else if (field !== "billing") delete (line as unknown as Record<string, unknown>)[field];
  }
  if (unresolved.size) line.unresolvedFields = [...unresolved].sort();
  else delete line.unresolvedFields;
  return line;
}
export const callSchema = tariffInputSchema.omit({ charges: true, durationHours: true, durationMinutes: true }).extend({
  supplier: name.optional().describe("Supplier/issuer of the quotation, separate from the physical operator."),
  chargingAuthority: name.optional(),
  facilityId: tariffInputSchema.shape.facilityId.describe("Canonical catalog facility ID selected from the provided catalog only when the raw booked identity fields uniquely ground it. Preserve the original port/terminal/operator wording alongside it. Omit for unknown, ambiguous or conflicting identities."),
  terminal: tariffInputSchema.shape.terminal.describe("Only an explicitly supplied physical terminal/berth; otherwise null. Preserve user-stated conflicts, never invent this field. At JSW Jaigarh, J-1 is a port-dues tariff item, not an established terminal name; do not copy that row label here."),
  reference: z.string().trim().min(1).max(240).optional().describe("SUPPLIED quotations only: exact human-provided quotation, case, file, voyage or other reference identifier. Copy it verbatim; never generate one."),
  context: z.string().trim().min(1).max(1000).optional().describe("SUPPLIED quotations only: concise verbatim human-provided context needed to identify or interpret this quotation. Do not summarize or import context from an independent tariff request."),
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
  taxStatus: z.enum(["unknown", "excluded", "included", "additional", "exempt"]).optional().describe("Supplier tax presentation only; never service coverage. Missing means unknown. Additional requires a rate; included means supplied prices already include tax."),
  taxPercent: decimal.refine(value => new Decimal(value).lte(100)).optional().describe("Explicit supplier tax rate, including explicit zero. Exclusion is taxStatus, not an invented zero rate. Official pricing never takes a supplied tax rate."),
  statedTotals: z.array(z.object({currency:currencySchema,amount:decimal}).strict()).min(1).max(16).optional().describe("Original supplier-asserted totals, checked against computed totals. Never fill with model arithmetic."),
  removeStatedTotals: z.boolean().optional(),
  rounding: z.object({ stage: z.enum(["line", "total"]), decimals: z.number().int().min(0).max(8) }).strict().optional(),
  removeRounding: z.boolean().optional().describe("True only when explicitly removing existing monetary rounding."),
  unresolvedTerms: z.array(z.string().min(1).max(400)).max(16).optional().describe("Only genuinely unresolved material conditions that prevent the requested calculation. Never put explicit exclusions, a confirmed base-only scope, no tax/no conversion, or ordinary confirmed facts here: represent included services and omit excluded ones. Every entry blocks the quotation. Use [] to clear previously mistaken unresolved terms."),
  unsupportedServices: z.array(z.string().trim().min(1).max(400)).max(20).optional().describe("Exact requested charge descriptions with no canonical service. Preserved across retries; omission or [] never removes them. Use removeUnsupportedServices only for an explicit scope correction."),
}).strict();
// Historical validated records can carry more uncertainty than a single new
// tool update. Preserve every issue instead of truncating it to the wire limit.
export const storedTermsSchema = termsSchema.extend({ unresolvedTerms: z.array(z.string().min(1).max(4000)).max(4096).optional() });
export const quoteInputSchema = z.object({
  quoteId: z.string().min(1).max(100).optional().describe("Returned saved quote ID. Required for corrections/follow-ups; omit only for a new quote."),
  name: name.optional().describe("Preserve the explicitly supplied quotation name or display label verbatim, including punctuation. Distinct from an external purchase-order/reference number: preserve both when supplied. Use null only when no name/label was given; the server then assigns one."), pricing: z.enum(["official", "supplied"]).optional(),
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
  services: z.array(tariffServiceSchema).min(1).max(20).optional().describe("Canonical requested charge families. Adds to saved scope; omitted services remain included. For an unlisted charge include other plus its exact description in terms.unsupportedServices. Explicit removals use removeServices. Road/rail is call.handlingMode; cargo wharfage is cargo. Rounding means an explicitly requested final-invoice rule, not display formatting."),
  call: callSchema.extend({
    callDate: tariffInputSchema.shape.callDate.refine(value => value === undefined || !/[;\r\n]/.test(value), "callDate must contain one date/time only, without semicolon-separated annotations. Copy the supplied date and keep event descriptions out of this field."),
  }).optional(),
});
// One strict function schema: conditional operation rules are validated
// after nullable wire fields are normalized. Historical receipt schemas above
// remain unchanged; old receipts do not acquire defaults or a different hash.
export const quoteCommandSchema = quoteToolInputSchema.safeExtend({
  lines: z.array(commandLineSchema).min(1).max(16).optional().describe("Named supplied lines. New pricing or a unit change uses billing; an ordinary correction uses price. Omission retains the saved line."),
  action: z.enum(["create", "update", "read"]).describe("Create a new quotation, patch a returned saved ID, or read without changing anything."),
  readScope: z.enum(["current-chat", "cross-chat"]).optional().describe("Required for read. Current chat reads saved quotations; cross-chat reads exact remembered facts, never imports them as current quote terms."),
  reference: z.string().trim().min(1).max(240).optional().describe("Read selector only: exact saved quotation name or supplier reference. Omit to list current-chat quotes. Cross-chat reads return saved facts."),
  reporting: z.object({ stage: z.enum(["line", "total"]), decimals: z.number().int().min(0).max(8) }).strict().optional().describe("Current-chat read only: requested display precision, half-up. First create/prepare the quote, then read its ID with reporting. This view never changes source amounts, invoice rules, saved terms, baselines or comparisons and needs no additional approval."),
  removeServices: z.array(z.string().min(1).max(80)).min(1).max(20).optional().describe("Explicitly removed canonical service or exact stored legacy service name."),
  removeUnsupportedServices: z.array(z.string().min(1).max(400)).min(1).max(20).optional(),
  clearCallFields: z.array(callSchema.keyof()).min(1).max(20).optional().describe("Explicitly withdrawn/replaced saved particulars, such as an obsolete terminal after a corrected booking. Null merely preserves a field. Never clear an inconvenient fact to fit a tariff."),
  scopeChangeEvidence: z.string().min(1).max(2000).optional().describe("For removed services or cleared particulars, copy the current human correction. Never remove a charge or fact to make an unresolved calculation pass."),
  reviewGroup: z.string().trim().min(1).max(80).optional().describe("Optional user-requested separate review group. Omit to review staged work together."),
  retryOf: z.string().min(1).max(100).optional().describe("Returned errorId for this same failed operation. Resolve unknown quotation targets through read_quotes first."),
}).superRefine((input, context) => {
  const issue = (field: string, message: string) => context.addIssue({ code: "custom", path: [field], message });
  if (input.action === "read") {
    if (!input.readScope) issue("readScope", "Choose current-chat or cross-chat for a read.");
    for (const field of Object.keys(input)) if (!["action", "readScope", "quoteId", "reference", "reporting", "retryOf"].includes(field)) issue(field, "A read cannot contain quotation changes.");
    if (input.readScope === "cross-chat" && (input.quoteId || input.reference)) issue("readScope", "Cross-chat recall reads memory facts; current quotation selectors do not apply.");
    if (input.readScope === "cross-chat" && input.reporting) issue("reporting", "Reporting precision applies to current quotations, not historical memory.");
    if (input.quoteId && input.reference) issue("reference", "Select a quotation by ID or exact reference, not both.");
    return;
  }
  if (input.readScope || input.reference) issue("readScope", "Read selectors cannot be used with a write.");
  if (input.reporting) issue("reporting", "Reporting is a read-only view. Create/prepare the quotation first, then read its returned ID with reporting precision.");
  if (input.action === "create") {
    if (input.quoteId) issue("quoteId", "Creation cannot target an existing quote ID.");
    if (!input.pricing) issue("pricing", "Creation requires official or supplied pricing.");
    if (input.removeServices || input.removeUnsupportedServices || input.removeLines || input.clearCallFields) issue("action", "Creation has no saved components to remove.");
  } else if (!input.quoteId) issue("quoteId", "Update requires a returned saved quotation ID.");
  if (input.pricing === "supplied" && input.services) issue("services", "Supplied quotation scope consists of named lines, including unpriced requested lines; services is for official tariff families only. Preserve every requested supplied charge in lines.");
  if ((input.removeServices?.length || input.removeUnsupportedServices?.length || input.clearCallFields?.length) && !input.scopeChangeEvidence) issue("scopeChangeEvidence", "Scope/fact removal requires the current human correction; omission never removes it.");
  if (input.lines?.some(line => line.clearFields?.length) && !input.scopeChangeEvidence) issue("scopeChangeEvidence", "Withdrawing line facts requires the current human correction.");
  for (const field of input.clearCallFields ?? []) if (input.call?.[field] !== undefined) issue("clearCallFields", "Cannot supply and clear the same particular.");
  if (input.services?.some(service => input.removeServices?.includes(service))) issue("removeServices", "Cannot include and remove the same charge.");
  if (input.services?.includes("other") && !input.terms?.unsupportedServices?.length) issue("terms", "Retain the exact unlisted charge description in unsupportedServices.");
});
export type QuoteCommand = z.infer<typeof quoteCommandSchema>;
export type CommandLine = z.infer<typeof commandLineSchema>;
export type QuoteLine = z.infer<typeof lineSchema>;
export type Quote = {
  id: string; revision: number; name: string; pricing: "official" | "supplied";
  call: z.infer<typeof callSchema>; services: string[]; lines: QuoteLine[]; terms: z.infer<typeof termsSchema>;
  unresolvedHistory?: string[];
  baseline?: { totals: QuoteResult["totals"]; lines: QuoteLine[]; imported?: boolean };
};
export type QuoteResult = Omit<TariffResult, "sourceClass" | "applicability"> & {
  sourceClass: TariffResult["sourceClass"] | "user-supplied-quotation"; applicability?: TariffResult["applicability"];
  reporting?: { status: "reported" | "unavailable"; stage: "line" | "total"; decimals: number; totals: Array<{ currency: string; exactAmount: string; amount: string }>; issues?: string[] };
};
export const key = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
export const safe = (value: string) => value.replace(/\\/g, "\\\\").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/([|`*_[\]#!])/g, "\\$1").replace(/[\n\r]+/g, " ");
export function quoteMetadata(quote: Pick<Quote, "call">): string {
  const fields = [["Supplier", quote.call.supplier], ["Supplier reference", quote.call.reference], ["Port", quote.call.port], ["Terminal", quote.call.terminal], ["Operator", quote.call.operator], ["Charging authority", quote.call.chargingAuthority], ["Vessel", quote.call.vesselName], ["Context", quote.call.context]];
  const lines = fields.flatMap(([label, value]) => value ? [`${label}: ${safe(value)}`] : []);
  return lines.length ? lines.join("\n\n") + "\n\n" : "";
}
export const money = (currency: string, value: string) => {
  const exact = rational(value), decimalValue = finiteDecimal(exact);
  if (decimalValue === undefined) return `${currency} ${exact.numerator}/${exact.denominator} (exact)`;
  const [whole, fraction = ""] = decimalValue.split(".");
  return `${currency} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0")}`;
};
export function callParticulars(quote: Quote) {
  const { occupancy, ...call } = quote.call;
  return { ...call, charges: quote.services,
    ...(occupancy ? { durationMinutes: exactValue(addRational(multiplyRational(rational(occupancy.hours ?? "0"), rational("60")), rational(occupancy.minutes ?? "0"))) } : {}) };
}
export function calculateSupplied(quote: Quote, selectedLineIds?: readonly string[], taxBasis: "as-supplied" | "before-tax" = "as-supplied"): QuoteResult {
  const questions = [...(quote.terms.unresolvedTerms ?? []), ...(quote.unresolvedHistory ?? [])];
  if (quote.call.otherAdjustments) questions.push("The stated adjustment needs its governing supplier terms; it cannot be silently omitted.");
  // Unscoped governing uncertainty cannot coexist with trusted derived effects.
  // Preserve recipes for continuation; only raw stated amounts form a known sum.
  const unscopedUncertainty = questions.length > 0;
  const taxPercent = taxBasis === "before-tax" || unscopedUncertainty || ["unknown","excluded","included","exempt"].includes(quote.terms.taxStatus ?? "") ? undefined : quote.terms.taxPercent;
  if (taxBasis === "before-tax" && quote.terms.taxStatus === "included" && quote.terms.taxPercent === undefined) questions.push("Tax-inclusive prices need the supplied tax rate to derive a before-tax view.");
  if (taxBasis === "before-tax" && (quote.terms.taxStatus === "unknown" || !quote.terms.taxStatus && quote.terms.taxPercent === undefined)) questions.push("Confirm whether the supplied prices include tax before deriving a before-tax view.");
  if (quote.terms.taxStatus === "additional" && quote.terms.taxPercent === undefined) questions.push("What additional tax rate applies?");
  if (quote.terms.taxStatus === "exempt" && quote.terms.taxPercent !== undefined && !sameExact(quote.terms.taxPercent,"0")) questions.push("Exempt tax status conflicts with the supplied nonzero tax rate.");
  const partialSelection = selectedLineIds !== undefined && selectedLineIds.length !== quote.lines.length;
  const rounding = unscopedUncertainty || (partialSelection || taxBasis === "before-tax") && quote.terms.rounding?.stage === "total" ? undefined : quote.terms.rounding;
  type CalculatedLine = { name: string; currency: string; amount: string; formula: string };
  const calculated: Array<CalculatedLine | undefined> = new Array(quote.lines.length);
  const states = new Array<number>(quote.lines.length).fill(0);
  const call = callParticulars(quote);
  let duration = call.durationMinutes;
  if (call.berthStart && call.berthEnd) {
    const elapsed = calculateElapsedTime({ start: call.berthStart, end: call.berthEnd, timeZone: call.timeZone, dateOrder: call.dateOrder });
    if (elapsed.status !== "ok") questions.push(elapsed.message);
    else {
      const exactMinutes = exactValue(divideRational(rational((BigInt(Date.parse(elapsed.endUtc)) - BigInt(Date.parse(elapsed.startUtc))).toString()), rational("60000")));
      if (duration && !sameExact(duration, exactMinutes)) questions.push("Stated occupancy conflicts with the berth timestamps; confirm the corrected interval.");
      else duration = exactMinutes;
    }
  }
  const indexes = new Map(quote.lines.map((line, index) => [key(line.name), index]));
  const evaluateLine = (index: number): CalculatedLine | undefined => {
    if (states[index] === 2) return calculated[index];
    const line = quote.lines[index];
    const missing = (message: string) => questions.push(`${line.name}: ${message}`);
    if (states[index] === 1) { missing("percentage base dependency is cyclic; select acyclic named base lines."); return; }
    states[index] = 1;
    const { currency, amount, rate, unit } = line;
    const finish = (value?: CalculatedLine) => { calculated[index] = value; states[index] = 2; return value; };
    if (line.unresolvedFields?.length) {
      for (const field of line.unresolvedFields) missing(`${field} was explicitly withdrawn and remains unknown; provide the governing value before calculating this line.`);
      return finish();
    }
    if (!currency) { missing("which currency applies?"); return finish(); }
    if (!knownCurrencyCode(currency)) { missing(`${currency} is not a recognized currency code in the runtime ISO 4217 catalog. The supplied code is retained; confirm the correct three-letter code.`); return finish(); }
    if (line.minimum && line.maximum && line.minimum.per === line.maximum.per && line.minimum.basis === line.maximum.basis && new Decimal(line.minimum.amount).gt(line.maximum.amount)) { missing("minimum exceeds maximum; confirm the supplier's terms."); return finish(); }
    if ([line.minimum, line.maximum].some(bound => bound?.basis === "unit") && (!["time", "gt-time"].includes(unit ?? "") || line.resourceQuantity === undefined)) { missing("unit-basis monetary bounds require an explicit resource-time quantity; otherwise use line basis."); return finish(); }
    if (unscopedUncertainty && (amount === undefined || rate !== undefined || unit !== undefined && unit !== "amount")) { missing("derived billing is withheld until the unresolved governing terms are scoped or resolved."); return finish(); }

    if (unit === "percentage") {
      if (amount !== undefined || rate !== undefined || line.amountBasis !== undefined) { missing("percentage billing must retain its percent and named base lines, not a flat amount or rate."); return finish(); }
      if (line.percent === undefined) { missing("what percentage applies?"); return finish(); }
      if (!line.baseLines?.length) { missing("which named fee lines form the percentage base?"); return finish(); }
      if (new Set(line.baseLines.map(key)).size !== line.baseLines.length) { missing("percentage base lines must be distinct; duplicate bases would be counted twice."); return finish(); }
      const bases: CalculatedLine[] = [];
      for (const baseName of line.baseLines) {
        const baseIndex = indexes.get(key(baseName));
        if (baseIndex === undefined) { missing(`named base line ${baseName} is missing.`); return finish(); }
        if (states[baseIndex] === 1) { missing("percentage base dependency is cyclic; select acyclic named base lines."); return finish(); }
        const base = evaluate(baseIndex);
        if (!base) { missing(`named base line ${baseName} is unpriced or unresolved.`); return finish(); }
        bases.push(base);
      }
      if (bases.some(base => base.currency !== currency)) { missing("every selected percentage base must use the same currency as this line; no FX conversion is inferred."); return finish(); }
      let expression = `(${bases.map(base => base.amount).join("+")})*(${line.percent}/100)`;
      let formula = `${line.percent}% × (${line.baseLines.map(safe).join(" + ")}) in ${currency}`;
      for (const [which, fn] of [["minimum", "max"], ["maximum", "min"]] as const) {
        const bound = line[which]; if (!bound) continue;
        if (bound.per !== "call") { missing(`${which} per block requires time billing.`); return finish(); }
        expression = `${fn}(${expression},${bound.amount})`; formula += `; ${which} ${currency} ${bound.amount}/call`;
      }
      if (rounding?.stage === "line") expression = `round(${expression},${rounding.decimals})`;
      const result = calculateExactExpression(expression);
      if (line.statedExtension !== undefined && !sameExact(line.statedExtension, result)) { missing(`stated extension ${currency} ${line.statedExtension} does not match backend result ${currency} ${result}.`); return finish(); }
      return finish({ name: line.name, currency, amount: result, formula });
    }

    if (amount !== undefined && rate !== undefined) { missing("is this a flat amount or a unit rate? Both were supplied."); return finish(); }
    if (amount === undefined && rate === undefined) { missing("what amount or supplier rate was quoted?"); return finish(); }
    if (rate !== undefined && unit === "amount") { missing("a unit rate cannot use flat-amount billing; confirm the complete billing kind and units."); return finish(); }
    if (amount !== undefined && [line.perQuantity, line.periodHours, line.commenced, line.quantity, line.quantityLabel, line.duration, line.minimumDurationHours, line.resourceQuantity, line.resourceLabel, line.perResourceQuantity, line.percent, line.baseLines, line.statedExtension].some(value => value !== undefined)) { missing("flat amount has incompatible rate, quantity, duration, dependency or extension fields."); return finish(); }
    if (rate !== undefined && line.amountBasis !== undefined) { missing("user-stated flat amount basis cannot apply to a rate."); return finish(); }
    if (!["time", "gt-time"].includes(unit ?? "") && (line.periodHours !== undefined || line.commenced !== undefined || line.duration !== undefined || line.minimumDurationHours !== undefined || line.resourceQuantity !== undefined || line.resourceLabel !== undefined || line.perResourceQuantity !== undefined)) { missing("duration, period and resource fields require time billing."); return finish(); }
    if (unit === "time" && line.perQuantity !== undefined) { missing("a time-only rate cannot have a GT denominator; use perResourceQuantity for an independently counted resource."); return finish(); }
    if (!["quantity", "movement", "tonne", "tonne-movement"].includes(unit ?? "") && (line.quantity !== undefined || line.quantityLabel !== undefined)) { missing("line quantity requires quantity, movement or tonne billing."); return finish(); }
    if (unit !== "tonne-movement" && (line.movements !== undefined || line.perMovements !== undefined)) { missing("movement factors require tonnes × movements billing."); return finish(); }
    if (unit === "quantity" && (line.quantity === undefined || !line.quantityLabel)) { missing("generic quantity billing needs its independent quantity and unit label."); return finish(); }
    if (["movement", "tonne"].includes(unit ?? "") && line.quantityLabel !== undefined) { missing("movement and tonne billing use their canonical unit labels; quantityLabel is for generic item/job billing."); return finish(); }
    if ([line.minimum?.per, line.maximum?.per].includes("block") && !["time", "gt-time"].includes(unit ?? "")) { missing("monetary bounds per block require time billing."); return finish(); }
    if (unscopedUncertainty && amount !== undefined) return finish({ name: line.name, currency, amount, formula: `${currency} ${amount} raw supplied amount; derived adjustments withheld` });
    let expression = amount ?? rate!, formula = `${currency} ${amount ?? rate} supplied amount`;
    if (amount !== undefined && unit && unit !== "amount") { missing("flat amount has conflicting rate units."); return finish(); }
    if (amount === undefined && unit !== "amount") {
      if (!unit) { missing("what are the rate's units?"); return finish(); }
      if (unit === "time" || unit === "gt-time") {
        const lineDuration = line.duration ? exactValue(addRational(multiplyRational(rational(line.duration.hours ?? "0"), rational("60")), rational(line.duration.minutes ?? "0"))) : duration;
        if (lineDuration === undefined) { missing("what is the occupancy, line duration, or the full start/end timestamps?"); return finish(); }
        if (!line.periodHours || line.commenced === undefined) { missing("what is the billing period, and are part periods charged in full?"); return finish(); }
        if (unit === "gt-time" && !call.gt) { missing("what is the vessel's GT/GRT?"); return finish(); }
        const resourceSpecified = [line.resourceQuantity, line.resourceLabel, line.perResourceQuantity].some(value => value !== undefined);
        if (resourceSpecified && /^(?:gt|grt|gross[ -]?(?:registered[ -]?)?tonnage|hours?|minutes?|days?)$/i.test(line.resourceLabel?.trim() ?? "")) { missing("resource count must be an independent resource, not a repeated GT or time dimension. Preserve the GT denominator in perQuantity."); return finish(); }
        if (resourceSpecified && (line.resourceQuantity === undefined || !line.resourceLabel)) { missing("resource-time billing needs both the independent resource count and its unit label."); return finish(); }
        const resourceFactor = resourceSpecified ? line.resourceQuantity! : "1";
        const bounds = [line.minimum, line.maximum].filter((bound): bound is NonNullable<typeof bound> => !!bound);
        const missingBoundBasis = [...(line.minimum && !line.minimum.basis ? ["minimum"] : []), ...(line.maximum && !line.maximum.basis ? ["maximum"] : [])];
        if (resourceSpecified && new Decimal(line.resourceQuantity!).gt(1) && missingBoundBasis.length) { missing(`${missingBoundBasis.join(" and ")} monetary bound with multiple resources needs an explicit unit or line basis.`); return finish(); }
        const boundBases = new Set(bounds.flatMap(bound => bound.basis ? [bound.basis] : []));
        if (boundBases.size > 1) { missing("monetary bounds mix unit and line bases; provide one governing basis for this line."); return finish(); }
        const boundBasis = resourceSpecified ? [...boundBases][0] ?? "line" : "line";
        const minimumDuration = line.minimumDurationHours ? multiplyRational(rational(line.minimumDurationHours), rational("60")) : undefined;
        const billableDuration = minimumDuration && compareRational(minimumDuration, rational(lineDuration)) > 0 ? exactValue(minimumDuration) : lineDuration;
        const periods = calculateExactExpression(`${line.commenced ? "ceil" : ""}(${billableDuration}/(${line.periodHours}*60))`);
        const rateBlock = unit === "gt-time" ? `(${call.gt}/${line.perQuantity ?? "1"})*${rate}` : rate!;
        const baseBlock = resourceSpecified ? `(${rateBlock})/${line.perResourceQuantity ?? "1"}` : rateBlock;
        if (boundBasis === "unit" && resourceSpecified) {
          let unitBlock = baseBlock;
          for (const [which, fn] of [["minimum", "max"], ["maximum", "min"]] as const) if (line[which]?.per === "block") unitBlock = `${fn}(${unitBlock},${line[which]!.amount})`;
          let unitTotal = `(${unitBlock})*(${periods})`;
          for (const [which, fn] of [["minimum", "max"], ["maximum", "min"]] as const) if (line[which]?.per === "call") unitTotal = `${fn}(${unitTotal},${line[which]!.amount})`;
          expression = `(${unitTotal})*${resourceFactor}`;
        } else {
          let lineBlock = resourceSpecified ? `(${baseBlock})*${resourceFactor}` : baseBlock;
          for (const [which, fn] of [["minimum", "max"], ["maximum", "min"]] as const) if (line[which]?.per === "block") lineBlock = `${fn}(${lineBlock},${line[which]!.amount})`;
          expression = `(${lineBlock})*(${periods})`;
          if (resourceSpecified) for (const [which, fn] of [["minimum", "max"], ["maximum", "min"]] as const) if (line[which]?.per === "call") expression = `${fn}(${expression},${line[which]!.amount})`;
        }
        formula = `${unit === "gt-time" ? `${call.gt} GT / ${line.perQuantity ?? "1"} × ` : ""}${resourceSpecified ? `${line.resourceQuantity} ${safe(line.resourceLabel!)} × ` : ""}${currency} ${rate}${resourceSpecified ? ` / ${line.perResourceQuantity ?? "1"} ${safe(line.resourceLabel!)}` : ""} per ${line.periodHours}-hour ${line.commenced ? "commenced" : "exact"} period; supplied duration ${lineDuration} minutes${line.minimumDurationHours ? `; minimum billable duration ${line.minimumDurationHours} hours` : ""}; billable periods ${periods}`;
      } else {
        const quantity = line.quantity ?? (line.billingScope === "line" ? undefined : unit === "movement" ? call.movements : call.cargoTonnes);
        if (quantity === undefined) { missing(`what is the ${unit === "movement" ? "movement count" : unit === "quantity" ? "line quantity" : "cargo tonnage"}?`); return finish(); }
        if (unit === "movement" && !new Decimal(quantity).isInteger()) { missing("movement count must be an integer."); return finish(); }
        expression = `(${quantity}/${line.perQuantity ?? "1"})*${rate}`;
        formula = `${quantity} ${unit === "quantity" ? safe(line.quantityLabel!) : `${unit}s`} / ${line.perQuantity ?? "1"} × ${currency} ${rate}`;
        if (unit === "tonne-movement") {
          if (line.movements === undefined || !new Decimal(line.movements).isInteger()) { missing("what is the explicit integer movement count for these tonnes?"); return finish(); }
          expression += `*(${line.movements}/${line.perMovements ?? "1"})`;
          formula = `${quantity} tonnes / ${line.perQuantity ?? "1"} × ${line.movements} movements / ${line.perMovements ?? "1"} × ${currency} ${rate}`;
        }
      }
    }
    for (const [which, fn] of [["minimum", "max"], ["maximum", "min"]] as const) {
      const bound = line[which]; if (!bound) continue;
      if (bound.per === "block" && !["time", "gt-time"].includes(unit ?? "amount")) { missing(`${which} per block cannot apply to this line's units.`); return finish(); }
      if (["time", "gt-time"].includes(unit ?? "") && line.resourceQuantity !== undefined) {
        formula += `; ${which} ${currency} ${bound.amount}/${bound.per} on ${bound.basis ?? "line"} basis`;
        continue;
      }
      if (bound.per === "call") expression = `${fn}(${expression},${bound.amount})`;
      formula += `; ${which} ${currency} ${bound.amount}/${bound.per}`;
    }
    if (rounding?.stage === "line") expression = `round(${expression},${rounding.decimals})`;
    const calculatedAmount = calculateExactExpression(expression);
    if (line.statedExtension !== undefined && !sameExact(line.statedExtension, calculatedAmount)) { missing(`stated extension ${currency} ${line.statedExtension} does not match backend result ${currency} ${calculatedAmount}.`); return finish(); }
    return finish({ name: line.name, currency, amount: calculatedAmount, formula });
  };
  const evaluate = (index: number): CalculatedLine | undefined => {
    try { return evaluateLine(index); }
    catch {
      states[index] = 2;
      questions.push(`${quote.lines[index].name}: calculation exceeded the supported exact-arithmetic bounds or has an invalid divisor. This line remains unresolved; independent lines are retained.`);
      return undefined;
    }
  };
  for (let index = 0; index < quote.lines.length; index++) if (!selectedLineIds || selectedLineIds.includes(quote.lines[index].id!)) evaluate(index);
  const lines = calculated.filter((line,index): line is CalculatedLine => !!line && (!selectedLineIds || selectedLineIds.includes(quote.lines[index].id!)));
  if (taxBasis === "before-tax" && quote.terms.taxStatus === "included" && quote.terms.taxPercent !== undefined) for (const line of lines) {
    line.amount = exactValue(divideRational(rational(line.amount),addRational(rational("1"),divideRational(rational(quote.terms.taxPercent),rational("100")))));
    line.formula += `; before-tax view divides the supplied inclusive amount by (1 + ${quote.terms.taxPercent}/100)`;
  }
  if (!quote.lines.length) questions.push("Which supplied quotation lines should be included?");
  const totals = [...new Set(lines.map(line => line.currency))].map(currency => {
    const amounts = lines.filter(line => line.currency === currency).map(line => line.amount);
    const subtotal = rational(sumExact(amounts)), tax = multiplyRational(subtotal, multiplyRational(rational(taxPercent ?? "0"), rational("0.01")));
    let total = addRational(subtotal, tax);
    if (rounding?.stage === "total") total = roundRational(total, rounding.decimals);
    return { currency, amount: exactValue(total), chargeIds: lines.filter(line => line.currency === currency).map(line => key(line.name)).concat(taxPercent !== undefined ? ["supplied-tax"] : []).sort(), lineAmounts: [...amounts, ...(taxPercent !== undefined ? [exactValue(tax)] : [])], basis: "scoped-quote" as const };
  });
  if (!partialSelection && taxBasis === "as-supplied") for (const stated of quote.terms.statedTotals ?? []) {
    const computed = totals.find(total=>total.currency===stated.currency);
    if (!computed || !sameExact(stated.amount,computed.amount)) questions.push(`Supplier-stated total ${stated.currency} ${stated.amount} does not match the computed total${computed?` ${computed.currency} ${computed.amount}`:""}; correct the supplied facts or state the governing rounding rule.`);
  }
  if (new Set(quote.terms.statedTotals?.map(total=>total.currency)).size !== (quote.terms.statedTotals?.length ?? 0)) questions.push("Supplier-stated totals must have one amount per currency.");
  const taxText = taxBasis === "before-tax" ? "Requested before-tax view; original supplied tax terms unchanged." : taxPercent !== undefined ? `Supplied tax ${taxPercent}% included in each currency total.` : quote.terms.taxStatus === "included" ? "Supplied prices include tax; no further tax added." : quote.terms.taxStatus === "excluded" ? "Tax explicitly excluded from this view; tax payable is not determined here." : quote.terms.taxStatus === "exempt" ? "Supplier states tax exempt." : "Tax status unknown; these amounts do not establish an all-in payable total.";
  const adjustments = unscopedUncertainty ? "Derived charges, monetary bounds, tax and rounding are withheld while governing terms remain unresolved. Only the raw listed fixed amounts are summed; retained recipes are not approved." : `${taxText} ${rounding ? `Half-up monetary rounding per ${rounding.stage}, ${rounding.decimals} decimals.` : "Exact monetary values; no monetary rounding."}`;
  const body = lines.length ? `**${safe(quote.name)} — user-supplied quotation**\n\n| Charge | Amount |\n|---|---:|\n${lines.map(line => `| ${safe(line.name)} | ${money(line.currency, line.amount)} |`).join("\n")}\n${totals.map(total => `| **${questions.length ? "Identified subtotal" : "Total of supplied lines"}** | **${money(total.currency, total.amount)}** |`).join("\n")}\n\n${lines.map(line => `- **${safe(line.name)}:** ${line.formula}.`).join("\n")}\n\n${adjustments} Unquoted services excluded. These are supplied prices, not official tariff rates.` : "";
  return { status: questions.length || !lines.length ? "unresolved" : "calculated", sourceClass: "user-supplied-quotation", body, questions: [...new Set(questions)], totals, calculation: { lines } };
}

export function quoteChanges(quote: Quote, result: QuoteResult): string {
  if (!quote.baseline || result.status !== "calculated" || !result.totals?.length || result.questions.length) return "";
  const baseline = quote.baseline;
  const changes = result.totals.flatMap(total => {
    const original = baseline.totals?.find(row => row.currency === total.currency);
    if (!original || sameExact(total.amount, original.amount)) return [];
    const difference = subtractRational(rational(total.amount), rational(original.amount));
    const positive = compareRational(difference, rational("0")) >= 0;
    return [`${positive ? "Increase" : "Decrease"} from ${baseline.imported ? "imported saved" : "original"} quotation: **${money(total.currency, exactValue({ ...difference, numerator: positive ? difference.numerator : -difference.numerator }))}** (${money(total.currency, original.amount)} → ${money(total.currency, total.amount)}).`];
  });
  const unchanged = quote.lines.filter(line => {
    const before = baseline.lines.filter(item => item.currency === line.currency).findIndex(item => key(item.name) === key(line.name));
    const after = quote.lines.filter(item => item.currency === line.currency).findIndex(item => key(item.name) === key(line.name));
    const original = baseline.totals?.find(total => total.currency === line.currency)?.lineAmounts?.[before];
    const current = result.totals?.find(total => total.currency === line.currency)?.lineAmounts?.[after];
    return original !== undefined && current !== undefined && sameExact(original, current);
  }).map(line => safe(line.name));
  if (changes.length && unchanged.length) changes.push(`Unchanged amounts: ${unchanged.join(", ")}.`);
  return changes.length ? "\n\n" + changes.join("\n\n") : "";
}

/** A previous saved revision is distinct from the original baseline. Official
 * historical tariff amounts are not recomputed with potentially changed sources. */
export function quotePreviousChange(previous: Quote | undefined, result: QuoteResult): string {
  if (!previous || previous.pricing !== "supplied" || result.status !== "calculated" || result.questions.length || !result.totals?.length) return "";
  const before = calculateSupplied(previous);
  if (before.status !== "calculated" || before.questions.length || !before.totals?.length) return "";
  const currencies = [...new Set([...before.totals, ...result.totals].map(total => total.currency))];
  const rows = currencies.map(currency => {
    const prior = before.totals!.find(total => total.currency === currency), next = result.totals!.find(total => total.currency === currency);
    if (!prior || !next) return `${currency}: previous ${prior ? money(currency, prior.amount) : "not present"}; current ${next ? money(currency, next.amount) : "not present"}. No cross-currency difference is inferred.`;
    const delta = subtractRational(rational(next.amount), rational(prior.amount));
    const direction = compareRational(delta, rational("0"));
    const absolute = direction < 0 ? { ...delta, numerator: -delta.numerator } : delta;
    return `${money(currency, prior.amount)} → ${money(currency, next.amount)}; ${direction < 0 ? "decrease" : direction > 0 ? "increase" : "change"} ${money(currency, exactValue(absolute))}.`;
  });
  return `\n\n**Immediately previous saved revision ${previous.revision} — ${safe(previous.name)}**\n\n${rows.join("\n\n")}`;
}
