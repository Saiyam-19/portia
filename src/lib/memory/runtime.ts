import {checkedFacts,memorySummary} from "./format";
import { Bash, type IFileSystem } from "just-bash";
import type { MemoryFact, MemoryOperation } from "./contracts";
export const MEMORY_DATABASE_PATH = "/memory/long_term.sqlite";
// sqlite3 preflights formatted output at roughly 8x raw cell bytes. This
// accommodates 64 maximum-size facts; actual database results remain 256 KiB.
export const MEMORY_SQL_OUTPUT_BYTES = 1024 * 1024;
const DB = MEMORY_DATABASE_PATH;
const FACTS_SCHEMA = "CREATE TABLE facts (key TEXT PRIMARY KEY, value TEXT NOT NULL, sources TEXT NOT NULL)";
const quote = (s: string) => "'" + s.replaceAll("'", "''") + "'";
export class ChatMemoryRuntime {
  constructor(private shell = new Bash({
    cwd: "/memory", executionLimitProfile: "hardened",
    // Next.js dev hooks read the clock, track promises, and capture stack traces.
    // These host-runtime operations run while SQLite executes. Keep every
    // other defense active, including host filesystem and process.env guards.
    defenseInDepth: { enabled: true, excludeViolationTypes: process.env.NODE_ENV === "development" ? ["performance_timing", "weak_ref", "error_prepare_stack_trace"] : [] },
    executionLimits: { maxExecutionTimeMs: 10_000, maxSqliteTimeoutMs: 5000,
      maxDatabaseBytes: 256 * 1024, maxDatabaseResultBytes: 256 * 1024,
      maxFileSystemBytes: 1024 * 1024, maxOutputSize: MEMORY_SQL_OUTPUT_BYTES },
  }), private hostFs: IFileSystem = shell.fs) {}
  static async restore(image: string | null, host?: { shell: Bash; fs: IFileSystem }): Promise<ChatMemoryRuntime> {
    const runtime = new ChatMemoryRuntime(host?.shell, host?.fs);
    await runtime.hostFs.mkdir("/memory", { recursive: true });
    await runtime.hostFs.rm(DB, { recursive: true, force: true });
    if (image) {
      if (image.length > 700_000) throw new Error("MEMORY_TOO_LARGE");
      const data = JSON.parse(Buffer.from(image, "base64").toString("utf8"));
      if (data.format !== 2 || typeof data.sqlite !== "string") throw new Error("INVALID_MEMORY");
      const bytes = Buffer.from(data.sqlite, "base64");
      if (bytes.length > 256 * 1024 || bytes.subarray(0, 16).toString() !== "SQLite format 3\0") throw new Error("INVALID_MEMORY");
      await runtime.hostFs.writeFile(DB, bytes);
      await runtime.validateDatabase();
      if(JSON.stringify(checkedFacts(data.facts))!==JSON.stringify(await runtime.facts()))throw new Error("INVALID_MEMORY");
    } else {
      await runtime.sql("PRAGMA user_version=2; " + FACTS_SCHEMA + ";");
    }
    return runtime;
  }
  private async sql(source: string, json = false) {
    const result = await this.shell.exec("sqlite3", { args: [...(json ? ["-json"] : []), DB, source] });
    if (result.exitCode !== 0) throw new Error("Memory database operation failed.");
    return result.stdout;
  }
  async validateDatabase() {
    const bytes = await this.hostFs.readFileBuffer(DB);
    if (bytes.length > 256 * 1024 || Buffer.from(bytes.subarray(0, 16)).toString() !== "SQLite format 3\0" ||
      (await this.sql("PRAGMA integrity_check;")).trim() !== "ok" || (await this.sql("PRAGMA user_version;")).trim() !== "2") throw new Error("INVALID_MEMORY");
    const schema: unknown = JSON.parse(await this.sql("SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY name;", true));
    if (JSON.stringify(schema) !== JSON.stringify([
      { type: "table", name: "facts", tbl_name: "facts", sql: FACTS_SCHEMA },
      { type: "index", name: "sqlite_autoindex_facts_1", tbl_name: "facts", sql: null },
    ])) throw new Error("INVALID_MEMORY_SCHEMA");
  }
  async facts(options: { allowUnattributed?: boolean } = {}): Promise<MemoryFact[]> {
    const text = await this.sql("SELECT key,value,sources FROM facts ORDER BY key;", true);
    const rows = text.trim() ? JSON.parse(text) as {key: string; value: string; sources: string}[] : [];
    if (rows.length > 64) throw new Error("MEMORY_LIMIT");
    return checkedFacts(rows.map(row => ({ ...row, sources: JSON.parse(row.sources) })), options);
  }
  async apply(operations: MemoryOperation[]) {
    if (operations.length > 16) throw new Error("MEMORY_BATCH_LIMIT");
    for (const op of operations) {
      if (op.kind === "remember") {
        if (!/^[a-z][a-z0-9_]{0,79}$/.test(op.key) || Buffer.byteLength(op.value) > 1024 || op.value.includes("\0")) throw new Error("INVALID_MEMORY");
        const prior = (await this.facts()).find(f => f.key === op.key);
        const sources = prior?.value === op.value ? [...new Set([...prior.sources, op.source])] : [op.source];
        if (sources.length > 8 || (!prior && (await this.facts()).length >= 64)) throw new Error("MEMORY_LIMIT");
        await this.sql("INSERT INTO facts VALUES (" + [op.key,op.value,JSON.stringify(sources)].map(quote).join(",") +
          ") ON CONFLICT(key) DO UPDATE SET value=excluded.value,sources=excluded.sources;");
      } else if (op.kind === "forget") {
        await this.sql("PRAGMA secure_delete=ON; DELETE FROM facts WHERE key=" + quote(op.key) + "; VACUUM;");
      } else if (op.kind === "clear") {
        await this.sql("PRAGMA secure_delete=ON; DELETE FROM facts; VACUUM;");
      } else {
        const affected = (await this.facts()).filter(f => f.sources.includes(op.source));
        for (const fact of affected) {
          const sources = fact.sources.filter(s => s !== op.source);
          await this.sql("PRAGMA secure_delete=ON; " + (sources.length
            ? "UPDATE facts SET sources=" + quote(JSON.stringify(sources)) + " WHERE key=" + quote(fact.key)
            : "DELETE FROM facts WHERE key=" + quote(fact.key)) + ";");
        }
        await this.sql("VACUUM;");
      }
    }
  }
  async summary() {
    const summary = memorySummary(await this.facts());
    await this.hostFs.writeFile("/memory/summary.md", summary);
    return await this.hostFs.readFile("/memory/summary.md");
  }
  async workingNotes(markdown: string) {
    if (Buffer.byteLength(markdown) > 6000 || markdown.includes("\0")) throw new Error("INVALID_NOTES");
    await this.hostFs.mkdir("/scratchpad", { recursive: true });
    await this.hostFs.writeFile("/scratchpad/current.md", markdown);
    return await this.hostFs.readFile("/scratchpad/current.md");
  }
  async snapshot() {
    await this.validateDatabase();
    const data = JSON.stringify({ format: 2, facts: await this.facts(), sqlite: Buffer.from(await this.hostFs.readFileBuffer(DB)).toString("base64"), summary: await this.summary() });
    if (Buffer.byteLength(data) > 512 * 1024) throw new Error("MEMORY_TOO_LARGE");
    return Buffer.from(data).toString("base64");
  }
}
