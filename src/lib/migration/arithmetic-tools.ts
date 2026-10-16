import { tool } from "ai";
import { z } from "zod";
import { calculateTariffExpression } from "./calculator";
import { calculateChargeBatch, chargeCalculationsSchema } from "./calculator-batch";
import { calculateElapsedTime } from "./elapsed-time";
import type { RequestEvidence } from "./request-evidence";

export function createArithmeticTools(evidence?: RequestEvidence) {
  return {
    calculate_charge_batch: tool({
      description: "Calculate supplied-rate or tariff line items and totals in one call with exact decimal arithmetic. No port is required for user-supplied rates/rules. Ordered expressions may reference earlier results using $id. Include duration rounding and totals in the same batch. All items fail together if an expression is invalid.",
      inputSchema: z.object({ calculations: chargeCalculationsSchema }).strict(),
      execute: async ({ calculations }) => {
        if (evidence && !evidence.authorizeArithmetic()) return { error: "No supplied or tariff-supported rate is available. Ask for clarification." };
        try {
          const results = calculateChargeBatch(calculations);
          evidence?.recordCalculations(results);
          return { calculations: results };
        }
        catch (error) { return { error: `Calculation error: ${error instanceof Error ? error.message : "Invalid arithmetic."}` }; }
      },
    }),
    calculate_charges: tool({
      description: "Evaluate bounded decimal arithmetic using supplied rates/rules; no port is required. Supports + - * / **, parentheses, ceil, floor, min, max and half-up round.",
      inputSchema: z.object({ expression: z.string().min(1).max(2_000) }).strict(),
      execute: async ({ expression }) => {
        if (evidence && !evidence.authorizeArithmetic()) return "Calculation error: No supplied or tariff-supported rate is available. Ask for clarification.";
        try {
          const result = calculateTariffExpression(expression);
          evidence?.recordCalculations([{ id: "result", expression, result }]);
          return result;
        }
        catch (error) { return `Calculation error: ${error instanceof Error ? error.message : "Invalid arithmetic."}`; }
      },
    }),
    calculate_elapsed_time: tool({
      description: "Validate original timestamps and calculate elapsed time, even for unsupported ports. Pass the user's raw timestamps unchanged, not a guessed normalized date. Rejects ambiguous numeric dates, nonexistent dates, missing zones and reversed intervals. Supports named-month dates, ISO timestamps and numeric DMY/MDY dates; 24-hour times; UTC offsets, UTC/GMT or IST meaning India (+05:30). Ask for an explicit offset for other ambiguous zone labels. This returns elapsed time, not tariff-rounded billable time.",
      inputSchema: z.object({
        start: z.string().min(1).max(160).describe("Original user-provided start timestamp."),
        end: z.string().min(1).max(160).describe("Original user-provided end timestamp."),
        dateOrder: z.enum(["DMY", "MDY"]).optional().describe("Only set when the user explicitly confirmed date order. Never infer it from locale or port."),
        timeZone: z.string().min(1).max(12).optional().describe("Shared UTC offset or UTC/IST only when explicitly supplied by the user. An offset in a timestamp takes precedence."),
      }).strict(),
      execute: async (input) => {
        const grounded = evidence ? evidence.timeInput(input) : input;
        if ("error" in grounded) return { status: "clarification_required", error: "UNSUPPORTED_TIMESTAMP", message: grounded.error };
        const result = calculateElapsedTime(grounded);
        evidence?.recordTime(grounded, result);
        return result;
      },
    }),
  };
}
