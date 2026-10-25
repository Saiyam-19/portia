import "server-only";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** Keyword search over the ports' own documents (data/sources/<port>/sources.json and
 * the page-marked Markdown copies), so answers about berths, rules and timings can
 * quote the page they come from. */

export type SourceDocument = {
  port: string; title: string; issuer: string; url: string; markdown: string;
  kind: "tariff" | "rules"; publishedOn?: string; retrievedOn: string;
};
type Chunk = { doc: SourceDocument; page: number; text: string; counts: Map<string, number>; length: number };
type Index = { chunks: Chunk[]; documentFrequency: Map<string, number>; averageLength: number };
export type Excerpt = { document: SourceDocument; page: number; text: string; score: number };

const STOP = new Set("a an and are as at be by can do does for from has have how i in is it its of on or per shall the their there this to was what when where which who will with any all my our we you".split(" "));
// A few words people use for the same thing as the documents.
const SAME: Record<string, string[]> = {
  depth: ["draft", "draught"], draft: ["draught", "depth"], draught: ["draft", "depth"],
  loa: ["length"], length: ["loa"], timing: ["hour", "shift", "hrs"], hour: ["hrs", "shift"], hrs: ["hour"], shift: ["hour"],
  document: ["certificate", "declaration"], paper: ["document", "certificate"], night: ["daylight", "day"],
  ship: ["vessel"], vessel: ["ship"], entry: ["arrival", "enter", "berth"], arrival: ["entry", "arrive"], compulsory: ["mandatory"], mandatory: ["compulsory"],
};
// Words that say little about which page answers a question.
const VAGUE = new Set(["rule", "requirement", "information", "detail", "policy", "port", "regulation", "procedure", "guideline", "please", "tell", "know", "need", "about", "state", "explain", "describe", "list", "give", "mention", "show", "whether", "also"]);

const stem = (word: string) => word.length > 4 && word.endsWith("ies") ? word.slice(0, -3) + "y" : word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
export function terms(text: string): string[] {
  return (text.toLowerCase().normalize("NFKD").match(/[a-z]+|\d+(?:\.\d+)?/g) ?? []).filter(word => !STOP.has(word)).map(stem);
}

const clean = (text: string) => text
  .replace(/<!--[\s\S]*?-->/g, " ").replace(/<br\s*\/?>/gi, " ").replace(/<\/?(?:u|mark|sup|sub|b|i|strong|em)>/gi, "")
  .replace(/\*\*|__/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

function chunksOf(doc: SourceDocument, markdown: string): Array<{ page: number; text: string }> {
  const out: Array<{ page: number; text: string }> = [];
  const parts = markdown.split(/<!-- page (\d+) -->/);
  for (let i = 1; i < parts.length; i += 2) {
    const page = Number(parts[i]);
    const text = clean(parts[i + 1] ?? "");
    if (text.length < 20 || /^\[Page \d+ has no text layer/.test(text)) continue;
    let current = "";
    for (const line of text.split("\n")) {
      if (current.length + line.length > 1400 && current.length > 200) { out.push({ page, text: current.trim() }); current = ""; }
      current += line + "\n";
    }
    if (current.trim()) out.push({ page, text: current.trim() });
  }
  return out;
}

let index: Index | undefined;
function build(root = path.join(process.cwd(), "data", "sources")): Index {
  const chunks: Chunk[] = [];
  for (const port of existsSync(root) ? readdirSync(root) : []) {
    const manifest = path.join(root, port, "sources.json");
    if (!existsSync(manifest)) continue;
    const listed = JSON.parse(readFileSync(manifest, "utf8")) as { documents: Array<Omit<SourceDocument, "port" | "kind"> & { kind?: string }> };
    for (const entry of listed.documents) {
      // Built from the fixed data/sources root, so only that folder is traced into the deployment.
      const prefix = `data/sources/${port}/`;
      if (!entry.markdown.startsWith(prefix) || entry.markdown.includes("..")) continue;
      const file = path.join(root, port, ...entry.markdown.slice(prefix.length).split("/"));
      if (!existsSync(file)) continue;
      const doc: SourceDocument = {
        port, title: entry.title, issuer: entry.issuer, url: entry.url, markdown: entry.markdown,
        kind: entry.kind === "rules" ? "rules" : "tariff", retrievedOn: entry.retrievedOn, ...(entry.publishedOn ? { publishedOn: entry.publishedOn } : {}),
      };
      const titleTerms = terms(doc.title);
      for (const { page, text } of chunksOf(doc, readFileSync(file, "utf8"))) {
        const words = [...titleTerms, ...terms(text)];
        const counts = new Map<string, number>();
        for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
        chunks.push({ doc, page, text, counts, length: words.length });
      }
    }
  }
  const documentFrequency = new Map<string, number>();
  for (const chunk of chunks) for (const word of chunk.counts.keys()) documentFrequency.set(word, (documentFrequency.get(word) ?? 0) + 1);
  const averageLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0) / Math.max(chunks.length, 1);
  return { chunks, documentFrequency, averageLength };
}

/** The best-matching passages, at most one per page, best first. Empty when too few
 * of the question's words appear anywhere, so "not in our documents" can be said. */
export function searchDocuments(query: string, options: { port?: string; kind?: "tariff" | "rules"; limit?: number; portNames?: string[] } = {}): Excerpt[] {
  index ??= build();
  // The port being searched is no clue to which of its pages answers.
  const own = new Set((options.portNames ?? []).flatMap(name => terms(name)));
  const all = [...new Set(terms(query))].filter(word => !own.has(word));
  const asked = all.filter(word => !VAGUE.has(word)).length ? all.filter(word => !VAGUE.has(word)) : all;
  if (!asked.length) return [];
  // Each searched idea, with the words that mean the same; "compulsory or mandatory" is one idea,
  // and a match on any of its words counts once.
  const origin = new Map<string, string>();
  for (const word of asked) origin.set(word, asked.find(other => other !== word && (SAME[other] ?? []).map(stem).includes(word) && asked.indexOf(other) < asked.indexOf(word)) ?? word);
  const weights = new Map<string, { weight: number; origin: string }>(asked.map(word => [word, { weight: 1, origin: origin.get(word)! }]));
  for (const word of asked) for (const other of SAME[word] ?? []) if (!weights.has(stem(other))) weights.set(stem(other), { weight: 0.5, origin: origin.get(word)! });
  const ideas = new Set(origin.values()).size;
  const pool = index.chunks.filter(chunk => (!options.port || chunk.doc.port === options.port) && (!options.kind || chunk.doc.kind === options.kind));
  const total = index.chunks.length;
  const scored = pool.map(chunk => {
    let score = 0;
    const found = new Set<string>();
    for (const [word, { weight, origin }] of weights) {
      const count = chunk.counts.get(word);
      if (!count) continue;
      found.add(origin);
      const idf = Math.log(1 + (total - (index!.documentFrequency.get(word) ?? 0) + 0.5) / ((index!.documentFrequency.get(word) ?? 0) + 0.5));
      score += weight * idf * (count * 2.2) / (count + 1.2 * (0.25 + 0.75 * chunk.length / index!.averageLength));
    }
    return { chunk, score, matched: found.size };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
  // Short questions need every idea; longer ones at least two, or a third of them. If no page
  // clears that, the best pages with two ideas are offered and the reader judges from the text.
  const needed = ideas <= 2 ? ideas : Math.max(2, Math.ceil(ideas / 3));
  const bar = scored.some(item => item.matched >= needed) ? needed : Math.min(2, ideas);
  const seen = new Set<string>();
  const results: Excerpt[] = [];
  for (const item of scored) {
    if (item.matched < bar) continue;
    const key = `${item.chunk.doc.markdown}#${item.chunk.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ document: item.chunk.doc, page: item.chunk.page, text: pageText(item.chunk), score: Number(item.score.toFixed(3)) });
    if (results.length >= (options.limit ?? 4)) break;
  }
  return results;
}

/** The whole page a passage sits on, up to MAX_PAGE_CHARS, keeping the passage itself. */
const MAX_PAGE_CHARS = 3_000;
function pageText(hit: Chunk): string {
  const parts = index!.chunks.filter(chunk => chunk.doc === hit.doc && chunk.page === hit.page);
  const whole = parts.map(chunk => chunk.text).join("\n");
  if (whole.length <= MAX_PAGE_CHARS) return whole;
  const at = parts.indexOf(hit);
  return parts.slice(Math.max(0, at - 1)).map(chunk => chunk.text).join("\n").slice(0, MAX_PAGE_CHARS) + " …";
}

/** For tests: rebuild the index from another folder. */
export function resetDocumentIndex() { index = undefined; }
