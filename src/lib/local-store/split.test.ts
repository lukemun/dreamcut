import assert from "node:assert/strict";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";
import { splitElementAtomic } from "@/lib/local-store/split";
import type { TimelineFile } from "@/lib/local-store/store";
import { speedStepDuration, timelineTimeToSourceTime } from "@/lib/timeline/speed-steps";
import {
  rebaseKeyframesForSplitRight,
  resolveNumberKeyframe,
  resolveTupleKeyframe,
} from "@/lib/timeline/keyframes";

const FPS = 30;
const MIN_FRAMES = 3;

test("splitting speed steps preserves every source frame and the active right-hand rate", () => {
  // Source 2–12: 1x through 6, 2x through 10, then 0.5x through 12.
  for (const split of [2, 4, 5, 6, 8]) {
    const original = element({ duration: 10, trim_start: 2, trim_end: 3,
      props: { source_duration_seconds: 15, keyframes: { playback_rate: [
        { t: 4, source_t: 6, v: 2, ease: "hold" },
        { t: 6, source_t: 10, v: 0.5, ease: "hold" },
      ] } },
    });
    const timeline: TimelineFile = { elements: [structuredClone(original)], transitions: [] };
    const result = splitElementAtomic(timeline, "fixture", original.id, split, FPS, MIN_FRAMES);
    assert.ok(result.ok);
    assert.equal(speedStepDuration(result.updated), split);
    assert.equal(speedStepDuration(result.inserted), original.duration - split);
    for (let t = 0; t <= original.duration; t += 0.25) {
      const half = t < split ? result.updated : result.inserted;
      assert.ok(Math.abs(timelineTimeToSourceTime(half, t < split ? t : t - split)
        - timelineTimeToSourceTime(original, t)) < 1e-6, `split=${split}, t=${t}`);
    }
  }
});

function element(overrides: Partial<TimelineElement> = {}): TimelineElement {
  const now = "2026-07-22T00:00:00.000Z";
  return {
    id: "11111111-1111-4111-8111-111111111111",
    project_id: "fixture", type: "video_clip", source_url: "/media/shot.mp4",
    props: {}, beat_id: null, character_id: null, timeline_start: 0, duration: 4,
    lane_key: "visual_0", lane_index: 0, trim_start: 0, trim_end: null, volume: 1,
    fade_in: 0, fade_out: 0.5, playback_rate: 1, position_locked: false,
    removed_at: null, removed_reason: null, created_at: now, updated_at: now,
    ...overrides,
  };
}

test("splitting a clip mid-ramp keeps the right half's curve continuous", () => {
  const clip = element({
    props: { keyframes: { grade_exposure_ev: [{ t: 0, v: 0 }, { t: 4, v: 2 }] } },
  });
  const timeline: TimelineFile = { elements: [clip], transitions: [] };
  const result = splitElementAtomic(timeline, "fixture", clip.id, 2, FPS, MIN_FRAMES);
  assert.ok(result.ok);

  // Playback equivalence: right half local t must resolve to what the original
  // clip resolved at t + 2. The original ramp hits 1 EV at the cut.
  for (const t of [0, 0.5, 1, 1.5, 2]) {
    const got = resolveNumberKeyframe(result.inserted.props, "grade_exposure_ev", t, -99);
    assert.ok(Math.abs(got - (1 + t / 2)) < 1e-9, `right t=${t}: ${got}`);
  }
  // Left half unchanged: same map, correct values over its own range.
  assert.equal(resolveNumberKeyframe(result.updated.props, "grade_exposure_ev", 2, -99), 1);
  // Both halves keep the split provenance marker.
  assert.equal(result.inserted.props?.split_from_id, clip.id);
});

test("a keyframe exactly at the split lands at the right half's t=0 without duplication", () => {
  const props = { keyframes: { media_scale: [{ t: 0, v: 1 }, { t: 2, v: 1.5 }, { t: 4, v: 2 }] } };
  const rebased = rebaseKeyframesForSplitRight(props, 2);
  const points = (rebased.keyframes as Record<string, Array<{ t: number; v: number }>>).media_scale;
  assert.deepEqual(points.map((point) => [point.t, point.v]), [[0, 1.5], [2, 2]]);
});

test("tuple keyframes stay continuous across the split", () => {
  const props = {
    keyframes: { mask_inset: [{ t: 0, v: [0, 0, 0, 0] }, { t: 4, v: [0.4, 0, 0.4, 0] }] },
  };
  const rebased = rebaseKeyframesForSplitRight(props, 2);
  const at0 = resolveTupleKeyframe(rebased, "mask_inset", 0, [9, 9, 9, 9], { length: 4 });
  assert.deepEqual(at0, [0.2, 0, 0.2, 0]);
  const at2 = resolveTupleKeyframe(rebased, "mask_inset", 2, [9, 9, 9, 9], { length: 4 });
  assert.deepEqual(at2, [0.4, 0, 0.4, 0]);
});

test("hold segments split sample-exactly", () => {
  const props = { keyframes: { media_opacity: [{ t: 0, v: 0.5, ease: "hold" }, { t: 4, v: 1 }] } };
  const rebased = rebaseKeyframesForSplitRight(props, 2);
  const points = (rebased.keyframes as Record<string, Array<{ t: number; v: number; ease?: string }>>).media_opacity;
  // Boundary point holds the left value and inherits the hold ease.
  assert.equal(points[0]!.t, 0);
  assert.equal(points[0]!.v, 0.5);
  assert.equal(points[0]!.ease, "hold");
  assert.equal(resolveNumberKeyframe(rebased, "media_opacity", 1, -99), 0.5);
  assert.equal(resolveNumberKeyframe(rebased, "media_opacity", 2, -99), 1);
});

test("a curve that ended before the split becomes a constant at its final value", () => {
  const props = { keyframes: { grade_saturation: [{ t: 0, v: 1 }, { t: 1, v: 1.4 }] } };
  const rebased = rebaseKeyframesForSplitRight(props, 2);
  const points = (rebased.keyframes as Record<string, Array<{ t: number; v: number }>>).grade_saturation;
  assert.deepEqual(points.map((point) => [point.t, point.v]), [[0, 1.4]]);
});

test("props without keyframes pass through untouched", () => {
  const props = { media_scale: 1.2, split_from_id: "abc" };
  assert.deepEqual(rebaseKeyframesForSplitRight(props, 2), props);
  const clip = element({ props: { media_scale: 1.2 } });
  const timeline: TimelineFile = { elements: [clip], transitions: [] };
  const result = splitElementAtomic(timeline, "fixture", clip.id, 2, FPS, MIN_FRAMES);
  assert.ok(result.ok);
  assert.equal(result.inserted.props?.media_scale, 1.2);
  assert.equal("keyframes" in (result.inserted.props ?? {}), false);
});

test("keyframe rebase shifts by timeline seconds, not playback-rate-scaled source seconds", () => {
  // Keyframe t is clip-local TIMELINE time: the renderer samples frame/fps from
  // the element's Sequence (MediaTransformFrame), untouched by playback_rate.
  // Only trim math scales by rate.
  const clip = element({
    playback_rate: 2,
    props: { keyframes: { grade_exposure_ev: [{ t: 0, v: 0 }, { t: 4, v: 2 }] } },
  });
  const timeline: TimelineFile = { elements: [clip], transitions: [] };
  const result = splitElementAtomic(timeline, "fixture", clip.id, 2, FPS, MIN_FRAMES);
  assert.ok(result.ok);
  // Shift is leftDuration = 2 (not 4): right half opens at the 1 EV midpoint.
  assert.equal(resolveNumberKeyframe(result.inserted.props, "grade_exposure_ev", 0, -99), 1);
  assert.equal(resolveNumberKeyframe(result.inserted.props, "grade_exposure_ev", 2, -99), 2);
  // Trim math, by contrast, does scale by rate.
  assert.equal(result.inserted.trim_start, 4);
});

test("split timing fields are unaffected by the keyframe rebase", () => {
  const clip = element({
    trim_start: 1,
    props: { keyframes: { media_scale: [{ t: 0, v: 1 }, { t: 4, v: 2 }] } },
  });
  const timeline: TimelineFile = { elements: [clip], transitions: [] };
  const result = splitElementAtomic(timeline, "fixture", clip.id, 2, FPS, MIN_FRAMES);
  assert.ok(result.ok);
  assert.equal(result.updated.duration, 2);
  assert.equal(result.inserted.timeline_start, 2);
  assert.equal(result.inserted.duration, 2);
  assert.equal(result.inserted.trim_start, 3); // 1 + leftDuration * rate
});

test("splitting music advances the right segment through the source", () => {
  const clip = element({
    type: "music",
    source_url: "/media/reference.m4a",
    duration: 7,
    trim_start: 0,
    trim_end: null,
    playback_rate: 1,
  });
  const timeline: TimelineFile = { elements: [clip], transitions: [] };
  const result = splitElementAtomic(timeline, "fixture", clip.id, 1.367, FPS, MIN_FRAMES);
  assert.ok(result.ok);

  assert.equal(result.updated.trim_start, 0);
  assert.equal(result.updated.trim_end, 5.633);
  assert.equal(result.inserted.trim_start, 1.367);
  assert.equal(result.inserted.trim_end, null);
});

test("splitting a reversed clip keeps every picture time: the left half owns the source end", () => {
  const original = element({ duration: 5, trim_start: 1, trim_end: 2, playback_rate: 2, props: { source_duration_seconds: 13, playback_reverse: true } });
  const timeline: TimelineFile = { elements: [structuredClone(original)], transitions: [] };
  const result = splitElementAtomic(timeline, "fixture", original.id, 2, FPS, MIN_FRAMES);
  assert.ok(result.ok);
  for (let t = 0; t <= original.duration; t += 0.25) {
    const half = t < 2 ? result.updated : result.inserted;
    assert.ok(Math.abs(timelineTimeToSourceTime(half, t < 2 ? t : t - 2) - timelineTimeToSourceTime(original, t)) < 1e-6, `t=${t}`);
  }
});

test("a split clip plays straight through: no entrance after the split and no exit before it", () => {
  const timeline = {
    elements: [{
      id: "11111111-1111-4111-8111-111111111111", project_id: "p", type: "video_clip", source_url: "/a.mp4",
      props: { animationIn: "fade", animationInDuration: 0.3, animationOut: "fade", animationOutDuration: 0.4, source_duration_seconds: 10 },
      beat_id: null, voice_clip_id: null, character_id: null, timeline_start: 0, duration: 4, trim_start: 0, trim_end: 6,
      lane_key: "visual_0", lane_index: 0, volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1, position_locked: false,
      removed_at: null, removed_reason: null, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
    }],
    transitions: [],
  } as unknown as Parameters<typeof splitElementAtomic>[0];
  const result = splitElementAtomic(timeline, "p", "11111111-1111-4111-8111-111111111111", 2, 30, 1);
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.updated.props?.animationIn, "fade");
  assert.equal(result.updated.props?.animationOut, undefined);
  assert.equal(result.inserted.props?.animationIn, undefined);
  assert.equal(result.inserted.props?.animationOut, "fade");
});
