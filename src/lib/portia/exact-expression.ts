import {
  addRational, compareRational, divideRational, exactValue, multiplyRational,
  rational, roundRational, subtractRational, type ExactRational,
} from "./fx-conversion";

type Token = { kind: "number" | "name" | "symbol" | "end"; text: string };
const MAX_DIGITS = 4096;

function bounded(value: ExactRational): ExactRational {
  if (value.numerator.toString().length + value.denominator.toString().length > MAX_DIGITS) {
    throw new Error("Exact arithmetic exceeded its size bound.");
  }
  return value;
}

/** Exact evaluator for server-owned supplied billing recipes. No floating-point
 * extension or intermediate decimal rounding enters a saved monetary result. */
export function calculateExactExpression(expression: string): string {
  if (!expression.length || expression.length > 32_000) throw new Error("Exact expression exceeds its size bound.");
  const tokens: Token[] = [];
  const pattern = /\s*(?:(\d+(?:\.\d*)?(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)|([a-z]+)|(\*\*|[+\-*/(),]))/iy;
  let offset = 0;
  while (offset < expression.length) {
    pattern.lastIndex = offset;
    const match = pattern.exec(expression);
    if (!match) {
      if (!expression.slice(offset).trim()) break;
      throw new Error("Unsupported exact expression.");
    }
    offset = pattern.lastIndex;
    tokens.push({ kind: match[1] ? "number" : match[2] ? "name" : "symbol", text: match[1] ?? match[2] ?? match[3] });
    if (tokens.length > 1024) throw new Error("Exact expression is too complex.");
  }
  tokens.push({ kind: "end", text: "" });
  let position = 0, depth = 0;
  const peek = () => tokens[position];
  const take = (expected?: string) => {
    const token = tokens[position++];
    if (!token || expected !== undefined && token.text !== expected) throw new Error("Invalid exact expression.");
    return token;
  };
  const integer = (value: ExactRational) => {
    if (value.denominator !== BigInt(1)) throw new Error("Expected an integer.");
    return value.numerator;
  };
  const atom = (): ExactRational => {
    if (++depth > 128) throw new Error("Exact expression nesting limit.");
    try {
      const token = take();
      if (token.kind === "number") return rational(token.text.startsWith(".") ? "0" + token.text : token.text);
      if (token.text === "(") { const value = expressionValue(); take(")"); return value; }
      if (token.kind !== "name") throw new Error("Invalid exact expression.");
      take("(");
      const args: ExactRational[] = [];
      do { args.push(expressionValue()); if (peek().text !== ",") break; take(","); } while (args.length < 20);
      take(")");
      if (["min", "max"].includes(token.text) && args.length) {
        return args.reduce((best, item) => (compareRational(item, best) < 0) === (token.text === "min") ? item : best);
      }
      if (["ceil", "floor"].includes(token.text) && args.length === 1) {
        const { numerator: n, denominator: d } = args[0];
        const truncated = n / d;
        return rational((truncated + (n % d && (token.text === "ceil" ? n > 0 : n < 0) ? token.text === "ceil" ? BigInt(1) : BigInt(-1) : BigInt(0))).toString());
      }
      if (token.text === "round" && args.length >= 1 && args.length <= 2) {
        const places = args[1] ? integer(args[1]) : BigInt(0);
        if (places < 0 || places > 8) throw new Error("Rounding precision outside supported range.");
        return roundRational(args[0], Number(places));
      }
      throw new Error("Unsupported exact arithmetic function.");
    } finally { depth--; }
  };
  const power = (): ExactRational => {
    const base = atom();
    if (peek().text !== "**") return base;
    take("**");
    const exponent = integer(factor());
    if (exponent < -12 || exponent > 12 || !base.numerator && !exponent) throw new Error("Unsupported exact exponent.");
    const n = exponent < 0 ? -exponent : exponent;
    const value = bounded({ numerator: base.numerator ** n, denominator: base.denominator ** n });
    return exponent < 0 ? divideRational(rational("1"), value) : value;
  };
  const factor = (): ExactRational => {
    if (peek().text === "+" || peek().text === "-") {
      const sign = take().text, value = factor();
      return sign === "-" ? { ...value, numerator: -value.numerator } : value;
    }
    return power();
  };
  const term = (): ExactRational => {
    let value = factor();
    while (peek().text === "*" || peek().text === "/") {
      const operator = take().text, right = factor();
      value = bounded(operator === "*" ? multiplyRational(value, right) : divideRational(value, right));
    }
    return value;
  };
  const expressionValue = (): ExactRational => {
    let value = term();
    while (peek().text === "+" || peek().text === "-") {
      const operator = take().text, right = term();
      value = bounded(operator === "+" ? addRational(value, right) : subtractRational(value, right));
    }
    return value;
  };
  const result = expressionValue();
  if (peek().kind !== "end") throw new Error("Unexpected exact expression suffix.");
  if (compareRational(result, rational("1e18")) > 0 || compareRational(result, rational("-1e18")) < 0) {
    throw new Error("Exact monetary result exceeds supported range.");
  }
  return exactValue(result);
}
