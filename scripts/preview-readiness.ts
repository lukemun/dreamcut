import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { projectDir, projectMediaDir } from "@/lib/local-store/paths";
import { readTimeline, writeJsonFileAtomic } from "@/lib/local-store/store";
import {
  assessPreviewReadiness,
  resolvedPreviewUrl,
  SINGLE_MUXED_NARRATION_CLOCK,
  type PreviewMediaFact,
} from "@/lib/qc/preview-readiness";

export function inspectProjectPreviewReadiness(projectId: string) {
const root = projectDir(projectId);
const timeline = readTimeline(projectId);
const videos = timeline.elements.filter((element) => element.type === "video_clip" && !element.removed_at);
const renderAuthorityStills = timeline.elements.filter((element) => element.type === "still" && !element.removed_at && element.props?.render_authority_required === true);
const alphaRgbParentVideos = videos.filter((element) => element.props?.has_alpha === true && element.props?.rgb_parent_authority_required === true);
const urls = [...new Set([
  ...videos.map(resolvedPreviewUrl),
  ...videos.filter((element) => typeof element.props?.preview_source_url === "string").map((element) => element.source_url),
  ...videos.map((element) => element.props?.render_authority_source_url),
  ...alphaRgbParentVideos.flatMap((element) => [element.props?.rgb_parent_authority_source_url, element.props?.rgb_parent_preview_source_url]),
  ...renderAuthorityStills.flatMap((element) => [element.source_url, element.props?.preview_source_url]),
].filter((url): url is string => typeof url === "string" && url.length > 0))];
const urlsRequiringSha256 = new Set(alphaRgbParentVideos.flatMap((element) => [
  element.source_url,
  element.props?.preview_source_url,
  element.props?.rgb_parent_authority_source_url,
  element.props?.rgb_parent_preview_source_url,
]).concat(
  videos
    .filter((element) => element.props?.preview_audio_architecture === SINGLE_MUXED_NARRATION_CLOCK)
    .flatMap((element) => [element.source_url, element.props?.preview_source_url]),
).concat(
  videos
    .filter((element) =>
      typeof element.props?.render_authority_sha256 === "string"
      || typeof element.props?.preview_proxy_sha256 === "string")
    .flatMap((element) => [
      element.props?.render_authority_source_url,
      element.props?.preview_source_url,
    ]),
).filter((url): url is string => typeof url === "string" && url.length > 0));
const audioUrls = [...new Set(videos.map((element) => element.props?.preview_audio_source_url).filter((url): url is string => typeof url === "string"))];

function projectMediaPath(url: string): string | null {
  const mediaUrl = url.split(/[?#]/, 1)[0];
  const match = mediaUrl.match(/^\/api\/projects\/([^/]+)\/media\/(.+)$/);
  if (!match) return null;
  const referencedProjectId = decodeURIComponent(match[1]);
  const mediaRoot = path.resolve(projectMediaDir(referencedProjectId));
  const candidate = path.resolve(mediaRoot, decodeURIComponent(match[2]));
  return candidate === mediaRoot || candidate.startsWith(`${mediaRoot}${path.sep}`)
    ? candidate
    : null;
}

function ratio(value: string | undefined): number | null {
  if (!value) return null;
  const [numerator, denominator] = value.split("/").map(Number);
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0 ? numerator / denominator : null;
}

function sha256(file: string): string | null {
  const result = spawnSync("shasum", ["-a", "256", file], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const value = result.stdout.trim().split(/\s+/)[0];
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
}

const facts = new Map<string, PreviewMediaFact>();
for (const url of urls) {
  const file = projectMediaPath(url);
  if (!file || !fs.existsSync(file)) {
    facts.set(url, { url, readable: false, codec: null, width: null, height: null, pixelFormat: null, fps: null, durationSeconds: null });
    continue;
  }
  const result = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,pix_fmt,avg_frame_rate,nb_frames,color_space,color_transfer,color_primaries,duration:format=duration", "-of", "json", file], { encoding: "utf8" });
  if (result.status !== 0) {
    facts.set(url, { url, readable: false, codec: null, width: null, height: null, pixelFormat: null, fps: null, durationSeconds: null });
    continue;
  }
  const parsed = JSON.parse(result.stdout) as { streams?: Array<Record<string, unknown>>; format?: Record<string, unknown> };
  const streams = parsed.streams ?? [];
  const stream = streams.find((candidate) => candidate.codec_type === "video") ?? {};
  facts.set(url, {
    url, readable: true,
    codec: typeof stream.codec_name === "string" ? stream.codec_name : null,
    width: typeof stream.width === "number" ? stream.width : null,
    height: typeof stream.height === "number" ? stream.height : null,
    pixelFormat: typeof stream.pix_fmt === "string" ? stream.pix_fmt : null,
    fps: ratio(typeof stream.avg_frame_rate === "string" ? stream.avg_frame_rate : undefined),
    durationSeconds: Number.isFinite(Number(parsed.format?.duration)) ? Number(parsed.format?.duration) : null,
    frameCount: Number.isFinite(Number(stream.nb_frames)) ? Number(stream.nb_frames) : null,
    colorSpace: typeof stream.color_space === "string" ? stream.color_space : null,
    colorTransfer: typeof stream.color_transfer === "string" ? stream.color_transfer : null,
    colorPrimaries: typeof stream.color_primaries === "string" ? stream.color_primaries : null,
    hasAudio: streams.some((candidate) => candidate.codec_type === "audio"),
    sha256: urlsRequiringSha256.has(url) ? sha256(file) : null,
  });
}

const readableAudioUrls = new Set(audioUrls.filter((url) => {
  const file = projectMediaPath(url);
  if (!file || !fs.existsSync(file)) return false;
  const result = spawnSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name", "-of", "csv=p=0", file], { encoding: "utf8" });
  return result.status === 0 && result.stdout.trim().length > 0;
}));
const report = assessPreviewReadiness([...videos, ...renderAuthorityStills], facts, readableAudioUrls);
writeJsonFileAtomic(path.join(root, "preprocess", "preview-readiness.json"), { schema_version: 1, project_id: projectId, checked_at: new Date().toISOString(), ...report });
return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const projectId = process.argv[2];
  if (!projectId) throw new Error("Usage: pnpm preview-readiness <project-id>");
  const report = inspectProjectPreviewReadiness(projectId);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
}
