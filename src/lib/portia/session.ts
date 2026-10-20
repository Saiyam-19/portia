import { createHash, randomUUID } from "node:crypto";
import type { ModelMessage } from "ai";
import { AuthoritySession } from "../authority/session";
import { quoteCore, type AuthorityOperation } from "../authority/contract";
import { authenticatedInputs } from "../migration/call-context";
import DecimalJs from "decimal.js";
const Decimal = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_UP });
import { z } from "zod";
import { lookupTariff, normalizeService, validateFacilityIdentity } from "./tariffs";
import { readLegacyQuotes } from "./legacy-quotes";
import { supportsVesselCategory } from "./category-evidence";
import { calculateSupplied, callParticulars, currencySchema, decimal, key, knownCurrencyCode, money, quoteChanges, quoteCommandSchema, quoteInputSchema, quoteMetadata, quoteToolInputSchema, safe, storedTermsSchema, type CommandLine, type Quote, type QuoteCommand, type QuoteInput, type QuoteLine, type QuoteResult } from "./quotes";
import { legacyQuoteLabel, legacySuppliedCall } from "./legacy-quote-input";
import { draftQuoteSchema, replayQuoteDrafts, validateDraftBindings, type QuoteDraft } from "./quote-drafts";
import { reportQuote } from "./reporting";
import type { TariffInput } from "./tariff-types";

const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object" ? `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([name, item]) => `${JSON.stringify(name)}:${canonical(item)}`).join(",")}}`
  : JSON.stringify(value);
const storedBillingKind = (line: QuoteLine | undefined) => line?.amount !== undefined || line?.unit === "amount" || line?.amountBasis ? "flat" : line?.unit;
function billingLine(line: CommandLine, previous?: QuoteLine): QuoteLine {
  const currency = line.currency ?? previous?.currency;
  if (!line.billing) return { name: line.name, ...(currency ? { currency } : {}) };
  const billing = line.billing;
  if (billing.kind === "flat") return { name: line.name, ...(currency ? { currency } : {}), ...(billing.price !== undefined ? { amount: billing.price } : {}), amountBasis: billing.basis, billingScope: "line", unit: "amount" };
  if (billing.kind === "quantity") return { name: line.name, ...(currency ? { currency } : {}), ...(billing.price !== undefined ? { rate: billing.price } : {}), billingScope: "line", unit: "quantity",
    ...(billing.quantity !== undefined ? { quantity: billing.quantity } : {}), quantityLabel: billing.quantityLabel, ...(billing.perQuantity ? { perQuantity: billing.perQuantity } : {}) };
  if (billing.kind === "movement" || billing.kind === "tonne") return { name: line.name, ...(currency ? { currency } : {}), ...(billing.price !== undefined ? { rate: billing.price } : {}), billingScope: "line", unit: billing.kind,
    ...(billing.quantity !== undefined ? { quantity: billing.quantity } : {}), ...(billing.perQuantity ? { perQuantity: billing.perQuantity } : {}) };
  if (billing.kind === "percentage") return { name: line.name, ...(currency ? { currency } : {}), billingScope: "line", unit: "percentage",
    ...(billing.percent !== undefined ? { percent: billing.percent } : {}), ...(billing.baseLines ? { baseLines: billing.baseLines } : {}) };
  return { name: line.name, ...(currency ? { currency } : {}), ...(billing.price !== undefined ? { rate: billing.price } : {}), billingScope: "line", unit: billing.kind,
    ...(billing.periodHours !== undefined ? { periodHours: billing.periodHours } : {}), ...(billing.commenced !== undefined ? { commenced: billing.commenced } : {}),
    ...(billing.duration ? { duration: billing.duration } : {}), ...(billing.kind === "gt-time" && billing.perQuantity ? { perQuantity: billing.perQuantity } : {}),
    ...(billing.resourceQuantity !== undefined ? { resourceQuantity: billing.resourceQuantity } : {}), ...(billing.resourceLabel ? { resourceLabel: billing.resourceLabel } : {}),
    ...(billing.perResourceQuantity ? { perResourceQuantity: billing.perResourceQuantity } : {}) };
}
// Missing strict-tool fields arrive as null; compare retries in domain form.
function presentFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(presentFields);
  return value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined).map(([name, item]) => [name, presentFields(item)])) : value;
}
function repairsInvalidQuote(before: unknown, after: unknown): boolean {
  const oldInput = presentFields(before), newInput = presentFields(after);
  const schema = oldInput && typeof oldInput === "object" && "action" in oldInput ? quoteCommandSchema : quoteToolInputSchema;
  const invalid = schema.safeParse(oldInput), valid = schema.safeParse(newInput);
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
function repairsRejectedFields(before: unknown, after: unknown, paths: string[][]): boolean {
  if (!before || !after || typeof before !== "object" || typeof after !== "object" || !paths.length) return false;
  const old = before as Record<string, unknown>, next = after as Record<string, unknown>;
  if (old.action !== next.action || next.action === "read" || old.quoteId !== next.quoteId) return false;
  const omit = (value: unknown) => {
    const copy = structuredClone(presentFields(value)) as Record<string, unknown>;
    for (const path of paths) {
      if (!path.length || ["action", "quoteId"].includes(path[0])) return undefined;
      let target: Record<string, unknown> | undefined = copy;
      for (const field of path.slice(0, -1)) target = target?.[field] as typeof target;
      if (target && typeof target === "object") delete target[path.at(-1)!];
    }
    const prune = (item: unknown): unknown => Array.isArray(item) ? item.map(prune) : item && typeof item === "object"
      ? Object.fromEntries(Object.entries(item).map(([k, v]) => [k, prune(v)]).filter(([, v]) => !(v && typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length))) : item;
    return prune(copy);
  };
  const left = omit(before), right = omit(after);
  return left !== undefined && right !== undefined && canonical(left) === canonical(right);
}
function repairsArithmetic(before: unknown, after: unknown, errorId?: string): boolean {
  if (!errorId || !after || typeof after !== "object" || !("retryOf" in after) || after.retryOf !== errorId) return false;
  const withoutRetry = (input: unknown) => input && typeof input === "object" ? Object.fromEntries(Object.entries(input).filter(([field]) => field !== "retryOf")) : input;
  return repairsRejectedFields(withoutRetry(before), withoutRetry(after), [["expression"]]);
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
// Model-chosen metadata is retained only when the complete value occurs in the
// current human text. This is lexical provenance, not proof that the model chose
// the correct business role for every phrase.
function grounded(value: string | undefined, request: string): boolean {
  if (!value?.trim() || !request.trim()) return false;
  const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  const needle = normalize(value), haystack = normalize(request);
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + 1)) {
    const before = haystack[at - 1], after = haystack[at + needle.length];
    if ((!before || !/[\p{L}\p{N}_]/u.test(before)) && (!after || !/[\p{L}\p{N}_]/u.test(after))) return true;
  }
  return false;
}
function groundedLabel(name: string | undefined, request: string): string | undefined {
  if (!name || !grounded(name, request)) return;
  const numericFact = /^\p{N}.*\b(?:GT|GRT|NT|NRT|DWT|laden|empty|containers?|tonnes?|hours?|days?)\b/iu.test(name.trim());
  return numericFact ? undefined : name;
}
export const BUSINESS_TOOLS = new Set(["port_information", "manage_quote", "compare_quotes"]);
export const comparisonSchema = z.object({
  quoteIds: z.array(z.string().min(1).max(100)).min(2).max(8), currency: currencySchema.optional().describe("Requested uppercase three-letter comparison currency; no replacement or conversion is inferred."),
  exchangeRates: z.array(z.object({ from: currencySchema.describe("Original uppercase three-letter source currency."), to: currencySchema.describe("Original uppercase three-letter target currency."), rate: decimal.refine(value => new Decimal(value).gt(0)), date: z.string().max(80).optional() }).strict()).max(6).optional(),
  rounding: z.object({ stage: z.enum(["line", "total"]), decimals: z.number().int().min(0).max(8) }).strict().optional(),
  scopeEquivalence: z.object({ statement: z.string().trim().min(1).max(1000) }).strict().optional(),
  reviewGroup: z.string().trim().min(1).max(80).optional(),
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
  private readonly drafts = new Map<string, QuoteDraft>();
  readonly answers = new Map<string, string>();
  private readonly answerKinds = new Map<string, QuoteResult["status"]>();
  private readonly comparisons = new Map<string, Set<string>>();
  private readonly answerOrder = new Map<string, number>();
  private readonly auxiliary = new Map<string, string>();
  private readonly observedTools = new Set<string>();
  private readonly recalledTools = new Set<string>();
  private forgotten = false;
  private readonly observedFailures = new Set<string>();
  private readonly incompleteTools = new Map<string, { toolName: string; input?: unknown; invalidFields?: string[][]; errorId?: string }>();
  private readonly workState = new Map<string, object>();
  private readonly currentInputQuestions = new Map<string, boolean>();
  private readonly questionTools = new Map<string, { toolName: string; input?: unknown }>();
  private readonly questionAnswerTargets = new Map<string, string>();
  private currentRequest = "";
  private netTonnageFromForm?: string;
  warning?: string;
  private expected = new Map<string, number>();
  private tail: Promise<unknown> = Promise.resolve();
  private authority?: AuthoritySession;
  constructor(readonly conversationId: string) {}
  bindAuthority(authority: AuthoritySession) { this.authority = authority; }
  hasCurrentInputQuestions() { return [...this.currentInputQuestions.values()].some(Boolean); }
  private trackInputQuestions(id: string, questions: readonly string[]) { this.currentInputQuestions.set(id.startsWith("draft:") ? id.slice(6) : id, questions.length > 0); }
  /** Server-owned review replaces a model's superfluous form attempt. Other
   * failed work remains visible; this is never a grant or fabricated user input. */
  prepareExactReview() {
    for (const [id, failure] of this.incompleteTools) if (failure.toolName === "ask_user_input") {
      this.incompleteTools.delete(id);
      if (failure.errorId) { this.answers.delete(failure.errorId); this.answerKinds.delete(failure.errorId); }
    }
  }
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
    for (const [id, draft] of await replayQuoteDrafts(messages, this.conversationId)) {
      const quote = draft.quote;
      quoteInputSchema.parse({ name: quote.name, pricing: quote.pricing, call: quote.call, ...(quote.services.length ? { services: quote.services } : {}), ...(quote.lines.length ? { lines: quote.lines } : {}) });
      storedTermsSchema.parse(quote.terms);
      this.drafts.set(id, draft);
    }
    // Reconstruct current disposition from verified terms, not historical prose.
    // An approved supplier quote never resolves a separate source inquiry.
    for (const quote of this.quotes.values()) this.rememberWork(quote, await this.calculate(quote));
    for (const draft of this.drafts.values()) this.rememberWork(draft.quote as Quote, await this.calculateCandidate(draft.quote as Quote), true);
    this.beginStep();
  }
  beginStep() { this.expected = new Map([...this.quotes].map(([id, quote]) => [id, quote.revision])); for (const [id, draft] of this.drafts) this.expected.set(`draft:${id}`, draft.draftRevision); }
  context() { return JSON.stringify({ quotes: [...this.quotes.values()], drafts: [...this.drafts.values()].map(draft => ({ quoteId: draft.quote.id, draftRevision: draft.draftRevision, unapproved: true, quote: draft.quote })), workState: [...this.workState.values()], ...(this.warning ? { historicalWarning: this.warning } : {}) }); }
  private rememberWork(quote: Quote, result: QuoteResult, draft = false) {
    this.workState.set(quote.id, { quoteId: quote.id, name: quote.name, revision: quote.revision, pricing: quote.pricing,
      approval: draft || this.authority && this.sensitive(quote) && !this.authority.approvedQuote(quoteCore(quote)) ? "unapproved" : quote.pricing === "official" && !this.sensitive(quote) ? "not-required" : "approved",
      status: result.status, sourceClass: result.sourceClass, scope: quote.pricing === "official" ? [...quote.services, ...quote.terms.unsupportedServices ?? []] : quote.lines.map(line => line.name),
      questions: result.questions, limitations: result.limitations ?? [],
      ...(result.status === "unresolved" && !result.questions.length ? { unresolvedSummary: result.body.slice(0, 1200) } : {}) });
  }
  async requirements(quoteId?: string, request?: TariffInput): Promise<QuoteResult & { quoteId?: string }> {
    if (quoteId && request) return { ...this.error("Choose an existing quotation ID or supplied particulars for input guidance, not both."), sourceClass: "official-tariff" };
    const quote = quoteId ? this.drafts.get(quoteId)?.quote as Quote | undefined ?? this.quotes.get(quoteId) : undefined;
    if (quoteId && (!quote || quote.pricing !== "official")) return { ...this.error("Input guidance requires an existing official-source quotation or explicit source particulars. Supplier prices cannot establish official requirements."), sourceClass: "official-tariff" };
    const input = quote ? callParticulars(quote) : request;
    if (!input) return { status: "unresolved", sourceClass: "official-tariff", body: "", questions: ["Which booked facility and services need input guidance?"] };
    const checked = await lookupTariff(input);
    const retained = quote ? [...quote.terms.unresolvedTerms ?? [], ...quote.unresolvedHistory ?? [], ...(quote.terms.unsupportedServices ?? []).map(service => `Unresolved requested charge: ${service}`)] : [];
    const questions = [...new Set([...checked.questions, ...retained])];
    const ready = ["calculated", "estimated"].includes(checked.status) && !questions.length && !checked.limitations?.length;
    return { status: checked.status === "error" ? "error" : "explained", sourceClass: checked.sourceClass,
      ...(quote ? { quoteId: quote.id } : {}),
      facility: checked.facility, sources: checked.sources, applicability: checked.applicability,
      body: `**Input guidance — ${safe(input.port ?? "unresolved facility")}**\n\nRequested scope: ${[...input.charges, ...quote?.terms.unsupportedServices ?? []].map(safe).join(", ")}. ${quote ? `Using retained ${this.drafts.has(quote.id) ? "unapproved " : ""}particulars for ${safe(quote.name)} (revision ${quote.revision}). ` : ""}${ready ? "The supplied particulars support the retained calculation for this scope; source limitations still apply." : "These are the next missing particulars or evidence gaps. Further conditional details may depend on the answers."} No quotation was created or changed.\n\n${!checked.totals?.length ? checked.body : ""}`,
      questions, limitations: [...checked.limitations ?? [], checked.applicability.message] };
  }
  async calculate(quote: Quote): Promise<QuoteResult> {
    if (this.authority && this.sensitive(quote) && !this.authority.approvedQuote(quoteCore(quote))) return { status: "unresolved", sourceClass: quote.pricing === "supplied" ? "user-supplied-quotation" : "official-tariff", body: "This saved quotation has no exact-term approval for its current revision. Review its complete terms before calculating or comparing it.", questions: [] };
    return this.calculateCandidate(quote);
  }
  private async calculateCandidate(quote: Quote): Promise<QuoteResult> {
    if (quote.unresolvedHistory?.length) return { status: "unresolved", sourceClass: quote.pricing === "official" ? "official-tariff" : "user-supplied-quotation", body: "This saved quotation contains historical conditions that cannot be converted safely. Create a separate quotation from the clarified complete terms; the original history is retained.", questions: quote.unresolvedHistory };
    if (quote.pricing === "official" && (quote.terms.unresolvedTerms?.length || quote.unresolvedHistory?.length)) return { status: "unresolved", sourceClass: "official-tariff", body: "Historical governing conditions remain unresolved; no applicable quote has been established.", questions: [...quote.terms.unresolvedTerms ?? [], ...quote.unresolvedHistory ?? []] };
    const result = quote.pricing === "official" ? await lookupTariff(callParticulars(quote)) : calculateSupplied(quote);
    const unsupported = quote.terms.unsupportedServices ?? [];
    const completeScope: QuoteResult = !unsupported.length ? result : { ...result, status: "unresolved", body: "**Requested scope incomplete — any amounts below cover supported components only.**\n\n" + result.body,
      questions: [...new Set([...result.questions, ...unsupported.map(service => `Unresolved requested charge: ${service}`)])] };
    return completeScope;
  }
  private serialized<T>(work: () => Promise<T>): Promise<T> {
    const next = this.tail.then(work); this.tail = next.catch(() => undefined); return next;
  }
  private nextQuoteName() {
    const used = new Set([...this.quotes.values(), ...[...this.drafts.values()].map(draft => draft.quote)].map(quote => key(quote.name)));
    let number = 1;
    while (used.has(key(`Quotation ${number}`))) number++;
    return `Quotation ${number}`;
  }
  /** Compatibility entry for existing internal callers. New model calls use
   * executeCommand exclusively; replay still verifies the original receipt. */
  async update(raw: QuoteInput, abortSignal?: AbortSignal, toolCallId?: string) {
    return this.updateInternal(raw, abortSignal, toolCallId);
  }
  async executeCommand(raw: QuoteCommand, abortSignal?: AbortSignal, toolCallId?: string,
    readFacts?: (signal?: AbortSignal) => Promise<{ facts: Array<{ key: string; value: string }> }>) {
    abortSignal?.throwIfAborted();
    const parsed = quoteCommandSchema.safeParse(raw);
    if (!parsed.success) return this.error(parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("\n"), parsed.error.issues.map(issue => issue.path.map(String)));
    const { action, readScope, reference, lines: commandLines } = parsed.data;
    const input = Object.fromEntries([
      ["quoteId", parsed.data.quoteId], ["name", parsed.data.name], ["pricing", parsed.data.pricing],
      ["vesselCategoryEvidence", parsed.data.vesselCategoryEvidence], ["call", parsed.data.call], ["services", parsed.data.services],
      ["lines", commandLines?.map(line => ({ name: line.name, ...(line.currency ? { currency: line.currency } : {}) }))],
      ["removeLines", parsed.data.removeLines], ["terms", parsed.data.terms],
    ].filter(([, value]) => value !== undefined)) as QuoteInput;
    if (action !== "read") return this.updateInternal(input, abortSignal, toolCallId, parsed.data);
    return this.serialized(async () => {
      abortSignal?.throwIfAborted();
      if (readScope === "cross-chat") {
        if (!readFacts) return this.error("Cross-chat memory is unavailable. No historical quotation was retrieved or imported.");
        const result = await readFacts(abortSignal); abortSignal?.throwIfAborted();
        const id = toolCallId ?? `recall:${randomUUID()}`;
        this.recordRecall(id, result.facts);
        return { status: "read" as const, body: this.auxiliary.get(id)!, questions: [], facts: result.facts };
      }
      const matches = (quote: Pick<Quote, "id" | "name" | "call">) => input.quoteId ? quote.id === input.quoteId : reference ? key(quote.name) === key(reference) || !!quote.call.reference && key(quote.call.reference) === key(reference) : true;
      const selected = [...this.quotes.values()].filter(matches), pending = [...this.drafts.values()].filter(draft => matches(draft.quote as Quote));
      if (!selected.length && !pending.length) return this.recordAnswer(toolCallId ?? `read:${randomUUID()}`, { status: "unresolved", body: input.quoteId || reference ? "That quotation is not saved in this conversation." : "No quotations are saved in this conversation.", questions: [] });
      const matching = new Map([...selected, ...pending.map(draft => draft.quote)].map(quote => [quote.id, quote.name]));
      if (reference && matching.size > 1) return this.error("That reference matches multiple quotations. Select a returned quotation ID: " + [...matching].map(([id, name]) => `${id} (${name})`).join(", "));
      const results = [];
      for (const saved of selected) {
        const quote = structuredClone(saved), result = reportQuote(await this.calculate(quote), parsed.data.reporting); abortSignal?.throwIfAborted();
        const body = `**Saved quotation — ${safe(quote.name)}; ID ${safe(quote.id)}; revision ${quote.revision}**\n\n` + quoteMetadata(quote) + renderResult(result) + quoteChanges(quote, result);
        this.recordAnswer(quote.id, { ...result, body, questions: [], limitations: [] }, result.questions);
        results.push({ quoteId: quote.id, revision: quote.revision, name: quote.name, result, body });
      }
      const draftBodies = [];
      for (const draft of pending) {
        const result = reportQuote(await this.calculateCandidate(draft.quote as Quote), parsed.data.reporting); abortSignal?.throwIfAborted();
        const body = `**Unapproved draft — ${safe(draft.quote.name)}; ID ${safe(draft.quote.id)}; draft revision ${draft.draftRevision}**\n\n` + quoteMetadata(draft.quote as Quote) + "Draft particulars are retained for continuation. They have not replaced any approved quotation or established a payable total.\n\n" + renderResult({ ...result, body: (result.totals?.length ? "**Unapproved identified subtotal — excludes unresolved lines.**\n\n" : "") + result.body });
        this.recordAnswer(`draft:${draft.quote.id}`, { status: "unresolved", body, questions: [] }, result.questions); draftBodies.push(body);
      }
      return { status: "read" as const, body: [...results.map(result => result.body), ...draftBodies].join("\n\n"), questions: results.flatMap(result => result.result.questions), quotations: results };
    });
  }
  private recordRecall(id: string, facts: Array<{ key: string; value: string }>) {
    this.recalledTools.add(id);
    this.auxiliary.set(id, facts.length ? "Saved memory (historical information; remembered rates are not current tariff authority):\n" + facts.map(fact => `- ${safe(fact.key)}: ${safe(fact.value)}`).join("\n") : "No cross-chat memory is saved.");
  }
  private async updateInternal(raw: QuoteInput, abortSignal?: AbortSignal, toolCallId?: string, command?: QuoteCommand) {
    return this.serialized(async () => {
      abortSignal?.throwIfAborted();
      const input = quoteInputSchema.parse(raw), savedPrior = input.quoteId ? this.quotes.get(input.quoteId) : undefined;
      const draftPrior = command && input.quoteId ? this.drafts.get(input.quoteId) : undefined;
      const prior = draftPrior ? structuredClone(draftPrior.quote) as Quote : savedPrior;
      if (input.quoteId && !prior) return this.error("Unknown quote ID in this conversation. Use a returned saved quote ID.");
      if (prior && input.pricing && input.pricing !== prior.pricing) return this.error("A supplied quotation cannot become an official tariff quote, and an official quote cannot become supplied pricing. Create a separate quotation for the new pricing mode; the original quote is unchanged.", [["pricing"]]);
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
      const label = command ? prior && input.name === prior.name ? prior.name : groundedLabel(input.name, this.currentRequest) : legacyQuoteLabel(input.name, this.currentRequest);
      if (command && input.name && !label) return this.error("The proposed quotation name is not grounded as a complete label in the current human request. Keep the name empty or copy the exact supplied label; no quotation was saved.", [["name"]]);
      const pricing = prior?.pricing ?? input.pricing;
      if (command && pricing === "supplied" && input.services) return this.error("Supplied quotation scope consists of named lines, including unpriced requested charges. Canonical services apply only to official tariffs; preserve each supplied charge in lines.", [["services"]]);
      for (const field of ["reference", "context", "port", "terminal", "operator"] as const) if (command && pricing === "supplied" && input.call?.[field] !== undefined && input.call[field] !== prior?.call[field] && !grounded(input.call[field], this.currentRequest)) {
        return this.error(`The supplied quotation ${field} is not grounded as a complete value in the current human request. Copy the exact supplied ${field} or leave it empty; no quotation was saved.`, [["call", field]]);
      }
      if (pricing === "official" && (input.call?.reference !== undefined || input.call?.context !== undefined)) return this.error("Supplier quotation reference/context metadata applies only to supplied quotations. Remove it from the official-source request; no quotation was saved.");
      if (!command && pricing === "supplied" && input.call) input.call = legacySuppliedCall(input.call);
      const rawIdentityChanged = !!input.call && (["port", "terminal", "operator"] as const).some(field => input.call?.[field] !== undefined && input.call[field] !== prior?.call[field]) || !!command?.clearCallFields?.some(field => ["port", "terminal", "operator", "facilityId"].includes(field));
      const facilityId = input.call?.facilityId ?? (rawIdentityChanged ? undefined : prior?.call.facilityId);
      const identityChanged = !!input.call && (["facilityId", "port", "terminal", "operator"] as const).some(field => input.call?.[field] !== undefined && input.call[field] !== prior?.call[field]);
      if (facilityId && identityChanged) {
        const identity = { ...prior?.call, ...input.call, facilityId };
        for (const field of command?.clearCallFields ?? []) delete identity[field];
        const identityError = validateFacilityIdentity(identity);
        if (identityError) return this.error(identityError, [["call", "facilityId"], ["call", "port"], ["call", "terminal"], ["call", "operator"]]);
      }
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
      const changed = Object.keys(input).some(field => field !== "quoteId") || !!(command?.removeServices?.length || command?.removeUnsupportedServices?.length || command?.clearCallFields?.length);
      if (prior && changed && (draftPrior ? draftPrior.draftRevision !== this.expected.get(`draft:${prior.id}`) : prior.revision !== this.expected.get(prior.id))) return this.error("This quote changed during the same step. Read its latest saved version before applying another correction.");
      if (!prior && !input.pricing) return this.error("Specify whether the request uses official tariffs or user-supplied quotation prices.");
      if (!prior && label && [...this.quotes.values(), ...[...this.drafts.values()].map(draft => draft.quote)].some(quote => key(quote.name) === key(label))) return this.error("A quotation with that name already exists. Use its returned quote ID for corrections.");
      const quote: Quote = prior ? structuredClone(prior) : { id: randomUUID(), revision: -1, name: label ?? (command ? this.nextQuoteName() : `Quotation ${this.quotes.size + (this.authority?.proposedQuoteCount() ?? 0) + 1}`), pricing: input.pricing!, call: {}, services: [], lines: [], terms: {} };
      if (savedPrior && !quote.baseline && (!this.authority || !this.sensitive(savedPrior) || this.authority.approvedQuote(quoteCore(savedPrior)))) {
        if (savedPrior.baseline) quote.baseline = structuredClone(savedPrior.baseline);
        else {
          const original = await this.calculate(savedPrior);
          if (original.status === "calculated" && original.totals?.length && !original.questions.length) quote.baseline = { totals: structuredClone(original.totals), lines: structuredClone(savedPrior.lines), ...(quote.id.startsWith("legacy-") ? { imported: true } : {}) };
        }
      }
      if (label) quote.name = label;
      quote.call = { ...quote.call, ...input.call };
      if (rawIdentityChanged && !input.call?.facilityId) delete quote.call.facilityId;
      if (command?.clearCallFields?.length) {
        if (!grounded(command.scopeChangeEvidence, this.currentRequest)) return this.error("Clearing saved particulars requires a verbatim current human correction; the saved facts were retained.", [["scopeChangeEvidence"]]);
        for (const field of command.clearCallFields) delete quote.call[field];
      }
      if (input.services) quote.services = [...new Set([...quote.services, ...input.services])];
      if (input.terms) {
        const unsupported = [...new Set([...(quote.terms.unsupportedServices ?? []), ...(input.terms.unsupportedServices ?? [])])];
        quote.terms = { ...quote.terms, ...input.terms, ...(unsupported.length ? { unsupportedServices: unsupported } : {}) };
      }
      const removals = [...command?.removeServices ?? [], ...command?.removeUnsupportedServices ?? []];
      if (removals.length) {
        if (!grounded(command?.scopeChangeEvidence, this.currentRequest)) return this.error("Scope removal requires a verbatim current human correction. Requested charges were retained.");
        for (const service of command?.removeServices ?? []) {
          const identity = (value: string) => canonical(normalizeService(value).sort());
          if (input.services?.some(value => identity(value) === identity(service))) return this.error(`Cannot add and remove the same charge: ${service}`);
          if (!quote.services.some(value => identity(value) === identity(service))) return this.error(`Cannot remove an absent requested service: ${service}`);
          quote.services = quote.services.filter(value => identity(value) !== identity(service));
        }
        for (const service of command?.removeUnsupportedServices ?? []) {
          if (!quote.terms.unsupportedServices?.includes(service)) return this.error(`Cannot remove an absent requested charge: ${service}`);
          quote.terms.unsupportedServices = quote.terms.unsupportedServices.filter(value => value !== service);
        }
      }
      if (quote.services.length > 20 || (quote.terms.unsupportedServices?.length ?? 0) > 20) return this.error("Requested charge scope exceeds the supported quotation size. Split it into separate quotations.");
      if (input.terms?.removeRounding) delete quote.terms.rounding;
      delete quote.terms.removeRounding;
      if (quote.terms.rounding && /\b(?:no|without)\s+(?:monetary\s+)?rounding\b/i.test(this.currentRequest)) return this.error("This request excludes monetary rounding. Set terms.removeRounding=true and do not supply a rounding rule; null alone preserves an existing rule.");
      if (quote.pricing === "official" && input.lines) return this.error("For official pricing, lines must be null. Official rates are retrieved by the tariff tool; supplied prices cannot authorize them.");
      if (quote.pricing === "official" && input.terms?.taxPercent !== undefined) return this.error("For official pricing, terms.taxPercent must be null, including pre-tax requests. Omit gst from services for pre-tax scope. Only supplied quotations accept taxPercent, even zero. Correct this argument without changing the user facts.");
      if (quote.pricing === "official" && input.terms?.rounding !== undefined) return this.error("Official-source pricing cannot accept a model-supplied monetary rounding rule. Omit it to prepare exact source arithmetic, then use action read with reporting precision. An explicitly requested official final-invoice rule uses the rounding service and its source authority.", [["terms", "rounding"]]);
      const linePatches = command?.lines ?? input.lines;
      if (linePatches) {
        if (new Set(linePatches.map(line => key(line.name))).size !== linePatches.length) return this.error("Each quoted charge needs a distinct name.");
        for (const [patchIndex, rawPatch] of linePatches.entries()) {
          const patch = rawPatch as CommandLine & QuoteLine;
          const index = quote.lines.findIndex(line => key(line.name) === key(patch.name));
          if (command) {
            const priorLine = index < 0 ? undefined : quote.lines[index], previousKind = storedBillingKind(priorLine);
            if (patch.price !== undefined && !priorLine) return this.error(`Price-only correction requires an existing named line: ${patch.name}. Provide a complete billing recipe for a new line.`, [["lines", String(patchIndex), "price"], ["lines", String(patchIndex), "billing"]]);
            if (patch.price !== undefined && previousKind === "percentage") return this.error(`${patch.name}: a percentage recipe has no monetary price. Correct billing.percent, retaining its named base lines, or explicitly replace the billing kind.`, [["lines", String(patchIndex), "price"], ["lines", String(patchIndex), "billing"]]);
            if (patch.billing && priorLine && previousKind !== patch.billing.kind) {
              if (priorLine.minimumDurationHours && !patch.removeMinimumDuration) return this.error(`${patch.name}: replacing ${previousKind} billing must explicitly remove the saved minimum billable duration with removeMinimumDuration=true because it cannot apply to ${patch.billing.kind}.`, [["lines", String(patchIndex), "removeMinimumDuration"]]);
              if (priorLine.statedExtension && !patch.removeStatedExtension && patch.statedExtension === undefined) return this.error(`${patch.name}: replace or explicitly remove the saved stated extension when changing billing kind.`, [["lines", String(patchIndex), "removeStatedExtension"], ["lines", String(patchIndex), "statedExtension"]]);
              for (const which of ["minimum", "maximum"] as const) if (priorLine[which]?.per === "block" && !["time", "gt-time"].includes(patch.billing.kind) && !patch[`remove${which[0].toUpperCase()}${which.slice(1)}` as "removeMinimum" | "removeMaximum"]) {
                return this.error(`${patch.name}: the saved monetary ${which} is per block and cannot apply to ${patch.billing.kind}; remove it explicitly or keep time billing.`, [["lines", String(patchIndex), which], ["lines", String(patchIndex), `remove${which[0].toUpperCase()}${which.slice(1)}`]]);
              }
            }
            let line: QuoteLine;
            if (patch.price !== undefined) {
              line = structuredClone(priorLine!);
              if (line.amount !== undefined) line.amount = patch.price;
              else if (line.rate !== undefined) line.rate = patch.price;
              else if (storedBillingKind(line) === "flat") line.amount = patch.price;
              else if (storedBillingKind(line)) line.rate = patch.price;
              else return this.error(`${patch.name}: the saved line has no billing kind. Provide a complete billing recipe; price alone cannot infer one.`, [["lines", String(patchIndex), "billing"], ["lines", String(patchIndex), "price"]]);
              if (patch.currency) line.currency = patch.currency;
            } else if (patch.billing) {
              line = billingLine(patch, priorLine);
              if (priorLine) {
                if (priorLine.minimum) line.minimum = structuredClone(priorLine.minimum);
                if (priorLine.maximum) line.maximum = structuredClone(priorLine.maximum);
                if (previousKind === patch.billing.kind) {
                  if (line.amount === undefined && priorLine.amount !== undefined) line.amount = priorLine.amount;
                  if (line.rate === undefined && priorLine.rate !== undefined) line.rate = priorLine.rate;
                  if (line.periodHours === undefined && priorLine.periodHours !== undefined) line.periodHours = priorLine.periodHours;
                  if (line.commenced === undefined && priorLine.commenced !== undefined) line.commenced = priorLine.commenced;
                  if (line.quantity === undefined && priorLine.quantity !== undefined) line.quantity = priorLine.quantity;
                  if (line.quantityLabel === undefined && priorLine.quantityLabel !== undefined) line.quantityLabel = priorLine.quantityLabel;
                  if (line.resourceQuantity === undefined && priorLine.resourceQuantity !== undefined) line.resourceQuantity = priorLine.resourceQuantity;
                  if (line.resourceLabel === undefined && priorLine.resourceLabel !== undefined) line.resourceLabel = priorLine.resourceLabel;
                  if (line.perResourceQuantity === undefined && priorLine.perResourceQuantity !== undefined) line.perResourceQuantity = priorLine.perResourceQuantity;
                  if (line.percent === undefined && priorLine.percent !== undefined) line.percent = priorLine.percent;
                  if (line.baseLines === undefined && priorLine.baseLines !== undefined) line.baseLines = structuredClone(priorLine.baseLines);
                  if (!line.duration && priorLine.duration) line.duration = structuredClone(priorLine.duration);
                  if (!line.perQuantity && priorLine.perQuantity) line.perQuantity = priorLine.perQuantity;
                }
                if (priorLine.minimumDurationHours) line.minimumDurationHours = priorLine.minimumDurationHours;
                if (priorLine.statedExtension) line.statedExtension = priorLine.statedExtension;
              }
            } else line = priorLine ? structuredClone(priorLine) : billingLine(patch);
            if (patch.currency) line.currency = patch.currency;
            if (patch.minimum) line.minimum = patch.minimum;
            if (patch.maximum) line.maximum = patch.maximum;
            if (patch.minimumDurationHours !== undefined) line.minimumDurationHours = patch.minimumDurationHours;
            if (patch.statedExtension !== undefined) line.statedExtension = patch.statedExtension;
            if (patch.removeMinimum) delete line.minimum;
            if (patch.removeMaximum) delete line.maximum;
            if (patch.removeMinimumDuration) delete line.minimumDurationHours;
            if (patch.removeStatedExtension) delete line.statedExtension;
            if (line.minimumDurationHours && !["time", "gt-time"].includes(line.unit ?? "")) return this.error(`${patch.name}: minimum billable duration requires time billing.`, [["lines", String(patchIndex), "minimumDurationHours"]]);
            if (line.statedExtension !== undefined && line.amount !== undefined) return this.error(`${patch.name}: stated extension is a check for backend-derived billing, not a second flat amount.`, [["lines", String(patchIndex), "statedExtension"]]);
            if (index < 0) quote.lines.push(line); else quote.lines[index] = line;
            continue;
          }
          const line = index < 0 ? { ...patch } : { ...quote.lines[index], ...patch };
          if (patch.amount !== undefined && patch.rate === undefined) { delete line.rate; line.unit = "amount"; }
          if (patch.rate !== undefined && patch.amount === undefined) delete line.amount;
          if (patch.removeMinimum) delete line.minimum;
          if (patch.removeMaximum) delete line.maximum;
          if (patch.removeMinimumDuration) delete line.minimumDurationHours;
          if (patch.removeStatedExtension) delete line.statedExtension;
          delete line.removeMinimum; delete line.removeMaximum; delete line.removeMinimumDuration; delete line.removeStatedExtension;
          if (index < 0) quote.lines.push(line); else quote.lines[index] = line;
        }
      }
      for (const name of input.removeLines ?? []) {
        if (!quote.lines.some(line => key(line.name) === key(name))) return this.error("The named line to remove does not exist in this quotation.");
        quote.lines = quote.lines.filter(line => key(line.name) !== key(name));
      }
      if (quote.lines.length > 16 || new Set([...this.quotes.keys(), ...this.drafts.keys()]).size + (this.authority?.proposedQuoteCount() ?? 0) >= 24 && !prior) return this.error("Saved quote limit reached for this conversation.");
      const effectiveChange = !prior || canonical({ ...quote, baseline: undefined, revision: undefined }) !== canonical({ ...prior, baseline: undefined, revision: undefined });
      const needsApproval = !!this.authority && this.sensitive(quote) && (effectiveChange || !!draftPrior || !savedPrior || !this.authority.approvedQuote(quoteCore(savedPrior)));
      if (needsApproval && savedPrior && !this.authority!.approvedQuote(quoteCore(savedPrior))) delete quote.baseline;
      const result = await this.calculateCandidate(quote);
      abortSignal?.throwIfAborted();
      if (removals.length) result.body = `Scope explicitly removed: ${removals.map(safe).join(", ")}.\n\n` + result.body;
      if (command?.clearCallFields?.length) result.body = `Withdrawn particulars: ${command.clearCallFields.map(safe).join(", ")}.\n\n` + result.body;
      let draft: QuoteDraft | undefined;
      if (needsApproval && !this.answerOrder.has(`draft:${quote.id}`)) this.answerOrder.set(`draft:${quote.id}`, toolCallId ? this.answerOrder.get(toolCallId) ?? this.answerOrder.size : this.answerOrder.size);
      if (command && needsApproval) {
        quote.revision = (savedPrior?.revision ?? -1) + 1;
        const pendingQuote = { ...quote }; delete pendingQuote.baseline;
        const unsigned = { version: 1 as const, kind: "portia-quote-draft" as const, conversationId: this.conversationId,
          base: savedPrior ? AuthoritySession.binding(quoteCore(savedPrior)) : null, beforeDraftRevision: draftPrior?.draftRevision ?? -1,
          draftRevision: (draftPrior?.draftRevision ?? -1) + 1, quote: draftQuoteSchema.parse(pendingQuote) };
        draft = { ...unsigned, hash: hash(unsigned) };
        if (result.questions.length) {
          this.authority?.withdrawQuote(quote.id);
          this.drafts.set(quote.id, draft);
          this.rememberWork(quote, result, true);
          this.invalidateComparisons(quote.id);
          return { ...this.recordAnswer(`draft:${quote.id}`, { status: "unresolved", body: `**Unapproved draft — ${safe(quote.name)}; ID ${safe(quote.id)}**\n\n${quoteMetadata(quote)}Inputs retained for continuation. Complete these terms before exact review; no prices were approved.${result.totals?.length ? `\n\n**Unapproved identified subtotal — excludes every unresolved or unpriced line.**\n\n${result.body}` : ""}`, questions: result.questions }), quoteId: quote.id, draft };
        }
      }
      if (!needsApproval && !quote.baseline && result.status === "calculated" && result.totals?.length && !result.questions.length) quote.baseline = { totals: structuredClone(result.totals), lines: structuredClone(quote.lines), ...(quote.id.startsWith("legacy-") ? { imported: true } : {}) };
      if (needsApproval) {
        quote.revision = (savedPrior?.revision ?? -1) + 1;
        const preview = !result.questions.length && result.totals?.length ? { totals: result.totals.map(({ currency, amount }) => ({ currency, amount })) } : undefined;
        const proposal = this.authority!.propose({ id: randomUUID(), kind: "quote", quote: quoteCore(quote), before: savedPrior ? AuthoritySession.binding(quoteCore(savedPrior)) : null, previous: savedPrior ? quoteCore(savedPrior) : null, ...(preview ? { preview } : {}) }, command?.reviewGroup);
        const answer = this.recordAnswer(`draft:${quote.id}`, { ...proposal, body: `**Prepared quotation — ${safe(quote.name)} (unapproved)**\n\n${quoteMetadata(quote)}${proposal.body}` });
        if (draft) { this.drafts.set(quote.id, draft); this.rememberWork(quote, result, true); this.invalidateComparisons(quote.id); return { ...answer, quoteId: quote.id, draft }; }
        return answer;
      }
      const saved = this.saveCandidate(quote, savedPrior, result, effectiveChange || !!draftPrior, toolCallId);
      if (draftPrior) { this.drafts.delete(quote.id); this.answers.delete(`draft:${quote.id}`); this.answerKinds.delete(`draft:${quote.id}`); }
      return saved;
    });
  }
  private saveCandidate(quote: Quote, prior: Quote | undefined, result: QuoteResult, changed: boolean, toolCallId?: string): QuoteResult & {quoteId:string; revision:number; record?:RecordReceipt} {
    this.trackInputQuestions(quote.id, result.questions);
    for (const [answerId, target] of this.questionAnswerTargets) if (target === quote.id && answerId !== quote.id) {
      this.answers.delete(answerId); this.answerKinds.delete(answerId); this.questionAnswerTargets.delete(answerId);
    }
    const body = (quote.pricing === "official" ? `**${safe(quote.name)}**\n\n` : "") + quoteMetadata(quote) + renderResult(result) + quoteChanges(quote, result);
    if (!this.answerOrder.has(quote.id)) this.answerOrder.set(quote.id, toolCallId ? this.answerOrder.get(toolCallId) ?? this.answerOrder.size : this.answerOrder.size);
    this.answers.set(quote.id, body); this.answerKinds.set(quote.id, result.status);
    if (changed) this.invalidateComparisons(quote.id);
    if (prior && !changed) { this.rememberWork(quote, result); return { quoteId: quote.id, revision: quote.revision, ...result, body }; }
    const beforeRevision = prior?.revision ?? -1; quote.revision = beforeRevision + 1;
    this.rememberWork(quote, result);
    const unsigned = { version: 2 as const, kind: "portia-quote" as const, conversationId: this.conversationId, beforeRevision, quote };
    const record: RecordReceipt = { ...unsigned, hash: hash(unsigned) }; this.quotes.set(quote.id, quote);
    return { quoteId: quote.id, revision: quote.revision, ...result, body, record };
  }
  /** Called only with a private backend grant. Never exposed as an agent tool. */
  async applyApprovedQuote(operation: Extract<AuthorityOperation, { kind: "quote" }>) {
    validateDraftBindings(this.drafts, { version: 1, operations: [operation] });
    const candidate = operation.quote, prior = this.quotes.get(candidate.id);
    if (canonical(prior ? AuthoritySession.binding(quoteCore(prior)) : null) !== canonical(operation.before)) throw new Error("Approved quotation base changed.");
    if (candidate.revision !== (prior?.revision ?? -1) + 1 || prior && (candidate.pricing !== prior.pricing || canonical(candidate.unresolvedHistory ?? []) !== canonical(prior.unresolvedHistory ?? []))) throw new Error("Invalid approved quotation revision or historical conditions.");
    quoteInputSchema.parse({ name: candidate.name, pricing: candidate.pricing, call: candidate.call, ...(candidate.services.length ? { services: candidate.services } : {}), ...(candidate.lines.length ? { lines: candidate.lines } : {}) });
    storedTermsSchema.parse(candidate.terms);
    const quote = structuredClone(candidate) as Quote;
    const result = await this.calculateCandidate(quote);
    if (operation.preview && (result.questions.length || canonical(operation.preview.totals) !== canonical(result.totals?.map(({ currency, amount }) => ({ currency, amount }))))) throw new Error("Approved calculation preview no longer matches the exact terms.");
    const saved = this.saveCandidate(quote, prior, result, true);
    if (!saved.record || canonical(saved.record.quote) !== canonical(candidate)) throw new Error("Approved quotation changed during execution.");
    this.authority?.acceptQuote(candidate);
    this.rememberWork(quote, result);
    this.drafts.delete(candidate.id); this.answers.delete(`draft:${candidate.id}`); this.answerKinds.delete(`draft:${candidate.id}`);
    return { ...saved, record: saved.record };
  }
  async applyApprovedComparison(operation: Extract<AuthorityOperation, { kind: "comparison" }>) {
    return this.serialized(async () => {
      const rawInput = { ...operation.input }; delete rawInput.selectedScopes;
      const input = comparisonSchema.parse(rawInput);
      const current = input.quoteIds.map(id => this.quotes.get(id));
      if (current.some(q => !q) || canonical(current.map(q => AuthoritySession.binding(quoteCore(q!)))) !== canonical(operation.quotes.map(({ quoteId,revision,digest }) => ({quoteId,revision,digest})))) throw new Error("Approved comparison base changed.");
      this.authority?.acceptComparison(operation);
      return this.compareSnapshot(input, "comparison:" + randomUUID(), operation);
    });
  }

  private invalidateComparisons(quoteId: string) {
    for (const [id, members] of this.comparisons) if (members.has(quoteId)) { this.answers.delete(id); this.answerKinds.delete(id); this.comparisons.delete(id); }
  }

  error(message: string, invalidFields: string[][] = []) { const id = "error:" + randomUUID(); this.answers.set(id, message); this.answerKinds.set(id, "error"); return { status: "error" as const, error: message, body: message, questions: [], errorId: id, invalidFields }; }
  reserveAnswer(id: string) { if (!this.answers.has(id)) this.answers.set(id, ""); if (!this.answerOrder.has(id)) this.answerOrder.set(id, this.answerOrder.size); }
  recordAnswer<T extends AnswerResult>(id: string, result: T, inputQuestions: readonly string[] = result.questions): T {
    this.reserveAnswer(id);
    const target = "quoteId" in result && typeof result.quoteId === "string" ? result.quoteId : id;
    if (target !== id) this.questionAnswerTargets.set(id, target);
    this.trackInputQuestions(target, inputQuestions); this.answers.set(id, renderResult(result));
    if (result.status) this.answerKinds.set(id, result.status); return result;
  }
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
      if (this.currentInputQuestions.get(result.toolCallId)) this.questionTools.set(result.toolCallId, { toolName: result.toolName, input: result.input });
      if (this.currentInputQuestions.has(result.toolCallId) && result.toolName === "calculate_elapsed_time" && result.input && typeof result.input === "object") {
        const next = result.input as Record<string, unknown>, retry = typeof next.retryOf === "string" ? this.questionTools.get(next.retryOf) : undefined;
        const previous = retry?.input && typeof retry.input === "object" ? retry.input as Record<string, unknown> : undefined;
        if (retry?.toolName === result.toolName && previous && previous.label === next.label) {
          const id = String(next.retryOf); this.currentInputQuestions.delete(id); this.questionTools.delete(id); this.answers.delete(id); this.answerKinds.delete(id);
        }
      }
      const failed = !!output && typeof output === "object" && ("error" in output || "status" in output && output.status === "error" || "saved" in output && output.saved === false);
      if (failed) this.incompleteTools.set(result.toolCallId, { toolName: result.toolName, input: result.input,
        ...(typeof output === "object" && output && "invalidFields" in output && Array.isArray(output.invalidFields) && output.invalidFields.every(path => Array.isArray(path) && path.every(field => typeof field === "string")) ? { invalidFields: output.invalidFields as string[][] } : {}),
        ...(typeof output === "object" && output && "errorId" in output && typeof output.errorId === "string" ? { errorId: output.errorId } : {}) });
      else if (output !== undefined && !(typeof output === "object" && output && "status" in output && output.status === "unresolved" && !("approvalRequired" in output && output.approvalRequired === true) && !("draft" in output))) {
        for (const [id, prior] of this.incompleteTools) {
          if (prior.toolName !== result.toolName) continue;
          // Exact transient retry, or successful validation with every unaffected
          // argument unchanged. Reading the same quote does not repair a correction.
          if (id === result.toolCallId || prior.input !== undefined && result.input !== undefined && (canonical(presentFields(prior.input)) === canonical(presentFields(result.input)) || result.toolName === "manage_quote" && (repairsInvalidQuote(prior.input, result.input) || repairsRejectedFields(prior.input, result.input, prior.invalidFields ?? [])) || result.toolName === "calculate_charges" && repairsArithmetic(prior.input, result.input, prior.errorId))) {
            this.incompleteTools.delete(id);
            if (prior.errorId) { this.answers.delete(prior.errorId); this.answerKinds.delete(prior.errorId); }
          }
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
        this.recordRecall(result.toolCallId, output.facts.map(fact => ({ key: String(fact.key), value: String(fact.value) })));
      }
      if (result.toolName === "read_scratchpad" && "markdown" in output && typeof output.markdown === "string") { this.recalledTools.add(result.toolCallId); this.auxiliary.set(result.toolCallId, output.markdown ? "Private notes for this chat (historical working data):\n\n" + output.markdown : "This chat has no private working notes."); }
    }
  }
  async compare(raw: z.infer<typeof comparisonSchema>, answerId = "comparison:" + randomUUID()) {
    return this.serialized(() => this.compareSnapshot(raw, answerId));
  }
  private async compareSnapshot(raw: z.infer<typeof comparisonSchema>, answerId: string, approvedOperation?: Extract<AuthorityOperation,{kind:"comparison"}>) {
    const rawInput = { ...raw } as z.infer<typeof comparisonSchema> & {selectedScopes?:unknown}; delete rawInput.selectedScopes;
    const input = comparisonSchema.parse(rawInput);
    const { reviewGroup, ...comparisonInput } = input;
    const exactApproved = !!approvedOperation && !!this.authority?.approvedComparison(approvedOperation);
    for (const code of [input.currency, ...(input.exchangeRates ?? []).flatMap(rate => [rate.from, rate.to])]) {
      if (code && !knownCurrencyCode(code)) return this.error(`${safe(code)} is not a recognized currency code in the runtime ISO 4217 catalog. The supplied code was retained; provide the correct code before comparison.`);
    }
    const pending = input.quoteIds.filter(id => this.drafts.has(id) && !this.authority?.pendingQuote(id));
    if (pending.length) return this.error("Comparison is incomplete: these quotations have unapproved draft changes. Complete and approve those changes first: " + pending.map(safe).join(", "));
    if (input.rounding && /\b(?:no|without)\s+(?:monetary\s+)?rounding\b/i.test(this.currentRequest)) return this.error("The requested comparison is exact, without monetary rounding. Set rounding to null; a high decimal precision is still rounding.");
    if (new Set(input.quoteIds).size !== input.quoteIds.length) return this.error("Select distinct saved quotations.");
    const quotes = input.quoteIds.map(id => this.authority?.pendingQuote(id) as Quote | undefined ?? this.quotes.get(id));
    if (quotes.some(quote => !quote)) return this.error("A selected quotation is not saved in this conversation.");
    const results = await Promise.all(quotes.map(quote => this.authority?.pendingQuote(quote!.id) ? this.calculateCandidate(quote!) : this.calculate(quote!)));
    if (results.some(result => result.sourceClass === "published-reference" || result.status === "estimated" || result.totals?.some(total => total.basis === "reference"))) return this.error("A selected quotation is a dated reference or conditional estimate with unconfirmed current applicability. These amounts cannot support a definitive price ranking; their source limitations remain visible in each saved estimate.");
    if (results.some(result => result.status !== "calculated" || result.questions.length || !result.totals?.length)) return this.error("Each comparison side needs resolved totals for every requested service; complete its missing details first.");
    const totals = results.map(result => result.totals!);
    const scope = (rows: NonNullable<QuoteResult["totals"]>) => JSON.stringify(rows.flatMap(row => row.chargeIds.map(id => [row.basis, id])).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
    const scopes = totals.map(scope), mismatched = scopes.some(value => value !== scopes[0]);
    if (mismatched) {
      if (!input.scopeEquivalence) return this.error("The selected quotations cover different services. Provide an explicit supplied-package scope equivalence statement before ranking their prices.");
      if (!exactApproved && !grounded(input.scopeEquivalence.statement, this.currentRequest)) return this.error("The supplied scope-equivalence statement is not grounded in the current human request.");
      if (quotes.some(quote => quote!.pricing !== "supplied")) return this.error("Scope equivalence can bridge differently named supplied packages only; official/reference scopes must match exactly.");
    }
    const currencies = [...new Set(totals.flatMap(rows => rows.map(row => row.currency)))];
    const currency = input.currency ?? (currencies.length === 1 ? currencies[0] as z.infer<typeof currencySchema> : undefined);
    if (!currency) return this.error("Choose a comparison currency because the selected totals use more than one currency.");
    const fxPairs = (input.exchangeRates ?? []).map(rate => `${rate.from}:${rate.to}`);
    if (new Set(fxPairs).size !== fxPairs.length) return this.error("Provide exactly one conversion rate per currency pair; duplicate rates are ambiguous.");
    const converted: Array<{ name: string; sourceCurrency: string; sourceAmount: string; amount: string; sourceTotals?: Array<{ currency: string; amount: string }> }> = [];
    for (const [index, rows] of totals.entries()) {
      let amount = new Decimal(0);
      for (const total of rows) {
        const fx = total.currency === currency ? undefined : input.exchangeRates?.find(rate => rate.from === total.currency && rate.to === currency);
        if (total.currency !== currency && !fx) return this.error(`Provide the ${total.currency} to ${currency} conversion rate; no exchange rate is assumed.`);
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
    if (this.authority && !exactApproved && (input.exchangeRates?.length || input.rounding || input.scopeEquivalence || quotes.some(quote => !!this.authority?.pendingQuote(quote!.id)))) {
      const operationInput = { ...comparisonInput, currency, selectedScopes: quotes.map((quote,index)=>({quoteId:quote!.id,lineScopes:totals[index].flatMap(total=>total.chargeIds).sort()})) };
      const operation = { id: randomUUID(), kind: "comparison" as const, input: operationInput, quotes: quotes.map(q => ({ ...AuthoritySession.binding(quoteCore(q!)), name: q!.name })) };
      if (!this.authority.approvedComparison(operation)) return this.recordAnswer(answerId, this.authority.propose(operation, reviewGroup));
    }
    const ranked = [...converted].sort((left, right) => new Decimal(left.amount).cmp(right.amount));
    const difference = new Decimal(ranked.at(-1)!.amount).minus(ranked[0].amount).toString();
    const body = `**Saved quotation comparison**\n\n| Quotation | Supplied/source total | ${currency} comparison |\n|---|---:|---:|\n${converted.map(row => `| ${safe(row.name)} | ${row.sourceTotals ? row.sourceTotals.map(t => money(t.currency, t.amount)).join(" + ") : money(row.sourceCurrency, row.sourceAmount)} | ${money(currency, row.amount)} |`).join("\n")}\n\n${new Decimal(difference).eq(0) ? "The totals are equal." : `**${safe(ranked[0].name)}** has the lower total; difference from ${safe(ranked.at(-1)!.name)}: **${money(currency, difference)}**.`}\n\n${input.scopeEquivalence ? `Confirmed supplied-package scope equivalence: ${safe(input.scopeEquivalence.statement)}. ` : ""}${(input.exchangeRates ?? []).map(rate => `Supplied FX: ${rate.to} ${rate.rate} per ${rate.from} 1${rate.date ? ` (${safe(rate.date)})` : ""}.`).join(" ")} ${input.rounding ? `Half-up conversion rounding per ${input.rounding.stage} to ${input.rounding.decimals} decimals.` : "Exact comparison; no monetary rounding."} Compares included services and stated scenarios, not unquoted invoice items or operational suitability.${quotes.some(quote => quote!.pricing === "official") ? " Current tariff applicability remains unverified; conditional source limitations carry through this comparison." : ""}`;
    this.answers.set(answerId, body); this.answerKinds.set(answerId, "calculated"); this.comparisons.set(answerId, new Set(input.quoteIds));
    return { status: "calculated", body, questions: [], converted, difference, currency };
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
