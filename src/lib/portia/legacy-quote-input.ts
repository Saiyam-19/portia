import { key, type QuoteInput } from "./quotes";

// Retained internal API normalization. New model commands use explicit errors
// and grounded metadata, never this legacy compatibility adapter.
export function legacyQuoteLabel(name: string | undefined, request: string): string | undefined {
  if (!name) return;
  for (const match of request.matchAll(/\b(?:quotes?|quotations?|estimates?|offers?|calls?|vessels?)\s+(?:named|called|label(?:led)?)\s+([^.!?;\n]+)/gi)) {
    const list = match[1].split(/\s+(?:for|at|on|with)\b|,\s*(?:both|each|all)\b/i)[0];
    if (list.split(/\s+and\s+|\s*&\s*|,\s*/i).some(item => key(item.trim().replace(/^["“']|["”']$/g, "")) === key(name))) return name;
  }
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:\\b(?:quote|quotation|estimate|offer|call|vessel)s?\\s+(?:is\\s+)?(?:named|called|label(?:led)?)\\s*[:=]?\\s*["“']?${escaped}["”']?(?=$|[.,;\\s])|\\b${escaped}\\s*(?:is|[:=-])?\\s*(?:USD|INR|EUR|GBP)\\s*\\d|\\b${escaped}\\s+(?:is|has)\\s+\\d+(?:\\.\\d+)?\\s*(?:GRT|GT)\\b)`, "i").test(request) ? name : undefined;
}
const suppliedCallFields = new Set(["vesselName", "gt", "nt", "dwt", "loa", "draught", "cargoTonnes", "anchorageArrival", "cargoCompleted", "portDeparture", "intervalStart", "intervalEnd", "occupancy", "berthStart", "berthEnd", "timeZone", "dateOrder", "movements", "otherAdjustments", "callDate"]);

export function legacySuppliedCall(call: NonNullable<QuoteInput["call"]>): NonNullable<QuoteInput["call"]> {
  return Object.fromEntries(Object.entries(call).filter(([field]) => suppliedCallFields.has(field)));
}

