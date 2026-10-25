import Decimal from "decimal.js";
import { z } from "zod";
import type { Estimate } from "./rulebook/calculate";

/** A company's agreed rates: a discount on a published charge, or a fixed amount per
 * call. Estimates show them beside the published figures; they never replace them. */

export { PORT_IDS, PORT_NAMES } from "./port-list";
import { PORT_IDS } from "./port-list";
export const AGREED_CHARGES: Array<{ value: string; label: string; types: string[] }> = [
  { value: "port-dues", label: "Port dues", types: ["port-dues"] },
  { value: "pilotage", label: "Pilotage (and towage where combined)", types: ["pilotage", "pilotage-towage"] },
  { value: "towage", label: "Towage", types: ["towage"] },
  { value: "berth-hire", label: "Berth hire", types: ["berth-hire"] },
  { value: "mooring", label: "Mooring", types: ["mooring"] },
  { value: "anchorage", label: "Anchorage", types: ["anchorage"] },
  { value: "wharfage", label: "Wharfage", types: ["wharfage"] },
  { value: "other", label: "Other charges", types: ["other"] },
];
export const MAX_AGREED_RATES = 300;

const decimal = z.preprocess(value => typeof value === "number" ? String(value) : typeof value === "string" ? value.replace(/,/g, "").trim() : value,
  z.string().regex(/^\d{1,9}(?:\.\d{1,6})?$/, "Use digits only, e.g. 10 or 4500.50."));
const common = {
  portId: z.enum(PORT_IDS),
  chargeType: z.enum(AGREED_CHARGES.map(charge => charge.value) as [string, ...string[]]),
  note: z.string().trim().max(200).optional(),
};
export const agreedRateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("discount"), percent: decimal.refine(value => Number(value) > 0 && Number(value) <= 100, "A discount is between 0 and 100%."), ...common }).strict(),
  z.object({ kind: z.literal("fixed"), amount: decimal.refine(value => Number(value) > 0, "Enter the agreed amount."), currency: z.enum(["INR", "USD"]), ...common }).strict(),
]);
export type AgreedRateInput = z.infer<typeof agreedRateSchema>;
export type AgreedRate = { id: string; portId: string; chargeType: string; kind: string; percent?: string; amount?: string; currency?: string; note?: string; updatedAt: number };

type Total = { currency: string; amount: string; display: string };
export type AgreedRow = { chargeType: string; label: string; basis: string; published?: Total; agreed: Total; note?: string };
export type AgreedView = { rows: AgreedRow[]; totals: Total[] };

const money = (amount: Decimal.Value, currency: string) => new Decimal(amount).toDecimalPlaces(2).toNumber()
  .toLocaleString(currency === "INR" ? "en-IN" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const total = (currency: string, amount: Decimal) => ({ currency, amount: amount.toString(), display: money(amount, currency) });

/** The call's charges at the company's agreed rates, or undefined when none apply. */
export function applyAgreedRates(estimate: Estimate, rates: AgreedRate[]): AgreedView | undefined {
  const mine = rates.filter(rate => rate.portId === estimate.port.id);
  if (!mine.length) return undefined;
  const sums = new Map(estimate.totals.map(item => [item.currency, new Decimal(item.amount)]));
  const rows: AgreedRow[] = [];
  for (const rate of mine) {
    const charge = AGREED_CHARGES.find(item => item.value === rate.chargeType);
    if (!charge) continue;
    const lines = estimate.lines.filter(line => charge.types.includes(line.type));
    if (rate.kind === "discount" && rate.percent) {
      for (const currency of [...new Set(lines.map(line => line.currency))]) {
        const published = lines.filter(line => line.currency === currency).reduce((sum, line) => sum.plus(line.amount), new Decimal(0));
        const agreed = published.mul(new Decimal(100).minus(rate.percent)).div(100);
        sums.set(currency, (sums.get(currency) ?? new Decimal(0)).minus(published).plus(agreed));
        rows.push({ chargeType: charge.value, label: charge.label, basis: `${rate.percent}% off the published rate`, published: total(currency, published), agreed: total(currency, agreed), ...(rate.note ? { note: rate.note } : {}) });
      }
    } else if (rate.kind === "fixed" && rate.amount && rate.currency && lines.length) {
      // A fixed amount replaces a charge in this estimate; it never adds one that isn't there.
      const same = lines.filter(line => line.currency === rate.currency);
      const published = same.reduce((sum, line) => sum.plus(line.amount), new Decimal(0));
      for (const line of lines.filter(item => item.currency !== rate.currency)) sums.set(line.currency, (sums.get(line.currency) ?? new Decimal(0)).minus(line.amount));
      sums.set(rate.currency, (sums.get(rate.currency) ?? new Decimal(0)).minus(published).plus(rate.amount));
      rows.push({
        chargeType: charge.value, label: charge.label, basis: `fixed ${rate.currency} ${money(rate.amount, rate.currency)} per call`,
        ...(same.length ? { published: total(rate.currency, published) } : {}), agreed: total(rate.currency, new Decimal(rate.amount)), ...(rate.note ? { note: rate.note } : {}),
      });
    }
  }
  if (!rows.length) return undefined;
  const totals = [...sums].filter(([, amount]) => !amount.isZero()).map(([currency, amount]) => total(currency, amount));
  return { rows, totals };
}
