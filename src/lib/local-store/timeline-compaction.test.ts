import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { POST as restoreElement } from "@/app/api/projects/[projectId]/timeline/elements/[elementId]/restore/route";
import type { TimelineElement, TimelineTransition } from "@/components/studio/timeline/types";
import {
  applyTimelineCompaction,
  buildTimelineCompactionPlan,
  readTimelineTombstoneArchive,
  rehydrateArchivedElement,
} from "@/lib/local-store/timeline-compaction";
import { projectTimelinePath } from "@/lib/local-store/paths";
import { createProject, readTimeline, writeTimeline } from "@/lib/local-store/store";

function element(id: string, removed: boolean): TimelineElement {
  const now = "2026-07-24T00:00:00.000Z";
  return {
    id,
    project_id: "compaction-fixture",
    type: "still",
    source_url: `/media/${id}.png`,
    props: null,
    beat_id: null,
    voice_clip_id: null,
    character_id: null,
    timeline_start: 0,
    duration: 1,
    lane_key: "visual_0",
    lane_index: 0,
    trim_start: 0,
    trim_end: null,
    volume: 1,
    fade_in: 0,
    fade_out: 0,
    playback_rate: 1,
    position_locked: false,
    removed_at: removed ? now : null,
    removed_reason: removed ? "user" : null,
    created_at: now,
    updated_at: now,
  };
}

function transition(id: string, removed: boolean): TimelineTransition {
  const now = "2026-07-24T00:00:00.000Z";
  return {
    id,
    project_id: "compaction-fixture",
    from_element_id: "removed",
    to_element_id: "active",
    type: "fade",
    duration_seconds: 0.2,
    params: {},
    removed_at: removed ? now : null,
    removed_reason: removed ? "element_removed" : null,
    created_at: now,
    updated_at: now,
  };
}

test("timeline compaction removes hot tombstones while preserving transparent restore evidence", () => {
  const previousRoot = process.env.TIMELINE_PROJECTS_DIR;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-compaction-"));
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    createProject("compaction-fixture", "web");
    writeTimeline("compaction-fixture", {
      elements: [element("active", false), element("removed", true)],
      transitions: [transition("removed-transition", true)],
    }, "fixture");
    const bytesBefore = fs.statSync(projectTimelinePath("compaction-fixture")).size;

    const plan = buildTimelineCompactionPlan("compaction-fixture");
    assert.equal(plan.elements.removable, 1);
    assert.equal(plan.transitions.removable, 1);
    assert.ok(plan.timeline_bytes_projected < plan.timeline_bytes_before);

    const receipt = applyTimelineCompaction("compaction-fixture");
    assert.ok(receipt);
    assert.ok(receipt.timeline_bytes_after < bytesBefore);
    assert.ok(receipt.pre_compaction_snapshot_id);
    assert.ok(receipt.post_compaction_snapshot_id);

    const compacted = readTimeline("compaction-fixture");
    assert.deepEqual(compacted.elements.map((entry) => entry.id), ["active"]);
    assert.equal(compacted.transitions.length, 0);

    const archive = readTimelineTombstoneArchive("compaction-fixture");
    assert.deepEqual(archive.elements.map((entry) => entry.id), ["removed"]);
    assert.deepEqual(archive.transitions.map((entry) => entry.id), ["removed-transition"]);

    const restored = rehydrateArchivedElement("compaction-fixture", compacted, "removed");
    assert.equal(restored?.id, "removed");
    assert.equal(restored?.removed_at, "2026-07-24T00:00:00.000Z");
    assert.equal(compacted.transitions.length, 1);
    assert.equal(compacted.transitions[0]!.id, "removed-transition");

    assert.equal(applyTimelineCompaction("compaction-fixture"), null);
  } finally {
    if (previousRoot === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previousRoot;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the existing restore route transparently restores an archived element", async () => {
  const previousRoot = process.env.TIMELINE_PROJECTS_DIR;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-restore-archive-"));
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    createProject("compaction-fixture", "web");
    writeTimeline("compaction-fixture", {
      elements: [element("active", false), element("removed", true)],
      transitions: [],
    }, "fixture");
    assert.ok(applyTimelineCompaction("compaction-fixture"));

    const response = await restoreElement(new Request("http://localhost/restore", {
      method: "POST",
    }), {
      params: Promise.resolve({
        projectId: "compaction-fixture",
        elementId: "removed",
      }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { element?: TimelineElement };
    assert.equal(body.element?.id, "removed");
    assert.equal(body.element?.removed_at, null);
    assert.equal(
      readTimeline("compaction-fixture").elements.find((entry) => entry.id === "removed")?.removed_at,
      null,
    );
  } finally {
    if (previousRoot === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previousRoot;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
