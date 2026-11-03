import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildProjectHealthReport } from "@/lib/local-store/project-health";

test("buildProjectHealthReport separates active state from retained tombstones and reports storage", () => {
  const previousRoot = process.env.TIMELINE_PROJECTS_DIR;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-project-health-"));
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    const projectId = "fixture";
    const project = path.join(root, projectId);
    fs.mkdirSync(path.join(project, "media"), { recursive: true });
    fs.mkdirSync(path.join(project, "history"), { recursive: true });
    fs.writeFileSync(path.join(project, "media", "clip.bin"), Buffer.alloc(12));
    fs.writeFileSync(path.join(project, "history", "snapshot.json"), Buffer.alloc(8));
    fs.writeFileSync(path.join(project, "metadata.json"), JSON.stringify({
      lane_order_keys: ["visual_0"],
      lane_defaults: {},
      muted_lane_keys: [],
      output_aspect_ratio: "9:16",
      delivery_target: "reels",
      caption_safe_area_mode: "paid_ad",
    }));
    fs.writeFileSync(path.join(project, "timeline.json"), JSON.stringify({
      schema_version: 1,
      elements: [
        {
          id: "active",
          project_id: projectId,
          type: "video_clip",
          source_url: "/media/clip.mp4",
          props: {},
          beat_id: null,
          voice_clip_id: null,
          character_id: null,
          timeline_start: 1,
          duration: 2,
          lane_key: "visual_0",
          lane_index: 0,
          trim_start: 0,
          trim_end: null,
          volume: 1,
          fade_in: 0,
          fade_out: 0,
          playback_rate: 1,
          position_locked: false,
          removed_at: null,
          removed_reason: null,
          created_at: "2026-07-24T00:00:00.000Z",
          updated_at: "2026-07-24T00:00:00.000Z",
        },
        {
          id: "removed",
          project_id: projectId,
          type: "still",
          source_url: "/media/old.png",
          props: {},
          beat_id: null,
          voice_clip_id: null,
          character_id: null,
          timeline_start: 0,
          duration: 1,
          lane_key: "visual_1",
          lane_index: 1,
          trim_start: 0,
          trim_end: null,
          volume: 0,
          fade_in: 0,
          fade_out: 0,
          playback_rate: 1,
          position_locked: false,
          removed_at: "2026-07-24T00:01:00.000Z",
          removed_reason: "user",
          created_at: "2026-07-24T00:00:00.000Z",
          updated_at: "2026-07-24T00:01:00.000Z",
        },
      ],
      transitions: [],
    }));

    const report = buildProjectHealthReport(projectId, "2026-07-24T12:00:00.000Z");
    assert.equal(report.generated_at, "2026-07-24T12:00:00.000Z");
    assert.equal(report.timeline.total_elements, 2);
    assert.equal(report.timeline.active_elements, 1);
    assert.equal(report.timeline.removed_elements, 1);
    assert.equal(report.timeline.active_lanes, 1);
    assert.equal(report.timeline.active_sources, 1);
    assert.equal(report.timeline.duration_seconds, 3);
    assert.equal(report.storage.media.files, 1);
    assert.equal(report.storage.media.bytes, 12);
    assert.equal(report.storage.history.files, 1);
    assert.equal(report.storage.history.bytes, 8);
    assert.ok(report.storage.project.bytes >= 20);
  } finally {
    if (previousRoot === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previousRoot;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
