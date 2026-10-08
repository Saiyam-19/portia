"""Bounded arithmetic only: no Python execution, names, files, or network."""
import ast
from decimal import Decimal, InvalidOperation, localcontext, ROUND_CEILING, ROUND_FLOOR, ROUND_HALF_UP


def calculate(expression: str) -> str:
    if len(expression) > 2000:
        raise ValueError("Expression too long.")
    tree = ast.parse(expression, mode="eval")
    if len(list(ast.walk(tree))) > 150:
        raise ValueError("Expression too complex.")

    def bounded(value):
        if not value.is_finite() or abs(value) > Decimal("1e18"):
            raise ValueError("Result outside supported range.")
        if not -100 <= value.as_tuple().exponent <= 100:
            raise ValueError("Decimal scale outside supported range.")
        return value

    def evaluate(node):
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            return bounded(Decimal(ast.get_source_segment(expression, node).replace("_", "")))
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            value = evaluate(node.operand)
            return value if isinstance(node.op, ast.UAdd) else -value
        if isinstance(node, ast.BinOp):
            left, right = evaluate(node.left), evaluate(node.right)
            if isinstance(node.op, ast.Add):
                result = left + right
            elif isinstance(node.op, ast.Sub):
                result = left - right
            elif isinstance(node.op, ast.Mult):
                result = left * right
            elif isinstance(node.op, ast.Div):
                result = left / right
            elif isinstance(node.op, ast.Pow) and right == int(right) and abs(right) <= 12:
                result = left ** int(right)
            else:
                raise ValueError("Unsupported operator.")
            return bounded(result)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and not node.keywords:
            args = [evaluate(arg) for arg in node.args]
            name = node.func.id
            if name in {"ceil", "floor"} and len(args) == 1:
                return args[0].to_integral_value(rounding=ROUND_CEILING if name == "ceil" else ROUND_FLOOR)
            if name in {"min", "max"} and 1 <= len(args) <= 20:
                return (min if name == "min" else max)(args)
            if name == "round" and 1 <= len(args) <= 2:
                places = args[1] if len(args) == 2 else Decimal(0)
                if places == int(places) and 0 <= places <= 8:
                    return bounded(args[0].quantize(Decimal(1).scaleb(-int(places)), rounding=ROUND_HALF_UP))
        raise ValueError("Use numbers, + - * / **, parentheses, ceil, floor, min, max or round only.")

    try:
        with localcontext() as context:
            context.prec = 40
            return format(evaluate(tree.body), "f")
    except (ArithmeticError, InvalidOperation) as exc:
        raise ValueError("Invalid arithmetic (for example division by zero).") from exc
