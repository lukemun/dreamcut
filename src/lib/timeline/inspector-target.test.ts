import test from "node:test";
import assert from "node:assert/strict";
import type { TimelineElement } from "@/components/studio/timeline/types";
import { resolveInspectorTarget } from "./inspector-target";
import { commitMaskInsetAtTime, maskInsetStyle, resolveMaskInsetAtTime } from "./media-transform";

const clip = (id: string, start: number, props: Record<string, unknown> = {}): TimelineElement => ({ id, type: "video_clip", timeline_start: start, duration: 5, props, removed_at: null } as TimelineElement);
const speech = clip("speech", 0);
const first = clip("first", 0, { compound_clip_id: "presenter", speech_sync_binding: { source_element_id: "speech" } });
const second = clip("second", 5, { compound_clip_id: "presenter", speech_sync_binding: { source_element_id: "speech" } });
const elements = [speech, first, second];

test("picture and audio resolve persisted authorities without a manual switch", () => {
  assert.equal(resolveInspectorTarget(elements, speech, 7, "picture"), second);
  assert.equal(resolveInspectorTarget(elements, first, 7, "picture"), second);
  assert.equal(resolveInspectorTarget(elements, second, 7, "audio"), speech);
  assert.equal(resolveInspectorTarget(elements, { ...first, duration: 10, props: { ...first.props, compound_clip_presentation: true } }, 7, "picture"), second);
});
test("boundaries, missing targets, and ambiguous followers fail closed", () => {
  assert.equal(resolveInspectorTarget(elements, first, 5, "picture"), second);
  assert.equal(resolveInspectorTarget(elements, first, 10, "picture"), null);
  assert.equal(resolveInspectorTarget([speech, first], speech, 7, "picture"), null);
  assert.equal(resolveInspectorTarget([...elements, { ...second, id: "duplicate" }], speech, 7, "picture"), null);
  assert.equal(resolveInspectorTarget([first], first, 1, "audio"), null);
});
test("mask write changes renderer geometry on the active picture, not the speech or representative", () => {
  const target = resolveInspectorTarget(elements, speech, 7, "picture")!;
  const before = structuredClone(elements);
  const props = commitMaskInsetAtTime(target.props, 7 - target.timeline_start, { top: .5, right: 0, bottom: 0, left: 0 });
  const after = elements.map(e => e.id === target.id ? { ...e, props } : e);
  assert.deepEqual(after[0], before[0]);
  assert.deepEqual(after[1], before[1]);
  assert.notDeepEqual(maskInsetStyle(resolveMaskInsetAtTime(after[2]!.props, 2), 0), maskInsetStyle(resolveMaskInsetAtTime(before[2]!.props, 2), 0));
});
