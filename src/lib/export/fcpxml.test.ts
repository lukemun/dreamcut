import assert from "node:assert/strict";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";
import type { ProjectMetadata, TimelineFile } from "@/lib/local-store/store";
import { timelineToFcpxml } from "@/lib/export/fcpxml";

const PROJECT = "demo";

const metadata: ProjectMetadata = {
  lane_order_keys: [], lane_defaults: {}, muted_lane_keys: [],
  output_aspect_ratio: "9:16", delivery_target: "reels", title: "Demo Video",
};

function element(overrides: Partial<TimelineElement>): TimelineElement {
  const now = "2026-07-22T00:00:00.000Z";
  return {
    id: "e1", project_id: PROJECT, type: "video_clip",
    source_url: `/api/projects/${PROJECT}/media/shot%20one.mp4`,
    props: {}, beat_id: null, character_id: null, timeline_start: 0, duration: 4,
    lane_key: "visual_0", lane_index: 0, trim_start: 1.5, trim_end: null, volume: 1,
    fade_in: 0, fade_out: 0, playback_rate: 1, position_locked: false,
    removed_at: null, removed_reason: null, created_at: now, updated_at: now,
    ...overrides,
  };
}

function build(elements: TimelineElement[], transitions: TimelineFile["transitions"] = []): string {
  return timelineToFcpxml({ elements, transitions }, metadata, PROJECT);
}

test("emits valid rational time, canvas format, and trim-aware asset clips", () => {
  const xml = build([element({})]);
  assert.match(xml, /<fcpxml version="1\.10">/);
  assert.match(xml, /width="1080" height="1920"/);
  assert.match(xml, /frameDuration="1\/30s"/);
  // trim_start 1.5s → start 45/30s; duration 4s → 120/30s; lane visual_0 → 1
  assert.match(xml, /<asset-clip [^>]*lane="1" offset="0\/30s" start="45\/30s" duration="120\/30s"/);
  // URL-encoded media decodes to a relative project path.
  assert.match(xml, /src="\.\/media\/shot one\.mp4"/);
});

test("the FCPXML canvas matches square and portrait output shapes", () => {
  for (const [ratio, size] of [["1:1", 'width="1080" height="1080"'], ["4:5", 'width="1080" height="1350"']] as const) {
    const xml = timelineToFcpxml({ elements: [element({})], transitions: [] }, { ...metadata, output_aspect_ratio: ratio }, PROJECT);
    assert.ok(xml.includes(size), ratio);
  }
});

test("audio maps to negative lanes with dB volume; captions become titles", () => {
  const xml = build([
    element({ id: "m1", type: "music", lane_key: "music_0", source_url: `/api/projects/${PROJECT}/media/score.mp3`, volume: 0.5 }),
    element({ id: "c1", type: "caption_text", lane_key: "captions_0", source_url: null, props: { text: "Fear <the> \"dark\"" } }),
  ]);
  assert.match(xml, /<asset-clip [^>]*lane="-2"[^>]*>/);
  assert.match(xml, /<adjust-volume amount="-6\.02dB"\/>/);
  assert.match(xml, /<title [^>]*lane="8"/);
  assert.match(xml, /Fear &lt;the&gt; &quot;dark&quot;/);
});

test("soft-deleted elements are excluded and untranslated features are annotated", () => {
  const xml = build(
    [
      element({ id: "gone", removed_at: "2026-07-22T00:00:00Z" }),
      element({ id: "fast", playback_rate: 2 }),
    ],
    [{ id: "t1", removed_at: null } as never],
  );
  assert.ok(!xml.includes(`id="gone"`));
  assert.match(xml, /playback_rate 2 not translated/);
  assert.match(xml, /transitions are not translated/);
});

test("output is deterministic and one asset is shared across clips of the same media", () => {
  const elements = [element({ id: "a" }), element({ id: "b", timeline_start: 4 })];
  const first = build(elements);
  assert.equal(first, build(elements));
  assert.equal([...first.matchAll(/<asset /g)].length, 1);
});
