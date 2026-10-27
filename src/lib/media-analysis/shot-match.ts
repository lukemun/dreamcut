import { execFile } from "node:child_process";
import { readTimeline } from "../local-store/store";
import { cutoutMediaPath } from "./cutout-preparation";
import { MATCHED_DISTANCE, matchSampleFromFrames, solveShotMatch, type MatchStats } from "../color/shot-match";
import { COLOR_GRADE_FIELD_CONFIG, COLOR_GRADE_FIELDS, resolveColorGradeAtTime, resolveSourceColorSpace } from "../timeline/color-grade";
import type { TimelineElement } from "@/components/studio/timeline/types";

const SAMPLE_WIDTH = 160;
const SAMPLES_PER_CLIP = 3;
const DECODE_TIMEOUT_MS = 20_000;

/**
 * Shot match for two picture clips on a project's working timeline. Reads a few frames of each
 * clip's bound picture (inside its trim), measures both as they display with their current grades,
 * and returns the target's exposure, contrast, highlights, temperature, tint and saturation that bring it to
 * the reference. Read-only: the editor applies the values, or an agent proposes them.
 */
export async function shotMatch(projectId: string, body: Record<string, unknown>) {
  const referenceId = body.reference_element_id, targetId = body.target_element_id;
  if (typeof referenceId !== "string" || typeof targetId !== "string") throw new Error("reference_element_id and target_element_id required");
  if (referenceId === targetId) throw new Error("Choose a different clip to match to");
  const elements = readTimeline(projectId).elements.filter((element) => !element.removed_at);
  const pick = (id: string) => {
    const element = elements.find((candidate) => candidate.id === id);
    if (!element) throw new Error(`No clip ${id} on the timeline`);
    if (element.type !== "video_clip" && element.type !== "still") throw new Error("Shot match works on video clips and stills");
    return element;
  };
  const reference = pick(referenceId), target = pick(targetId);
  const targetLocal = typeof body.target_local_seconds === "number" && Number.isFinite(body.target_local_seconds)
    ? Math.min(Math.max(0, body.target_local_seconds), target.duration) : target.duration / 2;
  const [referenceSample, targetSample] = await Promise.all([clipSample(projectId, reference), clipSample(projectId, target)]);
  const result = solveShotMatch({
    reference: referenceSample,
    referenceGrade: resolveColorGradeAtTime(reference.props, reference.duration / 2),
    target: targetSample,
    targetGrade: resolveColorGradeAtTime(target.props, targetLocal),
  });
  const props: Record<string, number> = {};
  for (const field of COLOR_GRADE_FIELDS) {
    const key = COLOR_GRADE_FIELD_CONFIG[field].key;
    if (key in result.changed) props[field] = Number(result.changed[key as keyof typeof result.changed]!.toFixed(COLOR_GRADE_FIELD_CONFIG[field].precision));
  }
  const limits = ["Matches overall brightness spread, cast and colourfulness from three frames per clip; it does not match individual objects or skin.", "Only exposure, contrast, highlights, temperature, tint and saturation change, each within a limited reach; the rest of the target's grade is kept."];
  if (result.distanceBefore < MATCHED_DISTANCE) limits.unshift("The clips already match; nothing to change.");
  else if (result.distanceAfter > 5) limits.push("The shots differ in content or light; the match evens them overall but they will still look like different scenes.");
  if (reference.props?.lut_asset_id != null || target.props?.lut_asset_id != null) limits.push("Look files are not included in the measurement.");
  return {
    reference_element_id: reference.id,
    target_element_id: target.id,
    target_local_seconds: Number(targetLocal.toFixed(3)),
    props,
    distance_before: round(result.distanceBefore),
    distance_after: round(result.distanceAfter),
    reference_stats: stats(result.reference),
    target_stats_before: stats(result.before),
    target_stats_after: stats(result.after),
    scale: "Distances and stats are CIELAB (L 0–100); a distance under about 2 reads as matched.",
    limits,
  };
}

const round = (value: number) => Math.round(value * 100) / 100;
const stats = (value: MatchStats) => ({ lightness_p10: round(value.l10), lightness_p50: round(value.l50), lightness_p90: round(value.l90), cast_a: round(value.castA), cast_b: round(value.castB), chroma: round(value.chroma), clipped_percent: round(value.clipped * 100) });

function mediaRelative(projectId: string, url: unknown) {
  if (typeof url !== "string") return null;
  const prefix = `/api/projects/${projectId}/media/`;
  const pathname = url.startsWith("http") ? new URL(url).pathname : url;
  return pathname.startsWith(prefix) ? decodeURIComponent(pathname.slice(prefix.length).split("?")[0]!) : null;
}

async function clipSample(projectId: string, element: TimelineElement) {
  // The bound picture the renderers draw: its colour space is the clip's own source_color_space.
  const relative = mediaRelative(projectId, element.props?.preview_source_url) ?? mediaRelative(projectId, element.source_url);
  if (!relative) throw new Error(`Clip ${element.id} has no project media to sample`);
  const file = cutoutMediaPath(projectId, relative);
  const { source, maxCllNits } = resolveSourceColorSpace(element.props);
  const rate = typeof element.playback_rate === "number" && element.playback_rate > 0 ? element.playback_rate : 1;
  const times = element.type === "still" ? [0] : Array.from({ length: SAMPLES_PER_CLIP }, (_, index) => (element.trim_start ?? 0) + ((index + 0.5) / SAMPLES_PER_CLIP) * element.duration * rate);
  const codeValues = source.transfer !== "srgb";
  const frames = await Promise.all(times.map((seconds) => decodeRgb48(file, seconds, element.type === "still", codeValues)));
  return matchSampleFromFrames(frames.filter((frame) => frame != null), source, maxCllNits);
}

function decodeRgb48(file: string, seconds: number, still: boolean, codeValues: boolean) {
  // HDR authorities carry HLG/PQ code values tagged BT.709 limited range; read them as such.
  const scale = codeValues ? `scale=${SAMPLE_WIDTH}:-2:in_color_matrix=bt709:in_range=tv:flags=area` : `scale=${SAMPLE_WIDTH}:-2:flags=area`;
  const args = ["-v", "error", ...(still ? [] : ["-ss", String(seconds)]), "-i", file, "-map", "0:v:0", "-frames:v", "1", "-vf", `${scale},format=rgba64le`, "-f", "rawvideo", "-"];
  return new Promise<{ rgba: Uint16Array; width: number; height: number; maxValue: number } | null>((resolve, reject) => {
    execFile("ffmpeg", args, { encoding: "buffer", timeout: DECODE_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
      if (error) return reject(new Error(`Could not read a frame for shot match: ${error.message.slice(0, 300)}`));
      const pixels = stdout.length / 8;
      if (!pixels) return resolve(null);
      const rgba = new Uint16Array(stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + stdout.length));
      resolve({ rgba, width: SAMPLE_WIDTH, height: Math.round(pixels / SAMPLE_WIDTH), maxValue: 65535 });
    });
  });
}
