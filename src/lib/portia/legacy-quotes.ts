import type { ModelMessage } from "ai";
import Decimal from "decimal.js";
import { callSchema, lineSchema, type Quote, type QuoteLine } from "./quotes";
import { isQuoteWriteTool } from "./tool-names";

/** Read-only bridge for authenticated historical receipts. Never runs on a new
 * chat, accepts new proposals, rewrites raw messages, or mines assistant prose. */
export async function readLegacyQuotes(messages: readonly ModelMessage[]): Promise<{ quotes: Quote[]; warning?: string }> {
  const historical = messages.some(message => message.role === "tool" && message.content.some(part => part.type === "tool-result" && part.toolName === "interpret_request"));
  if (!historical) return { quotes: [], ...(!messages.some(message => message.role === "tool" && message.content.some(part => part.type === "tool-result" && isQuoteWriteTool(part.toolName))) && messages.some(message => message.role === "assistant") ? { warning: "Historical prose is not a saved quotation. Unrecorded historical prices and conditions must be confirmed from user-supplied or official evidence." } : {}) };
  try {
    const { replayConversation, currentConversationFact, unresolvedConversationField, monetaryEvidenceCurrency, FIELD_NAMES } = await import("../migration/conversation");
    const { state } = replayConversation(messages);
    // Tasks describe only a turn's requested work. The verified quotation
    // definitions remain useful after a later greeting or memory-only turn.
    const quoteTasks = new Map<string, (typeof state.tasks)[number]>();
    for (const message of messages) if (message.role === "tool") for (const part of message.content) {
      if (part.type !== "tool-result" || part.toolName !== "interpret_request" || part.output.type !== "json") continue;
      const receipt = part.output.value as unknown as { kind?: string; proposal?: { tasks?: typeof state.tasks } };
      if (receipt?.kind === "conversation-interpretation") for (const task of receipt.proposal?.tasks ?? []) if (task.kind === "quote" && ["official", "supplied"].includes(task.source)) quoteTasks.set(task.id, task);
    }
    const quotes: Quote[] = [];
    for (const task of quoteTasks.values()) {
      const get = (field: Parameters<typeof currentConversationFact>[2], scope = task.scopeId) => currentConversationFact(state, scope, field)?.value;
      const pending = state.unresolved.filter(issue => [task.scopeId, ...task.ruleScopeIds].includes(issue.scopeId)).map(issue => issue.question);
      // Preserve constraints that the old receipt expressed but the new quote
      // cannot faithfully represent. They must never become default values.
      if (task.source === "supplied") {
        const named = task.ruleScopeIds.map(scope => get("charge", scope));
        if (task.charges.length !== named.length || new Set(named).size !== named.length || named.some(name => !name || !task.charges.includes(name))) pending.push("Every requested historical charge needs its own matching quoted rule.");
        const tax = get("tax");
        if (tax === "included" || tax === "exempt" || tax === "percentage" && get("taxPercent") === undefined) pending.push("Historical tax treatment needs explicit supported terms; it cannot be omitted.");
        const hours = get("durationHours"), minutes = get("durationMinutes");
        if (hours !== undefined && minutes !== undefined && !new Decimal(hours).mul(60).eq(minutes)) pending.push("Historical duration hours and minutes conflict.");
        if (["line", "quote"].includes(get("moneyRounding") ?? "") && get("moneyDecimals") === undefined) pending.push("Historical monetary rounding precision is missing.");
      }
      const call: Record<string, unknown> = {};
      // Only the named domain properties supported by the new interface cross.
      for (const field of Object.keys(callSchema.shape)) {
        const value = get(field as Parameters<typeof currentConversationFact>[2]);
        if (value !== undefined) call[field] = value === "true" ? true : value === "false" ? false : value;
      }
      if (get("durationMinutes") !== undefined) call.occupancy = { minutes: get("durationMinutes") };
      else if (get("durationHours") !== undefined) call.occupancy = { hours: get("durationHours") };
      const parsedCall = callSchema.safeParse(call);
      if (!parsedCall.success) { quotes.push({ id: "legacy-" + task.id, revision: 0, name: "Historical quotation", pricing: task.source === "official" ? "official" : "supplied", call: {}, services: task.charges, lines: [], terms: { unresolvedTerms: ["Historical particulars could not be converted safely; confirm the requested call details."] } }); continue; }
      const lines: QuoteLine[] = [];
      for (const scope of task.ruleScopeIds) {
        const basis = get("basis", scope);
        const unit = ({ amount: "amount", flat: "amount", "time-period": "time", "gt-period": "gt-time", movement: "movement", "cargo-tonne": "tonne" } as const)[basis as "amount"];
        const rate = get("rate", scope), currency = get("currency", scope);
        for (const field of ["rate", "minimum", "maximum"] as const) {
          if (field !== "rate" && get(field + "Treatment" as "minimumTreatment", scope) === "none") continue;
          const fact = currentConversationFact(state, scope, field);
          if (fact && monetaryEvidenceCurrency(fact) !== currency) pending.push(`Historical ${get("charge", scope) ?? scope}: ${field} currency does not match ${currency ?? "the charge currency"}; clarify the governing terms without assuming FX.`);
        }
        if (get("taxPercent", scope) !== undefined || get("tax", scope) !== undefined) pending.push(`Historical ${get("charge", scope) ?? scope}: per-charge tax requires supported aggregation terms.`);
        const rounding = get("rounding", scope);
        if (["gt-period", "time-period"].includes(basis ?? "") && !["exact", "started"].includes(rounding ?? "")) pending.push(`Historical ${get("charge", scope) ?? scope}: billing-time rounding mode is unresolved.`);
        const line: Record<string, unknown> = { name: get("charge", scope) ?? scope, currency: get("currency", scope), unit,
          ...(unit === "amount" ? { amount: rate } : { rate }), perQuantity: get("basisQuantity", scope), periodHours: get("periodHours", scope),
          ...(["exact", "started"].includes(rounding ?? "") ? { commenced: rounding === "started" } : {}) };
        for (const bound of ["minimum", "maximum"] as const) {
          if (get(bound + "Treatment" as "minimumTreatment", scope) === "none") continue;
          else if (get(bound, scope)) line[bound] = { amount: get(bound, scope), per: get(bound + "Scope" as "minimumScope", scope) };
        }
        const parsed = lineSchema.safeParse(line);
        lines.push(parsed.success ? parsed.data : { name: String(line.name) });
      }
      for (const scope of [task.scopeId, ...task.ruleScopeIds]) for (const field of FIELD_NAMES) {
        if (unresolvedConversationField(state, scope, field)) pending.push(`Historical ${state.scopes.find(item => item.id === scope)?.label ?? scope}: ${field} is conflicting or withdrawn; confirm the governing value or condition.`);
      }
      if (get("otherAdjustments") === "true" || task.ruleScopeIds.some(scope => get("otherAdjustments", scope) === "true")) pending.push("The historical quotation has governing adjustments that remain unresolved.");
      const tax = get("taxPercent");
      if (unresolvedConversationField(state, task.scopeId, "taxPercent")) pending.push("Historical tax treatment is conflicting or withdrawn; confirm it.");
      quotes.push({ id: "legacy-" + task.id, revision: 0,
        name: state.scopes.find(scope => scope.id === task.scopeId)?.label ?? "Historical quotation",
        pricing: task.source === "official" ? "official" : "supplied", call: parsedCall.data, services: [...task.charges], lines,
        ...(pending.length ? { unresolvedHistory: [...new Set(pending)] } : {}),
        terms: { ...(get("tax") === "none" ? { taxPercent: "0" } : tax !== undefined ? { taxPercent: tax } : {}),
          ...(["line", "quote"].includes(get("moneyRounding") ?? "") && get("moneyDecimals") ? { rounding: { stage: get("moneyRounding") === "line" ? "line" as const : "total" as const, decimals: Number(get("moneyDecimals")) } } : {}),
          unresolvedTerms: pending },
      });
    }
    return { quotes };
  } catch {
    return { quotes: [], warning: "Historical quotation receipts could not be verified. Raw history remains available. Confirm the affected quotation details; do not reconstruct prices from assistant prose." };
  }
}
