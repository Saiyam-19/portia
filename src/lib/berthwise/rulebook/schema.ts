import { z } from "zod";

/** One reviewed data file per port: data/rulebook/<port-id>.json.
 * Every figure is a decimal string copied exactly from the source document.
 * See docs/rulebook-format.md for how to read a rate schedule into this shape. */

const decimal = z.string().regex(/^\d+(?:\.\d+)?$/, "Use a plain decimal string such as \"0.0137\".");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words joined by hyphens.");

export const statusSchema = z.enum(["foreign", "coastal"]);
export const vesselTypeSchema = z.enum(["general-cargo", "bulk", "container", "tanker", "lng", "lpg", "chemical", "passenger", "ro-ro", "other"]);
export const chargeTypeSchema = z.enum(["port-dues", "pilotage", "towage", "pilotage-towage", "berth-hire", "mooring", "anchorage", "wharfage", "other"]);
export const currencySchema = z.enum(["INR", "USD"]);

/** What the rate is multiplied by. */
export const basisSchema = z.enum([
  "grt",        // rate × gross tonnage
  "grt-hour",   // rate × gross tonnage × hours alongside
  "grt-day",    // rate × gross tonnage × days alongside
  "nrt",        // rate × net tonnage
  "loa-hour",   // rate × length overall (metres) × hours
  "loa-day",    // rate × length overall (metres) × days
  "call",       // the rate is a fixed amount for the call
  "hour",       // the rate is a fixed amount per hour alongside
  "tonne",      // rate × cargo tonnes
  "teu",        // rate × twenty-foot equivalent units
]);

export const sourceRefSchema = z.object({
  document: id.describe("Document id from this version's documents list."),
  page: z.union([z.number().int().positive(), z.string().min(1).max(20)]).describe("Printed or PDF page number of the table row."),
  section: z.string().max(80).optional().describe("Section or table number as printed, e.g. \"2.16\"."),
  quote: z.string().max(400).optional().describe("The table row or sentence, copied verbatim, that this rate comes from."),
}).strict();

export const bandSchema = z.object({
  upTo: decimal.optional().describe("Upper limit of this band, inclusive. Omit on the last band."),
  rate: decimal,
  base: decimal.optional().describe("Fixed amount for everything below this band, when the schedule prints one (\"US$ 18,966 for the first 30,000 GRT + 0.5058 per additional GRT\")."),
}).strict();

export const conditionSchema = z.object({
  status: z.array(statusSchema).min(1).optional(),
  vesselTypes: z.array(vesselTypeSchema).min(1).optional(),
  terminals: z.array(id).min(1).optional(),
  berths: z.array(id).min(1).optional(),
  cargoClasses: z.array(id).min(1).optional(),
}).strict();

export const rateSchema = z.object({
  when: conditionSchema.default({}).describe("Which calls this row applies to. Empty means every call."),
  currency: currencySchema,
  bandMode: z.enum(["whole", "excess"]).default("whole").describe("whole: the whole quantity is charged at the band it falls in. excess: each band's rate applies only above the previous band's limit, plus that band's base."),
  bands: z.array(bandSchema).min(1),
  minimumAmount: decimal.optional(),
  maximumAmount: decimal.optional(),
}).strict();

export const chargeSchema = z.object({
  id,
  type: chargeTypeSchema,
  label: z.string().min(1).max(80).describe("Plain-English name shown to users, e.g. \"Berth hire\"."),
  basis: basisSchema,
  bandOn: z.enum(["grt", "nrt", "loa", "tonnes", "teu", "hours"]).optional().describe("What selects the band, when it isn't the basis quantity (e.g. a per-call amount banded by GRT)."),
  per: z.enum(["call", "movement"]).default("call").describe("movement: charged for each inward and outward movement separately."),
  perTug: z.boolean().default(false).describe("Charged for each tug used."),
  timeRounding: z.enum(["started-hour", "started-half-day", "started-day", "exact"]).optional(),
  freeHours: decimal.optional().describe("Hours at the start of the stay that are not charged."),
  minimumQuantity: decimal.optional().describe("Smallest quantity charged, e.g. a minimum of 1,000 GRT."),
  includes: z.array(chargeTypeSchema).default([]).describe("Charges already covered by this one, e.g. towage inside a combined pilotage charge."),
  rates: z.array(rateSchema).min(1),
  conditions: z.array(z.string().max(300)).default([]).describe("Plain-English conditions a user should know, e.g. extra charges for night working."),
  source: sourceRefSchema,
}).strict();

export const documentSchema = z.object({
  id,
  title: z.string().min(1).max(200),
  issuer: z.string().min(1).max(120),
  url: z.string().url(),
  file: z.string().min(1).describe("Repository path of the original PDF."),
  markdown: z.string().min(1).describe("Repository path of the Markdown copy that was read."),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  publishedOn: date.optional(),
  retrievedOn: date,
}).strict();

export const versionSchema = z.object({
  id,
  effectiveFrom: date,
  effectiveTo: date.optional(),
  documents: z.array(documentSchema).min(1),
  defaults: z.object({
    status: statusSchema.default("foreign"),
    vesselType: vesselTypeSchema.default("general-cargo"),
    movements: z.number().int().positive().default(2),
    terminal: id.optional(),
    berth: id.optional(),
    tugs: z.array(z.object({ upToGrt: decimal.optional(), tugs: z.number().int().positive() }).strict()).optional()
      .describe("Tugs normally required by ship size, when the schedule or port rules say so."),
  }).strict().default({ status: "foreign", vesselType: "general-cargo", movements: 2 }),
  charges: z.array(chargeSchema).min(1),
  notes: z.array(z.object({ text: z.string().max(500), source: sourceRefSchema.optional() }).strict()).default([]),
  exchangeRate: z.string().max(300).optional().describe("How the port converts USD to INR, in the schedule's words."),
}).strict();

export const portBookSchema = z.object({
  id,
  name: z.string().min(1).max(120),
  kind: z.enum(["major", "private"]),
  aliases: z.array(z.string().min(1).max(80)).default([]),
  terminals: z.array(z.object({
    id, name: z.string().min(1).max(120), aliases: z.array(z.string().max(80)).default([]), operator: z.string().max(120).optional(),
    berths: z.array(z.object({ id, name: z.string().min(1).max(80), aliases: z.array(z.string().max(80)).default([]) }).strict()).default([]),
  }).strict()).default([]),
  versions: z.array(versionSchema).min(1),
  checkedOn: date.describe("When the source documents were last checked for newer versions."),
}).strict();

export type PortBook = z.infer<typeof portBookSchema>;
export type RuleVersion = z.infer<typeof versionSchema>;
export type Charge = z.infer<typeof chargeSchema>;
export type ChargeType = z.infer<typeof chargeTypeSchema>;
export type Status = z.infer<typeof statusSchema>;
export type VesselType = z.infer<typeof vesselTypeSchema>;
