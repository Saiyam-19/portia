import type { FileContent, IFileSystem, InMemoryFs } from "just-bash";

export const MEMORY_DIR = "/memories";
export const NOTES_PATH = "/notes/current.md";
const MAX_ENTRIES = 1024;
const MAX_SCRATCH_BYTES = 1024 * 1024;
const MAX_MEMORY_FILE_BYTES = 4096;
const MAX_NOTES_BYTES = 8000;

const isScratch = (path: string) => path.startsWith("/tmp/") || path.startsWith("/work/");
const isMemory = (path: string) => path.startsWith(`${MEMORY_DIR}/`);

/**
 * The write boundary between a command and the workspace. Commands get this
 * wrapper; the host keeps the underlying filesystem to restore canonical state.
 * Tariffs and mount points are immutable; memory, notes and scratch are writable
 * within size limits, and links are disabled.
 */
export class WorkspaceFileSystem implements IFileSystem {
  private tail: Promise<unknown> = Promise.resolve();
  private violation: string | undefined;
  constructor(private readonly inner: InMemoryFs) {}
  clearViolation() { this.violation = undefined; }
  assertNoViolation() { if (this.violation) throw new Error(this.violation); }
  private denied(message: string): never {
    this.violation = message;
    throw new Error(message);
  }

  private path(input: string) {
    if (input.includes("\0") || input.length > 1024 || input.split("/").length > 64) this.denied("EACCES: invalid workspace path");
    return this.inner.resolvePath("/", input);
  }
  private writable(input: string) {
    const path = this.path(input);
    if (path !== NOTES_PATH && !isMemory(path) && !isScratch(path)) this.denied(`EROFS: read-only path '${path}'`);
    return path;
  }
  private directory(input: string) {
    const path = this.writable(input);
    if (isMemory(path) && path.slice(MEMORY_DIR.length + 1).includes("/")) this.denied(`EACCES: memory folders are one level deep '${path}'`);
    return path;
  }
  private mutate(action: () => Promise<void>) {
    const next = this.tail.then(action);
    this.tail = next.catch(() => undefined);
    return next;
  }
  private capacity(paths: string[]) {
    const entries = new Set(this.inner.getAllPaths());
    for (const path of paths) {
      let current = this.path(path);
      while (current !== "/") {
        entries.add(current);
        current = current.slice(0, current.lastIndexOf("/")) || "/";
      }
    }
    if (entries.size > MAX_ENTRIES - 16) throw new Error("ENOSPC: workspace entry limit exceeded");
  }
  private async scratchBytes() {
    let bytes = 0;
    for (const path of this.inner.getAllPaths().filter(isScratch)) bytes += (await this.inner.stat(path)).size;
    return bytes;
  }
  private async size(path: string) {
    return await this.inner.exists(path) ? (await this.inner.stat(path)).size : 0;
  }
  private contentBytes(content: FileContent, options?: Parameters<IFileSystem["writeFile"]>[2]) {
    if (content instanceof Uint8Array) return content.byteLength;
    const encoding = typeof options === "string" ? options : options?.encoding;
    if (encoding === "hex") return Math.floor(content.length / 2);
    if (encoding === "base64") return Math.ceil(content.length * 3 / 4);
    if (encoding === "binary" || encoding === "latin1") return content.length;
    return new TextEncoder().encode(content).byteLength;
  }
  private async contentCapacity(path: string, bytes: number) {
    const limit = path === NOTES_PATH ? MAX_NOTES_BYTES : isMemory(path) ? MAX_MEMORY_FILE_BYTES : MAX_SCRATCH_BYTES;
    if (bytes > limit) throw new Error(`ENOSPC: '${path}' would exceed ${limit} bytes`);
    if (isScratch(path) && await this.scratchBytes() - await this.size(path) + bytes > MAX_SCRATCH_BYTES) throw new Error("ENOSPC: scratch space is full");
    this.capacity([path]);
  }

  readFile: IFileSystem["readFile"] = (...args) => this.inner.readFile(...args);
  readFileBytes: NonNullable<IFileSystem["readFileBytes"]> = path => this.inner.readFileBytes(path);
  readFileBuffer: IFileSystem["readFileBuffer"] = async path => (await this.inner.readFileBuffer(path)).slice();
  exists: IFileSystem["exists"] = path => this.inner.exists(path);
  stat: IFileSystem["stat"] = path => this.inner.stat(path);
  lstat: IFileSystem["lstat"] = path => this.inner.lstat(path);
  readdir: IFileSystem["readdir"] = path => this.inner.readdir(path);
  readdirWithFileTypes: NonNullable<IFileSystem["readdirWithFileTypes"]> = path => this.inner.readdirWithFileTypes(path);
  readlink: IFileSystem["readlink"] = path => this.inner.readlink(path);
  realpath: IFileSystem["realpath"] = path => this.inner.realpath(path);
  resolvePath: IFileSystem["resolvePath"] = (...args) => this.inner.resolvePath(...args);
  getAllPaths = () => this.inner.getAllPaths();

  writeFile: IFileSystem["writeFile"] = (input, content, options) => this.mutate(async () => {
    const path = this.writable(input);
    await this.contentCapacity(path, this.contentBytes(content, options));
    await this.inner.writeFile(path, content, options);
  });
  appendFile: IFileSystem["appendFile"] = (input, content, options) => this.mutate(async () => {
    const path = this.writable(input);
    await this.contentCapacity(path, await this.size(path) + this.contentBytes(content, options));
    await this.inner.appendFile(path, content, options);
  });
  mkdir: IFileSystem["mkdir"] = (input, options) => this.mutate(async () => {
    const existing = this.path(input);
    if (options?.recursive && await this.inner.exists(existing) && (await this.inner.stat(existing)).isDirectory) return;
    const path = this.directory(input);
    this.capacity([path]);
    await this.inner.mkdir(path, options);
  });
  createExclusive: NonNullable<IFileSystem["createExclusive"]> = (input, options) => this.mutate(async () => {
    const path = options.directory ? this.directory(input) : this.writable(input);
    this.capacity([path]);
    await this.inner.createExclusive(path, options);
  });
  rm: IFileSystem["rm"] = (input, options) => this.mutate(async () => {
    const path = this.writable(input);
    await this.inner.rm(path, options);
  });
  cp: IFileSystem["cp"] = (source, destination, options) => this.mutate(async () => {
    const src = this.path(source), dest = this.writable(destination);
    const stat = await this.inner.stat(src);
    if (stat.isDirectory) {
      if (!isScratch(dest)) this.denied(`EACCES: copy directories into /work or /tmp only '${dest}'`);
      const descendants = this.inner.getAllPaths().filter(path => path === src || path.startsWith(src === "/" ? "/" : `${src}/`));
      this.capacity(descendants.map(path => dest + (src === "/" && path !== "/" ? `/${path.slice(1)}` : path.slice(src.length))));
      let bytes = 0;
      for (const path of descendants) bytes += (await this.inner.stat(path)).size;
      if (await this.scratchBytes() + bytes > MAX_SCRATCH_BYTES) throw new Error("ENOSPC: scratch space is full");
    } else {
      const actual = await this.inner.exists(dest) && (await this.inner.stat(dest)).isDirectory ? `${dest}/${src.split("/").at(-1)}` : dest;
      await this.contentCapacity(this.writable(actual), stat.size);
    }
    await this.inner.cp(src, dest, options);
  });
  mv: IFileSystem["mv"] = (source, destination) => this.mutate(async () => {
    const src = this.writable(source), dest = this.writable(destination);
    const stat = await this.inner.stat(src);
    if (stat.isDirectory) {
      this.directory(dest);
      this.capacity(this.inner.getAllPaths().filter(path => path === src || path.startsWith(`${src}/`)).map(path => dest + path.slice(src.length)));
    } else {
      const actual = await this.inner.exists(dest) && (await this.inner.stat(dest)).isDirectory ? `${dest}/${src.split("/").at(-1)}` : dest;
      await this.contentCapacity(this.writable(actual), stat.size);
    }
    await this.inner.mv(src, dest);
  });
  chmod: IFileSystem["chmod"] = (input, mode) => this.mutate(() => this.inner.chmod(this.writable(input), mode));
  utimes: IFileSystem["utimes"] = (input, atime, mtime) => this.mutate(() => this.inner.utimes(this.writable(input), atime, mtime));
  symlink: IFileSystem["symlink"] = async () => this.denied("EACCES: links are disabled");
  link: IFileSystem["link"] = async () => this.denied("EACCES: links are disabled");
}
