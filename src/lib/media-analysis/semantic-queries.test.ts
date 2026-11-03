import assert from "node:assert/strict";
import test from "node:test";

import { focalRegions, rankCaptionRegions, type CaptionQueryLayer, type CaptionRegionCandidate } from "./semantic-queries";
import type { AnonymousTrack } from "./semantic-tracks";

function track(overrides: Partial<AnonymousTrack> = {}): AnonymousTrack {
  return {
    analysis_revision: "vision-v1:abc", track_id: "person_01", shot_id: "shot_1", label: "person",
    start_seconds: 0, end_seconds: 1, confidence: 0.9,
    samples: [0, 0.5, 1].map((time, index) => ({
      detection_id: `d_${index}`, frame_id: `f_${index}`, time_seconds: time, confidence: 0.9,
      box: { x: 0.1 + index * 0.02, y: 0.2, width: 0.2, height: 0.4 },
    })),
    ...overrides,
  };
}

test("focalRegions returns stable anonymous samples and only human-confirmed identity", () => {
  const anonymous = focalRegions({ interval: [0, 1], evidence_status: "complete", tracks: [track()] });
  assert.equal(anonymous.status, "complete");
  assert.ok(anonymous.regions.every((region) => region.confirmed_subject_id === null));

  const confirmed = focalRegions({
    interval: [0, 1], evidence_status: "complete", tracks: [track()], confirmed_decisions: [
      { decision_id: "alias", kind: "alias", value: "founder", confirmed_by: "human", track_ref: { analysis_revision: "vision-v1:abc", track_id: "person_01" } },
      { decision_id: "role", kind: "role", value: "primary_subject", confirmed_by: "human", track_ref: { analysis_revision: "vision-v1:abc", track_id: "person_01" } },
    ],
  });
  assert.ok(confirmed.regions.every((region) => region.confirmed_subject_id === "founder" && region.confirmed_primary));
});

test("stale evidence is unknown and long observation gaps remain explicit", () => {
  const stale = focalRegions({ interval: [0, 1], evidence_status: "stale", tracks: [track()] });
  assert.deepEqual(stale.regions, []);
  assert.equal(stale.status, "unknown");

  const gapped = track({
    end_seconds: 2,
    samples: [
      { detection_id: "a", frame_id: "a", time_seconds: 0, confidence: 0.9, box: { x: 0.1, y: 0.2, width: 0.2, height: 0.4 } },
      { detection_id: "b", frame_id: "b", time_seconds: 2, confidence: 0.9, box: { x: 0.6, y: 0.2, width: 0.2, height: 0.4 } },
    ],
  });
  const result = focalRegions({ interval: [0, 2], evidence_status: "complete", tracks: [gapped] });
  assert.equal(result.status, "partial");
  assert.deepEqual(result.gaps.map((gap) => [gap.start_seconds, gap.end_seconds]), [[0, 2]]);
});

const projection = {
  source_width: 1000, source_height: 1000,
  composition_width: 1000, composition_height: 1000,
  fit: "contain" as const, timeline_start_seconds: 0, source_trim_start_seconds: 0, playback_rate: 1,
};

function layer(overrides: Partial<CaptionQueryLayer> = {}): CaptionQueryLayer {
  return {
    layer_id: "video_1", visible_timeline_interval: [0, 1], opacity_evidence: "known_visible",
    evidence_status: "complete", tracks: [track()], projection, ...overrides,
  };
}

function candidate(id: string, rect: { x: number; y: number; width: number; height: number }, contrast = 7): CaptionRegionCandidate {
  return { candidate_id: id, rect, contrast: { status: "measured", minimum_ratio: contrast, texture_score: 0.1 } };
}

const base = {
  cue_interval: [0, 1] as [number, number], composition: { width: 1000, height: 1000 },
  safe_rect: { x: 50, y: 50, width: 900, height: 900 }, font_measurement: "exact" as const,
};

test("caption ranking projects the whole source-time focal union through shared geometry", () => {
  const result = rankCaptionRegions({
    ...base, layers: [layer()], candidates: [
      candidate("over_subject", { x: 80, y: 180, width: 280, height: 450 }),
      candidate("clear_right", { x: 650, y: 650, width: 250, height: 100 }),
    ],
  });
  assert.equal(result.status, "ranked");
  assert.deepEqual(result.ranked.map((item) => item.candidate_id), ["clear_right"]);
  assert.equal(result.exclusion_regions.length, 3);
  assert.deepEqual(result.exclusion_regions[0]!.rect, { x: 100, y: 200, width: 200, height: 400 });
});

test("trim and playback rate select the correct source interval", () => {
  const later = track({
    start_seconds: 10, end_seconds: 12,
    samples: [{ detection_id: "later", frame_id: "later", time_seconds: 11, confidence: 0.9, box: { x: 0.7, y: 0.2, width: 0.2, height: 0.4 } }],
  });
  const result = rankCaptionRegions({
    ...base, cue_interval: [0, 1], layers: [layer({ tracks: [later], projection: { ...projection, source_trim_start_seconds: 10, playback_rate: 2 } })],
    candidates: [candidate("right", { x: 680, y: 180, width: 250, height: 450 }), candidate("left", { x: 70, y: 650, width: 250, height: 100 })],
  });
  assert.equal(result.status, "ranked");
  assert.deepEqual(result.ranked.map((item) => item.candidate_id), ["left"]);
});

test("partial/stale evidence, unknown opacity, or estimated font bounds return unknown", () => {
  for (const testCase of [
    { layers: [layer({ evidence_status: "partial" })] },
    { layers: [layer({ evidence_status: "stale" })] },
    { layers: [layer({ opacity_evidence: "unknown" })] },
    { layers: [layer()], font_measurement: "estimated" as const },
  ]) {
    const result = rankCaptionRegions({ ...base, ...testCase, candidates: [candidate("clear", { x: 650, y: 650, width: 250, height: 100 })] });
    assert.equal(result.status, "unknown");
  }
});

test("a fully masked layer contributes no exclusions and does not require detector evidence", () => {
  const result = rankCaptionRegions({
    ...base,
    layers: [layer({ evidence_status: "unavailable", opacity_evidence: "unknown", projection: { ...projection, mask_inset: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 } } })],
    candidates: [candidate("center", { x: 400, y: 400, width: 200, height: 100 })],
  });
  assert.equal(result.status, "ranked");
  assert.deepEqual(result.exclusion_regions, []);
});

test("unmeasured contrast stays unknown while complete failed candidates return no_clear_region", () => {
  const unknown = rankCaptionRegions({
    ...base, layers: [], candidates: [{ candidate_id: "unknown", rect: { x: 100, y: 100, width: 200, height: 100 }, contrast: { status: "unknown", minimum_ratio: null, texture_score: null } }],
  });
  assert.equal(unknown.status, "unknown");

  const blocked = rankCaptionRegions({
    ...base, layers: [layer()], candidates: [candidate("blocked", { x: 100, y: 200, width: 200, height: 200 })],
  });
  assert.equal(blocked.status, "no_clear_region");
});

test("safe geometry cannot certify a candidate outside the target-safe rect", () => {
  const result = rankCaptionRegions({
    ...base, layers: [], candidates: [candidate("unsafe", { x: 0, y: 0, width: 100, height: 100 })],
  });
  assert.equal(result.status, "no_clear_region");
});
