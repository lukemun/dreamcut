import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { TimelineElement } from "@/components/studio/timeline/types";
import type { TimelineAspectRatioValue } from "@/lib/aspect-ratios";
import { writeJsonFileAtomic } from "@/lib/local-store/atomic-json";
import { readAuditionManifest, writeAuditionManifest } from "@/lib/local-store/auditions";
import { projectDir, projectExists, projectMediaDir } from "@/lib/local-store/paths";
import {
  createProject,
  newId,
  newRowTimestamps,
  readMetadata,
  readTimeline,
  writeMetadata,
  writeTimeline,
  type TimelineFile,
} from "@/lib/local-store/store";
import { installScriptFailureReporter } from "./lib/script-error";

installScriptFailureReporter("AUDITION_BUILD_FAILED");

type AuditionCandidateRequest = {
  id: string;
  label: string;
  source_path: string;
  audio_path?: string;
  audio_label?: string;
  audio_source_start_seconds?: number;
  audio_source_end_seconds?: number;
  audio_source_status?: "licensed" | "owned" | "generated" | "unknown";
  pass_label?: string;
  source_label?: string;
  source_start_seconds?: number;
  source_end_seconds?: number;
  segments?: Array<{
    source_start_seconds: number;
    source_end_seconds: number;
    outgoing_word?: string;
    incoming_word?: string;
    reason?: string;
  }>;
};

type TakeAuditionRequest = {
  project_id: string;
  title: string;
  section_id: string;
  section_label: string;
  script_text: string;
  source_note: string;
  delivery_target?: "web" | "feed" | "reels" | "tiktok" | "shorts";
  output_aspect_ratio?: TimelineAspectRatioValue;
  append_to_existing?: boolean;
  placement?: "prepend" | "append";
  candidates: AuditionCandidateRequest[];
};

type Probe = {
  duration_seconds: number;
  frame_count: number;
  width: number;
  height: number;
};

type AudioProbe = {
  duration_seconds: number;
};

const FPS = 30;
const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const CANDIDATE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function argumentAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readRequest(): TakeAuditionRequest {
  const encoded = argumentAfter("--request-base64");
  if (!encoded) {
    throw new Error("Usage: pnpm build-take-audition --request-base64 <base64-json>");
  }
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as TakeAuditionRequest;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function frameSeconds(frame: number): number {
  return frame / FPS;
}

function roundFrame(seconds: number): number {
  return Math.round(seconds * FPS);
}

function probeVideo(sourcePath: string): Probe {
  const output = execFileSync("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height:stream_side_data=rotation:format=duration",
    "-of", "json",
    sourcePath,
  ], { encoding: "utf8" });
  const parsed = JSON.parse(output) as {
    streams?: Array<{
      width?: number;
      height?: number;
      side_data_list?: Array<{ rotation?: number }>;
    }>;
    format?: { duration?: string };
  };
  const stream = parsed.streams?.[0];
  const rawDuration = Number(parsed.format?.duration);
  if (!stream || !Number.isFinite(rawDuration) || rawDuration <= 0) {
    throw new Error(`Could not probe a playable video stream: ${sourcePath}`);
  }
  // The audition timeline runs at 30fps, but source media can be 60fps or VFR.
  // `nb_frames` belongs to the source cadence, so dividing it by the timeline FPS
  // doubles a 60fps clip's duration and produces incorrect source trim authority.
  // Quantize the probed wall-clock duration onto the timeline clock instead.
  const frameCount = roundFrame(rawDuration);
  const encodedWidth = finite(stream.width, `${sourcePath} width`);
  const encodedHeight = finite(stream.height, `${sourcePath} height`);
  const rotation = stream.side_data_list?.find((entry) => Number.isFinite(entry.rotation))?.rotation ?? 0;
  const swapsAxes = Math.abs(rotation) % 180 === 90;
  return {
    duration_seconds: frameSeconds(frameCount),
    frame_count: frameCount,
    width: swapsAxes ? encodedHeight : encodedWidth,
    height: swapsAxes ? encodedWidth : encodedHeight,
  };
}

function probeAudio(sourcePath: string): AudioProbe {
  const output = execFileSync("ffprobe", [
    "-v", "error",
    "-select_streams", "a:0",
    "-show_entries", "format=duration",
    "-of", "json",
    sourcePath,
  ], { encoding: "utf8" });
  const parsed = JSON.parse(output) as { format?: { duration?: string } };
  const duration = Number(parsed.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not probe a playable audio stream: ${sourcePath}`);
  }
  return { duration_seconds: duration };
}

function sha256(filePath: string): string {
  const hash = crypto.createHash("sha256");
  const handle = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const bytes = fs.readSync(handle, buffer, 0, buffer.length, null);
      if (bytes === 0) break;
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(handle);
  }
  return hash.digest("hex");
}

function hardLinkOrCopy(sourcePath: string, destinationPath: string): void {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  try {
    fs.linkSync(sourcePath, destinationPath);
  } catch {
    fs.copyFileSync(sourcePath, destinationPath);
  }
}

function copyOriginal(sourcePath: string, destinationPath: string): void {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);
}

function timelineElement(
  projectId: string,
  partial: Partial<TimelineElement>
    & Pick<TimelineElement, "type" | "timeline_start" | "duration" | "lane_key" | "lane_index">,
): TimelineElement {
  return {
    id: newId(),
    project_id: projectId,
    source_url: null,
    props: {},
    beat_id: null,
    voice_clip_id: null,
    character_id: null,
    trim_start: 0,
    trim_end: null,
    volume: 1,
    fade_in: 0,
    fade_out: 0,
    playback_rate: 1,
    position_locked: false,
    removed_at: null,
    removed_reason: null,
    ...newRowTimestamps(),
    ...partial,
  } as TimelineElement;
}

function mediaUrl(projectId: string, relativePath: string): string {
  return `/api/projects/${projectId}/media/${relativePath.split(path.sep).join("/")}`;
}

const request = readRequest();
if (!PROJECT_ID_PATTERN.test(request.project_id)) {
  throw new Error("project_id must contain lowercase letters, digits, and hyphens");
}
const appendingToExisting = projectExists(request.project_id);
if (appendingToExisting && !request.append_to_existing) {
  throw new Error(`Audition project already exists: ${request.project_id}`);
}
if (!appendingToExisting && request.append_to_existing) {
  throw new Error(`Cannot append to missing audition project: ${request.project_id}`);
}
if (!request.title?.trim() || !request.section_id?.trim() || !request.section_label?.trim()) {
  throw new Error("title, section_id, and section_label are required");
}
if (!request.script_text?.trim() || !request.source_note?.trim()) {
  throw new Error("script_text and source_note are required");
}
if (!Array.isArray(request.candidates) || request.candidates.length < 2) {
  throw new Error("A take audition requires at least two candidates");
}

const ids = new Set<string>();
const stagedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-take-audition-"));

let projectCreated = false;

try {
  const prepared = request.candidates.map((candidate, index) => {
    if (!CANDIDATE_ID_PATTERN.test(candidate.id)) {
      throw new Error(`Invalid candidate id: ${candidate.id}`);
    }
    if (ids.has(candidate.id)) throw new Error(`Duplicate candidate id: ${candidate.id}`);
    ids.add(candidate.id);
    if (!candidate.label?.trim()) throw new Error(`${candidate.id}.label is required`);

    const sourcePath = path.resolve(candidate.source_path);
    if (!fs.existsSync(sourcePath)) throw new Error(`Missing source: ${sourcePath}`);
    const probe = probeVideo(sourcePath);
    const segmentRequests = candidate.segments?.length
      ? candidate.segments
      : [{
          source_start_seconds: candidate.source_start_seconds ?? 0,
          source_end_seconds: candidate.source_end_seconds ?? probe.duration_seconds,
        }];
    const segments = segmentRequests.map((segment, segmentIndex) => {
      const startFrame = roundFrame(finite(
        segment.source_start_seconds,
        `${candidate.id}.segments[${segmentIndex}].source_start_seconds`,
      ));
      const endFrame = roundFrame(finite(
        segment.source_end_seconds,
        `${candidate.id}.segments[${segmentIndex}].source_end_seconds`,
      ));
      if (startFrame < 0 || endFrame <= startFrame || endFrame > probe.frame_count) {
        throw new Error(
          `${candidate.id}.segments[${segmentIndex}] must fit inside 0–${probe.duration_seconds}s`,
        );
      }
      return {
        sourceStart: frameSeconds(startFrame),
        sourceEnd: frameSeconds(endFrame),
        duration: frameSeconds(endFrame - startFrame),
        outgoingWord: segment.outgoing_word?.trim() || null,
        incomingWord: segment.incoming_word?.trim() || null,
        reason: segment.reason?.trim() || null,
      };
    });
    for (let segmentIndex = 1; segmentIndex < segments.length; segmentIndex += 1) {
      if (segments[segmentIndex].sourceStart < segments[segmentIndex - 1].sourceEnd) {
        throw new Error(`${candidate.id}.segments must be chronological and non-overlapping`);
      }
    }
    if (candidate.audio_path && segments.length > 1) {
      throw new Error(`${candidate.id} cannot combine external audio with a segmented source edit`);
    }

    const sourceStart = segments[0].sourceStart;
    const sourceEnd = segments.at(-1)!.sourceEnd;
    const duration = segments.reduce((sum, segment) => sum + segment.duration, 0);
    const originalExtension = path.extname(sourcePath).toLowerCase() || ".mp4";
    const originalRelative = path.join("sources", `${candidate.id}${originalExtension}`);
    const previewRelative = path.join("previews", `${candidate.id}-preview.mp4`);
    const thumbnailRelative = path.join("thumbs", `${candidate.id}.jpg`);
    const stagedPreview = path.join(stagedRoot, previewRelative);
    const stagedThumbnail = path.join(stagedRoot, thumbnailRelative);
    fs.mkdirSync(path.dirname(stagedPreview), { recursive: true });
    fs.mkdirSync(path.dirname(stagedThumbnail), { recursive: true });

    execFileSync("ffmpeg", [
      "-y", "-v", "error",
      "-i", sourcePath,
      "-vf",
      "fps=30,scale=720:1280:force_original_aspect_ratio=decrease:flags=area,"
        + "pad=720:1280:(ow-iw)/2:(oh-ih)/2:black,setsar=1",
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "22",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "160k",
      "-ar", "48000",
      "-movflags", "+faststart",
      stagedPreview,
    ]);

    const thumbnailSecond = Math.min(2, Math.max(0, duration - 0.5));
    execFileSync("ffmpeg", [
      "-y", "-v", "error",
      "-ss", String(sourceStart + thumbnailSecond),
      "-i", stagedPreview,
      "-frames:v", "1",
      "-vf", "scale=270:480:flags=area",
      "-q:v", "3",
      stagedThumbnail,
    ]);

    const audio = (() => {
      if (!candidate.audio_path) return null;
      const audioPath = path.resolve(candidate.audio_path);
      if (!fs.existsSync(audioPath)) throw new Error(`Missing candidate audio: ${audioPath}`);
      const audioProbe = probeAudio(audioPath);
      const audioStart = candidate.audio_source_start_seconds == null
        ? 0
        : finite(candidate.audio_source_start_seconds, `${candidate.id}.audio_source_start_seconds`);
      const audioEnd = candidate.audio_source_end_seconds == null
        ? audioStart + duration
        : finite(candidate.audio_source_end_seconds, `${candidate.id}.audio_source_end_seconds`);
      if (audioStart < 0 || audioEnd <= audioStart || audioEnd > audioProbe.duration_seconds + 0.001) {
        throw new Error(`${candidate.id} audio window must fit inside 0–${audioProbe.duration_seconds}s`);
      }
      if (Math.abs((audioEnd - audioStart) - duration) > 1 / FPS) {
        throw new Error(`${candidate.id} audio window must match its ${duration}s candidate duration`);
      }
      const extension = path.extname(audioPath).toLowerCase() || ".mp3";
      return {
        sourcePath: audioPath,
        probe: audioProbe,
        start: audioStart,
        end: audioEnd,
        relative: path.join("audio", `${candidate.id}-bed${extension}`),
        sha256: sha256(audioPath),
      };
    })();

    return {
      index,
      candidate,
      sourcePath,
      probe,
      segments,
      sourceStart,
      sourceEnd,
      duration,
      originalRelative,
      previewRelative,
      thumbnailRelative,
      stagedPreview,
      stagedThumbnail,
      sourceSha256: sha256(sourcePath),
      previewSha256: sha256(stagedPreview),
      audio,
    };
  });

  const existingTimeline: TimelineFile = appendingToExisting
    ? readTimeline(request.project_id)
    : { elements: [], transitions: [] };
  const existingAudition = appendingToExisting
    ? readAuditionManifest(request.project_id)
    : null;
  if (appendingToExisting && !existingAudition) {
    throw new Error(`Existing project has no audition manifest: ${request.project_id}`);
  }
  if (existingAudition?.sections.some((section) => section.id === request.section_id)) {
    throw new Error(`Audition section already exists: ${request.section_id}`);
  }

  if (!appendingToExisting) {
    createProject(
      request.project_id,
      request.delivery_target ?? "reels",
      request.title.trim(),
      // An agent assembly/audition flow authors this project, so it opens with the
      // assembly grant: MCP mutation tools may write it directly until the first human
      // edit clears the latch (store.ts "Agent-workspace latch").
      { agentWorkspace: true },
    );
    projectCreated = true;
  }
  const mediaDir = projectMediaDir(request.project_id);
  for (const item of prepared) {
    for (const relativePath of [
      item.originalRelative,
      item.previewRelative,
      item.thumbnailRelative,
      item.audio?.relative,
    ].filter((value): value is string => Boolean(value))) {
      const destinationPath = path.join(mediaDir, relativePath);
      if (fs.existsSync(destinationPath)) {
        throw new Error(`Refusing to overwrite audition media: ${destinationPath}`);
      }
    }
  }
  for (const item of prepared) {
    // Originals are copied, not hard-linked: mutating either the user's intake
    // file or the project authority must never alter the other inode.
    copyOriginal(item.sourcePath, path.join(mediaDir, item.originalRelative));
    if (item.audio) copyOriginal(item.audio.sourcePath, path.join(mediaDir, item.audio.relative));
    hardLinkOrCopy(item.stagedPreview, path.join(mediaDir, item.previewRelative));
    hardLinkOrCopy(item.stagedThumbnail, path.join(mediaDir, item.thumbnailRelative));
  }

  const addedDuration = prepared.reduce((sum, item) => sum + item.duration, 0);
  const placement = request.placement ?? "append";
  const existingEnd = existingTimeline.elements.reduce(
    (maximum, element) => Math.max(maximum, element.timeline_start + element.duration),
    0,
  );
  let timelineStart = placement === "prepend" ? 0 : existingEnd;
  const elements: TimelineElement[] = [];
  const manifestCandidates = prepared.map((item) => {
    const candidateId = `${request.section_id}-${item.candidate.id}`;
    const sourceUrl = mediaUrl(request.project_id, item.originalRelative);
    const previewUrl = mediaUrl(request.project_id, item.previewRelative);
    const thumbnailUrl = mediaUrl(request.project_id, item.thumbnailRelative);
    const candidateTimelineStart = timelineStart;
    const videos = item.segments.map((segment, segmentIndex) => {
      const segmentVideo = timelineElement(request.project_id, {
        type: "video_clip",
        source_url: sourceUrl,
        timeline_start: timelineStart,
        duration: segment.duration,
        trim_start: segment.sourceStart,
        trim_end: item.probe.duration_seconds - segment.sourceEnd,
        lane_key: "visual_0",
        lane_index: 0,
        props: {
          source_duration_seconds: item.probe.duration_seconds,
          source_width: 720,
          source_height: 1280,
          source_probe_width: item.probe.width,
          source_probe_height: item.probe.height,
          source_probe_fps: FPS,
          source_aspect_ratio: 9 / 16,
          preview_source_url: previewUrl,
          preview_audio_source_url: previewUrl,
          preview_audio_baked_gain: 1,
          render_authority_source_url: sourceUrl,
          render_authority_sha256: item.sourceSha256,
          preview_proxy_sha256: item.previewSha256,
          source_sha256: item.sourceSha256,
          preview_sha256: item.previewSha256,
          source_segment_index: segmentIndex,
          source_segment_count: item.segments.length,
          source_segment_outgoing_word: segment.outgoingWord,
          source_segment_incoming_word: segment.incomingWord,
          source_segment_reason: segment.reason,
          animationIn: "none",
          animationOut: "none",
          media_scale: 1,
          media_offset_x: 0,
          media_offset_y: 0,
          media_opacity: 1,
          audition_section_id: request.section_id,
          audition_candidate_id: candidateId,
          audition_winner: false,
          selection: "audition-candidate",
          selected_for: null,
        },
      });
      timelineStart += segment.duration;
      return segmentVideo;
    });
    const video = videos[0];
    const associatedElementIds: string[] = [];
    associatedElementIds.push(...videos.slice(1).map((element) => element.id));
    if (item.audio) {
      const music = timelineElement(request.project_id, {
        type: "music",
        source_url: mediaUrl(request.project_id, item.audio.relative),
        timeline_start: candidateTimelineStart,
        duration: item.duration,
        trim_start: item.audio.start,
        trim_end: Math.max(0, item.audio.probe.duration_seconds - item.audio.end),
        lane_key: "music_0",
        lane_index: 0,
        fade_in: Math.min(0.25, item.duration / 4),
        fade_out: Math.min(0.25, item.duration / 4),
        props: {
          source_duration_seconds: item.audio.probe.duration_seconds,
          source_sha256: item.audio.sha256,
          audio_label: item.candidate.audio_label?.trim() || item.candidate.label,
          catalog_source_status: item.candidate.audio_source_status ?? "unknown",
          audition_section_id: request.section_id,
          audition_candidate_id: candidateId,
          audition_winner: false,
          selection: "audition-candidate",
          selected_for: null,
        },
      });
      elements.push(music);
      associatedElementIds.push(music.id);
    }
    const label = timelineElement(request.project_id, {
      type: "caption_text",
      timeline_start: candidateTimelineStart,
      duration: Math.min(5, item.duration),
      lane_key: "captions_0",
      lane_index: 0,
      props: {
        text: `${String.fromCharCode(65 + item.index)} · ${item.candidate.label}`.toUpperCase(),
        fontSizePx: 80,
        maxWidth: 0.88,
        positionPreset: "top_center",
        fontPreset: "teko",
        styleVariant: "bold_outline",
        absX: 0.06,
        absY: 0.15,
        offsetX: 0,
        offsetY: 0,
        textAlign: "center",
        textColor: "#FFFFFF",
        animationIn: "none",
        animationOut: "none",
        animationInDuration: 0,
        animationOutDuration: 0,
        audition_section_id: request.section_id,
        audition_candidate_id: candidateId,
      },
    });
    elements.push(...videos, label);

    return {
      id: candidateId,
      take_id: item.candidate.id,
      timeline_element_id: video.id,
      label_element_id: label.id,
      associated_element_ids: associatedElementIds.length > 0 ? associatedElementIds : undefined,
      source_url: sourceUrl,
      thumbnail_url: thumbnailUrl,
      source_start_seconds: item.sourceStart,
      source_end_seconds: item.sourceEnd,
      duration_seconds: item.duration,
      pass_label: item.candidate.pass_label?.trim()
        || `${String.fromCharCode(65 + item.index)} · ${item.candidate.label}`,
      source_label: item.candidate.source_label?.trim() || item.candidate.label,
    };
  });

  const existingElements = placement === "prepend"
    ? existingTimeline.elements.map((element) => ({
        ...element,
        timeline_start: element.timeline_start + addedDuration,
      }))
    : existingTimeline.elements;
  const timeline: TimelineFile = {
    elements: placement === "prepend"
      ? [...elements, ...existingElements]
      : [...existingElements, ...elements],
    transitions: existingTimeline.transitions,
  };
  writeTimeline(
    request.project_id,
    timeline,
    appendingToExisting ? "append_take_audition_section" : "create_take_audition",
  );
  const updatedAt = new Date().toISOString();
  const existingSections = existingAudition?.sections ?? [];
  const sectionOrder = placement === "prepend"
    ? 0
    : existingSections.reduce((maximum, section) => Math.max(maximum, section.order), -1) + 1;
  const retainedSections = placement === "prepend"
    ? existingSections.map((section) => ({ ...section, order: section.order + 1 }))
    : existingSections;
  const newSection = {
    id: request.section_id,
    order: sectionOrder,
    label: request.section_label.trim(),
    script_text: request.script_text.trim(),
    winner_candidate_id: null,
    candidates: manifestCandidates,
  };
  writeAuditionManifest(request.project_id, {
    schema_version: 1,
    project_id: request.project_id,
    source_note: request.source_note.trim(),
    updated_at: updatedAt,
    sections: placement === "prepend"
      ? [newSection, ...retainedSections]
      : [...retainedSections, newSection],
  });
  writeMetadata(request.project_id, {
    ...readMetadata(request.project_id),
    title: request.title.trim(),
    output_aspect_ratio: request.output_aspect_ratio ?? "9:16",
    lane_order_keys: prepared.some((item) => item.audio)
      ? ["captions_0", "visual_0", "music_0"]
      : ["captions_0", "visual_0"],
    muted_lane_keys: [],
  }, "configure_take_audition");

  const receiptPath = path.join(projectDir(request.project_id), "analysis", "audition-build.json");
  const previousReceipt = appendingToExisting && fs.existsSync(receiptPath)
    ? JSON.parse(fs.readFileSync(receiptPath, "utf8")) as {
        created_at?: string;
        candidates?: unknown[];
        section_additions?: unknown[];
      }
    : null;
  writeJsonFileAtomic(receiptPath, {
    schema_version: 1,
    project_id: request.project_id,
    created_at: previousReceipt?.created_at ?? updatedAt,
    updated_at: updatedAt,
    builder: "build-take-audition-v2",
    fps: FPS,
    controls_held_fixed: [
      "candidate order is chronological",
      "source-bounded candidate window retained with original handles",
      "full-source 720x1280 H.264/AAC timing-parity preview recipe",
      "unity gain",
      "no inferred winner",
    ],
    candidates: [...(previousReceipt?.candidates ?? []), ...prepared.map((item, index) => ({
      id: item.candidate.id,
      order: index,
      section_id: request.section_id,
      source_path: item.sourcePath,
      source_sha256: item.sourceSha256,
      source_duration_seconds: item.probe.duration_seconds,
      source_frame_count: item.probe.frame_count,
      source_window: [item.sourceStart, item.sourceEnd],
      source_segments: item.segments.map((segment, segmentIndex) => ({
        index: segmentIndex,
        source_window: [segment.sourceStart, segment.sourceEnd],
        duration_seconds: segment.duration,
        outgoing_word: segment.outgoingWord,
        incoming_word: segment.incomingWord,
        reason: segment.reason,
        removed_before_next: item.segments[segmentIndex + 1]
          ? [segment.sourceEnd, item.segments[segmentIndex + 1].sourceStart]
          : null,
      })),
      preview_url: mediaUrl(request.project_id, item.previewRelative),
      preview_sha256: item.previewSha256,
      thumbnail_url: mediaUrl(request.project_id, item.thumbnailRelative),
      audio: item.audio ? {
        source_path: item.audio.sourcePath,
        source_sha256: item.audio.sha256,
        source_duration_seconds: item.audio.probe.duration_seconds,
        source_window: [item.audio.start, item.audio.end],
        timeline_source_url: mediaUrl(request.project_id, item.audio.relative),
      } : null,
    }))],
    section_additions: [...(previousReceipt?.section_additions ?? []), {
      section_id: request.section_id,
      placement,
      added_at: updatedAt,
      candidate_ids: prepared.map((item) => item.candidate.id),
      duration_seconds: addedDuration,
    }],
  });

  process.stdout.write(`${JSON.stringify({
    project_id: request.project_id,
    url: `http://127.0.0.1:3123/p/${request.project_id}`,
    candidate_count: manifestCandidates.length,
    section_count: retainedSections.length + 1,
    added_duration_seconds: addedDuration,
    duration_seconds: existingEnd + addedDuration,
    winner_candidate_id: null,
  })}\n`);
} catch (error) {
  if (projectCreated && projectExists(request.project_id)) {
    fs.rmSync(projectDir(request.project_id), { recursive: true, force: true });
  }
  throw error;
} finally {
  fs.rmSync(stagedRoot, { recursive: true, force: true });
}
