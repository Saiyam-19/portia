import {checkedFacts,memorySummary} from "./format";
import { Bash } from "just-bash";
import type { MemoryFact, MemoryOperation } from "./contracts";
const DB = "/memory/long_term.sqlite";
const quote = (s: string) => "'" + s.replaceAll("'", "''") + "'";
export class ChatMemoryRuntime {
  private shell = new Bash({
    commands: ["sqlite3"],
    cwd: "/memory", executionLimitProfile: "hardened",
    executionLimits: { maxExecutionTimeMs: 10_000, maxSqliteTimeoutMs: 5000,
      maxDatabaseBytes: 256 * 1024, maxDatabaseResultBytes: 256 * 1024,
      maxFileSystemBytes: 1024 * 1024, maxOutputSize: 256 * 1024 },
  });
  static async restore(image: string | null): Promise<ChatMemoryRuntime> {
    const runtime = new ChatMemoryRuntime();
    await runtime.shell.fs.mkdir("/memory", { recursive: true });
    if (image) {
      if (image.length > 700_000) throw new Error("MEMORY_TOO_LARGE");
      const data = JSON.parse(Buffer.from(image, "base64").toString("utf8"));
      if (data.format !== 2 || typeof data.sqlite !== "string") throw new Error("INVALID_MEMORY");
      const bytes = Buffer.from(data.sqlite, "base64");
      if (bytes.length > 256 * 1024 || bytes.subarray(0, 16).toString() !== "SQLite format 3\0") throw new Error("INVALID_MEMORY");
      await runtime.shell.fs.writeFile(DB, bytes);
      if ((await runtime.sql("PRAGMA quick_check;")).trim() !== "ok" || (await runtime.sql("PRAGMA user_version;")).trim() !== "2") throw new Error("INVALID_MEMORY");
      if(JSON.stringify(checkedFacts(data.facts))!==JSON.stringify(await runtime.facts()))throw new Error("INVALID_MEMORY");
    } else {
      await runtime.sql("PRAGMA user_version=2; CREATE TABLE facts (key TEXT PRIMARY KEY, value TEXT NOT NULL, sources TEXT NOT NULL);");
    }
    return runtime;
  }
  private async sql(source: string, json = false) {
    const result = await this.shell.exec("sqlite3", { args: [...(json ? ["-json"] : []), DB, source] });
    if (result.exitCode !== 0) throw new Error("Memory database operation failed.");
    return result.stdout;
  }
  async facts(): Promise<MemoryFact[]> {
    const text = await this.sql("SELECT key,value,sources FROM facts ORDER BY key;", true);
    const rows = text.trim() ? JSON.parse(text) as {key: string; value: string; sources: string}[] : [];
    if (rows.length > 64) throw new Error("MEMORY_LIMIT");
    return checkedFacts(rows.map(row => ({ ...row, sources: JSON.parse(row.sources) })));
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
    await this.shell.fs.writeFile("/memory/summary.md", summary);
    return await this.shell.fs.readFile("/memory/summary.md");
  }
  async workingNotes(markdown: string) {
    if (Buffer.byteLength(markdown) > 6000) throw new Error("NOTES_TOO_LARGE");
    await this.shell.fs.mkdir("/scratchpad", { recursive: true });
    await this.shell.fs.writeFile("/scratchpad/current.md", markdown);
    return await this.shell.fs.readFile("/scratchpad/current.md");
  }
  async snapshot() {
    const data = JSON.stringify({ format: 2, facts: await this.facts(), sqlite: Buffer.from(await this.shell.fs.readFileBuffer(DB)).toString("base64"), summary: await this.summary() });
    if (Buffer.byteLength(data) > 512 * 1024) throw new Error("MEMORY_TOO_LARGE");
    return Buffer.from(data).toString("base64");
  }
}
