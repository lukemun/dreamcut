import assert from "node:assert/strict";
import test from "node:test";

import {
  adjustEnvelopeForDuration,
  insertEnvelopePoint,
  interpolateEnvelopeVolume,
  moveEnvelopePoint,
  moveEnvelopeSegment,
  normalizeVolumeEnvelope,
  readVolumeEnvelopePoints,
  retargetVolumeEnvelope,
  splitEnvelope,
  writeVolumeEnvelopePatch,
  type EnvelopePoint,
} from "@/lib/timeline/volume-envelope";

// ── readVolumeEnvelopePoints ─────────────────────────────────────────────────

test("readVolumeEnvelopePoints returns default for missing props", () => {
  const result = readVolumeEnvelopePoints({ props: null }, 5);
  assert.equal(result.length, 2);
  assert.equal(result[0]!.time_seconds, 0);
  assert.equal(result[0]!.volume, 1);
  assert.equal(result[1]!.time_seconds, 5);
  assert.equal(result[1]!.volume, 1);
});

test("readVolumeEnvelopePoints falls back to element.volume when envelope is missing", () => {
  const result = readVolumeEnvelopePoints({ props: null, volume: 1.33 }, 5);
  assert.equal(result.length, 2);
  assert.equal(result[0]!.time_seconds, 0);
  assert.equal(result[0]!.volume, 1.33);
  assert.equal(result[1]!.time_seconds, 5);
  assert.equal(result[1]!.volume, 1.33);
});

test("readVolumeEnvelopePoints returns default for non-array volume_envelope", () => {
  const result = readVolumeEnvelopePoints({ props: { volume_envelope: "bad" } }, 3);
  assert.equal(result.length, 2);
  assert.equal(result[0]!.time_seconds, 0);
  assert.equal(result[1]!.time_seconds, 3);
});

test("readVolumeEnvelopePoints never returns NaN for malformed legacy timing", () => {
  const result = readVolumeEnvelopePoints({ volume: Number.NaN }, Number.NaN);

  assert.deepEqual(result, [
    { time_seconds: 0, volume: 1 },
    { time_seconds: 0, volume: 1 },
  ]);
  assert.ok(result.every((point) => Number.isFinite(point.time_seconds) && Number.isFinite(point.volume)));
});

test("readVolumeEnvelopePoints returns default for empty array", () => {
  const result = readVolumeEnvelopePoints({ props: { volume_envelope: [] } }, 4);
  assert.equal(result.length, 2);
  assert.equal(result[0]!.volume, 1);
});

test("readVolumeEnvelopePoints returns default for single point", () => {
  const result = readVolumeEnvelopePoints(
    { props: { volume_envelope: [{ time_seconds: 0, volume: 0.5 }] } },
    4,
  );
  assert.equal(result.length, 2);
  assert.equal(result[0]!.volume, 1);
});

test("readVolumeEnvelopePoints returns default for wrong types in array", () => {
  const result = readVolumeEnvelopePoints(
    { props: { volume_envelope: [42, "foo", null] } },
    2,
  );
  assert.equal(result.length, 2);
});

test("readVolumeEnvelopePoints normalizes valid envelope", () => {
  const result = readVolumeEnvelopePoints(
    {
      props: {
        volume_envelope: [
          { time_seconds: 0, volume: 0.8 },
          { time_seconds: 2, volume: 1.5 },
          { time_seconds: 5, volume: 0.6 },
        ],
      },
    },
    5,
  );
  assert.equal(result.length, 3);
  assert.equal(result[0]!.time_seconds, 0);
  assert.equal(result[0]!.volume, 0.8);
  assert.equal(result[1]!.time_seconds, 2);
  assert.equal(result[1]!.volume, 1.5);
  assert.equal(result[2]!.time_seconds, 5);
  assert.equal(result[2]!.volume, 0.6);
});

test("readVolumeEnvelopePoints never throws", () => {
  assert.doesNotThrow(() => readVolumeEnvelopePoints({ props: undefined as unknown as null }, 1));
  assert.doesNotThrow(() => readVolumeEnvelopePoints({ props: { volume_envelope: undefined } }, 1));
  assert.doesNotThrow(() => readVolumeEnvelopePoints({ props: { volume_envelope: { not: "array" } } }, 1));
});

// ── normalizeVolumeEnvelope ──────────────────────────────────────────────────

test("normalizeVolumeEnvelope sorts points by time", () => {
  const result = normalizeVolumeEnvelope(
    [
      { time_seconds: 3, volume: 0.5 },
      { time_seconds: 0, volume: 1 },
      { time_seconds: 1, volume: 0.8 },
      { time_seconds: 5, volume: 1 },
    ],
    5,
  );
  for (let i = 0; i < result.length - 1; i++) {
    assert.ok(result[i]!.time_seconds < result[i + 1]!.time_seconds);
  }
});

test("normalizeVolumeEnvelope clamps volume to [0, 4]", () => {
  const result = normalizeVolumeEnvelope(
    [
      { time_seconds: 0, volume: -1 },
      { time_seconds: 5, volume: 5 },
    ],
    5,
  );
  assert.equal(result[0]!.volume, 0);
  assert.equal(result[1]!.volume, 4);
});

test("normalizeVolumeEnvelope ensures endpoints exist", () => {
  const result = normalizeVolumeEnvelope(
    [{ time_seconds: 2, volume: 0.5 }],
    5,
  );
  assert.equal(result[0]!.time_seconds, 0);
  assert.equal(result[result.length - 1]!.time_seconds, 5);
});

test("normalizeVolumeEnvelope drops points beyond duration", () => {
  const result = normalizeVolumeEnvelope(
    [
      { time_seconds: 0, volume: 1 },
      { time_seconds: 2, volume: 0.5 },
      { time_seconds: 8, volume: 0.3 },
      { time_seconds: 5, volume: 1 },
    ],
    5,
  );
  assert.ok(result.every((p) => p.time_seconds <= 5));
  assert.equal(result.length, 3); // start, interior at 2, end at 5
});

test("normalizeVolumeEnvelope deduplicates points at the same time", () => {
  const result = normalizeVolumeEnvelope(
    [
      { time_seconds: 0, volume: 1 },
      { time_seconds: 2, volume: 0.5 },
      { time_seconds: 2, volume: 0.8 },
      { time_seconds: 5, volume: 1 },
    ],
    5,
  );
  const timesAt2 = result.filter((p) => p.time_seconds === 2);
  assert.equal(timesAt2.length, 1);
});

test("normalizeVolumeEnvelope rounds to 3 decimal places", () => {
  const result = normalizeVolumeEnvelope(
    [
      { time_seconds: 0, volume: 1.00001 },
      { time_seconds: 2.12345, volume: 0.56789 },
      { time_seconds: 5, volume: 1 },
    ],
    5,
  );
  assert.equal(result[1]!.time_seconds, 2.123);
  assert.equal(result[1]!.volume, 0.568);
});

test("normalizeVolumeEnvelope snaps near-zero volumes to exact 0", () => {
  const result = normalizeVolumeEnvelope(
    [
      { time_seconds: 0, volume: 0.015 },
      { time_seconds: 5, volume: 0.012 },
    ],
    5,
  );
  assert.equal(result[0]!.volume, 0);
  assert.equal(result[1]!.volume, 0);
});

// ── writeVolumeEnvelopePatch ─────────────────────────────────────────────────

test("writeVolumeEnvelopePatch preserves unrelated props", () => {
  const element = { props: { some_key: "value", other: 42 } };
  const result = writeVolumeEnvelopePatch(
    element,
    [{ time_seconds: 0, volume: 1 }, { time_seconds: 3, volume: 1 }],
    3,
  );
  assert.equal(result.props.some_key, "value");
  assert.equal(result.props.other, 42);
  assert.equal(result.volume, 1);
  assert.ok(Array.isArray(result.props.volume_envelope));
});

test("writeVolumeEnvelopePatch handles null props", () => {
  const result = writeVolumeEnvelopePatch(
    { props: null },
    [{ time_seconds: 0, volume: 1 }, { time_seconds: 3, volume: 1 }],
    3,
  );
  assert.ok(Array.isArray(result.props.volume_envelope));
});

test("writeVolumeEnvelopePatch normalizes the envelope", () => {
  const result = writeVolumeEnvelopePatch(
    { props: null },
    [{ time_seconds: 0, volume: -1 }, { time_seconds: 3, volume: 5 }],
    3,
  );
  const envelope = result.props.volume_envelope as EnvelopePoint[];
  assert.equal(result.volume, 0);
  assert.equal(envelope[0]!.volume, 0);
  assert.equal(envelope[1]!.volume, 4);
});

test("retargetVolumeEnvelope shifts the whole automation shape to a new opening gain", () => {
  assert.deepEqual(
    retargetVolumeEnvelope([
      { time_seconds: 0, volume: 0.4 },
      { time_seconds: 1, volume: 0.2 },
      { time_seconds: 2, volume: 0.6 },
    ], 0.7),
    [
      { time_seconds: 0, volume: 0.7 },
      { time_seconds: 1, volume: 0.5 },
      { time_seconds: 2, volume: 0.9 },
    ],
  );
});

// ── adjustEnvelopeForDuration ────────────────────────────────────────────────

test("adjustEnvelopeForDuration moves end endpoint to new duration", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 1 },
    { time_seconds: 2, volume: 0.5 },
    { time_seconds: 5, volume: 0.8 },
  ];
  const result = adjustEnvelopeForDuration(points, 8);
  assert.equal(result[0]!.time_seconds, 0);
  assert.equal(result[1]!.time_seconds, 2);
  assert.equal(result[2]!.time_seconds, 8);
  assert.equal(result[2]!.volume, 0.8); // preserves original end volume
});

test("adjustEnvelopeForDuration drops interior points beyond new duration", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 1 },
    { time_seconds: 2, volume: 0.5 },
    { time_seconds: 4, volume: 0.3 },
    { time_seconds: 5, volume: 0.8 },
  ];
  const result = adjustEnvelopeForDuration(points, 3);
  assert.equal(result.length, 3); // start, interior at 2, end at 3
  assert.equal(result[1]!.time_seconds, 2);
  assert.equal(result[2]!.time_seconds, 3);
});

test("adjustEnvelopeForDuration interpolates end volume when shortening", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 1 },
    { time_seconds: 2, volume: 0.5 },
    { time_seconds: 5, volume: 0.8 },
  ];
  const result = adjustEnvelopeForDuration(points, 3);
  assert.equal(result[result.length - 1]!.time_seconds, 3);
  assert.equal(result[result.length - 1]!.volume, 0.6);
});

test("adjustEnvelopeForDuration preserves interior points (no scaling)", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 1 },
    { time_seconds: 1, volume: 0.5 },
    { time_seconds: 3, volume: 0.8 },
    { time_seconds: 5, volume: 1 },
  ];
  const result = adjustEnvelopeForDuration(points, 10);
  assert.equal(result[1]!.time_seconds, 1);
  assert.equal(result[1]!.volume, 0.5);
  assert.equal(result[2]!.time_seconds, 3);
  assert.equal(result[2]!.volume, 0.8);
});

test("adjustEnvelopeForDuration returns default for malformed input", () => {
  const result = adjustEnvelopeForDuration([], 5);
  assert.equal(result.length, 2);
  assert.equal(result[0]!.time_seconds, 0);
  assert.equal(result[1]!.time_seconds, 5);
});

// ── interpolateEnvelopeVolume ────────────────────────────────────────────────

test("interpolateEnvelopeVolume returns 1 for empty points", () => {
  assert.equal(interpolateEnvelopeVolume([], 2), 1);
});

test("interpolateEnvelopeVolume returns first point volume before start", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 0.5 },
    { time_seconds: 5, volume: 1 },
  ];
  assert.equal(interpolateEnvelopeVolume(points, -1), 0.5);
});

test("interpolateEnvelopeVolume returns last point volume after end", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 0.5 },
    { time_seconds: 5, volume: 1 },
  ];
  assert.equal(interpolateEnvelopeVolume(points, 10), 1);
});

test("interpolateEnvelopeVolume interpolates linearly at midpoint", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 0 },
    { time_seconds: 4, volume: 2 },
  ];
  assert.equal(interpolateEnvelopeVolume(points, 2), 1);
});

test("interpolateEnvelopeVolume interpolates between interior points", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 1 },
    { time_seconds: 2, volume: 0 },
    { time_seconds: 4, volume: 2 },
  ];
  // At t=3, between (2,0) and (4,2) → 1
  assert.equal(interpolateEnvelopeVolume(points, 3), 1);
});

test("interpolateEnvelopeVolume returns exact value at a point", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 1 },
    { time_seconds: 2, volume: 0.5 },
    { time_seconds: 5, volume: 1 },
  ];
  assert.equal(interpolateEnvelopeVolume(points, 2), 0.5);
});

// ── insertEnvelopePoint ──────────────────────────────────────────────────────

test("insertEnvelopePoint interpolates volume (shape unchanged)", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 0 },
    { time_seconds: 4, volume: 2 },
  ];
  const result = insertEnvelopePoint(points, 2);
  assert.equal(result.length, 3);
  assert.equal(result[1]!.time_seconds, 2);
  assert.equal(result[1]!.volume, 1);
});

test("insertEnvelopePoint does not duplicate at existing time", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 1 },
    { time_seconds: 2, volume: 0.5 },
    { time_seconds: 5, volume: 1 },
  ];
  const result = insertEnvelopePoint(points, 2);
  assert.equal(result.length, 3); // unchanged
});

test("insertEnvelopePoint result is sorted", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 1 },
    { time_seconds: 2, volume: 0.5 },
    { time_seconds: 5, volume: 1 },
  ];
  const result = insertEnvelopePoint(points, 3);
  assert.equal(result.length, 4);
  for (let i = 0; i < result.length - 1; i++) {
    assert.ok(result[i]!.time_seconds <= result[i + 1]!.time_seconds);
  }
});

// ── moveEnvelopePoint ────────────────────────────────────────────────────────

test("moveEnvelopePoint time-locks start endpoint", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 1 },
    { time_seconds: 2, volume: 0.5 },
    { time_seconds: 5, volume: 1 },
  ];
  const result = moveEnvelopePoint(points, 0, 99, 0.3);
  assert.equal(result[0]!.time_seconds, 0); // time unchanged
  assert.equal(result[0]!.volume, 0.3); // volume changed
});

test("moveEnvelopePoint time-locks end endpoint", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 1 },
    { time_seconds: 2, volume: 0.5 },
    { time_seconds: 5, volume: 1 },
  ];
  const result = moveEnvelopePoint(points, 2, 99, 0.7);
  assert.equal(result[2]!.time_seconds, 5); // time unchanged
  assert.equal(result[2]!.volume, 0.7); // volume changed
});

test("moveEnvelopePoint clamps interior point to neighbors", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 1 },
    { time_seconds: 2, volume: 0.5 },
    { time_seconds: 5, volume: 1 },
  ];
  const result = moveEnvelopePoint(points, 1, -5, 0.8);
  assert.ok(result[1]!.time_seconds > 0);
  assert.ok(result[1]!.time_seconds < 5);
});

test("moveEnvelopePoint clamps volume to [0, 4]", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 1 },
    { time_seconds: 5, volume: 1 },
  ];
  const result = moveEnvelopePoint(points, 0, 0, 5);
  assert.equal(result[0]!.volume, 4);
  const result2 = moveEnvelopePoint(points, 0, 0, -5);
  assert.equal(result2[0]!.volume, 0);
});

// ── moveEnvelopeSegment ──────────────────────────────────────────────────────

test("moveEnvelopeSegment moves both points by same delta", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 1 },
    { time_seconds: 2, volume: 0.5 },
    { time_seconds: 5, volume: 1 },
  ];
  const result = moveEnvelopeSegment(points, 0, 1, 0.3);
  assert.equal(result[0]!.volume, 1.3);
  assert.equal(result[1]!.volume, 0.8);
  assert.equal(result[2]!.volume, 1); // unrelated point unchanged
});

test("moveEnvelopeSegment preserves shape at max volume bound", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 3.8 },
    { time_seconds: 2, volume: 1.5 },
    { time_seconds: 5, volume: 1 },
  ];
  // Request +0.5 but left point can only go +0.2 (to 4.0)
  const result = moveEnvelopeSegment(points, 0, 1, 0.5);
  assert.equal(result[0]!.volume, 4);
  assert.equal(result[1]!.volume, 1.7);
  // Both moved by same clamped delta
  const delta0 = result[0]!.volume - points[0]!.volume;
  const delta1 = result[1]!.volume - points[1]!.volume;
  assert.equal(Number(delta0.toFixed(3)), Number(delta1.toFixed(3)));
});

test("moveEnvelopeSegment preserves shape at min volume bound", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 0.3 },
    { time_seconds: 2, volume: 0.5 },
    { time_seconds: 5, volume: 1 },
  ];
  // Request -1 but left point can only go -0.3 (to 0)
  const result = moveEnvelopeSegment(points, 0, 1, -1);
  assert.equal(result[0]!.volume, 0);
  assert.equal(result[1]!.volume, 0.2);
  const delta0 = result[0]!.volume - points[0]!.volume;
  const delta1 = result[1]!.volume - points[1]!.volume;
  assert.equal(Number(delta0.toFixed(3)), Number(delta1.toFixed(3)));
});

test("moveEnvelopeSegment does not move horizontally", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 1 },
    { time_seconds: 2, volume: 0.5 },
    { time_seconds: 5, volume: 1 },
  ];
  const result = moveEnvelopeSegment(points, 0, 1, 0.2);
  assert.equal(result[0]!.time_seconds, 0);
  assert.equal(result[1]!.time_seconds, 2);
});

// ── splitEnvelope ────────────────────────────────────────────────────────────

test("splitEnvelope interpolates volume at split boundary", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 0 },
    { time_seconds: 4, volume: 2 },
  ];
  const { left, right } = splitEnvelope(points, 2, 2);
  assert.equal(left[left.length - 1]!.volume, 1);
  assert.equal(right[0]!.volume, 1);
});

test("splitEnvelope left half has correct endpoints", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 0.5 },
    { time_seconds: 2, volume: 1 },
    { time_seconds: 5, volume: 0.8 },
  ];
  const { left } = splitEnvelope(points, 3, 2);
  assert.equal(left[0]!.time_seconds, 0);
  assert.equal(left[0]!.volume, 0.5);
  assert.equal(left[left.length - 1]!.time_seconds, 3);
});

test("splitEnvelope right half is re-zeroed", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 0.5 },
    { time_seconds: 2, volume: 1 },
    { time_seconds: 4, volume: 0.3 },
    { time_seconds: 5, volume: 0.8 },
  ];
  const { right } = splitEnvelope(points, 3, 2);
  assert.equal(right[0]!.time_seconds, 0);
  assert.equal(right[right.length - 1]!.time_seconds, 2);
});

test("splitEnvelope drops interior points outside the half's range", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 1 },
    { time_seconds: 1, volume: 0.5 },
    { time_seconds: 3, volume: 0.8 },
    { time_seconds: 5, volume: 1 },
  ];
  const { left, right } = splitEnvelope(points, 2, 3);
  // Left should have: 0, 1, 2 (interpolated). Not 3 or 5.
  assert.ok(left.every((p) => p.time_seconds <= 2));
  // Right should have: 0, 1(=3-2), 3(=5-2). Not the original 1.
  assert.ok(right.every((p) => p.time_seconds >= 0));
  assert.ok(right.every((p) => p.time_seconds <= 3));
});

test("splitEnvelope preserves continuity at split boundary", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 1 },
    { time_seconds: 1, volume: 0.2 },
    { time_seconds: 3, volume: 1.5 },
    { time_seconds: 5, volume: 0.8 },
  ];
  const { left, right } = splitEnvelope(points, 2, 3);
  // Volume at left end must equal volume at right start
  assert.equal(left[left.length - 1]!.volume, right[0]!.volume);
});

test("splitEnvelope reuses exact point at split boundary", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 1 },
    { time_seconds: 2, volume: 0.5 },
    { time_seconds: 5, volume: 1 },
  ];
  const { left, right } = splitEnvelope(points, 2, 3);
  // Point at t=2 exists exactly, should be reused
  assert.equal(left[left.length - 1]!.volume, 0.5);
  assert.equal(right[0]!.volume, 0.5);
});

test("splitEnvelope with simple two-point envelope", () => {
  const points: EnvelopePoint[] = [
    { time_seconds: 0, volume: 1 },
    { time_seconds: 10, volume: 1 },
  ];
  const { left, right } = splitEnvelope(points, 5, 5);
  assert.equal(left.length, 2);
  assert.equal(right.length, 2);
  assert.equal(left[0]!.volume, 1);
  assert.equal(left[1]!.volume, 1);
  assert.equal(right[0]!.volume, 1);
  assert.equal(right[1]!.volume, 1);
});
