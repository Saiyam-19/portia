import { createHash } from "node:crypto";
import type { ModelMessage } from "ai";
import Decimal from "decimal.js";
import { calculateElapsedTime } from "./elapsed-time";
import { resolvePortIdentity, type PortSelection } from "./port-identity";
import { classifyFormField, eventField, EVENT_CHAIN, EVENT_FIELDS, isAsserted, operationAt, operationIntentAt, normalizeQuantity, formQuantity, proseQuantities, hasArithmeticTask, QUANTITY_FIELDS, VESSEL_FIELDS } from "./request-semantics";

export type FactField = "gt" | "nt" | "dwt" | "loa" | "draught" | "durationHours" | "dateOrder" | "timeZone" |
  "berthStart" | "berthEnd" | "anchorageArrival" | "cargoCompleted" | "portDeparture" | "intervalStart" | "intervalEnd" | "unassignedTimestamp" | "port";
export type FactOrigin = {
  kind: "user" | "submitted-form" | "cancel-note";
  messageIndex: number; messageHash: string; toolCallId?: string; fieldName?: string;
  text: string; start: number; end: number; raw: string;
};
export type ContextFact = {
  id: string; scopeId: string; field: FactField; value: string; unit: string;
  status: "established" | "invalid" | "conflicting" | "superseded" | "rejected" | "preserved" | "reference";
  revision: number; sequence: number; origin: FactOrigin; normalizations: string[]; supersedes: string[]; inheritedFrom?: string;
};
export type ContextScope = { id: string; label: string; vesselId?: string; callIndex?: number; previousCallId?: string; port?: PortSelection; portFactId?: string };
export type ContextIssue = { code: string; message: string; scopeId: string; factIds: string[]; fields: FactField[]; sequence: number; revision: number };
export type ContextIssueHistory = ContextIssue & { resolved: boolean };
export type RequestTask = {
  id: string; scopeId: string; kind: "elapsed" | "arithmetic" | "tariff" | "rule" | "lookup" | "memory" | "general";
  status: "ready" | "needs-clarification"; issueCodes: string[];
};
export type ResultPayload =
  | { kind: "elapsed"; startUtc: string; endUtc: string; elapsedHours: string }
  | { kind: "arithmetic"; expression: string; exactResult: string }
  | { kind: "lookup"; receiptId: string; particulars: Record<string, string> }
  | { kind: "memory"; action: "remember" | "recall" | "forget" | "clear" | "notes"; receiptId: string };
export type ContextResult = {
  id: string; scopeId: string; contextRevision: number; contextHash: string;
  dependencies: string[]; status: "valid" | "invalidated"; value: ResultPayload;
};
export type CallContext = {
  schemaVersion: 1; revision: number; hash: string; scopes: ContextScope[]; activeScopeIds: string[];
  facts: ContextFact[]; issues: ContextIssue[]; issueHistory: ContextIssueHistory[]; sequence: number; tasks: RequestTask[]; results: ContextResult[];
  userText: string; latestText: string;
};
export type AuthoredInput = { text: string; kind: FactOrigin["kind"]; messageIndex: number; messageHash: string; toolCallId?: string; fieldName?: string; fieldLabel?: string; formUnit?: string };
type Input = AuthoredInput;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const month = "(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
const date = `(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\s+${month}\\s+\\d{4}|\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{4})`;
const zone = "(?:Asia/Kolkata|India(?:n)?(?: Standard)? time|UTC|GMT|IST|Z|[+-]\\d{2}:?\\d{2})";
const timestamp = new RegExp(`\\b${date}(?:T|[, ]+(?:at\\s+)?)(?:\\d{1,2}:\\d{2})(?::\\d{2}(?:\\.\\d{1,3})?)?(?:\\s*${zone})?`, "gi");
/** Lexical timestamp atoms only; no event roles, scope or date-order inference. */
export function timestampAtoms(text: string): string[] {
  return [...text.matchAll(new RegExp(timestamp))].map(m => m[0].trim());
}
/** Only authenticated user history and the persisted ask_user_input responses are
 * input evidence. Assistant/lookup/memory text is never promoted to user facts. */
export function authenticatedInputs(messages: readonly ModelMessage[]): Input[] {
  const result: Input[] = [];
  const forms = new Map<string, Array<{ name: string; label?: string; unit?: string }>>();
  messages.forEach((message, messageIndex) => {
    const messageHash = hash(message);
    if (message.role === "user") {
      const text = typeof message.content === "string" ? message.content : message.content.filter(p => p.type === "text").map(p => p.text).join("\n");
      result.push({ text, kind: "user", messageIndex, messageHash });
    }
    if (message.role === "assistant" && Array.isArray(message.content)) for (const part of message.content) {
      if (part.type !== "tool-call" || part.toolName !== "ask_user_input" || !part.input || typeof part.input !== "object") continue;
      const fields = (part.input as { fields?: unknown }).fields;
      if (Array.isArray(fields)) forms.set(part.toolCallId, fields.filter((f): f is { name: string; label?: string; unit?: string } => !!f && typeof f === "object" && typeof f.name === "string"));
    }
    if (message.role === "tool") for (const part of message.content) {
      if (part.type !== "tool-result" || part.toolName !== "ask_user_input" || part.output.type !== "json") continue;
      const value = part.output.value;
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const body = value as { cancelled?: unknown; note?: unknown; values?: unknown };
      const common = { messageIndex, messageHash, toolCallId: part.toolCallId };
      if (body.cancelled !== true && body.values && typeof body.values === "object" && !Array.isArray(body.values)) {
        for (const [fieldName, text] of Object.entries(body.values)) if (typeof text === "string") {
          const definition = forms.get(part.toolCallId)?.find(f => f.name === fieldName);
          result.push({ ...common, text, kind: "submitted-form", fieldName, fieldLabel: definition?.label, formUnit: definition?.unit });
        }
      }
      if (typeof body.note === "string" && body.note.trim()) result.push({ ...common, text: body.note, kind: body.cancelled === true ? "cancel-note" : "submitted-form" });
    }
  });
  return result.filter(i => i.text.trim());
}

function origin(input: Input, start: number, end: number): FactOrigin {
  return { kind: input.kind, messageIndex: input.messageIndex, messageHash: input.messageHash,
    ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}), ...(input.fieldName ? { fieldName: input.fieldName } : {}),
    text: input.text, start, end, raw: input.text.slice(start, end) };
}
const normalizeZone = (value: string) => /^(?:Asia\/Kolkata|India(?:n)?(?: Standard)? time)$/i.test(value) ? "IST" : value.toUpperCase();

export function currentFacts(context: CallContext, scopeId?: string): ContextFact[] {
  return context.facts.filter(f => f.status !== "superseded" && (scopeId ? f.scopeId === scopeId : context.activeScopeIds.includes(f.scopeId)));
}

/** Deterministic history projection. Language recognition is deliberately bounded;
 * unrecognized prose stays available to the existing agent, not fabricated as facts. */
export function buildCallContext(messages: readonly ModelMessage[], previous?: CallContext): CallContext {
  const authored = authenticatedInputs(messages);
  const context: CallContext = { schemaVersion: 1, revision: 0, hash: "", scopes: [{ id: "scope-0", label: "Current call" }], activeScopeIds: ["scope-0"], facts: [], issues: [], issueHistory: [], sequence: 0, tasks: [], results: [], userText: "", latestText: "" };
  let active = context.scopes[0];
  let lastMessage = -1;
  // Form labels/units were authored by the assistant. They can describe a
  // submitted field, but cannot manufacture a user-supplied tariff/rate.
  const displayInput = (i: Input) => i.fieldName ? `${i.fieldName}: ${i.text}` : i.text;
  context.userText = authored.map(displayInput).join("\n");
  const latestMessage = authored.at(-1)?.messageIndex;
  context.latestText = authored.filter(i => i.messageIndex === latestMessage).map(displayInput).join("\n");
  const put = (input: Input, scope: ContextScope, field: FactField, rawValue: string, unit: string, start: number, end: number, normalize: string[] = [], forcedStatus?: "conflicting") => {
    const o = origin(input, start, end);
    let value = rawValue, valid = true;
    if (QUANTITY_FIELDS.includes(field)) {
      try {
        const n = new Decimal(rawValue.replaceAll(",", "").replace("−", "-"));
        valid = n.isFinite() && n.abs().lte("1e18") && n.decimalPlaces() <= 100 && (field === "durationHours" ? n.gte(0) : n.gt(0));
        value = n.toString();
      } catch { valid = false; }
    }
    const prior = context.facts.filter(f => f.scopeId === scope.id && f.field === field && ["established", "invalid", "conflicting"].includes(f.status));
    const intent = field === "port" ? { operation: "assert" as const, negated: false } : operationIntentAt(input.text, start);
    const operation = intent.operation;
    if (operation === "reference" || operation === "preserve") {
      if (operation === "preserve" && !intent.negated && !prior.some(f => f.status === "established" && f.value === value && f.unit === unit)) {
        reportIssue(context, { code: "PRESERVE_CONFLICT", message: `No matching established ${field} is available to preserve. Confirm the intended current value.`, scopeId: scope.id, fields: [field], factIds: [] });
      }
      context.facts.push({ id: hash([scope.id, field, o, operation]), scopeId: scope.id, field, value, unit,
        status: operation === "reference" ? "reference" : "preserved", revision: context.revision, sequence: ++context.sequence,
        origin: o, normalizations: normalize, supersedes: [] });
      return;
    }
    if (operation === "reject") {
      const withdrawn = prior.filter(f => f.value === value && f.unit === unit && f.status === "established");
      for (const f of withdrawn) f.status = "conflicting";
      if (withdrawn.length) reportIssue(context, { code: "FACT_RETRACTED", message: `The established ${field} was rejected. Confirm its replacement.`, scopeId: scope.id, fields: [field], factIds: withdrawn.map(f => f.id) });
      context.facts.push({ id: hash([scope.id, field, o, "rejected"]), scopeId: scope.id, field, value, unit, status: "rejected", revision: context.revision, sequence: ++context.sequence, origin: o, normalizations: normalize, supersedes: [] });
      return;
    }
    const sameTurnConflict = forcedStatus === "conflicting" || prior.some(f => f.origin.messageIndex === input.messageIndex && f.value !== value) && operation !== "replace";
    const id = hash([scope.id, field, o.messageHash, o.fieldName, o.start, o.end, value]);
    if (context.facts.some(f => f.id === id)) return;
    for (const f of prior) f.status = sameTurnConflict ? "conflicting" : "superseded";
    context.facts.push({ id, scopeId: scope.id, field, value, unit, status: sameTurnConflict ? "conflicting" : valid ? "established" : "invalid", revision: context.revision, sequence: ++context.sequence, origin: o, normalizations: normalize, supersedes: sameTurnConflict ? [] : prior.map(f => f.id) });
  };
  for (const input of authored) {
    if (input.messageIndex !== lastMessage) { context.revision++; lastMessage = input.messageIndex; }
    const text = input.text;
    const priorActive = [...context.activeScopeIds];
    const named = [...text.matchAll(/\b(?:new\s+vessel|vessel|ship|MV)\s+([A-Za-z][A-Za-z0-9]*(?:[ ]+[A-Za-z][A-Za-z0-9]*){0,2})(?=\s*[:,;.]|\s+(?:is|has|GT|GRT|DWT)\b)/gi)];
    const namedReference = [...context.scopes].reverse().find(s => s.id !== "scope-0" && new RegExp(`(?:\\bfor\\s+|^)${s.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:['’]s)?\\s*[,;:]`, "i").test(text));
    const segments = named.length ? named.map((m, i) => ({ start: i ? m.index : 0, end: named[i + 1]?.index ?? text.length, label: m[1].trim() })) : [{ start: 0, end: text.length, label: namedReference?.label }];
    const ambiguousScope = priorActive.length > 1 && !named.length && !namedReference;
    const unresolved: ContextScope | undefined = ambiguousScope ? { id: `scope-${hash([input.messageIndex, "unresolved"]).slice(0, 16)}`, label: "Unresolved vessel/call" } : undefined;
    if (unresolved) { active = unresolved; context.scopes.push(unresolved); }
    const inputScopes = new Set<string>();
    for (const segment of segments) {
      const segmentText = text.slice(segment.start, segment.end);
      const legIntent = /\b(?:new|next|another|second)\s+(?:call|leg)\b/i.exec(segmentText);
      const newLeg = !!legIntent && ["assert", "replace"].includes(operationAt(segmentText, legIntent.index));
      const vesselIntent = /\b(?:new|another|second)\s+(?:vessel|ship)\b/i.exec(segmentText);
      const newVessel = !!vesselIntent && ["assert", "replace"].includes(operationAt(segmentText, vesselIntent.index));
      const priorScope = segment.label ? [...context.scopes].reverse().find(s => s.label.toLowerCase() === segment.label!.toLowerCase()) : active;
      if (newLeg || newVessel || segment.label && !priorScope) {
        const id = `scope-${hash([input.messageIndex, segment.start, segment.label, newLeg ? "leg" : "vessel"]).slice(0, 16)}`;
        active = { id, label: segment.label ?? (newLeg ? priorScope?.label ?? "New call" : "New vessel"),
          vesselId: newLeg ? priorScope?.vesselId ?? priorScope?.id : id,
          callIndex: newLeg ? (priorScope?.callIndex ?? 1) + 1 : 1,
          ...(newLeg && priorScope ? { previousCallId: priorScope.id } : {}) };
        context.scopes.push(active);
        if (newLeg && priorScope) for (const fact of currentFacts(context, priorScope.id).filter(f => f.status === "established" && VESSEL_FIELDS.includes(f.field))) {
          context.facts.push({ ...fact, id: hash([active.id, fact.id, "inherited-vessel-fact"]), scopeId: active.id, revision: context.revision, sequence: ++context.sequence,
            inheritedFrom: fact.id, normalizations: [...fact.normalizations, `Vessel identity unchanged; inherited from ${fact.id}`], supersedes: [] });
        }
      } else if (segment.label && priorScope) active = priorScope;
      inputScopes.add(active.id);
      const part = text.slice(segment.start, segment.end);
      const emit = (field: FactField, value: string, unit: string, start: number, end: number, normalizations: string[] = []) => put(input, active, field, value, unit, segment.start + start, segment.start + end, normalizations);
      const meaning = input.fieldName ? classifyFormField(input.fieldName, input.fieldLabel) : { field: undefined, conflicts: [] };
      const field = meaning.field;
      if (meaning.conflicts.length) {
        reportIssue(context, { code: "FORM_FIELD_CONFLICT", message: `The form field ${input.fieldName} identifies conflicting measurements or events. Confirm its meaning.`, scopeId: active.id, fields: meaning.conflicts, factIds: [] });
        continue;
      }
      const ports = resolvePortIdentity(part);
      const switchedPort = /\b(?:switch|change|instead|rather)\b.{0,40}\b(?:to|port|terminal)\b|\b(?:port|terminal)\s+(?:is now|is|:)\s*\S+/i.test(part);
      const irrelevantRejection = ports?.status === "unresolved" && ports.rejectedCandidates?.length && active.port?.candidates.every(p => !ports.rejectedCandidates!.includes(p));
      if (ports?.operation === "preserve") {
        if (!active.port || ports.candidates.length !== active.port.candidates.length || ports.candidates.some(p => !active.port!.candidates.includes(p)))
          reportIssue(context, { code: "PORT_PRESERVE_CONFLICT", message: "The port to preserve does not match the established call. Confirm the intended port.", scopeId: active.id, fields: ["port"], factIds: [] });
      } else if ((ports && !irrelevantRejection) || field === "port" || switchedPort) {
        active.port = ports ?? { status: "unresolved", candidates: [], mentions: [] };
        emit("port", JSON.stringify(active.port), "identity", 0, part.length);
        active.portFactId = context.facts.at(-1)?.id;
      }
      const candidates = field && QUANTITY_FIELDS.includes(field)
        ? [formQuantity(part, field)].filter((q): q is NonNullable<typeof q> => !!q)
        : input.fieldName ? [] : proseQuantities(part);
      for (const candidate of candidates) {
        const normalized = normalizeQuantity(candidate, input.fieldName ? input.formUnit : undefined);
        const competing = candidates.some(c => c.start === candidate.start && c.field !== candidate.field);
        if ("error" in normalized || competing) {
          if (!isAsserted(part, candidate.start)) continue;
          const code = "error" in normalized ? normalized.error : "MEASUREMENT_CONFLICT";
          const message = "error" in normalized ? normalized.message : "The same value identifies different measurements. Confirm its meaning.";
          put(input, active, candidate.field, candidate.rawNumber, candidate.rawUnit ?? input.formUnit ?? "unresolved", segment.start + candidate.start, segment.start + candidate.end, [], "conflicting");
          reportIssue(context, { code, message, scopeId: active.id, fields: [candidate.field], factIds: [context.facts.at(-1)!.id] });
        } else emit(candidate.field, normalized.value, normalized.unit, candidate.start, candidate.end, normalized.normalizations);
      }
      const dmy = /DD\/MM\/YYYY|day[- /]month[- /]year/i.exec(part);
      const mdy = /MM\/DD\/YYYY|month[- /]day[- /]year/i.exec(part);
      for (const [m, value] of [[dmy, "DMY"], [mdy, "MDY"]] as const) if (m) emit("dateOrder", value, "date-order", m.index, m.index + m[0].length);
      if (field === "dateOrder" && /^(?:DMY|MDY)$/i.test(part.trim())) emit("dateOrder", part.trim().toUpperCase(), "date-order", 0, part.length);
      const sharedZone = new RegExp(`(?:all\\s+(?:times|timestamps)|both|time\\s*zone|timezone)\\s*(?:are\\s+|in\\s+|:\\s*)?(${zone})|\\b(Asia/Kolkata|India(?:n)?(?: Standard)? time)\\b`, "gi");
      for (const m of part.matchAll(sharedZone)) { const raw = m[1] ?? m[2]; emit("timeZone", normalizeZone(raw), "zone", m.index, m.index + m[0].length, raw === normalizeZone(raw) ? [] : ["named India zone → IST"]); }
      if (field === "timeZone" && new RegExp(`^${zone}$`, "i").test(part.trim())) emit("timeZone", normalizeZone(part.trim()), "zone", 0, part.length);
      const times = [...part.matchAll(new RegExp(timestamp))];
      for (const [i, m] of times.entries()) {
        const prefix = part.slice(i ? times[i - 1].index! + times[i - 1][0].length : 0, m.index);
        const key = field && EVENT_FIELDS.includes(field) ? field : eventField(prefix) ?? (times.length === 2 ? i === 0 ? "intervalStart" : "intervalEnd" : "unassignedTimestamp");
        const normalized = m[0].trim().replace(/Asia\/Kolkata|India(?:n)?(?: Standard)? time/gi, "IST");
        emit(key, normalized, "timestamp", m.index, m.index + m[0].length, normalized === m[0].trim() ? [] : ["named India zone → IST"]);
      }
    }
    context.activeScopeIds = [...inputScopes];
    if (unresolved) {
      const proposed = context.facts.filter(f => f.scopeId === unresolved.id);
      context.activeScopeIds = priorActive;
      if (proposed.length) {
        for (const f of proposed) f.status = "conflicting";
        context.activeScopeIds.push(unresolved.id);
        reportIssue(context, { code: "SCOPE_AMBIGUOUS", message: "Which vessel or call does this correction apply to? The existing scopes remain unchanged.", scopeId: unresolved.id, fields: [...new Set(proposed.map(f => f.field))], factIds: proposed.map(f => f.id) });
      } else context.scopes = context.scopes.filter(s => s !== unresolved);
    }
    if (context.facts.length > 1024 || context.scopes.length > 32) throw new Error("Request context exceeds the supported scope. Split this request into smaller calls.");
  }
  reconcileIssues(context);
  const parserIssueCount = context.issues.length;
  validateContext(context);
  context.issueHistory.push(...context.issues.slice(parserIssueCount).map(issue => ({ ...issue, resolved: false })));
  context.hash = hash({ schemaVersion: context.schemaVersion, revision: context.revision, scopes: context.scopes, activeScopeIds: context.activeScopeIds, facts: context.facts.map(f => [f.id, f.status]) });
  context.results = previous ? revalidateResults(context, previous.results) : [];
  return context;
}

function reportIssue(context: CallContext, issue: Omit<ContextIssue, "sequence" | "revision">) {
  context.issues.push({ ...issue, sequence: ++context.sequence, revision: context.revision });
}

/** Historical errors remain auditable but cannot block a corrected current fact.
 * Empty-dependency schema issues resolve only after their own fields are supplied
 * later in reducer order, including a correction note in the same form response. */
function reconcileIssues(context: CallContext) {
  context.issueHistory = context.issues.map(issue => {
    const replaced = (field: FactField) => currentFacts(context, issue.scopeId).some(f => f.field === field && f.status === "established" && f.sequence > issue.sequence);
    const unresolved = issue.factIds.length
      ? issue.factIds.some(id => context.facts.some(f => f.id === id && ["invalid", "conflicting"].includes(f.status)))
      : !(issue.code === "FORM_FIELD_CONFLICT" ? issue.fields.some(replaced) : issue.fields.every(replaced));
    return { ...issue, resolved: !unresolved };
  });
  context.issues = context.issueHistory.filter(issue => !issue.resolved).map(({ resolved: _resolved, ...issue }) => { void _resolved; return issue; });
}

export function temporalFacts(context: CallContext, scopeId: string) {
  const facts = currentFacts(context, scopeId);
  const established = (field: FactField) => facts.find(f => f.field === field && f.status === "established");
  const chain = EVENT_CHAIN.flatMap(f => established(f) ? [established(f)!] : []);
  const events = facts.filter(f => EVENT_FIELDS.includes(f.field) && f.status === "established");
  const berthStart = established("berthStart"), berthEnd = established("berthEnd");
  const genericStart = established("intervalStart"), genericEnd = established("intervalEnd");
  const start = berthStart && berthEnd ? berthStart : genericStart && genericEnd ? genericStart : undefined;
  const end = berthStart && berthEnd ? berthEnd : genericStart && genericEnd ? genericEnd : undefined;
  const pairs: Array<{ start: ContextFact; end: ContextFact; label: string; primary: boolean }> = [];
  const add = (left: ContextFact, right: ContextFact, label: string, primary = false) => {
    if (!pairs.some(p => p.start.id === left.id && p.end.id === right.id)) pairs.push({ start: left, end: right, label, primary });
  };
  if (berthStart && berthEnd) add(berthStart, berthEnd, "Elapsed berth occupancy (all-fast/berthing to last-line-away/unberthing)", true);
  if (genericStart && genericEnd) add(genericStart, genericEnd, "Elapsed interval", !berthStart || !berthEnd);
  const labels: Partial<Record<FactField, string>> = { anchorageArrival: "arrived anchorage", berthStart: "all fast", cargoCompleted: "cargo completed", berthEnd: "last line away", portDeparture: "departed port limits" };
  for (let i = 1; i < chain.length; i++) add(chain[i - 1], chain[i], `${labels[chain[i - 1].field]} → ${labels[chain[i].field]}`);
  if (chain.length > 2) add(chain[0], chain.at(-1)!, "Full recorded visit");
  const explicitZones = new Set(events.map(e => new RegExp(`(${zone})$`, "i").exec(e.value)?.[1]).filter(Boolean));
  const timeZone = established("timeZone")?.value ?? (explicitZones.size === 1 ? [...explicitZones][0] : undefined);
  const dateOrder = established("dateOrder")?.value as "DMY" | "MDY" | undefined;
  return { events, start, end, pairs, timeZone, dateOrder };
}

function validateContext(context: CallContext) {
  for (const scope of context.scopes) {
    const facts = currentFacts(context, scope.id);
    const issue = (code: string, message: string, fields: FactField[]) => reportIssue(context, { code, message, scopeId: scope.id, fields, factIds: facts.filter(f => fields.includes(f.field)).map(f => f.id) });
    for (const f of facts) {
      if (f.status === "invalid") issue("INVALID_QUANTITY", `${f.field === "gt" ? "GT" : f.field} must be ${f.field === "durationHours" ? "nonnegative" : "positive"} and within the supported range. You supplied ${f.origin.raw}. Please confirm it.`, [f.field]);
      if (f.status === "conflicting" && !context.issues.some(i => i.scopeId === scope.id && i.fields.includes(f.field))) issue("FACT_CONFLICT", `Conflicting ${f.field} values were supplied. Please confirm the intended value.`, [f.field]);
    }
    const time = temporalFacts(context, scope.id);
    for (const f of time.events) {
      const result = calculateElapsedTime({ start: f.value, end: f.value, timeZone: time.timeZone, dateOrder: time.dateOrder });
      if (result.status !== "ok") issue(result.error, result.message, [f.field, "timeZone", "dateOrder"]);
    }
    for (const pair of time.pairs) {
      const result = calculateElapsedTime({ start: pair.start.value, end: pair.end.value, timeZone: time.timeZone, dateOrder: time.dateOrder });
      if (result.status !== "ok" && result.error === "REVERSED_INTERVAL") issue(pair.primary ? result.error : "EVENT_ORDER_CONFLICT", `${result.message}\n\n${pair.label}: ${pair.start.value} → ${pair.end.value}`, [pair.start.field, pair.end.field]);
    }
    if (time.start && time.end) {
      const result = calculateElapsedTime({ start: time.start.value, end: time.end.value, timeZone: time.timeZone, dateOrder: time.dateOrder });

      const stated = facts.find(f => f.field === "durationHours" && f.status === "established");
      if (result.status === "ok" && stated && !new Decimal(stated.value).eq(result.elapsedHours)) issue("DURATION_CONFLICT", `The supplied timestamps span ${result.elapsedHours} hours, but you stated ${stated.value} hours. Please confirm which duration is intended before I calculate charges.`, [time.start.field, time.end.field, "durationHours"]);
    }
  }
  // Task kinds are planning/partial-result hints, never publication authority.
  for (const scopeId of context.activeScopeIds) {
    const latest = context.latestText;
    const time = temporalFacts(context, scopeId);
    const kinds: RequestTask["kind"][] = [];
    if (time.events.length || /elapsed|timestamps?/i.test(latest)) kinds.push("elapsed");
    if (hasArithmeticTask(latest)) kinds.push("arithmetic");
    if (/\b(?:remember|recall|forget|memory|notes)\b/i.test(latest)) kinds.push("memory");
    if (/\b(?:find|look up|lookup|search)\b.*\b(?:vessel|ship|IMO|MMSI)\b/i.test(latest)) kinds.push("lookup");
    if (/\b(?:explain|define|definition|rule|what does|what is)\b/i.test(latest)) kinds.push("rule");
    else if (/berth[ -]?hire|charges?|tariff|quotation|quote|estimate/i.test(latest)) kinds.push("tariff");
    if (!kinds.length) kinds.push("general");
    for (const kind of kinds) {
      const issues = context.issues.filter(i => i.scopeId === scopeId && (kind === "tariff" || kind === "elapsed" && i.fields.some(f => EVENT_FIELDS.includes(f) || f === "timeZone" || f === "dateOrder")));
      context.tasks.push({ id: `${scopeId}:${kind}`, scopeId, kind, status: issues.length ? "needs-clarification" : "ready", issueCodes: [...new Set(issues.map(i => i.code))] });
    }
  }
}

/** Rebinding is permitted only for still-established dependencies in the same scope.
 * The old context hash never becomes a fresh publication token. */
export function revalidateResults(context: CallContext, results: readonly ContextResult[]): ContextResult[] {
  return results.map(result => {
    const dependencies = result.dependencies.map(id => {
      const prior = context.facts.find(f => f.id === id && f.scopeId === result.scopeId);
      if (!prior) return undefined;
      return currentFacts(context, result.scopeId).find(f => f.status === "established" && f.field === prior.field && f.value === prior.value && f.unit === prior.unit)?.id;
    });
    const valid = result.status === "valid" && (result.dependencies.length > 0 || result.contextHash === context.hash) && context.scopes.some(s => s.id === result.scopeId) && dependencies.every(id => id !== undefined);
    return { ...result, dependencies: valid ? dependencies as string[] : result.dependencies, status: valid ? "valid" : "invalidated", contextRevision: context.revision, contextHash: context.hash };
  });
}
