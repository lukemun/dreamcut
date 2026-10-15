/** Rebuild a deterministic project for audition selection/rejection UI and API smoke tests. */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { TimelineElement } from "@/components/studio/timeline/types";
import { writeAuditionManifest } from "@/lib/local-store/auditions";
import { projectDir, projectMediaDir } from "@/lib/local-store/paths";
import { createProject, newId, newRowTimestamps, writeTimeline, type TimelineFile } from "@/lib/local-store/store";

const projectId = "audition-ui-smoke";
fs.rmSync(projectDir(projectId), { recursive: true, force: true });
createProject(projectId, "web", "Reusable Audition UI Smoke");
const mediaDir = projectMediaDir(projectId);
const videoPath = path.join(mediaDir, "audition.mp4");

execFileSync("ffmpeg", [
  "-y", "-v", "error",
  "-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30:duration=6",
  "-f", "lavfi", "-i", "sine=frequency=440:duration=6",
  "-shortest", "-pix_fmt", "yuv420p", videoPath,
]);

const media = (file: string) => `/api/projects/${projectId}/media/${file}`;
const element = (
  partial: Partial<TimelineElement> & Pick<TimelineElement, "type" | "timeline_start" | "duration" | "lane_key" | "lane_index">,
): TimelineElement => ({
  id: newId(), project_id: projectId, source_url: null, props: {}, beat_id: null, voice_clip_id: null,
  character_id: null, trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0,
  playback_rate: 1, position_locked: false, removed_at: null, removed_reason: null,
  ...newRowTimestamps(), ...partial,
}) as TimelineElement;

const clipOne = element({
  type: "video_clip", source_url: media("audition.mp4"), timeline_start: 0, duration: 2,
  trim_start: 0, trim_end: 4, lane_key: "visual_0", lane_index: 0,
  props: { audition_section_id: "hook", audition_candidate_id: "take-one", audition_winner: false },
});
const labelOne = element({
  type: "caption_text", timeline_start: 0, duration: 1, lane_key: "captions_0", lane_index: 0,
  props: { text: "TAKE 1", audition_section_id: "hook", audition_candidate_id: "take-one" },
});
const clipTwo = element({
  type: "video_clip", source_url: media("audition.mp4"), timeline_start: 2.6, duration: 2,
  trim_start: 3, trim_end: 1, lane_key: "visual_0", lane_index: 0,
  props: { audition_section_id: "hook", audition_candidate_id: "take-two", audition_winner: false },
});
const labelTwo = element({
  type: "caption_text", timeline_start: 2.6, duration: 1, lane_key: "captions_0", lane_index: 0,
  props: { text: "TAKE 2", audition_section_id: "hook", audition_candidate_id: "take-two" },
});

const timeline: TimelineFile = { elements: [clipOne, labelOne, clipTwo, labelTwo], transitions: [] };
writeTimeline(projectId, timeline, "seed_audition_ui_smoke");

for (const [name, second] of [["take-one.jpg", 1], ["take-two.jpg", 4]] as const) {
  execFileSync("ffmpeg", [
    "-y", "-v", "error", "-ss", String(second), "-i", videoPath,
    "-frames:v", "1", "-vf", "scale=270:480:flags=lanczos", "-q:v", "3", path.join(mediaDir, name),
  ]);
}

writeAuditionManifest(projectId, {
  schema_version: 1,
  project_id: projectId,
  source_note: "Deterministic fixture for audition controls and persistence smoke tests.",
  updated_at: new Date().toISOString(),
  sections: [{
    id: "hook",
    order: 0,
    label: "Hook",
    script_text: "Fixture hook line",
    winner_candidate_id: null,
    candidates: [{
      id: "take-one", take_id: "take-1", timeline_element_id: clipOne.id, label_element_id: labelOne.id,
      source_url: media("audition.mp4"), thumbnail_url: media("take-one.jpg"),
      source_start_seconds: 0, source_end_seconds: 2, duration_seconds: 2,
      pass_label: "Fixture · 0:00", source_label: "Take 1",
    }, {
      id: "take-two", take_id: "take-2", timeline_element_id: clipTwo.id, label_element_id: labelTwo.id,
      source_url: media("audition.mp4"), thumbnail_url: media("take-two.jpg"),
      source_start_seconds: 3, source_end_seconds: 5, duration_seconds: 2,
      pass_label: "Fixture · 0:03", source_label: "Take 2",
    }],
  }],
});

console.log(`Seeded reusable audition project: http://127.0.0.1:3123/p/${projectId}`);
