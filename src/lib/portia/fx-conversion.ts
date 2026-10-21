export type ExactRational = { numerator: bigint; denominator: bigint };
export type SerializedRational = { numerator: string; denominator: string };

const gcd = (left: bigint, right: bigint): bigint => {
  let a = left < BigInt(0) ? -left : left, b = right < BigInt(0) ? -right : right;
  while (b) [a, b] = [b, a % b];
  return a || BigInt(1);
};

const normalize = (numerator: bigint, denominator: bigint): ExactRational => {
  if (!denominator) throw new Error("FX division by zero is not permitted.");
  const sign = denominator < BigInt(0) ? BigInt(-1) : BigInt(1), divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor * sign, denominator: denominator / divisor * sign };
};

export const rational = (value: string): ExactRational => {
  if (value.length > 8192) throw new Error("Exact arithmetic value exceeds its size bound.");
  const fraction = /^([+-]?\d+)\/([1-9]\d*)$/.exec(value);
  if (fraction) return normalize(BigInt(fraction[1]), BigInt(fraction[2]));
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(value);
  if (!match) throw new Error("Exact FX arithmetic requires a decimal value.");
  const sign = match[1] === "-" ? BigInt(-1) : BigInt(1), decimals = match[3] ?? "", exponent = Number(match[4] ?? 0);
  const scale = decimals.length - exponent;
  if (!Number.isSafeInteger(scale) || Math.abs(scale) > 4096) throw new Error("Exact decimal scale is out of bounds.");
  let numerator = BigInt(`${match[2]}${decimals}`) * sign, denominator = BigInt(1);
  if (scale >= 0) denominator = BigInt(10) ** BigInt(scale); else numerator *= BigInt(10) ** BigInt(-scale);
  return normalize(numerator, denominator);
};

export const addRational = (left: ExactRational, right: ExactRational): ExactRational =>
  normalize(left.numerator * right.denominator + right.numerator * left.denominator, left.denominator * right.denominator);
export const multiplyRational = (left: ExactRational, right: ExactRational): ExactRational =>
  normalize(left.numerator * right.numerator, left.denominator * right.denominator);
export const divideRational = (left: ExactRational, right: ExactRational): ExactRational =>
  normalize(left.numerator * right.denominator, left.denominator * right.numerator);
export const compareRational = (left: ExactRational, right: ExactRational): number => {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < BigInt(0) ? -1 : difference > BigInt(0) ? 1 : 0;
};
export const subtractRational = (left: ExactRational, right: ExactRational): ExactRational =>
  normalize(left.numerator * right.denominator - right.numerator * left.denominator, left.denominator * right.denominator);

export const roundRational = (value: ExactRational, decimals: number): ExactRational => {
  const scale = BigInt(10) ** BigInt(decimals), negative = value.numerator < BigInt(0), absolute = negative ? -value.numerator : value.numerator;
  let quotient = absolute * scale / value.denominator;
  const remainder = absolute * scale % value.denominator;
  if (remainder * BigInt(2) >= value.denominator) quotient += BigInt(1);
  return normalize(negative ? -quotient : quotient, scale);
};

export const finiteDecimal = (value: ExactRational): string | undefined => {
  let denominator = value.denominator, twos = 0, fives = 0;
  while (denominator % BigInt(2) === BigInt(0)) { denominator /= BigInt(2); twos++; }
  while (denominator % BigInt(5) === BigInt(0)) { denominator /= BigInt(5); fives++; }
  if (denominator !== BigInt(1)) return;
  const scale = Math.max(twos, fives), factor = BigInt(10) ** BigInt(scale) / value.denominator;
  const scaled = value.numerator * factor, negative = scaled < BigInt(0), digits = (negative ? -scaled : scaled).toString().padStart(scale + 1, "0");
  if (!scale) return `${negative ? "-" : ""}${digits}`;
  const whole = digits.slice(0, -scale), fraction = digits.slice(-scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
};

export const serializeRational = (value: ExactRational): SerializedRational => ({ numerator: value.numerator.toString(), denominator: value.denominator.toString() });

/** Internal monetary results retain a reduced fraction when no finite decimal exists.
 * User-facing price inputs remain decimal-only in their own schemas. */
export const exactValue = (value: ExactRational): string =>
  finiteDecimal(value) ?? `${value.numerator}/${value.denominator}`;

export const sumExact = (values: readonly string[]): string =>
  exactValue(values.map(rational).reduce(addRational, rational("0")));

export const sameExact = (left: string, right: string): boolean =>
  compareRational(rational(left), rational(right)) === 0;
