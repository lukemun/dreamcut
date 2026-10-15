// Builds an audiovisual SFX audition from a frozen source manifest.
//
// The exact same picture, narration, captions, overlays, and existing mix context
// are repeated once per candidate. Only the sound-effect asset changes.
//
// Example:
//   pnpm exec tsx scripts/build-sfx-audition.ts \
//     --source source-project \
//     --audition audition-project \
//     --from 0 --to 10.167 \
//     --manifest projects/audition-project/preprocess/source-manifest.json

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { TimelineElement } from "../src/components/studio/timeline/types";
import { writeAuditionManifest } from "../src/lib/local-store/auditions";
import { projectDir, projectMediaDir } from "../src/lib/local-store/paths";
import {
  newId,
  newRowTimestamps,
  readMetadata,
  readTimeline,
  writeMetadata,
  writeTimeline,
} from "../src/lib/local-store/store";

type Candidate = {
  candidate_key: string;
  title: string;
  creator: string;
  source_page_url: string;
  local_path: string;
  element_type?: "sound_effect" | "music";
  trim_start_seconds?: number;
  fade_in_seconds?: number;
  fade_out_seconds?: number;
  timeline_offset_seconds?: number;
  waveform_peak_seconds?: number;
  alignment_event_label?: string;
  alignment_event_seconds?: number;
  measured_duration_seconds: number;
  review_target_lufs: number;
  review_gain: number;
  content_id_registered: boolean;
  source_status: string;
};

type SourceManifest = {
  schema_version: number;
  purpose: string;
  audition_title?: string;
  section_id?: string;
  section_label?: string;
  script_text?: string;
  variable_label?: string;
  pass_label_role?: string;
  exclude_lane_keys?: string[];
  license: { name: string; summary_url: string };
  assets: Candidate[];
};

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const sourceProject = argValue("--source");
const auditionProject = argValue("--audition");
const manifestArg = argValue("--manifest");
const from = Number(argValue("--from") ?? 0);
const to = Number(argValue("--to") ?? 10);
const gap = Number(argValue("--gap") ?? 0.5);
const fps = 30;
const q = (seconds: number) => Math.round(seconds * fps) / fps;

if (!sourceProject || !auditionProject || !manifestArg) {
  throw new Error("--source, --audition, and --manifest are required");
}
if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
  throw new Error("--from and --to must define a positive interval");
}

const manifestPath = path.resolve(manifestArg);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as SourceManifest;
if (manifest.schema_version !== 1 || manifest.assets.length < 2) {
  throw new Error("The source manifest must contain at least two schema-v1 candidates");
}

const duration = q(to - from);
const sourceTimeline = readTimeline(sourceProject);
const sourceMetadata = readMetadata(sourceProject);
const mutedLaneKeys = new Set(sourceMetadata.muted_lane_keys);
const excludedLaneKeys = new Set(manifest.exclude_lane_keys ?? []);
const rows = sourceTimeline.elements.filter((row) =>
  row.removed_at == null
  && !mutedLaneKeys.has(row.lane_key)
  && !excludedLaneKeys.has(row.lane_key)
  && row.timeline_start + row.duration > from + 0.001
  && row.timeline_start < to - 0.001);

const anchorRow = rows.find((row) => row.type === "video_clip")
  ?? rows.find((row) => row.type === "still")
  ?? rows.find((row) => row.type === "caption_text");
if (!anchorRow) throw new Error("The source interval has no active visual element to anchor audition playback");

const fresh: TimelineElement[] = [];
const candidateIds: Record<string, { anchor: string; label: string; sfx: string }> = {};

manifest.assets.forEach((candidate, index) => {
  const base = q(index * (duration + gap));
  let anchorId = "";

  for (const row of rows) {
    const clone = structuredClone(row);
    const clampedStart = Math.max(row.timeline_start, from);
    const clampedEnd = Math.min(row.timeline_start + row.duration, to);
    clone.id = newId();
    clone.project_id = auditionProject;
    clone.timeline_start = q(base + clampedStart - from);
    clone.duration = q(clampedEnd - clampedStart);
    if (row.type === "video_clip" || row.type === "vo_segment" || row.type === "vo_full") {
      clone.trim_start = Number((row.trim_start + clampedStart - row.timeline_start).toFixed(3));
    }
    clone.props = {
      ...(clone.props ?? {}),
      audition_candidate_id: candidate.candidate_key,
      audition_source_project_id: sourceProject,
      audition_source_interval: [from, to],
    };
    Object.assign(clone, newRowTimestamps());
    if (!anchorId && row.id === anchorRow.id) anchorId = clone.id;
    fresh.push(clone);
  }

  const timelineOffset = q(candidate.timeline_offset_seconds ?? 0);
  const remainingWindow = Math.max(0, duration - timelineOffset);
  const sfxId = newId();
  fresh.push({
    id: sfxId,
    project_id: auditionProject,
    type: candidate.element_type ?? "sound_effect",
    source_url: `/api/projects/${auditionProject}/${candidate.local_path}`,
    props: {
      title: `${candidate.candidate_key} · ${candidate.title}`,
      timeline_label:
        `${candidate.candidate_key} · ${
          manifest.variable_label?.toUpperCase()
          ?? (candidate.element_type === "music" ? "SUSPENSE BED" : "NEWS STINGER")
        }`,
      audition_candidate_id: candidate.candidate_key,
      source_page_url: candidate.source_page_url,
      creator: candidate.creator,
      source_status: candidate.source_status,
      content_id_registered: candidate.content_id_registered,
      loudness_normalization: {
        action: "explicit audition level match",
        target_lufs: candidate.review_target_lufs,
        gain: candidate.review_gain,
      },
      audition_alignment: {
        event_label: candidate.alignment_event_label ?? null,
        event_seconds: candidate.alignment_event_seconds ?? null,
        waveform_peak_seconds: candidate.waveform_peak_seconds ?? null,
        timeline_offset_seconds: timelineOffset,
        alignment_error_seconds:
          candidate.alignment_event_seconds != null && candidate.waveform_peak_seconds != null
            ? Number((
              timelineOffset
              + candidate.waveform_peak_seconds
              - candidate.alignment_event_seconds
            ).toFixed(6))
            : null,
      },
    },
    beat_id: null,
    voice_clip_id: null,
    character_id: null,
    timeline_start: q(base + timelineOffset),
    duration: Math.min(
      Math.max(0, candidate.measured_duration_seconds - (candidate.trim_start_seconds ?? 0)),
      remainingWindow,
    ),
    lane_key: candidate.element_type === "music" ? "music_audition" : "sound_effect_0",
    lane_index: 0,
    trim_start: candidate.trim_start_seconds ?? 0,
    trim_end: null,
    volume: candidate.review_gain,
    fade_in: candidate.fade_in_seconds ?? 0.01,
    fade_out: candidate.fade_out_seconds ?? 0.03,
    playback_rate: 1,
    position_locked: false,
    removed_at: null,
    removed_reason: null,
    ...newRowTimestamps(),
  });

  const labelId = newId();
  fresh.push({
    id: labelId,
    project_id: auditionProject,
    type: "caption_text",
    source_url: null,
    props: {
      text: `${candidate.candidate_key} · ${candidate.title.toUpperCase()}`,
      positionPreset: "top_center",
      fontPreset: "teko",
      styleVariant: "black_card",
      fontSizePx: 54,
      maxWidth: 0.92,
      absX: 0.04,
      absY: 0.025,
      offsetX: 0,
      offsetY: 0,
      textAlign: "center",
      textColor: null,
      animationIn: "none",
      animationOut: "none",
      animationInDuration: 0,
      animationOutDuration: 0,
      audition_label_for: candidate.candidate_key,
    },
    beat_id: null,
    voice_clip_id: null,
    character_id: null,
    timeline_start: base,
    duration,
    lane_key: "captions_audition_label",
    lane_index: 0,
    trim_start: 0,
    trim_end: null,
    volume: 0,
    fade_in: 0,
    fade_out: 0,
    playback_rate: 1,
    position_locked: false,
    removed_at: null,
    removed_reason: null,
    ...newRowTimestamps(),
  });

  candidateIds[candidate.candidate_key] = { anchor: anchorId, label: labelId, sfx: sfxId };
});

writeTimeline(
  auditionProject,
  { elements: fresh, transitions: [] },
  "build_contextual_sfx_audition",
);
writeMetadata(
  auditionProject,
  {
    ...sourceMetadata,
    lane_order_keys: [...new Set([
      "captions_audition_label",
      ...sourceMetadata.lane_order_keys.filter(
        (key) => !mutedLaneKeys.has(key) && !excludedLaneKeys.has(key),
      ),
      "sound_effect_0",
      "music_audition",
    ])],
    muted_lane_keys: [],
    title: manifest.audition_title ?? "The Cover Report — News Stinger Audition",
  },
  "configure_contextual_sfx_audition",
);

const thumbDir = path.join(projectMediaDir(auditionProject), "thumbs");
fs.mkdirSync(thumbDir, { recursive: true });
const sourcePrefix = `/api/projects/${sourceProject}/media/`;
const anchorSourceUrl = anchorRow.source_url
  ?? (
    anchorRow.type === "caption_text"
    && Array.isArray(anchorRow.props?.mediaFillUrls)
    && typeof anchorRow.props.mediaFillUrls[0] === "string"
      ? anchorRow.props.mediaFillUrls[0]
      : null
  );
if (!anchorSourceUrl?.startsWith(sourcePrefix)) {
  throw new Error(`Unsupported thumbnail source URL: ${anchorSourceUrl ?? "missing"}`);
}
const thumbnailSource = path.join(
  projectMediaDir(sourceProject),
  anchorSourceUrl.slice(sourcePrefix.length),
);
const thumbnailIsVideo = anchorRow.type === "video_clip";
for (const candidate of manifest.assets) {
  const ffmpegArgs = [
    "-v", "error",
    ...(thumbnailIsVideo ? ["-ss", String(anchorRow.trim_start + 0.5)] : []),
    "-i", thumbnailSource,
    "-frames:v", "1",
    "-vf",
    `scale=360:-1,drawbox=y=0:w=iw:h=68:color=black@0.84:t=fill,`
      + `drawtext=text='${candidate.candidate_key} · ${candidate.title.replace(/'/g, "")}':`
      + "fontcolor=white:fontsize=25:x=(w-text_w)/2:y=19",
    path.join(thumbDir, `${candidate.candidate_key}.jpg`),
    "-y",
  ];
  execFileSync("ffmpeg", ffmpegArgs);
}

writeAuditionManifest(auditionProject, {
  schema_version: 1,
  project_id: auditionProject,
  updated_at: new Date().toISOString(),
  source_note:
    `Contextual SFX audition sourced from ${sourceProject} ${from.toFixed(3)}s–${to.toFixed(3)}s. `
    + "CONTROLS HELD FIXED: picture, narration, captions, overlays, crop, and duration. "
    + "VARIABLE: the audio treatment only. Every candidate carries an explicit, non-destructive element gain and edge fades; "
    + "the source receipt records its role-appropriate review target. "
    + `Sources are preserved under ${manifest.license.name}; license receipt: ${manifest.license.summary_url}. `
    + (
      manifest.assets.some((candidate) => candidate.content_id_registered)
        ? `Content ID notice: ${manifest.assets
          .filter((candidate) => candidate.content_id_registered)
          .map((candidate) => `candidate ${candidate.candidate_key}`)
          .join(", ")}.`
        : "No source page displayed a Content ID notice."
    ),
  sections: [{
    id: manifest.section_id ?? "cold-open-news-stinger",
    order: 0,
    label: manifest.section_label ?? "Cold-open news stinger",
    script_text: manifest.script_text
      ?? "Today’s forecast: dark imagery, enormous titles, and a 96% chance of high contrast. But which of these conventions can you actually break?",
    winner_candidate_id: null,
    candidates: manifest.assets.map((candidate) => ({
      id: `audio-treatment-${candidate.candidate_key.toLowerCase()}`,
      take_id: candidate.candidate_key,
      timeline_element_id: candidateIds[candidate.candidate_key].anchor,
      label_element_id: candidateIds[candidate.candidate_key].label,
      source_url: `/api/projects/${auditionProject}/${candidate.local_path}`,
      thumbnail_url: `/api/projects/${auditionProject}/media/thumbs/${candidate.candidate_key}.jpg`,
      source_start_seconds: candidate.trim_start_seconds ?? 0,
      source_end_seconds: Math.min(
        candidate.measured_duration_seconds,
        (candidate.trim_start_seconds ?? 0) + duration,
      ),
      duration_seconds: duration,
      pass_label:
        `${manifest.pass_label_role
          ?? (candidate.element_type === "music" ? "music bed" : "news stinger")} @ `
        + `${candidate.review_target_lufs} LUFS · voice and picture preserved`,
      source_label:
        `${candidate.title} · ${candidate.creator}`
        + (candidate.content_id_registered ? " · Content ID registered" : ""),
    })),
  }],
});

fs.writeFileSync(
  path.join(projectDir(auditionProject), "analysis", "audition-build-receipt.json"),
  `${JSON.stringify({
    schema_version: 1,
    created_at: new Date().toISOString(),
    builder: "scripts/build-sfx-audition.ts",
    source_project_id: sourceProject,
    audition_project_id: auditionProject,
    source_interval_seconds: [from, to],
    controls_held_fixed: [
      "picture",
      "narration",
      "captions",
      "overlays",
      "crop",
      "duration",
    ],
    excluded_source_lanes: [...excludedLaneKeys],
    variable: manifest.variable_label ?? "news stinger",
    alignment: manifest.assets.map((candidate) => ({
      candidate_key: candidate.candidate_key,
      event_label: candidate.alignment_event_label ?? null,
      event_seconds: candidate.alignment_event_seconds ?? null,
      waveform_peak_seconds: candidate.waveform_peak_seconds ?? null,
      timeline_offset_seconds: q(candidate.timeline_offset_seconds ?? 0),
      alignment_error_seconds:
        candidate.alignment_event_seconds != null && candidate.waveform_peak_seconds != null
          ? Number((
            q(candidate.timeline_offset_seconds ?? 0)
            + candidate.waveform_peak_seconds
            - candidate.alignment_event_seconds
          ).toFixed(6))
          : null,
    })),
    candidate_element_ids: candidateIds,
  }, null, 2)}\n`,
);

console.log(`${manifest.assets.length} contextual audio candidates · ${duration}s each · ${fresh.length} elements`);
console.log(`open http://127.0.0.1:3123/p/${auditionProject}`);
