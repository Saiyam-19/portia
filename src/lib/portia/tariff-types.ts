/** Ordinary port-call particulars. Rates and source authority are server-owned. */
export interface TariffInput {
  port?: string;
  terminal?: string;
  operator?: string;
  charges: string[];
  callDate?: string;
  keelLaidDate?: string;
  berthStart?: string;
  berthEnd?: string;
  readinessTime?: string;
  timeZone?: string;
  dateOrder?: "DMY" | "MDY";
  gt?: string;
  loa?: string;
  durationHours?: string;
  durationMinutes?: string;
  portStayHours?: string;
  movements?: string;
  callDays?: string;
  service?: string;
  /** Explicitly grounded requested scope, not an inferred waiver. Physical
   * eligibility, dates and quantities remain required for either scope. */
  adjustmentScope?: "include-adjustments" | "unadjusted-base";
  adjustmentScopeEvidence?: string;
  vesselCategory?: string;
  flag?: string;
  cargoOperation?: string;
  coastalLicence?: boolean | string;
  berthAllotted?: boolean | string;
  readinessValid?: boolean | string;
  favourableConditions?: boolean | string;
  idleTime?: boolean | string;
  shifting?: boolean | string;
  falseReadiness?: boolean | string;
  priority?: boolean | string;
  ousting?: boolean | string;
  penalty?: boolean | string;
  rebate?: boolean | string;
  otherAdjustments?: boolean | string;
  directBilling?: boolean | string;
  registeredCustomer?: boolean | string;
  privateCustomer?: boolean | string;
  supplierState?: string;
  supplyState?: string;
  sez?: boolean | string;
  taxExemption?: boolean | string;
  standaloneBill?: boolean | string;
  cargoTraffic?: string;
  containerSize?: string;
  specialCargo?: boolean | string;
  ladenContainers?: string;
  emptyContainers?: string;
  handlingMode?: string;
  icdRail?: boolean | string;
  portCrane?: boolean | string;
  cargoCategory?: string;
  selfPropelled?: boolean;
  pilotageArea?: string;
  pilotAttendanceHours?: string;
  passengers?: string;
  containerCount?: string;
  fxInrPerUsd?: string;
  fxDate?: string;
  fxBasis?: string;
  fxPreviousWorkingDay?: boolean;
  scheduledBerthingDate?: string;
  cargoName?: string;
  cargoTonnes?: string;
  cargoItems?: Array<{ grossTonnes: string }>;
  cargoDirection?: "import" | "export";
  cargoHandling?: "direct" | "overside";
  userCausedDelay?: boolean;
  serviceQuantities?: Array<{ service: string; quantity: string; unit: string }>;
}

export type TariffSource = { url: string; reference: string; sha256: string };
/** Input questions can be answered with human facts. Source/interpretation
 * gaps cannot be repaired by changing those facts to fit a retained rule. */
export type TariffIssue = {
  kind: "input" | "source" | "unsupported";
  code: string;
  message: string;
  service?: string;
  field?: keyof TariffInput;
};
export type TariffApplicability = {
  status: "conditional-retained-rule" | "published-reference" | "explanation-only" | "unverified";
  currentTariffVerified: false;
  message: string;
  effectiveFrom?: string;
  effectiveThrough?: string;
  sourceCheckedOn?: string;
  evidenceStatus?: "current-published" | "latest-published-unconfirmed" | "historical-published" | "conditional-scenario" | "mixed-unconfirmed";
};
export type TariffResult = {
  status: "calculated" | "estimated" | "explained" | "unresolved" | "error";
  sourceClass: "official-tariff" | "published-reference";
  facility?: string;
  body: string;
  questions: string[];
  limitations?: string[];
  issues?: TariffIssue[];
  adjustmentScope?: TariffInput["adjustmentScope"];
  totals?: Array<{
    currency: string;
    amount: string;
    chargeIds: string[];
    lineAmounts?: string[];
    basis?: "scoped-quote" | "component" | "reference";
  }>;
  calculation?: unknown;
  sources?: TariffSource[];
  applicability: TariffApplicability;
};
