import { chargeCalculationsSchema } from "../migration/calculator-batch";
import { calculateExactExpression } from "./exact-expression";

/** Server-owned tariff formulas only. The generic calculator's compatibility
 * behavior is unchanged. References retain exact values between batch rows. */
export function calculateExactChargeBatch(input: unknown) {
  const calculations = chargeCalculationsSchema.parse(input);
  if (new Set(calculations.map(item => item.id)).size !== calculations.length) throw new Error("Calculation IDs must be unique.");
  const results = new Map<string, string>();
  return calculations.map(({ id, expression }) => {
    const expanded = expression.replace(/\$([a-z][a-z0-9_]{0,39})\b/g, (_, reference: string) => {
      const value = results.get(reference);
      if (value === undefined) throw new Error(`Calculation '${reference}' must appear earlier in the batch.`);
      return `(${value})`;
    });
    const result = calculateExactExpression(expanded);
    results.set(id, result);
    return { id, expression, result };
  });
}
