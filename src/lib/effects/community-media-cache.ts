import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { profileDir } from "@/lib/local-store/profile-dir";

/**
 * Rebuildable cache of community template examples (posters and videos). Each file is downloaded the
 * first time a card shows it or someone plays it, then served from disk. Files are named by the source
 * URL, so a recipe whose example changes gets a new file; the folder is kept under a size cap, oldest
 * use first. Everything here can be downloaded again, so nothing in it is user or project authority.
 */
export const COMMUNITY_MEDIA_CAP_BYTES = 300 * 1024 * 1024;
/** One example may use at most a quarter of the folder. */
const MAX_FILE_BYTES = COMMUNITY_MEDIA_CAP_BYTES / 4;
/** Use order only needs to be roughly right, so a file's time is refreshed at most once a minute. */
const TOUCH_INTERVAL_MS = 60_000;
const EXTENSIONS: Record<string, string> = { "video/mp4": "mp4", "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
const TYPES = Object.fromEntries(Object.entries(EXTENSIONS).map(([type, extension]) => [extension, type]));

type Saved = { file: string; contentType: string };

export const communityMediaDir = () => path.join(profileDir(), "cache", "community-media");
const baseName = (sourceUrl: string) => createHash("sha256").update(sourceUrl.split("?")[0]!).digest("hex").slice(0, 32);

/** Files this process saved or found, by base name, so a hit costs one stat rather than a folder listing. */
const known = new Map<string, Saved>();
const touched = new Map<string, number>();
const downloads = new Map<string, Promise<Saved | null>>();

const exists = (file: string) => fs.promises.stat(file).then(stat => stat.isFile(), () => false);

/** A saved copy of this source, with its content type, or null. Reading it counts as use. */
export async function cachedCommunityMedia(sourceUrl: string): Promise<Saved | null> {
  const dir = communityMediaDir(), base = baseName(sourceUrl);
  let saved = known.get(base);
  if (saved && !(await exists(saved.file))) { known.delete(base); saved = undefined; }
  if (!saved) {
    // Saved by an earlier session or another process: try each known extension.
    for (const [extension, contentType] of Object.entries(TYPES)) {
      const file = path.join(dir, `${base}.${extension}`);
      if (await exists(file)) { saved = { file, contentType }; known.set(base, saved); break; }
    }
  }
  if (!saved) return null;
  const now = Date.now();
  if (now - (touched.get(saved.file) ?? 0) >= TOUCH_INTERVAL_MS) {
    touched.set(saved.file, now);
    void fs.promises.utimes(saved.file, new Date(now), new Date(now)).catch(() => { /* use order only */ });
  }
  return saved;
}

/** The cached copy, or one download shared by every request that arrives while it runs. */
export async function communityMedia(sourceUrl: string, fetchImpl: typeof fetch = fetch) {
  const base = baseName(sourceUrl);
  // `known` covers a download that finished while the lookup ran.
  return downloads.get(base) ?? await cachedCommunityMedia(sourceUrl) ?? known.get(base) ?? saveCommunityMedia(sourceUrl, fetchImpl);
}

/**
 * Download one example to the cache (streamed to a temporary file, then an atomic rename) and trim the
 * folder to its cap afterwards. Concurrent calls for the same source share one download.
 */
export function saveCommunityMedia(sourceUrl: string, fetchImpl: typeof fetch = fetch) {
  const base = baseName(sourceUrl);
  const running = downloads.get(base);
  if (running) return running;
  const pending = download(sourceUrl, base, fetchImpl);
  downloads.set(base, pending);
  void pending.finally(() => { if (downloads.get(base) === pending) downloads.delete(base); }).catch(() => {});
  return pending;
}

async function download(sourceUrl: string, base: string, fetchImpl: typeof fetch): Promise<Saved | null> {
  const upstream = await fetchImpl(sourceUrl, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(60_000) });
  const contentType = (upstream.headers.get("content-type") ?? "").split(";")[0]!.trim();
  const extension = EXTENSIONS[contentType];
  const declared = Number(upstream.headers.get("content-length") ?? 0);
  if (!upstream.ok || !extension || !upstream.body || declared > MAX_FILE_BYTES) { await upstream.body?.cancel(); return null; }
  const dir = communityMediaDir();
  await fs.promises.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${base}.${extension}`), partial = `${file}.${process.pid}.part`;
  const handle = await fs.promises.open(partial, "w");
  let written = 0, complete = false;
  try {
    for await (const chunk of upstream.body as unknown as AsyncIterable<Uint8Array>) {
      written += chunk.byteLength;
      // A missing or wrong length header must not let one example fill the folder.
      if (written > MAX_FILE_BYTES) return null;
      await handle.write(chunk);
    }
    complete = true;
  } finally {
    await handle.close();
    if (!complete) await fs.promises.rm(partial, { force: true });
  }
  await fs.promises.rename(partial, file);
  const saved = { file, contentType };
  known.set(base, saved);
  touched.set(file, Date.now());
  scheduleTrim(dir, file);
  return saved;
}

let trimQueued = false;
/** Trims after the response has started; saves that land meanwhile share one pass. */
function scheduleTrim(dir: string, keep: string) {
  if (trimQueued) return;
  trimQueued = true;
  setImmediate(() => {
    trimQueued = false;
    trimCommunityMedia(dir, keep).catch(() => { /* retried after the next save */ });
  });
}

/** Remove the least recently used examples until the folder fits its cap, never the file just saved. */
export async function trimCommunityMedia(dir = communityMediaDir(), keep?: string, cap = COMMUNITY_MEDIA_CAP_BYTES) {
  const names = (await fs.promises.readdir(dir)).filter(name => !name.endsWith(".part"));
  const files = (await Promise.all(names.map(async name => {
    const file = path.join(dir, name);
    const stat = await fs.promises.stat(file).catch(() => null);
    return stat?.isFile() ? { file, size: stat.size, used: stat.mtimeMs } : null;
  }))).filter(item => item !== null).sort((a, b) => a.used - b.used);
  let total = files.reduce((sum, item) => sum + item.size, 0);
  for (const item of files) {
    if (total <= cap) break;
    if (item.file === keep) continue;
    await fs.promises.rm(item.file, { force: true });
    for (const [base, saved] of known) if (saved.file === item.file) known.delete(base);
    touched.delete(item.file);
    total -= item.size;
  }
}

/** Test hook: forgets what this process knows, as after a restart. */
export function resetCommunityMediaIndex() {
  known.clear();
  touched.clear();
}
