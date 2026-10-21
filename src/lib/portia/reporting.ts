import DecimalJs from "decimal.js";
import { money, type QuoteCommand, type QuoteResult } from "./quotes";
import { exactValue, rational, roundRational, sameExact, sumExact } from "./fx-conversion";

const D = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_UP });

/** Reporting precision is a derived view. Exact source amounts, calculation,
 * baseline and comparison inputs are never changed by presentation settings. */
export function reportQuote(result: QuoteResult, rounding: QuoteCommand["reporting"]): QuoteResult {
  if (!rounding || !result.totals?.length) return result;
  const reported = [];
  for (const total of result.totals) {
    if (rounding.stage === "line" && (!total.lineAmounts?.length || !sameExact(sumExact(total.lineAmounts), total.amount))) {
      const issue = "The requested line-rounded report cannot be produced: source lines do not reconcile to the saved total. An unallocated total adjustment cannot be dropped. Exact source amounts are retained below.";
      return { ...result, body: `**Requested report unavailable**\n\n${issue}\n\n${result.body}`, reporting: { ...rounding, status: "unavailable", totals: [], issues: [issue] } };
    }
    const amount = rounding.stage === "line"
      ? sumExact(total.lineAmounts!.map(value => exactValue(roundRational(rational(value), rounding.decimals))))
      : exactValue(roundRational(rational(total.amount), rounding.decimals));
    reported.push({ currency: total.currency, exactAmount: total.amount, amount: new D(amount).toFixed(rounding.decimals) });
  }
  const partial = result.status === "unresolved" || result.status === "error" || result.questions.length > 0;
  const label = partial ? "identified subtotal, scope incomplete" : "included-scope total";
  const body = `**Requested report precision — half-up per ${rounding.stage}, ${rounding.decimals} decimal places**\n\n| Currency | Exact ${label} | Reported ${label} |\n|---|---:|---:|\n${reported.map(row => `| ${row.currency} | ${money(row.currency, row.exactAmount)} | ${row.currency} ${row.amount} |`).join("\n")}\n\nReporting precision only. Source arithmetic, invoice rules, saved baselines and comparisons retain their exact amounts.\n\n${result.body}`;
  return { ...result, body, reporting: { ...rounding, status: "reported", totals: reported } };
}
