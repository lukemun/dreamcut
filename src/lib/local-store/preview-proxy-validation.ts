import {probeHasAlphaChannel} from '../media-analysis/alpha-channel';
import fs from "node:fs";
import {createHash} from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { projectMediaDir } from "./paths";
import { PREVIEW_PROXY_CONTRACT, proxyDimensionsAllowed } from "../remotion/preview-proxy-contract";
import { sourceNeedsSdrRenderAuthority } from "../media-analysis/color-profile";

type ProxyProbe = { width: number; height: number; pix_fmt?:string; r_frame_rate?:string; color_transfer?:string; color_primaries?:string; tags?:{alpha_mode?:string} };
const cache = new Map<string, ProxyProbe | null>();

const PROBE_ARGS = ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,codec_name,pix_fmt,r_frame_rate,color_transfer,color_primaries:stream_tags=alpha_mode", "-of", "json"];
/** Changes whenever the probe asks for different fields, so older receipts are never reused. */
const PROBE_VERSION = createHash("sha256").update(`preview-proxy-probe-v2\0${PROBE_ARGS.join("\0")}`).digest("hex").slice(0, 16);
type ProbeReceipts = { version: string; entries: Record<string, { size: string; mtime_ns: string; probe: ProxyProbe }> };
let probeCount = 0;

/** Rebuildable per-project cache of proxy probes, so a server restart does not re-run ffprobe on
 * unchanged proxies. Keyed by a hash of the proxy's path inside the media folder, its size and its
 * nanosecond mtime: a replaced or re-encoded proxy probes again. Only successful probes are kept. */
const receiptsPath = (mediaRoot: string) => path.join(path.dirname(mediaRoot), "preprocess", "preview-proxy-probes.json");
const parsedReceipts = new Map<string, { stamp: string; receipts: ProbeReceipts }>();
/** Shared, read-only parse; writers clone it. */
function readReceipts(file: string): ProbeReceipts {
  try {
    const stat = fs.statSync(file, { bigint: true });
    const stamp = `${stat.ino}:${stat.size}:${stat.mtimeNs}`;
    const parsed = parsedReceipts.get(file);
    if (parsed?.stamp === stamp) return parsed.receipts;
    const value = JSON.parse(fs.readFileSync(file, "utf8")) as ProbeReceipts;
    if (value?.version === PROBE_VERSION && value.entries && typeof value.entries === "object") {
      if (parsedReceipts.size >= 64) parsedReceipts.clear();
      parsedReceipts.set(file, { stamp, receipts: value });
      return value;
    }
  } catch { /* Missing or unreadable receipts only cost a probe. */ }
  return { version: PROBE_VERSION, entries: {} };
}
function writeReceipt(file: string, key: string, entry: ProbeReceipts["entries"][string]) {
  try {
    const receipts = structuredClone(readReceipts(file));
    // Most recent last; bounded to the newest 512 proxies so retired ones drop out.
    delete receipts.entries[key];
    receipts.entries[key] = entry;
    const keys = Object.keys(receipts.entries);
    for (const name of keys.slice(0, Math.max(0, keys.length - 512))) delete receipts.entries[name];
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(receipts));
    fs.renameSync(temporary, file);
  } catch { /* A receipt that cannot be written only costs a probe next time. */ }
}

function probeProxy(root: string, file: string, stat: fs.BigIntStats): ProxyProbe | null {
  // Hashed, so this cache never reads as a media reference that keeps a retired proxy on disk.
  const key = createHash("sha256").update(path.relative(root, file).split(path.sep).join("/")).digest("hex");
  const receipts = receiptsPath(root);
  const size = String(stat.size), mtime_ns = String(stat.mtimeNs);
  const saved = readReceipts(receipts).entries[key];
  if (saved && saved.size === size && saved.mtime_ns === mtime_ns && saved.probe) return saved.probe;
  probeCount++;
  const result = spawnSync("ffprobe", [...PROBE_ARGS, file], { encoding: "utf8", timeout: 5000 });
  const probe: ProxyProbe | null = result.status === 0 ? JSON.parse(result.stdout).streams?.[0] ?? null : null;
  if (probe && Number(probe.width) > 0 && Number(probe.height) > 0) {
    // The file must not have changed while it was probed, or the receipt would describe other bytes.
    const after = fs.statSync(file, { bigint: true });
    if (after.size === stat.size && after.mtimeNs === stat.mtimeNs) writeReceipt(receipts, key, { size, mtime_ns, probe });
  }
  return probe;
}

/** Test hooks: forget the in-process cache (a server restart) and count real ffprobe runs. */
export const previewProxyProbeTesting = {
  resetMemory: () => { cache.clear(); parsedReceipts.clear(); },
  probes: () => probeCount,
};

/**
 * One timeline read hydrates thousands of elements that share a few sources and proxies. Inside
 * `withPreviewHydrationMemo`, lookups (proxy validation, preparation records, settings) are answered
 * once per key for the rest of the current synchronous run; the memo is dropped at the next microtask,
 * so every request starts from disk again. Any preparation write clears it. Outside a scope nothing
 * is memoized.
 */
let hydrationMemo: Map<string, unknown> | null = null;
let hydrationDepth = 0;
export function withPreviewHydrationMemo<T>(run: () => T): T {
  if (!hydrationMemo) {
    const memo = new Map<string, unknown>();
    hydrationMemo = memo;
    queueMicrotask(() => { if (hydrationMemo === memo) hydrationMemo = null; });
  }
  hydrationDepth++;
  try { return run(); } finally { hydrationDepth--; }
}
export function previewHydrationMemo<T>(key: string, compute: () => T): T {
  const memo = hydrationDepth > 0 ? hydrationMemo : null;
  if (!memo) return compute();
  if (memo.has(key)) return memo.get(key) as T;
  const value = compute();
  memo.set(key, value);
  return value;
}
/** A preparation record or proxy changed during this run: later lookups read disk again. */
export function forgetPreviewHydrationMemo() { hydrationMemo?.clear(); }

/** Server-measured, disposable playback evidence. Never trust dimensions saved with the clip. */
export function validatePreviewProxy(url: unknown, alpha: boolean, quality?: unknown): ReturnType<typeof measurePreviewProxy> {
  if (typeof url !== "string" || hydrationDepth === 0) return measurePreviewProxy(url, alpha, quality);
  // A shallow copy per caller, so one element's props never alias another's.
  return { ...previewHydrationMemo(`proxy\0${url}\0${alpha}\0${JSON.stringify(quality) ?? "-"}`, () => measurePreviewProxy(url, alpha, quality)) };
}

function measurePreviewProxy(url: unknown, alpha: boolean, quality?: unknown) {
  const failed = { contract: PREVIEW_PROXY_CONTRACT, url, quality, hdr: false, ok: false };
  if (typeof url !== "string") return failed;
  try {
    const match = url.split(/[?#]/)[0]!.match(/^\/api\/projects\/([^/]+)\/media\/(.+)$/);
    if (!match) return failed;
    const root = fs.realpathSync(projectMediaDir(decodeURIComponent(match[1]!)));
    const file = fs.realpathSync(path.resolve(root, decodeURIComponent(match[2]!)));
    if (!file.startsWith(root + path.sep)) return failed;
    const stat = fs.statSync(file,{bigint:true});
    const key = `${file}:${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
    // Disposable revision, not a content-integrity claim. A replaced file at a
    // stable URL must invalidate decoder/frame caches without exposing its path.
    const revision=createHash("sha256").update(key).digest("hex");
    let dimensions = cache.get(key);
    if (dimensions === undefined) {
      dimensions = probeProxy(root, file, stat);
      if (cache.size >= 256) cache.clear();
      cache.set(key, dimensions ?? null);
    }
    // The proxy's own cadence decides whether export can match its frames (source-sampling.ts).
    const [rateNum, rateDen] = String(dimensions?.r_frame_rate ?? "").split("/").map(Number);
    const frame_rate = rateNum > 0 && rateDen > 0 ? Math.round(rateNum / rateDen * 1000) / 1000 : undefined;
    // GPU preview decodes SDR only, so an HDR proxy is never valid playback evidence.
    const hdr = !!dimensions && sourceNeedsSdrRenderAuthority({ color_transfer: dimensions.color_transfer ?? null, color_primaries: dimensions.color_primaries ?? null, pixel_format: dimensions.pix_fmt ?? null });
    return { ...failed, ...dimensions, ...(frame_rate ? { frame_rate } : {}), has_alpha:probeHasAlphaChannel({pixel_format:dimensions?.pix_fmt??null,video_alpha_mode:dimensions?.tags?.alpha_mode}), hdr, revision, ok: !!dimensions && !hdr && proxyDimensionsAllowed(dimensions.width, dimensions.height, alpha, quality) };
  } catch { return failed; }
}
