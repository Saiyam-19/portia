import { z } from "zod";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { memoryKeySchema, memoryValueSchema } from "../memory/input";

export const AUTHORITY_VERSION = 1;
export const AUTHORITY_VERSION_V2 = 2;
export const AUTHORITY_TTL_MS = 15 * 60_000;
export const MAX_REVIEW_CHARS = 12_000;
export const APPROVE = "Approve exactly as shown";
export const REJECT = "Reject";
export class ReviewCapacityError extends Error {
  constructor(message: string) { super(message); this.name = "ReviewCapacityError"; }
}
const jsonObject = z.record(z.string(), z.unknown());
const binding = z.object({ quoteId: z.string().min(1).max(100), revision: z.number().int().nonnegative(), digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const quoteCoreSchema = z.object({
  id: z.string().min(1).max(100), revision: z.number().int().nonnegative(), name: z.string().min(1).max(120), pricing: z.enum(["supplied", "official"]),
  call: jsonObject, services: z.array(z.string()).max(20), lines: z.array(jsonObject).max(16), terms: jsonObject,
  unresolvedHistory: z.array(z.string()).max(4096).optional(),
  baseline: z.object({ totals: z.array(z.object({ currency: z.string(), amount: z.string(), chargeIds: z.array(z.string()), lineAmounts: z.array(z.string()).optional(), basis: z.enum(["scoped-quote", "component", "reference"]).optional() }).strict()).optional(), lines: z.array(jsonObject), imported: z.boolean().optional() }).strict().optional(),
}).strict();
const operationBase = { id: z.string().uuid() };
export const authorityOperationSchema = z.discriminatedUnion("kind", [
  z.object({ ...operationBase, kind: z.literal("quote"), quote: quoteCoreSchema, before: binding.nullable(), previous: quoteCoreSchema.nullable(), preview: z.object({ totals: z.array(z.object({ currency: z.string(), amount: z.string() }).strict()).min(1).max(16) }).strict().optional() }).strict(),
  z.object({ ...operationBase, kind: z.literal("comparison"), input: jsonObject, quotes: z.array(binding.extend({ name: z.string().max(120) })).min(2).max(8) }).strict(),
  z.object({ ...operationBase, kind: z.enum(["remember", "forget"]), key: memoryKeySchema, value: memoryValueSchema.optional(), previousValue: memoryValueSchema.nullable(), previousValueHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(), memoryEpoch: z.number().int().nonnegative(), memoryRevision: z.number().int().nonnegative() }).strict(),
]);
const packetBase = z.object({ operations: z.array(authorityOperationSchema).min(1).max(4) });
type Operation = z.infer<typeof authorityOperationSchema>;
function validatePacket(packet: {version:number;operations:Operation[]}, ctx: z.RefinementCtx) {
  const ids = packet.operations.map(op => op.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Duplicate operation IDs." });
  const quoteIds = packet.operations.filter(op => op.kind === "quote").map(op => op.quote.id);
  if (new Set(quoteIds).size !== quoteIds.length) ctx.addIssue({ code: "custom", message: "Review one change per quotation at a time." });
  if (packet.version === 1 && packet.operations.some(op => op.kind === "quote") && packet.operations.some(op => op.kind === "comparison")) ctx.addIssue({code:"custom",message:"Confirm quote changes and comparisons in separate reviews."});
  const keys = packet.operations.flatMap(op => op.kind === "remember" || op.kind === "forget" ? [op.key] : []);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", message: "Review one change per memory key at a time." });
  for (const op of packet.operations) {
    if (op.kind === "remember" && (op.value === undefined || (op.previousValue === null) !== (op.previousValueHash === null)) || op.kind === "forget" && (op.value !== undefined || op.previousValue !== null)) ctx.addIssue({ code: "custom", message: "Memory payload does not match its operation." });
    if (op.kind === "quote" && (op.quote.revision !== (op.before?.revision ?? -1) + 1 || (op.before ? op.before.quoteId !== op.quote.id || op.previous?.id !== op.quote.id || op.previous.revision !== op.before.revision : op.previous !== null))) ctx.addIssue({ code: "custom", message: "Quotation revision binding is invalid." });
    if (packet.version === 2 && op.kind === "comparison") for (const selected of op.quotes) {
      const dependency = packet.operations.slice(0, packet.operations.indexOf(op)).flatMap(candidate => candidate.kind === "quote" && candidate.quote.id === selected.quoteId ? [candidate] : []).at(-1);
      if (dependency && (selected.revision !== dependency.quote.revision || selected.digest !== authorityDigestSync(dependency.quote))) ctx.addIssue({ code: "custom", message: "Comparison dependency does not bind the complete preceding quotation." });
      const forward = packet.operations.slice(packet.operations.indexOf(op) + 1).some(candidate => candidate.kind === "quote" && candidate.quote.id === selected.quoteId);
      if (forward) ctx.addIssue({ code: "custom", message: "Comparison cannot bind a later quotation operation." });
    }
  }
}
export const authorityPacketV1Schema = packetBase.extend({ version: z.literal(AUTHORITY_VERSION) }).strict().superRefine(validatePacket);
export const authorityPacketV2Schema = packetBase.extend({ version: z.literal(AUTHORITY_VERSION_V2) }).strict().superRefine(validatePacket);
export const authorityPacketSchema = z.union([authorityPacketV1Schema, authorityPacketV2Schema]);
export type AuthorityOperation = Operation;
export type AuthorityPacket = z.infer<typeof authorityPacketSchema>;
export type QuoteBinding = z.infer<typeof binding>;
export type QuoteCore = z.infer<typeof quoteCoreSchema>;
export type AuthorityContext = { quotes: QuoteBinding[]; comparisons: string[] };
export function canonical(value: unknown): string {
  return Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object"
    ? `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}` : JSON.stringify(value);
}
export function authorityDigestSync(value: unknown): string { return bytesToHex(sha256(utf8ToBytes(canonical(value)))); }
export async function authorityDigest(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
export function quoteCore(quote: { id: string; revision: number; name: string; pricing: "official" | "supplied"; call: object; services: string[]; lines: object[]; terms: object; unresolvedHistory?: string[]; baseline?: object }): QuoteCore {
  return quoteCoreSchema.parse({ id: quote.id, revision: quote.revision, name: quote.name, pricing: quote.pricing, call: quote.call, services: quote.services, lines: quote.lines, terms: quote.terms, ...(quote.baseline ? { baseline: quote.baseline } : {}), ...(quote.unresolvedHistory?.length ? { unresolvedHistory: quote.unresolvedHistory } : {}) });
}
export function comparisonCore(op: Extract<AuthorityOperation, { kind: "comparison" }>) { return { input: op.input, quotes: op.quotes.map(({ quoteId, revision, digest }) => ({ quoteId, revision, digest })) }; }
export function parsePacket(payload: string): AuthorityPacket {
  if (new TextEncoder().encode(payload).byteLength > 48_000) throw new ReviewCapacityError("Approval payload is too large; split the request.");
  return authorityPacketSchema.parse(JSON.parse(payload));
}
const labels: Record<string, string> = { gt: "Gross tonnage (GT)", nt: "Net tonnage (NT)", dwt: "Deadweight tonnes", loa: "Length overall", cargoTonnes: "Cargo tonnes", fxInrPerUsd: "INR per USD", fxBasis: "FX source", fxDate: "FX date", taxPercent: "Tax percent", perQuantity: "Rate denominator", periodHours: "Billing period hours", commenced: "Charge commenced periods", amount: "Amount", rate: "Rate", currency: "Currency", minimum: "Minimum", maximum: "Maximum", unresolvedTerms: "Unresolved conditions", unresolvedHistory: "Unresolved historical conditions" };
const visible = (value: unknown): string => String(value).replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
function describe(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return value.length ? value.flatMap((item, i) => describe(item, `${prefix} ${i + 1}`)) : [`${prefix}: none`];
  if (value && typeof value === "object") return Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).flatMap(([name, item]) => describe(item, `${prefix}${prefix ? " / " : ""}${labels[name] ?? name.replace(/([A-Z])/g, " $1").toLowerCase()}`));
  return [`${prefix}: ${visible(value)}`];
}
function baselineReview(quote: QuoteCore) {
  const baseline = quote.baseline;
  if (!baseline) return {};
  // The calculation record retains machine metadata. Show the operative original
  // totals and per-line amounts used for change reporting, not internal charge IDs.
  return { originalComparison: { totals: baseline.totals?.map(({currency,amount})=>({currency,amount})), lines: baseline.lines.map((line,index)=> {
    const currency = line.currency, sameCurrencyIndex=baseline.lines.slice(0,index).filter(item=>item.currency===currency).length;
    return {name:line.name,currency,amount:baseline.totals?.find(total=>total.currency===currency)?.lineAmounts?.[sameCurrencyIndex]};
  }), origin:baseline.imported ? "imported saved quotation" : "original confirmed quotation" } };
}
export function reviewPacket(packet: AuthorityPacket): string {
  const parts = ["Review every operation below. Approval applies only these exact terms. These are user-confirmed terms, not verification of official tariffs. Reject or add a note to request changes; any note prevents execution."];
  for (const [i, op] of packet.operations.entries()) {
    parts.push(`\nOperation ${i + 1}`);
    if (op.kind === "quote") {
      parts.push(`${op.before ? "Replace/review" : "Create"} quotation: ${visible(op.quote.name)} (${op.quote.pricing === "supplied" ? "supplied prices" : "official-source inputs with supplied FX"})`);
      if (op.previous) {
        const old = { call: op.previous.call, services: op.previous.services, lines: op.previous.lines, terms: op.previous.terms };
        const next = { call: op.quote.call, services: op.quote.services, lines: op.quote.lines, terms: op.quote.terms };
        for (const [key, value] of Object.entries(old)) if (canonical(value) !== canonical(next[key as keyof typeof next])) parts.push(`Previously stored ${key} (review, not authority):\n${describe(value).join("\n")}`);
      }
      parts.push("Complete terms after approval (omitted rate denominator means 1; omitted tax status remains unknown; no rounding rule means exact arithmetic; specified rounding uses half-up):", ...describe({ particulars: op.quote.call, includedServices: op.quote.services, chargeLines: op.quote.lines, terms: op.quote.terms, ...baselineReview(op.quote), ...(op.quote.unresolvedHistory?.length ? { unresolvedHistory: op.quote.unresolvedHistory } : {}) }));
      if (op.preview) parts.push("Unapproved calculation preview from the terms above (not an original confirmed quotation):", ...describe(op.preview));
    } else if (op.kind === "comparison") parts.push("Compare these exact saved quotation revisions:", ...op.quotes.map(q => `${visible(q.name)} (revision ${q.revision})`), ...describe(Object.fromEntries(Object.entries(op.input).filter(([key]) => key !== "quoteIds"))));
    else if (op.kind === "remember") parts.push("Save/update cross-chat memory", `Key: ${visible(op.key)}`, `Previously stored value: ${op.previousValue === null ? "none" : visible(op.previousValue)}`, `New value: ${visible(op.value)}`);
    else parts.push("Forget cross-chat memory", `Key: ${visible(op.key)}`, "This also invalidates private working notes; chat history remains.");
  }
  const text = parts.join("\n");
  if (text.length > MAX_REVIEW_CHARS) throw new ReviewCapacityError("The complete review is too large. Split the request; no terms were truncated or approved.");
  return text;
}
export function approvalForm(packet: AuthorityPacket, toolCallId: string) {
  return { toolCallId, title: "Confirm exact operations", description: reviewPacket(packet), fields: [{ name: "decision", label: "Apply every operation shown above?", type: "radio" as const, required: true, options: [APPROVE, REJECT] }] };
}
