import { createHash } from "node:crypto";
import type { ModelMessage } from "ai";
import Decimal from "decimal.js";
import { z } from "zod";
import { authenticatedInputs, timestampAtoms, type AuthoredInput } from "./call-context";
import { classifyFormField, formQuantity, normalizeQuantity, operationAt, proseQuantities, type QuantityCandidate } from "./request-semantics";
import { resolvePortIdentity, resolveCatalogLocation } from "./port-identity";

export const conversationDigest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const key = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
export const FIELD_NAMES = [
  "port", "terminal", "vesselName", "gt", "nt", "dwt", "loa", "draught", "durationHours", "durationMinutes", "movements", "cargoTonnes",
  "berthStart", "berthEnd", "anchorageArrival", "cargoCompleted", "portDeparture", "intervalStart", "intervalEnd", "readinessTime", "timeZone", "dateOrder", "callDate", "vesselCategory", "flag", "service", "coastalLicence",
  "cargoOperation", "berthAllotted", "readinessValid", "favourableConditions", "idleTime", "shifting", "falseReadiness", "priority", "ousting", "penalty", "rebate",
  "supplierState", "supplyState", "directBilling", "registeredCustomer", "privateCustomer", "sez", "taxExemption", "standaloneBill",
  "charge", "currency", "rate", "basis", "basisQuantity", "periodHours", "rounding", "minimum", "maximum", "minimumScope", "maximumScope", "taxPercent", "otherAdjustments", "arithmeticExpression",
  "operator", "cargoCategory", "ladenContainers", "emptyContainers", "containerSize", "cargoTraffic", "handlingMode", "portCrane", "icdRail", "specialCargo", "callDays",
  "fxRate", "fxFrom", "fxTo", "fxDate", "moneyRounding", "moneyDecimals", "tax", "minimumTreatment", "maximumTreatment",
] as const;
export type ConversationField = typeof FIELD_NAMES[number];
const evidenceSchema = z.object({ inputId: z.string().min(1).max(80), quote: z.string().min(1).max(4000) }).strict();
export type EvidenceReference = z.infer<typeof evidenceSchema>;
const operationSchema = z.object({
  scopeId: key, field: z.enum(FIELD_NAMES), operation: z.enum(["assert", "correct", "reject", "preserve", "reference", "uncertain", "inherit"]),
  value: z.string().min(1).max(200), unit: z.string().max(40), evidence: evidenceSchema,
  fromFactId: z.string().length(64).optional(),
}).strict();
const taskSchema = z.object({
  id: key, scopeId: key, kind: z.enum(["quote", "rule", "elapsed", "arithmetic", "facts", "comparison", "other"]),
  source: z.enum(["official", "supplied", "none"]), charges: z.array(z.string().min(1).max(64)).max(16),
  ruleScopeIds: z.array(key).max(16), evidence: evidenceSchema,
  auxiliaryAction: z.enum(["general", "lookup", "remember", "recall", "forget", "read-notes", "write-notes"]).optional(),
  comparisonTaskIds: z.array(key).max(12).optional(),
  comparisonMode: z.enum(["totals","like-for-like"]).optional(),
}).strict();
export type ConversationTask = z.infer<typeof taskSchema>;
export const interpretationSchema = z.object({
  contract: z.literal("facts-v3").optional(),
  version: z.literal(1), baseHash: z.string().length(64),
  scopes: z.array(z.object({ id: key, label: z.string().min(1).max(100), kind: z.enum(["call", "scenario", "quotation-rule"]), parentId: key.nullable(), evidence: evidenceSchema }).strict()).max(32),
  operations: z.array(operationSchema).max(256),
  tasks: z.array(taskSchema).min(1).max(24),
  unresolved: z.array(z.object({ scopeId: key, question: z.string().min(1).max(300), evidence: evidenceSchema, taskIds: z.array(key).max(24).default([]) }).strict()).max(32),
  // Classify whole inputs, including nonfinancial requests. No text coverage allowlist.
  inputIds: z.array(z.string().min(1).max(80)).min(1).max(128),
}).strict();
export type Interpretation = z.infer<typeof interpretationSchema>;

export type ConversationInput = AuthoredInput & { id: string };
export type ConversationFact = z.infer<typeof operationSchema> & {
  id: string; revision: number; status: "established" | "conflicting" | "superseded" | "reference" | "rejected";
  inputOrder: number; supersedes: string[];
  validationError?: string;
  normalizations?: string[];
  sourceClass?: "lookup";
};
export type ConversationState = {
  version: 1; hash: string; revision: number; scopes: Interpretation["scopes"]; facts: ConversationFact[];
  tasks: ConversationTask[]; unresolved: Interpretation["unresolved"]; consumed: string[];
};
export type InterpretationReceipt = { version: 1; kind: "conversation-interpretation"; proposal: Interpretation; stateHash: string };
export type VesselLookupReceipt = { version:1;kind:"vessel-lookup";id:string;beforeHash:string;scopeId:string;subject:{id:string;idType:"imo"|"mmsi";name:string};values:{gt?:string;dwt?:string};observedAt:string };
const unsignedState = (state: ConversationState) => ({ ...state, hash: "" });
const seal = (state: ConversationState) => ({ ...state, hash: conversationDigest(unsignedState(state)) });
export function emptyConversation(): ConversationState {
  return seal({ version: 1, hash: "", revision: 0, scopes: [], facts: [], tasks: [], unresolved: [], consumed: [] });
}
const vesselNameKey=(name:string)=>name.replace(/^(?:MV|M\/V)\s+/i,"").trim().toLowerCase().replace(/\s+/g," ");
export function applyVesselLookup(state:ConversationState,receipt:VesselLookupReceipt):ConversationState {
  const {id,...unsigned}=receipt;
  if(receipt.kind!=="vessel-lookup"||receipt.version!==1||receipt.beforeHash!==state.hash||conversationDigest(unsigned)!==id)throw new Error("Lookup receipt is stale or inconsistent.");
  const tasks=state.tasks.filter(t=>t.scopeId===receipt.scopeId);
  const name=currentConversationFact(state,receipt.scopeId,"vesselName");
  const explicitId=tasks.some(t=>new RegExp(`\\b${receipt.subject.idType}\\s*[:#-]?\\s*${receipt.subject.id}\\b`,"i").test(t.evidence.quote));
  if(name&&vesselNameKey(name.value)!==vesselNameKey(receipt.subject.name))throw new Error("Lookup name conflicts with the user's vessel identity; confirmation is required.");
  if(!tasks.length||!explicitId&&(!name||vesselNameKey(name.value)!==vesselNameKey(receipt.subject.name)))throw new Error("Lookup vessel identity is not established for this scope.");
  const next=structuredClone(state);next.revision++;
  for(const field of ["gt","dwt"] as const){
    const value=receipt.values[field];if(value===undefined)continue;
    const n=new Decimal(value);if(!n.isFinite()||n.lte(0)||n.gt("1e18")||n.decimalPlaces()>20)throw new Error("Lookup quantity is invalid.");
    const prior=next.facts.filter(f=>f.scopeId===receipt.scopeId&&f.field===field&&["established","conflicting","rejected"].includes(f.status));
    if(prior.some(f=>f.sourceClass!=="lookup"))continue;
    for(const f of prior)f.status="superseded";
    next.facts.push({id:conversationDigest([receipt.id,field]),scopeId:receipt.scopeId,field,value:n.toString(),unit:field==="gt"?"GT":"tonnes",operation:"assert",status:"established",revision:next.revision,inputOrder:-1,supersedes:prior.map(f=>f.id),sourceClass:"lookup",evidence:{inputId:receipt.id,quote:`${receipt.subject.name}; ${receipt.subject.idType} ${receipt.subject.id}; ${field} ${value}; observed ${receipt.observedAt}`}});
  }
  if(next.facts.length>1024)throw new Error("Conversation fact limit exceeded.");return seal(next);
}
export function conversationInputs(messages: readonly ModelMessage[]): ConversationInput[] {
  return authenticatedInputs(messages).map((input, index) => ({ ...input, id: `input-${index}-${conversationDigest(input).slice(0, 16)}` }));
}
export function currentConversationFact(state: ConversationState, scopeId: string, field: ConversationField, visited = new Set<string>()): ConversationFact | undefined {
  if (visited.has(scopeId)) return undefined; visited.add(scopeId);
  const scoped = state.facts.filter(f => f.scopeId === scopeId && f.field === field);
  if (scoped.some(f => f.status === "conflicting")) return undefined;
  const facts = scoped.filter(f => f.status === "established");
  if(facts.length)return facts.length===1?facts[0]:undefined;
  if(scoped.some(f=>f.status==="rejected"))return undefined;
  const scope=state.scopes.find(s=>s.id===scopeId);
  if(scope?.kind!=="scenario"||!scope.parentId)return undefined;
  const ownName=state.facts.find(f=>f.scopeId===scopeId&&f.field==="vesselName"&&f.status==="established");
  const parentName=state.facts.find(f=>f.scopeId===scope.parentId&&f.field==="vesselName"&&f.status==="established");
  if(ownName&&parentName&&ownName.value!==parentName.value)return undefined;
  return currentConversationFact(state,scope.parentId,field,visited);
}
export function unresolvedConversationField(state: ConversationState, scopeId: string, field: ConversationField, visited = new Set<string>()): boolean {
  if(visited.has(scopeId))return true;visited.add(scopeId);
  const scoped = state.facts.filter(f => f.scopeId === scopeId && f.field === field);
  if(scoped.some(f=>f.status==="conflicting"))return true;
  if(scoped.some(f=>f.status==="established"))return false;
  if(scoped.some(f=>f.status==="rejected"))return true;
  const scope=state.scopes.find(s=>s.id===scopeId);return scope?.kind==="scenario"&&scope.parentId?unresolvedConversationField(state,scope.parentId,field,visited):false;
}
function evidenceInput(ref: EvidenceReference, inputs: readonly ConversationInput[], allowed: Set<string>) {
  const input = inputs.find(i => i.id === ref.inputId);
  if (!input || !allowed.has(input.id) || !input.text.includes(ref.quote)) throw new Error("Interpretation cites absent or already-consumed user evidence.");
  return input;
}
const numericFields: Partial<Record<ConversationField, { unit: string; positive?: boolean; integer?: boolean }>> = {
  gt: { unit: "GT", positive: true }, nt: { unit: "NT", positive: true }, dwt: { unit: "tonnes", positive: true }, loa: { unit: "m", positive: true }, draught: { unit: "m", positive: true },
  durationHours: { unit: "hours" }, durationMinutes: { unit: "minutes" }, movements: { unit: "movements", integer: true }, cargoTonnes: { unit: "tonnes" },
  rate: { unit: "money" }, basisQuantity: { unit: "basis-units", positive: true }, periodHours: { unit: "hours", positive: true }, minimum: { unit: "money" }, maximum: { unit: "money" }, taxPercent: { unit: "percent" },
  ladenContainers: { unit: "containers", integer: true }, emptyContainers: { unit: "containers", integer: true }, containerSize: { unit: "ft", positive: true }, callDays: { unit: "days", positive: true },
  fxRate:{unit:"ratio",positive:true},moneyDecimals:{unit:"places",integer:true},
};
const metricNames: Partial<Record<ConversationField, RegExp>> = {
  gt: /\b(?:GT|GRT|gross\s+(?:registered\s+)?tonnage)\b/i, nt: /\b(?:NT|NRT|net\s+(?:registered\s+)?tonnage)\b/i,
  dwt: /\b(?:DWT|deadweight)\b/i, loa: /\b(?:LOA|length\s+overall)\b/i, draught: /\b(?:draught|draft)\b/i,
};
const enumValues: Partial<Record<ConversationField, readonly string[]>> = {
  tax: ["none","percentage","included","exempt"], minimumTreatment:["none","amount"], maximumTreatment:["none","amount"],
  basis: ["gt-period", "time-period", "movement", "flat", "amount", "cargo-tonne"], rounding: ["started", "exact"], minimumScope: ["block", "call"], maximumScope: ["block", "call"],
  dateOrder: ["DMY", "MDY"], currency: ["USD", "INR", "EUR", "GBP"], service: ["coastal", "foreign"], cargoOperation: ["loading", "discharging", "both", "none"],
  vesselCategory: ["general-cargo", "container", "tanker", "offshore-supply", "naval", "coast-guard", "passenger", "cruise", "other"],
  cargoTraffic: ["exim", "coastal", "transshipment"], handlingMode: ["road", "rail", "ship-yard"], cargoCategory: ["mechanized-bulk", "other"],
  fxFrom:["USD","INR","EUR","GBP"],fxTo:["USD","INR","EUR","GBP"],moneyRounding:["line","quote"],
};
export const BOOLEAN_FIELDS = ["coastalLicence", "berthAllotted", "readinessValid", "favourableConditions", "idleTime", "shifting", "falseReadiness", "priority", "ousting", "penalty", "rebate", "directBilling", "registeredCustomer", "privateCustomer", "sez", "taxExemption", "standaloneBill", "otherAdjustments", "portCrane", "icdRail", "specialCargo"] as const;
const booleanFields = new Set<ConversationField>(BOOLEAN_FIELDS);
const words: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
export function expandCardinals(raw: string) {
  const atom = `(?:${Object.keys(words).join("|")}|hundred|thousand|million)`;
  return raw.replace(new RegExp(`\\b${atom}(?:[ -]+(?:and[ -]+)?${atom})*\\b`, "gi"), phrase => {
    let total = 0, group = 0, previous = -1;
    for (const token of phrase.toLowerCase().split(/[ -]+/)) {
      if (token === "and") continue;
      if (token === "hundred") { if (group < 1 || group > 9) return phrase; group *= 100; previous = -1; }
      else if (token === "thousand" || token === "million") { if (!group) return phrase; total += group * (token === "thousand" ? 1000 : 1000000); group = 0; previous = -1; }
      else { const n = words[token]; if (previous >= 0 && !(previous >= 20 && previous % 10 === 0 && n > 0 && n < 10)) return phrase; group += n; previous = n; }
    }
    return String(total + group);
  });
}
const anchors: Partial<Record<ConversationField, RegExp>> = {
  coastalLicence: /coastal[\s\S]*licen[cs]e|licen[cs]e[\s\S]*coastal/i, berthAllotted: /allott?ed|allocat|assigned/i,
  readinessValid: /\bvalid\b[^.!?;\n]*?\breadiness\b|\breadiness\b[^.!?;\n]*?\bvalid\b/i, favourableConditions: /tide[\s\S]*weather|weather[\s\S]*tide/i,
  idleTime: /idling|idle[ -]time/i, shifting: /shift/i, falseReadiness: /false[ -]readiness/i, priority: /priority/i, ousting: /oust/i, penalty: /penalt/i, rebate: /rebate/i,
  directBilling: /direct[\s\S]*bill|bill[\s\S]*direct/i, registeredCustomer: /GST[ -]registered|registered[\s\S]*GST/i, privateCustomer: /private/i,
  sez: /\bSEZ\b|special[ -]economic[ -]zone/i, taxExemption: /tax[^.!?;\n]*?(?:exempt|concession)|(?:exempt|concession)[^.!?;\n]*?tax/i, standaloneBill: /standalone|separate[ -]bill|single[ -]bill/i,
  otherAdjustments: /adjustment|discount|surcharge|other[ -](?:charges|extras|fees)|additional[ -](?:charges|fees)/i,
  taxPercent: /\btax(?:es)?\b|\b(?:GST|VAT|CGST|SGST|IGST)\b/i,
  fxRate:/rate|conversion|exchange|\bFX\b/i,
  portCrane: /port[ -]crane/i, icdRail: /\bICD\b/i, specialCargo: /hazardous|reefer|\bODC\b|over[ -]?dimension|special[ -]cargo/i,
  ladenContainers: /laden|loaded/i, emptyContainers: /empty/i, containerSize: /container|\b(?:ft|foot|feet)\b/i, callDays: /call|visit|dues/i,
  berthStart: /berth[\s\S]*(?:taken|take|arrival)|\bberthed\b|(?:took|takes?|taking)[\s\S]*(?:berth|it)|all[ -]fast|first[ -]line/i,
  berthEnd: /left|leav|unberth|last[ -]line|cast[ -]off/i,
  readinessTime: /readiness|ready[ -]to[ -]sail/i,
  anchorageArrival: /anchor/i, cargoCompleted: /cargo[\s\S]*(?:complete|finish)|(?:complete|finish)[\s\S]*cargo/i, portDeparture: /port[\s\S]*(?:depart|leav|left)|(?:depart|leav|left)[\s\S]*port/i,
  intervalStart: /start|arrival|\bfrom\b/i, intervalEnd: /end|departure|\bto\b/i,
};
const categoryTerms: Partial<Record<ConversationField, Record<string, RegExp>>> = {
  service: { coastal: /\bcoastal\b/i, foreign: /\bforeign\b/i },
  basis: { "time-period": /(?:each|per)[\s\S]*(?:hour|day|block|period)/i, "gt-period": /(?:GT|GRT|gross[ -]tonnage)[\s\S]*(?:hour|day|block)|(?:hour|day|block)[\s\S]*(?:GT|GRT|gross[ -]tonnage)/i, movement: /movement|moves?/i, flat: /flat|fixed|per[ -]call|per[ -]visit/i, amount:/(?:USD|INR|EUR|GBP|[$₹€£])\s*\d/i, "cargo-tonne": /cargo[\s\S]*(?:tonne|ton)|(?:tonne|ton)[\s\S]*cargo/i },
  moneyRounding:{line:/each[\s\S]*(?:line|charge|item)|per[ -]line/i,quote:/after[\s\S]*(?:add|sum|total)|(?:quotation|quote|total)[\s\S]*round|round[\s\S]*(?:quotation|quote|total)/i},
  rounding: { started: /started|commenced|part[ -]thereof|round[\s\S]*up/i, exact: /exact|pro[ -]?rata|per[ -]hour|\/\s*(?:hour|h)\b/i },
  minimumScope: { block: /block|period/i, call: /call|visit/i }, maximumScope: { block: /block|period/i, call: /call|visit/i },
  vesselCategory: { "general-cargo": /general[ -]cargo/i, container: /container/i, tanker: /tanker/i, "offshore-supply": /offshore[ -]supply/i, naval: /naval/i, "coast-guard": /coast[ -]?guard/i, passenger: /passenger/i, cruise: /cruise/i, other: /\S/ },
  cargoOperation: { loading: /load/i, discharging: /discharg|unload/i, both: /load[\s\S]*discharg|discharg[\s\S]*load/i, none: /no[\s\S]*cargo|without[\s\S]*cargo/i },
  currency: { USD: /\bUSD\b|US\$/i, INR: /\bINR\b|₹/i, EUR: /\bEUR\b|€/i, GBP: /\bGBP\b|£/i },
  dateOrder: { DMY: /DMY|DD\/MM\/YYYY|day[\s/-]*month[\s/-]*year/i, MDY: /MDY|MM\/DD\/YYYY|month[\s/-]*day[\s/-]*year/i },
  cargoTraffic: { exim: /EXIM|import|export/i, coastal: /coastal/i, transshipment: /trans[ -]?ship/i },
  handlingMode: { road: /road|truck/i, rail: /rail/i, "ship-yard": /ship[\s/-]*(?:to[\s/-]*)?yard|yard[\s/-]*(?:to[\s/-]*)?ship/i },
  cargoCategory: { "mechanized-bulk": /mechani[sz]ed[ -]bulk/i, other: /\S/ },
};
/** Currency belongs to the same monetary atom and governing role, not merely
 * some other matching currency word in a quoted paragraph. */
export function monetaryEvidenceCurrency(fact: Pick<ConversationFact, "field" | "value" | "evidence">): string | undefined {
  const text = fact.evidence.quote.normalize("NFKC");
  const currencies = [...text.matchAll(/(USD|INR|EUR|GBP|US\$|[$₹€£])\s*(\d[\d,]*(?:\.\d+)?)/gi)].flatMap(m => {
    if (!new Decimal(m[2].replaceAll(",", "")).eq(fact.value)) return [];
    const role = /\b(minimum|maximum|cap)\s*$/i.exec(text.slice(0, m.index).trim())?.[1] ?? /^(minimum|maximum|cap)\b/i.exec(text.slice(m.index! + m[0].length).trim())?.[1];
    if (fact.field === "rate" ? !!role : fact.field === "minimum" ? role?.toLowerCase() !== "minimum" : !role || !/maximum|cap/i.test(role)) return [];
    return [({ "US$": "USD", "₹": "INR", "€": "EUR", "£": "GBP" } as Record<string,string>)[m[1].toUpperCase()] ?? m[1].toUpperCase()];
  });
  const unique = [...new Set(currencies)]; return unique.length === 1 && unique[0] !== "$" ? unique[0] : undefined;
}

function booleanPolarity(field: ConversationField, raw: string): "positive" | "negative" | "conditional" {
  const predicate = field === "favourableConditions" ? /favo[u]?rable|suitable/i.exec(raw) : anchors[field]?.exec(raw);
  const end = predicate ? predicate.index + predicate[0].length : raw.length;
  let prefix = raw.slice(0, end).split(/[.;!?\n]|\b(?:but|however)\b/i).at(-1) ?? "";
  const suffix = raw.slice(end).split(/[,.!?;\n]|\b(?:and|or|but|however)\b/i)[0];
  if (/^\s*(?:is|are|was|were|does|do|did|has|have|had|expired|cancelled|absent|unavailable)\b/i.test(suffix)) prefix += suffix;
  // 'False readiness' names the event; false is not its negation operator.
  if (field === "falseReadiness") prefix = prefix.replace(/false[ -]readiness/gi,"readiness");
  if (/\b(?:if|unless|except)\b/i.test(prefix)) return "conditional";
  return /\b(?:not(?!\s+only\b)|no(?![.]?\s*\d)|never|without|none|neither|absent|invalid|unavailable|unregistered|unfavo[u]?rable|unsuitable|adverse|inapplicable|expired|cancelled|isn['’]t|aren['’]t|wasn['’]t|weren['’]t|doesn['’]t|don['’]t|didn['’]t|false)\b/i.test(prefix) ? "negative" : "positive";
}

/** Validate atomic values and dimensions, independently of model confidence.
 * Language role assignment remains an interpretation, never tariff authority.
 * Contextual uncertainties are retained, not erased by a valid substring. */
/** Validate the two explicitly linked berth endpoints; never relabel a generic
 * arrival/anchorage interval. Values and quoted evidence remain unchanged. */
function explicitBerthInterval(op: Interpretation["operations"][number], input: ConversationInput): boolean {
  if (op.field !== "berthStart" && op.field !== "berthEnd") return false;
  const at = input.text.indexOf(op.evidence.quote);
  const before = input.text.slice(0, at).split(/[.!?;\n]/).at(-1) ?? "";
  const after = input.text.slice(at + op.evidence.quote.length).split(/[.!?;\n]/)[0];
  const clause = before + op.evidence.quote + after;
  if (/\b(?:not|never|either|possibly|maybe|might|could)\b/i.test(clause)) return false;
  const stamps = timestampAtoms(clause);
  if (stamps.length !== 2) return false;
  const first = clause.indexOf(stamps[0]), second = clause.indexOf(stamps[1], first + stamps[0].length);
  if (!/\b(?:alongside|berthed)\s+from\s*$/i.test(clause.slice(0, first)) || !/^\s+to\s+$/i.test(clause.slice(first + stamps[0].length, second))) return false;
  const expected = stamps[op.field === "berthStart" ? 0 : 1];
  return op.value === expected && op.evidence.quote.includes(expected);
}

/** Limited semantic cross-check: enumerated per-call/visit, per-block/period,
 * and per-movement cues attached to a minimum or maximum/cap. This is not a
 * general tariff-language validator. Contradictions are rejected, never repaired. */
function boundScopeCues(field: "minimumScope" | "maximumScope", quote: string): string[] {
  const roles = [...quote.matchAll(/\b(minimum|maximum|cap)\b/gi)];
  return roles.flatMap((role, index) => {
    if (field === "minimumScope" ? role[1].toLowerCase() !== "minimum" : role[1].toLowerCase() === "minimum") return [];
    const clause = quote.slice(role.index! + role[0].length, roles[index + 1]?.index ?? quote.length);
    return [...clause.matchAll(/\b(?:per|each)\s+(?:(?:billed|started|commenced)\s+)?(?:\d+[- ](?:hour|day)s?\s+)?(call|visit|block|period|movement)\b/gi)].map(m => /call|visit/i.test(m[1]) ? "call" : /block|period/i.test(m[1]) ? "block" : "movement");
  });
}

export function codeOwnedUnit(field: ConversationField): string {
  return numericFields[field]?.unit ?? (/^(?:berthStart|berthEnd|anchorageArrival|cargoCompleted|portDeparture|intervalStart|intervalEnd|readinessTime|callDate|fxDate)$/.test(field) ? "timestamp" : "");
}
export function authoredTimeZone(value:string,text:string):string {
  const normalize=(s:string)=>{
    const t=s.trim().toUpperCase();
    if(/^(?:INDIA(?:N)? (?:STANDARD )?TIME|IST|ASIA\/(?:KOLKATA|CALCUTTA))$/.test(t))return '+05:30';
    if(/^(?:Z|UTC|GMT)$/.test(t))return '+00:00';
    const m=/^(?:UTC|GMT)?([+-])(\d{2}):?(\d{2})$/.exec(t);return m?`${m[1]}${m[2]}:${m[3]}`:undefined;
  };
  const target=normalize(value);
  const observed=[...text.matchAll(/\b(?:India(?:n)? (?:Standard )?time|IST|Asia\/(?:Kolkata|Calcutta)|(?:UTC|GMT)(?:[+-]\d{2}:?\d{2})?)\b|(?<!\d)[+-]\d{2}:\d{2}(?!\d)/gi)].filter(m=>!['reject','reference'].includes(operationAt(text,m.index!))).map(m=>normalize(m[0]));
  if(!target||new Set(observed).size!==1||observed[0]!==target)throw new Error('The timezone is absent, ambiguous or not supported by the authored timestamps.');
  return target;
}
export function requiresLiteralGrounding(field:ConversationField) { return !!codeOwnedUnit(field); }
export function validateOperation(op: Interpretation["operations"][number], input: ConversationInput, semanticEnums=false) {
  op = {...op,evidence:{...op.evidence,quote:op.evidence.quote.normalize("NFKC")}};
  input = {...input,text:input.text.normalize("NFKC")};
  const raw = op.evidence.quote;
  if (input.text.indexOf(raw) !== input.text.lastIndexOf(raw)) throw new Error("Use an unambiguous evidence clause, including its role and context.");
  if (booleanFields.has(op.field) && !["true", "false"].includes(op.value)) throw new Error(`Invalid boolean ${op.field}.`);
  const absentEnum=semanticEnums&&op.value==='none'&&['rounding','moneyRounding','minimumScope','maximumScope'].includes(op.field);
  if (enumValues[op.field] && !enumValues[op.field]!.includes(op.value)&&!absentEnum) throw new Error(`Invalid ${op.field} category.`);
  if (op.operation === "reference" || op.operation === "uncertain") return;
  if(absentEnum)return;
  if(semanticEnums&&op.field==='timeZone'){authoredTimeZone(op.value,input.text);return;}
  if(semanticEnums&&(op.field==='port'||op.field==='terminal')){
    if(resolveCatalogLocation(op.field,op.value,input.text)!==op.value)throw new Error('Identity must be resolved by the catalog before reduction.');
    return;
  }
  if(semanticEnums&&!requiresLiteralGrounding(op.field)&&!['port','terminal'].includes(op.field)){
    if((op.field==='minimumScope'||op.field==='maximumScope')&&boundScopeCues(op.field,raw).some(cue=>cue!==op.value))throw new Error("The bound scope contradicts its per-call/per-block cue.");
    if(op.field==='basis'&&op.value==='gt-period'&&!/(?:per|\/)\s*(?:\d[\d,]*\s*)?(?:GT|GRT)\b/i.test(raw))throw new Error("Unable to ground the GT rate dimension.");
    if(op.field==='basis'&&op.value==='time-period'&&/(?:GT|GRT|metre|meter|movement|tonne|container)/i.test(raw))throw new Error("A dimensional rate cannot become time-only billing.");
    if(op.field==='rounding'&&op.value==='exact'&&/started|commenced|part\s+thereof|round[^.!?]*up/i.test(raw))throw new Error("Commenced-period evidence cannot authorize exact-time billing.");
    if(op.field==='tax'&&op.value==='none'&&/\b(?:tax|GST|VAT)\s*(?:is|at|of|:)?\s*[1-9]\d*(?:\.\d+)?\s*%/i.test(raw))throw new Error("Tax none contradicts a supplied percentage.");
    if(booleanFields.has(op.field)){
      const polarity=booleanPolarity(op.field,raw);
      if(op.field==='taxExemption'&&(!anchors.taxExemption?.test(raw)||op.value==='false'&&polarity!=='negative'))throw new Error('Tax exemption eligibility needs an explicit supporting statement.');
      if(polarity==='conditional'||op.value==='true'&&polarity==='negative')throw new Error("Condition contradicts its polarity cue.");
    }
    return;
  }

  if ((op.field === "minimumScope" || op.field === "maximumScope") && boundScopeCues(op.field, raw).some(cue => cue !== op.value)) throw new Error("The bound scope contradicts its explicit per-call, per-block or per-movement evidence; confirm the governing term.");
  if (input.fieldName) {
    const meaning = classifyFormField(input.fieldName, input.fieldLabel);
    if (meaning.conflicts.length || meaning.field && meaning.field !== op.field) throw new Error("The submitted form field identifies a different or conflicting measurement/event.");
  }
  if (["assert", "correct"].includes(op.operation) && ["service", "vesselCategory", "port", "terminal"].includes(op.field) && ["reject", "reference", "preserve"].includes(operationAt(input.text, input.text.indexOf(raw)))) throw new Error("The location/category evidence is not asserted in the full user input.");
  const anchor = anchors[op.field];
  if (anchor && !anchor.test(raw) && !anchor.test([input.fieldName, input.fieldLabel].join(" ")) && !explicitBerthInterval(op, input)) throw new Error(`The evidence does not identify ${op.field}.`);
  if (categoryTerms[op.field] && !categoryTerms[op.field]![op.value]?.test(raw)) throw new Error(`The evidence does not support the proposed ${op.field} category.`);
  if (op.field === "basis" && op.value === "time-period" && /(?:GT|GRT|metre|meter|movement|tonne|container)/i.test(raw)) throw new Error("A dimensional rate cannot be treated as time-only billing.");
  if (op.field === "rounding") {
    if (op.value === "exact" && /started|commenced|part\s+thereof|round[\s\S]*up/i.test(raw)) throw new Error("Commenced-period evidence cannot authorize exact-time billing.");
    if (/round[\s\S]*(?:amount|bill|charge|dollar|rupee|currency)/i.test(raw) && !/round[^.!?\n]*(?:stay|duration|hours?|periods?|blocks?)/i.test(raw)) throw new Error("Monetary rounding is distinct from billing-time rounding.");
  }
  if (op.field === "port") {
    const selection = resolvePortIdentity(raw);
    if (selection && (selection.status !== "identified" || selection.candidates.length !== 1 || selection.candidates[0] !== op.value)) throw new Error("Requested port identity is unresolved or mismatched.");
    if (!selection && raw.trim().toLowerCase() !== op.value.toLowerCase()) throw new Error("Unsupported port must retain its original identity.");
  }
  const anonymousItem=op.field==="charge"&&/^item_[1-9]\d{0,2}$/.test(op.value)&&/^(?:USD|INR|EUR|GBP|[$₹€£])\s*\d[\d,.]*$/i.test(raw.trim());
  if (["terminal", "vesselName", "supplierState", "supplyState", "flag", "charge", "timeZone", "operator","fxFrom","fxTo"].includes(op.field) && !anonymousItem && !raw.toLowerCase().includes(op.value.toLowerCase())) throw new Error(`The ${op.field} identity is absent from its evidence.`);
  if(op.field==="basis"&&op.value==="amount"){
    const at=input.text.indexOf(raw),left=input.text.slice(0,at).split(/[;!?\n]|\.(?!\d)/).at(-1)??"",right=input.text.slice(at+raw.length).split(/[;!?\n]|\.(?!\d)/)[0];
    if(/(?:per|\/)\s*(?:\d+\s*)?(?:GT|GRT|tonne|ton|hour|day|movement|container|call|visit)\b/i.test(left+raw+right))throw new Error("A unit rate cannot be reclassified as a stated amount.");
  }
  if (op.field === "arithmeticExpression" && (op.unit !== "expression" || !raw.includes(op.value))) throw new Error("Arithmetic must retain the supplied expression.");
  if (booleanFields.has(op.field)) {
    const polarity = booleanPolarity(op.field, raw);
    if (polarity === "conditional" || op.value === "true" && polarity === "negative" || op.value === "false" && polarity !== "negative") throw new Error("The condition's polarity does not support the proposed value; confirm its applicability.");
  }
  const number = numericFields[op.field];
  if (number) {
    const value = new Decimal(op.value);
    if (!value.isFinite() || value.lt(number.positive ? "0.0000000001" : 0) || value.gt("1e18") || value.decimalPlaces() > 20 || number.integer && !value.isInteger()) throw new Error(`${op.field === "gt" ? "GT" : op.field} must be ${number.positive ? "positive" : "nonnegative"}${number.integer ? " and an integer" : ""}, within the supported range.`);
    if (op.unit !== number.unit) throw new Error(`Invalid ${op.field} dimension.`);
    const fieldMeaning = [input.fieldName, input.fieldLabel].filter(Boolean).join(" ");
    const role = metricNames[op.field];
    if (role && !role.test(raw) && !role.test(fieldMeaning)) throw new Error(`Evidence does not identify ${op.field}.`);
    let numericRaw = expandCardinals(raw);
    // A full stop terminates a number; a dot followed by a digit continues it.
    // Keep the left boundary and decimal/word continuation checks so neither
    // 80.5 nor malformed 80.5.7 can supply an asserted 80.
    const atoms = [...numericRaw.matchAll(/(?<![\w.])[-−]?\d[\d,]*(?:\.\d+)?(?:[eE][+-]?\d+)?(?!\w|\.\d)/g)].filter(m => /^[+−-]?(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})+,\d{3})(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(m[0])).map(m => m[0].replaceAll(",", "").replace("−", "-"));
    if(op.field==="moneyDecimals"){if(value.gt(8))throw new Error("Money precision exceeds the supported bound.");if(/paise|cents/i.test(raw))atoms.push("2");}
    if (["ladenContainers","emptyContainers"].includes(op.field)) {
      const role=op.field==="ladenContainers"?"(?:laden|loaded)":"empty";
      if(value.eq(0)&&new RegExp(`\\bno\\s+${role}\\b`,"i").test(raw))atoms.push("0");
      else if(!input.fieldName&&!new RegExp(`(?:${role}\\s*(?:containers?|boxes)?\\s*[:=]?\\s*${op.value}\\b|\\b${op.value}\\s+${role}\\b)`,"i").test(numericRaw.replaceAll(",","")))throw new Error("Container count must bind to its laden/empty count, not its size.");
    }
    if (op.field==="containerSize"&&!input.fieldName&&!new RegExp(`\\b${op.value}[- ]*(?:ft|foot|feet)\\b`,"i").test(raw))throw new Error("Container size needs an explicit foot dimension.");
    if (op.field==="callDays"&&!input.fieldName&&!new RegExp(`\\b${op.value}\\s*days?\\b`,"i").test(raw))throw new Error("Call duration needs a day dimension.");
    if (op.field === "durationMinutes") {
      const parts = [...numericRaw.matchAll(/(?<![\w.])([−-]?\d[\d,]*(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?)\b/gi)];
      if (!parts.length || !parts.reduce((sum, m) => sum.add(new Decimal(m[1].replaceAll(",", "").replace("−", "-")).mul(/^h/i.test(m[2]) ? 60 : 1)), new Decimal(0)).eq(value)) throw new Error("Composite duration does not match its hour/minute evidence.");
      atoms.push(value.toString());
    }
    if (op.field === "movements" && !input.fieldName && ![...numericRaw.matchAll(/(\d[\d,]*)\s+(?:movements?|moves)\b/gi)].some(m => new Decimal(m[1].replaceAll(",", "")).eq(value))) throw new Error("Movement count needs a complete quantity and movement unit.");
    if (op.field === "taxPercent" && /\b(?:no|without|zero)\b/i.test(raw) && /\btax(?:es)?\b/i.test(raw) && !/\b(?:but|except|unless|if)\b/i.test(raw)) atoms.push("0");
    if (op.field === "periodHours" && /(?:per|\/)\s*hour\b/i.test(raw)) atoms.push("1");
    if (op.field === "periodHours" && /(?:per|\/)\s*day\b/i.test(raw)) atoms.push("24");
    if (op.field === "basisQuantity" && /(?:per|\/|each)\s*(?:GT|GRT|movement|tonne|ton)\b/i.test(raw)) atoms.push("1");
    const convertible = ["gt", "nt", "dwt", "loa", "draught", "durationHours", "periodHours"].includes(op.field);
    const quantityField = op.field === "periodHours" ? "durationHours" : op.field as QuantityCandidate["field"];
    if (op.field === "periodHours") numericRaw = numericRaw.replace(/(?:per|\/)\s*(hour|day)\b/gi, "1 $1");
    const candidates = convertible ? input.fieldName ? [formQuantity(numericRaw, quantityField)].filter((c): c is QuantityCandidate => !!c) : proseQuantities(numericRaw) : [];
    const matches = convertible ? candidates.filter(c => c.field === quantityField).some(candidate => {
        const normalized = normalizeQuantity(candidate, input.formUnit);
        return !("error" in normalized) && ({ hour: "hours", metre: "m", DWT: "tonnes" }[normalized.unit] ?? normalized.unit) === op.unit && new Decimal(normalized.value).eq(value);
      }) : atoms.some(atom => new Decimal(atom).eq(value));
    if (!matches) throw new Error(`The ${op.field} value is not supported by its numeric evidence.`);
    if (["rate", "minimum", "maximum"].includes(op.field)) {
      const money = [...numericRaw.matchAll(/(?:USD|INR|EUR|GBP|US\$|[$₹€£])\s*(\d[\d,]*(?:\.\d+)?)/gi)].filter(m => new Decimal(m[1].replaceAll(",", "")).eq(value));
      if (!money.length) throw new Error("A monetary quantity requires its explicit currency.");
      const hasRole = money.some(m => {
        const before = numericRaw.slice(0, m.index).trim(); const after = numericRaw.slice(m.index! + m[0].length).trim();
        const role = /\b(minimum|maximum|cap)\s*$/i.exec(before)?.[1] ?? /^(minimum|maximum|cap)\b/i.exec(after)?.[1];
        return op.field === "rate" ? !role : op.field === "minimum" ? role?.toLowerCase() === "minimum" : role && /maximum|cap/i.test(role);
      });
      if (!hasRole) throw new Error("The monetary value has a different governing role.");
    }
    const numericAt = input.text.indexOf(raw) + Math.max(0, raw.search(/\d/));
    const surroundingRole = operationAt(input.text, numericAt);
    if (["assert", "correct"].includes(op.operation) && ["reject", "reference", "preserve"].includes(surroundingRole) && !(op.field === "taxPercent" && op.value === "0")) throw new Error("The cited number has a non-asserted role in the full user input.");
    if (["assert", "correct"].includes(op.operation) && /\b(?:previous(?:ly)?|historical|formerly|superseded)\b/i.test(raw) && surroundingRole !== "replace") throw new Error("A historical value needs explicit adoption before use.");
    // Explicit dimensions cannot be discarded even if the numeric value matches.
    if (role) {
      const measures = Object.entries(metricNames).filter(([, pattern]) => pattern.test(raw));
      if (measures.length > 1) throw new Error("Use a separate evidence clause for each measurement.");
    }
  }
  if (["berthStart", "berthEnd", "anchorageArrival", "cargoCompleted", "portDeparture", "intervalStart", "intervalEnd", "readinessTime", "callDate","fxDate"].includes(op.field)) {
    // Date/time normalization is performed by code later. The model cannot
    // silently resolve numeric date order, invent a year, or change a timestamp.
    if (op.unit !== "timestamp" || !raw.includes(op.value)) throw new Error("Timestamp must retain the original user text.");
    const at = input.text.indexOf(raw);
    const clause = (input.text.slice(0, at).split(/[.!?;\n]/).at(-1) ?? "") + raw + input.text.slice(at + raw.length).split(/[.!?;\n]/)[0];
    if (/\beither\b[\s\S]*\bor\b/i.test(clause) && timestampAtoms(clause).length > 1) throw new Error("The event has alternative timestamps; confirm which applies before establishing a date.");
    if (timestampAtoms(raw).length > 1) throw new Error("Use a distinct supporting clause for each event timestamp.");
  }
}

export function reduceInterpretation(previous: ConversationState, unknownProposal: unknown, inputs: readonly ConversationInput[]): { state: ConversationState; receipt: InterpretationReceipt } {
  const proposal = interpretationSchema.parse(unknownProposal);
  if (proposal.baseHash !== previous.hash) throw new Error("Interpretation revision is stale.");
  const pending = inputs.filter(i => !previous.consumed.includes(i.id));
  const allowed = new Set(pending.map(i => i.id));
  if (proposal.inputIds.length !== allowed.size || new Set(proposal.inputIds).size !== allowed.size || proposal.inputIds.some(id => !allowed.has(id))) throw new Error("Interpretation must account for every pending authenticated input.");
  const state = structuredClone(previous); state.revision++;
  for (const scope of proposal.scopes) {
    const prior = state.scopes.find(s => s.id === scope.id);
    if (prior && (prior.kind !== scope.kind || prior.parentId !== scope.parentId || prior.label !== scope.label)) throw new Error("Existing scope identity cannot be reassigned.");
    // Unchanged scope references may point to the input that created the scope.
    // Creating a scope still requires this dispatch's pending input evidence.
    evidenceInput(scope.evidence, inputs, prior ? new Set(inputs.map(i=>i.id)) : allowed);
    if (!prior) state.scopes.push(scope);
  }
  for (const scope of state.scopes) if (scope.parentId && (!state.scopes.some(s => s.id === scope.parentId && s.kind !== "quotation-rule") || scope.id === scope.parentId)) throw new Error("Invalid scope parent.");
  for(const scope of state.scopes){const seen=new Set<string>();let next:typeof scope|undefined=scope;while(next){if(seen.has(next.id))throw new Error("Scope links must not contain cycles.");seen.add(next.id);next=state.scopes.find(s=>s.id===next!.parentId);}}
  if (state.scopes.length > 32) throw new Error("Too many independent call scopes.");
  // Sort on authenticated chronology, never model array order alone.
  const ordered = proposal.operations.map((op, index) => ({ op, index, order: inputs.findIndex(i => i.id === op.evidence.inputId) })).sort((a, b) => a.order - b.order || a.index - b.index);
  for (const { op: proposed, order } of ordered) {
    const currencyUnit = ['rate','minimum','maximum'].includes(proposed.field) && /^(USD|INR|EUR|GBP)$/.test(proposed.unit) && monetaryEvidenceCurrency(proposed) === proposed.unit;
    let op = proposed.unit === "" || currencyUnit ? {...proposed,unit:codeOwnedUnit(proposed.field)} : proposed; const normalizations: string[] = [];
    if (proposed.unit === "timestamp" && !proposed.evidence.quote.includes(proposed.value)) {
      const atoms = timestampAtoms(proposed.evidence.quote);
      if (atoms.length === 1) { op = { ...proposed, value: atoms[0] }; normalizations.push("Replaced model-normalized timestamp with the single original timestamp in its event evidence."); }
    }
    const input = evidenceInput(op.evidence, inputs, op.operation === "reference" || op.operation === "preserve" ? new Set(inputs.map(i=>i.id)) : allowed);
    if (!state.scopes.some(s => s.id === op.scopeId)) throw new Error("Unknown fact scope.");
    if(op.operation==='preserve'){
      const saved=currentConversationFact(state,op.scopeId,op.field);
      if(!saved||saved.value!==op.value||saved.unit!==op.unit)throw new Error("Preserve operation has no matching established fact.");
      // Keeping a saved fact creates no new assertion or numeric evidence.
      continue;
    }
    let invalid = false, validationError: string | undefined;
    if (op.operation === "inherit") {
      const parent = state.scopes.find(s => s.id === op.scopeId)?.parentId;
      const source = state.facts.find(f => f.id === op.fromFactId && f.status === "established");
      const identity = state.scopes.find(s => s.id === parent);
      const active = new Set(previous.tasks.map(t => t.scopeId));
      const explicitSame = /\bsame\s+(?:vessel|ship)\b/i.test(input.text) && active.size === 1 && active.has(parent!) || identity && identity.label.length > 2 && input.text.toLowerCase().includes(identity.label.toLowerCase());
      if (!source || source.scopeId !== parent || source.field !== op.field || source.value !== op.value || source.unit !== op.unit || !["gt", "nt", "dwt", "loa"].includes(op.field) || !explicitSame || /\b(?:new|another|different)\s+(?:vessel|ship)\b/i.test(input.text)) { invalid = true; validationError = "Only unchanged vessel particulars can be explicitly inherited into an unambiguous linked call."; }
    } else {
      try { validateOperation(op, input, proposal.contract === "facts-v3"); } catch (error) { invalid = true; validationError = error instanceof Error ? error.message : "The fact could not be validated."; }
    }
    // An explicit named entity in the same clause outranks a proposed scope.
    // This only detects contradictions; absence of a name is not proof of role.
    const clauseStart = Math.max(input.text.lastIndexOf(";", input.text.indexOf(op.evidence.quote)), input.text.lastIndexOf("\n", input.text.indexOf(op.evidence.quote))) + 1;
    const prefix = (input.text.slice(clauseStart, input.text.indexOf(op.evidence.quote) + op.evidence.quote.length) + " " + (input.fieldLabel ?? "")).toLowerCase();
    const named = state.scopes.filter(s => s.kind === "call" && s.label.length > 2 && prefix.includes(s.label.toLowerCase()));
    // A conversion clause may name the side being converted while its FX facts
    // belong to the separate comparison scope. Quote prices/quantities retain
    // the normal named-entity binding check.
    const comparison = proposal.tasks.find(t => t.kind === "comparison" && t.scopeId === op.scopeId);
    const comparisonFx = ["fxRate", "fxFrom", "fxTo", "fxDate"].includes(op.field) && comparison
      && named.every(scope => comparison.comparisonTaskIds?.some(id => proposal.tasks.some(t => t.id === id && t.kind === "quote" && t.scopeId === scope.id)));
    if (!comparisonFx && named.length === 1 && named[0].id !== op.scopeId && !state.scopes.some(s => s.id === op.scopeId && s.parentId === named[0].id)) invalid = true;
    const prior = state.facts.filter(f => f.scopeId === op.scopeId && f.field === op.field && ["established", "conflicting"].includes(f.status));
    const same = prior.find(f => f.value === op.value && f.unit === op.unit);
    let status: ConversationFact["status"] = "established";
    if (invalid) { status = "conflicting"; for (const f of prior) f.status = "conflicting"; }
    else if (op.operation === "reference") status = "reference";
    else if (op.operation === "reject") { status = "rejected"; if (same) same.status = "superseded"; }
    else if (op.operation === "uncertain") { status = "conflicting"; for (const fact of prior) fact.status = "conflicting"; }
    else if (op.operation === "correct") {
      if (!prior.length && !state.facts.some(f => f.scopeId === op.scopeId && f.field === op.field && f.status !== "reference")) throw new Error("Correction has no current target in this scope.");
      for (const fact of prior) fact.status = "superseded";
    } else if (prior.some(f => f.value !== op.value || f.unit !== op.unit)) {
      status = "conflicting"; for (const fact of prior) fact.status = "conflicting";
    } else if (same) continue;
    const fact = { ...op, id: conversationDigest([op, state.revision]), revision: state.revision, inputOrder: order, status, supersedes: op.operation === "correct" ? prior.map(f => f.id) : [], ...(validationError ? { validationError } : {}), ...(normalizations.length ? { normalizations } : {}) };
    state.facts.push(fact);
  }
  if (state.facts.length > 1024) throw new Error("Conversation fact limit exceeded.");
  // Also bind the scope to its own monetary term: quoting a rate's block clause
  // cannot override a minimum's per-call clause in the same interpretation.
  // Only the enumerated cues above are covered. A later explicit scope correction
  // may supersede an earlier term's scope without changing its monetary amount.
  for (const scope of state.scopes.filter(s=>s.kind==="quotation-rule")) {
    for (const bound of ["minimum","maximum"] as const) {
      const treatment=currentConversationFact(state,scope.id,(bound+'Treatment') as ConversationField);
      const amount=currentConversationFact(state,scope.id,bound);
      if(treatment?.value==='none'&&amount&&amount.evidence.inputId===treatment.evidence.inputId&&new Decimal(amount.value).gt(0)){
        treatment.status='conflicting';treatment.validationError='An absent bound contradicts a positive amount in the same authored input.';
      }
      const field = bound === "minimum" ? "minimumScope" : "maximumScope";
      const term = currentConversationFact(state,scope.id,bound), limit = currentConversationFact(state,scope.id,field);
      if (term && limit && term.revision >= limit.revision && boundScopeCues(field,term.evidence.quote).some(cue=>cue!==limit.value)) {
        limit.status="conflicting";
        limit.validationError="The bound scope contradicts the explicit scope of its monetary term; confirm the governing term.";
      }
    }
  }
  for (const task of proposal.tasks) {
    const taskInput = evidenceInput(task.evidence, inputs, new Set(inputs.map(i => i.id)));
    if (!state.scopes.some(s => s.id === task.scopeId && s.kind !== "quotation-rule")) throw new Error("Task needs a call/scenario scope.");
    const scenarioParent=state.scopes.find(s=>s.id===task.scopeId&&s.kind==="scenario")?.parentId;
    if (task.ruleScopeIds.some(id => !state.scopes.some(s => s.id === id && s.kind === "quotation-rule" && (s.parentId === task.scopeId || s.parentId===scenarioParent)))) throw new Error("Quotation rules cannot cross unrelated call scopes.");
    if (new Set(task.ruleScopeIds).size !== task.ruleScopeIds.length || new Set(task.charges).size !== task.charges.length) throw new Error("Requested charges and rule references must be unique.");
    if(task.kind==="comparison"&&(!task.comparisonTaskIds||task.comparisonTaskIds.length<2||new Set(task.comparisonTaskIds).size!==task.comparisonTaskIds.length||task.comparisonTaskIds.some(id=>!proposal.tasks.some(t=>t.id===id&&t.kind==="quote"))))throw new Error("Comparison must identify distinct current quotation tasks.");
    if(task.kind==="comparison"&&task.comparisonTaskIds?.some(id=>proposal.tasks.find(t=>t.id===id)?.scopeId===task.scopeId))throw new Error("Comparison conversion/rounding needs its own scope.");
    if (task.kind === "quote" && task.source === "official" && /\ball(?:[ -]in)?\s+(?:port(?:[ -]call)?\s+)?(?:charges|costs|services)\b/i.test(taskInput.text) && !task.charges.includes("other")) throw new Error("An all-charge request cannot be reduced to a component quote.");
    if (task.source === "supplied") {
      for (const ruleId of task.ruleScopeIds) {
        const identity = currentConversationFact(state, ruleId, "charge");
        if (!identity) continue;
        for (const term of state.facts.filter(f => f.scopeId === ruleId && f.status === "established" && f.field !== "charge" && (proposal.contract !== "facts-v3" || requiresLiteralGrounding(f.field)))) {
          const enclosed = term.evidence.inputId === identity.evidence.inputId && identity.evidence.quote.includes(term.evidence.quote);
          if (!enclosed && !term.evidence.quote.toLowerCase().includes(identity.value.toLowerCase())) throw new Error("A quoted term cannot be assigned to a different charge by its label.");
        }
      }
      for (const input of pending) {
        // Keep grouping commas inside the amount, not list punctuation after it.
        for (const amount of input.text.matchAll(/(?:USD|INR|EUR|GBP|US\$|[$₹€£])\s*(\d(?:[\d,]*\d)?(?:\.\d+)?)/gi)) {
          const numeric = new Decimal(amount[1].replaceAll(",", ""));
          const accounted = proposal.operations.some(op => op.evidence.inputId === input.id && ["rate", "minimum", "maximum"].includes(op.field) && op.evidence.quote.includes(amount[0]) && (() => { try { return new Decimal(op.value).eq(numeric); } catch { return false; } })());
          // A supplied conversion such as USD1.10 per EUR1 contains monetary
          // tokens but is not another quotation line. Bind both tokens to the
          // exact directional FX clause; a broad evidence quote cannot excuse
          // an omitted price elsewhere in the message.
          const conversion = proposal.tasks.filter(t => t.kind === "comparison").some(comparison => {
            const rate = currentConversationFact(state, comparison.scopeId, "fxRate");
            const from = currentConversationFact(state, comparison.scopeId, "fxFrom")?.value;
            const to = currentConversationFact(state, comparison.scopeId, "fxTo")?.value;
            if (!rate || rate.evidence.inputId !== input.id) return false;
            return [...input.text.matchAll(/\b(USD|INR|EUR|GBP)\s*(\d+(?:\.\d+)?)\s+per\s+(USD|INR|EUR|GBP)\s*1(?:\.0+)?(?!\d|\.\d)/gi)].some(pair =>
              pair[1].toUpperCase() === to && pair[3].toUpperCase() === from && new Decimal(pair[2]).eq(rate.value)
              && amount.index! >= pair.index! && amount.index! + amount[0].length <= pair.index! + pair[0].length);
          });
          if (!accounted && !conversion && !proposal.unresolved.some(i => i.evidence.inputId === input.id && i.evidence.quote.includes(amount[0]))) throw new Error("A monetary term was omitted from the supplied quotation interpretation.");
        }
      }
    }
  }
  // Tasks are the current request's complete requested scope, not stale intent
  // inferred from one message. Explicit follow-ups may refer to earlier intent.
  state.tasks = proposal.tasks;
  if(new Set(state.tasks.map(t=>t.id)).size!==state.tasks.length)throw new Error("Task IDs must be unique.");
  state.unresolved = proposal.unresolved.map(issue => { evidenceInput(issue.evidence, inputs, new Set(inputs.map(i => i.id))); return issue; });
  state.consumed.push(...proposal.inputIds);
  const sealed = seal(state);
  return { state: sealed, receipt: { version: 1, kind: "conversation-interpretation", proposal, stateHash: sealed.hash } };
}

/** Receipts are server-produced tool results, never assistant prose or memory.
 * Recompute rather than trusting a serialized state/hash from the model. */
export function replayConversation(messages: readonly ModelMessage[]) {
  const inputs = conversationInputs(messages); let state = emptyConversation();
  for (const [index, message] of messages.entries()) {
    if (message.role !== "tool") continue;
    for (const part of message.content) {
      if(part.type==="tool-result"&&part.toolName==="get_vessel"&&part.output.type==="json"&&part.output.value&&typeof part.output.value==="object"&&!Array.isArray(part.output.value)&&"lookupReceipt" in part.output.value){
        state=applyVesselLookup(state,part.output.value.lookupReceipt as unknown as VesselLookupReceipt);continue;
      }
      if (part.type !== "tool-result" || part.toolName !== "interpret_request" || part.output.type !== "json") continue;
      const receipt = part.output.value as unknown as InterpretationReceipt;
      if (receipt?.kind !== "conversation-interpretation") continue;
      const available = inputs.filter(i => i.messageIndex < index);
      const reduced = reduceInterpretation(state, receipt.proposal, available);
      if (reduced.state.hash !== receipt.stateHash) throw new Error("Saved interpretation is inconsistent with authenticated history.");
      state = reduced.state;
    }
  }
  return { state, inputs, pending: inputs.filter(i => !state.consumed.includes(i.id)) };
}
