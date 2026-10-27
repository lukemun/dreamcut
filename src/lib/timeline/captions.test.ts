import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPTION_ABS_POSITION_REACH,
  captionCompositingCSS,
  BLUE_STEEL_CAPTION_LOOK,
  captionDisplayText,
  captionStyleCSS,
  captionStylePropsFromRaw,
  CAMERA_REVEAL_MOTION_CURVES,
  evaluateMotionKeyframes,
  isPerWordBackgroundVariant,
  motionKeyframesFromPoints,
  perWordBackgroundCSS,
  composeCaptionProps,
  DEFAULT_CAPTION_PROPS,
  resolveCaptionContentRect,
  resolveCaptionFontSizePx,
  resolveCaptionCoordinateAspectRatio,
  resolveCaptionAnchorLayout,
  resolveCaptionProps,
  sanitizeCaptionStyleProps,
} from "@/lib/timeline/captions";

test("blue steel option restores clean inversion while preserving caption clocks and content", () => {
  const original = {
    text: "every transition", timingMode: "single_word",
    wordTimings: [{ text: "every", start: 0, end: 0.4 }, { text: "transition", start: 0.4, end: 0.9 }],
    absX: 0.5, absY: 0.4, animationIn: "slide_down", animationInDuration: 2 / 24,
    inverseMaskMotion: "drift", inverseMaskSweepIntensity: 0.8,
    textColor: "#ff0000", outlineWidthPx: 3,
  };
  const before = resolveCaptionProps(original);
  const after = resolveCaptionProps({ ...original, ...BLUE_STEEL_CAPTION_LOOK });
  assert.equal(after.text, before.text);
  assert.deepEqual(after.wordTimings, before.wordTimings);
  assert.equal(after.timingMode, before.timingMode);
  assert.equal(after.animationInDuration, before.animationInDuration);
  assert.equal(after.absY, before.absY);
  assert.equal(after.inverseMaskMotion, "none");
  assert.equal(after.inverseMaskSweepIntensity, 0);
  assert.equal(captionStyleCSS(after.styleVariant, after.textColor, after.outlineWidthPx).color, "#ffffff");
  assert.deepEqual(captionCompositingCSS(after.styleVariant), { mixBlendMode: "difference" });
});

test("Reels bottom captions retain their semantic bottom anchor when composed", () => {
  const props = composeCaptionProps("A short phrase", { positionPreset: "reels_bottom_center", maxWidth: 0.6 });
  const anchor = resolveCaptionAnchorLayout(props, { left: 0, top: 0, width: 1, height: 1 });
  assert.equal(anchor.x, 0.5);
  assert.equal(anchor.y, 0.65);
  assert.equal(anchor.anchorY, 1);
  assert.equal(props.absY, null);
});

test("fixed caption sizing never shrinks and the safe paragraph packing is opt-in", () => {
  const fixed = resolveCaptionProps({text:"A long phrase that would normally shrink", fontSizePx:76, caption_single_line_contract:true, fontSizing:"fixed"});
  assert.equal(resolveCaptionFontSizePx(fixed, 350), 76);
  assert.ok(resolveCaptionFontSizePx({...fixed,fontSizing:"fit"},350)<76);
  const first = resolveCaptionAnchorLayout(resolveCaptionProps({groupLayout:{kind:"paragraph_panel",row:0,rows:9,packing:"reels_safe"}}),{left:0,top:0,width:1,height:1});
  const last = resolveCaptionAnchorLayout(resolveCaptionProps({groupLayout:{kind:"paragraph_panel",row:8,rows:9,packing:"reels_safe"}}),{left:0,top:0,width:1,height:1});
  assert.equal(first.x,.075);assert.equal(first.y,.16);assert.equal(last.y,.595);
});

test("portrait caption coordinates project into portrait media on a landscape canvas", () => {
  const rect = resolveCaptionContentRect(9 / 16, 16 / 9);

  assert.ok(Math.abs(rect.left - 0.341796875) < 0.000001);
  assert.equal(rect.top, 0);
  assert.ok(Math.abs(rect.width - 0.31640625) < 0.000001);
  assert.equal(rect.height, 1);

  const projectedLeft = rect.left + 0.12 * rect.width;
  const projectedWidth = 0.6 * rect.width;
  assert.ok(projectedLeft > rect.left);
  assert.ok(projectedLeft + projectedWidth < rect.left + rect.width);
});

test("landscape caption coordinates project into landscape media on a portrait canvas", () => {
  const rect = resolveCaptionContentRect(16 / 9, 9 / 16);

  assert.equal(rect.left, 0);
  assert.ok(Math.abs(rect.top - 0.341796875) < 0.000001);
  assert.equal(rect.width, 1);
  assert.ok(Math.abs(rect.height - 0.31640625) < 0.000001);
});

test("caption-authored geometry stays stable across active visuals with different aspect ratios", () => {
  assert.equal(resolveCaptionCoordinateAspectRatio(9 / 16, 16 / 9), 9 / 16);
  assert.equal(resolveCaptionCoordinateAspectRatio(9 / 16, 1), 9 / 16);
  assert.equal(resolveCaptionCoordinateAspectRatio(null, 16 / 9), 16 / 9);
});

test("paragraph panel rows share a deterministic left edge and fill the safe page", () => {
  const first = resolveCaptionAnchorLayout(resolveCaptionProps({
    positionPreset: "top_left",
    groupLayout: { kind: "paragraph_panel", row: 0, rows: 8 },
  }), { left: 0.1, top: 0.05, width: 0.8, height: 0.9 });
  const last = resolveCaptionAnchorLayout(resolveCaptionProps({
    positionPreset: "top_left",
    groupLayout: { kind: "paragraph_panel", row: 7, rows: 8 },
  }), { left: 0.1, top: 0.05, width: 0.8, height: 0.9 });

  assert.equal(first.x, last.x);
  assert.equal(first.anchorX, 0);
  assert.equal(first.anchorY, 0);
  assert.ok(first.y < last.y);
  assert.ok(last.y < 0.9);
});

test("composeCaptionProps fills absolute coordinates from the chosen preset", () => {
  const props = composeCaptionProps("Hello world", {
    positionPreset: "top_right",
    maxWidth: 0.5,
  });

  assert.equal(props.text, "Hello world");
  assert.equal(props.positionPreset, "top_right");
  assert.ok(Math.abs((props.absX ?? 0) - 0.45) < 0.000001);
  assert.equal(props.absY, 0.08);
});

test("audio-linked captions default to one display line and fit down without changing stored text", () => {
  const props = resolveCaptionProps({
    text: "regulation must\nbe negotiated",
    caption_follow_audio: true,
    fontPreset: "teko",
    fontSizePx: 78,
    maxWidth: 0.86,
  });

  assert.equal(props.singleLine, true);
  assert.equal(props.text, "regulation must\nbe negotiated");
  assert.equal(captionDisplayText(props), "regulation must be negotiated");
  assert.ok(resolveCaptionFontSizePx(props, 600) < 78);
  assert.equal(resolveCaptionFontSizePx(props, 1_400), 78);
});

test("graphic caption cards retain intentional line breaks", () => {
  const props = resolveCaptionProps({
    text: "BENCHMARK\nWINNER: FABLE",
    fontSizePx: 34,
  });

  assert.equal(props.singleLine, false);
  assert.equal(captionDisplayText(props), "BENCHMARK\nWINNER: FABLE");
  assert.equal(resolveCaptionFontSizePx(props, 200), 34);
});

test("captionStylePropsFromRaw strips text and normalizes style values", () => {
  const style = captionStylePropsFromRaw({
    text: "Ignore me",
    fontPreset: "mono",
    fontSizePx: 999,
    textScaleX: 999,
    textScaleY: 0,
    animationIn: "slide_up",
  });

  assert.equal("text" in style, false);
  assert.equal(style.fontPreset, "mono");
  assert.equal(style.fontSizePx, 300); // clamp ceiling (captions.ts: clamp(..., 18, 300))
  assert.equal(style.textScaleX, 2.5);
  assert.equal(style.textScaleY, 0.5);
  assert.equal(style.textColor, null);
  assert.equal(style.animationIn, "slide_up");
  assert.equal(style.animationOut, DEFAULT_CAPTION_PROPS.animationOut);
});

test("inverse caption style uses clean white Difference glyphs", () => {
  assert.deepEqual(captionStyleCSS("inverse"), {
    color: "#ffffff",
  });
  assert.deepEqual(captionCompositingCSS("inverse"), {
    mixBlendMode: "difference",
  });
  assert.deepEqual(captionCompositingCSS("cinematic"), {});
});

test("thought bubble is a native high-contrast editable caption treatment", () => {
  const style = captionStyleCSS("thought_bubble");

  assert.equal(style.color, "#111111");
  assert.equal(style.backgroundColor, "#ffffff");
  assert.equal(style.borderRadius, "999px");
  assert.match(String(style.border), /solid/);
});

test("inverse matte motion controls normalize to safe animation bounds", () => {
  const resolved = resolveCaptionProps({
    styleVariant: "inverse",
    inverseMaskMotion: "drift",
    inverseMaskDriftXPercent: 99,
    inverseMaskDriftYPercent: -99,
    inverseMaskSweepIntensity: 4,
    inverseMaskSweepCycles: 10,
  });

  assert.equal(resolved.inverseMaskMotion, "drift");
  assert.equal(resolved.inverseMaskDriftXPercent, 12);
  assert.equal(resolved.inverseMaskDriftYPercent, -12);
  assert.equal(resolved.inverseMaskSweepIntensity, 1);
  assert.equal(resolved.inverseMaskSweepCycles, 4);
});

test("image fill captions preserve a bounded ordered image sequence", () => {
  const urls = Array.from({ length: 60 }, (_, index) => `/media/page-${index + 1}.png`);
  const resolved = resolveCaptionProps({
    styleVariant: "image_fill",
    mediaFillUrls: [...urls, "", 42],
    mediaFillChangeTimesSeconds: [1.067, 0, 0.867, 0.867, -1, Number.NaN],
    mediaFillSecondsPerImage: 0.01,
    mediaFillCrossfadeSeconds: 4,
    mediaFillFirstTransition: "cut",
    mediaFillTransition: "slide",
    mediaFillSlideDirection: "down",
    mediaFillTransitionBlur: 4,
    mediaFillScale: 9,
    mediaFillPanPercent: -99,
    cameraRevealFontWeight: 748,
    cameraRevealMediaFit: "camera",
    cameraRevealHoldSeconds: 99,
  });

  assert.equal(resolved.styleVariant, "image_fill");
  assert.deepEqual(resolved.mediaFillUrls, urls.slice(0, 48));
  assert.deepEqual(resolved.mediaFillChangeTimesSeconds, [0, 0.867, 1.067]);
  assert.equal(resolved.mediaFillSecondsPerImage, 0.15);
  assert.equal(resolved.mediaFillCrossfadeSeconds, 1);
  assert.equal(resolved.mediaFillFirstTransition, "cut");
  assert.equal(resolved.mediaFillTransition, "slide");
  assert.equal(resolved.mediaFillSlideDirection, "down");
  assert.equal(resolved.mediaFillTransitionBlur, 1);
  assert.equal(resolved.mediaFillScale, 4);
  assert.equal(resolved.mediaFillPanPercent, -50);
  assert.equal(resolved.cameraRevealFontWeight, 700);
  assert.equal(resolved.cameraRevealMediaFit, "camera");
  assert.equal(resolved.cameraRevealHoldSeconds, 5);
  assert.equal(captionStyleCSS("image_fill", "#ff0000").color, "transparent");
});

test("3D camera reveal normalizes physical camera and temporal blur controls", () => {
  const resolved = resolveCaptionProps({
    styleVariant: "camera_reveal",
    cameraRevealStartSeconds: -2,
    cameraRevealDurationSeconds: 99,
    cameraRevealStartDistance: 0,
    cameraRevealEndDistance: 99,
    cameraRevealTargetX: -99,
    cameraRevealTargetY: 99,
    cameraRevealFov: 120,
    cameraRevealTypographySizing: "font_size",
    cameraRevealEasing: "custom",
    cameraRevealBezier: [-2, 0.2, 0.8, 4],
    cameraRevealMotionCurve: [[-1, 2], [0.7, 0.9], [0.2, 0.1], [0.99, 0.5], [3, -1]],
    cameraRevealShutterAngle: 999,
    cameraRevealBlurSamples: 4.6,
    cameraRevealExtrusionDepth: 3,
    cameraRevealBevelWidth: -1,
    cameraRevealEdgeLight: 4,
    cameraRevealEdgeColor: "#abc123",
    cameraRevealWallMirror: 4,
    cameraRevealOrbitX: 8,
    cameraRevealOrbitY: -8,
    cameraRevealResolveMode: "brand_card",
    cameraRevealResolveStartSeconds: -4,
    cameraRevealResolveDurationSeconds: 99,
    cameraRevealResolveBackgroundColor: "#ea580c",
    cameraRevealResolveTextColor: "#f6f3ec",
  });

  assert.equal(resolved.styleVariant, "camera_reveal");
  assert.equal(resolved.cameraRevealStartSeconds, 0);
  assert.equal(resolved.cameraRevealDurationSeconds, 10);
  assert.equal(resolved.cameraRevealStartDistance, 0.01);
  assert.equal(resolved.cameraRevealEndDistance, 14);
  assert.equal(resolved.cameraRevealTargetX, -2.5);
  assert.equal(resolved.cameraRevealTargetY, 2.5);
  assert.equal(resolved.cameraRevealFov, 90);
  assert.equal(resolved.cameraRevealTypographySizing, "font_size");
  assert.equal(resolved.cameraRevealEasing, "custom");
  assert.deepEqual(resolved.cameraRevealBezier, [0, 0.2, 0.8, 1]);
  assert.deepEqual(resolved.cameraRevealMotionCurve, [
    [0, 0],
    [0.7, 0.9],
    [0.74, 0.9],
    [0.96, 0.9],
    [1, 1],
  ]);
  assert.equal(resolved.cameraRevealMotionKeyframes.length, 5);
  assert.equal(evaluateMotionKeyframes(resolved.cameraRevealMotionKeyframes, 0), 0);
  assert.equal(evaluateMotionKeyframes(resolved.cameraRevealMotionKeyframes, 1), 1);
  assert.equal(resolved.cameraRevealShutterAngle, 360);
  assert.equal(resolved.cameraRevealBlurSamples, 5);
  assert.equal(resolved.cameraRevealExtrusionDepth, 1);
  assert.equal(resolved.cameraRevealBevelWidth, 0);
  assert.equal(resolved.cameraRevealEdgeLight, 2);
  assert.equal(resolved.cameraRevealEdgeColor, "#abc123");
  assert.equal(resolved.cameraRevealWallMirror, 1);
  assert.equal(resolved.cameraRevealOrbitX, 1.5);
  assert.equal(resolved.cameraRevealOrbitY, -1.5);
  assert.equal(resolved.cameraRevealResolveMode, "brand_card");
  assert.equal(resolved.cameraRevealResolveStartSeconds, 0);
  assert.equal(resolved.cameraRevealResolveDurationSeconds, 5);
  assert.equal(resolved.cameraRevealResolveBackgroundColor, "#ea580c");
  assert.equal(resolved.cameraRevealResolveTextColor, "#f6f3ec");
  assert.equal(captionStyleCSS("camera_reveal", "#ff0000").color, "transparent");
});

test("slow-middle motion curve stays monotonic and flattens through the center", () => {
  const curve = CAMERA_REVEAL_MOTION_CURVES.slow_middle;
  const keyframes = motionKeyframesFromPoints(curve);
  const samples = Array.from({ length: 101 }, (_, index) => (
    evaluateMotionKeyframes(keyframes, index / 100)
  ));

  assert.equal(samples[0], 0);
  assert.ok(Math.abs(samples[50] - 0.5) < 0.000001);
  assert.equal(samples[100], 1);
  assert.ok(samples.every((value, index) => index === 0 || value >= samples[index - 1]));
  assert.ok(samples[60] - samples[40] < 0.15);
  assert.ok(samples[30] - samples[10] > samples[60] - samples[40]);
  assert.ok(samples[90] - samples[70] > samples[60] - samples[40]);
});

test("single-word timing mode survives caption prop normalization", () => {
  const props = composeCaptionProps("BOOKS MOVE NOW", {
    timingMode: "single_word",
    wordTimings: [
      { text: "BOOKS", start: 0, end: 0.5 },
      { text: "MOVE", start: 0.5, end: 1 },
      { text: "NOW", start: 1, end: 1.5 },
    ],
  });
  assert.equal(props.timingMode, "single_word");
  assert.equal(props.wordTimings.length, 3);
});

test("sanitizeCaptionStyleProps returns a plain serializable style record", () => {
  const style = sanitizeCaptionStyleProps({
    text: "Ignore me too",
    positionPreset: "bottom_left",
    absX: 0.1,
    absY: 0.2,
  });

  assert.deepEqual(style, {
    fontSizing: "fit",
    textCase: "source",
    positionPreset: "bottom_left",
    positionNudgeY: "none",
    offsetX: 0,
    offsetY: 0,
    absX: 0.1,
    absY: 0.2,
    groupLayout: null,
    maxWidth: 0.78,
    textAlign: "center",
    fontPreset: "display_serif",
    fontSizePx: 42,
    textScaleX: 1,
    textScaleY: 1,
    textColor: null,
    outlineWidthPx: null,
    surfaceMode: "none",
    surfacePerspectivePx: 1200,
    surfaceDepthPx: 0,
    surfaceRotateXDeg: 0,
    surfaceRotateYDeg: 0,
    surfaceRotateZDeg: 0,
    surfaceSkewXDeg: 0,
    surfaceSkewYDeg: 0,
    surfaceOpacity: 1,
    surfaceBlurPx: 0,
    surfaceBlendMode: "normal",
    benchmarkRotationDeg: 0,
    rotationDeg: 0,
    benchmarkStackLayout: null,
    styleVariant: "cinematic",
    handwritingRevealMode: "line_mask",
    handwritingWeight: 0,
    mediaFillUrls: [],
    mediaFillScene: null,
    mediaFillVideoUrl: "",
    mediaFillVideoPlaybackRate: 1,
    mediaFillVideoPreviewUrl: "",
    mediaFillChangeTimesSeconds: [],
    mediaFillSecondsPerImage: 0.65,
    mediaFillCrossfadeSeconds: 0.16,
    mediaFillFirstTransition: "inherit",
    mediaFillTransition: "dissolve",
    mediaFillSlideDirection: "left",
    mediaFillTransitionBlur: 0,
    mediaFillScale: 1.2,
    mediaFillPanPercent: 12,
    inverseMaskMotion: "none",
    inverseMaskDriftXPercent: 0,
    inverseMaskDriftYPercent: 0,
    inverseMaskSweepIntensity: 0,
    inverseMaskSweepCycles: 1,
    cameraRevealFontWeight: 600,
    cameraRevealTypographySizing: "fit",
    cameraRevealMediaFit: "wordmark",
    cameraRevealHoldSeconds: 0,
    cameraRevealStartSeconds: DEFAULT_CAPTION_PROPS.cameraRevealStartSeconds,
    cameraRevealDurationSeconds: DEFAULT_CAPTION_PROPS.cameraRevealDurationSeconds,
    cameraRevealStartDistance: DEFAULT_CAPTION_PROPS.cameraRevealStartDistance,
    cameraRevealEndDistance: DEFAULT_CAPTION_PROPS.cameraRevealEndDistance,
    cameraRevealTargetX: DEFAULT_CAPTION_PROPS.cameraRevealTargetX,
    cameraRevealTargetY: DEFAULT_CAPTION_PROPS.cameraRevealTargetY,
    cameraRevealFov: DEFAULT_CAPTION_PROPS.cameraRevealFov,
    cameraRevealEasing: DEFAULT_CAPTION_PROPS.cameraRevealEasing,
    cameraRevealBezier: DEFAULT_CAPTION_PROPS.cameraRevealBezier,
    cameraRevealMotionCurve: DEFAULT_CAPTION_PROPS.cameraRevealMotionCurve,
    cameraRevealMotionKeyframes: DEFAULT_CAPTION_PROPS.cameraRevealMotionKeyframes,
    cameraRevealShutterAngle: DEFAULT_CAPTION_PROPS.cameraRevealShutterAngle,
    cameraRevealBlurSamples: DEFAULT_CAPTION_PROPS.cameraRevealBlurSamples,
    cameraRevealExtrusionDepth: DEFAULT_CAPTION_PROPS.cameraRevealExtrusionDepth,
    cameraRevealBevelWidth: DEFAULT_CAPTION_PROPS.cameraRevealBevelWidth,
    cameraRevealEdgeLight: DEFAULT_CAPTION_PROPS.cameraRevealEdgeLight,
    cameraRevealEdgeColor: DEFAULT_CAPTION_PROPS.cameraRevealEdgeColor,
    cameraRevealWallMirror: DEFAULT_CAPTION_PROPS.cameraRevealWallMirror,
    cameraRevealOrbitX: DEFAULT_CAPTION_PROPS.cameraRevealOrbitX,
    cameraRevealOrbitY: DEFAULT_CAPTION_PROPS.cameraRevealOrbitY,
    cameraRevealResolveMode: DEFAULT_CAPTION_PROPS.cameraRevealResolveMode,
    cameraRevealResolveStartSeconds: DEFAULT_CAPTION_PROPS.cameraRevealResolveStartSeconds,
    cameraRevealResolveDurationSeconds: DEFAULT_CAPTION_PROPS.cameraRevealResolveDurationSeconds,
    cameraRevealResolveBackgroundColor: DEFAULT_CAPTION_PROPS.cameraRevealResolveBackgroundColor,
    cameraRevealResolveTextColor: DEFAULT_CAPTION_PROPS.cameraRevealResolveTextColor,
    // Unspecified animation falls through to the defaults — assert against the
    // constant so a future default change updates here without re-drifting.
    animationIn: DEFAULT_CAPTION_PROPS.animationIn,
    animationOut: DEFAULT_CAPTION_PROPS.animationOut,
    animationInDuration: DEFAULT_CAPTION_PROPS.animationInDuration,
    animationOutDuration: DEFAULT_CAPTION_PROPS.animationOutDuration,
    dropInDistanceRatio: DEFAULT_CAPTION_PROPS.dropInDistanceRatio,
    activeWordColor: DEFAULT_CAPTION_PROPS.activeWordColor,
    activeWordTextColor: DEFAULT_CAPTION_PROPS.activeWordTextColor,
    activeWordKeepsOutline: DEFAULT_CAPTION_PROPS.activeWordKeepsOutline,
    activeWordPadXEm: DEFAULT_CAPTION_PROPS.activeWordPadXEm,
  });
});

test("handwriting drawing time can span a slow alphabet review", () => {
  assert.equal(resolveCaptionProps({ animationIn: "handwriting", animationInDuration: 8 }).animationInDuration, 8);
  assert.equal(resolveCaptionProps({ animationIn: "fade", animationInDuration: 8 }).animationInDuration, 2);
});

test("caption text ignores legacy case overrides and follows the typed text", () => {
  assert.equal(composeCaptionProps("Regulatory force", { textCase: "upper" }).textCase, "source");
  assert.equal(composeCaptionProps("Supporting copy", { textCase: "lower" }).textCase, "source");
  assert.equal(composeCaptionProps("Typed Case", { textCase: "invalid" }).textCase, "source");
});

test("wall surface props normalize legacy projects and clamp three-dimensional controls", () => {
  const legacy = composeCaptionProps("On wood", {
    surface_attached: true,
    surface_opacity: 0.7,
    surface_rotate_deg: -0.35,
    surface_skew_x_deg: -1.1,
  });
  assert.equal(legacy.surfaceMode, "wall");
  assert.equal(legacy.surfaceDepthPx, -90);
  assert.equal(legacy.surfaceOpacity, 0.7);
  assert.equal(legacy.surfaceRotateZDeg, -0.35);
  assert.equal(legacy.surfaceSkewXDeg, -1.1);
  assert.equal(legacy.surfaceBlendMode, "multiply");

  const authored = composeCaptionProps("In depth", {
    surfaceMode: "wall",
    surfacePerspectivePx: 9999,
    surfaceDepthPx: -999,
    surfaceRotateYDeg: 45,
    surfaceOpacity: 0.05,
  });
  assert.equal(authored.surfacePerspectivePx, 3000);
  assert.equal(authored.surfaceDepthPx, -400);
  assert.equal(authored.surfaceRotateYDeg, 30);
  assert.equal(authored.surfaceOpacity, 0.2);
});

test("caption text color accepts six-digit hex and rejects invalid values", () => {
  assert.equal(composeCaptionProps("Custom", { textColor: "#A1B2C3" }).textColor, "#a1b2c3");
  assert.equal(composeCaptionProps("Invalid", { textColor: "red" }).textColor, null);
  assert.equal(composeCaptionProps("Outlined", { outlineWidthPx: 5.5 }).outlineWidthPx, 5.5);
  assert.equal(captionStyleCSS("highlight_yellow", "#a1b2c3").color, "#a1b2c3");
  assert.equal(captionStyleCSS("bold_outline", null, 5.5).WebkitTextStroke, "5.5px #000000");
  const outlinedBanner = captionStyleCSS("yellow_banner", "#FFFFFF", 6);
  assert.equal(outlinedBanner.WebkitTextStroke, "6px #000000");
  assert.equal(outlinedBanner.paintOrder, "stroke");
});

// ── Per-word backgrounds ────────────────────────────────────────────────────
// A per-word variant must put NOTHING on the block, or the fill paints one
// continuous bar behind the spaces instead of a box per word.

test("yellow_words contributes no block-level fill", () => {
  const block = captionStyleCSS("yellow_words", null, null);
  assert.equal(block.backgroundColor, undefined);
  assert.equal(block.color, undefined);
});

test("yellow_words carries its box on the word instead", () => {
  const word = perWordBackgroundCSS("yellow_words");
  assert.equal(word.backgroundColor, "#FFD700");
  assert.equal(word.color, "#000000");
  // Padding via spread, not padding: layout width must not shift, so word
  // rhythm and line wrapping match the un-boxed variant exactly.
  assert.equal(word.padding, undefined);
  assert.match(String(word.boxShadow), /#FFD700$/);
});

test("only per-word variants report as such", () => {
  assert.equal(isPerWordBackgroundVariant("yellow_words"), true);
  for (const other of ["boxed", "black_card", "benchmark_card", "bold_outline", "yellow_banner", "none"]) {
    assert.equal(isPerWordBackgroundVariant(other), false, `${other} is a block variant`);
  }
});

test("block variants still paint their own fill", () => {
  assert.equal(captionStyleCSS("black_card", null, null).backgroundColor, "rgba(0, 0, 0, 0.75)");
  assert.equal(perWordBackgroundCSS("black_card").backgroundColor, undefined);
});

test("benchmark card rotation is bounded for a stable Scratchpad pile", () => {
  assert.equal(resolveCaptionProps({ benchmarkRotationDeg: 4 }).benchmarkRotationDeg, 4);
  assert.equal(resolveCaptionProps({ benchmarkRotationDeg: 99 }).benchmarkRotationDeg, 8);
  assert.equal(resolveCaptionProps({ benchmarkRotationDeg: -99 }).benchmarkRotationDeg, -8);
});

test("caption width may intentionally span the full canvas", () => {
  assert.equal(resolveCaptionProps({ maxWidth: 1 }).maxWidth, 1);
});

test("manual caption placement may intentionally bleed beyond the canvas", () => {
  const props = resolveCaptionProps({ absX: -0.2, absY: 1.18 });
  assert.equal(props.absX, -0.2);
  assert.equal(props.absY, 1.18);
  // Stored positions keep the full reach relation placement needs (a wide clip's band in a tall
  // frame), and stay bounded beyond it.
  assert.equal(resolveCaptionProps({ absY: -1.02 }).absY, -1.02);
  assert.equal(resolveCaptionProps({ absX: -9 }).absX, CAPTION_ABS_POSITION_REACH.min);
  assert.equal(resolveCaptionProps({ absY: 9 }).absY, CAPTION_ABS_POSITION_REACH.max);
});

test("semantic caption nudges move a named anchor without authoring absolute coordinates", () => {
  const content = { left: 0, top: 0, width: 1, height: 1 };
  const standard = resolveCaptionAnchorLayout(resolveCaptionProps({ positionPreset: "bottom_center" }), content);
  const lower = resolveCaptionAnchorLayout(resolveCaptionProps({
    positionPreset: "bottom_center",
    positionNudgeY: "slightly_down",
  }), content);
  assert.equal(Number((lower.y - standard.y).toFixed(2)), 0.04);
});

test("benchmark pile layout distributes cards through the upper canvas", () => {
  const content = { left: 0, top: 0, width: 1, height: 1 };
  const placements = Array.from({ length: 17 }, (_, index) => resolveCaptionAnchorLayout(
    resolveCaptionProps({
      styleVariant: "benchmark_card",
      maxWidth: 0.58,
      benchmarkStackLayout: { kind: "upper_canvas_pile", index, total: 17 },
    }),
    content,
  ));
  assert.ok(new Set(placements.map((placement) => placement.x.toFixed(3))).size >= 12);
  assert.ok(new Set(placements.map((placement) => placement.y.toFixed(3))).size >= 12);
  assert.ok(placements.every((placement) => placement.y >= 0.16 && placement.y <= 0.44));
  assert.ok(placements.every((placement) => placement.x >= 0.02 && placement.x <= 0.4));
});

test("featured benchmark stack gives the first three cards distinct readable rows", () => {
  const content = { left: 0, top: 0, width: 1, height: 1 };
  const placements = Array.from({ length: 3 }, (_, index) => resolveCaptionAnchorLayout(
    resolveCaptionProps({
      styleVariant: "benchmark_card",
      maxWidth: 0.82,
      benchmarkStackLayout: { kind: "featured_benchmark_stack", index, total: 3 },
    }),
    content,
  ));
  assert.deepEqual(placements.map((placement) => placement.y), [0.08, 0.25, 0.42]);
  assert.ok(placements.every((placement) => placement.x >= 0.05 && placement.x <= 0.12));
});

test("benchmark cover layout fills the upper half from the top edge across both sides", () => {
  const content = { left: 0, top: 0, width: 1, height: 1 };
  const placements = Array.from({ length: 17 }, (_, index) => resolveCaptionAnchorLayout(
    resolveCaptionProps({
      styleVariant: "benchmark_card",
      maxWidth: index < 5 ? 1 : 0.72,
      benchmarkStackLayout: { kind: "upper_canvas_cover", index, total: 17 },
    }),
    content,
  ));
  assert.equal(placements[0]!.y, 0);
  assert.equal(placements[4]!.y, 0.42);
  assert.equal(Math.min(...placements.map((placement) => placement.x)), 0);
  assert.ok(Math.max(...placements.map((placement) => placement.x)) >= 0.27);
  assert.ok(Math.max(...placements.map((placement) => placement.y)) >= 0.44);
  assert.ok(placements.every((placement) => placement.y >= 0 && placement.y <= 0.44));
});

// ── Active-word outline retention ───────────────────────────────────────────

test("activeWordKeepsOutline defaults off, matching caption-craft §10", () => {
  assert.equal(DEFAULT_CAPTION_PROPS.activeWordKeepsOutline, false);
  assert.equal(composeCaptionProps("hi").activeWordKeepsOutline, false);
});

test("activeWordKeepsOutline only opts in on an explicit true", () => {
  for (const raw of [undefined, null, false, "true", 1, "yes"]) {
    assert.equal(
      sanitizeCaptionStyleProps({ activeWordKeepsOutline: raw }).activeWordKeepsOutline,
      false,
      `${JSON.stringify(raw)} must not enable outline retention`,
    );
  }
  assert.equal(sanitizeCaptionStyleProps({ activeWordKeepsOutline: true }).activeWordKeepsOutline, true);
});

test("activeWordPadXEm clamps to a sane range and falls back on junk", () => {
  assert.equal(sanitizeCaptionStyleProps({ activeWordPadXEm: 0.3 }).activeWordPadXEm, 0.3);
  assert.equal(sanitizeCaptionStyleProps({ activeWordPadXEm: 99 }).activeWordPadXEm, 0.6);
  assert.equal(sanitizeCaptionStyleProps({ activeWordPadXEm: -5 }).activeWordPadXEm, 0);
  assert.equal(
    sanitizeCaptionStyleProps({ activeWordPadXEm: "wide" }).activeWordPadXEm,
    DEFAULT_CAPTION_PROPS.activeWordPadXEm,
  );
});
