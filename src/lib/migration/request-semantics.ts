import Decimal from "decimal.js";
import type { FactField } from "./call-context";

export type Span = { start: number; end: number };
export const NUMERIC_LITERAL = "[−-]?\\d(?:[\\d,]*\\d)?(?:\\.\\d+)?";
const exact = Decimal.clone({ precision: 140, toExpNeg: -200, toExpPos: 200 });

/** Resolve lexical overlap before polarity: a rejected long entity must consume
 * its nested names too. Used for ports and canonical field meanings. */
export function maximalSpans<T extends Span>(mentions: readonly T[]): T[] {
  const selected: T[] = [];
  for (const m of [...mentions].sort((a, b) => (b.end - b.start) - (a.end - a.start))) {
    if (!selected.some(s => m.start < s.end && m.end > s.start)) selected.push(m);
  }
  return selected.sort((a, b) => a.start - b.start);
}

export type FactOperation = "assert" | "replace" | "reject" | "preserve" | "reference";

type OperationIntent = { operation: FactOperation; negated: boolean };
type OperationMention = Span & OperationIntent;
const verbGroups: Array<{ verbs: string[]; positive: FactOperation; negative: FactOperation }> = [
  { verbs: ["use", "take", "accept", "adopt", "confirm"], positive: "replace", negative: "reject" },
  { verbs: ["assert"], positive: "assert", negative: "reject" },
  { verbs: ["keep", "retain", "preserve"], positive: "preserve", negative: "reject" },
  { verbs: ["change", "alter", "replace", "update", "modify", "revise", "set", "correct", "add"], positive: "replace", negative: "preserve" },
  { verbs: ["reject", "ignore", "exclude", "discard", "withdraw"], positive: "reject", negative: "preserve" },
];
const negationPattern = "do\\s+not|don['’]t|not(?!\\s+only\\b)|never|no\\s+longer";
const verbsPattern = verbGroups.flatMap(group => group.verbs).join("|");

/** Negation belongs to the entire verb phrase. Its meaning comes from the verb
 * class, not whichever shorter word happens to match last. */
function operationMentions(text: string): OperationMention[] {
  const result: OperationMention[] = [];
  const phrases = new RegExp(`\\b(?:(${negationPattern})\\s+)?(${verbsPattern})\\b`, "gi");
  for (const m of text.matchAll(phrases)) {
    const group = verbGroups.find(g => g.verbs.includes(m[2].toLowerCase()))!;
    result.push({ start: m.index, end: m.index + m[0].length, operation: m[1] ? group.negative : group.positive, negated: !!m[1] });
  }
  for (const m of text.matchAll(/\b(?:correction|actual|instead|now|confirmed)\b/gi)) result.push({ start: m.index, end: m.index + m[0].length, operation: "replace", negated: false });
  for (const m of text.matchAll(new RegExp(`\\b(?:${negationPattern}|rather than|instead of)\\b`, "gi"))) result.push({ start: m.index, end: m.index + m[0].length, operation: "reject", negated: true });
  return maximalSpans(result);
}

export function operationIntentAt(text: string, start: number): OperationIntent {
  const prefix = text.slice(0, start);
  const clause = prefix.split(/;(?!\d)|,(?!\d)|[\n!?]|\.(?!\d)/).at(-1) ?? "";
  const part = clause.split(/\b(?:but|however)\b/i).at(-1) ?? "";
  const operations = operationMentions(part);
  const report = /\b(?:old|previous|earlier|historical|superseded)\s+(?:record|report|estimate|quote|value|figure|entry|certificate)\b|\b(?:assistant|model)\s+(?:said|claimed)\b/i.exec(part);
  if (report && !operations.some(op => op.operation === "replace" && op.start < report.index)) return { operation: "reference", negated: false };
  const last = operations.at(-1);
  return last ? { operation: last.operation, negated: last.negated } : { operation: "assert", negated: false };
}
export function operationAt(text: string, start: number): FactOperation { return operationIntentAt(text, start).operation; }

/** Lexical mentions can be preserved without being rejected. Fact mutation uses
 * operationAt directly; callers must not reduce these distinct operations to a boolean. */
export function isAsserted(text: string, start: number): boolean {
  return ["assert", "replace", "preserve"].includes(operationAt(text, start));
}

const definitions: Array<{ field: FactField; pattern: string }> = [
  { field: "gt", pattern: "gross(?: registered)? tonnage|GRT|GT" },
  { field: "nt", pattern: "net(?: registered)? tonnage|NRT|NT" },
  { field: "dwt", pattern: "deadweight(?: tonnage)?|DWT" },
  { field: "loa", pattern: "length overall|LOA" },
  { field: "draught", pattern: "draught|draft" },
  { field: "durationHours", pattern: "duration|stay|alongside|occupancy|hours?" },
  { field: "dateOrder", pattern: "date order" },
  { field: "timeZone", pattern: "time ?zone|UTC offset" },
  { field: "anchorageArrival", pattern: "(?:arrived|arrival)(?: at)?(?: the)? anchorage" },
  { field: "berthStart", pattern: "all fast(?: at berth)?|berthed|berthing start|berth start|arrival at berth" },
  { field: "berthEnd", pattern: "last line away|unberthed|berthing end|berth end" },
  { field: "cargoCompleted", pattern: "cargo (?:completed|completion|done)|completed cargo" },
  { field: "portDeparture", pattern: "(?:departed|departure)(?: from)? port limits" },
  { field: "intervalStart", pattern: "arrival|start" },
  { field: "intervalEnd", pattern: "departure|end" },
  { field: "port", pattern: "port|terminal" },
];
export const QUANTITY_FIELDS: readonly FactField[] = ["gt", "nt", "dwt", "loa", "draught", "durationHours"];
export const VESSEL_FIELDS: readonly FactField[] = ["gt", "nt", "dwt", "loa"];
export const EVENT_CHAIN: readonly FactField[] = ["anchorageArrival", "berthStart", "cargoCompleted", "berthEnd", "portDeparture"];
export const EVENT_FIELDS: readonly FactField[] = [...EVENT_CHAIN, "intervalStart", "intervalEnd", "unassignedTimestamp"];
export type FieldMention = Span & { field: FactField; asserted: boolean; reference: boolean };

export function fieldMentions(text: string): FieldMention[] {
  const normalized = text.replace(/[_-]/g, " "); // Length-preserving, so spans still refer to the original.
  const mentions: FieldMention[] = [];
  for (const { field, pattern } of definitions) for (const m of normalized.matchAll(new RegExp(`(?<![\\p{L}${QUANTITY_FIELDS.includes(field) ? "" : "\\p{N}"}_])(?:${pattern})(?![\\p{L}_])`, "giu"))) {
    mentions.push({ field, start: m.index, end: m.index + m[0].length, asserted: true, reference: false });
  }
  return maximalSpans(mentions).map(m => ({ ...m, asserted: isAsserted(normalized, m.start),
    reference: QUANTITY_FIELDS.includes(m.field) && (/\bper\s*$/i.test(normalized.slice(0, m.start)) || /\/\s*$/.test(normalized.slice(0, m.start)) && !followingNumber(normalized, m)) }));
}

export function classifyFormField(name: string, label?: string): { field?: FactField; conflicts: FactField[] } {
  const named = fieldMentions(name), labelled = fieldMentions(label ?? "");
  const rejected = new Set(labelled.filter(m => !m.asserted || m.reference && !labelled.some(p => p.field === m.field && p.asserted && !p.reference)).map(m => m.field));
  if (rejected.has("anchorageArrival") || rejected.has("berthStart")) rejected.add("intervalStart");
  if (rejected.has("berthEnd") || rejected.has("portDeparture")) rejected.add("intervalEnd");
  const fields = new Set([...named, ...labelled].filter(m => m.asserted && !m.reference && !rejected.has(m.field)).map(m => m.field));
  // A displayed specific event refines a generic machine key such as "arrival".
  if (fields.has("anchorageArrival") || fields.has("berthStart")) fields.delete("intervalStart");
  if (fields.has("berthEnd") || fields.has("portDeparture")) fields.delete("intervalEnd");
  return fields.size === 1 ? { field: [...fields][0], conflicts: [] } : { conflicts: fields.size ? [...fields] : [...rejected] };
}

export function eventField(prefix: string): FactField | undefined {
  // The event identity and its assertion polarity are separate. A rejected
  // berth-end timestamp must not fall back to an unrelated generic event.
  return fieldMentions(prefix).filter(m => EVENT_FIELDS.includes(m.field)).at(-1)?.field;
}

type Unit = { names: string[]; fields: readonly FactField[]; canonical: string; factor: string };
const units: readonly Unit[] = [
  { names: ["GT", "GRT"], fields: ["gt"], canonical: "GT", factor: "1" },
  { names: ["NT", "NRT"], fields: ["nt"], canonical: "NT", factor: "1" },
  { names: ["DWT", "tonnes", "tonne", "t"], fields: ["dwt"], canonical: "DWT", factor: "1" },
  { names: ["metres", "metre", "meters", "meter", "m"], fields: ["loa", "draught"], canonical: "metre", factor: "1" },
  // International foot, exactly 0.3048 metre. Decimal arithmetic preserves the source value.
  { names: ["feet", "foot", "ft", "'"], fields: ["loa", "draught"], canonical: "metre", factor: "0.3048" },
  { names: ["hours", "hour", "hrs", "hr", "h"], fields: ["durationHours"], canonical: "hour", factor: "1" },
  { names: ["days", "day"], fields: ["durationHours"], canonical: "hour", factor: "24" },
];
const defaultUnit = (field: FactField) => units.find(u => u.fields.includes(field) && u.factor === "1")!;
const findUnit = (name: string) => units.find(u => u.names.some(n => n.toLowerCase() === name.toLowerCase()));
const fieldConnector = /^\s*(?:(?:is|was|of|to|:|=)\s*)?/i;
const numericToken = /[+−-]?\d[\d,._]*(?:[eE][+−-]?[\d._]*)?/y;
const validNumericToken = /^[+−-]?(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})+,\d{3})(?:\.\d+)?(?:[eE][+−-]?\d+)?$/;
type Literal = Span & { rawNumber: string; rawUnit?: string; numericError?: string };

function numericAtomAt(text: string, start: number): Literal | undefined {
  numericToken.lastIndex = start;
  const match = numericToken.exec(text);
  if (!match) return undefined;
  let rawNumber = match[0];
  if (/[.,]$/.test(rawNumber) && (start + rawNumber.length === text.length || /[\s;!?\p{L}]/u.test(text[start + rawNumber.length]))) rawNumber = rawNumber.slice(0, -1);
  if (!rawNumber) return undefined;
  return { start, end: start + rawNumber.length, rawNumber,
    ...(validNumericToken.test(rawNumber) ? {} : { numericError: `Invalid numeric token ${rawNumber}. Confirm the complete value.` }) };
}
const skipSpace = (text: string, at: number) => at + /^\s*/.exec(text.slice(at))![0].length;
function fieldDeclarationAt(text: string, at: number): boolean {
  for (const { field, pattern } of definitions) {
    if (!QUANTITY_FIELDS.includes(field)) continue;
    const match = new RegExp(`^(?:${pattern})(?![\\p{L}_])`, "iu").exec(text.slice(at));
    if (!match) continue;
    const valueStart = at + match[0].length + fieldConnector.exec(text.slice(at + match[0].length))![0].length;
    if (numericAtomAt(text, valueStart) || /^[+−-]?\s*\(/.test(text.slice(valueStart))) return true;
  }
  return false;
}

/** Consume a complete numeric candidate, never an operand fragment. Arithmetic
 * is deliberately not evaluated here. Slash followed by a new labelled quantity
 * separates declarations; slash followed by another operand is an expression. */
function numberAt(text: string, start: number): Literal | undefined {
  // Callers provide a token start. Skipping initial prose whitespace here would
  // make a postfix scan include that space in the numeric atom.
  if (!text[start] || /\s/.test(text[start])) return undefined;
  let cursor = start, depth = 0, expectOperand = true, sawOperand = false, expression = false, malformed = false;
  while (cursor < text.length) {
    const at = skipSpace(text, cursor);
    if (expectOperand) {
      const unaryGroup = /^[+−-]\s*(?=\()/.exec(text.slice(at));
      if (unaryGroup) { cursor = at + unaryGroup[0].length; expression = true; continue; }
      if (text[at] === "(") { depth++; expression = true; cursor = at + 1; continue; }
      const atom = numericAtomAt(text, at);
      if (!atom) {
        const leadingOperator = /^(?:\*\*|[*/×÷^%])/.exec(text.slice(at));
        if (leadingOperator) {
          const next = skipSpace(text, at + leadingOperator[0].length);
          if (!sawOperand && !expression && leadingOperator[0] === "/" && fieldDeclarationAt(text, next)) return undefined;
          expression = true; malformed = true; cursor = at + leadingOperator[0].length; continue;
        }
        if (!sawOperand && !expression) return undefined;
        // Consume an invalid operand rather than allowing a later scan to promote
        // its digits into a fresh scalar. A field separator was handled earlier.
        const tail = /^[^\s;,]+/.exec(text.slice(at));
        cursor = tail ? at + tail[0].length : at;
        malformed = true; break;
      }
      cursor = atom.end; sawOperand = true; expectOperand = false; malformed ||= !!atom.numericError;
      continue;
    }
    if (text[at] === ")" && depth > 0) { depth--; cursor = at + 1; continue; }
    const operator = /^(?:\*\*|[+−*/×÷^%-])/.exec(text.slice(at));
    if (!operator) break;
    const next = skipSpace(text, at + operator[0].length);
    if (operator[0] === "/" && depth === 0 && fieldDeclarationAt(text, next)) break;
    // A hyphen joining a quantity to a unit is not subtraction.
    if (["-", "−"].includes(operator[0]) && /^[\p{L}]/u.test(text.slice(next))) break;
    expression = true; expectOperand = true; cursor = at + operator[0].length;
  }
  if (!sawOperand && !expression) return undefined;
  const rawNumber = text.slice(start, cursor).trimEnd();
  if (!rawNumber) return undefined;
  const invalid = expression || malformed || depth !== 0 || expectOperand || !validNumericToken.test(rawNumber);
  return { start, end: start + rawNumber.length, rawNumber,
    ...(invalid ? { numericError: `Invalid numeric token or scalar expression ${rawNumber}. Confirm a literal quantity; arithmetic results do not establish vessel particulars.` } : {}) };
}

function followingNumber(text: string, mention: FieldMention): Literal | undefined {
  const gap = fieldConnector.exec(text.slice(mention.end))![0];
  return numberAt(text, mention.end + gap.length);
}
function numericAtoms(text: string): Literal[] {
  const result: Literal[] = [];
  for (let at = 0; at < text.length; at++) {
    if (at && /[\p{L}\p{N}_]/u.test(text[at - 1])) continue;
    if (/\d\s*:$/.test(text.slice(0, at))) continue;
    const literal = numberAt(text, at);
    if (literal) { result.push(literal); at = Math.max(at, literal.end - 1); }
  }
  return result;
}
function measureIdentifier(word: string): boolean { return /^(?:GT|GRT|NT|NRT|DWT)$/i.test(word); }

/** Units and following clauses have different syntactic positions. A following
 * labelled field with its own value is a boundary. Participial clauses take an
 * argument; they are not units. Unknown noun units (cubits, furlongs...) remain
 * unresolved, with no growing list of domain prose words. */
function literalAt(text: string, start: number, mentions: readonly FieldMention[], bound = false): Literal | undefined {
  const number = numberAt(text, start);
  if (!number) return undefined;
  const suffix = /^\s*[-‐‑–]?([\p{L}]+|'|"|″)/u.exec(text.slice(number.end));
  if (!suffix) return number;
  const word = suffix[1], unitStart = number.end + suffix[0].length - word.length;
  const nextField = mentions.find(m => m.start === unitStart && QUANTITY_FIELDS.includes(m.field));
  if (!bound && nextField && (!findUnit(word) || measureIdentifier(word)) && followingNumber(text, nextField)) return number;
  if (!bound && /^(?:and|or|but|with|without|for|at|in|on|per|of|to|from)$/i.test(word)) return number;
  if (!bound && /^(?:is|was)$/i.test(word)) return number;
  if (!bound && operationMentions(text.slice(unitStart)).some(m => m.start === 0)) return number;
  if (!bound && !findUnit(word) && /ing$/i.test(word) && /^\s+(?!units?\b)[\p{L}]/iu.test(text.slice(number.end + suffix[0].length))) return number;
  return { ...number, end: number.end + suffix[0].length, rawUnit: word };
}

export type QuantityCandidate = Literal & { field: FactField };
export type NormalizedQuantity = { value: string; unit: string; normalizations: string[] } | { error: string; message: string };
export function normalizeQuantity(candidate: QuantityCandidate, metadataUnit?: string): NormalizedQuantity {
  const { field, rawNumber, rawUnit } = candidate;
  if (candidate.numericError) return { error: "INVALID_NUMERIC_TOKEN", message: candidate.numericError };
  const configured = metadataUnit ? findUnit(metadataUnit.trim()) : undefined;
  if (metadataUnit && (!configured || !configured.fields.includes(field))) return { error: "FORM_UNIT_CONFLICT", message: `${field} has an incompatible form unit (${metadataUnit}). Confirm the measurement and unit.` };
  const explicit = rawUnit ? findUnit(rawUnit) : undefined;
  if (rawUnit && !explicit) return { error: "UNSUPPORTED_UNIT", message: `The unit ${rawUnit} for ${field} is not supported. Please provide its unit or an explicitly supported conversion.` };
  if (explicit && !explicit.fields.includes(field)) return { error: "MEASUREMENT_UNIT_CONFLICT", message: `${rawUnit} is not the measurement required by ${field}. Confirm the intended measurement; the value has not been reassigned.` };
  const selected = explicit ?? configured ?? defaultUnit(field);
  if (!selected) return { error: "INVALID_NUMERIC_TOKEN", message: `Unsupported measurement ${field}.` };
  try {
    const canonical = rawNumber.replaceAll(",", "").replaceAll("−", "-");
    const value = new exact(canonical);
    const normalized = selected.factor === "1" ? value : value.mul(selected.factor);
    if (!value.isFinite() || !normalized.isFinite()) return { error: "INVALID_NUMERIC_TOKEN", message: `Quantity ${rawNumber} exceeds the supported normalization range.` };
    return { value: normalized.toString(), unit: selected.canonical,
      normalizations: [...(rawNumber.includes("−") ? ["Unicode minus normalized to ASCII in every sign position"] : []), ...(/[eE]/.test(rawNumber) ? [`Scientific notation ${rawNumber} = ${value.toString()}`] : []), ...(selected.factor === "1" ? [] : [`${rawNumber} ${rawUnit ?? metadataUnit} × ${selected.factor} ${selected.canonical}/source-unit = ${normalized.toString()} ${selected.canonical}`])] };
  } catch {
    return { error: "INVALID_NUMERIC_TOKEN", message: `Cannot normalize quantity ${rawNumber}. Confirm the complete numeric value.` };
  }
}

/** A bound form value is parsed once. Its suffix cannot also become a second
 * independent measurement through the prose extractor. */
export function formQuantity(text: string, field: FactField): QuantityCandidate | undefined {
  let start = skipSpace(text, 0);
  const action = operationMentions(text).find(m => m.start === start);
  if (action) start = action.end + fieldConnector.exec(text.slice(action.end))![0].length;
  const literal = literalAt(text, start, [], true);
  return literal && !text.slice(literal.end).trim() ? { ...literal, field } : undefined;
}

export function proseQuantities(text: string): QuantityCandidate[] {
  const mentions = fieldMentions(text).filter(m => QUANTITY_FIELDS.includes(m.field) && !m.reference);
  const atoms = numericAtoms(text);
  const candidates: QuantityCandidate[] = [];
  const owned: Span[] = [];
  // Prefix declarations own their complete value/unit span. A subsequent field
  // with a following value cannot steal the previous declaration's quantity.
  for (const mention of mentions) {
    if (owned.some(s => s.start <= mention.start && s.end >= mention.end)) continue;
    const token = text.slice(mention.start, mention.end);
    const postfix = findUnit(token) && !measureIdentifier(token) && atoms.some(a => a.end <= mention.start && /^\s*$/.test(text.slice(a.end, mention.start)));
    if (postfix) continue;
    const number = followingNumber(text, mention);
    const literal = number && literalAt(text, number.start, mentions);
    if (!literal) continue;
    candidates.push({ ...literal, field: mention.field }); owned.push(literal);
  }
  // Postfix declarations (500 feet LOA, 30 ft draught, 24 hours).
  for (const atom of atoms) {
    if (owned.some(s => s.start <= atom.start && s.end >= atom.end)) continue;
    const literal = literalAt(text, atom.start, mentions)!;
    const mention = mentions.find(m => m.start >= atom.end && (m.end === literal.end || m.start >= literal.end && /^\s*(?:(?:is|was)\s+)?$/i.test(text.slice(literal.end, m.start)))
      && !(followingNumber(text, m) && measureIdentifier(text.slice(m.start, m.end))));
    if (!mention) continue;
    // When the property token is itself the unit, preserve its actual unit.
    const candidate = { ...literal, field: mention.field };
    candidates.push(candidate); owned.push(candidate);
  }
  // Imperative time assignments also have a typed duration without a repeated
  // property label. The reducer handles preserve/reject/replace consistently.
  for (const m of text.matchAll(/\b(?:use|extend(?: the stay)? to)\s+(?=[+−-]?\d)/gi)) {
    const literal = literalAt(text, m.index + m[0].length, mentions);
    if (!literal || !literal.rawUnit || !findUnit(literal.rawUnit)?.fields.includes("durationHours")) continue;
    if (!owned.some(s => s.start === literal.start)) candidates.push({ ...literal, field: "durationHours" });
  }
  const unique = new Map<string, QuantityCandidate>();
  for (const c of candidates) unique.set(`${c.field}:${c.start}`, c);
  return [...unique.values()].sort((a, b) => a.start - b.start);
}

/** Arithmetic is a separate task, not an automatic evaluation of an unresolved
 * quantity expression. The operation classifier excludes explicitly negated math. */
export function hasArithmeticTask(text: string): boolean {
  const explicit = /\b(?:arithmetic|math)\b|\b(?:calculate|compute|evaluate|what is)\s*[()+−-]*\d/gi;
  if ([...text.matchAll(explicit)].some(m => isAsserted(text, m.index))) return true;
  const assigned = proseQuantities(text);
  return [...text.matchAll(/\d\s*(?:\*\*|[+−*/×÷^-])\s*[+−-]?\d/g)].some(m =>
    !assigned.some(q => q.start <= m.index && q.end >= m.index + m[0].length));
}
