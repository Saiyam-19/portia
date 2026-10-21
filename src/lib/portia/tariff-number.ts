import {
  addRational, compareRational, divideRational, exactValue, finiteDecimal,
  multiplyRational, rational, subtractRational, type ExactRational,
} from "./fx-conversion";

type Value = TariffNumber | ExactRational | string | number;
const MAX_DIGITS = 4096;
function checked(value: ExactRational): ExactRational {
  if (value.numerator.toString().length + value.denominator.toString().length > MAX_DIGITS) throw new Error("Exact tariff arithmetic exceeds its size bound.");
  return value;
}

/** Exact arithmetic for source-owned tariff formulas. There is no precision
 * setting and no implicit monetary rounding. Formatting may pad zeroes but
 * refuses to discard digits; only explicit source ceil/floor changes values. */
export class TariffNumber {
  private readonly value: ExactRational;
  constructor(value: Value) {
    if (value instanceof TariffNumber) this.value = value.value;
    else if (typeof value === "object") this.value = checked(divideRational(rational(value.numerator.toString()), rational(value.denominator.toString())));
    else {
      if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Invalid tariff number.");
      const text = String(value);
      this.value = checked(rational(text.startsWith(".") ? "0" + text : text.startsWith("-.") ? "-0" + text.slice(1) : text));
    }
  }
  plus(value: Value) { return new TariffNumber(checked(addRational(this.value, new TariffNumber(value).value))); }
  minus(value: Value) { return new TariffNumber(checked(subtractRational(this.value, new TariffNumber(value).value))); }
  mul(value: Value) { return new TariffNumber(checked(multiplyRational(this.value, new TariffNumber(value).value))); }
  div(value: Value) { return new TariffNumber(checked(divideRational(this.value, new TariffNumber(value).value))); }
  eq(value: Value) { return compareRational(this.value, new TariffNumber(value).value) === 0; }
  lt(value: Value) { return compareRational(this.value, new TariffNumber(value).value) < 0; }
  lte(value: Value) { return compareRational(this.value, new TariffNumber(value).value) <= 0; }
  gt(value: Value) { return compareRational(this.value, new TariffNumber(value).value) > 0; }
  isZero() { return this.value.numerator === BigInt(0); }
  isInteger() { return this.value.denominator === BigInt(1); }
  isFinite() { return true; } // Construction rejects zero denominators and nonfinite input.
  ceil() {
    const { numerator: n, denominator: d } = this.value;
    return new TariffNumber((n / d + (n > 0 && n % d !== BigInt(0) ? BigInt(1) : BigInt(0))).toString());
  }
  floor() {
    const { numerator: n, denominator: d } = this.value;
    return new TariffNumber((n / d - (n < 0 && n % d !== BigInt(0) ? BigInt(1) : BigInt(0))).toString());
  }
  private decimal() {
    const value = finiteDecimal(this.value);
    if (value === undefined) throw new Error("This tariff amount requires an exact fraction; no decimal rounding rule was supplied.");
    return value;
  }
  decimalPlaces() { return this.decimal().split(".")[1]?.length ?? 0; }
  toFixed(decimals: number) {
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DIGITS) throw new Error("Invalid exact tariff display precision.");
    const [whole, fraction = ""] = this.decimal().split(".");
    if (fraction.length > decimals) throw new Error("Exact tariff formatting cannot discard monetary digits.");
    return decimals ? `${whole}.${fraction.padEnd(decimals, "0")}` : whole;
  }
  toString() { return exactValue(this.value); }
  static sum(...values: Value[]) { return values.reduce<TariffNumber>((sum, value) => sum.plus(value), new TariffNumber(0)); }
  static min(...values: Value[]) {
    if (!values.length) throw new Error("A tariff minimum needs an operand.");
    return values.map(value => new TariffNumber(value)).reduce((best, value) => value.lt(best) ? value : best);
  }
  static max(...values: Value[]) {
    if (!values.length) throw new Error("A tariff maximum needs an operand.");
    return values.map(value => new TariffNumber(value)).reduce((best, value) => value.gt(best) ? value : best);
  }
}
