// Mirror the installed sqlite3 dispatch options, then inspect SQL tokens rather
// than shell source. Only successful, writable canonical-DB calls use this.
const FLAGS = new Set(["-list", "-csv", "-json", "-line", "-column", "-table", "-markdown", "-tabs", "-box", "-quote", "-html", "-ascii", "-header", "-noheader", "-bail", "-echo"]);
const VALUE_FLAGS = new Set(["-separator", "-newline", "-nullvalue", "-cmd"]);
type Token = { value: string; keyword: boolean };

function deletesFacts(tokens: Token[]) {
  const keyword = (index: number, value: string) => tokens[index]?.keyword && tokens[index].value === value;
  if (keyword(0, "explain")) return false;
  const deletion = keyword(0, "delete") ? 0 : keyword(0, "with") ? tokens.findIndex(token => token.keyword && token.value === "delete") : -1;
  if (deletion < 0 || !keyword(deletion + 1, "from")) return false;
  const table = deletion + 2;
  if (tokens[table + 1]?.value === ".") return tokens[table]?.value === "main" && tokens[table + 2]?.value === "facts";
  return tokens[table]?.value === "facts";
}

function hasFactsDelete(sql: string) {
  if (sql.length > 1024 * 1024) throw new Error("MEMORY_SQL_SCAN_LIMIT");
  let tokens: Token[] = [];
  let count = 0;
  let depth = 0;
  let found = false;
  let rollback = false;
  const statement = () => {
    const keyword = (index: number, value: string) => tokens[index]?.keyword && tokens[index].value === value;
    if (keyword(0, "create") && (keyword(1, "trigger") || ((keyword(1, "temp") || keyword(1, "temporary")) && keyword(2, "trigger")))) throw new Error("MEMORY_SCHEMA_READ_ONLY");
    found ||= deletesFacts(tokens);
    rollback ||= tokens[0]?.keyword === true && tokens[0].value === "rollback";
    tokens = [];
  };
  const add = (value: string, keyword: boolean) => {
    if (++count > 65_536) throw new Error("MEMORY_SQL_SCAN_LIMIT");
    if (!depth) tokens.push({ value: value.toLowerCase(), keyword });
  };
  for (let index = 0; index < sql.length;) {
    const char = sql[index];
    if (/\s/.test(char)) { index++; continue; }
    if (sql.startsWith("--", index)) {
      const end = sql.indexOf("\n", index + 2);
      index = end < 0 ? sql.length : end + 1;
      continue;
    }
    if (sql.startsWith("/*", index)) {
      const end = sql.indexOf("*/", index + 2);
      index = end < 0 ? sql.length : end + 2;
      continue;
    }
    if (char === "'" || char === '"' || char === "`" || char === "[") {
      const endQuote = char === "[" ? "]" : char;
      let value = "";
      index++;
      while (index < sql.length) {
        if (sql[index] === endQuote) {
          index++;
          if (char !== "[" && sql[index] === endQuote) { value += endQuote; index++; continue; }
          break;
        }
        value += sql[index++];
      }
      add(value, false);
      continue;
    }
    if (char === "(") { if (++depth > 64) throw new Error("MEMORY_SQL_SCAN_LIMIT"); index++; continue; }
    if (char === ")") { depth--; index++; continue; }
    if (char === ";" && !depth) {
      statement();
      index++;
      continue;
    }
    if (/[a-zA-Z_\u0080-\uFFFF]/.test(char)) {
      const start = index++;
      while (index < sql.length && /[a-zA-Z0-9_$\u0080-\uFFFF]/.test(sql[index])) index++;
      add(sql.slice(start, index), true);
    } else { add(char, false); index++; }
  }
  statement();
  // A rollback may undo the requested deletion. Reject the whole invocation
  // rather than pretending to resolve transaction/savepoint semantics here.
  if (found && rollback) throw new Error("MEMORY_DELETE_WITH_ROLLBACK");
  return found;
}

export function sqliteDeletesFacts(args: string[], stdin: string, resolve: (database: string) => string) {
  if (args.includes("--help") || args.includes("-help")) return false;
  let database: string | undefined;
  let sql: string | undefined;
  let command: string | undefined;
  let endOfOptions = false;
  let readonly = false;
  let version = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!endOfOptions && arg === "--") { endOfOptions = true; continue; }
    if (!endOfOptions && arg.startsWith("-")) {
      if (arg === "-readonly") readonly = true;
      else if (arg === "-version") version = true;
      else if (VALUE_FLAGS.has(arg)) { const value = args[++index]; if (arg === "-cmd") command = value; }
      else if (!FLAGS.has(arg)) return false;
    } else if (database === undefined) database = arg;
    else if (sql === undefined) sql = arg;
  }
  if (readonly || version || !database || resolve(database) !== "/memory/long_term.sqlite") return false;
  const input = sql || stdin.trim();
  return hasFactsDelete(command ? `${command}; ${input}` : input);
}
