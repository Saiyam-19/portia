import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { searchDocuments, terms } from "../../src/lib/berthwise/documents";
import { businessTools } from "../../src/lib/berthwise/tools";

const tools = businessTools();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (input: unknown) => tools.search_port_documents!.execute!((tools.search_port_documents!.inputSchema as ZodType).parse(input) as never, { toolCallId: "t", messages: [], context: {} }) as Promise<any>;

describe("port document search", () => {
  it("finds the page that answers an everyday port question", () => {
    expect(searchDocuments("permissible draft at berths", { port: "chennai" })[0]).toMatchObject({ page: 1, document: { title: "BERTH DETAILS - Permissible Draft at Berths as on 01.01.2026", kind: "rules" } });
    expect(searchDocuments("pilotage compulsory", { port: "mumbai" })[0]!.text).toContain("Pilotage in and out of the harbour is compulsory");
    // A long, wordy question as a model writes it still finds the page.
    expect(searchDocuments("Is pilotage compulsory or mandatory for vessels entering or leaving Mumbai Port? State exemptions if any.", { port: "mumbai", kind: "rules", portNames: ["Mumbai", "Mumbai Port Authority"] })[0]!.document.title).toBe("Pilotage");
    expect(searchDocuments("documents required before arrival", { port: "mundra" }).length).toBeGreaterThan(0);
  });

  it("returns the whole page, so a table split across passages stays together", () => {
    const hit = searchDocuments("berth hire for container vessels", { port: "kamarajar" })[0]!;
    expect(hit.page).toBe(22);
    expect(hit.text).toContain("| Any volume of GT | 0.0204 | 0.7619 |");
  });

  it("finds nothing rather than something loosely related", () => {
    expect(searchDocuments("pizza delivery", { port: "mumbai" })).toEqual([]);
    expect(terms("Berths and drafts")).toEqual(["berth", "draft"]);
  });

  it("answers through the tool with sources, and says when nothing matches", async () => {
    const result = await run({ question: "night navigation restriction", port: "Pipavav" });
    expect(result.card).toMatchObject({ kind: "document-excerpts", port: { id: "pipavav" } });
    expect(result.card.results[0]).toMatchObject({ title: "SAFE MEMO – PIPAVAV PORT – INDIA", port: { id: "pipavav" } });
    expect(result.summary).toContain("page");
    const none = await run({ question: "pizza delivery", port: "Mumbai" });
    expect(none.summary).toBe('Nothing in our documents for Mumbai Port Authority matches "pizza delivery".');
    expect(await run({ question: "berths", port: "Colombo" })).toEqual({ error: expect.stringContaining("isn't one of the ports we cover") });
  });
});
