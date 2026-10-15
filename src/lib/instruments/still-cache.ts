/** Disposable picture evidence. A missing/unverifiable dependency is always a miss. */
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { renderAssetFiles } from "../local-store/render-assets";
import { projectsRoot } from "../local-store/paths";
import type { BrowserStillOptions } from "../render/browser-renderer";

const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

export async function readVerifiedStillEnvironment(baseUrl: string, root: string): Promise<{ runtimeId: string | null } | null> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/render-cache-environment`, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!response.ok) return null;
    const value = await response.json();
    return value.protocol === 1 && value.roots === sha(JSON.stringify([root, projectsRoot()]))
      ? { runtimeId: typeof value.runtime_id === 'string' ? value.runtime_id : null } : null;
  } catch { return null; }
}
export async function verifyStillCacheEnvironment(baseUrl: string, root: string): Promise<boolean> {
  return Boolean(await readVerifiedStillEnvironment(baseUrl, root));
}

/** Per-invocation memo only. Content is hashed again on the next invocation. */
export function createStillDependencyHasher(root: string, options: { reuseDirectoryListings?: boolean } = {}) {
  const hashes = new Map<string, { stat: string; hash: string }>();
  const directories = new Map<string, { stamp: string; entries: fs.Dirent[] }>();
  const stats = { directoryReads: 0, directoryReuses: 0 };
  function fileHash(file: string) {
    const stamp = () => { const s = fs.statSync(file, { bigint: true }); return `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`; };
    const before = stamp(), old = hashes.get(file);
    if (old?.stat === before) return old.hash;
    const hash = createHash("sha256"), fd = fs.openSync(file, "r"), buffer = Buffer.alloc(1024 * 1024);
    try { let n; while ((n = fs.readSync(fd, buffer)) > 0) hash.update(buffer.subarray(0, n)); }
    finally { fs.closeSync(fd); }
    if (stamp() !== before) throw new Error("Dependency changed while hashing");
    const value = hash.digest("hex"); hashes.set(file, { stat: before, hash: value }); return value;
  }
  function tree(dir: string, result: string[]) {
    let entries: fs.Dirent[];
    if (options.reuseDirectoryListings === false) {
      // Exact original traversal for the benchmark/recovery arm: no added
      // directory-stat work that could make the baseline artificially slower.
      entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
      stats.directoryReads++;
    } else {
      const stamp = () => { const s = fs.statSync(dir, { bigint: true }); return `${s.dev}:${s.ino}:${s.mtimeNs}:${s.ctimeNs}`; };
      const before = stamp(), cached = directories.get(dir);
      if (cached?.stamp === before) {
        entries = cached.entries;
        stats.directoryReuses++;
      } else {
        entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
        stats.directoryReads++;
        if (stamp() !== before) throw new Error("Directory changed while listing dependencies");
        directories.set(dir, { stamp: before, entries });
      }
    }
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) tree(file, result);
      else if (entry.isFile()) result.push(file);
      else throw new Error("Untracked dependency type");
    }
  }
  const hash = (options: BrowserStillOptions): string | null => {
    try {
      const files: string[] = [];
      // Conservative first version: all composition code and public assets, not a guessed dependency graph.
      tree(path.join(root, "src"), files);
      tree(path.join(root, "public"), files);
      files.push(...["package.json", "pnpm-lock.yaml", "next.config.ts", "scripts/frame-state.ts"].map(p => path.join(root, p)));
      const origin = new URL(options.baseUrl).origin;
      if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname)) return null;
      files.push(...renderAssetFiles(options.inputProps, origin, path.join(root, "public")));
      return sha(JSON.stringify([...new Set(files)].sort().map(file => [file, fileHash(file)])));
    } catch { return null; }
  };
  return Object.assign(hash, { stats });
}

export function stillCacheKey(options: BrowserStillOptions, rendererHash: string | null, dependencyHash: string | null) {
  if (!rendererHash || !dependencyHash) return null;
  const { output: _output, ...render } = options;
  return sha(JSON.stringify({ schema: 1, rendererHash, dependencyHash, render }));
}

export function readStillCache(directory: string, key: string | null, output: string): boolean {
  if (!key || !/^[a-f0-9]{64}$/.test(key)) return false;
  try {
    const record = JSON.parse(fs.readFileSync(path.join(directory, `${key}.json`), "utf8"));
    const bytes = fs.readFileSync(path.join(directory, `${key}.png`));
    if (record.schema !== 1 || record.key !== key || record.sha256 !== sha(bytes)) return false;
    fs.writeFileSync(output, bytes);
    return true;
  } catch { return false; }
}

export function writeStillCache(directory: string, key: string | null, output: string) {
  if (!key || !/^[a-f0-9]{64}$/.test(key)) return;
  const temp = path.join(directory, `${key}-${randomUUID()}.partial`);
  try {
    fs.mkdirSync(directory, { recursive: true });
    const bytes = fs.readFileSync(output);
    fs.writeFileSync(temp, bytes);
    fs.renameSync(temp, path.join(directory, `${key}.png`));
    fs.writeFileSync(temp, JSON.stringify({ schema: 1, key, sha256: sha(bytes) }));
    fs.renameSync(temp, path.join(directory, `${key}.json`));
    // Bound only this disposable cache; never prune report evidence or project sources.
    const entries = fs.readdirSync(directory).filter(name => /^[a-f0-9]{64}\.png$/.test(name))
      .map(name => ({ name, stat: fs.statSync(path.join(directory, name)) })).sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs);
    let size = entries.reduce((total, entry) => total + entry.stat.size, 0);
    for (const entry of entries) {
      if (size <= 512 * 1024 * 1024) break;
      fs.rmSync(path.join(directory, entry.name), { force: true });
      fs.rmSync(path.join(directory, entry.name.replace(/\.png$/, ".json")), { force: true });
      size -= entry.stat.size;
    }
  } catch { /* Cache failure never turns a fresh verified capture into a failed instrument. */ }
  finally { try { fs.rmSync(temp, { force: true }); } catch { /* best-effort cache cleanup */ } }
}
