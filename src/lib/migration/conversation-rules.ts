import "server-only";
import Decimal from "decimal.js";
import { calculateChargeBatch } from "./calculator-batch";
import { calculateTariffExpression } from "./calculator";
import { calculateElapsedTime } from "./elapsed-time";
import { calculateOfficialBerth, loadOfficialBerthRules, renderOfficialBerth, type OfficialBerthPlan } from "./official-berth";
import { currentConversationFact as fact, unresolvedConversationField, monetaryEvidenceCurrency, conversationDigest as digest, type ConversationField, type ConversationState, type ConversationTask } from "./conversation";
import type { QuoteBinding } from "./supplied-quotation";
import { SUPPORTED_PORTS } from "./ports";
import { reviewedComponents } from "./reviewed-components";
import coverageGaps from "../../../data/reviewed-tariffs/coverage-gaps.json";

export type AnswerItem = {
  taskId: string; scopeId: string; kind: ConversationTask["kind"]; status: "calculated" | "explained" | "unresolved" | "excluded" | "not-applicable";
  label?: string;
  sourceClass: "official-tariff" | "user-supplied-quotation" | "user-facts" | "auxiliary"; body: string; dependencies: string[]; pending: string[];
  calculation?: unknown;
  totals?: Array<{currency:string;amount:string;chargeIds:string[];basis:"scoped-quote"|"component";lineAmounts?:string[]}>;
};
export type ConversationAnswer = {
  version: 1; kind: "conversation-answer"; id: string; binding: QuoteBinding; contextHash: string;
  items: AnswerItem[]; complete: boolean;
  questions: Array<{ scopeId: string; field: ConversationField; label: string; unit: string }>;
};
const labels: Partial<Record<ConversationField, string>> = {
  gt: "gross tonnage (GT/GRT)", terminal: "berth/terminal", berthStart: "when the berth was taken", berthEnd: "when the berth was left", readinessTime: "valid readiness-to-sail time",
  coastalLicence: "valid dedicated coastal licence throughout this call", vesselCategory: "vessel category", flag: "flag", service: "coastal or foreign service", cargoOperation: "loading/discharging operation",
  idleTime: "port-caused idle time", falseReadiness: "false readiness signal", favourableConditions: "favourable tide/weather", directBilling: "port bills the service directly", registeredCustomer: "GST registration", privateCustomer: "private customer status",
  supplierState: "supplier state", supplyState: "place-of-supply state", sez: "SEZ status", taxExemption: "tax exemption/concession", standaloneBill: "standalone bill or part of a larger invoice",
  otherAdjustments: "any other discounts/surcharges/adjustments", taxPercent: "supplied tax rate (zero only if excluded)", periodHours: "quoted billing period", basis: "quoted rate units", rounding: "exact or commenced billing periods",
};
function value(state: ConversationState, scope: string, field: ConversationField) { return fact(state, scope, field)?.value; }
function need(state: ConversationState, scope: string, fields: ConversationField[]) {
  return fields.filter(field => !fact(state, scope, field)).map(field => labels[field] ?? field);
}
const money = (currency: string, raw: string) => {const n=new Decimal(raw);return `${currency} ${n.toFixed(Math.max(2,n.decimalPlaces())).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;};
const safe = (text: string) => text.replace(/[|\n\r<>]/g, " ");
function unresolved(task: ConversationTask, pending: string[]): AnswerItem {
  return { taskId: task.id, scopeId: task.scopeId, kind: task.kind, status: "unresolved", sourceClass: task.source === "official" ? "official-tariff" : task.source === "supplied" ? "user-supplied-quotation" : "user-facts", body: "", dependencies: [], pending };
}
function times(state: ConversationState, scope: string) {
  const start = value(state, scope, "berthStart"), end = value(state, scope, "berthEnd");
  if (!start || !end) return undefined;
  return calculateElapsedTime({ start, end, timeZone: value(state, scope, "timeZone"), dateOrder: value(state, scope, "dateOrder") as "DMY" | "MDY" | undefined });
}
function elapsedTask(state: ConversationState, task: ConversationTask): AnswerItem {
  const scope = task.scopeId;
  const chain: ConversationField[] = ["anchorageArrival", "berthStart", "cargoCompleted", "berthEnd", "portDeparture"];
  const present = chain.filter(f => fact(state, scope, f));
  const pairs: Array<[ConversationField, ConversationField, string]> = [];
  if (fact(state, scope, "berthStart") && fact(state, scope, "berthEnd")) pairs.push(["berthStart", "berthEnd", "Elapsed berth occupancy"]);
  if (fact(state, scope, "intervalStart") && fact(state, scope, "intervalEnd")) pairs.push(["intervalStart", "intervalEnd", "Elapsed interval"]);
  for (let i = 1; i < present.length; i++) if (!pairs.some(p => p[0] === present[i - 1] && p[1] === present[i])) pairs.push([present[i - 1], present[i], `${present[i - 1]} → ${present[i]}`]);
  if (present.length > 2) pairs.push([present[0], present.at(-1)!, "Full recorded visit"]);
  if (!pairs.length) return unresolved(task, ["the start and end events with their full timestamps"]);
  const pending: string[] = [], lines: string[] = [], calculations: unknown[] = [];
  const dependencies = new Set<string>();
  for (const [start, end, label] of pairs) {
    const time = calculateElapsedTime({ start: value(state, scope, start)!, end: value(state, scope, end)!, timeZone: value(state, scope, "timeZone"), dateOrder: value(state, scope, "dateOrder") as "DMY" | "MDY" | undefined });
    if (time.status !== "ok") { pending.push(`${label}: ${time.message}`); continue; }
    for (const field of [start, end, "timeZone", "dateOrder"] as const) { const f = fact(state, scope, field); if (f) dependencies.add(f.id); }
    calculations.push(time); lines.push(`${label}: **${time.elapsedHours} hours** (${time.startUtc} → ${time.endUtc}).`);
  }
  return { taskId: task.id, scopeId: scope, kind: task.kind, status: lines.length ? "calculated" : "unresolved", sourceClass: "user-facts", dependencies: [...dependencies], pending, body: lines.length ? lines.join("\n\n") + "\n\nElapsed occupancy is separate from tariff billing time." : "", calculation: calculations };
}
function factsTask(state: ConversationState, task: ConversationTask): AnswerItem {
  const current = state.facts.filter(f => f.scopeId === task.scopeId && f.status !== "superseded" && f.status !== "reference");
  const established = current.filter(f => f.status === "established");
  const pending = current.filter(f => f.status === "conflicting").map(f => f.validationError ?? `Confirm the intended ${labels[f.field] ?? f.field}; its meaning or value is unresolved.`);
  for (const rejected of current.filter(f => f.status === "rejected")) if (!established.some(f => f.field === rejected.field)) pending.push(`The ${rejected.field} value was rejected; please confirm its replacement.`);
  const body = established.map(f => `${f.field === "gt" ? "GT" : f.field}: ${safe(f.value)}${f.unit ? ` ${safe(f.unit)}` : ""}`).join("; ") || (!pending.length ? "No current particulars have been established from the reference information." : "");
  return { taskId: task.id, scopeId: task.scopeId, kind: task.kind, status: body ? "explained" : "unresolved", sourceClass: "user-facts", dependencies: established.map(f => f.id), pending: [...new Set(pending)], body };
}

/** A shared operation family for quoted rates. No model expressions or totals.
 * Every declared charge has a disposition; currencies are never silently mixed. */
function suppliedTask(state: ConversationState, task: ConversationTask): AnswerItem {
  const scope = task.scopeId;
  const pending: string[] = [];
  if (!task.ruleScopeIds.length) return unresolved(task, ["the supplied charge terms and units"]);
  if (task.charges.length !== task.ruleScopeIds.length || new Set(task.charges).size !== task.charges.length || new Set(task.ruleScopeIds).size !== task.ruleScopeIds.length) return unresolved(task, ["a separate unique quoted rule for every requested charge"]);
  const namedCharges = task.ruleScopeIds.map(id => value(state,id,"charge")).filter((v): v is string => v !== undefined);
  if (new Set(namedCharges).size !== namedCharges.length || namedCharges.some(name => !task.charges.includes(name))) return unresolved(task,["the quoted rules do not map uniquely to the requested charges"]);
  const taxTreatment=value(state,scope,"tax");
  if(taxTreatment==="exempt"||taxTreatment==="included")return unresolved(task,["The supplied tax treatment needs an implemented calculation rule."]);
  if(taxTreatment==="percentage"&&!value(state,scope,"taxPercent"))return unresolved(task,["The interpretation omitted the supplied tax percentage."]);
  const suppliedTax = taxTreatment==="none" ? "0" : value(state, scope, "taxPercent");
  const tax = suppliedTax ?? "0";
  const unresolvedTax = unresolvedConversationField(state,scope,"taxPercent");
  if (unresolvedTax) pending.push("tax treatment is conflicting or withdrawn; confirm the governing tax term");
  if (unresolvedConversationField(state,scope,"otherAdjustments")) return unresolved(task,["the adjustment conditions are conflicting or withdrawn; confirm the governing terms"]);
  if (["moneyRounding","moneyDecimals"].some(f=>unresolvedConversationField(state,scope,f as ConversationField)))return unresolved(task,["the monetary rounding terms are conflicting or withdrawn"]);
  if (value(state, scope, "otherAdjustments") === "true") pending.push("the governing adjustment rule; the base quote cannot silently omit it");
  const expressions: Array<{ id: string; expression: string }> = [];
  const rows: Array<{ id: string; charge: string; currency: string; formula: string }> = [];
  const dependencies = new Set<string>();
  const readFact = (owner: string, field: ConversationField) => { const f = fact(state, owner, field); if (f) dependencies.add(f.id); return f?.value; };
  for (const [index, ruleScope] of task.ruleScopeIds.entries()) {
    const pendingAtStart = pending.length, expressionsAtStart = expressions.length;
    for (const field of ["minimum","maximum","minimumTreatment","maximumTreatment","minimumScope","maximumScope","otherAdjustments","taxPercent"] as const) if (unresolvedConversationField(state,ruleScope,field)) pending.push(`${task.charges[index]}: ${field} is conflicting or withdrawn`);
    const id = `charge_${index}`;
    const charge = readFact(ruleScope, "charge"), basis = readFact(ruleScope, "basis"), currency = readFact(ruleScope, "currency"), rate = readFact(ruleScope, "rate");
    pending.push(...need(state, ruleScope, ["charge", "basis", "currency", "rate"]).map(m => `${task.charges[index]}: ${m}`));
    if (!charge || !task.charges.includes(charge)) { pending.push("quoted charge identity does not match requested scope"); continue; }
    if (!basis || !currency || !rate) continue;
    for (const field of ["rate","minimum","maximum"] as const) {
      const term = field!=="rate"&&value(state,ruleScope,(field+"Treatment") as ConversationField)==="none"?undefined:fact(state,ruleScope,field);
      if (term && monetaryEvidenceCurrency(term) !== currency) pending.push(`${charge}: ${field} currency does not match ${currency}; an explicit conversion rule is required`);
    }
    if (fact(state,ruleScope,"taxPercent")) pending.push(`${charge}: per-charge tax requires an explicit supported aggregation rule`);
    if (value(state,ruleScope,"otherAdjustments") === "true") pending.push(`${charge}: governing adjustments remain unresolved`);
    let basisQuantity = readFact(ruleScope, "basisQuantity");
    const basisEvidence = fact(state, ruleScope, "basis")?.evidence.quote ?? "";
    if (basisQuantity) {
      const denominator = fact(state, ruleScope, "basisQuantity")!.evidence.quote;
      const unit = basis === "gt-period" ? "(?:GT|GRT)" : basis === "movement" ? "movements?" : "(?:tonnes?|tons?)";
      const declared = [...denominator.matchAll(new RegExp(`(\\d[\\d,]*(?:\\.\\d+)?)\\s*${unit}\\b`, "gi"))];
      const implicitOne = basisQuantity === "1" && new RegExp(`(?:per|/|each)\\s*${unit}\\b`, "i").test(denominator);
      if (!implicitOne && !declared.some(m => new Decimal(m[1].replaceAll(",", "")).eq(basisQuantity!))) { pending.push(`${charge}: the rate denominator has the wrong dimension`); continue; }
    }
    if (!basisQuantity && /(?:per|\/|each)\s*(?:GT|GRT|movement|tonne|ton)\b/i.test(basisEvidence)) basisQuantity = "1";
    if (basis !== "flat" && basis !== "amount" && basis !== "time-period" && !basisQuantity) { pending.push(`${charge}: the quoted quantity per rate unit`); continue; }
    let expression: string | undefined; let formula = "";
    if (basis === "gt-period" || basis === "time-period") {
      const gt = readFact(scope, "gt"), period = readFact(ruleScope, "periodHours"), rounding = readFact(ruleScope, "rounding");
      let hours = readFact(scope, "durationHours"); const time = times(state, scope);
      const minutes = readFact(scope, "durationMinutes");
      if (minutes && hours && !new Decimal(minutes).eq(new Decimal(hours).mul(60))) pending.push("the supplied durations conflict");
      if (!hours && minutes) hours = new Decimal(minutes).div(60).toString();
      if (time && time.status !== "ok") pending.push(time.message);
      if (time?.status === "ok") {
        if (hours && !new Decimal(hours).eq(time.elapsedHours)) pending.push("the stated duration conflicts with the supplied timestamps");
        hours ??= time.elapsedHours;
        for (const field of ["berthStart", "berthEnd", "timeZone", "dateOrder"] as const) readFact(scope, field);
      }
      pending.push(...(basis === "gt-period" ? need(state, scope, ["gt"]) : []), ...need(state, ruleScope, ["periodHours", "rounding"]));
      if(rounding==='none')pending.push('the billing-time rounding mode is not stated');
      if (!hours) pending.push("stay duration or full start/end timestamps");
      if ((gt || basis === "time-period") && hours && period && rounding&&rounding!=='none') {
        const quotient = minutes ? `${minutes}/(${period}*60)` : `${hours}/${period}`;
        const periods = rounding === "started" ? `ceil(${quotient})` : `(${quotient})`;
        expressions.push({ id: `${id}_periods`, expression: periods });
        let unit = basis === "time-period" ? rate : `(${gt}/${basisQuantity})*${rate}`;
        for (const bound of ["minimum", "maximum"] as const) {
          const amount = value(state,ruleScope,(bound+"Treatment") as ConversationField)==="none"?undefined:readFact(ruleScope, bound); if (!amount) continue;
          const limitScope = readFact(ruleScope, bound === "minimum" ? "minimumScope" : "maximumScope");
          if (!['block','call'].includes(limitScope??'')) pending.push(`${charge}: ${bound} is per block or per call`);
          if (limitScope === "block") unit = `${bound === "minimum" ? "max" : "min"}(${unit},${amount})`;
        }
        expression = `(${unit})*$${id}_periods`;
        formula = `${basis === "gt-period" ? `${gt} GT / ${basisQuantity} GT × ` : ""}${currency} ${rate} per ${period}h; ${rounding} periods over ${hours}h`;
      }
    } else if (basis === "movement" || basis === "cargo-tonne") {
      const field = basis === "movement" ? "movements" : "cargoTonnes";
      const quantity = readFact(scope, field); pending.push(...need(state, scope, [field]));
      if (quantity) { expression = `(${quantity}/${basisQuantity})*${rate}`; formula = `${quantity}/${basisQuantity} ${basis === "movement" ? "movements" : "cargo tonnes"} × ${currency} ${rate}`; }
    } else if (basis === "flat" || basis === "amount") { expression = rate; formula = `${currency} ${rate}${basis === "flat" ? " per call" : " supplied amount"}`; }
    if (!expression) { expressions.splice(expressionsAtStart); continue; }
    for (const bound of ["minimum", "maximum"] as const) {
      const amount = value(state,ruleScope,(bound+"Treatment") as ConversationField)==="none"?undefined:readFact(ruleScope, bound); if (!amount) continue;
      const limitScope = readFact(ruleScope, bound === "minimum" ? "minimumScope" : "maximumScope");
      if (!['block','call'].includes(limitScope??'') || limitScope === "block" && basis !== "gt-period" && basis !== "time-period") pending.push(`${charge}: unsupported or missing ${bound} basis`);
      if (limitScope === "call") expression = `${bound === "minimum" ? "max" : "min"}(${expression},${amount})`;
      formula += `; ${bound} ${currency} ${amount}/${limitScope}`;
    }
    if (pending.length !== pendingAtStart) { expressions.splice(expressionsAtStart); continue; }
    if(value(state,scope,"moneyRounding")==="line"){
      const places=value(state,scope,"moneyDecimals");if(!places){pending.push("the source-currency rounding precision");continue;}expression=`round(${expression},${places})`;
    }
    expressions.push({ id, expression }); rows.push({ id, charge, currency, formula });
  }
  readFact(scope, "taxPercent"); readFact(scope,"tax"); readFact(scope, "otherAdjustments");
  for (const charge of task.charges) if (!rows.some(row => row.charge === charge) && !pending.some(p => p.startsWith(charge+":"))) pending.push(`${charge}: requested charge remains unresolved`);
  if (!rows.length) return unresolved(task, [...new Set(pending)]);
  const currencies = [...new Set(rows.map(r => r.currency))];
  for (const [i, currency] of currencies.entries()) {
    expressions.push({ id: `subtotal_${i}`, expression: rows.filter(r => r.currency === currency).map(r => `$${r.id}`).join("+") });
    if (suppliedTax !== undefined) expressions.push({ id: `tax_${i}`, expression: `$subtotal_${i}*${tax}/100` });
    let total=suppliedTax === undefined ? `$subtotal_${i}` : `$subtotal_${i}+$tax_${i}`;
    if(value(state,scope,"moneyRounding")==="quote"){const places=value(state,scope,"moneyDecimals");if(places!==undefined)total=`round(${total},${places})`;else pending.push("the quotation rounding precision");}
    expressions.push({ id: `total_${i}`, expression: total });
  }
  const calculations = calculateChargeBatch(expressions); const amounts = new Map(calculations.map(c => [c.id, c.result]));
  for (const row of rows) if (amounts.has(`${row.id}_periods`)) row.formula += `; billable periods ${new Decimal(amounts.get(`${row.id}_periods`)!).toString()}`;
  const body = `Based on your supplied quotation; not an official tariff or guaranteed final invoice.${pending.length ? " Only the identified components below are calculated; unresolved terms remain." : ""}\n\n| Charge | Amount |\n|---|---:|\n${rows.map(r => `| ${safe(r.charge)} | ${money(r.currency, amounts.get(r.id)!)} |`).join("\n")}\n${currencies.map((c, i) => `${suppliedTax !== undefined ? `| Supplied tax ${tax}% | ${money(c, amounts.get(`tax_${i}`)!)} |\n` : ""}| **${pending.length ? "Identified subtotal" : "Total of supplied lines"} (${c})** | **${money(c, amounts.get(`total_${i}`)!)}** |`).join("\n")}\n\n${rows.map(r => `- **${safe(r.charge)}:** ${safe(r.formula)}.`).join("\n")}\n\nUnrounded values used in totals; at least two decimals are displayed, retaining additional precision unless a rounding rule is applied. ${unresolvedTax ? "Tax treatment remains unresolved; the identified subtotal excludes tax. " : suppliedTax === undefined ? "No tax rate was supplied, so tax is outside this calculation. " : ""}Unquoted services excluded; no official-port authority inferred.`;
  const anonymous=task.ruleScopeIds.every(id=>value(state,id,"basis")==="amount");
  const totals=currencies.map((currency,i)=>({currency,amount:amounts.get(`total_${i}`)!,chargeIds:anonymous?["supplied-quote-total"]:[...task.charges,...(suppliedTax!==undefined?["supplied-tax"]:[])].sort(),basis:"scoped-quote" as const,lineAmounts:[...rows.filter(r=>r.currency===currency).map(r=>amounts.get(r.id)!),...(suppliedTax!==undefined?[amounts.get(`tax_${i}`)!]:[])]}));
  return { taskId: task.id, scopeId: scope, kind: task.kind, status: "calculated", sourceClass: "user-supplied-quotation", dependencies: [...dependencies], pending: [...new Set(pending)], body, totals, calculation: { calculations, rows, currencies, dispositions: task.charges.map(charge => ({ charge, status: rows.some(r => r.charge === charge) ? "calculated" : "unresolved" })) } };
}

function sourceGap(state:ConversationState,task:ConversationTask,port:string):AnswerItem {
  const entry=(coverageGaps.ports as Record<string,{approvedComponents:Array<{charges:string[];scope:string}>;gaps:Array<{charges:string[];cause:string;message:string}>}>)[port];
  if(!entry)return unresolved(task,["Missing tariff authority: no verified tariff yet for this service."]);
  const pending:string[]=[];
  for(const charge of task.charges){
    const invoice=(coverageGaps.invoiceGaps as Record<string,{message:string}>)[charge];if(invoice){pending.push(invoice.message);continue;}
    const approved=entry.approvedComponents.find(c=>c.charges.includes(charge)&&!(task.kind==="quote"&&/explanation|historical|identity|distinction/i.test(c.scope)));
    if(approved){pending.push("Missing implementation: "+approved.scope+" "+coverageGaps.contract.approvedButUnrouted);continue;}
    const gaps=entry.gaps.filter(g=>g.charges.includes(charge)||g.charges.includes("*")&&g.cause!=="identity");
    pending.push(...gaps.map(g=>(g.cause==="authority-version"||g.cause==="document-identity"?"Missing tariff authority: no verified tariff yet. ":g.cause==="rule-interpretation"?"Missing implementation / rule review: ":"")+g.message));
    if(!gaps.length)pending.push(`Missing implementation / rule review: ${charge} has no reviewed executable rule for this requested scope.`);
  }
  if(!value(state,task.scopeId,"operator")&&!value(state,task.scopeId,"terminal"))pending.push(...entry.gaps.filter(g=>g.cause==="identity"&&g.charges.includes("*")).map(g=>g.message));
  return unresolved(task,[...new Set(pending)]);
}

const coastalRequirements: Partial<Record<ConversationField, string>> = {
  terminal: "Indira Dock", vesselCategory: "general-cargo", flag: "India", service: "coastal", coastalLicence: "true", berthAllotted: "true", readinessValid: "true", favourableConditions: "true",
  idleTime: "false", shifting: "false", falseReadiness: "false", priority: "false", ousting: "false", penalty: "false", rebate: "false",
};
const domesticTaxRequirements: Partial<Record<ConversationField, string>> = { directBilling: "true", registeredCustomer: "true", privateCustomer: "true", supplierState: "Maharashtra", supplyState: "Maharashtra", sez: "false", taxExemption: "false" };
async function officialTask(state: ConversationState, task: ConversationTask, binding: QuoteBinding): Promise<AnswerItem> {
  const port = value(state, task.scopeId, "port");
  if (!port) return unresolved(task, ["the requested port/terminal"]);
  if (!SUPPORTED_PORTS.includes(port)) return unresolved(task, [`Missing tariff authority: no verified tariff yet for ${port}. Independent supplied-rate and elapsed-time work remains usable.`]);
  const component = await reviewedComponents(state, task);
  if (component) return component;
  if (port !== "mumbai" || task.charges.some(c => !["berth", "gst", "rounding"].includes(c))) return sourceGap(state,task,port);
  const rules = await loadOfficialBerthRules();
  if (task.kind === "rule") {
    if (value(state, task.scopeId, "terminal") && value(state, task.scopeId, "terminal") !== rules.berth || value(state, task.scopeId, "vesselCategory") && value(state, task.scopeId, "vesselCategory") !== "general-cargo") return unresolved(task, ["the specific berth/category rule; the reviewed ordinary Indira Dock rule cannot be substituted"]);
    return { taskId: task.id, scopeId: task.scopeId, kind: task.kind, status: "explained", sourceClass: "official-tariff", dependencies: [fact(state, task.scopeId, "port")!.id], pending: [],
      body: `The reviewed ordinary coastal Indira Dock rule charges INR ${rules.ratePerGrtStartedHour} per GRT per commenced hour, with a ${rules.minimumGrt}-GRT floor and INR ${rules.minimumBill} bill minimum. Readiness and operation conditions affect chargeable occupancy; this is not a vessel quote. The rule is effective ${rules.effectiveFrom}, verified through ${rules.verifiedThrough}. [MbPA SOR §2.17](${rules.sources[0].url}); [May amendment](${rules.sources[1].url}).${task.charges.includes("gst") ? `\n\nFor a directly billed ordinary private registered customer with supplier location and place of supply both Maharashtra, no SEZ status or exemption/concession, the reviewed treatment is CGST ${rules.cgstPercent}% plus SGST ${rules.sgstPercent}%, SAC ${rules.sac}. This conditional explanation does not decide your tax status. [MbPA GST classification p38](${rules.sources[2].url}); [CBIC heading9967](${rules.sources[3].url}); [intra-state supply FAQ85](${rules.sources[4].url}).` : ""} Other berth/category/tax conditions require their applicable rules.` };
  }
  if (!task.charges.includes("berth")) return unresolved(task, ["the base service amount and applicable rule for the requested tax/rounding scope"]);
  const includeTax = task.charges.includes("gst"), includeRounding = task.charges.includes("rounding");
  const requirements = { ...coastalRequirements, ...(includeTax ? domesticTaxRequirements : {}), ...(includeRounding ? { standaloneBill: "true" } : {}) };
  const missing = need(state, task.scopeId, ["gt", "berthStart", "berthEnd", "readinessTime", "cargoOperation", ...Object.keys(requirements) as ConversationField[]]);
  const mismatched = Object.entries(requirements).filter(([field, expected]) => value(state, task.scopeId, field as ConversationField) !== undefined && value(state, task.scopeId, field as ConversationField) !== expected);
  if (mismatched.length) return unresolved(task, [`The reviewed ordinary coastal rule does not cover these current conditions: ${mismatched.map(([f]) => labels[f as ConversationField] ?? f).join(", ")}. A matching rule is needed; changing the facts to fit this rule is not appropriate.`]);
  if (missing.length) return unresolved(task, missing);
  if (!["loading", "discharging", "both"].includes(value(state, task.scopeId, "cargoOperation")!)) return unresolved(task, ["the applicable non-cargo operation rule"]);
  const time = times(state, task.scopeId)!;
  if (time.status !== "ok") return unresolved(task, [time.message]);
  const rawReadiness = value(state, task.scopeId, "readinessTime")!;
  // An omitted year can be resolved only when exactly one year in the bound
  // occupancy interval produces an in-interval instant. Preserve the raw fact.
  const candidateYears = [...new Set([time.startUtc.slice(0, 4), time.endUtc.slice(0, 4)])];
  const readinessCandidates = /\b\d{4}\b/.test(rawReadiness) ? [rawReadiness] : candidateYears.map(year => rawReadiness.replace(/(\b\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?))(?=\s|$)/i, `$1 ${year}`));
  const checkedReadiness = readinessCandidates.map(end => calculateElapsedTime({ start: value(state, task.scopeId, "berthStart")!, end, timeZone: value(state, task.scopeId, "timeZone"), dateOrder: value(state, task.scopeId, "dateOrder") as "DMY" | "MDY" | undefined }));
  const validReadiness = checkedReadiness.filter(r => r.status === "ok" && Date.parse(r.endUtc) <= Date.parse(time.endUtc));
  const readiness = validReadiness.length === 1 ? validReadiness[0] : checkedReadiness[0];
  if (!/\b\d{4}\b/.test(rawReadiness) && validReadiness.length !== 1) return unresolved(task, ["the readiness date's year; it is not uniquely determined by the call interval"]);
  if (readiness.status !== "ok") return unresolved(task, [readiness.message]);
  if (Date.parse(readiness.endUtc) > Date.parse(time.endUtc) || new Decimal(time.elapsedHours).lte(0)) return unresolved(task, ["ordered berth/readiness/departure times"]);
  const statedHours = value(state, task.scopeId, "durationHours");
  if (statedHours && !new Decimal(statedHours).eq(time.elapsedHours)) return unresolved(task, ["the stated duration conflicts with the berth timestamps"]);
  if (Date.parse(readiness.endUtc) + Number(rules.readinessAllowanceHours) * 3600000 < Date.parse(time.endUtc)) return unresolved(task, ["reviewed readiness-clock exclusions before applying a cutoff earlier than departure"]);
  if (Date.parse(time.startUtc) < Date.parse(rules.effectiveFrom + "T00:00:00+05:30") || Date.parse(time.endUtc) > Date.parse(rules.verifiedThrough + "T23:59:59+05:30")) return unresolved(task, [`a verified tariff version covering this call; this rule is verified ${rules.effectiveFrom} through ${rules.verifiedThrough}`]);
  const facts = state.facts.filter(f => f.scopeId === task.scopeId && f.status === "established");
  if (!includeTax || !includeRounding) {
    const calculations = calculateChargeBatch([{ id: "hours", expression: `ceil(${time.elapsedHours})` }, { id: "berth", expression: `max(${value(state, task.scopeId, "gt")!},${rules.minimumGrt})*${rules.ratePerGrtStartedHour}*$hours` }]);
    const berth = calculations.find(c => c.id === "berth")!.result;
    const pending = new Decimal(berth).lt(rules.minimumBill) ? ["the bill scope before allocating the minimum bill charge"] : [];
    if (includeRounding && !includeTax) pending.push("final bill rounding needs the complete bill total and tax treatment");
    const taxCalculations = includeTax ? calculateChargeBatch([{ id: "cgst", expression: `${berth}*${rules.cgstPercent}/100` }, { id: "sgst", expression: `${berth}*${rules.sgstPercent}/100` }, { id: "total", expression: `${berth}+$cgst+$sgst` }]) : [];
    if (taxCalculations.some(c => new Decimal(c.result).decimalPlaces() > 2)) pending.push("fractional-paise tax rounding requires an approved rule");
    return { taskId: task.id, scopeId: task.scopeId, kind: task.kind, status: "calculated", sourceClass: "official-tariff", dependencies: facts.map(f => f.id), pending,
      body: `**Mumbai Indira Dock — requested berth component${includeTax ? " including GST" : ", before tax"}**\n\nBerth hire: **${money("INR", berth)}**. Assessed max(${value(state, task.scopeId, "gt")}, ${rules.minimumGrt}) GT × INR ${rules.ratePerGrtStartedHour}/GRT/commenced hour × ${calculations[0].result} hours. ${includeTax ? taxCalculations.map(c => `${c.id}: ${money("INR", c.result)}`).join("; ") : "GST is outside this requested component."} Final invoice rounding and other port-call services are outside this result.\n\n[MbPA SOR §2.17 and §1.2](${rules.sources[0].url}); [May amendment](${rules.sources[1].url}). Effective ${rules.effectiveFrom}; verified through ${rules.verifiedThrough}. Based on your stated eligibility and operating conditions; estimate subject to authority discretion.`, calculation: [...calculations, ...taxCalculations] };
  }
  const plan = { kind: "official-berth" as const, binding, contextHash: state.hash, sourceTextHash: digest(facts.map(f => f.evidence)), rulesHash: digest(rules), rules,
    facts: facts.map(f => ({ id: f.id, field: f.field, value: f.value, start: 0, end: f.evidence.quote.length, raw: f.evidence.quote, source: f.sourceClass==="lookup" ? "vessel-lookup" as const : "user-statement" as const })), gt: value(state, task.scopeId, "gt")!, startUtc: time.startUtc, endUtc: time.endUtc, readinessUtc: readiness.endUtc };
  const ledger = calculateOfficialBerth({ ...plan, id: digest(plan) } satisfies OfficialBerthPlan);
  return { taskId: task.id, scopeId: task.scopeId, kind: task.kind, status: "calculated", sourceClass: "official-tariff", dependencies: facts.map(f => f.id), pending: [], body: renderOfficialBerth(ledger), totals:[{currency:"INR",amount:ledger.amounts.total,chargeIds:["berth","gst","bill-rounding"],basis:"scoped-quote"}], calculation: ledger };
}

export async function planConversationAnswer(state: ConversationState, binding: QuoteBinding): Promise<ConversationAnswer> {
  const items: AnswerItem[] = [];
  for (const task of state.tasks.filter(t => t.kind !== "other" && t.kind !== "comparison")) {
    const scopedIssues = state.unresolved.filter(i => i.scopeId === task.scopeId && (i.taskIds.includes(task.id) || !i.taskIds.length && ["quote", "rule"].includes(task.kind)));
    if (task.source === "official") {
      try {
        // Authority and its requirements belong to code. Never publish a model's
        // request for an official price/rate as a customer questionnaire.
        const item = await officialTask(state,task,binding);
        // This conservative lexical distinction only recognizes source-field
        // questions. Other/unclear qualifications remain blockers, including
        // applicability questions mentioning a rate. They are not silently erased.
        const qualifications = scopedIssues.filter(i => !/\b(?:tariff|rate|schedule|pricing|charge\s+basis|billing\s+basis)\b/i.test(i.question) || /\b(?:whether|eligib\w*|entitl\w*|exempt\w*|discount\w*|rebate\w*|priority|penalty|concession\w*|waiv\w*|condition\w*|confirm\w*|conflict\w*|contradict\w*|uncertain)\b/i.test(i.question));
        if (qualifications.length) {
          // Looking up authority does not authorize an amount when its factual
          // applicability remains uncertain. Withhold calculations and totals.
          items.push(unresolved(task,[...new Set([...item.pending,...qualifications.map(i=>`Resolve the conflicting or uncertain applicability in your statement: ${safe(i.evidence.quote)}`)])]));
        } else items.push(item);
      } catch {
        items.push(unresolved(task,["The source/rule calculation could not be validated. No complete estimate is available."]));
      }
      continue;
    }
    const issues = scopedIssues.map(i=>i.question);
    if (issues.length) { items.push(unresolved(task, issues)); continue; }
    try {
      const arithmetic = fact(state, task.scopeId, "arithmeticExpression");
      items.push(task.kind === "facts" ? factsTask(state, task) : task.kind === "elapsed" ? elapsedTask(state, task) : task.source === "supplied" ? suppliedTask(state, task) : task.kind === "arithmetic" && arithmetic ? {
        taskId: task.id, scopeId: task.scopeId, kind: task.kind, status: "calculated", sourceClass: "user-facts", dependencies: [arithmetic.id], pending: [], body: `${safe(arithmetic.value)} = **${calculateTariffExpression(arithmetic.value)}**. Arithmetic only; no tariff applicability inferred.`,
      } : unresolved(task, ["the explicit arithmetic expression or governing supplied terms"]));
    } catch (error) {
      items.push(unresolved(task, [error instanceof Error && /Fractional-paise/.test(error.message) ? error.message : "The source/rule calculation could not be validated. No complete estimate is available."]));
    }
  }
  for(const task of state.tasks.filter(t=>t.kind==="comparison"))items.push(compareTasks(state,task,items));
  // A mixed request must not silently lose an auxiliary action merely because
  // its financial/elapsed portion can be calculated. Standalone nonfinancial
  // requests continue through the existing memory/lookup/general tool path.
  for (const task of state.tasks.filter(t => t.kind === "other")) items.push(unresolved(task, ["The additional requested action is still pending; this answer completes only the identified calculations or rule explanations."]));
  const questions: ConversationAnswer["questions"] = [];
  for (const item of items) item.label = state.scopes.find(s => s.id === item.scopeId)?.label;
  for (const item of items.filter(i => i.kind === "arithmetic" && i.status === "calculated")) {
    const invalid = state.facts.filter(f => f.scopeId === item.scopeId && f.status === "conflicting");
    if (invalid.length && !items.some(i => i.scopeId === item.scopeId && i.kind === "facts")) item.body += "\n\n" + [...new Set(invalid.map(f => `${f.field === "gt" ? "GT" : f.field} remains unresolved; ${f.validationError ?? "confirm the literal quantity and unit"}.`))].join(" ");
  }
  for (const item of items) {
    for (const [field, label] of Object.entries(labels) as Array<[ConversationField, string]>) {
      if (item.pending.includes(label) && !questions.some(q => q.scopeId === item.scopeId && q.field === field)) questions.push({ scopeId: item.scopeId, field, label, unit: ({ gt: "GT", durationHours: "hours", movements: "movements" } as Partial<Record<ConversationField, string>>)[field] ?? "" });
    }
    if (item.pending.includes("the requested port/terminal")) questions.push({ scopeId: item.scopeId, field: "port", label: "Requested port or terminal", unit: "" });
  }
  const body = { version: 1 as const, kind: "conversation-answer" as const, binding: { ...binding }, contextHash: state.hash, items, questions, complete: items.length > 0 && items.every(i => i.status !== "unresolved" && !i.pending.length) };
  return { ...body, id: digest(body) };
}

function compareTasks(state:ConversationState,task:ConversationTask,items:AnswerItem[]):AnswerItem {
  const selected=(task.comparisonTaskIds??[]).map(id=>items.find(i=>i.taskId===id));
  if(selected.length<2||selected.some(i=>!i||i.status!=="calculated"||i.pending.length||i.totals?.length!==1))return unresolved(task,["each requested side needs a resolved, explicitly scoped total before comparison"]);
  const totals=selected.map(i=>i!.totals![0]);
  if(totals.some(t=>t.basis!==totals[0].basis||JSON.stringify([...t.chargeIds].sort())!==JSON.stringify([...totals[0].chargeIds].sort())))return unresolved(task,["the requested sides cover different services; align their included charges before ranking them"]);
  const dimensions:ConversationField[]=["gt","durationHours","durationMinutes","ladenContainers","emptyContainers","containerSize","cargoTraffic","handlingMode","service","portCrane","icdRail"];
  const different=dimensions.filter(f=>new Set(selected.map(i=>value(state,i!.scopeId,f)??"unspecified")).size>1);
  if(different.length&&(task.comparisonMode??(totals[0].basis==="component"?"like-for-like":"totals"))==="like-for-like")return unresolved(task,[`align the scenario quantities/categories before a like-for-like comparison: ${different.join(", ")}`]);
  const currencies=[...new Set(totals.map(t=>t.currency))];const target=value(state,task.scopeId,"currency")??(currencies.length===1?currencies[0]:undefined);
  if(!target)return unresolved(task,["the comparison currency and supplied conversion rate"]);
  const rate=fact(state,task.scopeId,"fxRate"),from=value(state,task.scopeId,"fxFrom"),to=value(state,task.scopeId,"fxTo");
  const declaredRounding=value(state,task.scopeId,"moneyRounding"),rounding=declaredRounding==='none'?undefined:declaredRounding,places=value(state,task.scopeId,"moneyDecimals");
  if(["fxRate","fxFrom","fxTo","moneyRounding","moneyDecimals","currency"].some(f=>unresolvedConversationField(state,task.scopeId,f as ConversationField)))return unresolved(task,["resolve the conflicting conversion/rounding terms before comparison"]);
  if(rounding&&places===undefined)return unresolved(task,["the requested monetary rounding precision"]);
  if(currencies.some(c=>c!==target)){
    if(!rate||!from||!to)return unresolved(task,["an explicit conversion rate and direction; no exchange rate is assumed"]);
    const pair=new RegExp(`(?:${from}\\s*(?:/|to)\\s*${to}|${to}[^.!?\\n]*per\\s*(?:1\\s*)?${from})`,"i");
    if(!pair.test(rate.evidence.quote))return unresolved(task,["the currency pair/direction belonging to the supplied exchange rate"]);
    if(selected.some(i=>i!.sourceClass==="official-tariff")&&!value(state,task.scopeId,"fxDate"))return unresolved(task,["the date of the supplied comparison exchange rate"]);
  }
  const expressions:Array<{id:string;expression:string}>=[];
  for(const [i,total]of totals.entries()){
    let factor="1";if(total.currency!==target){if(total.currency===from&&target===to)factor=rate!.value;else if(total.currency===to&&target===from)factor=`(1/${rate!.value})`;else return unresolved(task,["a conversion rate for every source currency"]);}
    const lines=rounding==="line"?total.lineAmounts:undefined;
    if(rounding==="line"&&!lines)return unresolved(task,["individual line amounts for the requested per-line rounding"]);
    let expression=lines?lines.map(n=>`round(${n}*${factor},${places})`).join("+"):`${total.amount}*${factor}`;
    if(rounding==="quote")expression=`round(${expression},${places})`;
    const id=`side_${i}`;expressions.push({id,expression});
  }
  try{
    const calculated=calculateChargeBatch(expressions);const ranked=calculated.map((c,i)=>({index:i,value:new Decimal(c.result)})).sort((a,b)=>a.value.cmp(b.value));
    const lower=ranked[0],higher=ranked.at(-1)!;const difference=calculateChargeBatch([{id:"difference",expression:`${higher.value.toString()}-${lower.value.toString()}`}])[0].result;
    const label=(i:number)=>state.scopes.find(s=>s.id===selected[i]!.scopeId)?.label??selected[i]!.taskId;
    const lowest=ranked.filter(r=>r.value.eq(lower.value)).map(r=>safe(label(r.index))).join(", ");
    const body=`**Comparison of the identified ${totals[0].basis==="component"?"components":"supplied quotation totals"}**\n\n| Scenario | ${target} amount |\n|---|---:|\n${calculated.map((c,i)=>`| ${safe(label(i))} | ${money(target,c.result)} |`).join("\n")}\n\n${lower.value.eq(higher.value)?"The totals are equal.":`${lowest} has the lower amount; difference from ${safe(label(higher.index))}: **${money(target,difference)}**.`} ${rate&&currencies.some(c=>c!==target)?`Using the supplied ${from}/${to} rate ${rate.value}.`:""} ${rounding?`Rounding applies per ${rounding} to ${places} decimal places.`:"Exact values are compared; additional precision is retained."} ${different.length?`Scenario assumptions differ (${different.join(", ")}); this is not a like-for-like unit-price conclusion.`:""} This compares the stated scenarios and included services, not unquoted invoice items or operational suitability.`;
    return{taskId:task.id,scopeId:task.scopeId,kind:task.kind,status:"calculated",sourceClass:totals[0].basis==="component"?"official-tariff":"user-supplied-quotation",body,pending:[],dependencies:[...new Set(selected.flatMap(i=>i!.dependencies)),...(rate?[rate.id]:[])],calculation:calculated};
  }catch{return unresolved(task,["the comparison exceeds supported arithmetic bounds"]);}
}
export async function verifyConversationAnswer(answer: unknown, state: ConversationState, binding: QuoteBinding): Promise<boolean> {
  return digest(answer) === digest(await planConversationAnswer(state, binding));
}
export function renderConversationAnswer(answer: ConversationAnswer): string {
  return answer.items.map(item => `${answer.items.length > 1 ? `**${safe(item.label ?? item.taskId)}**\n\n` : ""}${item.body}${item.pending.length ? `${item.body ? "\n\nUnresolved before a complete answer:" : `To resolve this ${item.kind}:`}\n${item.pending.map(p => `- ${p}`).join("\n")}` : ""}`).join("\n\n");
}
