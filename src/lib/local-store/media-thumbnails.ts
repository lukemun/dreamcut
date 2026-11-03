import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";

import { THUMBNAIL_WIDTHS, type ThumbnailWidth } from "@/lib/media/thumbnail-url";
import { editorSiblingCorsHeaders } from "@/lib/loopback-transport";
import { filterPath, hdrToSdrDisplayCube } from "@/lib/color/ffmpeg-cubes";
import { sourceColorSpaceFromProbe, type SourceColorSpace } from "@/lib/color/io-transforms";
import { projectsRoot } from "./paths";

/**
 * Browsing thumbnails (storage class: rebuildable cache).
 *
 * Owner: this module. Root: `<projectsRoot>/.cache/thumbnails/`, flat files named
 * `<sha256>.webp` plus short-lived `<sha256>.webp.<uuid>.tmp` promotion files. Nothing
 * else in that folder is touched. The key covers recipe, absolute source path, source
 * size, source mtime and width, so any in-place source replacement yields a new key.
 * Thumbnails are never placement, preview-proxy or render authority; originals are
 * only read. Retained bytes are bounded by an LRU byte budget, and persistence is
 * skipped (the derivative is served from memory) when the destination volume is below
 * the free-space reserve from the storage lifecycle contract.
 */
// v2: HDR video frames are tone-mapped like the editor shows them, not shown as flat code values.
export const THUMBNAIL_RECIPE = "thumb-webp-v2";
export const DEFAULT_THUMBNAIL_CACHE_BUDGET_BYTES = 512 * 1024 * 1024;
export const THUMBNAIL_CACHE_BUDGET_ENV = "THUMBNAIL_CACHE_MAX_BYTES";
export const THUMBNAIL_FREE_SPACE_RESERVE_BYTES = 5 * 1024 * 1024 * 1024;
/** Height is bounded too, so tall sources cannot produce large derivatives. */
export const THUMBNAIL_MAX_ASPECT = 2;
const MAX_CONCURRENT_GENERATIONS = 4;
const VIDEO_POSTER_TIMEOUT_MS = 15_000;
const STALE_TEMP_MS = 60 * 60 * 1000;
const CACHE_ENTRY = /^[a-f0-9]{64}\.webp$/;
const CACHE_TEMP = /^[a-f0-9]{64}\.webp\.[0-9a-f-]{36}\.tmp$/;

export const THUMBNAIL_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".tif", ".tiff"]);
export const THUMBNAIL_VIDEO_EXTENSIONS = new Set([".mp4", ".m4v", ".mov", ".webm"]);

export class ThumbnailRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Frame times quantize to the 30 fps source-review clock, which also bounds distinct cache keys. */
export const THUMBNAIL_FRAME_RATE = 30;
const MAX_THUMBNAIL_TIME_SECONDS = 86_400;

/** `null` for the default poster; a frame-quantized time in seconds for `t`; 400 for anything else. */
export function parseThumbnailTime(raw: string | null): number | null {
  if (raw == null) return null;
  if (!/^\d{1,5}(?:\.\d{1,4})?$/.test(raw)) throw new ThumbnailRequestError(`Unsupported thumbnail time: ${raw.slice(0, 16)}`, 400);
  const seconds = Number(raw);
  if (seconds > MAX_THUMBNAIL_TIME_SECONDS) throw new ThumbnailRequestError("Thumbnail time is out of range", 400);
  return Math.round(seconds * THUMBNAIL_FRAME_RATE) / THUMBNAIL_FRAME_RATE;
}

/** `null` when no thumbnail was requested; throws 400 for anything outside the allow-list. */
export function parseThumbnailWidth(raw: string | null): ThumbnailWidth | null {
  if (raw == null) return null;
  if (!/^\d{1,4}$/.test(raw)) throw new ThumbnailRequestError(`Unsupported thumbnail width: ${raw.slice(0, 16)}`, 400);
  const width = Number(raw);
  if (!(THUMBNAIL_WIDTHS as readonly number[]).includes(width)) {
    throw new ThumbnailRequestError(`Unsupported thumbnail width ${width}; use ${THUMBNAIL_WIDTHS.join(", ")}`, 400);
  }
  return width as ThumbnailWidth;
}

export function thumbnailCacheRoot(): string {
  return path.join(projectsRoot(), ".cache", "thumbnails");
}

export function thumbnailCacheBudgetBytes(): number {
  const raw = process.env[THUMBNAIL_CACHE_BUDGET_ENV]?.trim();
  if (!raw) return DEFAULT_THUMBNAIL_CACHE_BUDGET_BYTES;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_THUMBNAIL_CACHE_BUDGET_BYTES;
}

export function thumbnailCacheKey(absSource: string, stat: Pick<fs.Stats, "size" | "mtimeMs">, width: ThumbnailWidth, time: number | null = null): string {
  // The default poster keeps its original key; a timed frame adds its frame index.
  const parts = [THUMBNAIL_RECIPE, path.resolve(absSource), stat.size, stat.mtimeMs, width, ...(isWebm(absSource) ? ["alpha"] : [])];
  if (time != null) parts.push(`t${Math.round(time * THUMBNAIL_FRAME_RATE)}`);
  return createHash("sha256").update(parts.join("\0")).digest("hex");
}

export type Thumbnail = { key: string; etag: string; body: Buffer; persisted: boolean };

let active = 0;
const waiting: Array<() => void> = [];
async function withGenerationSlot<T>(work: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT_GENERATIONS) await new Promise<void>((resolve) => waiting.push(resolve));
  active += 1;
  try { return await work(); } finally {
    active -= 1;
    waiting.shift()?.();
  }
}
const inflight = new Map<string, Promise<Thumbnail>>();

function resizeToWebp(input: Buffer | string, width: ThumbnailWidth): Promise<Buffer> {
  return sharp(input, { failOn: "none", animated: false })
    .rotate()
    .resize({ width, height: width * THUMBNAIL_MAX_ASPECT, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 72, effort: 4 })
    .toBuffer();
}

const isWebm = (file: string) => path.extname(file).toLowerCase() === ".webm";
/**
 * FFmpeg's built-in VP9 decoder drops alpha, so transparent WebM (motion-graphic renders)
 * decode through libvpx first; any other WebM falls back to the default decoder.
 */
function videoFrame(absSource: string, width: ThumbnailWidth, seconds: number, hdr: HdrFrameDecode | null = null): Promise<Buffer> {
  return isWebm(absSource) ? decodeFrame(absSource, width, seconds, ["-c:v", "libvpx-vp9"], hdr).catch(() => decodeFrame(absSource, width, seconds, [], hdr)) : decodeFrame(absSource, width, seconds, [], hdr);
}

/** How to read HDR code values: the colour space they encode and the YUV matrix they are stored with. */
export type HdrFrameDecode = { space: SourceColorSpace; maxCllNits?: number | null; matrix: "bt709" | "bt2020" | "smpte170m"; range: "tv" | "pc" };

/** HLG/PQ originals carry their own tags; anything else (including SDR) decodes as before. */
function probeHdr(absSource: string): Promise<HdrFrameDecode | null> {
  return new Promise((resolve) => {
    execFile("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=color_transfer,color_primaries,color_space,color_range", "-of", "json", absSource],
      { timeout: VIDEO_POSTER_TIMEOUT_MS }, (error, stdout) => {
        if (error) return resolve(null);
        try {
          const stream = (JSON.parse(stdout) as { streams?: Array<Record<string, string | undefined>> }).streams?.[0] ?? {};
          const space = sourceColorSpaceFromProbe(stream);
          if (space.transfer !== "hlg" && space.transfer !== "pq") return resolve(null);
          const matrix = stream.color_space?.startsWith("bt2020") ? "bt2020" : stream.color_space === "smpte170m" || stream.color_space === "bt470bg" ? "smpte170m" : "bt709";
          resolve({ space, matrix, range: stream.color_range === "pc" ? "pc" : "tv" });
        } catch { resolve(null); }
      });
  });
}

function decodeFrame(absSource: string, width: ThumbnailWidth, seconds: number, decoder: string[], hdr: HdrFrameDecode | null): Promise<Buffer> {
  // HDR frames go through the editor's own output transform (a small .cube from src/lib/color).
  const cubeDir = hdr ? fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-thumb-cube-")) : null;
  const cube = cubeDir ? path.join(cubeDir, "to-sdr.cube") : null;
  if (cube && hdr) fs.writeFileSync(cube, hdrToSdrDisplayCube(hdr.space, hdr.maxCllNits, 33));
  const filter = cube && hdr
    ? `scale=w='min(${width},iw)':h=-2:in_color_matrix=${hdr.matrix}:in_range=${hdr.range}:flags=area,format=gbrp16le,lut3d=file='${filterPath(cube)}':interp=tetrahedral`
    : `scale=w='min(${width},iw)':h=-2`;
  return new Promise<Buffer>((resolve, reject) => {
    execFile("ffmpeg", [
      "-v", "error", "-ss", String(seconds), ...decoder, "-i", absSource, "-map", "0:v:0", "-frames:v", "1",
      "-vf", filter, "-pix_fmt", "rgb24", "-f", "image2pipe", "-c:v", "png", "-",
    ], { encoding: "buffer", timeout: VIDEO_POSTER_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error);
      else if (!stdout.length) reject(new Error("No video frame decoded"));
      else resolve(stdout);
    });
  }).finally(() => { if (cubeDir) fs.rmSync(cubeDir, { recursive: true, force: true }); });
}

async function generate(absSource: string, width: ThumbnailWidth, time: number | null, codeValues: HdrFrameDecode | null): Promise<Buffer> {
  const ext = path.extname(absSource).toLowerCase();
  if (THUMBNAIL_IMAGE_EXTENSIONS.has(ext)) return resizeToWebp(absSource, width);
  if (THUMBNAIL_VIDEO_EXTENSIONS.has(ext)) {
    const hdr = codeValues ?? await probeHdr(absSource);
    // A requested time past the end falls back to the default poster. The default skips a
    // possible black first frame; very short clips fall back to the first frame.
    const poster = () => videoFrame(absSource, width, 0.1, hdr).catch(() => videoFrame(absSource, width, 0, hdr));
    const frame = await (time != null ? videoFrame(absSource, width, time, hdr).catch(poster) : poster());
    return resizeToWebp(frame, width);
  }
  throw new ThumbnailRequestError("Thumbnails are not available for this media type", 415);
}

async function hasPersistHeadroom(dir: string, bytes: number): Promise<boolean> {
  try {
    const stats = await fs.promises.statfs(dir);
    return stats.bavail * stats.bsize - bytes >= THUMBNAIL_FREE_SPACE_RESERVE_BYTES;
  } catch {
    // Unknown free space never grants a write.
    return false;
  }
}

async function persist(key: string, body: Buffer): Promise<boolean> {
  const root = thumbnailCacheRoot();
  await fs.promises.mkdir(root, { recursive: true });
  if (!(await hasPersistHeadroom(root, body.length))) return false;
  const final = path.join(root, `${key}.webp`);
  const temp = `${final}.${randomUUID()}.tmp`;
  try {
    await fs.promises.writeFile(temp, body, { flag: "wx" });
    await fs.promises.rename(temp, final);
  } catch {
    await fs.promises.rm(temp, { force: true }).catch(() => {});
    return false;
  }
  scheduleBudgetEnforcement();
  return true;
}

let enforcing: Promise<unknown> | null = null;
function scheduleBudgetEnforcement() {
  enforcing ??= enforceThumbnailCacheBudget().catch(() => {}).finally(() => { enforcing = null; });
}

/** Evicts least-recently-used owned thumbnails until under budget. Touches only owned names. */
export async function enforceThumbnailCacheBudget(budget = thumbnailCacheBudgetBytes()): Promise<{ bytes_before: number; bytes_after: number; evicted: number }> {
  const root = thumbnailCacheRoot();
  let names: string[];
  try { names = await fs.promises.readdir(root); } catch { return { bytes_before: 0, bytes_after: 0, evicted: 0 }; }
  const now = Date.now();
  const entries: Array<{ file: string; size: number; used: number }> = [];
  for (const name of names) {
    const file = path.join(root, name);
    const stat = await fs.promises.lstat(file).catch(() => null);
    if (!stat?.isFile()) continue;
    if (CACHE_TEMP.test(name)) {
      // A promotion takes milliseconds; an hour-old temp belongs to a dead writer.
      if (now - stat.mtimeMs > STALE_TEMP_MS) await fs.promises.rm(file, { force: true }).catch(() => {});
      continue;
    }
    if (CACHE_ENTRY.test(name)) entries.push({ file, size: stat.size, used: stat.mtimeMs });
  }
  const before = entries.reduce((sum, entry) => sum + entry.size, 0);
  let total = before;
  let evicted = 0;
  for (const entry of entries.sort((a, b) => a.used - b.used)) {
    if (total <= budget) break;
    // Entries are served from memory after a full read, so unlinking cannot truncate a response.
    await fs.promises.rm(entry.file, { force: true }).catch(() => {});
    total -= entry.size;
    evicted += 1;
  }
  return { bytes_before: before, bytes_after: total, evicted };
}

/** Validator for the derivative of the source as it is on disk now. */
export async function thumbnailIdentity(absSource: string, width: ThumbnailWidth, time: number | null = null): Promise<{ key: string; etag: string }> {
  let stat: fs.Stats;
  try { stat = await fs.promises.stat(absSource); } catch { throw new ThumbnailRequestError("File not found", 404); }
  if (!stat.isFile()) throw new ThumbnailRequestError("File not found", 404);
  const key = thumbnailCacheKey(absSource, stat, width, THUMBNAIL_VIDEO_EXTENSIONS.has(path.extname(absSource).toLowerCase()) ? time : null);
  return { key, etag: `"${key.slice(0, 32)}"` };
}

/** Cached or freshly generated thumbnail for an already-validated absolute source path. */
export async function ensureThumbnail(absSource: string, width: ThumbnailWidth, time: number | null = null, codeValues: HdrFrameDecode | null = null): Promise<Thumbnail> {
  const { key, etag } = await thumbnailIdentity(absSource, width, time);
  const cached = path.join(thumbnailCacheRoot(), `${key}.webp`);
  try {
    const body = await fs.promises.readFile(cached);
    // mtime records last use for LRU eviction.
    const now = new Date();
    void fs.promises.utimes(cached, now, now).catch(() => {});
    return { key, etag, body, persisted: true };
  } catch { /* miss */ }
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = withGenerationSlot(async () => {
    const body = await generate(absSource, width, time, codeValues);
    const persisted = await persist(key, body).catch(() => false);
    return { key, etag, body, persisted };
  }).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

/**
 * Media-route integration: `null` when the request carries no `w` parameter (serve the
 * original as before). Undecodable images also return `null` so the original still shows.
 */
export async function thumbnailResponse(
  request: Request,
  absSource: string,
  /** `codeValues`: a prepared file whose pixels are HDR code values tagged as BT.709 (see media-preparation). */
  options: { cacheControl: string; headers?: Record<string, string>; codeValues?: HdrFrameDecode | null },
): Promise<Response | null> {
  let width: ThumbnailWidth | null, time: number | null;
  try {
    const params = new URL(request.url).searchParams;
    width = parseThumbnailWidth(params.get("w"));
    time = parseThumbnailTime(params.get("t"));
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: (error as ThumbnailRequestError).status ?? 400 });
  }
  if (width == null) return null;
  try {
    const base = { "Content-Type": "image/webp", "Cache-Control": options.cacheControl, ...(options.headers ?? {}), ...editorSiblingCorsHeaders(request) };
    const identity = await thumbnailIdentity(absSource, width, time);
    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch?.split(",").map((value) => value.trim()).includes(identity.etag)) {
      return new Response(null, { status: 304, headers: { ...base, ETag: identity.etag } });
    }
    const thumb = await ensureThumbnail(absSource, width, time, options.codeValues ?? null);
    const headers = { ...base, ETag: thumb.etag, "X-Thumbnail-Cache": thumb.persisted ? "stored" : "memory" };
    return new Response(new Uint8Array(thumb.body), { status: 200, headers: { ...headers, "Content-Length": String(thumb.body.length) } });
  } catch (error) {
    if (error instanceof ThumbnailRequestError) {
      if (error.status === 415) return null;
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (THUMBNAIL_IMAGE_EXTENSIONS.has(path.extname(absSource).toLowerCase())) return null;
    return Response.json({ error: "Poster unavailable" }, { status: 422 });
  }
}

/** Project media is overwritten in place; revalidate every use (cheap 304 by ETag). */
export const MUTABLE_THUMBNAIL_CACHE_CONTROL = "private, no-cache";
/** Catalog files are append-only libraries; a day of reuse before revalidation. */
export const CATALOG_THUMBNAIL_CACHE_CONTROL = "private, max-age=86400";
