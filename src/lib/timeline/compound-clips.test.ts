import assert from "node:assert/strict";
import test from "node:test";

import {
  compoundClipId,
  compoundClipMemberAtTime,
  compoundClipMembers,
  compoundClipPresentationElements,
  compoundSelectionIds,
  compoundSelectionItemCount,
} from "./compound-clips";
import type { TimelineElement } from "@/components/studio/timeline/types";

function element(id: string, compoundId?: string): TimelineElement {
  return {
    id,
    project_id: "compound-test",
    type: "vo_segment",
    source_url: `/media/${id}.wav`,
    props: compoundId ? { compound_clip_id: compoundId } : {},
    beat_id: null,
    voice_clip_id: null,
    character_id: null,
    timeline_start: 0,
    duration: 1,
    lane_key: "audio_narrator",
    lane_index: 0,
    trim_start: 0,
    trim_end: 0,
    volume: 1,
    fade_in: 0,
    fade_out: 0,
    playback_rate: 1,
    position_locked: false,
    removed_at: null,
    removed_reason: null,
    created_at: "2026-09-16T00:00:00.000Z",
    updated_at: "2026-09-16T00:00:00.000Z",
  };
}

test("compound selection expands one clicked member to the complete active group", () => {
  const elements = [element("a", "group-1"), element("b", "group-1"), element("c")];
  assert.equal(compoundClipId(elements[0]), "group-1");
  assert.deepEqual(compoundClipMembers(elements, elements[0]).map((entry) => entry.id), ["a", "b"]);
  assert.deepEqual(compoundSelectionIds(elements, "a"), ["a", "b"]);
  assert.deepEqual(compoundSelectionIds(elements, "c"), ["c"]);
});

test("removed compound members stay out of the active selection", () => {
  const removed = { ...element("b", "group-1"), removed_at: "2026-09-16T00:01:00.000Z" };
  const elements = [element("a", "group-1"), removed];
  assert.deepEqual(compoundSelectionIds(elements, "a"), ["a"]);
});

test("compound members count as one selected timeline item", () => {
  const elements = [element("a", "group-1"), element("b", "group-1"), element("c")];
  assert.equal(compoundSelectionItemCount(elements, ["a", "b"]), 1);
  assert.equal(compoundSelectionItemCount(elements, ["a", "b", "c"]), 2);
});

test("compound members render as one timeline container spanning every member", () => {
  const first = { ...element("a", "group-1"), timeline_start: 2, duration: 1.5, props: { ...element("a", "group-1").props, keyframes: { media_opacity: [{ t: 0.5, v: 0 }] } } };
  const second = { ...element("b", "group-1"), timeline_start: 3.5, duration: 2, props: { ...element("b", "group-1").props, keyframes: { media_opacity: [{ t: 1, v: 1 }] } } };
  const standalone = { ...element("c"), timeline_start: 8 };

  const presentation = compoundClipPresentationElements([first, second, standalone]);

  assert.equal(presentation.length, 2);
  assert.equal(presentation[0]?.id, "a");
  assert.equal(presentation[0]?.timeline_start, 2);
  assert.equal(presentation[0]?.duration, 3.5);
  assert.equal(presentation[0]?.props?.compound_clip_presentation, true);
  assert.equal(presentation[0]?.props?.compound_clip_member_count, 2);
  assert.deepEqual(presentation[0]?.props?.keyframes, { media_opacity: [{ t: 0.5, v: 0 }, { t: 2.5, v: 1 }] });
  assert.equal(presentation[1]?.id, "c");
});

test("compound playhead targeting selects the member under the visible compound time", () => {
  const first = { ...element("a", "group-1"), timeline_start: 2, duration: 1.5 };
  const second = { ...element("b", "group-1"), timeline_start: 3.5, duration: 2 };
  const members = [first, second];
  assert.equal(compoundClipMemberAtTime(members, first, 2.75)?.id, "a");
  assert.equal(compoundClipMemberAtTime(members, first, 4.25)?.id, "b");
  assert.equal(compoundClipMemberAtTime(members, first, 3.5)?.id, "b");
});

test("removed members do not extend a compound presentation", () => {
  const first = { ...element("a", "group-1"), timeline_start: 2, duration: 1 };
  const removed = {
    ...element("b", "group-1"),
    timeline_start: 9,
    duration: 4,
    removed_at: "2026-09-16T00:01:00.000Z",
  };

  const presentation = compoundClipPresentationElements([first, removed]);

  assert.equal(presentation.length, 1);
  assert.equal(presentation[0]?.id, "a");
  assert.equal(presentation[0]?.duration, 1);
  assert.equal(presentation[0]?.props?.compound_clip_presentation, undefined);
});
