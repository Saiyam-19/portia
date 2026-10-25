/** Every figure in a written answer must come from the user, a tool result or
 * an earlier checked answer. Small counts, days and years are allowed without a
 * source, but never as money or a measurement ("USD 20", "12 metres"). */

/** Over-matches on purpose: a currency code or unit glued to a figure must not hide it. */
const NUMBER = /(?<![\d,])(?<!\d\.)(?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d+)?(?![\d])(\s*(?:%|per ?cent))?/giu;

export type NumberSource = string | unknown;

/** Normalised numeric strings found in text, without thousands separators. */
export function extractNumbers(text: string): string[] {
  return written(text).map(found => found.value);
}

// Money or a measurement right before or after a figure.
const MONEY_BEFORE = /(?:usd|us\s?\$|\$|inr|rs\.?|₹|rupees?|dollars?|eur|€|£)\s*$/i;
const UNIT_AFTER = /^\s*(?:usd|inr|rupees?|dollars?|lakhs?|crores?|k\b|m\b|mtrs?\b|metres?\b|meters?\b|ft\b|feet\b|grt\b|gt\b|nrt\b|dwt\b|loa\b|tonnes?\b|tons?\b|mt\b|teu\b|knots?\b|kn\b|nm\b|cents?\b|paise\b|per\s)/i;

function written(text: string) {
  return [...text.matchAll(NUMBER)].map(match => {
    const raw = match[0].slice(0, match[0].length - (match[1]?.length ?? 0));
    const before = text.slice(Math.max(0, match.index! - 6), match.index!), after = text.slice(match.index! + raw.length, match.index! + raw.length + 12);
    return { value: raw.replace(/,/g, ""), percent: Boolean(match[1]), grouped: raw.includes(","), measured: MONEY_BEFORE.test(before) || UNIT_AFTER.test(after) };
  });
}

function numbersIn(value: unknown, into: Set<string>) {
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? "";
  for (const found of extractNumbers(text)) into.add(found);
}

function decimals(value: string) {
  const dot = value.indexOf(".");
  return dot < 0 ? 0 : value.length - dot - 1;
}

/** Small counts, days and years need no source; percentages, money and measurements always do. */
function alwaysAllowed({ value, percent, grouped, measured }: { value: string; percent: boolean; grouped: boolean; measured: boolean }) {
  if (percent || measured || value.includes(".")) return false;
  const number = Number(value);
  return number <= 31 || (!grouped && number >= 1990 && number <= 2100);
}

/** A written figure may round a source figure to its own number of decimals. */
function matches(written: string, source: string) {
  if (written === source) return true;
  const w = Number(written), s = Number(source);
  if (!Number.isFinite(w) || !Number.isFinite(s)) return false;
  const places = decimals(written);
  if (places >= decimals(source)) return Math.abs(w - s) < 1e-9;
  return Math.abs(w - s) <= 0.5 * 10 ** -places + 1e-9;
}

export function unsupportedNumbers(text: string, sources: NumberSource[]): string[] {
  const allowed = new Set<string>();
  for (const source of sources) numbersIn(source, allowed);
  const pool = [...allowed];
  const unsupported = written(text).filter(found =>
    !alwaysAllowed(found) && !allowed.has(found.value) && !pool.some(source => matches(found.value, source)));
  return [...new Set(unsupported.map(found => found.value))];
}
