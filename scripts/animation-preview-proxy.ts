import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { projectDir } from "@/lib/local-store/paths";
import { readTimeline, writeJsonFileAtomic, writeTimeline } from "@/lib/local-store/store";
import type { TimelineElement } from "@/components/studio/timeline/types";

const RECIPE_ID = "animation-preview-proxy-v1";
const FPS = 30;
const MAX_WIDTH = 540;
const MAX_HEIGHT = 960;

type MediaProbe = {
  codec: string;
  width: number;
  height: number;
  pixelFormat: string;
  fps: number;
  durationSeconds: number;
  frameCount: number;
  hasAlpha: boolean;
};

type ProxyReceipt = {
  schema_version: 1;
  recipe_id: typeof RECIPE_ID;
  project_id: string;
  element_id: string;
  created_at: string;
  elapsed_ms: number;
  render_authority: {
    url: string;
    sha256: string;
    probe: MediaProbe;
  };
  workshop_proxy: {
    url: string;
    sha256: string;
    probe: MediaProbe;
  };
  verification: {
    duration_delta_seconds: number;
    frame_count_delta: number;
    alpha_preserved: boolean;
    passed: boolean;
  };
};

function usage(): never {
  throw new Error(
    "Usage: pnpm animation-preview-proxy <project-id> <element-id...> [--all-oversized] [--force]",
  );
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    throw new Error(`${command} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function ratio(value: string | undefined): number {
  if (!value) return 0;
  const [numerator, denominator] = value.split("/").map(Number);
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0
    ? numerator / denominator
    : 0;
}

function probe(file: string): MediaProbe {
  const output = run("ffprobe", [
    "-v", "error",
    "-show_entries",
    "stream=codec_type,codec_name,width,height,pix_fmt,avg_frame_rate,nb_frames:stream_tags=alpha_mode,ALPHA_MODE:format=duration",
    "-of", "json",
    file,
  ]);
  const parsed = JSON.parse(output) as {
    streams?: Array<Record<string, unknown>>;
    format?: Record<string, unknown>;
  };
  const stream = parsed.streams?.find((candidate) => candidate.codec_type === "video");
  if (!stream) throw new Error(`No video stream found: ${file}`);
  const durationSeconds = Number(parsed.format?.duration);
  const fps = ratio(typeof stream.avg_frame_rate === "string" ? stream.avg_frame_rate : undefined);
  const tags = typeof stream.tags === "object" && stream.tags ? stream.tags as Record<string, unknown> : {};
  const frameCount = Number(stream.nb_frames);
  const pixelFormat = typeof stream.pix_fmt === "string" ? stream.pix_fmt : "";
  return {
    codec: typeof stream.codec_name === "string" ? stream.codec_name : "",
    width: Number(stream.width),
    height: Number(stream.height),
    pixelFormat,
    fps,
    durationSeconds,
    frameCount: Number.isFinite(frameCount) ? frameCount : Math.round(durationSeconds * fps),
    hasAlpha: pixelFormat.includes("a") || tags.alpha_mode === "1" || tags.ALPHA_MODE === "1",
  };
}

function sha256(file: string): string {
  const hash = createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

function fitWithin(width: number, height: number) {
  const scale = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height);
  const even = (value: number) => Math.max(2, Math.floor(value / 2) * 2);
  return { width: even(width * scale), height: even(height * scale) };
}

function projectMediaPath(projectId: string, url: string): string {
  const root = projectDir(projectId);
  const mediaRoot = path.resolve(root, "media");
  const marker = `/api/projects/${projectId}/media/`;
  if (!url.startsWith(marker)) throw new Error(`Element media is not project-local: ${url}`);
  const candidate = path.resolve(mediaRoot, decodeURIComponent(url.slice(marker.length)));
  if (candidate !== mediaRoot && !candidate.startsWith(`${mediaRoot}${path.sep}`)) {
    throw new Error(`Media URL escapes the project: ${url}`);
  }
  return candidate;
}

function renderAuthorityUrl(element: TimelineElement): string {
  const declared = element.props?.render_authority_source_url;
  if (typeof declared === "string" && declared.length > 0) return declared;
  if (element.source_url) return element.source_url;
  throw new Error(`Element ${element.id} has no render authority source.`);
}

function encodeProxy(source: string, destination: string, sourceProbe: MediaProbe) {
  const dimensions = fitWithin(sourceProbe.width, sourceProbe.height);
  const temp = `${destination}.partial.${path.extname(destination).slice(1)}`;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.rmSync(temp, { force: true });
  const alphaInput = sourceProbe.hasAlpha ? ["-c:v", "libvpx-vp9"] : [];
  const common = [
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    ...alphaInput,
    "-i", source,
    "-map", "0:v:0",
    "-an",
    "-vf", `fps=${FPS},scale=${dimensions.width}:${dimensions.height}:flags=lanczos`,
  ];
  const codec = sourceProbe.hasAlpha
    ? [
        "-c:v", "libvpx-vp9",
        "-pix_fmt", "yuva420p",
        "-auto-alt-ref", "0",
        "-row-mt", "1",
        "-deadline", "good",
        "-cpu-used", "4",
        "-crf", "34",
        "-b:v", "0",
        "-metadata:s:v:0", "alpha_mode=1",
      ]
    : [
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "fast",
        "-crf", "24",
        "-g", "30",
        "-keyint_min", "30",
        "-sc_threshold", "0",
        "-movflags", "+faststart",
      ];
  run("ffmpeg", [...common, ...codec, temp]);
  fs.renameSync(temp, destination);
}

function shouldPrepare(element: TimelineElement, projectId: string, force: boolean) {
  if (element.type !== "video_clip" || element.removed_at) return false;
  if (force) return true;
  const preview = typeof element.props?.preview_source_url === "string"
    ? element.props.preview_source_url
    : element.source_url;
  if (!preview) return false;
  const file = projectMediaPath(projectId, preview);
  if (!fs.existsSync(file)) return true;
  const media = probe(file);
  const alphaLimitExceeded = media.hasAlpha && (media.width > MAX_WIDTH || media.height > MAX_HEIGHT);
  return alphaLimitExceeded || media.width > 720 || media.height > 1280;
}

const argv = process.argv.slice(2).filter((arg) => arg !== "--");
const projectId = argv.shift();
if (!projectId) usage();
const allOversized = argv.includes("--all-oversized");
const force = argv.includes("--force");
const requestedIds = argv.filter((arg) => !arg.startsWith("--"));
if (!allOversized && requestedIds.length === 0) usage();

const root = projectDir(projectId);
const timeline = readTimeline(projectId);
const requested = new Set(requestedIds);
const targets = timeline.elements.filter((element) =>
  requested.has(element.id) || (allOversized && shouldPrepare(element, projectId, force))
);
for (const id of requested) {
  if (!targets.some((element) => element.id === id)) throw new Error(`Timeline element not found: ${id}`);
}
if (targets.length === 0) {
  console.log(JSON.stringify({ project_id: projectId, recipe_id: RECIPE_ID, prepared: [] }, null, 2));
  process.exit(0);
}

const receipts: ProxyReceipt[] = [];
for (const element of targets) {
  if (element.type !== "video_clip" || element.removed_at) continue;
  const startedAt = Date.now();
  const authorityUrl = renderAuthorityUrl(element);
  const authorityFile = projectMediaPath(projectId, authorityUrl);
  if (!fs.existsSync(authorityFile)) throw new Error(`Render authority does not exist: ${authorityFile}`);
  const declaredAlpha = element.props?.has_alpha === true;
  const authorityProbe = probe(authorityFile);
  if (declaredAlpha && !authorityProbe.hasAlpha) {
    throw new Error(`Element ${element.id} declares alpha but its render authority does not: ${authorityUrl}`);
  }
  const authorityHash = sha256(authorityFile);
  const extension = authorityProbe.hasAlpha ? "webm" : "mp4";
  const proxyRelative = path.posix.join(
    "proxies",
    "animation",
    `${element.id}-${authorityHash.slice(0, 16)}-${MAX_WIDTH}x${MAX_HEIGHT}.${extension}`,
  );
  const proxyUrl = `/api/projects/${projectId}/media/${proxyRelative}`;
  const proxyFile = path.join(root, "media", ...proxyRelative.split("/"));
  if (force || !fs.existsSync(proxyFile)) encodeProxy(authorityFile, proxyFile, authorityProbe);
  const proxyProbe = probe(proxyFile);
  const durationDelta = Math.abs(proxyProbe.durationSeconds - authorityProbe.durationSeconds);
  const frameCountDelta = Math.abs(proxyProbe.frameCount - Math.round(authorityProbe.durationSeconds * FPS));
  const alphaPreserved = !authorityProbe.hasAlpha || proxyProbe.hasAlpha;
  const passed = proxyProbe.width <= MAX_WIDTH
    && proxyProbe.height <= MAX_HEIGHT
    && Math.abs(proxyProbe.fps - FPS) <= 0.01
    && durationDelta <= 1 / FPS + 0.002
    && frameCountDelta <= 1
    && alphaPreserved;
  if (!passed) {
    fs.rmSync(proxyFile, { force: true });
    throw new Error(`Proxy verification failed for ${element.id}: ${JSON.stringify({ authorityProbe, proxyProbe, durationDelta, frameCountDelta, alphaPreserved })}`);
  }
  const proxyHash = sha256(proxyFile);
  const receipt: ProxyReceipt = {
    schema_version: 1,
    recipe_id: RECIPE_ID,
    project_id: projectId,
    element_id: element.id,
    created_at: new Date().toISOString(),
    elapsed_ms: Date.now() - startedAt,
    render_authority: { url: authorityUrl, sha256: authorityHash, probe: authorityProbe },
    workshop_proxy: { url: proxyUrl, sha256: proxyHash, probe: proxyProbe },
    verification: {
      duration_delta_seconds: durationDelta,
      frame_count_delta: frameCountDelta,
      alpha_preserved: alphaPreserved,
      passed,
    },
  };
  receipts.push(receipt);
  const receiptPath = path.join(root, "preprocess", "animation-preview-proxies", `${element.id}.json`);
  writeJsonFileAtomic(receiptPath, receipt);
  element.props = {
    ...(element.props ?? {}),
    preview_source_url: proxyUrl,
    render_authority_source_url: authorityUrl,
    preview_proxy_recipe: RECIPE_ID,
    preview_proxy_width: proxyProbe.width,
    preview_proxy_height: proxyProbe.height,
    preview_proxy_duration_seconds: proxyProbe.durationSeconds,
    preview_proxy_frame_count: proxyProbe.frameCount,
    preview_proxy_sha256: proxyHash,
    render_authority_sha256: authorityHash,
    has_alpha: authorityProbe.hasAlpha,
    preview_proxy_receipt: path.relative(root, receiptPath),
  };
}

writeTimeline(projectId, timeline, "prepare_animation_preview_proxy_v1");
const metricsPath = path.join(root, "preprocess", "run-metrics.jsonl");
fs.mkdirSync(path.dirname(metricsPath), { recursive: true });
for (const receipt of receipts) {
  fs.appendFileSync(metricsPath, `${JSON.stringify({
    recorded_at: receipt.created_at,
    operation: RECIPE_ID,
    project_id: projectId,
    element_id: receipt.element_id,
    elapsed_ms: receipt.elapsed_ms,
    render_width: receipt.render_authority.probe.width,
    render_height: receipt.render_authority.probe.height,
    preview_width: receipt.workshop_proxy.probe.width,
    preview_height: receipt.workshop_proxy.probe.height,
    has_alpha: receipt.workshop_proxy.probe.hasAlpha,
  })}\n`);
}
console.log(JSON.stringify({ project_id: projectId, recipe_id: RECIPE_ID, prepared: receipts }, null, 2));
