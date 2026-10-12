import Decimal from "decimal.js";

const D = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -1_000,
  toExpPos: 1_000,
});

type Numeric = { value: Decimal; exponent?: number };
type Token = { type: "number" | "name" | "symbol" | "eof"; value: string };

const MAX_EXPRESSION_LENGTH = 2_000;
const MAX_NODES = 150;
const MAX_ABSOLUTE = new D("1e18");

function numeric(value: Decimal, exponent?: number): Numeric {
  if (!value.isFinite() || value.abs().gt(MAX_ABSOLUTE)) {
    throw new Error("Result outside supported range.");
  }
  const effectiveExponent = exponent ?? (value.isZero() ? 0 : -value.decimalPlaces());
  if (effectiveExponent < -100 || effectiveExponent > 100) {
    throw new Error("Decimal scale outside supported range.");
  }
  return { value, exponent };
}

function contextNumeric(value: Decimal, preferredExponent?: number): Numeric {
  const rounded = value.toSignificantDigits(40, Decimal.ROUND_HALF_EVEN);
  if (preferredExponent === undefined) return numeric(rounded);
  if (rounded.isZero()) return numeric(rounded, preferredExponent);
  const minimalExactExponent = -rounded.decimalPlaces();
  const precisionFloor = rounded.e - 39;
  const exponent = Math.max(Math.min(preferredExponent, minimalExactExponent), precisionFloor);
  return numeric(rounded, exponent);
}

function literal(raw: string): Numeric {
  const normalized = raw.replaceAll("_", "");
  const [coefficient, exponentText] = normalized.toLowerCase().split("e");
  const fractionalDigits = coefficient?.includes(".") ? coefficient.split(".")[1]!.length : 0;
  const exponent = Number(exponentText ?? "0") - fractionalDigits;
  if (!coefficient?.includes(".") && exponentText === undefined && /^0\d*[1-9]/.test(coefficient ?? "")) {
    throw new Error("Leading zeros in decimal integer literals are not permitted.");
  }
  if (!Number.isSafeInteger(exponent)) throw new Error("Decimal scale outside supported range.");
  return numeric(new D(normalized), exponent);
}

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\s*(?:(\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?(?:[eE][+-]?\d(?:_?\d)*)?|\.\d(?:_?\d)*(?:[eE][+-]?\d(?:_?\d)*)?)|([A-Za-z_]\w*)|(\*\*|[+\-*/(),]))/y;
  let index = 0;
  while (index < expression.length) {
    pattern.lastIndex = index;
    const match = pattern.exec(expression);
    if (!match) {
      if (/^\s*$/.test(expression.slice(index))) break;
      throw new Error("Use numbers, + - * / **, parentheses, ceil, floor, min, max or round only.");
    }
    index = pattern.lastIndex;
    if (match[1]) tokens.push({ type: "number", value: match[1] });
    else if (match[2]) tokens.push({ type: "name", value: match[2] });
    else tokens.push({ type: "symbol", value: match[3]! });
  }
  tokens.push({ type: "eof", value: "" });
  return tokens;
}

class Parser {
  private index = 0;
  private nodes = 1;

  constructor(private readonly tokens: Token[]) {}

  parse(): Numeric {
    const result = this.expression();
    if (this.peek().type !== "eof") this.invalid();
    return result;
  }

  private node(count = 1): void {
    this.nodes += count;
    if (this.nodes > MAX_NODES) throw new Error("Expression too complex.");
  }

  private peek(): Token {
    return this.tokens[this.index]!;
  }

  private take(value?: string): Token {
    const token = this.peek();
    if (value !== undefined && token.value !== value) this.invalid();
    this.index += 1;
    return token;
  }

  private invalid(): never {
    throw new Error("Use numbers, + - * / **, parentheses, ceil, floor, min, max or round only.");
  }

  private expression(): Numeric {
    let left = this.term();
    while (this.peek().value === "+" || this.peek().value === "-") {
      const operator = this.take().value;
      const right = this.term();
      this.node(2);
      left = contextNumeric(
        operator === "+" ? left.value.plus(right.value) : left.value.minus(right.value),
        left.exponent !== undefined && right.exponent !== undefined
          ? Math.min(left.exponent, right.exponent)
          : undefined,
      );
    }
    return left;
  }

  private term(): Numeric {
    let left = this.factor();
    while (this.peek().value === "*" || this.peek().value === "/") {
      const operator = this.take().value;
      const right = this.factor();
      this.node(2);
      if (operator === "/" && right.value.isZero()) {
        throw new Error("Invalid arithmetic (for example division by zero).");
      }
      left = operator === "*"
        ? contextNumeric(
            left.value.times(right.value),
            left.exponent !== undefined && right.exponent !== undefined
              ? left.exponent + right.exponent
              : undefined,
          )
        : contextNumeric(
            left.value.dividedBy(right.value),
            Math.min(
              (left.exponent ?? -left.value.decimalPlaces()) -
                (right.exponent ?? -right.value.decimalPlaces()),
              -left.value.dividedBy(right.value).decimalPlaces(),
            ),
          );
    }
    return left;
  }

  private factor(): Numeric {
    if (this.peek().value === "+" || this.peek().value === "-") {
      const operator = this.take().value;
      const operand = this.factor();
      this.node(2);
      return operator === "-"
        ? contextNumeric(operand.value.isZero() ? new D(0) : operand.value.negated(), operand.exponent)
        : numeric(operand.value, operand.exponent);
    }
    return this.power();
  }

  private power(): Numeric {
    const base = this.atom();
    if (this.peek().value !== "**") return base;
    this.take("**");
    const exponent = this.factor();
    this.node(2);
    if (!exponent.value.isInteger() || exponent.value.abs().gt(12)) {
      throw new Error("Unsupported operator.");
    }
    const integerExponent = exponent.value.toNumber();
    if (base.value.isZero() && integerExponent === 0) {
      throw new Error("Invalid arithmetic (for example division by zero).");
    }
    return contextNumeric(
      base.value.pow(integerExponent),
      integerExponent >= 0 && base.exponent !== undefined
        ? base.exponent * integerExponent
        : undefined,
    );
  }

  private atom(): Numeric {
    const token = this.peek();
    if (token.type === "number") {
      this.take();
      this.node();
      return literal(token.value);
    }
    if (token.value === "(") {
      this.take("(");
      const value = this.expression();
      this.take(")");
      return value;
    }
    if (token.type === "name") return this.call();
    return this.invalid();
  }

  private call(): Numeric {
    const name = this.take().value;
    this.take("(");
    const args: Numeric[] = [];
    if (this.peek().value !== ")") {
      do {
        args.push(this.expression());
        if (this.peek().value !== ",") break;
        this.take(",");
        if (this.peek().value === ")") break;
      } while (true);
    }
    this.take(")");
    this.node(3);

    if ((name === "ceil" || name === "floor") && args.length === 1) {
      return contextNumeric(args[0]!.value.toDecimalPlaces(0, name === "ceil" ? Decimal.ROUND_CEIL : Decimal.ROUND_FLOOR), 0);
    }
    if ((name === "min" || name === "max") && args.length >= 1 && args.length <= 20) {
      return args.reduce((selected, candidate) => {
        const compare = candidate.value.comparedTo(selected.value);
        return name === "min" ? (compare < 0 ? candidate : selected) : (compare > 0 ? candidate : selected);
      });
    }
    if (name === "round" && (args.length === 1 || args.length === 2)) {
      const places = args[1]?.value ?? new D(0);
      if (places.isInteger() && places.gte(0) && places.lte(8)) {
        const count = places.toNumber();
        return numeric(args[0]!.value.toDecimalPlaces(count, Decimal.ROUND_HALF_UP), -count);
      }
    }
    return this.invalid();
  }
}

export function calculateTariffExpression(expression: string): string {
  if (expression.length > MAX_EXPRESSION_LENGTH) throw new Error("Expression too long.");
  const result = new Parser(tokenize(expression)).parse();
  if (result.exponent !== undefined && result.exponent < 0) {
    const output = result.value.toFixed(-result.exponent);
    return result.value.isZero() && result.value.isNegative() ? `-${output}` : output;
  }
  const output = result.value.toFixed();
  return result.value.isZero() && result.value.isNegative() ? `-${output}` : output;
}
