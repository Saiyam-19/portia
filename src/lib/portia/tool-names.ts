/** Private transport aliases share the same domain receipts; a read or finish
 * result never becomes quotation authority merely because it carries JSON. */
export const QUOTE_WRITE_TOOLS = new Set(["manage_quote", "supplied_quote", "official_quote"]);
export const isQuoteWriteTool = (name: unknown): name is string => typeof name === "string" && QUOTE_WRITE_TOOLS.has(name);
export const PRIVATE_BUSINESS_TOOLS = new Set(["port_information", ...QUOTE_WRITE_TOOLS, "read_quotes", "compare_quotes", "finish_turn"]);

export function canonicalQuoteCommand(toolName: string, raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  if (toolName === "compare_quotes" && "selections" in raw && Array.isArray(raw.selections)) return {...raw,quoteIds:raw.selections.map(selection=>selection?.quoteId)};
  if (toolName === "compare_quotes" && "officialQuoteIds" in raw && Array.isArray(raw.officialQuoteIds)) return {...raw,quoteIds:raw.officialQuoteIds};
  if (toolName === "supplied_quote") return { ...raw, pricing: "supplied" };
  if (toolName === "official_quote") return { ...raw, pricing: "official" };
  if (toolName === "read_quotes") return { ...raw, action: "read" };
  return raw;
}
