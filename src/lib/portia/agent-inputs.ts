import { z } from "zod";
import { callSchema, quoteCommandSchema, termsSchema } from "./quotes";
import { supportRetrySchema } from "../memory/input";

const command = quoteCommandSchema.shape;
const validateCommand = (input: unknown, context: z.RefinementCtx, implicit: Record<string, string>) => {
  const candidate={...(input as object)} as Record<string,unknown>;delete candidate.retryOf;
  const result = quoteCommandSchema.safeParse({ ...candidate, ...implicit });
  if (!result.success) for (const issue of result.error.issues) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
};
const write = { action: z.enum(["create", "update"]), quoteId: command.quoteId, name: command.name, reviewGroup: command.reviewGroup, retryOf: command.retryOf };
// Supplier arithmetic has no dependency on tariff eligibility intake. Preserve
// original identity/quantity facts without transmitting unrelated tariff rules.
export const suppliedCallSchema = callSchema.pick({
  supplier:true, chargingAuthority:true, reference:true, context:true,
  port:true, terminal:true, operator:true, vesselName:true, gt:true, nt:true,
  dwt:true, loa:true, draught:true, cargoTonnes:true, movements:true,
  callDate:true, berthStart:true, berthEnd:true, timeZone:true, dateOrder:true,
  occupancy:true, anchorageArrival:true, cargoCompleted:true, portDeparture:true,
  intervalStart:true, intervalEnd:true, service:true, vesselCategory:true,
  flag:true, cargoName:true, cargoOperation:true, otherAdjustments:true,
});
export const suppliedQuoteSchema = z.object({
  ...write, call: suppliedCallSchema.optional(), vesselCategoryEvidence: command.vesselCategoryEvidence, lines: command.lines, removeLines: command.removeLines,
  terms: termsSchema.omit({ unsupportedServices: true }).optional(),
  clearCallFields: z.array(suppliedCallSchema.keyof()).min(1).max(20).optional(), scopeChangeEvidence: command.scopeChangeEvidence,
}).strict().superRefine((input, context) => validateCommand(input, context, { pricing: "supplied" }));
// Explicit wire role: cargo movements belong to each billing recipe. Keep the
// established storage/receipt field so existing quotes need no migration.
const suppliedWireCallSchema = suppliedCallSchema.omit({ movements: true }).extend({
  vesselMovements: callSchema.shape.movements.describe("Explicit number of vessel movements only (arrivals, departures or berth shifts). Never copy cargo-handling/transfer movements here; those stay in line billing.movements. Leave unknown unless the source identifies vessel movements."),
});
export const suppliedQuoteWireSchema = z.object({
  ...suppliedQuoteSchema.shape,
  call: suppliedWireCallSchema.optional(),
  clearCallFields: z.array(suppliedWireCallSchema.keyof()).min(1).max(20).optional(),
}).strict().transform(({ call, clearCallFields, ...input }) => {
  const { vesselMovements, ...knownCall } = call ?? {};
  return {
    ...input,
    ...(call ? { call: { ...knownCall, ...(vesselMovements !== undefined ? { movements: vesselMovements } : {}) } } : {}),
    ...(clearCallFields ? { clearCallFields: clearCallFields.map(field => field === "vesselMovements" ? "movements" : field) } : {}),
  };
}).pipe(suppliedQuoteSchema);
export const officialQuoteSchema = z.object({
  ...write, call: command.call, services: command.services, vesselCategoryEvidence: command.vesselCategoryEvidence,
  terms: termsSchema.pick({ unresolvedTerms: true, unsupportedServices: true }).optional(),
  removeServices: command.removeServices, removeUnsupportedServices: command.removeUnsupportedServices,
  clearCallFields: command.clearCallFields, scopeChangeEvidence: command.scopeChangeEvidence,
}).strict().superRefine((input, context) => validateCommand(input, context, { pricing: "official" }));
export const readQuotesSchema = z.object({
  readScope: z.enum(["current-chat", "cross-chat"]), quoteId: command.quoteId, reference: command.reference, reporting: command.reporting, retryOf:supportRetrySchema,
}).strict().superRefine((input, context) => validateCommand(input, context, { action: "read" }));

/** Keep schema-repair feedback aligned with the actual exposed tool, including
 * individual strict-object keys that the wider domain command permits. */
export function quoteToolInvalidFields(toolName: string, canonicalInput: unknown): string[][] {
  if (!canonicalInput || typeof canonicalInput !== "object" || Array.isArray(canonicalInput)) return [];
  const input = { ...canonicalInput } as Record<string, unknown>;
  const schema = toolName === "supplied_quote" ? suppliedQuoteSchema : toolName === "official_quote" ? officialQuoteSchema : toolName === "read_quotes" ? readQuotesSchema : undefined;
  if (!schema) return [];
  if (toolName === "read_quotes") delete input.action;
  else delete input.pricing;
  const result = schema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.flatMap(issue => issue.code === "unrecognized_keys"
    ? issue.keys.map(key => [...issue.path.map(String), key])
    : issue.path.length ? [issue.path.map(String)] : []);
}
