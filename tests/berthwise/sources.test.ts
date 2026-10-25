import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

/** Every port document we hold is listed in data/sources/<port>/sources.json with
 * its origin and hash, and has a Markdown copy with page markers for search. */
const root = path.resolve(__dirname, "../..");
const sources = path.join(root, "data/sources");
const entrySchema = z.object({
  file: z.string().min(1), title: z.string().min(1), issuer: z.string().min(1), url: z.string().url(),
  retrievedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), markdown: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  kind: z.enum(["tariff", "rules"]).optional(), publishedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).passthrough();
const manifestSchema = z.object({ port: z.string().min(1), documents: z.array(entrySchema).min(1) }).passthrough();

function problems(port: string): string[] {
  const issues: string[] = [];
  const parsed = manifestSchema.safeParse(JSON.parse(readFileSync(path.join(sources, port, "sources.json"), "utf8")));
  if (!parsed.success) return parsed.error.issues.slice(0, 10).map(issue => `sources.json: ${issue.path.join(".")}: ${issue.message}`);
  if (parsed.data.port !== port) issues.push(`sources.json port must be ${port}`);
  const listed = new Set<string>();
  for (const doc of parsed.data.documents) {
    for (const file of [doc.file, doc.markdown]) {
      listed.add(file);
      if (!file.startsWith(`data/sources/${port}/`)) issues.push(`${file}: must be inside data/sources/${port}/`);
      if (!existsSync(path.join(root, file))) issues.push(`${file}: does not exist`);
    }
    if (existsSync(path.join(root, doc.file)) && createHash("sha256").update(readFileSync(path.join(root, doc.file))).digest("hex") !== doc.sha256) issues.push(`${doc.file}: sha256 does not match`);
    if (existsSync(path.join(root, doc.markdown)) && !/<!-- page \d+ -->/.test(readFileSync(path.join(root, doc.markdown), "utf8"))) issues.push(`${doc.markdown}: has no <!-- page N --> markers`);
  }
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
  for (const file of files(path.join(sources, port))) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    if (!relative.endsWith("sources.json") && !listed.has(relative)) issues.push(`${relative}: not listed in sources.json`);
  }
  return issues;
}

describe("port source documents", () => {
  for (const port of readdirSync(sources).filter(name => existsSync(path.join(sources, name, "sources.json")))) {
    it(port, () => expect(problems(port)).toEqual([]));
  }
});
