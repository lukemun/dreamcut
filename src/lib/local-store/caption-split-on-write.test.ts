import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TimelineElement } from "@/components/studio/timeline/types";
import { projectTimelinePath } from "./paths";
import { createProject, readTimeline, writeTimeline } from "./store";

const audio: TimelineElement = {
  id: "11111111-1111-4111-8111-111111111111", project_id: "test", type: "vo_full", source_url: "/speech.wav",
  props: { source_duration_seconds: 10 }, beat_id: null, character_id: null, voice_clip_id: null,
  timeline_start: 0, duration: 4, trim_start: 0, trim_end: null, lane_key: "audio_narrator", lane_index: 0,
  volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1, position_locked: false,
  removed_at: null, removed_reason: null, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
};
// Saved before the one-caption-per-word rule: one caption holding three words.
const legacyCaption: TimelineElement = { ...audio, id: "22222222-2222-4222-8222-222222222222", type: "caption_text", source_url: null,
  lane_key: "captions_0", duration: 3, props: { text: "One two three", timingMode: "single_word",
    wordTimings: ["One", "two", "three"].map((text, index) => ({ text, start: index, end: index + 0.9 })) } };

function withProject(run: () => void) {
  const prior = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "caption-split-on-write-"));
  try {
    createProject("test", "web");
    // Seed the legacy state on disk directly, as an older editor would have saved it.
    const file = projectTimelinePath("test");
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, "utf8")), elements: [audio, legacyCaption], transitions: [] }));
    run();
  } finally {
    if (prior === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = prior;
  }
}

test("an unrelated save leaves every other element byte-identical, legacy captions included", () => withProject(() => {
  const before = readTimeline("test");
  const unrelated = structuredClone(before);
  unrelated.elements[0]!.volume = 0.5;
  writeTimeline("test", unrelated, "volume");
  const after = readTimeline("test");
  assert.equal(after.elements.length, before.elements.length);
  for (const element of before.elements) {
    if (element.id === audio.id) continue;
    assert.equal(JSON.stringify(after.elements.find((candidate) => candidate.id === element.id)), JSON.stringify(element));
  }
}));

test("saving an edit to that caption splits only it, one caption per word", () => withProject(() => {
  const edited = structuredClone(readTimeline("test"));
  edited.elements[1]!.props = { ...edited.elements[1]!.props, fontSizePx: 80 };
  writeTimeline("test", edited, "caption_style");
  const captions = readTimeline("test").elements.filter((element) => element.type === "caption_text");
  assert.deepEqual(captions.map((caption) => caption.props?.text), ["One", "two", "three"]);
  assert.equal(JSON.stringify(readTimeline("test").elements.find((element) => element.id === audio.id)), JSON.stringify(audio));
}));
