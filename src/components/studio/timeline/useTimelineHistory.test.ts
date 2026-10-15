import assert from "node:assert/strict";
import test from "node:test";

import {
  compactHistoryForStorage,
  mergeInitialHistoryEntries,
  moveHistoryStacks,
  pushHistoryEntry,
  type HistoryEntry,
} from "@/components/studio/timeline/useTimelineHistory";
import type { TimelineElement } from "@/components/studio/timeline/types";

function buildElement(id: string): TimelineElement {
  return {
    id,
    project_id: "project-1",
    type: "still",
    source_url: null,
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
    removed_at: null,
    removed_reason: null,
    created_at: "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
  };
}

function patchEntry(id: string): HistoryEntry {
  return {
    type: "patch",
    elementId: id,
    before: { duration: 1 },
    after: { duration: 2 },
  };
}

test("pushHistoryEntry keeps only the most recent entries within the max size", () => {
  const stack = [patchEntry("a"), patchEntry("b")];
  const next = pushHistoryEntry(stack, patchEntry("c"), 2);

  assert.deepEqual(next.map((entry) => entry.type === "patch" ? entry.elementId : ""), ["b", "c"]);
});

test("moveHistoryStacks moves the latest undo entry onto redo", () => {
  const entry = patchEntry("b");
  const next = moveHistoryStacks("undo", [patchEntry("a"), entry], [], entry);

  assert.equal(next.undoStack.length, 1);
  assert.equal(next.redoStack.length, 1);
  assert.equal(next.redoStack[0], entry);
});

test("moveHistoryStacks moves the latest redo entry back onto undo", () => {
  const entry: HistoryEntry = { type: "create", element: buildElement("new") };
  const next = moveHistoryStacks("redo", [], [entry], entry);

  assert.equal(next.undoStack.length, 1);
  assert.equal(next.redoStack.length, 0);
  assert.equal(next.undoStack[0], entry);
});

test("pushHistoryEntry accepts lane structure entries", () => {
  const entry: HistoryEntry = {
    type: "lane_structure",
    before: { laneOrderKeys: ["visual_0"], laneManualDeltaByKey: {} },
    after: { laneOrderKeys: ["visual_1", "visual_0"], laneManualDeltaByKey: {} },
  };

  const next = pushHistoryEntry([], entry, 2);
  assert.equal(next[0]?.type, "lane_structure");
});

test("external snapshot history entries append once and remain undoable", () => {
  const snapshot: HistoryEntry = {
    type: "snapshot",
    beforeSnapshotId: "before.json",
    afterSnapshotId: "after.json",
    label: "agent edit",
  };
  const merged = mergeInitialHistoryEntries([patchEntry("a")], [snapshot, snapshot]);

  assert.equal(merged.length, 2);
  assert.equal(merged[1]?.type, "snapshot");
  const moved = moveHistoryStacks("undo", merged, [], snapshot);
  assert.equal(moved.undoStack.length, 1);
  assert.equal(moved.redoStack[0], snapshot);
});

test("browser history compaction keeps the newest undo entries within its byte budget", () => {
  const entries = ["a", "b", "c"].map((id) => ({
    type: "patch" as const,
    elementId: id,
    before: { props: { payload: id.repeat(300) } },
    after: { props: { payload: id.repeat(300) } },
  }));
  const compacted = compactHistoryForStorage(entries, [], 850);
  assert.deepEqual(compacted.undo.map((entry) => entry.type === "patch" ? entry.elementId : ""), ["c"]);
  assert.ok(new TextEncoder().encode(JSON.stringify(compacted)).byteLength <= 850);
});

test("browser history compaction can drop one oversized cache entry without changing live history", () => {
  const entry = patchEntry("large");
  entry.after = { payload: "x".repeat(10_000) };
  const undo = [entry];
  const compacted = compactHistoryForStorage(undo, [], 100);
  assert.deepEqual(compacted, { undo: [], redo: [] });
  assert.equal(undo[0], entry);
});
