import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { TimelineElement } from "@/components/studio/timeline/types";
import { createProject, writeTimeline, readTimeline } from "@/lib/local-store/store";
import { deriveProposalTimeline, editorAgentOptionSchema, countOperationMutations } from "@/lib/agent/timeline-editor-agent-apply";
import { applyProposalNumericOverrides } from "@/lib/agent/proposal-overrides";
import { isSupportedProposalControl } from "@/lib/agent/proposal-controls";
import { reviewOperation } from "@/lib/agent/proposal-review";
import { readKeyframeMap } from "@/lib/timeline/keyframes";

process.env.TIMELINE_PROJECTS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "speed-change-"));

const clip = (id: string, lane: string, start: number, duration: number, extra: Partial<TimelineElement> = {}): TimelineElement => ({
  id, project_id: "speed", type: "video_clip", source_url: null, props: {}, beat_id: null, character_id: null,
  timeline_start: start, duration, lane_key: lane, lane_index: 0, trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0,
  playback_rate: 1, position_locked: false, removed_at: null, removed_reason: null, created_at: "2026-10-25T00:00:00.000Z", updated_at: "2026-10-25T00:00:00.000Z",
  ...extra,
});
const ids = {first: "11111111-1111-4111-8111-111111111111", second: "22222222-2222-4222-8222-222222222222", screen: "33333333-3333-4333-8333-333333333333",
  label: "44444444-4444-4444-8444-444444444444", untouched: "55555555-5555-4555-8555-555555555555"};

test("a speed change speeds the speaker and everything above it together, keeping animation in place", () => {
  createProject("speed", "web");
  writeTimeline("speed", {elements: [
    clip(ids.first, "visual_0", 0, 4),
    clip(ids.second, "visual_0", 4, 2, {trim_start: 5}),
    clip(ids.screen, "visual_1", 2, 4, {props: {keyframes: {media_scale: [{t: 0, v: 1}, {t: 2, v: 1.5}]}}}),
    clip(ids.label, "captions_1", 4, 1, {type: "caption_text", props: {text: "Hello"}}),
    clip(ids.untouched, "visual_9", 5, 1),
  ], transitions: []}, "fixture");
  const operation = {element_id: ids.first, speed_change: {factor: 2, ripple_lane_keys: ["visual_0", "visual_1", "captions_1"], max_affected_elements: 10}};
  const after = new Map(deriveProposalTimeline(readTimeline("speed"), [operation] as Parameters<typeof deriveProposalTimeline>[1], "speed").timeline.elements.map(element => [element.id, element]));
  const pick = (id: string) => { const element = after.get(id)!; return [element.timeline_start, element.duration, element.playback_rate]; };
  assert.deepEqual(pick(ids.first), [0, 2, 2], "the speaker plays the same footage twice as fast");
  assert.deepEqual(pick(ids.second), [2, 1, 2], "the next piece follows straight on");
  assert.deepEqual(pick(ids.screen), [1, 2, 2]);
  assert.equal(after.get(ids.second)!.trim_start, 5, "the footage shown does not change");
  assert.deepEqual(readKeyframeMap(after.get(ids.screen)!.props).media_scale!.map(point => point.t), [0, 1], "the push-in lands on the same moment");
  assert.deepEqual(pick(ids.label).slice(0, 2), [2, 0.5]);
  assert.deepEqual(pick(ids.untouched), [5, 1, 1], "lanes that are not named stay put");

  // One operation is one change, and its factor is the card's Speed dial.
  assert.equal(countOperationMutations([operation] as Parameters<typeof countOperationMutations>[0]), 3);
  assert.equal(isSupportedProposalControl("speed_change", "factor", 2), true);
  assert.equal(reviewOperation(readTimeline("speed"), operation as never, 0).changes.find(change => change.field === "factor")?.label, "Speed");
  const option = editorAgentOptionSchema.parse({id: "speed", label: "Faster", summary: "Faster", recommended: true, operations: [operation],
    review_controls: [{operation_index: 0, target: "speed_change", field: "factor"}]});
  const tuned = applyProposalNumericOverrides(option, [{operation_index: 0, target: "speed_change", field: "factor", value: 1.25}]);
  assert.equal(tuned.operations[0]!.speed_change!.factor, 1.25);
  // A clip pushed past 4× plays at 4× and shows less of its footage, so the dial keeps its range.
  const fast = deriveProposalTimeline(readTimeline("speed"), [{...operation, speed_change: {...operation.speed_change, factor: 2}}] as Parameters<typeof deriveProposalTimeline>[1], "speed").timeline.elements;
  writeTimeline("speed", {...readTimeline("speed"), elements: readTimeline("speed").elements.map(element => element.id === ids.screen ? {...element, playback_rate: 3, props: {...element.props, source_duration_seconds: 20}} : element)}, "fixture");
  const capped = deriveProposalTimeline(readTimeline("speed"), [{...operation, speed_change: {...operation.speed_change, factor: 2}}] as Parameters<typeof deriveProposalTimeline>[1], "speed").timeline.elements.find(element => element.id === ids.screen)!;
  assert.equal(fast.length > 0, true);
  assert.deepEqual([capped.timeline_start, capped.duration, capped.playback_rate, capped.trim_end], [1, 2, 4, 12]);
  assert.throws(() => deriveProposalTimeline(readTimeline("speed"), [{...operation, speed_change: {...operation.speed_change, ripple_lane_keys: ["visual_1"]}}] as Parameters<typeof deriveProposalTimeline>[1], "speed"), /include this clip's lane/);
});
