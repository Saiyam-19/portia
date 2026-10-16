import { Bash } from "just-bash";
export type Operation =
  | { kind: "put"; key: string; value: string; source: string }
  | { kind: "forget"; key: string }
  | { kind: "scratchpad"; key: string; value: string };
export type Fact = { key: string; value: string; source: string };
export const MAX_SNAPSHOT_BYTES = 512 * 1024;
const DATABASE = "/memory/long_term.sqlite";
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
function validKey(key: string) {
  if (!identifier.test(key)) throw new Error("INVALID_KEY");
}
function validText(value: string, max = 4096) {
  if (typeof value !== "string" || Buffer.byteLength(value) > max || value.includes("\0")) throw new Error("INVALID_TEXT");
}

/** One disposable, server-owned workspace. Never receives host credentials or disk mounts. */
export class MemoryRuntime {
  private bash = new Bash({
    commands: ["sqlite3"],
    cwd: "/memory",
    executionLimitProfile: "hardened",
    executionLimits: {
      maxExecutionTimeMs: 10_000, maxSqliteTimeoutMs: 5000,
      maxDatabaseBytes: 256 * 1024, maxDatabaseResultBytes: 256 * 1024,
      maxFileSystemBytes: 1024 * 1024, maxOutputSize: 256 * 1024,
    },
  });
  private scratchpads: Record<string, string> = Object.create(null);

  static async restore(snapshot: ArrayBuffer | null = null): Promise<MemoryRuntime> {
    const runtime = new MemoryRuntime();
    await runtime.bash.fs.mkdir("/memory", { recursive: true });
    await runtime.bash.fs.mkdir("/scratchpads", { recursive: true });
    if (snapshot !== null) {
      if (snapshot.byteLength > MAX_SNAPSHOT_BYTES || !snapshot.byteLength) throw new Error("INVALID_SNAPSHOT");
      const data = JSON.parse(Buffer.from(snapshot).toString("utf8"));
      if (data.format !== 1 || typeof data.sqlite !== "string" || !data.scratchpads ||
          typeof data.scratchpads !== "object" || Array.isArray(data.scratchpads)) throw new Error("INVALID_SNAPSHOT");
      const bytes = Buffer.from(data.sqlite, "base64");
      if (bytes.length > 256 * 1024 || bytes.subarray(0, 16).toString() !== "SQLite format 3\0") throw new Error("INVALID_SQLITE");
      await runtime.bash.fs.writeFile(DATABASE, bytes);
      if ((await runtime.sql("PRAGMA quick_check;")).trim() !== "ok" ||
          (await runtime.sql("PRAGMA user_version;")).trim() !== "1") throw new Error("INVALID_SQLITE");
      const entries = Object.entries(data.scratchpads);
      if (entries.length > 16) throw new Error("TOO_MANY_SCRATCHPADS");
      for (const [key, value] of entries) {
        validKey(key); validText(value as string);
        runtime.scratchpads[key] = value as string;
        await runtime.bash.fs.writeFile("/scratchpads/" + key + ".md", value as string);
      }
    } else {
      await runtime.sql("PRAGMA user_version=1; CREATE TABLE facts (key TEXT PRIMARY KEY, value TEXT NOT NULL, source TEXT NOT NULL); CREATE TABLE tombstones (key TEXT PRIMARY KEY);");
    }
    await runtime.refreshSummary();
    return runtime;
  }

  private async sql(sql: string, json = false): Promise<string> {
    const result = await this.bash.exec("sqlite3", { args: [...(json ? ["-json"] : []), DATABASE, sql] });
    if (result.exitCode !== 0) throw new Error("SQLITE_ERROR: " + result.stderr.slice(0, 300));
    return result.stdout;
  }

  async apply(operations: Operation[]): Promise<void> {
    if (operations.length > 16) throw new Error("BATCH_TOO_LARGE");
    for (const op of operations) {
      validKey(op.key);
      if (op.kind === "put") {
        validText(op.value, 1024); validText(op.source, 512);
        if ((await this.sql("SELECT count(*) FROM tombstones WHERE key=" + quote(op.key))).trim() !== "0") throw new Error("FORGOTTEN_KEY");
        await this.sql("INSERT INTO facts VALUES (" + [op.key, op.value, op.source].map(quote).join(",") +
          ") ON CONFLICT(key) DO UPDATE SET value=excluded.value, source=excluded.source;");
      } else if (op.kind === "forget") {
        await this.sql("PRAGMA secure_delete=ON; BEGIN; DELETE FROM facts WHERE key=" + quote(op.key) +
          "; INSERT OR IGNORE INTO tombstones VALUES (" + quote(op.key) + "); COMMIT; VACUUM;");
        // Free-form prose has no reliable provenance map yet: invalidate all hot scratchpads.
        for (const key of Object.keys(this.scratchpads)) await this.bash.fs.rm("/scratchpads/" + key + ".md");
        this.scratchpads = Object.create(null);
      } else if (op.kind === "scratchpad") {
        validText(op.value);
        if (!(op.key in this.scratchpads) && Object.keys(this.scratchpads).length >= 16) throw new Error("TOO_MANY_SCRATCHPADS");
        this.scratchpads[op.key] = op.value;
        await this.bash.fs.writeFile("/scratchpads/" + op.key + ".md", op.value);
      } else {
        throw new Error("INVALID_OPERATION");
      }
    }
    await this.refreshSummary();
  }

  async recall(): Promise<Fact[]> {
    const output = await this.sql("SELECT key,value,source FROM facts ORDER BY key;", true);
    return output.trim() ? JSON.parse(output) : [];
  }
  private async refreshSummary() {
    const facts = await this.recall();
    const body = "# Memory summary\n\n" + facts.map(f => "- " + JSON.stringify(f)).join("\n") + "\n";
    // Deterministic bounded projection for prototype; this is not model summarization.
    await this.bash.fs.writeFile("/memory/summary.md", body.slice(0, 8000));
  }
  async readFile(path: string): Promise<string> {
    if (path !== "/memory/summary.md" && !/^\/scratchpads\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}\.md$/.test(path)) throw new Error("INVALID_PATH");
    return this.bash.fs.readFile(path);
  }
  async checkpoint(): Promise<ArrayBuffer> {
    const sqlite = Buffer.from(await this.bash.fs.readFileBuffer(DATABASE)).toString("base64");
    const bytes = new TextEncoder().encode(JSON.stringify({
      format: 1, sqlite, summary: await this.readFile("/memory/summary.md"), scratchpads: this.scratchpads,
    }));
    if (bytes.byteLength > MAX_SNAPSHOT_BYTES) throw new Error("SNAPSHOT_TOO_LARGE");
    return bytes.buffer;
  }
}
