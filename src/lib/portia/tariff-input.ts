import { z } from "zod";
import { SUPPORTED_PORTS } from "../migration/ports";

export const ancillaryServiceSchema = z.enum(["water", "liquid-nitrogen", "foam-pigging", "hard-pigging", "compressor", "vaporizer", "loading-arm", "pipeline", "wharf-management", "ldo-bunkering", "sludge-truck", "fire-engine", "lubricant-paint-barrel-loading", "gangway", "idling", "towage-standby", "port-services", "launch"]);

export const tariffServiceSchema = z.enum(["berth", "anchorage", "infrastructure", "gst", "rounding", "pilotage", "age-pilotage", "towage", "port-dues", "handling", "cargo", "mooring", "environment", "pilot-attendance", "muc", "cruise", "passenger-fee", "identity", "other", ...ancillaryServiceSchema.options])
  .describe("Actual requested service. age-pilotage is an explicitly requested vessel-age component, separate from ordinary pilotage; never infer it merely because pilotage was requested. Charging units, part hours, minimum tonnage and minimum bill are aspects of berth, not separate services. Use other for an unlisted service; never substitute a different charge.");

const text = z.string().trim().min(1).max(240).optional();
const quantity = z.string().regex(/^\d+(?:\.\d+)?$/, "Use an unsigned decimal quantity.").max(48).optional();
const flag = z.boolean().optional();

export const canonicalFacilityIdSchema = z.enum(SUPPORTED_PORTS as [string, ...string[]])
  .describe("Canonical catalog facility ID. Select only when the explicit booked port/terminal/operator wording contains one unique catalog identity. This ID does not prove tariff applicability and cannot override unknown, ambiguous or conflicting raw identity text.");

/** Business particulars only. No model-supplied tariff rate, citation or authority flag. */
export const tariffInputSchema = z.object({
  facilityId: canonicalFacilityIdSchema.optional(),
  port: text.describe("Explicit booked port OR terminal/catalog identity, exactly as supplied. A terminal name may be the port value. Never infer a parent port from geography."),
  terminal: text.describe("Only an explicitly supplied terminal/berth; otherwise null. Preserve even a user-stated conflict; never invent this field."),
  operator: text.describe("Only the explicitly supplied operator; otherwise null. Do not infer from a port name."),
  charges: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  callDate: text.describe("The actual call/service event date and, whenever supplied, its time and zone together. Preserve the full supplied service timestamp; do not reduce it to a date. Never append explanatory labels such as arrival/inward movement or combine different events."),
  keelLaidDate: text.describe("The vessel's explicitly supplied keel-laid date. This is not build, launch, delivery or registration date. Required only for an age-based rule such as JSW Jaigarh J-8."),
  berthStart: text,
  berthEnd: text,
  readinessTime: text.describe("Only the vessel's explicitly stated ready-to-sail notification time. Never use this field for a general handling/service event time; that belongs with its date in callDate."),
  timeZone: text,
  dateOrder: z.enum(["DMY", "MDY"]).optional(),
  gt: quantity,
  loa: quantity.describe("Explicit vessel length overall in metres. Never substitute GT, displacement or DWT."),
  durationHours: quantity,
  durationMinutes: quantity,
  portStayHours: quantity.describe("Explicit total vessel stay in port, in hours. Not berth occupancy or tug-attendance/standby-use hours. Needed for the Finolex published standby basis."),
  movements: quantity.describe("Number of actual vessel movements: one inward plus one outward, or one berthing/unberthing cycle, is 2. Preserve the user's stated movement scope."),
  callDays: quantity.describe("Actual total duration of this port call in days, only when supplied by the human. One call does not mean one day. A tariff's validity/renewal period or maximum eligible stay is not the vessel's actual duration. Leave null when unknown; ask if the chosen rule needs it."),
  service: text,
  vesselCategory: text,
  flag: text,
  cargoOperation: text,
  coastalLicence: flag,
  berthAllotted: flag,
  readinessValid: flag,
  favourableConditions: flag,
  idleTime: flag,
  shifting: flag,
  falseReadiness: flag,
  priority: flag,
  ousting: flag,
  penalty: flag,
  rebate: flag,
  otherAdjustments: flag,
  directBilling: flag,
  registeredCustomer: flag,
  privateCustomer: flag,
  supplierState: text,
  supplyState: text,
  sez: flag,
  taxExemption: flag,
  standaloneBill: flag,
  cargoTraffic: text,
  containerSize: quantity,
  specialCargo: flag,
  ladenContainers: quantity,
  emptyContainers: quantity,
  handlingMode: text,
  icdRail: flag.describe("True only for explicitly supplied actual ICD/inland-container-depot movement. Rail alone is insufficient. The normal NSFT rail bundle does not require this flag; leave null unless actual ICD use was stated."),
  portCrane: flag,
  cargoCategory: text,
  selfPropelled: flag.describe("Whether the vessel moves under its own power; false for cold/dead-ship movements."),
  pilotageArea: z.enum(["docks", "streamWithoutTugs", "jawaharDweepPirPau", "shiftingWithoutTugs"]).optional().describe("Actual Mumbai movement area/service; never infer from city alone."),
  pilotAttendanceHours: quantity.describe("Hours the Master requested the pilot to remain aboard, separate from berth occupancy."),
  passengers: quantity,
  containerCount: quantity.describe("Physical container count for MUC, not TEUs. If absent, known laden plus empty counts can be used."),
  fxInrPerUsd: quantity.describe("Explicit supplied INR per USD exchange rate; not an invented market quote."),
  fxDate: text,
  fxBasis: z.enum(["SBI-TT-selling"]).optional().describe("Only when the human explicitly identifies the supplied rate as SBI TT selling. Never infer its bank/source from a bare exchange rate. Generic comparison FX belongs in compare_quotes.exchangeRates."),
  fxPreviousWorkingDay: flag.describe("User confirmation that the supplied FX date is the previous bank working day because the prescribed event day was a holiday."),
  scheduledBerthingDate: text,
  cargoName: text.describe("Actual named commodity, preserving supplied product identity. Do not infer a commodity solely because cargo is liquid."),
  cargoTonnes: quantity,
  cargoItems: z.array(z.object({ grossTonnes: z.string().regex(/^\d+(?:\.\d+)?$/).max(48) }).strict()).min(1).max(50).optional().describe("Explicitly itemized gross cargo weights in tonnes, all in the stated commodity class. Preserve each item's weight. Do not assume an aggregate weight is a single item or invent a breakdown. OCT applies its weight assessment to each individual item."),
  cargoDirection: z.enum(["import", "export"]).optional(),
  cargoHandling: z.enum(["direct", "overside"]).optional().describe("Actual cargo handling: directly through the terminal/shore or overside. Do not infer direct handling merely from a port name."),
  userCausedDelay: flag.describe("True only for explicitly stated user-caused vessel idling/overstay."),
  serviceQuantities: z.array(z.object({ service: z.enum([...ancillaryServiceSchema.options, "pilotage", "towage", "mooring"]), quantity: z.string().regex(/^\d+(?:\.\d+)?$/).max(48), unit: z.enum(["MT", "operation", "hour", "truck20kl", "barrel", "Nm3", "vessel", "berthing", "activity"]) }).strict()).max(20).optional().describe("Actual services used and supplied quantities/units. Never infer usage from a rate table. Per-berthing quantities differ from inward/outward movements. Idling hours mean explicitly supplied chargeable hours beyond the two-hour grace, not total port stay."),
}).strict();
