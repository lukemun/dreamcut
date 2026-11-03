import assert from "node:assert/strict";
import test from "node:test";

import { captionBox, checkTimeline, type QcElement } from "@/lib/qc/check-timeline";
import { SAFE_AREA_REELS, SAFE_AREA_TIKTOK, safeAreaFor } from "@/lib/qc/standards";

const CANVAS = { width: 1080, height: 1920 };

function caption(overrides: Partial<QcElement> & { props?: Record<string, unknown> } = {}): QcElement {
  return {
    id: "cap-1",
    type: "caption_text",
    lane_key: "captions_0",
    timeline_start: 0,
    duration: 3,
    volume: 1,
    fade_in: 0,
    fade_out: 0,
    ...overrides,
    props: {
      text: "SHORT LINE",
      fontSizePx: 90,
      maxWidth: 0.6,
      positionPreset: "center",
      ...(overrides.props ?? {}),
    },
  };
}

function shot(id: string, start: number, duration: number): QcElement {
  return {
    id,
    type: "still",
    lane_key: "visual_0",
    timeline_start: start,
    duration,
    volume: 1,
    fade_in: 0,
    fade_out: 0,
    props: {},
  };
}

function presenter(
  id: string,
  start: number,
  duration: number,
  offsetX: number,
  extraProps: Record<string, unknown> = {},
): QcElement {
  return {
    id,
    type: "video_clip",
    lane_key: "visual_presenter",
    timeline_start: start,
    duration,
    volume: 1,
    fade_in: 0,
    fade_out: 0,
    props: {
      source_id: "same-take",
      section: "same-spoken-point",
      media_scale: 0.3,
      media_offset_x: offsetX,
      media_offset_y: 0,
      ...extraProps,
    },
  };
}

const boundaryFamily = [
  { key: "divider_1", interval_px: [98, 108] },
  { key: "divider_2", interval_px: [211, 222] },
] as const;

function boundedAsset(id: string, role: "content" | "divider", family: unknown = boundaryFamily): QcElement {
  const source_url = `/media/${id}.png`;
  return {
    ...shot(id, 0, 3),
    source_url,
    props: {
      color_edge_geometry_id: "geometry-v1",
      internal_boundary_contract: {
        id: "geometry-v1",
        canvas_height_px: 640,
        tolerance_px: 1,
        role,
        family,
        ...(role === "content" ? {
          validation: { status: "passed", validated_source_url: source_url, method: "decoded-row-parity" },
        } : {}),
      },
    },
  };
}

function codes(els: QcElement[], target: "tiktok" | "reels" | "web" = "tiktok") {
  return checkTimeline({ elements: els, canvas: CANVAS, target }).findings.map((f) => f.code);
}

// --- safe areas ------------------------------------------------------------

test("safeAreaFor scales a safe area to the canvas", () => {
  const half = safeAreaFor("reels", { width: 540, height: 960 });
  assert.equal(half.bottom, Math.round(SAFE_AREA_REELS.bottom / 2));
});

test("saved motion marks block when timeline onset drifts from the contracted frame", () => {
  const marked = shot("marked-scroll", 2, 2);
  marked.type = "video_clip";
  marked.props = {
    saved_mark_contract: {
      mark_label: "M1",
      frame_number: 30,
      expectation: "motion_onset",
      spatial_motion_id: "scroll-a",
      entry_state_id: "top",
      landing_state_id: "bottom",
    },
  };
  assert.ok(codes([marked], "reels").includes("saved_mark_motion_contract_failed"));

  marked.timeline_start = 1;
  assert.ok(!codes([marked], "reels").includes("saved_mark_motion_contract_failed"));
});

test("single-line caption contracts block measured wrapping", () => {
  const result = checkTimeline({
    elements: [caption({ props: { caption_single_line_contract: true } })],
    canvas: CANVAS,
    target: "reels",
    measured: {
      "cap-1": { width: 500, height: 180, inkWidth: 480, lines: 2, loadedFamily: "Inter" },
    },
  });
  assert.ok(result.findings.some((finding) => (
    finding.code === "caption_single_line_contract_failed" && finding.severity === "blocker"
  )));
});

test("audio-linked captions inherit the single-line contract", () => {
  const result = checkTimeline({
    elements: [caption({ props: { caption_follow_audio: true } })],
    canvas: CANVAS,
    target: "reels",
    measured: {
      "cap-1": { width: 500, height: 180, inkWidth: 480, lines: 2, loadedFamily: "Inter" },
    },
  });
  assert.ok(result.findings.some((finding) => finding.code === "caption_single_line_contract_failed"));
});

test("fixed caption rails block per-cue coordinate drift", () => {
  const fixed = caption({
    props: {
      absY: 0.48,
      source_width: 1080,
      source_height: 1920,
      caption_fixed_rail_contract: { abs_y: 0.48, source_width: 1080, source_height: 1920 },
    },
  });
  assert.ok(!codes([fixed], "reels").includes("caption_fixed_rail_contract_failed"));

  fixed.props = { ...fixed.props, absY: 0.6 };
  assert.ok(codes([fixed], "reels").includes("caption_fixed_rail_contract_failed"));
});

test("TikTok's rail is modelled as an L, not a rectangle", () => {
  assert.ok(SAFE_AREA_TIKTOK.rail);
  assert.ok(SAFE_AREA_TIKTOK.rail!.right > SAFE_AREA_TIKTOK.right);
});

test("web has no platform chrome — SMPTE title-safe only", () => {
  const web = safeAreaFor("web", CANVAS);
  assert.equal(web.rail, null);
  assert.ok(web.bottom < SAFE_AREA_TIKTOK.bottom);
});

test("a 1:1 square feed or web post gets SMPTE title-safe on its own canvas", () => {
  const square = { width: 1080, height: 1080 };
  for (const target of ["feed", "web"] as const) {
    const area = safeAreaFor(target, square);
    assert.deepEqual([area.top, area.bottom, area.left, area.right], [54, 54, 54, 54]);
    assert.equal(area.rail, null);
  }
});

test("organic Reels resolves to the measured platform template — the player chrome is identical on organic", () => {
  // 2026-09-19: the 5% graphics-safe fallback blessed content that Instagram's own UI then
  // covered on real organic uploads. The template measures player chrome (header, caption
  // block, action rail), which does not move between organic and paid.
  const organic = safeAreaFor("reels", CANVAS, "organic");
  assert.equal(organic.top, SAFE_AREA_REELS.top);
  assert.equal(organic.bottom, SAFE_AREA_REELS.bottom);
  assert.equal(organic.left, SAFE_AREA_REELS.left);
  assert.equal(organic.right, SAFE_AREA_REELS.right);
  assert.deepEqual(organic.rail, SAFE_AREA_REELS.rail);
});

test("organic and paid-ad Reels block the same low caption — one measured safe area", () => {
  // 2026-09-19: organic no longer gets a lenient fallback. A caption sitting under
  // Instagram's caption block and action rail is blocked in both modes.
  const el = caption({ props: { absX: 0.06, absY: 0.665, maxWidth: 0.88, fontSizePx: 75, text: "LOWER CAPTION" } });
  const paid = checkTimeline({ elements: [el], canvas: CANVAS, target: "reels", captionSafeAreaMode: "paid_ad" });
  const organic = checkTimeline({ elements: [el], canvas: CANVAS, target: "reels", captionSafeAreaMode: "organic" });
  assert.ok(paid.findings.some((finding) => finding.code === "caption_outside_safe_area"));
  assert.ok(organic.findings.some((finding) => finding.code === "caption_outside_safe_area"));
});

// --- caption geometry ------------------------------------------------------

test("a bottom preset anchors its bottom edge at 82% of frame height", () => {
  const box = captionBox(caption({ props: { positionPreset: "bottom_center" } }), CANVAS);
  assert.ok(Math.abs(box.bottom - 0.82 * CANVAS.height) < 1);
});

test("wrapped lines are estimated from text length and box width", () => {
  const box = captionBox(
    caption({ props: { text: "A".repeat(200), fontSizePx: 60, maxWidth: 0.5 } }),
    CANVAS,
  );
  assert.ok(box.lines > 1);
});

test("explicit newlines are honored", () => {
  const box = captionBox(caption({ props: { text: "ONE\nTWO\nTHREE" } }), CANVAS);
  assert.equal(box.lines, 3);
});

// --- safe-area findings ----------------------------------------------------

test("the editor's own default bottom_center caption is BLOCKED on TikTok", () => {
  // The shipped default: bottom edge at 82% of height = 1574px, against a 1260px limit.
  assert.ok(codes([caption({ props: { positionPreset: "bottom_center" } })]).includes("caption_outside_safe_area"));
});

test("the same caption passes for web, where there is no platform chrome", () => {
  const found = codes([caption({ props: { positionPreset: "bottom_center" } })], "web");
  assert.ok(!found.includes("caption_outside_safe_area"));
});

test("continuous ticker crawl records an advisory motion exception instead of a safe-area blocker", () => {
  const report = checkTimeline({
    elements: [caption({ props: { positionPreset: "bottom_center", ticker_motion: "crawl_left" } })],
    canvas: CANVAS,
    target: "tiktok",
  });
  assert.ok(report.findings.some((finding) => (
    finding.code === "caption_safe_area_motion_exception" && finding.severity === "advisory"
  )));
  assert.ok(!report.findings.some((finding) => finding.code === "caption_outside_safe_area"));
});

test("a right-edge violation that only the action rail creates is caught", () => {
  // Sits low and far right: clears the plain 120px right margin, but not the 300px rail.
  const el = caption({ props: { absX: 0.62, absY: 0.6, maxWidth: 0.3, fontSizePx: 80, text: "HI" } });
  const report = checkTimeline({ elements: [el], canvas: CANVAS, target: "tiktok" });
  const violation = report.findings.find((f) => f.code === "caption_outside_safe_area");
  assert.ok(violation?.measured.includes("action rail"));
});

test("a caption barely inside the top safe edge gets a human-review advisory", () => {
  const el = caption({
    props: {
      absX: 0.2,
      absY: 0.146, // top = 280px: 10px inside the 270px Reels boundary (was 0.052 against the old 5% box)
      maxWidth: 0.6,
      fontSizePx: 90,
      text: "MAKE YOUR BOOK",
    },
  });
  const report = checkTimeline({
    elements: [el],
    canvas: CANVAS,
    target: "reels",
    captionSafeAreaMode: "organic",
  });
  const finding = report.findings.find((entry) => entry.code === "caption_near_top_safe_edge");
  assert.equal(finding?.severity, "advisory");
  assert.match(finding?.remedy ?? "", /human approval/i);
  assert.match(finding?.remedy ?? "", /Do not apply/i);
});

test("a caption with comfortable top clearance does not get the advisory", () => {
  const el = caption({
    props: {
      absX: 0.2,
      absY: 0.2, // top = 384px: 114px inside the 270px Reels boundary, past the 48px comfort buffer
      maxWidth: 0.6,
      fontSizePx: 90,
      text: "MAKE YOUR BOOK",
    },
  });
  const report = checkTimeline({
    elements: [el],
    canvas: CANVAS,
    target: "reels",
    captionSafeAreaMode: "organic",
  });
  assert.ok(!report.findings.some((entry) => entry.code === "caption_near_top_safe_edge"));
});

// --- caption craft ---------------------------------------------------------

test("a caption below the BBC legibility floor is flagged", () => {
  // 42px on a 1920-tall frame = 2.2%, about half the 3.9% floor.
  assert.ok(codes([caption({ props: { fontSizePx: 42 } })], "web").includes("caption_below_legibility_floor"));
});

test("a caption at the floor is accepted", () => {
  assert.ok(!codes([caption({ props: { fontSizePx: 75 } })], "web").includes("caption_below_legibility_floor"));
});

test("captions without background-independent contrast protection are flagged", () => {
  const unprotected = caption({ props: { styleVariant: "cinematic" } });
  const protectedCaption = caption({ id: "caption-protected", props: { styleVariant: "bold_outline" } });
  const protectedBanner = caption({ id: "caption-banner", props: { styleVariant: "yellow_banner" } });
  assert.ok(codes([unprotected]).includes("caption_contrast_unprotected"));
  assert.ok(!codes([protectedCaption]).includes("caption_contrast_unprotected"));
  assert.ok(!codes([protectedBanner]).includes("caption_contrast_unprotected"));
});

test("caption text on a semantic nonnumeric lane is blocked as non-editable", () => {
  const malformed = caption({ lane_key: "captions_sound_on" });
  const report = checkTimeline({ elements: [malformed], canvas: CANVAS, target: "web" });
  const finding = report.findings.find((entry) => entry.code === "caption_not_on_editable_lane");
  assert.equal(finding?.severity, "blocker");
});

test("caption text on a numeric caption lane passes the editability contract", () => {
  const report = checkTimeline({ elements: [caption({ lane_key: "captions_7" })], canvas: CANVAS, target: "web" });
  assert.ok(!report.findings.some((entry) => entry.code === "caption_not_on_editable_lane"));
});

test("a caption that cannot be read in the time given is flagged", () => {
  const el = caption({ duration: 1, props: { text: "A".repeat(40) } }); // 40 cps vs a 20 limit
  assert.ok(codes([el], "web").includes("caption_too_fast"));
});

test("child-audience captions use the stricter reading-speed limit", () => {
  const el = caption({ duration: 2, props: { text: "A".repeat(36), child_audience: true } });
  assert.ok(codes([el], "web").includes("caption_too_fast"));
});

test("a caption boundary landing beside a cut is flagged", () => {
  // Cut at 3.0s (frame 90). Caption starts at frame 95 — 5 frames away, inside the banned band.
  const els = [shot("a", 0, 3), shot("b", 3, 3), caption({ timeline_start: 95 / 30, duration: 2 })];
  assert.ok(codes(els, "web").includes("caption_near_cut"));
});

test("a caption boundary landing exactly on the cut is allowed", () => {
  const els = [shot("a", 0, 3), shot("b", 3, 3), caption({ timeline_start: 3, duration: 2 })];
  assert.ok(!codes(els, "web").includes("caption_near_cut"));
});

test("a declared non-scene-defining overlay does not create a false caption cut", () => {
  const overlay = {
    ...shot("click-ring", 3, 0.4),
    props: { media_scale: 2.4, scene_defining_visual: false },
  };
  const els = [shot("base", 0, 6), overlay, caption({ timeline_start: 95 / 30, duration: 2 })];
  assert.ok(!codes(els, "web").includes("caption_near_cut"));
});

test("valid active-word timing passes the QC timing contract", () => {
  const found = codes([caption({
    duration: 1,
    props: {
      text: "One two",
      timingMode: "active_word",
      wordTimings: [
        { text: "One", start: 0, end: 0.4 },
        { text: "two", start: 0.5, end: 0.9 },
      ],
    },
  })], "web");
  assert.ok(!found.some((code) => code.startsWith("word_timing_")));
});

test("malformed active-word timing blocks QC", () => {
  const report = checkTimeline({
    elements: [caption({
      duration: 1,
      props: {
        text: "One changed",
        timingMode: "active_word",
        wordTimings: [
          { text: "One", start: 0, end: 0.4 },
          { text: "two", start: 0.5, end: 0.9 },
        ],
      },
    })],
    canvas: CANVAS,
    target: "web",
  });
  assert.equal(report.findings.find((finding) => finding.code === "word_timing_text_mismatch")?.severity, "blocker");
  assert.equal(report.ok, false);
});

// --- photosensitivity (safety) --------------------------------------------

test("a cut rate above the ITU-R BT.1702-3 limit BLOCKS", () => {
  // 6 shots of 5 frames each = 6 cuts inside one second. The limit is 3.
  const els = Array.from({ length: 6 }, (_, i) => shot(`s${i}`, (i * 5) / 30, 5 / 30));
  const report = checkTimeline({ elements: els, canvas: CANVAS, target: "web" });
  const flash = report.findings.find((f) => f.code === "photosensitivity_flash_rate");
  assert.equal(flash?.severity, "blocker");
  assert.equal(report.ok, false);
});

test("a normal cutting rhythm passes", () => {
  const els = [shot("a", 0, 2), shot("b", 2, 2), shot("c", 4, 2)];
  assert.ok(!codes(els, "web").includes("photosensitivity_flash_rate"));
});

test("rapid small-overlay entrances do not count as full-frame flashes", () => {
  const els = Array.from({ length: 7 }, (_, i) => ({
    ...shot(`overlay-${i}`, i * 0.2, 2),
    props: { media_scale: 0.2 },
  }));
  assert.ok(!codes(els, "web").includes("photosensitivity_flash_rate"));
});

// --- coupled internal-boundary geometry ------------------------------------

test("a complete producer-validated boundary-coordinate family passes", () => {
  const found = codes([boundedAsset("content", "content"), boundedAsset("divider", "divider")], "web");
  assert.ok(!found.some((code) => code.startsWith("internal_boundary_")));
});

test("one mismatched sibling boundary blocks the timeline", () => {
  const mismatched = [
    { key: "divider_1", interval_px: [98, 108] },
    { key: "divider_2", interval_px: [207, 218] },
  ];
  const report = checkTimeline({
    elements: [boundedAsset("content", "content", mismatched), boundedAsset("divider", "divider")],
    canvas: CANVAS,
    target: "web",
  });
  assert.equal(report.findings.find((finding) => finding.code === "internal_boundary_edge_mismatch")?.severity, "blocker");
  assert.equal(report.ok, false);
});

test("an incomplete sibling family blocks the timeline", () => {
  const report = checkTimeline({
    elements: [boundedAsset("content", "content", [boundaryFamily[0]]), boundedAsset("divider", "divider")],
    canvas: CANVAS,
    target: "web",
  });
  assert.ok(report.findings.some((finding) => finding.code === "internal_boundary_family_mismatch"));
});

test("changing a validated content source invalidates its producer receipt", () => {
  const content = boundedAsset("content", "content");
  content.source_url = "/media/replacement-without-proof.png";
  const report = checkTimeline({
    elements: [content, boundedAsset("divider", "divider")],
    canvas: CANVAS,
    target: "web",
  });
  assert.ok(report.findings.some((finding) => finding.code === "internal_boundary_validation_stale"));
});

test("fast average shot length is surfaced as an advisory", () => {
  assert.ok(codes([shot("a", 0, 2), shot("b", 2, 2)], "web").includes("fast_average_shot_length"));
});

// --- semantic speech-to-proof sequences -----------------------------------

function semanticSequence(overrides: {
  firstStart?: number;
  firstDuration?: number;
  underlayOpacity?: number;
} = {}): QcElement[] {
  const underlay = {
    ...shot("underlay", 5, 6),
    props: { media_opacity: overrides.underlayOpacity ?? 0.48 },
  };
  const first = {
    ...shot("proof-1", overrides.firstStart ?? 5, overrides.firstDuration ?? 1.5),
    props: {
      semantic_sequence_contract: {
        version: 1,
        id: "hook-proof-v1",
        spoken_end_seconds: 5,
        tolerance_seconds: 0.034,
        focus_underlay_element_id: "underlay",
        focus_underlay_max_opacity: 0.55,
        sequence_element_ids: ["proof-1", "proof-2", "proof-3", "proof-4"],
        minimum_item_duration_seconds: 1.5,
      },
    },
  };
  const secondStart = first.timeline_start + first.duration;
  return [
    underlay,
    first,
    shot("proof-2", secondStart, 1.5),
    shot("proof-3", secondStart + 1.5, 1.5),
    shot("proof-4", secondStart + 3, 1.5),
  ];
}

test("a completed spoken beat followed by dimmed, evenly held proof passes", () => {
  const found = codes(semanticSequence(), "web");
  assert.ok(!found.some((code) => code.startsWith("semantic_")));
});

test("visual proof beginning before the spoken beat ends blocks", () => {
  const report = checkTimeline({ elements: semanticSequence({ firstStart: 4.1 }), canvas: CANVAS, target: "web" });
  assert.equal(report.findings.find((finding) => finding.code === "semantic_evidence_preempts_spoken_beat")?.severity, "blocker");
});

test("an undimmed proof background blocks", () => {
  const found = codes(semanticSequence({ underlayOpacity: 0.8 }), "web");
  assert.ok(found.includes("semantic_sequence_background_not_dimmed"));
});

test("a proof item below the declared viewing hold blocks", () => {
  const found = codes(semanticSequence({ firstDuration: 1 }), "web");
  assert.ok(found.includes("semantic_sequence_item_too_fast"));
});

// --- audio -----------------------------------------------------------------

const vo: QcElement = {
  id: "vo",
  type: "vo_segment",
  lane_key: "audio_narrator",
  timeline_start: 0,
  duration: 5,
  volume: 1,
  fade_in: 0.1,
  fade_out: 0.1,
  props: {},
};

function music(volume: number): QcElement {
  return {
    id: "m",
    type: "music",
    lane_key: "music_0",
    timeline_start: 0,
    duration: 5,
    volume,
    fade_in: 0.1,
    fade_out: 0.1,
    props: {},
  };
}

test("music loud enough to bury the narration is flagged", () => {
  // 0.7 / 1.0 = 0.70, far above the 0.18 ratio.
  assert.ok(codes([vo, music(0.7)], "web").includes("music_buries_voice"));
});

test("music already sitting under the narration is not flagged", () => {
  assert.ok(!codes([vo, music(0.15)], "web").includes("music_buries_voice"));
});

test("presenter video audio is treated as voice for music balance", () => {
  const presenter: QcElement = {
    ...vo,
    id: "presenter",
    type: "video_clip",
    lane_key: "visual_presenter",
  };

  assert.ok(codes([presenter, music(0.7)], "web").includes("music_buries_voice"));
  assert.ok(!codes([presenter, music(0.15)], "web").includes("music_buries_voice"));
});

test("measured A/V sync outside EBU tolerance blocks", () => {
  const report = checkTimeline({
    elements: [{ ...vo, props: { av_sync_offset_ms: 75 } }],
    canvas: CANVAS,
    target: "web",
  });
  assert.equal(report.findings.find((finding) => finding.code === "av_sync_out_of_tolerance")?.severity, "blocker");
});

test("audio fades below the minimum are flagged even when non-zero", () => {
  assert.ok(codes([{ ...vo, fade_in: 0.005 }], "web").includes("hard_audio_edit"));
});

// --- report shape ----------------------------------------------------------

test("the report pre-computes the counts the agent would otherwise have to derive", () => {
  const report = checkTimeline({
    elements: [shot("a", 0, 2), shot("b", 2, 4), caption()],
    canvas: CANVAS,
    target: "web",
  });
  assert.equal(report.summary.shotCount, 2);
  assert.equal(report.summary.captionCount, 1);
  assert.equal(report.summary.averageShotLengthSeconds, 3);
  assert.equal(report.summary.durationSeconds, 6);
});

test("removed and disabled elements are ignored", () => {
  const removed = caption({ id: "x", removed_at: "2026-01-01T00:00:00Z", props: { fontSizePx: 10 } });
  const disabled = caption({ id: "y", props: { fontSizePx: 10, disabled: true } });
  const report = checkTimeline({ elements: [removed, disabled], canvas: CANVAS, target: "tiktok" });
  assert.equal(report.findings.length, 0);
});

// --- caption gaps (regression: the gate used to pass 0-frame gaps) ----------

test("captions butted together with a 0-frame gap are FLAGGED", () => {
  // Netflix: "Subtitles must have a minimum of 2 frames between them." The first cut of the
  // gate only checked a 3..15 band, so a 0-frame gap — which the caption instrument produced
  // on EVERY pair — passed silently.
  const a = caption({ id: "a", timeline_start: 0, duration: 2 });
  const b = caption({ id: "b", timeline_start: 2, duration: 2 });
  assert.ok(codes([a, b], "web").includes("caption_gap_jitter"));
});

test("a gap of exactly 2 frames is allowed", () => {
  const a = caption({ id: "a", timeline_start: 0, duration: 2 - 2 / 30 });
  const b = caption({ id: "b", timeline_start: 2, duration: 2 });
  assert.ok(!codes([a, b], "web").includes("caption_gap_jitter"));
});

test("a long gap (>= 15 frames, half a second) is allowed", () => {
  const a = caption({ id: "a", timeline_start: 0, duration: 2 });
  const b = caption({ id: "b", timeline_start: 2.5, duration: 2 });
  assert.ok(!codes([a, b], "web").includes("caption_gap_jitter"));
});

test("a gap inside the banned band is flagged", () => {
  const a = caption({ id: "a", timeline_start: 0, duration: 2 });
  const b = caption({ id: "b", timeline_start: 2 + 6 / 30, duration: 2 });
  assert.ok(codes([a, b], "web").includes("caption_gap_jitter"));
});

test("condensed captions are reported with their verbatim source", () => {
  const condensed = caption({
    id: "condensed",
    timeline_start: 1,
    duration: 2,
    props: {
      text: "Sell more books",
      caption_condensed: true,
      caption_source_text: "I really want to help you sell more of your books",
    },
  });
  assert.ok(codes([condensed], "web").includes("caption_condensed"));
});

test("condensation without verbatim source is a warning", () => {
  const report = checkTimeline({
    elements: [caption({
      id: "missing-source",
      timeline_start: 1,
      duration: 2,
      props: { text: "Sell more books", caption_condensed: true },
    })],
    canvas: { width: 1920, height: 1080 },
    target: "web",
  });
  assert.equal(report.findings.find((finding) => finding.code === "caption_condensed_missing_source")?.severity, "warning");
});

test("a caption that exceeds its declared word ceiling is blocked", () => {
  const report = checkTimeline({
    elements: [caption({
      id: "too-many-words",
      props: { text: "one two three four", caption_word_limit: 3 },
    })],
    canvas: CANVAS,
    target: "web",
  });
  assert.equal(report.findings.find((finding) => finding.code === "caption_word_limit_exceeded")?.severity, "blocker");
});

test("an explicitly accepted rapid social fragment is advisory, not a timing warning", () => {
  const report = checkTimeline({
    elements: [caption({
      id: "rapid",
      duration: 0.5,
      props: { text: "three quick words", caption_word_limit: 3, caption_rapid_fragment: true },
    })],
    canvas: CANVAS,
    target: "web",
  });
  assert.equal(report.findings.find((finding) => finding.code === "caption_rapid_fragment")?.severity, "advisory");
  assert.ok(!report.findings.some((finding) => finding.code === "caption_too_short"));
});

// --- concurrent caption stacks ----------------------------------------------

test("concurrent captions with overlapping boxes are flagged; separated stacks are clean", () => {
  const a = caption({
    id: "stack-a",
    timeline_start: 0,
    duration: 9,
    props: { text: "CARD ONE", absX: 0.08, absY: 0.3, maxWidth: 0.84, fontSizePx: 66 },
  });
  const b = caption({
    id: "stack-b",
    timeline_start: 2.5,
    duration: 6.5,
    props: { text: "CARD TWO", absX: 0.08, absY: 0.31, maxWidth: 0.84, fontSizePx: 66 },
  });
  assert.ok(codes([a, b], "web").includes("caption_boxes_overlap"));

  const bApart = caption({
    id: "stack-b2",
    timeline_start: 2.5,
    duration: 6.5,
    props: { text: "CARD TWO", absX: 0.08, absY: 0.45, maxWidth: 0.84, fontSizePx: 66 },
  });
  const clean = codes([a, bApart], "web");
  assert.ok(!clean.includes("caption_boxes_overlap"));
  assert.ok(!clean.includes("caption_boxes_crowded"));
});

test("sequential captions never trigger the stack checks", () => {
  const a = caption({ id: "seq-a", timeline_start: 0, duration: 2, props: { absY: 0.3 } });
  const b = caption({ id: "seq-b", timeline_start: 2.1, duration: 2, props: { absY: 0.3 } });
  const found = codes([a, b], "web");
  assert.ok(!found.includes("caption_boxes_overlap"));
  assert.ok(!found.includes("caption_boxes_crowded"));
});

// --- presenter continuity --------------------------------------------------

test("an unsupported reframe inside one presenter take blocks", () => {
  const outgoing = presenter("presenter-a", 0, 2, 0);
  const incoming = presenter("presenter-b", 2, 2, -0.7);
  const finding = checkTimeline({ elements: [outgoing, incoming], canvas: CANVAS, target: "tiktok" })
    .findings.find((item) => item.code === "unsupported_presenter_reframe");
  assert.equal(finding?.severity, "blocker");
  assert.equal(finding?.atSeconds, 2);
});

test("a continuous presenter transform or named semantic reframe passes continuity", () => {
  const outgoing = presenter("presenter-a", 0, 2, 0);
  const continuous = presenter("presenter-b", 2, 2, 0);
  assert.ok(!codes([outgoing, continuous]).includes("unsupported_presenter_reframe"));

  const contracted = presenter("presenter-c", 2, 2, -0.7, {
    presenter_reframe_contract: "Move left when the comparison card enters on the right.",
  });
  assert.ok(!codes([outgoing, contracted]).includes("unsupported_presenter_reframe"));
});
