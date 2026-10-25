import type { DocumentFormat } from "./company-doc-rules";

/** Turns an uploaded company document into page-numbered passages for search.
 * PDFs keep their page numbers; Word files are split into sections of about a
 * page; each Excel sheet is a "page". Runs in a Convex Node action. */

export type Page = { page: number; text: string };
export type Passage = { page: number; order: number; text: string };

const WORD_SECTION_CHARS = 3_000;
const PASSAGE_CHARS = 1_500;
export const MAX_PASSAGES = 2_000;

export async function extractPages(bytes: Uint8Array, format: DocumentFormat): Promise<Page[]> {
  if (format === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: false });
    return text.map((content, index) => ({ page: index + 1, text: content }));
  }
  if (format === "docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return sections(value, WORD_SECTION_CHARS);
  }
  if (format === "xlsx") {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
    const pages: Page[] = [];
    workbook.eachSheet((sheet, index) => {
      const rows: string[] = [];
      sheet.eachRow(row => {
        const cells = (row.values as unknown[]).slice(1).map(cell => cellText(cell)).map(value => value.replace(/\s+/g, " ").trim());
        if (cells.some(Boolean)) rows.push(cells.join(" | "));
      });
      if (rows.length) pages.push({ page: index, text: `Sheet: ${sheet.name}\n${rows.join("\n")}` });
    });
    return pages;
  }
  return sections(new TextDecoder("utf-8").decode(bytes), WORD_SECTION_CHARS);
}

function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  if (typeof cell === "object") {
    const value = cell as { text?: unknown; result?: unknown; richText?: Array<{ text: string }>; hyperlink?: string };
    if (value.richText) return value.richText.map(part => part.text).join("");
    if (value.text !== undefined) return String(value.text);
    if (value.result !== undefined) return cellText(value.result);
    return "";
  }
  return String(cell);
}

/** Splits running text at paragraph breaks into numbered sections of roughly `size` characters. */
function sections(text: string, size: number): Page[] {
  const pages: Page[] = [];
  let current = "";
  for (const paragraph of text.replace(/\r\n?/g, "\n").split(/\n{2,}/)) {
    if (current && current.length + paragraph.length > size) { pages.push({ page: pages.length + 1, text: current.trim() }); current = ""; }
    current += paragraph + "\n\n";
  }
  if (current.trim()) pages.push({ page: pages.length + 1, text: current.trim() });
  return pages;
}

/** Passages of at most about PASSAGE_CHARS, split at line breaks, keeping their page number. */
export function passages(pages: Page[]): Passage[] {
  const out: Passage[] = [];
  for (const { page, text } of pages) {
    const clean = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (clean.length < 10) continue;
    let current = "";
    for (const line of clean.split("\n")) {
      for (let start = 0; start < Math.max(line.length, 1); start += PASSAGE_CHARS) {
        const piece = line.slice(start, start + PASSAGE_CHARS);
        if (current.length + piece.length > PASSAGE_CHARS && current.trim()) { out.push({ page, order: out.length, text: current.trim() }); current = ""; }
        current += piece + "\n";
      }
    }
    if (current.trim()) out.push({ page, order: out.length, text: current.trim() });
    if (out.length >= MAX_PASSAGES) return out.slice(0, MAX_PASSAGES);
  }
  return out;
}
