import { readFileSync } from "node:fs";
import type { ModelMessage } from "ai";
import { conversationInputs, emptyConversation, type Interpretation } from "../../src/lib/migration/conversation";
export const mumbaiQuestion: string = JSON.parse(readFileSync("output/actual-tariff-20261015/independent/input-v1.json", "utf8")).user_message;
export const suppliedQuestion = "Check the supplied berth quote: GT 20000. Stay 20 hours. Berth USD 0.01 per GT per hour, exact time. No taxes or other charges apply.";
export function mumbaiProposal(messages: ModelMessage[] = [{ role: "user", content: mumbaiQuestion }]): Interpretation {
  const input = conversationInputs(messages)[0]; const ref = (quote: string) => ({ inputId: input.id, quote });
  const p: Interpretation = { version: 1, baseHash: emptyConversation().hash, inputIds: [input.id], scopes: [{ id: "call", label: "Current call", kind: "call", parentId: null, evidence: ref("MV Saffron Estuary") }], tasks: [{ id: "berth", scopeId: "call", kind: "quote", source: "official", charges: ["berth", "gst", "rounding"], ruleScopeIds: [], evidence: ref("Please estimate the complete berth-hire amount, including GST, any applicable minimum and final bill rounding") }], operations: [], unresolved: [] };
  const operations: Array<[Interpretation["operations"][number]["field"], string, string, string]> = [
    ["port", "mumbai", "", "Mumbai Port Authority's Indira Dock"], ["terminal", "Indira Dock", "", "Mumbai Port Authority's Indira Dock"],
    ["gt", "10000", "GT", "10,000 GT"], ["nt", "5600", "NT", "5,600 NT"], ["loa", "135", "m", "135 m LOA"],
    ["vesselCategory", "general-cargo", "", "ordinary Indian-flag general-cargo ship"], ["flag", "India", "", "Indian-flag"],
    ["service", "coastal", "", "dedicated coastal service"], ["coastalLicence", "true", "", "valid DG Shipping coastal licence throughout the call"], ["cargoOperation", "discharging", "", "discharged steel coils"],
    ["berthAllotted", "true", "", "The berth had been allotted"], ["berthStart", "08:00 on 10 October 2026", "timestamp", "she took it at 08:00 on 10 October 2026"],
    ["berthEnd", "03:40 on 11 October 2026", "timestamp", "leaving at 03:40 on 11 October 2026"], ["timeZone", "IST", "", "all times are IST"],
    ["readinessTime", "03:30 on 11 October", "timestamp", "Her valid readiness-to-sail signal was at 03:30 on 11 October"], ["readinessValid", "true", "", "valid readiness-to-sail signal"], ["favourableConditions", "true", "", "favourable tide and weather"],
    ...(["idleTime", "shifting", "falseReadiness", "priority", "ousting", "penalty", "rebate"] as const).map(field => [field, "false", "", "There was no port-caused idle time, shifting, false readiness signal, priority or ousting arrangement, penalty, or special rebate"] as [typeof field, string, string, string]),
    ["directBilling", "true", "", "The port supplies and bills this service directly"], ["registeredCustomer", "true", "", "GST-registered private shipping company"], ["privateCustomer", "true", "", "private shipping company"],
    ["supplierState", "Maharashtra", "", "both the supplier location and place of supply are Maharashtra"], ["supplyState", "Maharashtra", "", "both the supplier location and place of supply are Maharashtra"],
    ["sez", "false", "", "We are not an SEZ unit"], ["taxExemption", "false", "", "no tax exemption or concessional agreement"], ["standaloneBill", "true", "", "berth hire as a single standalone bill"],
  ];
  p.operations = operations.map(([field, value, unit, quote]) => ({ scopeId: "call", field, value, unit, operation: "assert", evidence: ref(quote) }));
  return p;
}
export function nonfinancialProposal(question: string): Interpretation {
  const input = conversationInputs([{ role: "user", content: question }])[0]; const evidence = { inputId: input.id, quote: question };
  return { version: 1, baseHash: emptyConversation().hash, inputIds: [input.id], scopes: [{ id: "request", label: "Current request", kind: "call", parentId: null, evidence }], operations: [], tasks: [{ id: "other", scopeId: "request", kind: "other", source: "none", charges: [], ruleScopeIds: [], evidence }], unresolved: [] };
}

// Code-aware mocked interpretation for historical quotation controls. The
// frozen messages/expected amounts stay untouched. This is not language evidence.
export async function quotationProposal(question: string): Promise<Interpretation> {
  const { prepareSuppliedQuotation } = await import("../../src/lib/migration/supplied-quotation");
  const { buildCallContext } = await import("../../src/lib/migration/call-context");
  const plan = prepareSuppliedQuotation(buildCallContext([{ role: "user", content: question }]), { runId: "fixture", fence: 0, revision: 0 });
  if (!plan) throw new Error("Historical control did not compile; do not change its frozen input.");
  const input = conversationInputs([{ role: "user", content: question }])[0]; const e = (quote: string) => ({ inputId: input.id, quote });
  const sentence = (start: number, end: number) => {
    const stops = [...question.matchAll(/[.!?](?=\s|$)|\n/g)].map(m => m.index!);
    const from = [...stops].reverse().find(i => i < start) ?? -1;
    const to = stops.find(i => i >= end) ?? question.length;
    return question.slice(from + 1, to).trim();
  };
  const ref = (id: string) => plan.sources.find(s => s.id === id)!;
  const clause = (id: string) => { const r = ref(id); return sentence(r.start, r.end); };
  const p: Interpretation = { version: 1, baseHash: emptyConversation().hash, inputIds: [input.id], scopes: [], operations: [], tasks: [], unresolved: [] };
  const emit = (scopeId: string, field: Interpretation["operations"][number]["field"], value: string, unit: string, quote: string) => p.operations.push({ scopeId, field, value, unit, operation: "assert", evidence: e(quote) });
  for (const scenario of plan.scenarios) {
    const scopeId = scenario.id; p.scopes.push({ id: scopeId, kind: "scenario", label: scenario.label, parentId: null, evidence: e(clause(scenario.hours.sourceId)) });
    emit(scopeId, "gt", plan.gt.value, "GT", clause(plan.gt.sourceId));
    if (scenario.minutes) emit(scopeId, "durationMinutes", String(Number(scenario.hours.value) * 60 + Number(scenario.minutes.value)), "minutes", clause(scenario.hours.sourceId));
    else emit(scopeId, "durationHours", scenario.hours.value, "hours", clause(scenario.hours.sourceId));
    const exclusions = question.match(/No[^.!?\n]*(?:tax|taxes)[^.!?\n]*/i)?.[0]; if (!exclusions) throw new Error("No explicit supplied exclusion found.");
    emit(scopeId, "taxPercent", "0", "percent", exclusions); emit(scopeId, "otherAdjustments", "false", "", exclusions);
    const ruleScopeIds: string[] = [];
    for (const charge of plan.charges) {
      const id = `${scopeId}_${charge.id}`; ruleScopeIds.push(id); const terms = clause(charge.rate.sourceId);
      p.scopes.push({ id, kind: "quotation-rule", label: charge.id, parentId: scopeId, evidence: e(terms) });
      emit(id, "charge", charge.id, "", terms); emit(id, "currency", charge.currency, "", terms); emit(id, "rate", charge.rate.value, "money", terms); emit(id, "basis", charge.basis, "", terms);
      if (charge.periodHours) emit(id, "periodHours", charge.periodHours.value, "hours", clause(charge.periodHours.sourceId));
      if (charge.rounding) emit(id, "rounding", charge.rounding, "", charge.roundingSourceId ? ref(charge.roundingSourceId).raw : terms);
      if (charge.movements) emit(scopeId, "movements", charge.movements.value, "movements", clause(charge.movements.sourceId));
      for (const bound of ["minimum", "maximum"] as const) if (charge[bound]) { emit(id, bound, charge[bound]!.value, "money", terms); emit(id, bound === "minimum" ? "minimumScope" : "maximumScope", charge[bound]!.scope, "", terms); }
    }
    p.tasks.push({ id: scopeId, scopeId, kind: "quote", source: "supplied", charges: plan.charges.map(c => c.id), ruleScopeIds, evidence: e(question) });
  }
  return p;
}

// Adapter for existing code-aware projection regressions. The historical parser
// supplies MOCK language proposals only; production never calls this adapter.
export async function projectionProposal(messages: ModelMessage[], kind: "other" | "facts" | "elapsed" | "arithmetic" | "quote" = "facts", expression?: string): Promise<Interpretation> {
  const { buildCallContext } = await import("../../src/lib/migration/call-context");
  const { fieldMentions, operationAt } = await import("../../src/lib/migration/request-semantics");
  const { FIELD_NAMES } = await import("../../src/lib/migration/conversation");
  const c = buildCallContext(messages), inputs = conversationInputs(messages);
  const latest = inputs.at(-1)!;
  const p: Interpretation = { version: 1, baseHash: emptyConversation().hash, inputIds: inputs.map(i => i.id), scopes: c.scopes.map(s => ({ id: s.id, label: s.label, kind: "call", parentId: null, evidence: { inputId: latest.id, quote: latest.text } })), operations: [], tasks: c.activeScopeIds.map(scopeId => ({ id: scopeId, scopeId, kind, source: kind === "quote" ? "official" : "none", charges: kind === "quote" ? ["berth"] : [], ruleScopeIds: [], evidence: { inputId: latest.id, quote: latest.text } })), unresolved: [] };
  const seen = new Set<string>();
  for (const f of c.facts) {
    if (!(FIELD_NAMES as readonly string[]).includes(f.field)) continue;
    const input = inputs.find(i => i.messageIndex === f.origin.messageIndex && i.fieldName === f.origin.fieldName && i.text === f.origin.text); if (!input) throw new Error("Missing authored fixture fact");
    const field = f.field as Interpretation["operations"][number]["field"];
    let raw = f.origin.raw, value = f.value; const unit = ({ hour: "hours", metre: "m", DWT: "tonnes", identity: "", "date-order": "", zone: "" } as Record<string, string>)[f.unit] ?? f.unit;
    if (field === "port") {
      const port = JSON.parse(f.value); if (port.status !== "identified" || port.candidates.length !== 1) continue;
      value = port.candidates[0];
      const mentions = port.mentions as Array<{ raw?: string; text?: string }>;
      const found = mentions?.find(m => m.raw || m.text);
      if (found) raw = found.raw ?? found.text!;
      else raw = input.text;
    } else if (!input.fieldName) {
      const mentions = fieldMentions(input.text).filter(m => m.field === f.field);
      const near = mentions.sort((a, b) => Math.min(Math.abs(a.start - f.origin.end), Math.abs(a.end - f.origin.start)) - Math.min(Math.abs(b.start - f.origin.end), Math.abs(b.end - f.origin.start)))[0];
      if (near) raw = input.text.slice(Math.min(near.start, f.origin.start), Math.max(near.end, f.origin.end));
      else if (field === "intervalStart" || field === "intervalEnd") {
        const prefix = input.text.slice(0, f.origin.start); const marker = [...prefix.matchAll(field === "intervalStart" ? /\bfrom\b/gi : /\bto\b/gi)].at(-1);
        if (marker) raw = input.text.slice(marker.index, f.origin.end);
      }
    }
    const lexical = operationAt(input.text, f.origin.start);
    let operation: Interpretation["operations"][number]["operation"] = f.status === "reference" ? "reference" : f.status === "preserved" ? "preserve" : f.status === "rejected" ? "reject" : f.status === "conflicting" ? "uncertain" : "assert";
    const slot = `${f.scopeId}:${field}`;
    if (operation === "assert" && seen.has(slot)) operation = lexical === "preserve" ? "preserve" : "correct";
    if (operation !== "reference" && operation !== "preserve") seen.add(slot);
    // A projection's superseded conflicting values remain uncertain history.
    if (f.status === "superseded" && /cubits|furlongs|fathoms|\d\/\d/.test(raw)) operation = "uncertain";
    p.operations.push({ scopeId: f.scopeId, field, value, unit, operation, evidence: { inputId: input.id, quote: raw } });
  }
  if (expression) p.operations.push({ scopeId: c.activeScopeIds[0], field: "arithmeticExpression", operation: "assert", value: expression, unit: "expression", evidence: { inputId: latest.id, quote: latest.text } });
  return p;
}
