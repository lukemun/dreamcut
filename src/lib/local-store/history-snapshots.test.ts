import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";
import {
  captureProjectHistorySnapshot,
  createProject,
  latestProjectHistorySnapshot,
  readTimeline,
  restoreProjectHistorySnapshot,
  writeTimeline,
} from "@/lib/local-store/store";
import { addFrameTag, readFrameTags } from "@/lib/local-store/frame-tags";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-history-snapshots-"));
process.env.TIMELINE_PROJECTS_DIR = root;

function element(duration: number): TimelineElement {
  const now = "2026-07-21T00:00:00.000Z";
  return {
    id: "11111111-1111-4111-8111-111111111111",
    project_id: "history-fixture",
    type: "still",
    source_url: null,
    props: null,
    beat_id: null,
    voice_clip_id: null,
    character_id: null,
    timeline_start: 0,
    duration,
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
    created_at: now,
    updated_at: now,
  };
}

test("persistent snapshots restore agent writes and remain available for redo", () => {
  createProject("history-fixture", "web");
  writeTimeline("history-fixture", { elements: [element(1)], transitions: [] }, "before_agent");
  const before = latestProjectHistorySnapshot("history-fixture");
  assert.ok(before);

  writeTimeline("history-fixture", { elements: [element(2)], transitions: [] }, "editor_agent_workshop");
  const after = latestProjectHistorySnapshot("history-fixture");
  assert.ok(after);
  assert.notEqual(after.id, before.id);

  restoreProjectHistorySnapshot("history-fixture", before.id, "history_restore_undo");
  assert.equal(readTimeline("history-fixture").elements[0]?.duration, 1);

  restoreProjectHistorySnapshot("history-fixture", after.id, "history_restore_redo");
  assert.equal(readTimeline("history-fixture").elements[0]?.duration, 2);
});

test("persistent snapshots restore review marks with project state", () => {
  createProject("history-frame-tags", "web");
  writeTimeline("history-frame-tags", { elements: [], transitions: [] }, "fixture");
  const before = latestProjectHistorySnapshot("history-frame-tags");
  assert.ok(before);

  const added = addFrameTag("history-frame-tags", 3);
  assert.ok(added.history);
  assert.equal(readFrameTags("history-frame-tags").tags.length, 1);

  restoreProjectHistorySnapshot("history-frame-tags", added.history.before.id, "history_restore_undo");
  assert.equal(readFrameTags("history-frame-tags").tags.length, 0);

  restoreProjectHistorySnapshot("history-frame-tags", added.history.after.id, "history_restore_redo");
  assert.equal(readFrameTags("history-frame-tags").tags.length, 1);
});

test("snapshots embed and restore the auditions receipt and named layout proposals", () => {
  createProject("history-aux-state", "web");
  const projectRoot = path.join(root, "history-aux-state");
  const auditionsPath = path.join(projectRoot, "analysis", "auditions.json");
  const layoutPath = path.join(projectRoot, "preprocess", "layout-proposals", "wall-1.json");
  fs.mkdirSync(path.dirname(auditionsPath), { recursive: true });
  fs.mkdirSync(path.dirname(layoutPath), { recursive: true });
  fs.writeFileSync(auditionsPath, JSON.stringify({ sections: [{ id: "s1", winner_candidate_id: null }] }));
  fs.writeFileSync(layoutPath, JSON.stringify({ revision: 3, items: [{ id: "cover-a", x: 10 }] }));

  const before = captureProjectHistorySnapshot("history-aux-state", "aux_before", {
    layoutProposalIds: ["wall-1"],
  });

  fs.writeFileSync(auditionsPath, JSON.stringify({ sections: [{ id: "s1", winner_candidate_id: "c2" }] }));
  fs.writeFileSync(layoutPath, JSON.stringify({ revision: 4, items: [{ id: "cover-a", x: 99 }] }));

  restoreProjectHistorySnapshot("history-aux-state", before.id, "history_restore_undo");

  const restoredAuditions = JSON.parse(fs.readFileSync(auditionsPath, "utf8")) as {
    sections: Array<{ winner_candidate_id: string | null }>;
  };
  const restoredLayout = JSON.parse(fs.readFileSync(layoutPath, "utf8")) as { revision: number; items: Array<{ x: number }> };
  assert.equal(restoredAuditions.sections[0]?.winner_candidate_id, null);
  assert.equal(restoredLayout.revision, 3);
  assert.equal(restoredLayout.items[0]?.x, 10);
});

test("restoring review marks does not rewrite or invalidate unchanged timeline content", () => {
  createProject("history-marks-only", "web");
  const before = captureProjectHistorySnapshot("history-marks-only", "frame_tags_clear_before");
  const timelinePath = path.join(root, "history-marks-only", "timeline.json");
  const oldTime = new Date("2020-01-01T00:00:00Z");
  fs.utimesSync(timelinePath, oldTime, oldTime);
  const result = restoreProjectHistorySnapshot("history-marks-only", before.id);
  assert.equal(result.timelineChanged, false);
  assert.equal(fs.statSync(timelinePath).mtimeMs, oldTime.getTime());
});
