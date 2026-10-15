import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TimelineElement } from "@/components/studio/timeline/types";
import { reconcileCaptionFollowers } from "./caption-followers";
import { applyElementPatch } from "./element-patch";
import { splitElementAtomic } from "./split";
import { deriveProposalTimeline } from "@/lib/agent/timeline-editor-agent-apply";
import { validateWordTimings } from "@/lib/timeline/active-word-captions";
import { createProject, readTimeline, restoreProjectHistorySnapshot, writeTimeline } from "./store";
import { POST as splitRoute } from "@/app/api/projects/[projectId]/timeline/elements/[elementId]/split/route";
import { POST as restoreRoute } from "@/app/api/projects/[projectId]/timeline/elements/[elementId]/restore/route";
import { DELETE as deleteRoute } from "@/app/api/projects/[projectId]/timeline/elements/[elementId]/route";
import { applyTimelineCompaction } from "./timeline-compaction";

function fixture(): TimelineElement[] {
  const source: TimelineElement = {
    id: "11111111-1111-4111-8111-111111111111", project_id: "test", type: "vo_full", source_url: "/speech.wav",
    props: { source_duration_seconds: 10 }, beat_id: null, character_id: null, voice_clip_id: null,
    timeline_start: 10, duration: 4, trim_start: 2, trim_end: 4, lane_key: "audio_narrator", lane_index: 0,
    volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1, position_locked: false,
    removed_at: null, removed_reason: null, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
  };
  return [source, { ...source, id: "22222222-2222-4222-8222-222222222222", type: "caption_text", source_url: null,
    lane_key: "captions_0", trim_start: 0, trim_end: null,
    props: { text: "One two three four", fontSizePx: 72, timingMode: "active_word", activeWordColor: "#ff0000",
      caption_source_element_id: source.id, caption_follow_audio: true,
      wordTimings: ["One", "two", "three", "four"].map((text, index) => ({ text, start: index, end: index + 0.7 })) },
  }];
}

test("speed and movement reproject word highlighting with no cumulative drift or style loss", () => {
  const original = fixture();
  let current = structuredClone(original);
  for (const rate of [2, 0.5, 1.3, 1]) {
    const before = structuredClone(current);
    applyElementPatch(current[0]!, { playback_rate: rate, timeline_start: 20 });
    reconcileCaptionFollowers(before, current);
    const caption = current[1]!;
    assert.equal(caption.duration, 4 / rate);
    assert.equal(caption.props?.fontSizePx, 72);
    assert.deepEqual(validateWordTimings(String(caption.props?.text), caption.duration, caption.props?.wordTimings).findings, []);
    assert.ok(Math.abs((caption.props?.wordTimings as any[])[1].start - 1 / rate) < 1e-8);
  }
  assert.deepEqual(current[1]!.props?.wordTimings, original[1]!.props?.wordTimings);
});

test("step speed boundaries keep linked words on the piecewise media clock", () => {
  const before = fixture();
  const after = structuredClone(before);
  after[0]!.duration = 3;
  after[0]!.props = {
    ...after[0]!.props,
    keyframes: {
      playback_rate: [{ t: 2, source_t: 4, v: 2, ease: "hold" }],
    },
  };
  reconcileCaptionFollowers(before, after);
  const caption = after[1]!;
  assert.equal(caption.duration, 3);
  assert.deepEqual(
    (caption.props?.wordTimings as any[]).map((word) => word.start),
    [0, 1, 2, 2.5],
  );
  assert.equal(caption.props?.caption_source_playback_rate, 1);
});

test("head and tail trims keep surviving words; extending restores the original phrase", () => {
  const before = fixture();
  const trimmed = structuredClone(before);
  applyElementPatch(trimmed[0]!, { trim_start: 3, trim_end: 5, duration: 2 });
  reconcileCaptionFollowers(before, trimmed);
  assert.equal(trimmed[1]!.props?.text, "two three");
  const extended = structuredClone(trimmed);
  Object.assign(extended[0]!, before[0]);
  reconcileCaptionFollowers(trimmed, extended);
  assert.equal(extended[1]!.props?.text, "One two three four");
  assert.deepEqual(extended[1]!.props?.wordTimings, before[1]!.props?.wordTimings);
});

test("split partitions captions and binds the right caption to the right audio", () => {
  const before = fixture();
  const timeline = { elements: structuredClone(before), transitions: [] };
  const split = splitElementAtomic(timeline, "test", before[0]!.id, 12, 30, 3);
  assert.ok(split.ok);
  reconcileCaptionFollowers(before, timeline.elements);
  const captions = timeline.elements.filter((row) => row.type === "caption_text" && !row.removed_at);
  assert.deepEqual(captions.map((row) => row.props?.text), ["One two", "three four"]);
  assert.equal(captions[1]!.props?.caption_source_element_id, split.inserted.id);
  const moved = structuredClone(timeline.elements);
  applyElementPatch(moved.find((row) => row.id === split.inserted.id)!, { playback_rate: 2, timeline_start: 30 });
  reconcileCaptionFollowers(timeline.elements, moved);
  assert.equal(moved.find((row) => row.id === captions[1]!.id)!.timeline_start, 30);
  assert.equal(moved.find((row) => row.id === captions[0]!.id)!.timeline_start, 10);
});

test("deleting and restoring audio hides and restores only its linked captions", () => {
  const before = fixture();
  const deleted = structuredClone(before);
  deleted[0]!.removed_at = "2026-01-02T00:00:00.000Z";
  reconcileCaptionFollowers(before, deleted);
  assert.ok(deleted[1]!.removed_at);
  const restored = structuredClone(deleted);
  restored[0]!.removed_at = null;
  reconcileCaptionFollowers(deleted, restored);
  assert.equal(restored[1]!.removed_at, null);
  assert.equal(restored[1]!.props?.text, before[1]!.props?.text);
});

test("legacy provenance alone never links captions; explicit unlink stays independent", () => {
  for (const key of ["caption_source_element_id", "speech_caption_source_element_id", "source_audio_element_id"]) {
    const before = fixture();
    delete before[1]!.props!.caption_source_element_id;
    delete before[1]!.props!.caption_follow_audio;
    before[1]!.props![key] = before[0]!.id;
    const after = structuredClone(before);
    applyElementPatch(after[0]!, { playback_rate: 2 });
    assert.deepEqual(reconcileCaptionFollowers(before, after), []);
  }
  const before = fixture();
  before[1]!.props!.caption_follow_audio = false;
  const after = structuredClone(before);
  applyElementPatch(after[0]!, { playback_rate: 2 });
  assert.deepEqual(reconcileCaptionFollowers(before, after), []);
  assert.deepEqual(after[1], before[1]);
});

test("unsafe mid-word cuts and locked followers fail before persistence", () => {
  const before = fixture();
  const after = structuredClone(before);
  applyElementPatch(after[0]!, { duration: 1.5, trim_end: 6.5 });
  assert.throws(() => reconcileCaptionFollowers(before, after), /crosses a caption word/);
  before[1]!.position_locked = true;
  after[1]!.position_locked = true;
  assert.throws(() => reconcileCaptionFollowers(before, after), /locked/);
});

test("proposal preview derives captions without requiring a replacement rail", () => {
  const before = fixture();
  const result = deriveProposalTimeline({ elements: before, transitions: [] }, [{
    element_id: before[0]!.id, patch: { playback_rate: 2 }, rationale: "Faster speech with linked captions",
  }]);
  assert.equal(result.timeline.elements[1]!.duration, 2);
  assert.ok(result.touched.includes(before[1]!.id));
  assert.equal(before[1]!.duration, 4);
});

test("proposal source-range cuts partition captions without rippling them twice", () => {
  const before = fixture();
  const result = deriveProposalTimeline({ elements: before, transitions: [] }, [{
    element_id: before[0]!.id, rationale: "Remove the second word",
    source_range_cut: {
      source_start_seconds: 3, source_end_seconds: 4,
      removed_segment_id: "33333333-3333-4333-8333-333333333333",
      inserted_element_id: "44444444-4444-4444-8444-444444444444",
      ripple_lane_keys: ["audio_narrator", "captions_0"], max_affected_elements: 10,
    },
  }]);
  const captions = result.timeline.elements.filter((row) => row.type === "caption_text" && !row.removed_at);
  assert.deepEqual(captions.map((row) => row.props?.text), ["One", "three four"]);
  assert.deepEqual(captions.map((row) => row.timeline_start), [10, 11]);
});

test("split route returns atomic Undo/Redo snapshots including all caption rows", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "caption-follow-history-"));
  const prior = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    createProject("test", "web");
    const before = { elements: fixture(), transitions: [] };
    writeTimeline("test", before, "fixture");
    const response = await splitRoute(new Request("http://localhost/test", {
      method: "POST", body: JSON.stringify({ split_at: 12 }),
    }), { params: Promise.resolve({ projectId: "test", elementId: before.elements[0]!.id }) });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.caption_follow_elements.length, 4);
    const split = readTimeline("test");
    restoreProjectHistorySnapshot("test", body.history.before.id);
    assert.deepEqual(readTimeline("test").elements, before.elements);
    restoreProjectHistorySnapshot("test", body.history.after.id);
    assert.deepEqual(readTimeline("test").elements, split.elements);
  } finally {
    if (prior === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = prior;
  }
});

test("restoring compacted audio also rehydrates its archived caption followers", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "caption-follow-archive-"));
  const prior = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    createProject("test", "web");
    const elements = fixture();
    writeTimeline("test", { elements, transitions: [] }, "fixture");
    const params = { params: Promise.resolve({ projectId: "test", elementId: elements[0]!.id }) };
    assert.equal((await deleteRoute(new Request("http://localhost/test", { method: "DELETE" }), params)).status, 200);
    applyTimelineCompaction("test");
    assert.equal(readTimeline("test").elements.length, 0);
    assert.equal((await restoreRoute(new Request("http://localhost/test", { method: "POST" }), params)).status, 200);
    const restored = readTimeline("test").elements;
    assert.equal(restored.length, 2);
    assert.ok(restored.every((row) => row.removed_at == null));
    assert.equal(restored[1]!.props?.text, "One two three four");
  } finally {
    if (prior === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = prior;
  }
});
