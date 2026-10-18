import { createHash, randomUUID } from "node:crypto";
import type { ModelMessage } from "ai";
import { AuthoritySession } from "../authority/session";
import { quoteCore, type AuthorityOperation } from "../authority/contract";
import { authenticatedInputs } from "../migration/call-context";
import DecimalJs from "decimal.js";
const Decimal = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_UP });
import { z } from "zod";
import { lookupTariff } from "./tariffs";
import { readLegacyQuotes } from "./legacy-quotes";
import { supportsVesselCategory } from "./category-evidence";
import { calculateSupplied, callParticulars, currencySchema, decimal, key, money, quoteChanges, quoteInputSchema, quoteToolInputSchema, safe, storedTermsSchema, type Quote, type QuoteInput, type QuoteResult } from "./quotes";

const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object" ? `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([name, item]) => `${JSON.stringify(name)}:${canonical(item)}`).join(",")}}`
  : JSON.stringify(value);
// Missing strict-tool fields arrive as null; compare retries in domain form.
function presentFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(presentFields);
  return value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined).map(([name, item]) => [name, presentFields(item)])) : value;
}
function repairsInvalidQuote(before: unknown, after: unknown): boolean {
  const oldInput = presentFields(before), newInput = presentFields(after);
  const invalid = quoteToolInputSchema.safeParse(oldInput), valid = quoteToolInputSchema.safeParse(newInput);
  if (invalid.success || !valid.success || invalid.error.issues.some(issue => !issue.path.length)) return false;
  const omitInvalid = (input: unknown) => {
    const copy = structuredClone(input);
    for (const issue of invalid.error.issues) {
      let parent = copy as Record<PropertyKey, unknown> | undefined;
      for (const part of issue.path.slice(0, -1)) parent = parent?.[part] as typeof parent;
      if (parent && typeof parent === "object") delete parent[issue.path.at(-1)!];
    }
    return copy;
  };
  return canonical(omitInvalid(oldInput)) === canonical(omitInvalid(newInput));
}
function hasFinancialClaim(prose: string): boolean {
  const text = prose.normalize("NFKC");
  const quantity = String.raw`(?:\p{N}[\p{N},.]*|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|lakh|crore)\b)`;
  const moneyUnit = String.raw`(?:[$₹€£]|(?:USD|INR|EUR|GBP)(?![a-z])|\b(?:dollars?|rupees?|euros?|pounds?)\b)`;
  const amount = new RegExp(`${moneyUnit}[^.!?\n]{0,80}${quantity}|${quantity}[^.!?\n]{0,80}${moneyUnit}|${quantity}\\s*%`, "iu");
  const financial = String.raw`\b(?:price|cost|charge|fee|total|payable|tax|discount|rebate|bill|invoice|amount)s?\b`;
  return amount.test(text) || new RegExp(`${financial}[^.!?\n]{0,80}${quantity}`, "iu").test(text)
    || /\b(?:tariff|GST|tax|berth[ -]hire|port[ -]dues)\b[^.!?\n]{0,100}\b(?:exempt\w*|waiv\w*|free|minimum|maximum|commenced|round\w*|applicable|valid\w*)\b/iu.test(text);
}
export const quoteDigest = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
const hash = quoteDigest;
// A generated summary is not a durable identifier: quantities may be corrected.
// Accept a label only where the human explicitly quotes/names it or attaches a
// supplied currency amount to it. All other new quotes get a stable server name.
function explicitLabel(name: string | undefined, request: string): string | undefined {
  if (!name) return;
  for (const match of request.matchAll(/\b(?:quotes?|quotations?|estimates?|offers?|calls?|vessels?)\s+(?:named|called|label(?:led)?)\s+([^.!?;\n]+)/gi)) {
    const list = match[1].split(/\s+(?:for|at|on|with)\b|,\s*(?:both|each|all)\b/i)[0];
    if (list.split(/\s+and\s+|\s*&\s*|,\s*/i).some(item => key(item.trim().replace(/^["“']|["”']$/g, "")) === key(name))) return name;
  }
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:\\b(?:quote|quotation|estimate|offer|call|vessel)s?\\s+(?:is\\s+)?(?:named|called|label(?:led)?)\\s*[:=]?\\s*["“']?${escaped}["”']?(?=$|[.,;\\s])|\\b${escaped}\\s*(?:is|[:=-])?\\s*(?:USD|INR|EUR|GBP)\\s*\\d|\\b${escaped}\\s+(?:is|has)\\s+\\d+(?:\\.\\d+)?\\s*(?:GRT|GT)\\b)`, "i").test(request) ? name : undefined;
}
const suppliedCallFields = new Set(["vesselName", "gt", "nt", "dwt", "loa", "draught", "cargoTonnes", "anchorageArrival", "cargoCompleted", "portDeparture", "intervalStart", "intervalEnd", "occupancy", "berthStart", "berthEnd", "timeZone", "dateOrder", "movements", "otherAdjustments", "callDate"]);
export const BUSINESS_TOOLS = new Set(["port_information", "manage_quote", "compare_quotes"]);
export const comparisonSchema = z.object({
  quoteIds: z.array(z.string().min(1).max(100)).min(2).max(8), currency: currencySchema,
  exchangeRates: z.array(z.object({ from: currencySchema, to: currencySchema, rate: decimal.refine(value => new Decimal(value).gt(0)), date: z.string().max(80).optional() }).strict()).max(6).optional(),
  rounding: z.object({ stage: z.enum(["line", "total"]), decimals: z.number().int().min(0).max(8) }).strict().optional(),
}).strict();
type RecordReceipt = { version: 2; kind: "portia-quote"; conversationId: string; beforeRevision: number; quote: Quote; hash: string };
type AnswerResult = Pick<QuoteResult, "body" | "questions"> & Partial<Pick<QuoteResult, "status" | "limitations">>;
export function renderResult(result: AnswerResult) {
  return (result.status === "explained" ? "**Rules only — no calculated quotation in this result**\n\n" : "") + result.body
    + (result.limitations?.length ? `\n\nSource limitations:\n${result.limitations.map(value => `- ${value}`).join("\n")}` : "")
    + (result.questions.length ? `${result.body ? "\n\n" : ""}Details still needed:\n${result.questions.map(question => `- ${question}`).join("\n")}` : "");
}
/** Per authenticated run, never a global cache. Existing Convex run fences own
 * durability; private tool receipts checkpoint each mutation before next step. */
export class QuoteSession {
  readonly quotes = new Map<string, Quote>();
  readonly answers = new Map<string, string>();
  private readonly answerKinds = new Map<string, QuoteResult["status"]>();
  private readonly comparisons = new Map<string, Set<string>>();
  private readonly answerOrder = new Map<string, number>();
  private readonly auxiliary = new Map<string, string>();
  private readonly observedTools = new Set<string>();
  private readonly recalledTools = new Set<string>();
  private forgotten = false;
  private readonly observedFailures = new Set<string>();
  private readonly incompleteTools = new Map<string, { toolName: string; input?: unknown }>();
  private currentRequest = "";
  private netTonnageFromForm?: string;
  warning?: string;
  private expected = new Map<string, number>();
  private tail: Promise<unknown> = Promise.resolve();
  private authority?: AuthoritySession;
  constructor(readonly conversationId: string) {}
  bindAuthority(authority: AuthoritySession) { this.authority = authority; }
  private sensitive(quote: Quote) { return quote.pricing === "supplied" || quote.call.fxInrPerUsd !== undefined; }
  async initialize(messages: readonly ModelMessage[]) {
    for (const message of messages) {
      if (message.role === "user") {
        this.currentRequest = typeof message.content === "string" ? message.content : message.content.filter(part => part.type === "text").map(part => part.text).join("\n");
        this.netTonnageFromForm = undefined;
      }
      if (message.role === "tool") for (const part of message.content) if (part.type === "tool-result" && part.toolName === "ask_user_input" && part.output.type === "json" && part.output.value && typeof part.output.value === "object") {
        const response = part.output.value as { cancelled?: boolean; values?: Record<string, string>; note?: string };
        const values = response.cancelled ? {} : response.values ?? {};
        this.currentRequest = [...Object.values(values), response.note ?? ""].join("\n");
        const fields = authenticatedInputs(messages).filter(item => item.toolCallId === part.toolCallId && item.kind === "submitted-form" && item.fieldName && item.fieldLabel);
        const net = Object.entries(values).filter(([field]) => fields.some(item => item.fieldName === field && /\b(?:NT|NRT|net(?: registered)? tonnage)\b/i.test([item.fieldName, item.fieldLabel, item.formUnit].join(" ").replaceAll("_", " ")) && !/\b(?:GT|GRT|gross|DWT|deadweight|cargo)\b/i.test([item.fieldLabel, item.formUnit].join(" "))));
        this.netTonnageFromForm = net.length === 1 && /^\d+(?:,\d{3})*(?:\.\d+)?$/.test(net[0][1]) ? net[0][1].replaceAll(",", "") : undefined;
      }
    }
    const legacy = await readLegacyQuotes(messages);
    this.warning = legacy.warning;
    for (const quote of legacy.quotes) this.quotes.set(quote.id, quote);
    for (const message of messages) {
      if (message.role !== "tool") continue;
      for (const part of message.content) {
        if (part.type !== "tool-result" || part.toolName !== "manage_quote" || part.output.type !== "json" || !part.output.value || typeof part.output.value !== "object" || !("record" in part.output.value)) continue;
        const receipt = part.output.value.record as unknown as RecordReceipt;
        const { hash: checksum, ...unsigned } = receipt;
        if (receipt.version !== 2 || receipt.kind !== "portia-quote" || receipt.conversationId !== this.conversationId) throw new Error("Saved quote identity is invalid.");
        const prior = this.quotes.get(receipt.quote.id);
        if (hash(unsigned) !== checksum || (prior?.revision ?? -1) !== receipt.beforeRevision || receipt.quote.revision !== receipt.beforeRevision + 1) {
          this.quotes.delete(receipt.quote.id);
          this.warning = "A historical quote receipt failed integrity/revision verification. Its amounts and conditions remain unresolved; confirm the affected quotation details rather than reconstructing assistant prose.";
          continue;
        }
        const valid = quoteInputSchema.safeParse({ name: receipt.quote.name, pricing: receipt.quote.pricing, call: receipt.quote.call, ...(receipt.quote.services.length ? { services: receipt.quote.services } : {}), ...(receipt.quote.lines.length ? { lines: receipt.quote.lines } : {}) });
        if (!valid.success || !storedTermsSchema.safeParse(receipt.quote.terms).success) {
          this.quotes.delete(receipt.quote.id); this.warning = "A saved quote contains unsupported historical particulars. Confirm the affected details; raw history remains available."; continue;
        }
        this.quotes.set(receipt.quote.id, structuredClone(receipt.quote));
      }
    }
    this.beginStep();
  }
  beginStep() { this.expected = new Map([...this.quotes].map(([id, quote]) => [id, quote.revision])); }
  context() { return JSON.stringify({ quotes: [...this.quotes.values()], ...(this.warning ? { historicalWarning: this.warning } : {}) }); }
  async calculate(quote: Quote): Promise<QuoteResult> {
    if (this.authority && this.sensitive(quote) && !this.authority.approvedQuote(quoteCore(quote))) return { status: "unresolved", sourceClass: quote.pricing === "supplied" ? "user-supplied-quotation" : "official-tariff", body: "This saved quotation has no exact-term approval for its current revision. Review its complete terms before calculating or comparing it.", questions: [] };
    return this.calculateCandidate(quote);
  }
  private async calculateCandidate(quote: Quote): Promise<QuoteResult> {
    if (quote.unresolvedHistory?.length) return { status: "unresolved", sourceClass: quote.pricing === "official" ? "official-tariff" : "user-supplied-quotation", body: "This saved quotation contains historical conditions that cannot be converted safely. Create a separate quotation from the clarified complete terms; the original history is retained.", questions: quote.unresolvedHistory };
    if (quote.pricing === "official" && (quote.terms.unresolvedTerms?.length || quote.unresolvedHistory?.length)) return { status: "unresolved", sourceClass: "official-tariff", body: "Historical governing conditions remain unresolved; no applicable quote has been established.", questions: [...quote.terms.unresolvedTerms ?? [], ...quote.unresolvedHistory ?? []] };
    return quote.pricing === "official" ? lookupTariff(callParticulars(quote)) : calculateSupplied(quote);
  }
  private serialized<T>(work: () => Promise<T>): Promise<T> {
    const next = this.tail.then(work); this.tail = next.catch(() => undefined); return next;
  }
  async update(raw: QuoteInput, abortSignal?: AbortSignal, toolCallId?: string) {
    return this.serialized(async () => {
      abortSignal?.throwIfAborted();
      const input = quoteInputSchema.parse(raw), prior = input.quoteId ? this.quotes.get(input.quoteId) : undefined;
      if (input.quoteId && !prior) return this.error("Unknown quote ID in this conversation. Use a returned saved quote ID.");
      if (input.call?.nt !== undefined && input.call.nt !== prior?.call.nt) {
        // The current vessel adapter supplies GT/DWT, not NT. New NT therefore
        // needs an explicitly labelled human quantity, never a copied GT.
        const unit = "(?:NT|NRT|net(?: registered)? tonnage)";
        const number = "(\\d+(?:,\\d{3})*(?:\\.\\d+)?)";
        const patterns = [new RegExp(`\\b${unit}\\s*(?:(?:is|of)\\s*)?[:=]?\\s*${number}(?![\\d,.])`, "gi"), new RegExp(`(?<![\\d,.])${number}\\s*${unit}\\b`, "gi")];
        const declared = this.currentRequest.split(/[!?;\n]+|\.(?=\s|$)|,(?!\d)/).filter(clause => !/\b(?:not|no|unknown|unconfirmed|unspecified)\b|isn['’]t/i.test(clause)).some(clause => patterns.some(pattern => [...clause.matchAll(pattern)].some(match => new Decimal(match[1].replaceAll(",", "")).eq(input.call!.nt!))));
        const formSupplied = this.netTonnageFromForm !== undefined && new Decimal(this.netTonnageFromForm).eq(input.call.nt);
        if (!declared && !formSupplied) return this.error("Net tonnage was not supplied with that NT/NRT value. Gross tonnage cannot be copied into net tonnage. Keep the supplied GT/GRT and leave unknown NT empty; do not ask for NT unless the requested calculation needs it.");
      }
      if ((prior?.pricing ?? input.pricing) === "official" && input.services?.includes("rounding") && this.currentRequest) {
        const excluded = /\b(?:do not|don't|no|without|exclude|excluding)\s+(?:(?:any|final|monetary|invoice|bill)\s+)*round(?:ing|off)?\b/i.test(this.currentRequest);
        const requested = /\b(?:rounding|rounded)\b|\bround\s+(?:the\s+)?(?:amount|bill|invoice|total|price|charge|it|up|down|to|off)\b|\b(?:final|complete)\s+(?:bill|invoice)\b/i.test(this.currentRequest);
        if (excluded || !prior?.services.includes("rounding") && !requested) return this.error("Invoice rounding was not requested for this component. Price the stated scope exactly and omit the unrequested rounding service; display formatting does not require an invoice-rounding charge.");
      }
      if (input.call?.icdRail === true && prior?.call.icdRail !== true && (!/\b(?:ICD|inland container depot)\b/i.test(this.currentRequest) || /\b(?:not|no|without)\s+(?:(?:an?|the)\s+)?(?:ICD|inland container depot)\b/i.test(this.currentRequest))) {
        return this.error("Rail handling alone does not establish actual ICD use. Remove the inferred ICD eligibility; a normal NSFT rail bundle does not require that additional fact. Other terminals may need actual ICD confirmation for their ICD-specific row.");
      }
      const basis = input.call?.fxBasis ?? prior?.call.fxBasis;
      const changedFx = input.call && (["fxBasis", "fxInrPerUsd", "fxDate", "fxPreviousWorkingDay"] as const).some(field => input.call?.[field] !== undefined && input.call[field] !== prior?.call[field]);
      if (basis && changedFx) {
        // A quoted requirement is not provenance for the supplied rate.
        // Require an affirmative supplied-source clause for a new basis;
        // retained provenance survives numeric corrections only absent a
        // current contradiction/uncertainty about that rate's source.
        const clauses = this.currentRequest.split(/[!?;\n]+|\.(?=\s|$)/);
        const sourceClaim = /\b(?:supplied|using|use|my|our)\s+(?:the\s+)?(?:SBI|State Bank of India)\s+TT[ -]+selling\b/i;
        const uncertain = /\b(?:generic|planning|example|unconfirmed|unknown|uncertain|not|isn't|is not)\b/i;
        const contradicted = clauses.some(clause => /\b(?:rate|FX|SBI|exchange|TT[ -]+selling)\b/i.test(clause) && uncertain.test(clause));
        const rate = input.call?.fxInrPerUsd ?? prior?.call.fxInrPerUsd;
        const rateToken = rate ? new RegExp(`(?:^|[^\\d.])${new Decimal(rate).toString().replace(".", "\\.")}(?:\\.0+)?(?=$|[^\\d.])`) : undefined;
        const suppliedBank = clauses.some(clause => sourceClaim.test(clause) && !uncertain.test(clause) && (!rateToken || rateToken.test(clause)));
        if (contradicted || basis !== prior?.call.fxBasis && !suppliedBank) return this.error("The supplied rate is not established as SBI TT selling. A generic or unconfirmed planning rate cannot determine the source-prescribed KLL settlement. Use it only for a separately labelled supplied-rate comparison, or confirm the prescribed rate source.");
      }
      const label = explicitLabel(input.name, this.currentRequest);
      if (!label) delete input.name;
      if ((prior?.pricing ?? input.pricing) === "supplied" && input.call) input.call = Object.fromEntries(Object.entries(input.call).filter(([field]) => suppliedCallFields.has(field)));
      const categoryChanged = input.call?.vesselCategory !== undefined && input.call.vesselCategory !== prior?.call.vesselCategory;
      const oneQuote = this.quotes.size === 0 || !!prior && this.quotes.size === 1;
      const awaitingCategory = !!(categoryChanged && prior && !prior.call.vesselCategory && oneQuote && (await this.calculate(prior)).questions.some(question => /^vessel category$/i.test(question.trim())));
      const targetName = input.call?.vesselName ?? prior?.call.vesselName ?? label ?? (prior && !/^Quotation \d+$/.test(prior.name) ? prior.name : undefined);
      if (categoryChanged && !supportsVesselCategory(input.call!.vesselCategory, input.vesselCategoryEvidence, this.currentRequest, targetName, oneQuote, awaitingCategory)) {
        if (prior?.call.vesselCategory) return this.error("The proposed vessel-category correction lacks an unambiguous complete human clause. Confirm the category for this vessel before using the changed eligibility.");
        delete input.call!.vesselCategory;
      }
      delete input.vesselCategoryEvidence;
      if (input.call && !Object.keys(input.call).length) delete input.call;
      const changed = Object.keys(input).some(field => field !== "quoteId");
      if (prior && changed && prior.revision !== this.expected.get(prior.id)) return this.error("This quote changed during the same step. Read its latest saved version before applying another correction.");
      if (!prior && !input.pricing) return this.error("Specify whether the request uses official tariffs or user-supplied quotation prices.");
      if (prior && input.pricing && input.pricing !== prior.pricing) return this.error("A supplied quotation cannot become an official tariff quote. Create a separate quotation for that purpose.");
      if (!prior && label && [...this.quotes.values()].some(quote => key(quote.name) === key(label))) return this.error("A quotation with that name already exists. Use its returned quote ID for corrections.");
      const quote: Quote = prior ? structuredClone(prior) : { id: randomUUID(), revision: -1, name: label ?? `Quotation ${this.quotes.size + (this.authority?.proposedQuoteCount() ?? 0) + 1}`, pricing: input.pricing!, call: {}, services: [], lines: [], terms: {} };
      if (prior && !quote.baseline && (!this.authority || !this.sensitive(prior) || this.authority.approvedQuote(quoteCore(prior)))) {
        const original = await this.calculate(prior);
        if (original.status === "calculated" && original.totals?.length && !original.questions.length) quote.baseline = { totals: structuredClone(original.totals), lines: structuredClone(prior.lines), ...(quote.id.startsWith("legacy-") ? { imported: true } : {}) };
      }
      if (label) quote.name = label;
      quote.call = { ...quote.call, ...input.call };
      if (quote.pricing === "supplied") quote.call = Object.fromEntries(Object.entries(quote.call).filter(([field]) => suppliedCallFields.has(field)));
      if (input.services) quote.services = [...input.services];
      if (input.terms) quote.terms = { ...quote.terms, ...input.terms };
      if (input.terms?.removeRounding) delete quote.terms.rounding;
      delete quote.terms.removeRounding;
      if (quote.terms.rounding && /\b(?:no|without)\s+(?:monetary\s+)?rounding\b/i.test(this.currentRequest)) return this.error("This request excludes monetary rounding. Set terms.removeRounding=true and do not supply a rounding rule; null alone preserves an existing rule.");
      if (quote.pricing === "official" && input.lines) return this.error("For official pricing, lines must be null. Official rates are retrieved by the tariff tool; supplied prices cannot authorize them.");
      if (quote.pricing === "official" && input.terms?.taxPercent !== undefined) return this.error("For official pricing, terms.taxPercent must be null, including pre-tax requests. Omit gst from services for pre-tax scope. Only supplied quotations accept taxPercent, even zero. Correct this argument without changing the user facts.");
      if (input.lines) {
        if (new Set(input.lines.map(line => key(line.name))).size !== input.lines.length) return this.error("Each quoted charge needs a distinct name.");
        for (const patch of input.lines) {
          const index = quote.lines.findIndex(line => key(line.name) === key(patch.name));
          const line = index < 0 ? { ...patch } : { ...quote.lines[index], ...patch };
          if (patch.amount !== undefined && patch.rate === undefined) { delete line.rate; line.unit = "amount"; }
          if (patch.rate !== undefined && patch.amount === undefined) delete line.amount;
          if (patch.removeMinimum) delete line.minimum;
          if (patch.removeMaximum) delete line.maximum;
          delete line.removeMinimum; delete line.removeMaximum;
          if (index < 0) quote.lines.push(line); else quote.lines[index] = line;
        }
      }
      for (const name of input.removeLines ?? []) {
        if (!quote.lines.some(line => key(line.name) === key(name))) return this.error("The named line to remove does not exist in this quotation.");
        quote.lines = quote.lines.filter(line => key(line.name) !== key(name));
      }
      if (quote.lines.length > 16 || this.quotes.size + (this.authority?.proposedQuoteCount() ?? 0) >= 24 && !prior) return this.error("Saved quote limit reached for this conversation.");
      const effectiveChange = !prior || canonical({ ...quote, baseline: undefined, revision: undefined }) !== canonical({ ...prior, baseline: undefined, revision: undefined });
      const needsApproval = !!this.authority && this.sensitive(quote) && (effectiveChange || !prior || !this.authority.approvedQuote(quoteCore(prior)));
      if (needsApproval && prior && !this.authority!.approvedQuote(quoteCore(prior))) delete quote.baseline;
      const result = await this.calculateCandidate(quote);
      abortSignal?.throwIfAborted();
      if (!quote.baseline && result.status === "calculated" && result.totals?.length && !result.questions.length) quote.baseline = { totals: structuredClone(result.totals), lines: structuredClone(quote.lines), ...(quote.id.startsWith("legacy-") ? { imported: true } : {}) };
      if (needsApproval) {
        quote.revision = (prior?.revision ?? -1) + 1;
        const proposal = this.authority!.propose({ id: randomUUID(), kind: "quote", quote: quoteCore(quote), before: prior ? AuthoritySession.binding(quoteCore(prior)) : null, previous: prior ? quoteCore(prior) : null });
        return this.recordAnswer(toolCallId ?? `proposal:${quote.id}`, proposal);
      }
      return this.saveCandidate(quote, prior, result, effectiveChange, toolCallId);
    });
  }
  private saveCandidate(quote: Quote, prior: Quote | undefined, result: QuoteResult, changed: boolean, toolCallId?: string): QuoteResult & {quoteId:string; revision:number; record?:RecordReceipt} {
    const body = (quote.pricing === "official" ? `**${safe(quote.name)}**\n\n` : "") + renderResult(result) + quoteChanges(quote, result);
    if (!this.answerOrder.has(quote.id)) this.answerOrder.set(quote.id, toolCallId ? this.answerOrder.get(toolCallId) ?? this.answerOrder.size : this.answerOrder.size);
    this.answers.set(quote.id, body); this.answerKinds.set(quote.id, result.status);
    if (changed) for (const [id, members] of this.comparisons) if (members.has(quote.id)) { this.answers.delete(id); this.answerKinds.delete(id); this.comparisons.delete(id); }
    if (prior && !changed) return { quoteId: quote.id, revision: quote.revision, ...result, body };
    const beforeRevision = prior?.revision ?? -1; quote.revision = beforeRevision + 1;
    const unsigned = { version: 2 as const, kind: "portia-quote" as const, conversationId: this.conversationId, beforeRevision, quote };
    const record: RecordReceipt = { ...unsigned, hash: hash(unsigned) }; this.quotes.set(quote.id, quote);
    return { quoteId: quote.id, revision: quote.revision, ...result, body, record };
  }
  /** Called only with a private backend grant. Never exposed as an agent tool. */
  async applyApprovedQuote(operation: Extract<AuthorityOperation, { kind: "quote" }>) {
    const candidate = operation.quote, prior = this.quotes.get(candidate.id);
    if (canonical(prior ? AuthoritySession.binding(quoteCore(prior)) : null) !== canonical(operation.before)) throw new Error("Approved quotation base changed.");
    if (candidate.revision !== (prior?.revision ?? -1) + 1 || prior && (candidate.pricing !== prior.pricing || canonical(candidate.unresolvedHistory ?? []) !== canonical(prior.unresolvedHistory ?? []))) throw new Error("Invalid approved quotation revision or historical conditions.");
    quoteInputSchema.parse({ name: candidate.name, pricing: candidate.pricing, call: candidate.call, ...(candidate.services.length ? { services: candidate.services } : {}), ...(candidate.lines.length ? { lines: candidate.lines } : {}) });
    storedTermsSchema.parse(candidate.terms);
    const quote = structuredClone(candidate) as Quote;
    const result = await this.calculateCandidate(quote);
    const saved = this.saveCandidate(quote, prior, result, true);
    if (!saved.record || canonical(saved.record.quote) !== canonical(candidate)) throw new Error("Approved quotation changed during execution.");
    this.authority?.acceptQuote(candidate);
    return { ...saved, record: saved.record };
  }
  async applyApprovedComparison(operation: Extract<AuthorityOperation, { kind: "comparison" }>) {
    const input = comparisonSchema.parse(operation.input);
    const current = input.quoteIds.map(id => this.quotes.get(id));
    if (current.some(q => !q) || canonical(current.map(q => AuthoritySession.binding(quoteCore(q!)))) !== canonical(operation.quotes.map(({ quoteId,revision,digest }) => ({quoteId,revision,digest})))) throw new Error("Approved comparison base changed.");
    this.authority?.acceptComparison(operation);
    return this.compare(input);
  }

  error(message: string) { const id = "error:" + randomUUID(); this.answers.set(id, message); this.answerKinds.set(id, "error"); return { status: "error" as const, error: message, body: message, questions: [] }; }
  reserveAnswer(id: string) { if (!this.answers.has(id)) this.answers.set(id, ""); if (!this.answerOrder.has(id)) this.answerOrder.set(id, this.answerOrder.size); }
  recordAnswer<T extends AnswerResult>(id: string, result: T): T { this.reserveAnswer(id); this.answers.set(id, renderResult(result)); if (result.status) this.answerKinds.set(id, result.status); return result; }
  observeTools(results: readonly { toolCallId: string; toolName: string; input?: unknown; output?: unknown }[], calls: readonly { toolCallId?: string; toolName: string; invalid?: boolean; input?: unknown }[] = [], errors: readonly { toolCallId: string; toolName: string; input?: unknown }[] = []) {
    for (const failure of [...calls.filter(call => call.invalid), ...errors]) {
      const id = failure.toolCallId ?? `invalid:${failure.toolName}`;
      if (this.observedFailures.has(id)) continue;
      this.observedFailures.add(id);
      this.incompleteTools.set(id, { toolName: failure.toolName, input: failure.input });
    }
    for (const result of results) {
      if (this.observedTools.has(result.toolCallId)) continue;
      this.observedTools.add(result.toolCallId);
      const output = result.output;
      const failed = !!output && typeof output === "object" && ("error" in output || "status" in output && output.status === "error" || "saved" in output && output.saved === false);
      if (failed) this.incompleteTools.set(result.toolCallId, { toolName: result.toolName, input: result.input });
      else if (output !== undefined && !(typeof output === "object" && output && "status" in output && output.status === "unresolved")) {
        for (const [id, prior] of this.incompleteTools) {
          if (prior.toolName !== result.toolName) continue;
          // Exact transient retry, or successful validation with every unaffected
          // argument unchanged. Reading the same quote does not repair a correction.
          if (id === result.toolCallId || prior.input !== undefined && result.input !== undefined && (canonical(presentFields(prior.input)) === canonical(presentFields(result.input)) || result.toolName === "manage_quote" && repairsInvalidQuote(prior.input, result.input))) this.incompleteTools.delete(id);
        }
      }
      if (["search_vessels", "get_vessel"].includes(result.toolName) && typeof output === "string") {
        const unavailable = /^Vessel (?:lookup|search) is (?:unavailable|not configured)/i.test(output);
        this.auxiliary.set(result.toolCallId, unavailable
          ? "Vessel lookup is unavailable. Please provide the needed vessel particulars manually."
          : `Vessel directory result (not tariff authority):\n\n${output.replace(/[<>]/g, " ").slice(0, 12_000)}`);
      }
      if (!output || typeof output !== "object") continue;
      if (["remember_memory", "forget_memory", "write_scratchpad"].includes(result.toolName) && "saved" in output && output.saved === true) {
        if (result.toolName === "forget_memory") { this.forgotten = true; for (const id of this.recalledTools) this.auxiliary.delete(id); this.recalledTools.clear(); }
        this.auxiliary.set(result.toolCallId, result.toolName === "remember_memory" ? "Requested memory saved." : result.toolName === "forget_memory" ? "Requested memory forgotten." : "Private notes saved for this chat.");
      }
      if (result.toolName === "recall_memory" && "facts" in output && Array.isArray(output.facts)) {
        this.recalledTools.add(result.toolCallId);
        this.auxiliary.set(result.toolCallId, output.facts.length ? "Saved memory (historical information; remembered rates are not current tariff authority):\n" + output.facts.map(fact => `- ${safe(String(fact.key))}: ${safe(String(fact.value))}`).join("\n") : "No cross-chat memory is saved.");
      }
      if (result.toolName === "read_scratchpad" && "markdown" in output && typeof output.markdown === "string") { this.recalledTools.add(result.toolCallId); this.auxiliary.set(result.toolCallId, output.markdown ? "Private notes for this chat (historical working data):\n\n" + output.markdown : "This chat has no private working notes."); }
    }
  }
  async compare(raw: z.infer<typeof comparisonSchema>, answerId = "comparison:" + randomUUID()) {
    const input = comparisonSchema.parse(raw);
    if (input.rounding && /\b(?:no|without)\s+(?:monetary\s+)?rounding\b/i.test(this.currentRequest)) return this.error("The requested comparison is exact, without monetary rounding. Set rounding to null; a high decimal precision is still rounding.");
    if (new Set(input.quoteIds).size !== input.quoteIds.length) return this.error("Select distinct saved quotations.");
    const quotes = input.quoteIds.map(id => this.quotes.get(id));
    if (quotes.some(quote => !quote)) return this.error("A selected quotation is not saved in this conversation.");
    const results = await Promise.all(quotes.map(quote => this.calculate(quote!)));
    if (results.some(result => result.sourceClass === "published-reference" || result.status === "estimated" || result.totals?.some(total => total.basis === "reference"))) return this.error("A selected quotation is a dated reference or conditional estimate with unconfirmed current applicability. These amounts cannot support a definitive price ranking; their source limitations remain visible in each saved estimate.");
    if (results.some(result => result.status !== "calculated" || result.questions.length || !result.totals?.length)) return this.error("Each comparison side needs resolved totals for every requested service; complete its missing details first.");
    const totals = results.map(result => result.totals!);
    const scope = (rows: NonNullable<QuoteResult["totals"]>) => JSON.stringify(rows.flatMap(row => row.chargeIds.map(id => [row.basis, id])).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
    if (totals.some(rows => scope(rows) !== scope(totals[0]))) return this.error("The selected quotations cover different services. Confirm matching included services before ranking their prices.");
    const fxPairs = (input.exchangeRates ?? []).map(rate => `${rate.from}:${rate.to}`);
    if (new Set(fxPairs).size !== fxPairs.length) return this.error("Provide exactly one conversion rate per currency pair; duplicate rates are ambiguous.");
    const converted: Array<{ name: string; sourceCurrency: string; sourceAmount: string; amount: string; sourceTotals?: Array<{ currency: string; amount: string }> }> = [];
    for (const [index, rows] of totals.entries()) {
      let amount = new Decimal(0);
      for (const total of rows) {
        const fx = total.currency === input.currency ? undefined : input.exchangeRates?.find(rate => rate.from === total.currency && rate.to === input.currency);
        if (total.currency !== input.currency && !fx) return this.error(`Provide the ${total.currency} to ${input.currency} conversion rate; no exchange rate is assumed.`);
        if (fx && quotes[index]!.pricing === "official" && !fx.date) return this.error("Provide the date of the supplied exchange rate for this tariff comparison.");
        const multiplier = new Decimal(fx?.rate ?? 1);
        if (input.rounding?.stage === "line") {
          if (!total.lineAmounts?.length) return this.error("Line amounts are required for the requested conversion rounding.");
          if (!Decimal.sum(...total.lineAmounts).eq(total.amount)) return this.error("This saved invoice includes a source-total rounding adjustment that is not allocated to individual lines. Compare the saved totals using total-stage conversion, or provide an explicit line allocation; the invoice adjustment cannot be silently discarded.");
          amount = amount.plus(Decimal.sum(...total.lineAmounts.map(value => new Decimal(value).mul(multiplier).toDecimalPlaces(input.rounding!.decimals, Decimal.ROUND_HALF_UP))));
        } else amount = amount.plus(new Decimal(total.amount).mul(multiplier));
      }
      if (input.rounding?.stage === "total") amount = amount.toDecimalPlaces(input.rounding.decimals, Decimal.ROUND_HALF_UP);
      converted.push({ name: quotes[index]!.name, sourceCurrency: rows[0].currency, sourceAmount: rows[0].amount, amount: amount.toString(), ...(rows.length > 1 ? { sourceTotals: rows.map(({ currency, amount }) => ({ currency, amount })) } : {}) });
    }
    if (this.authority && (input.exchangeRates?.length || input.rounding)) {
      const operation = { id: randomUUID(), kind: "comparison" as const, input, quotes: quotes.map(q => ({ ...AuthoritySession.binding(quoteCore(q!)), name: q!.name })) };
      if (!this.authority.approvedComparison(operation)) return this.recordAnswer(answerId, this.authority.propose(operation));
    }
    const ranked = [...converted].sort((left, right) => new Decimal(left.amount).cmp(right.amount));
    const difference = new Decimal(ranked.at(-1)!.amount).minus(ranked[0].amount).toString();
    const body = `**Saved quotation comparison**\n\n| Quotation | Supplied/source total | ${input.currency} comparison |\n|---|---:|---:|\n${converted.map(row => `| ${safe(row.name)} | ${row.sourceTotals ? row.sourceTotals.map(t => money(t.currency, t.amount)).join(" + ") : money(row.sourceCurrency, row.sourceAmount)} | ${money(input.currency, row.amount)} |`).join("\n")}\n\n${new Decimal(difference).eq(0) ? "The totals are equal." : `**${safe(ranked[0].name)}** has the lower total; difference from ${safe(ranked.at(-1)!.name)}: **${money(input.currency, difference)}**.`}\n\n${(input.exchangeRates ?? []).map(rate => `Supplied FX: ${rate.to} ${rate.rate} per ${rate.from} 1${rate.date ? ` (${safe(rate.date)})` : ""}.`).join(" ")} ${input.rounding ? `Half-up conversion rounding per ${input.rounding.stage} to ${input.rounding.decimals} decimals.` : "Exact comparison; no monetary rounding."} Compares included services and stated scenarios, not unquoted invoice items or operational suitability.${quotes.some(quote => quote!.pricing === "official") ? " Current tariff applicability remains unverified; conditional source limitations carry through this comparison." : ""}`;
    this.answers.set(answerId, body); this.answerKinds.set(answerId, "calculated"); this.comparisons.set(answerId, new Set(input.quoteIds));
    return { status: "calculated", body, questions: [], converted, difference, currency: input.currency };
  }
  finalText(prose: string) {
    if (this.incompleteTools.size > 0 && ![...this.answers.values()].some(answer => answer.trim())) return [...this.auxiliary.values(), "No tool-backed result was completed because the business inputs could not be validated. Confirm the disputed quotation or calculation details before retrying."].join("\n\n");
    if (this.answers.size) {
      const rulesOnly = [...this.answerKinds.values()].includes("explained") && ![...this.quotes.keys()].some(id => ["calculated", "estimated"].includes(this.answerKinds.get(id) ?? ""));
      const ordered = [...this.answers].sort(([left], [right]) => (this.answerOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (this.answerOrder.get(right) ?? Number.MAX_SAFE_INTEGER)).map(([, text]) => text);
      return [...ordered, ...this.auxiliary.values(), ...(this.incompleteTools.size > 0 ? ["A requested quotation or calculation could not complete because its business tool call failed or its inputs were invalid. Only the successful results shown here are confirmed."] : []), ...(rulesOnly ? ["No quotation has been calculated in this reply. If a calculation was requested, it remains incomplete; supplied details are retained in this conversation."] : [])].filter(Boolean).join("\n\n");
    }
    if (this.forgotten) return [...this.auxiliary.values()].join("\n\n");
    if (hasFinancialClaim(prose)) return [...this.auxiliary.values(), "No tool-backed calculation or tariff rule was retrieved for that claim. The requested service and its source need checking before a financial answer can be given."].join("\n\n");
    return prose;
  }
  async answer(prose: string) {
    // A model may answer a read-only follow-up from persisted tool context.
    // Recompute the single saved quote instead of trusting its monetary prose.
    // This never applies a correction or creates a new quote implicitly.
    if (!this.answers.size && !this.auxiliary.size && this.quotes.size === 1 && /(?:[$₹€£]|\b(?:INR|USD|EUR|GBP)\b)\s*\d|\d+(?:\.\d+)?\s*%/.test(prose)) {
      const quote = [...this.quotes.values()][0], result = await this.calculate(quote);
      return "**Saved quotation — unchanged in this reply**\n\n" + renderResult(result) + quoteChanges(quote, result);
    }
    return this.finalText(prose);
  }
}
