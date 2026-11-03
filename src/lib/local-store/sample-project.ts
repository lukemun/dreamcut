/**
 * A small project made from generated test media (ffmpeg on PATH): a title still, two video
 * clips joined by a fade, background music and a caption. `pnpm seed-demo` and the Guide's
 * practice project both start from it, so a fresh install has something real to open.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { projectDir, projectExists, projectMediaDir, projectTimelinePath } from "@/lib/local-store/paths";
import { createProject, newId, newRowTimestamps, writeTimeline, type TimelineFile } from "@/lib/local-store/store";
import { composeCaptionProps } from "@/lib/timeline/captions";
import type { TimelineElement } from "@/components/studio/timeline/types";

const SAMPLE_CLIP = "clip-pattern.mp4";

/** Creates `projectId` with generated media and a short timeline. Refuses an existing project. */
export function createSampleProject(projectId: string, title: string, origin = "seed_demo") {
  if (projectExists(projectId)) throw Object.assign(new Error(`Project "${projectId}" already exists.`), { status: 409 });
  createProject(projectId, "web", title);
  const mediaDir = projectMediaDir(projectId);
  const ffmpeg = (args: string[]) => execFileSync("ffmpeg", ["-y", "-v", "error", ...args], { stdio: "pipe" });
  try {
    ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=4", "-pix_fmt", "yuv420p", path.join(mediaDir, SAMPLE_CLIP)]);
    ffmpeg(["-f", "lavfi", "-i", "color=c=0x1e3a8a:size=1920x1080:rate=30:duration=4,drawtext=text='SCENE TWO':fontcolor=white:fontsize=120:x=(w-text_w)/2:y=(h-text_h)/2", "-pix_fmt", "yuv420p", path.join(mediaDir, "clip-blue.mp4")]);
    ffmpeg(["-f", "lavfi", "-i", "color=c=0x7c2d12:size=1920x1080", "-frames:v", "1", path.join(mediaDir, "title-card.png")]);
    ffmpeg(["-f", "lavfi", "-i", "sine=frequency=220:duration=12", "-filter:a", "volume=0.3", path.join(mediaDir, "music-tone.mp3")]);
  } catch (error) {
    // A half-made project would list as broken; the caller can try again once ffmpeg works.
    fs.rmSync(projectDir(projectId), { recursive: true, force: true });
    throw Object.assign(new Error("Could not make the practice media. DreamCut needs FFmpeg installed."), { status: 500, cause: error });
  }

  const media = (file: string) => `/api/projects/${projectId}/media/${file}`;
  const element = (partial: Partial<TimelineElement> & Pick<TimelineElement, "type" | "timeline_start" | "duration" | "lane_key" | "lane_index">): TimelineElement => ({
    id: newId(), project_id: projectId, source_url: null, props: {}, beat_id: null, voice_clip_id: null, character_id: null,
    trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1, position_locked: false,
    removed_at: null, removed_reason: null, ...newRowTimestamps(), ...partial,
  } as TimelineElement);

  const still = element({ type: "still", source_url: media("title-card.png"), timeline_start: 0, duration: 2, lane_key: "visual_0", lane_index: 0 });
  const clipA = element({ type: "video_clip", source_url: media(SAMPLE_CLIP), timeline_start: 2, duration: 4, lane_key: "visual_0", lane_index: 0 });
  const clipB = element({ type: "video_clip", source_url: media("clip-blue.mp4"), timeline_start: 6, duration: 4, lane_key: "visual_0", lane_index: 0 });
  const music = element({ type: "music", source_url: media("music-tone.mp3"), timeline_start: 0, duration: 10, lane_key: "music_0", lane_index: 0, volume: 0.6 });
  const caption = element({ type: "caption_text", timeline_start: 0.5, duration: 2.5, lane_key: "captions_0", lane_index: 0, props: { ...composeCaptionProps("Edited by files, previewed live") } });
  const timeline: TimelineFile = {
    elements: [still, clipA, clipB, music, caption],
    transitions: [{
      id: newId(), project_id: projectId, from_element_id: clipA.id, to_element_id: clipB.id, type: "fade",
      duration_seconds: 0.5, params: {}, removed_at: null, removed_reason: null, ...newRowTimestamps(),
    }],
  };
  writeTimeline(projectId, timeline, origin);
  return { clipA, clipB, music, caption };
}

export const sampleProjectReady = (projectId: string) => fs.existsSync(projectTimelinePath(projectId));
