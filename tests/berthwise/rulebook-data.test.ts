import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { portBookSchema, type PortBook } from "../../src/lib/berthwise/rulebook/schema";
import { estimate } from "../../src/lib/berthwise/rulebook/calculate";
import { extractNumbers } from "../../src/lib/berthwise/number-guard";

/** Checks every rule-book file: format, document hashes, verbatim quotes and
 * that every entered figure appears in its quote. Set RULEBOOK_DIR to check
 * one folder; by default data/rulebook and data/rulebook-codex are checked. */
const root = path.resolve(__dirname, "../..");
const PORTS = ["mumbai", "jnpa", "jaigarh", "new-mangalore", "paradip", "deendayal", "chennai", "kamarajar", "mundra", "hazira", "kattupalli", "pipavav"];
const dirs = (process.env.RULEBOOK_DIR ? [process.env.RULEBOOK_DIR] : ["data/rulebook", "data/rulebook-codex"])
  .map(dir => path.resolve(root, dir)).filter(dir => existsSync(dir));
const files = dirs.flatMap(dir => readdirSync(dir).filter(name => name.endsWith(".json")).map(name => path.join(dir, name)));

const flat = (text: string) => text.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").replace(/[*_|`#]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
const sameNumber = (a: string, b: string) => Number(a) === Number(b);

function problems(file: string): string[] {
  const issues: string[] = [];
  let book: PortBook;
  try {
    const parsed = portBookSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
    if (!parsed.success) return parsed.error.issues.slice(0, 20).map(issue => `format: ${issue.path.join(".")}: ${issue.message}`);
    book = parsed.data;
  } catch (error) { return [`not valid JSON: ${(error as Error).message}`]; }
  if (path.basename(file, ".json") !== book.id) issues.push(`file name must be ${book.id}.json`);
  if (!PORTS.includes(book.id)) issues.push(`unknown port id ${book.id}`);
  const markdown = new Map<string, string>();
  const versions = [...book.versions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  versions.forEach((version, index) => {
    const where = `version ${version.id}`;
    if (version.effectiveTo && version.effectiveTo < version.effectiveFrom) issues.push(`${where}: ends before it starts`);
    const next = versions[index + 1];
    if (next && (!version.effectiveTo || version.effectiveTo >= next.effectiveFrom)) issues.push(`${where}: overlaps version ${next.id}`);
    for (const doc of version.documents) {
      for (const key of ["file", "markdown"] as const) if (!existsSync(path.join(root, doc[key]))) issues.push(`${where}: ${doc[key]} does not exist`);
      if (existsSync(path.join(root, doc.file)) && createHash("sha256").update(readFileSync(path.join(root, doc.file))).digest("hex") !== doc.sha256) issues.push(`${where}: sha256 of ${doc.file} does not match`);
      if (existsSync(path.join(root, doc.markdown))) markdown.set(doc.id, flat(readFileSync(path.join(root, doc.markdown), "utf8")));
    }
    for (const charge of version.charges) {
      const at = `${where} charge ${charge.id}`;
      const doc = version.documents.find(item => item.id === charge.source.document);
      if (!doc) { issues.push(`${at}: source document ${charge.source.document} is not in this version`); continue; }
      const quote = charge.source.quote;
      if (!quote) { issues.push(`${at}: source.quote is required`); continue; }
      const text = markdown.get(doc.id);
      const quotes = Array.isArray(quote) ? quote : [quote];
      for (const snippet of quotes) if (text !== undefined && !text.includes(flat(snippet))) issues.push(`${at}: quote not found verbatim in ${doc.markdown}: ${snippet.slice(0, 60)}`);
      // Converted tables sometimes split a figure across cells ("32|,289").
      const inQuote = quotes.flatMap(snippet => extractNumbers(snippet.replace(/(\d)\|,(\d{3})/g, "$1,$2")));
      if (charge.rates.some(rate => rate.minimumPer || rate.minimumHours) &&!["grt-hour", "grt-day", "loa-hour", "loa-day", "hour"].includes(charge.basis)) issues.push(`${at}: minimumPer and minimumHours need a time-based basis`);
      const figures = [...(charge.validDays ? [charge.validDays] : []), ...charge.rates.flatMap(rate => [...rate.bands.flatMap(band => [band.rate, ...(band.base ? [band.base] : []), ...(band.minimumAmount ? [band.minimumAmount] : [])]), ...(rate.minimumAmount ? [rate.minimumAmount] : []), ...(rate.maximumAmount ? [rate.maximumAmount] : [])])];
      // A zero rate stands for a printed "lump sum" band whose minimum is the charge.
      for (const figure of figures) if (Number(figure) !== 0 && !inQuote.some(found => sameNumber(found, figure))) issues.push(`${at}: figure ${figure} is not in its quote`);
      if ((charge.basis === "percent") !== Boolean(charge.percentOf)) issues.push(`${at}: basis "percent" and percentOf go together`);
      for (const id of charge.percentOf ?? []) if (!version.charges.some(other => other.id === id && other.basis !== "percent")) issues.push(`${at}: percentOf ${id} is not a charge in this version`);
      for (const rate of charge.rates) {
        const limits = rate.bands.map(band => band.upTo);
        if (limits.slice(0, -1).some(limit => limit === undefined)) issues.push(`${at}: only the last band may omit upTo`);
        const numbers = limits.filter((limit): limit is string => limit !== undefined).map(Number);
        if (numbers.some((value, i) => i > 0 && value <= numbers[i - 1]!)) issues.push(`${at}: band limits must increase`);
      }
    }
    try {
      const sample = estimate(book, { date: version.effectiveFrom, grt: "32450", nrt: "18966", loa: "228", hours: "48", tugs: 2 });
      if (!sample.lines.length && !sample.questions.length) issues.push(`${where}: a sample call produces no charges and no questions`);
    } catch (error) { issues.push(`${where}: calculator failed: ${(error as Error).message}`); }
  });
  return issues;
}

describe("rule-book data", () => {
  if (!files.length) it("has no rule-book files to check yet", () => expect(files).toEqual([]));
  for (const file of files) it(path.relative(root, file), () => expect(problems(file)).toEqual([]));
});
