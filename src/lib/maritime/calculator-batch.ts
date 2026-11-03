import { z } from "zod";
import { calculateTariffExpression } from "./calculator";

export const chargeCalculationsSchema = z.array(z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  expression: z.string().min(1).max(2_000),
}).strict()).min(1).max(24);

/** Batch only arithmetic, never tariff selection; all results use the same decimal engine. */
export function calculateChargeBatch(input: unknown) {
  const calculations = chargeCalculationsSchema.parse(input);
  if (new Set(calculations.map(item => item.id)).size !== calculations.length) {
    throw new Error("Calculation IDs must be unique.");
  }
  const results = new Map<string, string>();
  return calculations.map(({ id, expression }) => {
    const expanded = expression.replace(/\$([a-z][a-z0-9_]{0,39})\b/g, (_, reference: string) => {
      const value = results.get(reference);
      if (value === undefined) throw new Error(`Calculation '${reference}' must appear earlier in the batch.`);
      // Parentheses preserve signs and precedence; values come only from our
      // bounded decimal evaluator, never executable code or model prose.
      return `(${value})`;
    });
    const result = calculateTariffExpression(expanded);
    results.set(id, result);
    return { id, expression, result };
  });
}
