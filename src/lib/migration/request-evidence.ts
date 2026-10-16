import type { ModelMessage } from "ai";
import Decimal from "decimal.js";
import { calculateElapsedTime } from "./elapsed-time";
import { buildCallContext, currentFacts, temporalFacts, type CallContext, type ContextFact } from "./call-context";

type TimeInput = Parameters<typeof calculateElapsedTime>[0];
type Event = { raw: string; original: string; label: string; scopeId: string; factId: string; role?: "berthStart" | "berthEnd" };
type Interval = { label: string; start: Event; end: Event; hours: string };
type Calculation = { id: string; expression: string; result: string };
const normalize = (text: string) => text.toLowerCase().replace(/\bat\b/g, " ").replaceAll(",", " ").replace(/\s+/g, " ").trim();
const pricingRequest = (text: string) => /berth[ -]?hire|berth.{0,10}charg|port.{0,10}charg|tariff|quotation|quote|estimate/i.test(text);
const rateEvidence = (text: string) => /(?:₹|\$|€|£|\bINR|\bUSD|\bEUR|\bGBP)\s*\d[\d,.]*\s*(?:\/|per\b)/i.test(text) || /\brate\s*(?:is|of|=|:|at)?\s*(?:₹|\$|€|£|INR|USD|EUR|GBP)?\s*\d[\d,.]*\s*(?:\/|per\b)/i.test(text);
const canonicalNumber = (value: string) => { try { return new Decimal(value.replaceAll(",", "").replace(/\s/g, "")).toString(); } catch { return ""; } };

function monetaryTableValues(text: string): string[] {
  const values: string[] = []; let columns: number[] = [];
  for (const line of text.split("\n")) {
    if (!line.includes("|")) { columns = []; continue; }
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map(c => c.replace(/[*`]/g, "").trim());
    if (cells.some(c => /amount|result|total|cost|₹|\bINR\b|\bUSD\b/i.test(c)) && !cells.some(c => /^\d[\d,.]*$/.test(c))) {
      columns = cells.flatMap((c, i) => /amount|result|total|cost|₹|\bINR\b|\bUSD\b/i.test(c) && !/formula|expression/i.test(c) ? [i] : []);
      continue;
    }
    for (const i of columns) {
      const match = /^(?:(?:₹|\$|€|£|INR|USD|EUR|GBP)\s*)?(\d[\d,]*(?:[\s\u202f]\d{3})*(?:\.\d+)?)$/.exec(cells[i] ?? "");
      if (match) values.push(canonicalNumber(match[1]));
    }
  }
  return values;
}

/** Evidence belongs to authenticated user turns, never to an assistant's invented inputs. */
export class RequestEvidence {
  sourceText = "";
  latestText = "";
  forcedResponse: string | undefined;
  tariffConsulted = false;
  suppliedQuotationActive = false;
  suppliedQuotationId: string | undefined;
  officialTariffActive = false;
  officialTariffId: string | undefined;
  private events: Event[] = [];
  private intervals: Interval[] = [];
  context: CallContext = buildCallContext([]);
  private gt: string | undefined;
  private hours: string | undefined;
  private calculations: Calculation[] = [];

  initialize(messages: readonly ModelMessage[]) {
    this.context = buildCallContext(messages, this.context);
    this.sourceText = this.context.userText; this.latestText = this.context.latestText;
    this.forcedResponse = undefined; this.tariffConsulted = false; this.suppliedQuotationActive = false; this.suppliedQuotationId = undefined; this.officialTariffActive = false; this.officialTariffId = undefined; this.calculations = []; this.events = []; this.intervals = [];
    const facts = currentFacts(this.context);
    const singleScope = this.context.activeScopeIds.length === 1;
    this.gt = singleScope ? facts.find(f => f.field === "gt" && f.status === "established")?.value : undefined;
    this.hours = singleScope ? facts.find(f => f.field === "durationHours" && f.status === "established")?.value : undefined;
    const labels: Record<string, string> = { berthStart: "all fast", berthEnd: "last line away", anchorageArrival: "arrived anchorage", cargoCompleted: "cargo completed", portDeparture: "departed port limits", intervalStart: "Start", intervalEnd: "End" };
    const event = (fact: ContextFact): Event => ({ raw: fact.value, original: fact.origin.raw, label: labels[fact.field] ?? fact.field, scopeId: fact.scopeId, factId: fact.id,
      role: fact.field === "berthStart" || fact.field === "berthEnd" ? fact.field : undefined });
    for (const scopeId of this.context.activeScopeIds) {
      const time = temporalFacts(this.context, scopeId);
      const events = time.events.map(event);
      this.events.push(...events);
      const prefix = singleScope ? "" : `${this.context.scopes.find(s => s.id === scopeId)?.label}: `;
      for (const pair of time.pairs) this.addInterval(prefix + pair.label, event(pair.start), event(pair.end));
    }
    // Retain the existing GT/time containment boundary. Newly recognized invalid
    // fields remain scoped issues, not new blanket refusals for independent work.
    const independentArithmetic = this.context.tasks.some(t => t.kind === "arithmetic" && t.status === "ready");
    const scopedCodes = ["INVALID_NUMERIC_TOKEN", "UNSUPPORTED_UNIT", "FORM_UNIT_CONFLICT", "MEASUREMENT_UNIT_CONFLICT", "MEASUREMENT_CONFLICT", "FORM_FIELD_CONFLICT", "EVENT_ORDER_CONFLICT"];
    const issue = this.context.issues.find(i => this.context.activeScopeIds.includes(i.scopeId)
      && !["MISSING_TIME_ZONE", "INVALID_TIME_ZONE", "INVALID_TIMESTAMP"].includes(i.code)
      && !(independentArithmetic && scopedCodes.includes(i.code))
      && (i.code !== "INVALID_QUANTITY" || i.fields.includes("gt")));
    if (issue) {
      this.forcedResponse = scopedCodes.includes(issue.code)
        ? [this.particulars(), this.timeSummary(), issue.message].filter(Boolean).join("\n\n") : issue.message;
      return;
    }
    if (pricingRequest(this.sourceText) && !this.gt && /\b(?:ship|vessel)\b.{0,24}\d[\d,]*(?:\.\d+)?\s*(?:tonnes|tons)\b/i.test(this.latestText)) {
      this.forcedResponse = "Please clarify whether the vessel's tonnage is GT/GRT, DWT, or displacement. These are not interchangeable. I also need an applicable tariff or an explicitly supplied rate before calculating a price.";
    } else if (pricingRequest(this.latestText) && /\bguarantee(?:d)?\b/i.test(this.latestText)) {
      this.forcedResponse = "I cannot guarantee a final port bill. The terminal, tariff effective on the call date, billable-time rules, taxes and applicable conditions must be confirmed. A calculation from a supplied quotation can only be conditional on those inputs; it is not a guaranteed official charge.";
    }
  }

  activateSuppliedQuotation(id: string) {
    // The quotation compiler binds stay durations and billing periods separately.
    // Only its complete source-backed plan can supersede the old flat-hours guard.
    if (this.forcedResponse && (!this.context.issues.length || this.context.issues.some(i => i.fields.some(f => f !== "durationHours")))) return false;
    this.forcedResponse = undefined; this.suppliedQuotationActive = true; this.suppliedQuotationId = id; return true;
  }

  activateOfficialTariff(id: string) {
    if (this.forcedResponse) return false;
    this.officialTariffActive = true; this.officialTariffId = id; return true;
  }

  private addInterval(label: string, start: Event, end: Event) {
    if (start.scopeId !== end.scopeId || this.intervals.some(i => i.start.factId === start.factId && i.end.factId === end.factId)) return;
    const time = temporalFacts(this.context, start.scopeId);
    const result = calculateElapsedTime({ start: start.raw, end: end.raw, timeZone: time.timeZone, dateOrder: time.dateOrder });
    if (result.status === "ok") this.intervals.push({ label, start, end, hours: result.elapsedHours });
  }

  particulars() {
    const [integer, fraction] = this.gt?.split(".") ?? [];
    const gt = integer ? integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction ? `.${fraction}` : "") : undefined;
    return [gt ? `Supplied GT: ${gt}` : "", this.hours ? `Supplied berth stay: ${this.hours} hours` : ""].filter(Boolean).join("; ");
  }
  contextSummary() {
    return JSON.stringify({ schemaVersion: this.context.schemaVersion, revision: this.context.revision, hash: this.context.hash,
      scopes: this.context.scopes.filter(s => this.context.activeScopeIds.includes(s.id)),
      facts: currentFacts(this.context).filter(f => ["established", "invalid", "conflicting"].includes(f.status)).map(f => ({ field: f.field, value: f.value, unit: f.unit, scopeId: f.scopeId, status: f.status, source: { kind: f.origin.kind, messageIndex: f.origin.messageIndex, field: f.origin.fieldName, raw: f.origin.raw } })),
      tasks: this.context.tasks, issues: this.context.issues.filter(i => this.context.activeScopeIds.includes(i.scopeId)) });
  }
  timeSummary() {
    return this.intervals.map(i => `${i.label}: ${i.hours} hours (${i.start.raw} → ${i.end.raw}).`).join("\n");
  }
  formFacts() {
    return [this.particulars(), ...this.intervals.slice(0, 1).map(i => `${i.label}: ${i.hours} hours. Billable time requires the tariff.`)].filter(Boolean).join(". ");
  }
  needsAnswerValidation() { return pricingRequest(this.sourceText) || this.events.length > 0; }
  clarification(reason: string) {
    return [this.particulars(), this.timeSummary(), reason, "Elapsed time is not automatically billable time. No final tariff-based estimate has been established."].filter(Boolean).join("\n\n");
  }
  timeInput(input: TimeInput): TimeInput | { error: string } {
    const resolve = (raw: string) => {
      const normalized = normalize(raw);
      const matches = this.events.filter(e => normalize(e.raw) === normalized || normalize(e.original) === normalized || normalize(e.raw).endsWith(` ${normalized}`));
      return matches.length === 1 ? matches[0] : undefined;
    };
    const start = resolve(input.start); const end = resolve(input.end);
    if (!start || !end || start.scopeId !== end.scopeId) {
      this.forcedResponse = this.clarification(this.intervals.length
        ? "These timings come directly from your supplied timestamps. Please provide the applicable port/terminal tariff for pricing."
        : "Please confirm the complete start/end timestamps only if an elapsed-time calculation is needed. A supplied stay duration can be used directly; pricing still requires the relevant terminal and tariff or a supplied rate.");
      return { error: "Timestamp is absent from or ambiguous in the user's supplied evidence. Do not invent or reverse it." };
    }
    const time = temporalFacts(this.context, start.scopeId);
    return { start: start.raw, end: end.raw, timeZone: time.timeZone, dateOrder: time.dateOrder };
  }
  recordTime(input: TimeInput, result: ReturnType<typeof calculateElapsedTime>) {
    if (result.status !== "ok") this.forcedResponse = this.clarification(result.message);
    void input;
  }
  authorizeArithmetic() {
    if (!pricingRequest(this.sourceText) || rateEvidence(this.sourceText) || this.tariffConsulted) return true;
    this.forcedResponse = this.clarification("No rate was supplied or established from a tariff. Please provide the applicable rate and units, or a supported port/terminal tariff. I cannot invent a rate or label one as supplied.");
    return false;
  }
  authorizePort(slug: string) {
    const selections = this.context.scopes.filter(s => this.context.activeScopeIds.includes(s.id)).flatMap(s => s.port ? [s.port] : []);
    if (selections.some(p => (p.status === "identified" || p.status === "comparison") && p.candidates.includes(slug))) return true;
    // Preserve the non-price tool path while migrating its authority contract.
    if (!selections.length && !pricingRequest(this.sourceText)) return true;
    this.forcedResponse = this.clarification("I cannot substitute a different port or terminal's tariff for the location you requested. Please provide the applicable tariff or confirm the exact supported port/terminal. Berth/terminal applicability and date-effective rates must be established before pricing.");
    return false;
  }
  recordCalculations(calculations: Calculation[]) { this.calculations.push(...calculations); }
  guardAnswer(text: string): string | undefined {
    if (this.forcedResponse) return this.forcedResponse;
    const amounts = [...text.matchAll(/(?:₹|\$|€|£|\bINR|\bUSD|\bEUR|\bGBP)\s*(\d[\d,]*(?:[\s\u202f]\d{3})*(?:\.\d+)?)/gi)].map(m => canonicalNumber(m[1])).concat(monetaryTableValues(text));
    if (amounts.length && pricingRequest(this.sourceText)) {
      if (!this.authorizeArithmetic()) return this.forcedResponse;
      const suppliedMoney = [...this.sourceText.matchAll(/(?:₹|\$|€|£|\bINR|\bUSD|\bEUR|\bGBP)\s*(\d[\d,]*(?:\.\d+)?)/gi)].map(m => canonicalNumber(m[1]));
      const calculatedInputs = this.calculations.flatMap(c => [...c.expression.replace(/\$[a-z][a-z0-9_]*/gi, "").matchAll(/\d+(?:\.\d+)?/g)].map(m => canonicalNumber(m[0])));
      const verified = new Set([...suppliedMoney, ...calculatedInputs, ...this.calculations.map(c => canonicalNumber(c.result))]);
      if (amounts.some(amount => !verified.has(amount))) {
        return this.calculations.length
          ? `The drafted amounts did not match the calculator outputs. I cannot provide a reliable quote from that draft.\n\nArithmetic audit only:\n\n| Item | Expression | Exact result |\n|---|---|---|\n${this.calculations.map(c => `| ${c.id} | ${c.expression} | ${c.result} |`).join("\n")}\n\nThese outputs verify arithmetic only, not tariff applicability, units, taxes or completeness. Confirm the applicable rules before using any total.`
          : this.clarification("I cannot verify the drafted amount against a calculator result. Please confirm the supplied rate and rule before using a monetary estimate.");
      }
    }
    if (this.intervals.length && !this.tariffConsulted && !rateEvidence(this.sourceText)) {
      const allowed = new Set(this.intervals.map(i => canonicalNumber(i.hours)));
      const hours = [...text.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/gi)].map(m => canonicalNumber(m[1]));
      if (hours.some(h => !allowed.has(h))) return this.clarification("Use the verified elapsed intervals above. The applicable tariff is needed to determine billable time and charges.");
    }
    if (pricingRequest(this.sourceText) && /\b(?:I|we)(?:['’]ll| will| can)?[^.!?]{0,80}\bguaranteed\s+(?:final\s+)?(?:amount|price|charge|quote)/i.test(text)) {
      return "I can calculate a conditional estimate from verified inputs, but cannot guarantee a final port bill. Confirm the terminal, date-effective tariff and applicable conditions with the port authority.";
    }
    return undefined;
  }
}
