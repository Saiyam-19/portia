import Decimal from "decimal.js";

type DateOrder = "DMY" | "MDY";
type Options = { dateOrder?: DateOrder; timeZone?: string };
type Parsed = { instant: number } | { error: string; message: string };
const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const invalid = (error: string, message: string): Parsed => ({ error, message });

function offsetMinutes(zone: string): number | null {
  const normalized = zone.toUpperCase();
  if (["Z", "UTC", "GMT"].includes(normalized)) return 0;
  if (normalized === "IST") return 330; // India Standard Time, as documented by the tool.
  const match = /^(?:UTC|GMT)?([+-])(\d{2}):?(\d{2})$/.exec(normalized);
  if (!match) return null;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return null;
  return (match[1] === "-" ? -1 : 1) * (hours * 60 + minutes);
}

function parseTimestamp(raw: string, options: Options): Parsed {
  if (raw.length > 160) return invalid("INVALID_TIMESTAMP", "Timestamp is too long.");
  const text = raw.trim()
    .replace(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+on\s+(.+?)(\s+(?:UTC|GMT|IST|[+-]\d{2}:?\d{2}))?$/i, "$2 $1$3")
    .replace(/^(\d{4}-\d{2}-\d{2})T/i, "$1 ").replace(/\bat\b/gi, " ").replaceAll(",", " ").replace(/\s+/g, " ");
  const match = /^(.*?)\s+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?\s*(Z|UTC|GMT|IST|(?:(?:UTC|GMT))?[+-]\d{2}:?\d{2})?$/i.exec(text);
  if (!match) return invalid("INVALID_TIMESTAMP", "Provide the original date, a 24-hour time, and an explicit UTC offset (or UTC/India Standard Time). Do not guess missing values.");
  let year: number, month: number, day: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(match[1]);
  const named = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i.exec(match[1]);
  const numeric = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{4})$/.exec(match[1]);
  if (iso) {
    [, year, month, day] = iso.map(Number);
  } else if (named) {
    year = Number(named[3]);
    day = Number(named[1]);
    month = months.findIndex(value => value === named[2].toLowerCase() || value.slice(0, 3) === named[2].toLowerCase()) + 1;
  } else if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[3]);
    year = Number(numeric[4]);
    if (!options.dateOrder && first >= 1 && first <= 12 && second >= 1 && second <= 12 && first !== second) {
      return invalid("AMBIGUOUS_DATE", `Clarify whether ${match[1]} uses day/month/year or month/day/year. Do not choose based on the port or locale.`);
    }
    const order = options.dateOrder ?? (second > 12 ? "MDY" : "DMY");
    [day, month] = order === "DMY" ? [first, second] : [second, first];
  } else {
    return invalid("INVALID_DATE", "Use the original numeric date or a date with a named month and four-digit year.");
  }
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4] ?? 0);
  const millisecond = Number((match[5] ?? "").padEnd(3, "0"));
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return invalid("INVALID_DATE", "The date or time is outside its valid range. Ask for a correction.");
  }
  const wallClock = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const date = new Date(wallClock);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return invalid("INVALID_DATE", "This calendar date does not exist. Ask for a correction; do not roll it into another month.");
  }
  const zone = match[6] ?? options.timeZone;
  if (!zone) return invalid("MISSING_TIME_ZONE", "Confirm the time zone or UTC offset before calculating elapsed time.");
  const offset = offsetMinutes(zone);
  if (offset === null) return invalid("INVALID_TIME_ZONE", "Confirm an explicit UTC offset. Supported labels are UTC, GMT and IST (India, +05:30); other abbreviations may be ambiguous.");
  return { instant: wallClock - offset * 60_000 };
}

/** Strict wall-clock arithmetic: no tariff assumptions, date rollover, or locale guessing. */
export function calculateElapsedTime(input: { start: string; end: string } & Options) {
  const start = parseTimestamp(input.start, input);
  if ("error" in start) return { status: "clarification_required" as const, field: "start", ...start };
  const end = parseTimestamp(input.end, input);
  if ("error" in end) return { status: "clarification_required" as const, field: "end", ...end };
  if (end.instant < start.instant) return { status: "clarification_required" as const, error: "REVERSED_INTERVAL", message: "The end precedes the start. Confirm the dates; do not use an absolute duration." };
  const elapsed = new Decimal(end.instant - start.instant);
  return {
    status: "ok" as const,
    startUtc: new Date(start.instant).toISOString(), endUtc: new Date(end.instant).toISOString(),
    elapsedSeconds: elapsed.div(1000).toString(), elapsedMinutes: elapsed.div(60_000).toString(), elapsedHours: elapsed.div(3_600_000).toString(),
    note: "Elapsed time only. Billable periods and rounding require the supplied rule or applicable tariff.",
  };
}
