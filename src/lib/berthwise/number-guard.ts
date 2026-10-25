/** Every figure in a written answer must come from the user, a tool result or
 * an earlier checked answer. Small counts, days and years are always allowed. */

/** Over-matches on purpose: a currency code or unit glued to a figure must not hide it. */
const NUMBER = /(?<![\d,])(?<!\d\.)(?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d+)?(?![\d])(\s*(?:%|per ?cent))?/giu;

export type NumberSource = string | unknown;

/** Normalised numeric strings found in text, without thousands separators. */
export function extractNumbers(text: string): string[] {
  return written(text).map(found => found.value);
}

function written(text: string) {
  return [...text.matchAll(NUMBER)].map(match => ({ value: match[0].slice(0, match[0].length - (match[1]?.length ?? 0)).replace(/,/g, ""), percent: Boolean(match[1]) }));
}

function numbersIn(value: unknown, into: Set<string>) {
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? "";
  for (const found of extractNumbers(text)) into.add(found);
}

function decimals(value: string) {
  const dot = value.indexOf(".");
  return dot < 0 ? 0 : value.length - dot - 1;
}

/** Small counts, days and years need no source; percentages always do. */
function alwaysAllowed({ value, percent }: { value: string; percent: boolean }) {
  if (percent || value.includes(".")) return false;
  const number = Number(value);
  return number <= 31 || (number >= 1990 && number <= 2100);
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
