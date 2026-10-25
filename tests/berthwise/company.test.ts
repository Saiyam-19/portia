/// <reference types="vite/client" />
import { readFileSync } from "node:fs";
import path from "node:path";
import agentTest from "@convex-dev/agent/test";
import betterAuthTest from "@convex-dev/better-auth/test";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";
import { api, components } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { applyAgreedRates, type AgreedRate } from "../../src/lib/berthwise/agreed-rates";
import { uploadProblem } from "../../src/lib/berthwise/company-doc-rules";
import { extractPages, MAX_PASSAGES, passages } from "../../src/lib/berthwise/company-docs";
import { portBooks } from "../../src/lib/berthwise/rulebook/books";
import { estimate } from "../../src/lib/berthwise/rulebook/calculate";
import { businessTools } from "../../src/lib/berthwise/tools";

const modules = import.meta.glob("../../convex/**/*.ts");
function setup() { const t = convexTest(schema, modules); agentTest.register(t); betterAuthTest.register(t); return t; }
async function account(t: ReturnType<typeof setup>, email: string) {
  const now = Date.now();
  const user = await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: "Synthetic account", email, emailVerified: false, createdAt: now, updatedAt: now } } });
  const session = await t.mutation(components.betterAuth.adapter.create, { input: { model: "session", data: { userId: user._id, token: crypto.randomUUID(), expiresAt: now + 3600000, createdAt: now, updatedAt: now } } });
  return t.withIdentity({ subject: user._id, sessionId: session._id });
}
beforeEach(() => { vi.stubEnv("MIGRATION_DEV_ENABLED", "true"); vi.stubEnv("PORTIA_CONVEX_DEPLOYMENT", "brilliant-whale-380"); vi.stubEnv("CONVEX_SITE_URL", "https://brilliant-whale-380.convex.site"); vi.stubEnv("PORTIA_AUTH_MODE", "basic"); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("reading company documents", () => {
  it("keeps a PDF's page numbers", async () => {
    const pdf = readFileSync(path.resolve(__dirname, "../../data/sources/mundra/fuel-surcharge-2022-05-24.pdf"));
    const pages = await extractPages(new Uint8Array(pdf), "pdf");
    expect(pages).toHaveLength(2);
    expect(pages[0]!.text).toContain("Fuel Surcharge");
  });

  it("reads each Excel sheet and a Word file's text", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Agency fees").addRows([["Port", "Fee (USD)"], ["Mundra", 1250], ["Hazira", 1100]]);
    const sheets = await extractPages(new Uint8Array(await workbook.xlsx.writeBuffer()), "xlsx");
    expect(sheets).toEqual([{ page: 1, text: "Sheet: Agency fees\nPort | Fee (USD)\nMundra | 1250\nHazira | 1100" }]);
    const zip = new JSZip();
    zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file("_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file("word/document.xml", '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Demurrage is payable after 72 hours laytime.</w:t></w:r></w:p></w:body></w:document>');
    const word = await extractPages(new Uint8Array(await zip.generateAsync({ type: "uint8array" })), "docx");
    expect(word[0]!.text).toContain("Demurrage is payable after 72 hours laytime.");
  });

  it("splits long pages into passages and refuses unsupported files", () => {
    const found = passages([{ page: 3, text: "a".repeat(4000) }]);
    expect(found.map(item => [item.page, item.text.length])).toEqual([[3, 1500], [3, 1500], [3, 1000]]);
    // A file too long to read in full says where reading stopped (Codex finding 8).
    const long = passages(Array.from({ length: 1100 }, (_, i) => ({ page: i + 1, text: "b".repeat(2900) })));
    expect(long).toHaveLength(MAX_PASSAGES);
    expect(long.readThrough).toBe(1000);
    expect(found.readThrough).toBeUndefined();
    expect(uploadProblem({ name: "deck.pptx", size: 10 })).toContain("only PDF");
    expect(uploadProblem({ name: "huge.pdf", size: 21 * 1024 * 1024 })).toBe("huge.pdf is larger than 20 MB.");
  });
});

describe("company documents in Convex", () => {
  it("reads an upload in the background and finds it only for its own account", async () => {
    vi.useFakeTimers();
    const t = setup(); const a = await account(t, "a@example.com"); const b = await account(t, "b@example.com");
    await a.mutation(api.companyDocs.generateUploadUrl, {});
    const storageId = await t.run(ctx => ctx.storage.store(new Blob(["Charter party clause 14: demurrage at USD 18,000 per day pro rata.\n\nLaytime is 72 hours, Sundays and holidays excepted."], { type: "text/plain" })));
    const id = await a.mutation(api.companyDocs.addDocument, { storageId, fileName: "charter_party_2026.txt" });
    // Another account that learns the file id can't attach it.
    await b.mutation(api.companyDocs.generateUploadUrl, {});
    await expect(b.mutation(api.companyDocs.addDocument, { storageId, fileName: "stolen.txt" })).rejects.toThrow("The upload was not found");
    expect(await a.query(api.companyDocs.listDocuments, {})).toEqual([expect.objectContaining({ id, title: "charter party 2026", status: "processing" })]);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await a.query(api.companyDocs.listDocuments, {})).toEqual([expect.objectContaining({ status: "ready", pages: 1 })]);
    expect(await a.query(api.companyDocs.searchDocuments, { question: "demurrage" })).toEqual([expect.objectContaining({ title: "charter party 2026", page: 1, text: expect.stringContaining("USD 18,000 per day") })]);
    expect(await b.query(api.companyDocs.searchDocuments, { question: "demurrage" })).toEqual([]);
    expect(await b.query(api.companyDocs.listDocuments, {})).toEqual([]);
    await expect(b.mutation(api.companyDocs.deleteDocument, { id: id as never })).rejects.toThrow("Document not found");
    await a.mutation(api.companyDocs.deleteDocument, { id: id as never });
    expect(await a.query(api.companyDocs.searchDocuments, { question: "demurrage" })).toEqual([]);
    expect(await t.run(ctx => ctx.db.query("companyPassages").collect())).toEqual([]);
  });

  it("marks a file it can't read as failed, with a plain reason", async () => {
    vi.useFakeTimers();
    const t = setup(); const a = await account(t, "a@example.com");
    await a.mutation(api.companyDocs.generateUploadUrl, {});
    const storageId = await t.run(ctx => ctx.storage.store(new Blob(["not really a pdf"], { type: "application/pdf" })));
    await a.mutation(api.companyDocs.addDocument, { storageId, fileName: "scan.pdf" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await a.query(api.companyDocs.listDocuments, {})).toEqual([expect.objectContaining({ status: "failed", error: expect.stringContaining("couldn't be read") })]);
    await a.mutation(api.companyDocs.generateUploadUrl, {});
    const other = await t.run(ctx => ctx.storage.store(new Blob(["x"])));
    await expect(a.mutation(api.companyDocs.addDocument, { storageId: other, fileName: "deck.pptx" })).rejects.toThrow("Only PDF");
    // An orphaned upload from another account, stored before this account's slot, isn't claimable either.
    const orphan = await t.run(ctx => ctx.storage.store(new Blob(["someone else's file"], { type: "text/plain" })));
    vi.advanceTimersByTime(1000);
    const c = await account(t, "c@example.com");
    await c.mutation(api.companyDocs.generateUploadUrl, {});
    await expect(c.mutation(api.companyDocs.addDocument, { storageId: orphan, fileName: "orphan.txt" })).rejects.toThrow("The upload was not found");
  });
});

describe("agreed rates", () => {
  it("are saved per port and charge, validated and private", async () => {
    const t = setup(); const a = await account(t, "a@example.com"); const b = await account(t, "b@example.com");
    await a.mutation(api.agreedRates.saveAgreedRate, { rate: { kind: "discount", portId: "paradip", chargeType: "berth-hire", percent: "10" } });
    await a.mutation(api.agreedRates.saveAgreedRate, { rate: { kind: "discount", portId: "paradip", chargeType: "berth-hire", percent: "12.5", note: "Contract 14" } });
    expect(await a.query(api.agreedRates.listAgreedRates, {})).toEqual([expect.objectContaining({ portId: "paradip", chargeType: "berth-hire", percent: "12.5", note: "Contract 14" })]);
    await expect(a.mutation(api.agreedRates.saveAgreedRate, { rate: { kind: "discount", portId: "paradip", chargeType: "berth-hire", percent: "150" } })).rejects.toThrow("between 0 and 100");
    await expect(a.mutation(api.agreedRates.saveAgreedRate, { rate: { kind: "fixed", portId: "colombo", chargeType: "pilotage", amount: "1", currency: "USD" } })).rejects.toThrow("portId");
    expect(await b.query(api.agreedRates.listAgreedRates, {})).toEqual([]);
    // Editing an agreement to another port replaces it rather than adding a second (Codex finding 9).
    const [saved] = await a.query(api.agreedRates.listAgreedRates, {});
    await a.mutation(api.agreedRates.saveAgreedRate, { id: saved!.id as never, rate: { kind: "discount", portId: "jnpa", chargeType: "berth-hire", percent: "10" } });
    expect((await a.query(api.agreedRates.listAgreedRates, {})).map(rate => rate.portId)).toEqual(["jnpa"]);
    await expect(b.mutation(api.agreedRates.saveAgreedRate, { id: saved!.id as never, rate: { kind: "discount", portId: "jnpa", chargeType: "berth-hire", percent: "1" } })).rejects.toThrow("Agreed rate not found");
  });

  it("show beside the published figures in an estimate", async () => {
    const paradip = portBooks().find(book => book.id === "paradip")!;
    const result = estimate(paradip, { date: "2026-10-25", status: "foreign", vesselType: "bulk", grt: "32450", hours: "24" });
    const rates: AgreedRate[] = [
      { id: "1", portId: "paradip", chargeType: "berth-hire", kind: "discount", percent: "10", updatedAt: 1 },
      { id: "2", portId: "paradip", chargeType: "pilotage", kind: "fixed", amount: "20000", currency: "USD", updatedAt: 1 },
      { id: "3", portId: "mundra", chargeType: "port-dues", kind: "discount", percent: "50", updatedAt: 1 },
    ];
    const agreed = applyAgreedRates(result, rates)!;
    const published = Object.fromEntries(result.lines.map(line => [line.type, Number(line.amount)]));
    expect(agreed.rows.map(row => [row.chargeType, Number(row.published!.amount), Number(row.agreed.amount)])).toEqual([
      ["berth-hire", published["berth-hire"], Number((published["berth-hire"]! * 0.9).toFixed(6))],
      ["pilotage", published["pilotage-towage"], 20000],
    ]);
    expect(Number(agreed.totals[0]!.amount)).toBeCloseTo(Number(result.totals[0]!.amount) - published["berth-hire"]! * 0.1 - published["pilotage-towage"]! + 20000, 6);
    expect(applyAgreedRates(result, [rates[2]!])).toBeUndefined();
    // A fixed pilotage agreement doesn't add pilotage to a berth-hire-only estimate (Codex finding 6).
    const berthOnly = estimate(paradip, { date: "2026-10-25", status: "foreign", vesselType: "bulk", grt: "30000", hours: "24", charges: ["berth-hire"] });
    expect(applyAgreedRates(berthOnly, [rates[1]!])).toBeUndefined();
  });

  it("reach the chat: estimates and the company document search", async () => {
    const tools = businessTools({ company: {
      agreedRates: async () => [{ id: "1", portId: "paradip", chargeType: "berth-hire", kind: "discount", percent: "10", updatedAt: 1 }],
      search: async () => [{ documentId: "d1", title: "charter party 2026", fileName: "charter_party_2026.txt", page: 1, text: "Laytime is 72 hours." }],
    } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const run = (name: string, input: unknown) => tools[name]!.execute!((tools[name]!.inputSchema as ZodType).parse(input) as never, { toolCallId: "t", messages: [], context: {} }) as Promise<any>;
    const priced = await run("estimate_port_call", { ship: { grt: "32450", type: "bulk" }, calls: [{ port: "Paradip", date: "2026-10-25", hoursAlongside: "24" }] });
    expect(priced.card.calls[0].agreed.rows[0]).toMatchObject({ chargeType: "berth-hire", basis: "10% off the published rate" });
    expect(priced.summary).toContain("With the company's agreed rates");
    const found = await run("search_company_documents", { question: "laytime" });
    expect(found.card).toMatchObject({ kind: "company-excerpts", results: [{ title: "charter party 2026", page: 1 }] });
    expect(found.summary).toContain("charter party 2026, page 1");
  });
});
