import assert from "node:assert/strict";
import test from "node:test";

import { resolveSafeGridSlot, resolveSemanticCrowdLayout, resolveSemanticVisualLayout } from "./semantic-layout";
import { resolveNumberKeyframe } from "./keyframes";

test("Reels caption stack reserves the phrase rail and a breathing gap", () => {
  const props = resolveSemanticVisualLayout({ slot: "bottom_center", size: "micro", packing: "reels_caption_stack" });
  assert.equal(props.media_offset_x, 0);
  const bottom = (Number(props.media_offset_y) / 2 + 0.5 + Number(props.media_scale) / 2) * 1920;
  assert.ok(Math.abs(bottom - (1248 - 76 - 16)) < 0.1);
  assert.equal(props.keyframes, undefined);
});

test("logo orbit separates square satellites from the center hero", () => {
  const hero = resolveSemanticVisualLayout({slot:"upper_center",size:"accent",packing:"logo_orbit"});
  const satellite = resolveSemanticVisualLayout({slot:"center_right",size:"micro",packing:"logo_orbit"});
  const heroRight = (Number(hero.media_offset_x)/2+.5+Number(hero.media_scale)/2)*1080;
  const satelliteLeft = (Number(satellite.media_offset_x)/2+.5-Number(satellite.media_scale)/2)*1080;
  assert.ok(satelliteLeft > heroRight);
  assert.ok(satelliteLeft+Number(satellite.media_scale)*1080 < 938);
});

test("podium seats preserve ranked elevations and equal logo sizes", () => {
  const seats = ["upper_left","top_center","center_right"].map(slot => resolveSemanticVisualLayout({slot:slot as "upper_left"|"top_center"|"center_right",size:"micro",packing:"podium_seats"}));
  assert.ok(Number(seats[0].media_offset_x)<0 && Number(seats[2].media_offset_x)>0);
  assert.ok(Number(seats[1].media_offset_y)<Number(seats[0].media_offset_y));
  assert.ok(Number(seats[0].media_offset_y)<Number(seats[2].media_offset_y));
  assert.ok(seats.every(s=>s.media_scale===.18));
});

test("alpha header pair aligns visible center with its opaque companion", () => {
  const a=resolveSemanticVisualLayout({slot:"upper_left",size:"compact",packing:"spacious_pair"});
  const b=resolveSemanticVisualLayout({slot:"upper_right",size:"hero",packing:"alpha_header_pair"});
  assert.ok(Math.abs(Number(b.media_offset_y)-.78*.096*2-Number(a.media_offset_y))<.0001);
});

test("Reels story packing is opt-in and reserves the action rail", () => {
  const props = resolveSemanticVisualLayout({ slot: "center_right", size: "micro", packing: "reels_story" });
  const x = (Number(props.media_offset_x) / 2 + 0.5) * 1080;
  const y = (Number(props.media_offset_y) / 2 + 0.5) * 1920;
  assert.ok(x < 887 && x > 64);
  assert.ok(y > 270 && y < 1248);
  assert.equal(resolveSemanticVisualLayout({ slot: "center", size: "micro" }).media_offset_y, 0);
});

test("Reels packing keeps every center column on the true canvas center", () => {
  for (const packing of ["reels_story", "reels_podium"] as const) {
    for (const slot of ["top_center", "upper_center", "center", "lower_center", "bottom_center"] as const) {
      const props = resolveSemanticVisualLayout({ slot, size: "accent", packing });
      assert.equal(props.media_offset_x, 0, `${packing} ${slot}`);
      assert.equal((Number(props.media_offset_x) / 2 + 0.5) * 1080, 540, `${packing} ${slot}`);
    }
  }
});

test("Reels story motion begins at true canvas center before moving into the safe side column", () => {
  const props = resolveSemanticVisualLayout({
    slot: "top_right",
    size: "accent",
    packing: "reels_story",
    motion: { from_slot: "center", to_slot: "top_right", start_seconds: 2.066667, duration_seconds: 0.4, ease: "easeInOut" },
  });
  assert.equal(props.media_offset_x, 0);
  assert.equal(resolveNumberKeyframe(props, "media_offset_x", 0.833333, -1), 0);
});

test("compact upper packing keeps four ranked rows above the presenter band", () => {
  const rows = ["top_left", "upper_left", "center_left", "lower_left"] as const;
  assert.deepEqual(rows.map((slot) => resolveSemanticVisualLayout({
    slot,
    size: "micro",
    packing: "compact_upper",
  }).media_offset_y), [-0.8, -0.56, -0.32, -0.08]);
});

test("the vertical safe grid resolves named slots deterministically", () => {
  assert.deepEqual(resolveSafeGridSlot("upper_right"), {
    normalized_x: 0.8,
    normalized_y: 0.3,
    media_offset_x: 0.6,
    media_offset_y: -0.4,
  });
  assert.deepEqual(resolveSafeGridSlot("lower_left"), {
    normalized_x: 0.2,
    normalized_y: 0.7,
    media_offset_x: -0.6,
    media_offset_y: 0.4,
  });
});

test("semantic motion compiles named endpoints into editable transform keyframes", () => {
  const props = resolveSemanticVisualLayout({
    slot: "upper_right",
    size: "supporting",
    motion: {
      from_slot: "center",
      to_slot: "upper_right",
      start_seconds: 2,
      duration_seconds: 0.5,
      ease: "easeInOut",
    },
  });
  assert.equal(props.media_scale, 0.38);
  assert.equal(props.media_offset_x, 0);
  assert.deepEqual((props.keyframes as Record<string, unknown>).media_offset_x, [
    { t: 0, v: 0, ease: "hold" },
    { t: 2, v: 0, ease: "easeInOut" },
    { t: 2.5, v: 0.6, ease: "hold" },
  ]);
  assert.equal(resolveNumberKeyframe(props, "media_offset_x", 2.25, 0), 0.3);
});

test("semantic motion beginning at clip start interpolates instead of holding", () => {
  const props = resolveSemanticVisualLayout({
    slot: "center_right",
    size: "supporting",
    motion: {
      from_slot: "center_left",
      to_slot: "center_right",
      start_seconds: 0,
      duration_seconds: 1.2,
      ease: "easeInOut",
    },
  });

  assert.deepEqual((props.keyframes as Record<string, unknown>).media_offset_x, [
    { t: 0, v: -0.6, ease: "easeInOut" },
    { t: 1.2, v: 0.6, ease: "hold" },
  ]);
  assert.equal(resolveNumberKeyframe(props, "media_offset_x", 0.6, 0), 0);
});

test("bottom-weighted transparent subjects anchor by visible mass instead of empty canvas", () => {
  const props = resolveSemanticVisualLayout({
    slot: "lower_center",
    size: "peer",
  }, "bottom_weighted_subject");
  assert.equal(props.media_scale, 0.48);
  assert.equal(props.media_offset_x, 0);
  assert.equal(props.media_offset_y, 0);
  assert.deepEqual(props.semantic_layout, {
    schema_version: 1,
    slot: "lower_center",
    size: "peer",
    frame_model: "bottom_weighted_subject",
  });
  assert.equal(props.crowd_layout, null);
});

test("micro size keeps satellite actors subordinate to a central hero", () => {
  const props = resolveSemanticVisualLayout({ slot: "upper_left", size: "micro" });
  assert.equal(props.media_scale, 0.18);
  assert.equal(props.media_offset_x, -0.6);
  assert.equal(props.media_offset_y, -0.4);
  assert.deepEqual(props.semantic_layout, {
    schema_version: 1,
    slot: "upper_left",
    size: "micro",
    frame_model: "canvas",
  });
});

test("crowd layout fans ten people across two staggered rows while reserving the right side", () => {
  const backLeft = resolveSemanticCrowdLayout({ region: "upper_left_fan", index: 0, total: 10 });
  const backRight = resolveSemanticCrowdLayout({ region: "upper_left_fan", index: 4, total: 10 });
  const frontCenter = resolveSemanticCrowdLayout({ region: "upper_left_fan", index: 7, total: 10 });
  assert.deepEqual(
    [backLeft.media_scale, backRight.media_scale, frontCenter.media_scale],
    [0.17, 0.17, 0.21],
  );
  assert.ok(Number(backLeft.media_offset_x) < Number(frontCenter.media_offset_x));
  assert.ok(Number(backRight.media_offset_x) <= 0.24);
  assert.ok(Number(frontCenter.media_offset_y) > Number(backLeft.media_offset_y));
  assert.deepEqual(frontCenter.crowd_layout, {
    schema_version: 1,
    region: "upper_left_fan",
    index: 7,
    total: 10,
  });
  assert.equal(frontCenter.semantic_layout, null);
});

test("tight crowd layout clusters two staggered rows below paired upper visuals", () => {
  const backLeft = resolveSemanticCrowdLayout({ region: "upper_center_cluster", index: 0, total: 10 });
  const backRight = resolveSemanticCrowdLayout({ region: "upper_center_cluster", index: 4, total: 10 });
  const frontCenter = resolveSemanticCrowdLayout({ region: "upper_center_cluster", index: 7, total: 10 });
  assert.deepEqual(
    [backLeft.media_scale, backRight.media_scale, frontCenter.media_scale],
    [0.16, 0.16, 0.2],
  );
  assert.ok(Number(backLeft.media_offset_x) < 0);
  assert.ok(Number(backRight.media_offset_x) > 0);
  assert.ok(Number(frontCenter.media_offset_y) > Number(backLeft.media_offset_y));
  assert.deepEqual(frontCenter.crowd_layout, {
    schema_version: 1,
    region: "upper_center_cluster",
    index: 7,
    total: 10,
  });
  assert.equal(frontCenter.semantic_layout, null);
});
