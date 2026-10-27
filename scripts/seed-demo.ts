/**
 * Reproducible demo project: `pnpm seed-demo [projectId]`
 *
 * Generates test media with ffmpeg (required on PATH) and a small timeline —
 * a title still, two video clips joined by a fade, background music, and a
 * caption — so a fresh checkout has something to open.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

import { projectExists, projectMediaDir } from "@/lib/local-store/paths";
import {
  createProject,
  newId,
  newRowTimestamps,
  writeTimeline,
  type TimelineFile,
} from "@/lib/local-store/store";
import { composeCaptionProps } from "@/lib/timeline/captions";
import type { TimelineElement } from "@/components/studio/timeline/types";

const projectId = process.argv[2] ?? "demo";

if (projectExists(projectId)) {
  console.error(`Project "${projectId}" already exists — pick another id or delete the folder.`);
  process.exit(1);
}

createProject(projectId, "web", "Demo Project");
const mediaDir = projectMediaDir(projectId);

const ffmpeg = (args: string[]) => execFileSync("ffmpeg", ["-y", "-v", "error", ...args], { stdio: "inherit" });

console.log("Generating demo media (ffmpeg)...");
ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=4", "-pix_fmt", "yuv420p", path.join(mediaDir, "clip-pattern.mp4")]);
ffmpeg(["-f", "lavfi", "-i", "color=c=0x1e3a8a:size=1920x1080:rate=30:duration=4,drawtext=text='SCENE TWO':fontcolor=white:fontsize=120:x=(w-text_w)/2:y=(h-text_h)/2", "-pix_fmt", "yuv420p", path.join(mediaDir, "clip-blue.mp4")]);
ffmpeg(["-f", "lavfi", "-i", "color=c=0x7c2d12:size=1920x1080", "-frames:v", "1", path.join(mediaDir, "title-card.png")]);
ffmpeg(["-f", "lavfi", "-i", "sine=frequency=220:duration=12", "-filter:a", "volume=0.3", path.join(mediaDir, "music-tone.mp3")]);

const media = (file: string) => `/api/projects/${projectId}/media/${file}`;

function element(partial: Partial<TimelineElement> & Pick<TimelineElement, "type" | "timeline_start" | "duration" | "lane_key" | "lane_index">): TimelineElement {
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

const still = element({ type: "still", source_url: media("title-card.png"), timeline_start: 0, duration: 2, lane_key: "visual_0", lane_index: 0 });
const clipA = element({ type: "video_clip", source_url: media("clip-pattern.mp4"), timeline_start: 2, duration: 4, lane_key: "visual_0", lane_index: 0 });
const clipB = element({ type: "video_clip", source_url: media("clip-blue.mp4"), timeline_start: 6, duration: 4, lane_key: "visual_0", lane_index: 0 });
const music = element({ type: "music", source_url: media("music-tone.mp3"), timeline_start: 0, duration: 10, lane_key: "music_0", lane_index: 0, volume: 0.6 });
const caption = element({
  type: "caption_text",
  timeline_start: 0.5,
  duration: 2.5,
  lane_key: "captions_0",
  lane_index: 0,
  props: { ...composeCaptionProps("Edited by files, previewed live") },
});

const timeline: TimelineFile = {
  elements: [still, clipA, clipB, music, caption],
  transitions: [
    {
      id: newId(),
      project_id: projectId,
      from_element_id: clipA.id,
      to_element_id: clipB.id,
      type: "fade",
      duration_seconds: 0.5,
      params: {},
      removed_at: null,
      removed_reason: null,
      ...newRowTimestamps(),
    },
  ],
};

writeTimeline(projectId, timeline, "seed_demo");
console.log(`Seeded project "${projectId}" — open http://127.0.0.1:3123/p/${projectId}`);
