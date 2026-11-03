import fs from "node:fs";
import path from "node:path";

import type { TimelineElement } from "@/components/studio/timeline/types";
import { projectExists, projectMediaDir } from "@/lib/local-store/paths";
import {
  createProject,
  newId,
  newRowTimestamps,
  readMetadata,
  writeMetadata,
  writeTimeline,
  type TimelineFile,
} from "@/lib/local-store/store";

type TitleLine = { text: string; y: number; delay_seconds?: number };
type TakePlan = {
  id: string;
  file: string;
  trigger_seconds: number;
  window_start_seconds: number;
  window_end_seconds: number;
};
type AuditionPlan = {
  base_project_id: string;
  project_title_prefix: string;
  delivery_target: "web" | "feed" | "reels" | "tiktok" | "shorts";
  output_aspect_ratio: "16:9" | "9:16";
  title?: {
    lines: TitleLine[];
    font_preset?: string;
    font_size_px?: number;
    style_variant?: string;
    animation_duration_seconds?: number;
  };
  takes: TakePlan[];
};

function valueAfter(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function element(
  projectId: string,
  partial: Partial<TimelineElement> & Pick<TimelineElement, "type" | "timeline_start" | "duration" | "lane_key" | "lane_index">,
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

function linkOrCopy(source: string, destination: string) {
  try {
    fs.linkSync(source, destination);
  } catch {
    fs.copyFileSync(source, destination);
  }
}

const planPath = valueAfter("--plan");
if (!planPath) throw new Error("Usage: pnpm take-auditions --plan <plan.json>");

const absolutePlanPath = path.resolve(planPath);
const plan = JSON.parse(fs.readFileSync(absolutePlanPath, "utf8")) as AuditionPlan;
if (!Array.isArray(plan.takes) || plan.takes.length === 0) throw new Error("Plan must contain takes");
const titleLines = plan.title?.lines ?? [];

const created: Array<{ project_id: string; source_take: string; url: string }> = [];

for (const take of plan.takes) {
  const projectId = `${plan.base_project_id}-${take.id}`;
  if (projectExists(projectId)) throw new Error(`Project already exists: ${projectId}`);

  const source = path.resolve(path.dirname(absolutePlanPath), take.file);
  if (!fs.existsSync(source)) throw new Error(`Missing take file: ${source}`);

  const windowStart = finite(take.window_start_seconds, `${take.id}.window_start_seconds`);
  const windowEnd = finite(take.window_end_seconds, `${take.id}.window_end_seconds`);
  const trigger = finite(take.trigger_seconds, `${take.id}.trigger_seconds`);
  if (!(windowStart >= 0 && windowStart < trigger && trigger < windowEnd)) {
    throw new Error(`${take.id} must satisfy window_start < trigger < window_end`);
  }
  const duration = windowEnd - windowStart;
  const triggerOnTimeline = trigger - windowStart;

  createProject(projectId, plan.delivery_target, `${plan.project_title_prefix} — ${take.id}`);
  const mediaDir = projectMediaDir(projectId);
  const mediaName = `${take.id}.mp4`;
  linkOrCopy(source, path.join(mediaDir, mediaName));

  const video = element(projectId, {
    type: "video_clip",
    source_url: `/api/projects/${projectId}/media/${mediaName}`,
    timeline_start: 0,
    duration,
    lane_key: "visual_0",
    lane_index: 0,
    trim_start: windowStart,
    trim_end: windowEnd,
    props: {
      source_duration_seconds: finite(windowEnd, `${take.id}.window_end_seconds`),
      source_width: 1280,
      source_height: 720,
      animationIn: "none",
      animationOut: "none",
    },
  });

  const captions = titleLines.map((line, index) => {
    const start = triggerOnTimeline + (line.delay_seconds ?? 0);
    return element(projectId, {
      type: "caption_text",
      timeline_start: start,
      duration: Math.max(0.1, duration - start),
      lane_key: `captions_${index}`,
      lane_index: index,
      props: {
        text: line.text,
        fontSizePx: plan.title?.font_size_px ?? 112,
        maxWidth: 0.88,
        positionPreset: "top_center",
        fontPreset: plan.title?.font_preset ?? "teko",
        styleVariant: plan.title?.style_variant ?? "bold_outline",
        absX: 0.06,
        absY: line.y,
        offsetX: 0,
        offsetY: 0,
        textAlign: "center",
        textColor: null,
        animationIn: "slide_down",
        animationOut: "none",
        animationInDuration: plan.title?.animation_duration_seconds ?? 0.22,
        animationOutDuration: 0,
      },
    });
  });

  const timeline: TimelineFile = { elements: [video, ...captions], transitions: [] };
  writeTimeline(projectId, timeline, "seed_take_audition");
  writeMetadata(projectId, {
    ...readMetadata(projectId),
    output_aspect_ratio: plan.output_aspect_ratio,
    // Persisted lane order is front-to-back in the editor; the renderer reverses
    // it into a back-to-front composition stack.
    lane_order_keys: [...captions.map((caption) => caption.lane_key), "visual_0"],
  }, "seed_take_audition_metadata");

  created.push({ project_id: projectId, source_take: take.id, url: `http://127.0.0.1:3123/p/${projectId}` });
}

console.log(JSON.stringify({ created }, null, 2));
