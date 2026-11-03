/** Rebuild a deterministic local project for UI, API, alpha, and timeline-editor-agent smoke tests. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { projectDir, projectLutsDir, projectMediaDir } from "@/lib/local-store/paths";
import { createProject, newId, newRowTimestamps, writeTimeline, type TimelineFile } from "@/lib/local-store/store";
import type { TimelineElement } from "@/components/studio/timeline/types";

const projectId = "ui-smoke";
fs.rmSync(projectDir(projectId), { recursive: true, force: true });
createProject(projectId, "web", "Reusable UI Smoke");
const mediaDir = projectMediaDir(projectId);

const ffmpeg = (args: string[]) => execFileSync("ffmpeg", ["-y", "-v", "error", ...args], { stdio: "inherit" });

ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=4", "-pix_fmt", "yuv420p", path.join(mediaDir, "color-motion.mp4")]);
ffmpeg([
  "-f", "lavfi", "-i", "color=c=0x101010:size=640x360:rate=30:duration=2",
  "-f", "lavfi", "-i", "color=c=0xffaa66:size=110x110:rate=30:duration=2",
  "-filter_complex", "[0:v][1:v]overlay=x='100+t*120':y=110:shortest=1",
  "-pix_fmt", "yuv420p", path.join(mediaDir, "cutout-source.mp4"),
]);
ffmpeg(["-f", "lavfi", "-i", "color=c=0x777777:size=640x360", "-frames:v", "1", path.join(mediaDir, "neutral-card.png")]);
ffmpeg([
  "-f", "lavfi", "-i",
  "color=c=black@0.0:size=640x360:rate=30:duration=4,format=rgba,drawbox=x='80+t*90':y=100:w=120:h=160:color=0xffaa66@1:t=fill",
  "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0",
  path.join(mediaDir, "alpha-motion.webm"),
]);
ffmpeg(["-f", "lavfi", "-i", "sine=frequency=440:duration=8", "-filter:a", "volume=0.15", path.join(mediaDir, "tone.wav")]);

const identityCube = `TITLE "Identity"\nLUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n`;
const warmCube = `TITLE "Warm contrast"\nLUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n0.03 0 0\n1 0 0\n0.03 0.92 0\n1 0.92 0\n0.03 0 0.82\n1 0 0.82\n0.03 0.92 0.82\n1 0.92 0.82\n`;
fs.mkdirSync(projectLutsDir(projectId), { recursive: true });
let warmLutId = "";
for (const text of [identityCube, warmCube]) {
  const id = createHash("sha256").update(text).digest("hex");
  fs.writeFileSync(path.join(projectLutsDir(projectId), `${id}.cube`), text);
  if (text === warmCube) warmLutId = id;
}

const media = (file: string) => `/api/projects/${projectId}/media/${file}`;
function element(partial: Partial<TimelineElement> & Pick<TimelineElement, "type" | "timeline_start" | "duration" | "lane_key" | "lane_index">): TimelineElement {
  return {
    id: newId(), project_id: projectId, source_url: null, props: {}, beat_id: null, voice_clip_id: null,
    character_id: null, trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0,
    playback_rate: 1, position_locked: false, removed_at: null, removed_reason: null,
    ...newRowTimestamps(), ...partial,
  } as TimelineElement;
}

const timeline: TimelineFile = {
  elements: [
    element({ type: "still", source_url: media("neutral-card.png"), timeline_start: 0, duration: 4, lane_key: "visual_0", lane_index: 0 }),
    element({
      type: "video_clip",
      source_url: media("color-motion.mp4"),
      props: {
        color_grade_model: "linear-srgb-v1",
        keyframes: { grade_exposure_ev: [{ t: 0, v: 0 }, { t: 2, v: 0.5 }, { t: 4, v: 0 }] },
      },
      timeline_start: 4,
      duration: 4,
      lane_key: "visual_0",
      lane_index: 0,
    }),
    element({
      type: "video_clip",
      source_url: media("alpha-motion.webm"),
      props: {
        has_alpha: true,
        color_grade_model: "linear-srgb-v1",
        grade_lift_rgb: [0.025, 0, 0],
        lut_asset_id: warmLutId,
        lut_source_url: media(`luts/${warmLutId}.cube`),
        lut_intensity: 0.65,
      },
      timeline_start: 0,
      duration: 4,
      lane_key: "visual_1",
      lane_index: 1,
    }),
    element({ type: "music", source_url: media("tone.wav"), timeline_start: 0, duration: 8, lane_key: "music_0", lane_index: 0, volume: 0.4 }),
    element({
      type: "caption_text",
      props: {
        text: "Highlight every word",
        timingMode: "active_word",
        wordTimings: [
          { text: "Highlight", start: 0, end: 0.6 },
          { text: "every", start: 0.8, end: 1.4 },
          { text: "word", start: 1.4, end: 2.1 },
        ],
        activeWordColor: "#ff3b30",
        fontPreset: "inter",
        styleVariant: "bold_outline",
        fontSizePx: 52,
        maxWidth: 0.82,
        positionPreset: "center",
      },
      timeline_start: 4,
      duration: 2.5,
      lane_key: "captions_0",
      lane_index: 0,
    }),
    element({
      type: "caption_text",
      props: {
        text: "Ordinary phrase caption",
        timingMode: "phrase",
        fontPreset: "inter",
        styleVariant: "bold_outline",
        fontSizePx: 52,
        maxWidth: 0.82,
        positionPreset: "center",
      },
      timeline_start: 0,
      duration: 1.5,
      lane_key: "captions_0",
      lane_index: 0,
    }),
    element({
      type: "caption_text",
      props: {
        text: "No alignment available",
        timingMode: "phrase",
        wordTimings: [],
        fontPreset: "inter",
        styleVariant: "bold_outline",
        fontSizePx: 52,
        maxWidth: 0.82,
        positionPreset: "center",
      },
      timeline_start: 2,
      duration: 1.5,
      lane_key: "captions_0",
      lane_index: 0,
    }),
  ],
  transitions: [],
};

writeTimeline(projectId, timeline, "seed_ui_smoke");
console.log(`Seeded reusable project: http://127.0.0.1:3123/p/${projectId}`);
