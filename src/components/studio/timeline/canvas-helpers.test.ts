import assert from "node:assert/strict";
import test from "node:test";

import {
  collectSecondarySnapTargets,
  collectSnapTargets,
  computeSecondarySnap,
  computeSnap,
  computeRulerSnap,
  getSnapReleasePx,
  getSnapThresholdPx,
  getRulerSnapStep,
  getRulerLabelStep,
  getRulerTickStep,
  pointInCircle,
  pointInRect,
  pointInSquare,
  resolveLaneHeightAnchoredScrollTop,
  snapBoundaryToRuler,
  snapBoundaryToSecondaryTargets,
  snapBoundaryToTargets,
} from "@/components/studio/timeline/canvas-helpers";
import type { TimelineBeatBand, TimelineElement } from "@/components/studio/timeline/types";

function buildElement(overrides: Partial<TimelineElement>): TimelineElement {
  return {
    id: overrides.id ?? "el-1",
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
    created_at: "2026-03-18T00:00:00.000Z",
    updated_at: "2026-03-18T00:00:00.000Z",
    ...overrides,
  };
}

function buildBeat(id: string, startSec: number, endSec: number): TimelineBeatBand {
  return {
    id,
    sort_order: 0,
    beat_label: id,
    duration_seconds: endSec - startSec,
    startSec,
    endSec,
  };
}

test("lane height changes preserve the lane and relative point under the viewport", () => {
  const scrollTop = resolveLaneHeightAnchoredScrollTop({
    scrollTop: 150,
    viewportHeight: 300,
    rulerHeight: 64,
    contentHeight: 760,
    previousLayouts: [
      { key: "v1", top: 64, height: 100 },
      { key: "v2", top: 164, height: 100 },
      { key: "v3", top: 264, height: 100 },
    ],
    nextLayouts: [
      { key: "v1", top: 64, height: 200 },
      { key: "v2", top: 264, height: 200 },
      { key: "v3", top: 464, height: 200 },
    ],
  });

  // The viewport was halfway through V2 and remains halfway through V2.
  assert.equal(scrollTop, 300);
});

test("lane height anchoring leaves scroll alone when lane order changes", () => {
  assert.equal(resolveLaneHeightAnchoredScrollTop({
    scrollTop: 150,
    viewportHeight: 300,
    rulerHeight: 64,
    contentHeight: 760,
    previousLayouts: [{ key: "v1", top: 64, height: 100 }, { key: "v2", top: 164, height: 100 }],
    nextLayouts: [{ key: "v2", top: 64, height: 200 }, { key: "v1", top: 264, height: 200 }],
  }), 150);
});

test("collectSnapTargets excludes the active element and includes beat boundaries", () => {
  const targets = collectSnapTargets(
    "active",
    [buildBeat("beat-1", 0, 5)],
    [
      buildElement({ id: "active", timeline_start: 1, duration: 2 }),
      buildElement({ id: "other", timeline_start: 7, duration: 3 }),
    ],
  );

  assert.deepEqual(targets, [0, 5, 7, 10]);
});

test("collectSnapTargets can include the playhead", () => {
  const targets = collectSnapTargets(
    "active",
    [buildBeat("beat-1", 0, 5)],
    [buildElement({ id: "other", timeline_start: 7, duration: 3 })],
    { playheadSec: 2.5 },
  );

  assert.deepEqual(targets, [2.5, 0, 5, 7, 10]);
});

test("collectSecondarySnapTargets includes transition seam points from other elements", () => {
  const targets = collectSecondarySnapTargets(
    "active",
    [
      buildElement({ id: "active", timeline_start: 1, duration: 2 }),
      buildElement({
        id: "with-in",
        timeline_start: 5,
        duration: 2,
        transition_in: {
          id: "t-in",
          project_id: "project-1",
          from_element_id: "prev",
          to_element_id: "with-in",
          type: "fade",
          duration_seconds: 0.5,
          params: null,
          removed_at: null,
          removed_reason: null,
          created_at: "2026-03-18T00:00:00.000Z",
          updated_at: "2026-03-18T00:00:00.000Z",
        },
      }),
      buildElement({
        id: "with-out",
        timeline_start: 8,
        duration: 3,
        transition_out: {
          id: "t-out",
          project_id: "project-1",
          from_element_id: "with-out",
          to_element_id: "next",
          type: "fade",
          duration_seconds: 0.5,
          params: null,
          removed_at: null,
          removed_reason: null,
          created_at: "2026-03-18T00:00:00.000Z",
          updated_at: "2026-03-18T00:00:00.000Z",
        },
      }),
    ],
  );

  assert.deepEqual(targets, [5, 11]);
});

test("primary snap targets exclude clip boundaries that are consumed by transitions", () => {
  const targets = collectSnapTargets(
    "active",
    [],
    [
      buildElement({
        id: "transitioned",
        timeline_start: 5,
        duration: 2,
        transition_in: {
          id: "t-in",
          project_id: "project-1",
          from_element_id: "prev",
          to_element_id: "transitioned",
          type: "fade",
          duration_seconds: 0.5,
          params: null,
          removed_at: null,
          removed_reason: null,
          created_at: "2026-03-18T00:00:00.000Z",
          updated_at: "2026-03-18T00:00:00.000Z",
        },
        transition_out: {
          id: "t-out",
          project_id: "project-1",
          from_element_id: "transitioned",
          to_element_id: "next",
          type: "fade",
          duration_seconds: 0.5,
          params: null,
          removed_at: null,
          removed_reason: null,
          created_at: "2026-03-18T00:00:00.000Z",
          updated_at: "2026-03-18T00:00:00.000Z",
        },
      }),
    ],
  );

  assert.deepEqual(targets, []);
});

test("collectSnapTargets includes overflow hold boundaries for video clips", () => {
  const targets = collectSnapTargets(
    "active",
    [],
    [
      buildElement({
        id: "video",
        type: "video_clip",
        timeline_start: 7,
        duration: 10,
        trim_start: 0,
        trim_end: 0,
        playback_rate: 1,
        props: { source_duration_seconds: 6 },
      }),
    ],
  );

  assert.deepEqual(targets, [7, 17, 13]);
});

test("collectSnapTargets includes the still-to-video transition for leading-hold clips", () => {
  const targets = collectSnapTargets(
    "active",
    [],
    [
      buildElement({
        id: "video",
        type: "video_clip",
        timeline_start: 7,
        duration: 10,
        trim_start: 0,
        trim_end: 0,
        playback_rate: 1,
        props: {
          source_duration_seconds: 6,
          leading_hold_duration_seconds: 2,
          media_limit_duration_seconds: 6,
        },
      }),
    ],
  );

  assert.deepEqual(targets, [7, 17, 9, 15]);
});

test("computeSnap snaps the clip start when a target is within threshold", () => {
  const result = computeSnap(
    4.95,
    2,
    "active",
    [buildBeat("beat-1", 0, 5)],
    [buildElement({ id: "other", timeline_start: 10, duration: 2 })],
    100,
  );

  assert.deepEqual(result, { position: 5, snapLine: 5 });
});

test("computeSnap snaps the clip end when the end edge is closest", () => {
  const result = computeSnap(
    3.04,
    2,
    "active",
    [buildBeat("beat-1", 0, 5)],
    [buildElement({ id: "other", timeline_start: 10, duration: 2 })],
    100,
  );

  assert.deepEqual(result, { position: 3, snapLine: 5 });
});

test("computeSnap can include overflow hold boundaries when requested", () => {
  const result = computeSnap(
    14.96,
    1,
    "active",
    [],
    [
      buildElement({
        id: "video",
        type: "video_clip",
        timeline_start: 7,
        duration: 10,
        trim_start: 0,
        trim_end: 0,
        playback_rate: 1,
        props: {
          source_duration_seconds: 6,
          leading_hold_duration_seconds: 2,
          media_limit_duration_seconds: 6,
        },
      }),
    ],
    100,
    { includeOverflowTargets: true },
  );

  assert.deepEqual(result, { position: 15, snapLine: 15 });
});

test("computeSnap can snap to the playhead when requested", () => {
  const result = computeSnap(
    4.96,
    1,
    "active",
    [],
    [],
    100,
    { playheadSec: 5 },
  );

  assert.deepEqual(result, { position: 5, snapLine: 5 });
});

test("computeSnap prefers the closer edge instead of always preferring clip start", () => {
  const result = computeSnap(
    2.93,
    2,
    "active",
    [buildBeat("beat-1", 0, 5)],
    [],
    100,
  );

  assert.deepEqual(result, { position: 3, snapLine: 5 });
});

test("computeSnap ignores overflow-hold internal video boundaries during drag snapping", () => {
  const result = computeSnap(
    10.96,
    2,
    "active",
    [],
    [
      buildElement({
        id: "video",
        type: "video_clip",
        timeline_start: 7,
        duration: 10,
        trim_start: 0,
        trim_end: 0,
        playback_rate: 1,
        props: {
          source_duration_seconds: 6,
          leading_hold_duration_seconds: 2,
          media_limit_duration_seconds: 6,
        },
      }),
    ],
    100,
  );

  assert.deepEqual(result, { position: 10.96, snapLine: null });
});

test("snapBoundaryToTargets snaps to the nearest target within threshold", () => {
  const snapped = snapBoundaryToTargets(1.96, 100, [1, 2, 3]);
  const unsnapped = snapBoundaryToTargets(1.85, 100, [1, 2, 3]);

  assert.deepEqual(snapped, { boundarySec: 2, snapLine: 2 });
  assert.deepEqual(unsnapped, { boundarySec: 1.85, snapLine: null });
});

test("boundary snapping chooses the closest crowded clip edge instead of file order", () => {
  const crowdedTargets = [13.666667, 13.133333, 13.147, 13.466667];

  assert.deepEqual(
    snapBoundaryToTargets(13.48, 27, crowdedTargets),
    { boundarySec: 13.466667, snapLine: 13.466667 },
  );
  assert.deepEqual(
    snapBoundaryToSecondaryTargets(13.48, 20, crowdedTargets),
    { boundarySec: 13.466667, snapLine: 13.466667 },
  );
});

test("secondary snap targets use a weaker threshold than primary targets", () => {
  const snapped = snapBoundaryToSecondaryTargets(4.96, 100, [5]);
  const unsnapped = snapBoundaryToSecondaryTargets(4.94, 100, [5]);

  assert.deepEqual(snapped, { boundarySec: 5, snapLine: 5 });
  assert.deepEqual(unsnapped, { boundarySec: 4.94, snapLine: null });
});

test("snap tier config exposes weaker secondary release and tighter ruler threshold", () => {
  assert.equal(getSnapThresholdPx("primary"), 8);
  assert.equal(getSnapThresholdPx("secondary"), 5);
  assert.equal(getSnapThresholdPx("ruler"), 5);
  assert.equal(getSnapReleasePx("primary"), 20);
  assert.equal(getSnapReleasePx("secondary"), 10);
  assert.equal(getSnapReleasePx("ruler"), null);
});

test("ruler tick density delays half-second ticks until denser zoom", () => {
  assert.equal(getRulerTickStep(74), 1);
  assert.equal(getRulerTickStep(75), 0.5);
  assert.equal(getRulerTickStep(120), 0.1);
  assert.equal(getRulerSnapStep(30), null);
  assert.equal(getRulerSnapStep(74), null);
  assert.equal(getRulerSnapStep(80), 0.5);
  assert.equal(getRulerSnapStep(8), null);
});

test("computeRulerSnap snaps to one-second ticks when that grid is active", () => {
  const result = computeRulerSnap(2.97, 1, 30);
  assert.deepEqual(result, { position: 2.97, snapLine: null });
});

test("computeRulerSnap snaps to half-second ticks when that grid is active", () => {
  const result = computeRulerSnap(2.48, 1, 80);
  assert.deepEqual(result, { position: 2.5, snapLine: 2.5 });
});

test("computeRulerSnap also snaps to full seconds on the active half-second grid", () => {
  const result = computeRulerSnap(0.96, 1, 80);
  assert.deepEqual(result, { position: 1, snapLine: 1 });
});

test("computeRulerSnap snaps to half-second boundaries directly on the active grid", () => {
  const result = computeRulerSnap(0.46, 1, 80);
  assert.deepEqual(result, { position: 0.5, snapLine: 0.5 });
});

test("computeSecondarySnap can snap either edge to a transition seam", () => {
  const result = computeSecondarySnap(2.04, 1, 100, [3]);
  assert.deepEqual(result, { position: 2, snapLine: 3 });
});

test("snapBoundaryToRuler uses the weaker ruler threshold", () => {
  const snapped = snapBoundaryToRuler(3.04, 80);
  const unsnapped = snapBoundaryToRuler(3.08, 80);

  assert.deepEqual(snapped, { boundarySec: 3, snapLine: 3 });
  assert.deepEqual(unsnapped, { boundarySec: 3.08, snapLine: null });
});

test("geometry helpers match expected region hit behavior", () => {
  assert.equal(pointInRect(5, 5, { x: 0, y: 0, width: 10, height: 10 }), true);
  assert.equal(pointInSquare(12, 12, { x: 10, y: 10, size: 4 }), true);
  assert.equal(pointInCircle(13, 10, { x: 10, y: 10, radius: 3 }), true);
  assert.equal(pointInCircle(14, 10, { x: 10, y: 10, radius: 3 }), false);
});

test("musical beats participate in nearest-target snapping only when supplied", () => {
  const off = computeSnap(1.04, 0.2, "drag", [], [], 100);
  assert.equal(off.snapLine, null);
  const on = computeSnap(1.04, 0.2, "drag", [], [], 100, { musicalBeatTimes: [1] });
  assert.equal(on.position, 1);
  assert.equal(snapBoundaryToTargets(1.04, 100, collectSnapTargets("drag", [], [], { musicalBeatTimes: [1] })).boundarySec, 1);
});

test("ruler ticks and labels thin out when zoomed far out", () => {
  // A 566s video across ~1100px is about 2px per second.
  const tick = getRulerTickStep(2);
  assert.ok(tick * 2 >= 8, `ticks ${tick}s apart are too dense`);
  const label = getRulerLabelStep(2, tick, 30);
  assert.ok(label * 2 >= 46, `labels ${label}s apart would overlap`);
  assert.equal(Math.round(label / tick) * tick, label);
  // Close in, labels keep their usual spacing.
  assert.equal(getRulerLabelStep(120, 0.1, 40), 0.5);
});
