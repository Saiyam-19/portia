import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { cargoClassSchema, directionSchema } from "../../src/lib/berthwise/rulebook/schema";
import { extractNumbers } from "../../src/lib/berthwise/number-guard";

/** Checks a second reader's wharfage files (docs/codex-wharfage-reading.md):
 * format, verbatim quotes, and that every figure is in its quote.
 * Set WHARFAGE_DIR to check one folder; by default data/rulebook-codex/wharfage. */
const root = path.resolve(__dirname, "../..");
const PORTS = ["mumbai", "jnpa", "jaigarh", "new-mangalore", "paradip", "deendayal", "chennai", "kamarajar", "mundra", "hazira", "kattupalli", "pipavav"];
const dir = path.resolve(root, process.env.WHARFAGE_DIR ?? "data/rulebook-codex/wharfage");
const files = existsSync(dir) ? readdirSync(dir).filter(name => name.endsWith(".json")).map(name => path.join(dir, name)) : [];

const decimal = z.string().regex(/^\d+(?:\.\d+)?$/);
const quote = z.union([z.string().min(1).max(400), z.array(z.string().min(1).max(400)).min(1).max(8)]);
export const wharfageReadingSchema = z.object({
  port: z.enum(PORTS as [string, ...string[]]),
  document: z.string().min(1).describe("Markdown file name in data/sources/<port>/ without .md"),
  rates: z.array(z.object({
    cargo: cargoClassSchema,
    unit: z.enum(["tonne", "box20", "box40"]),
    part: z.enum(["box", "cargo"]).optional(),
    foreign: decimal.optional(),
    coastal: decimal.optional(),
    direction: directionSchema.optional(),
    terminal: z.string().optional(),
    page: z.number().int().positive(),
    quote,
    note: z.string().max(400).optional(),
  }).strict().refine(rate => rate.foreign || rate.coastal, "Give foreign, coastal or both.")),
  notPriced: z.array(z.object({ cargo: z.array(cargoClassSchema).min(1).optional(), reason: z.string().min(1).max(300), page: z.number().int().positive().optional() }).strict()).default([]),
  notes: z.array(z.string().max(500)).default([]),
}).strict();

const flat = (text: string) => text.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").replace(/[*_|`#]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

function problems(file: string): string[] {
  const parsed = wharfageReadingSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) return parsed.error.issues.slice(0, 20).map(issue => `format: ${issue.path.join(".")}: ${issue.message}`);
  const reading = parsed.data, issues: string[] = [];
  if (path.basename(file, ".json") !== reading.port) issues.push(`file name must be ${reading.port}.json`);
  const source = path.join(root, "data/sources", reading.port, `${reading.document}.md`);
  if (!existsSync(source)) return [...issues, `${source} does not exist`];
  const text = flat(readFileSync(source, "utf8"));
  reading.rates.forEach((rate, index) => {
    const at = `rate ${index + 1} (${rate.cargo})`;
    const quotes = Array.isArray(rate.quote) ? rate.quote : [rate.quote];
    for (const snippet of quotes) if (!text.includes(flat(snippet))) issues.push(`${at}: quote not found verbatim: ${snippet.slice(0, 60)}`);
    const inQuote = quotes.flatMap(snippet => extractNumbers(snippet));
    for (const figure of [rate.foreign, rate.coastal]) if (figure && !inQuote.some(found => Number(found) === Number(figure))) issues.push(`${at}: figure ${figure} is not in its quote`);
  });
  return issues;
}

describe("second reading of wharfage", () => {
  if (!files.length) it("has no wharfage reading to check yet", () => expect(files).toEqual([]));
  for (const file of files) it(path.relative(root, file), () => expect(problems(file)).toEqual([]));
});
