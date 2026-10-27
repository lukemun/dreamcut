import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { TimelineElement } from "@/components/studio/timeline/types";
import { readColorGradeProps } from "@/lib/timeline/color-grade";

import {
  CURRENT_TIMELINE_SCHEMA_VERSION,
  migrateTimelineFile,
} from "@/lib/local-store/timeline-migrations";
import { createProject, readTimeline, writeTimeline } from "@/lib/local-store/store";
import { projectTimelinePath } from "@/lib/local-store/paths";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-migrations-"));
process.env.TIMELINE_PROJECTS_DIR = root;

test("a pre-versioning row missing playback_rate loads with the full field set", () => {
  // The exact drift that bit on 2026-07-21: a hand-written row omitting fields
  // the canvas reads unconditionally.
  const { timeline, fromVersion } = migrateTimelineFile({
    elements: [{
      id: "11111111-1111-4111-8111-111111111111",
      project_id: "fixture",
      type: "video_clip",
      timeline_start: 2,
      duration: 4,
      lane_key: "visual_1",
    } as never],
    transitions: [],
  });
  assert.equal(fromVersion, 0);
  const row = timeline.elements[0]!;
  assert.equal(row.playback_rate, 1);
  assert.equal(row.trim_start, 0);
  assert.equal(row.trim_end, null);
  assert.equal(row.volume, 1);
  assert.equal(row.fade_in, 0);
  assert.equal(row.fade_out, 0);
  assert.equal(row.position_locked, false);
  assert.equal(row.lane_index, 1); // derived from the lane_key suffix
  assert.deepEqual(row.props, {});
  // Provided values survive untouched.
  assert.equal(row.timeline_start, 2);
  assert.equal(row.duration, 4);
});

test("a current-version file passes through the chain unchanged", () => {
  const element = {
    id: "22222222-2222-4222-8222-222222222222",
    project_id: "fixture", type: "still", source_url: null, props: { a: 1 }, beat_id: null,
    character_id: null, timeline_start: 0, duration: 2, lane_key: "visual_0", lane_index: 0,
    trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1,
    position_locked: false, removed_at: null, removed_reason: null,
    created_at: "2026-07-22T00:00:00.000Z", updated_at: "2026-07-22T00:00:00.000Z",
  };
  const { timeline, fromVersion } = migrateTimelineFile({
    schema_version: CURRENT_TIMELINE_SCHEMA_VERSION,
    elements: [element as never],
    transitions: [],
  });
  assert.equal(fromVersion, CURRENT_TIMELINE_SCHEMA_VERSION);
  assert.deepEqual(timeline.elements[0], element);
});

test("v1 strips browser-only overflow frame data URLs on read", () => {
  const element = {
    id: "44444444-4444-4444-8444-444444444444",
    project_id: "fixture", type: "video_clip", source_url: "/video.mp4", props: {
      media_scale: 0.8,
      overflow_hold_start_frame_url: "data:image/png;base64,start",
      overflow_hold_frame_url: "data:image/png;base64,end",
    }, beat_id: null, character_id: null, timeline_start: 0, duration: 2,
    lane_key: "visual_0", lane_index: 0, trim_start: 0, trim_end: null, volume: 1,
    fade_in: 0, fade_out: 0, playback_rate: 1, position_locked: false,
    removed_at: null, removed_reason: null, created_at: "2026-07-22T00:00:00.000Z",
    updated_at: "2026-07-22T00:00:00.000Z",
  };
  const { timeline, fromVersion } = migrateTimelineFile({
    schema_version: 1,
    elements: [element as never],
    transitions: [],
  });

  assert.equal(fromVersion, 1);
  assert.deepEqual(timeline.elements[0]!.props, { media_scale: 0.8 });
});

test("v2 migrates legacy project identifiers and media routes", () => {
  const { timeline, fromVersion } = migrateTimelineFile({
    schema_version: 2,
    elements: [{
      id: "55555555-5555-4555-8555-555555555555",
      trailer_id: "legacy-project",
      type: "video_clip",
      source_url: "/api/trailers/legacy-project/media/sources/clip.mp4",
      props: { processed_source_url: "/api/trailers/legacy-project/media/proxies/clip.mp4" },
    } as never],
    transitions: [{ id: "66666666-6666-4666-8666-666666666666", trailer_id: "legacy-project" } as never],
  });

  assert.equal(fromVersion, 2);
  assert.equal(timeline.elements[0]!.project_id, "legacy-project");
  assert.equal(timeline.elements[0]!.source_url, "/api/projects/legacy-project/media/sources/clip.mp4");
  assert.deepEqual(timeline.elements[0]!.props, {
    processed_source_url: "/api/projects/legacy-project/media/proxies/clip.mp4",
  });
  assert.equal(timeline.transitions[0]!.project_id, "legacy-project");
  assert.equal("trailer_id" in timeline.elements[0]!, false);
});

test("a file from a newer editor fails closed instead of being reinterpreted", () => {
  assert.throws(
    () => migrateTimelineFile({ schema_version: CURRENT_TIMELINE_SCHEMA_VERSION + 1, elements: [], transitions: [] }),
    /newer than this editor/,
  );
});

test("writes stamp the current schema_version and reads round-trip it", () => {
  createProject("stamp", "web");
  writeTimeline("stamp", { elements: [], transitions: [] }, "fixture");
  const onDisk = JSON.parse(fs.readFileSync(projectTimelinePath("stamp"), "utf8"));
  assert.equal(onDisk.schema_version, CURRENT_TIMELINE_SCHEMA_VERSION);
  assert.deepEqual(readTimeline("stamp"), { elements: [], transitions: [] });
});

test("readTimeline migrates a legacy hand-edited file without writing it back", () => {
  createProject("legacy", "web");
  const filePath = projectTimelinePath("legacy");
  const legacy = JSON.stringify({
    elements: [{ id: "33333333-3333-4333-8333-333333333333", project_id: "legacy", type: "video_clip", timeline_start: 0, duration: 1, lane_key: "visual_0" }],
    transitions: [],
  });
  fs.writeFileSync(filePath, legacy);
  const loaded = readTimeline("legacy");
  assert.equal(loaded.elements[0]!.playback_rate, 1);
  // Pure read: the file on disk is byte-identical until the next real write.
  assert.equal(fs.readFileSync(filePath, "utf8"), legacy);
});

test("v3 timelines upgrade colour grades to dreamcut-scene-v2, matching the read-time upgrade", () => {
  const v1Props = { color_grade_model: "linear-srgb-v1", grade_exposure_ev: 0.3, grade_contrast: 1.15, grade_saturation: 1.2, grade_gain_rgb: [1.05, 1, 0.95] };
  const element = { id: "a", type: "video_clip", props: v1Props } as unknown as TimelineElement;
  const ungraded = { id: "b", type: "video_clip", props: { media_scale: 1 } } as unknown as TimelineElement;
  const { timeline } = migrateTimelineFile({ schema_version: 3, elements: [element, ungraded], transitions: [] });
  const migrated = timeline.elements[0]!.props as Record<string, unknown>;
  assert.equal(migrated.color_grade_model, "dreamcut-scene-v2");
  assert.equal(migrated.grade_gain_rgb, undefined);
  assert.deepEqual(readColorGradeProps(migrated), readColorGradeProps(v1Props), "restoring an old snapshot reads the same grade");
  assert.strictEqual(timeline.elements[1], ungraded, "ungraded rows are untouched");
});
