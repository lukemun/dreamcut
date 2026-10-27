import { normalizeHandwritingWeight } from "./handwriting-weight";
export const CAPTION_POSITION_PRESETS = [
  "top_left",
  "top_center",
  "top_right",
  "upper_left",
  "upper_center",
  "upper_right",
  "center_left",
  "center",
  "center_right",
  "lower_left",
  "lower_center",
  "lower_right",
  "bottom_left",
  "bottom_center",
  "bottom_right",
  "reels_bottom_center",
  "reels_interface_bottom_center",
] as const;

export type CaptionPositionPreset = (typeof CAPTION_POSITION_PRESETS)[number];

export { ANIMATION_PRESETS as CAPTION_ANIMATION_PRESETS, type AnimationPreset as CaptionAnimationPreset } from "./animation-presets";

import { ANIMATION_PRESETS, type AnimationPreset } from "./animation-presets";
import { SAFE_AREA_REELS } from "../qc/standards";
import { REELS_INTERFACE_BOTTOM } from "./reels-guide-layout";
import { getSharedFont, SHARED_FONT_LIBRARY, type SharedFontId } from "@/lib/fonts/registry";
import {
  normalizeWordStyles,
  normalizeWordTimings,
  SINGLE_WORD_TRANSITION_SECONDS,
  type CaptionTimingMode,
  type CaptionWordStyle,
  type CaptionWordTiming,
} from "./active-word-captions";

export const CAPTION_FONT_PRESETS = SHARED_FONT_LIBRARY.map((font) => font.id) as SharedFontId[];

export type CaptionFontPreset = SharedFontId;

export type CameraRevealEasing = "linear" | "ease_out" | "ease_in_out" | "slow_middle" | "custom";
export type CubicBezierTuple = [number, number, number, number];
export type MotionCurvePoint = [number, number];
export type MotionCurvePoints = [
  MotionCurvePoint,
  MotionCurvePoint,
  MotionCurvePoint,
  MotionCurvePoint,
  MotionCurvePoint,
];
export type MotionCurveKeyframe = {
  time: number;
  progress: number;
  inHandle: MotionCurvePoint;
  outHandle: MotionCurvePoint;
  linked: boolean;
};
export type MotionCurveKeyframes = MotionCurveKeyframe[];

export const CAMERA_REVEAL_EASING_CURVES: Record<
  Exclude<CameraRevealEasing, "custom" | "slow_middle">,
  CubicBezierTuple
> = {
  linear: [0, 0, 1, 1],
  ease_out: [0.22, 0.61, 0.36, 1],
  ease_in_out: [0.65, 0, 0.35, 1],
};

export const CAMERA_REVEAL_MOTION_CURVES: Record<
  Exclude<CameraRevealEasing, "custom">,
  MotionCurvePoints
> = {
  linear: [[0, 0], [0.25, 0.25], [0.5, 0.5], [0.75, 0.75], [1, 1]],
  ease_out: [[0, 0], [0.25, 0.594], [0.5, 0.873], [0.75, 0.976], [1, 1]],
  ease_in_out: [[0, 0], [0.25, 0.071], [0.5, 0.5], [0.75, 0.929], [1, 1]],
  slow_middle: [[0, 0], [0.25, 0.31], [0.5, 0.5], [0.75, 0.69], [1, 1]],
};

function motionCurveTangents(points: readonly MotionCurvePoint[]) {
  const widths = points.slice(0, -1).map((point, index) => points[index + 1][0] - point[0]);
  const secants = points.slice(0, -1).map((point, index) => (
    (points[index + 1][1] - point[1]) / widths[index]
  ));
  const tangents = new Array<number>(points.length);
  tangents[0] = secants[0];
  tangents[points.length - 1] = secants[secants.length - 1];
  for (let index = 1; index < points.length - 1; index += 1) {
    const before = secants[index - 1];
    const after = secants[index];
    if (before === 0 || after === 0 || before * after <= 0) {
      tangents[index] = 0;
      continue;
    }
    const beforeWidth = widths[index - 1];
    const afterWidth = widths[index];
    const firstWeight = 2 * afterWidth + beforeWidth;
    const secondWeight = afterWidth + 2 * beforeWidth;
    tangents[index] = (firstWeight + secondWeight)
      / (firstWeight / before + secondWeight / after);
  }
  return tangents;
}

export function motionKeyframesFromPoints(points: readonly MotionCurvePoint[]): MotionCurveKeyframes {
  const tangents = motionCurveTangents(points);
  return points.map(([time, progress], index) => {
    const previousWidth = index > 0 ? time - points[index - 1][0] : 0;
    const nextWidth = index < points.length - 1 ? points[index + 1][0] - time : 0;
    return {
      time,
      progress,
      inHandle: index === 0 ? [0, 0] : [-previousWidth / 3, -tangents[index] * previousWidth / 3],
      outHandle: index === points.length - 1 ? [0, 0] : [nextWidth / 3, tangents[index] * nextWidth / 3],
      linked: true,
    };
  });
}

export const CAMERA_REVEAL_MOTION_KEYFRAMES: Record<
  Exclude<CameraRevealEasing, "custom">,
  MotionCurveKeyframes
> = Object.fromEntries(
  Object.entries(CAMERA_REVEAL_MOTION_CURVES).map(([name, points]) => [
    name,
    motionKeyframesFromPoints(points),
  ]),
) as Record<Exclude<CameraRevealEasing, "custom">, MotionCurveKeyframes>;

export const CAPTION_FONT_PRESET_LABELS: Record<CaptionFontPreset, string> = Object.fromEntries(
  SHARED_FONT_LIBRARY.map((font) => [font.id, font.label]),
) as Record<CaptionFontPreset, string>;

export const CAPTION_STYLE_VARIANTS = [
  "none",
  "cinematic",
  "bold_outline",
  "highlight_yellow",
  "highlight_red",
  "boxed",
  "yellow_banner",
  "black_card",
  "benchmark_card",
  "thought_bubble",
  "neon",
  "yellow_words",
  "inverse",
  "image_fill",
  "camera_reveal",
] as const;

export type CaptionStyleVariant = (typeof CAPTION_STYLE_VARIANTS)[number];

export const CAPTION_STYLE_VARIANT_LABELS: Record<CaptionStyleVariant, string> = {
  none: "None (plain)",
  cinematic: "Cinematic",
  bold_outline: "Bold Outline",
  highlight_yellow: "Yellow Pop",
  highlight_red: "Red Alert",
  boxed: "Boxed",
  yellow_banner: "Yellow Banner",
  black_card: "Black Card",
  benchmark_card: "Benchmark Scorecard",
  thought_bubble: "Thought Bubble",
  neon: "Neon Glow",
  yellow_words: "Yellow Words (per-word)",
  inverse: "Inverse Video",
  image_fill: "Media text mask",
  camera_reveal: "3D Camera Reveal",
};

/**
 * Variants whose background is painted PER WORD rather than across the block.
 * The renderer must not put their fill on the container — it splits the text
 * with `captionRenderParts` (the same split active-word colouring and the
 * kinetic entrances use) and gives each word its own box, so the gaps between
 * words stay transparent instead of joining into one long bar.
 */
export const PER_WORD_BACKGROUND_VARIANTS = new Set<CaptionStyleVariant>(["yellow_words"]);

export function isPerWordBackgroundVariant(variant: string): boolean {
  return PER_WORD_BACKGROUND_VARIANTS.has(variant as CaptionStyleVariant);
}

/** The box each word carries under a per-word variant. */
export function perWordBackgroundCSS(variant: CaptionStyleVariant): Record<string, string | number> {
  switch (variant) {
    case "yellow_words":
      return {
        color: "#000000",
        backgroundColor: "#FFD700",
        borderRadius: "0.1em",
        // A box-shadow spread pads the box without adding layout width, so the
        // word rhythm and line wrapping stay identical to the un-boxed variant.
        boxShadow: "0 0 0 0.09em #FFD700",
      };
    default:
      return {};
  }
}

export type CaptionElementProps = {
  text: string;
  /** Spoken captions stay on one display line and fit down within their authored width. */
  singleLine: boolean;
  fontSizing: "fit" | "fixed";
  textCase: "source" | "upper" | "lower";
  positionPreset: CaptionPositionPreset;
  /** Small semantic adjustment applied after the named anchor resolves. */
  positionNudgeY: "none" | "slightly_up" | "slightly_down";
  offsetX: number;
  offsetY: number;
  absX: number | null;
  absY: number | null;
  /** Deterministic multi-row text layout authored semantically by agents. */
  groupLayout: {
    kind: "paragraph_panel";
    packing?: "reels_safe";
    row: number;
    rows: number;
  } | null;
  maxWidth: number;
  textAlign: "left" | "center" | "right";
  fontPreset: CaptionFontPreset;
  fontSizePx: number;
  textScaleX: number;
  textScaleY: number;
  /** Optional override for the foreground supplied by the style variant. */
  textColor: string | null;
  /** Optional hard-stroke width override for outlined variants. */
  outlineWidthPx: number | null;
  /** Optional surface-plane treatment for text meant to belong to the filmed set. */
  surfaceMode: "none" | "wall";
  surfacePerspectivePx: number;
  surfaceDepthPx: number;
  surfaceRotateXDeg: number;
  surfaceRotateYDeg: number;
  surfaceRotateZDeg: number;
  surfaceSkewXDeg: number;
  surfaceSkewYDeg: number;
  surfaceOpacity: number;
  surfaceBlurPx: number;
  surfaceBlendMode: "normal" | "multiply";
  /** Small editorial rotation used by the native benchmark-card stack. */
  benchmarkRotationDeg: number;
  /** Turn of the whole text block in degrees, clockwise; added to any entrance or exit spin. */
  rotationDeg: number;
  /** Semantic placement for a distributed pile above a bottom-center presenter. */
  benchmarkStackLayout: {
    kind: "upper_canvas_pile" | "upper_canvas_cover" | "featured_benchmark_stack";
    index: number;
    total: number;
  } | null;
  styleVariant: CaptionStyleVariant;
  handwritingRevealMode: "saved_strokes" | "line_mask";
  handwritingWeight: number;
  animationIn: AnimationPreset;
  animationOut: AnimationPreset;
  animationInDuration: number;
  animationOutDuration: number;
  /** Portion of canvas height traversed by the drop_in preset. */
  dropInDistanceRatio: number;
  timingMode: CaptionTimingMode;
  /** One word at a time: seconds each word takes to flip in and out; 0 is a plain cut. */
  singleWordFlipSeconds: number;
  /** Speech captions: show the words without punctuation. The aligned words are kept; only the drawing drops it. */
  hidePunctuation: boolean;
  wordTimings: CaptionWordTiming[];
  /** Graphic text: colour or a highlight box behind chosen words, in any timing mode. */
  wordStyles: CaptionWordStyle[];
  activeWordColor: string;
  /** Optional foreground override while a word is highlighted. */
  activeWordTextColor: string | null;
  /**
   * Keep the block's glyph stroke on the highlighted word instead of letting the
   * highlight fill carry contrast alone.
   *
   * Default `false` matches `caption-craft` §10 — a filled highlight normally
   * provides its own separation, and a stroke on top closes letter counters in
   * small type. Opt in when the highlight fill and the word colour are close
   * enough that the fill alone does not separate them (white on yellow), or when
   * the outline is part of the established caption identity and dropping it
   * makes the highlighted word read as a different treatment.
   * This option preserves that established outline treatment while a word is
   * highlighted.
   */
  activeWordKeepsOutline: boolean;
  /**
   * Horizontal padding, in `em`, added to the active word's highlight box and
   * cancelled by an equal negative margin so layout does not shift.
   *
   * The box is sized to the glyph box, which excludes the stroke — so a thick
   * outline pokes out past the fill and the highlight reads as clipping the
   * word. This pads it back into the surrounding word spaces.
   * This prevents thick outlines from appearing clipped at the box edge.
   */
  activeWordPadXEm: number;
  /** Optional movement of the inverse glyph matte over an otherwise frozen frame. */
  inverseMaskMotion: "none" | "drift";
  /** Signed horizontal travel across the caption's lifetime, in canvas percentage points. */
  inverseMaskDriftXPercent: number;
  /** Signed vertical travel across the caption's lifetime, in canvas percentage points. */
  inverseMaskDriftYPercent: number;
  /** Strength of the travelling inversion highlight, from 0 (off) to 1 (full). */
  inverseMaskSweepIntensity: number;
  /** Number of light-sweep passes across the caption's lifetime. */
  inverseMaskSweepCycles: number;
  /** Ordered stills displayed inside the glyphs for image-filled title treatments. */
  mediaFillUrls: string[];
  /** Optional silent video rendered through handwritten title glyphs. */
  mediaFillScene: { startSeconds: number; x: number; y: number; width: number; height: number } | null;
  mediaFillVideoUrl: string;
  /** Playback rate of the fill only; independent of text and pen timing. */
  mediaFillVideoPlaybackRate: number;
  /** Separately prepared and validated video preview; render retains the original authority. */
  mediaFillVideoPreviewUrl: string;
  /** Optional caption-local image start times. When present, these override the uniform hold duration. */
  mediaFillChangeTimesSeconds: number[];
  /** Hold duration for each image before advancing to the next one. */
  mediaFillSecondsPerImage: number;
  /** Duration of the dissolve between adjacent fill images. */
  mediaFillCrossfadeSeconds: number;
  /** Whether the first scheduled image change inherits the global transition or lands as a clean cut. */
  mediaFillFirstTransition: "inherit" | "cut";
  /** How adjacent fill images replace one another. */
  mediaFillTransition: "cut" | "dissolve" | "slide";
  /** Direction the incoming image travels during a slide transition. */
  mediaFillSlideDirection: "left" | "right" | "up" | "down";
  /** Directional sampling applied to slide transitions, expressed as a 0..1 strength. */
  mediaFillTransitionBlur: number;
  /** Background-image zoom inside the glyph mask. */
  mediaFillScale: number;
  /** Signed horizontal drift, in percentage points, across one image hold. */
  mediaFillPanPercent: number;
  /** Requested glyph weight for the rasterized 3D wordmark face. */
  cameraRevealFontWeight: number;
  /** Whether 3D glyphs fit the frame or preserve the inspector's font size and natural line metrics. */
  cameraRevealTypographySizing: "fit" | "font_size";
  /** Whether montage UVs follow the camera viewport or the whole wordmark plane. */
  cameraRevealMediaFit: "wordmark" | "camera";
  /** Local time at which the 3D wordmark camera begins its pullback. */
  cameraRevealStartSeconds: number;
  /** Time spent watching the changing montage before the camera begins moving. */
  cameraRevealHoldSeconds: number;
  /** Duration of the physical camera dolly. */
  cameraRevealDurationSeconds: number;
  /** Camera distance while the view is still inside one glyph. */
  cameraRevealStartDistance: number;
  /** Camera distance at the fully resolved wordmark. */
  cameraRevealEndDistance: number;
  /** Horizontal camera target on the wordmark plane, in world units. */
  cameraRevealTargetX: number;
  /** Vertical camera target on the wordmark plane, in world units. */
  cameraRevealTargetY: number;
  /** Perspective camera field of view in degrees. */
  cameraRevealFov: number;
  /** Named preset or custom deterministic camera timing curve. */
  cameraRevealEasing: CameraRevealEasing;
  /** Cubic Bézier control points [x1, y1, x2, y2]. X and Y are normalized 0..1. */
  cameraRevealBezier: CubicBezierTuple;
  /** Five-point monotonic time/progress curve. Endpoints remain fixed at [0,0] and [1,1]. */
  cameraRevealMotionCurve: MotionCurvePoints;
  /** Variable-length motion keyframes with relative incoming/outgoing Bézier handles. */
  cameraRevealMotionKeyframes: MotionCurveKeyframes;
  /** Temporal shutter angle used by Remotion's camera motion blur. */
  cameraRevealShutterAngle: number;
  /** Temporal samples used by Remotion's camera motion blur. */
  cameraRevealBlurSamples: number;
  /** Apparent extrusion behind the title face, in normalized glyph-edge units. */
  cameraRevealExtrusionDepth: number;
  /** Width of the chamfered highlight band inside each glyph edge. */
  cameraRevealBevelWidth: number;
  /** Brightness of the directional light caught by the chamfer. */
  cameraRevealEdgeLight: number;
  /** Material colour used on the extruded sides and bevel highlights. */
  cameraRevealEdgeColor: string;
  /** Strength of the bright mirror-like reflection bands on the extrusion walls. */
  cameraRevealWallMirror: number;
  /** Settled horizontal camera orbit used to expose the physical side walls. */
  cameraRevealOrbitX: number;
  /** Settled vertical camera orbit used to expose the physical side walls. */
  cameraRevealOrbitY: number;
  /** Optional final replacement of the montage with a flat brand card. */
  cameraRevealResolveMode: "none" | "brand_card";
  /** Local time at which the brand background begins overtaking black. */
  cameraRevealResolveStartSeconds: number;
  /** Duration of the background-first, solid-letter-second resolve. */
  cameraRevealResolveDurationSeconds: number;
  /** Background colour of the final brand card. */
  cameraRevealResolveBackgroundColor: string;
  /** Solid wordmark colour at the end of the brand-card resolve. */
  cameraRevealResolveTextColor: string;
};

/** Manual caption placement may intentionally bleed beyond the canvas edge. */
export const CAPTION_ABS_POSITION_MIN = -0.5;
export const CAPTION_ABS_POSITION_MAX = 1.5;
/**
 * How far a stored position may go, in the same shares of the source's picture area. Wider than the
 * manual range: when that area is a thin band of the canvas (a wide clip in a tall frame), reaching
 * the canvas edges takes values well past it, and relation placement (placement-relation.ts) writes them.
 */
export const CAPTION_ABS_POSITION_REACH = { min: -4, max: 5 } as const;

export function clampCaptionAbsPosition(value: number) {
  return clamp(value, CAPTION_ABS_POSITION_MIN, CAPTION_ABS_POSITION_MAX);
}

export type CaptionStyleProps = Omit<CaptionElementProps, "text" | "timingMode" | "singleWordFlipSeconds" | "hidePunctuation" | "wordTimings" | "wordStyles">;

export type CaptionLaneDefaultsMap = Record<string, Record<string, unknown>>;

export type CaptionContentRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export const DEFAULT_CAPTION_PROPS: CaptionElementProps = {
  text: "",
  singleLine: false,
  fontSizing: "fit",
  textCase: "source",
  positionPreset: "bottom_center",
  positionNudgeY: "none",
  offsetX: 0,
  offsetY: 0,
  absX: null,
  absY: null,
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
  animationIn: "none",
  animationOut: "none",
  animationInDuration: 0.25,
  animationOutDuration: 0.25,
  dropInDistanceRatio: 0.45,
  timingMode: "phrase",
  singleWordFlipSeconds: SINGLE_WORD_TRANSITION_SECONDS,
  hidePunctuation: false,
  wordTimings: [],
  wordStyles: [],
  activeWordColor: "#ff3b30",
  activeWordTextColor: null,
  activeWordKeepsOutline: false,
  activeWordPadXEm: 0.14,
  inverseMaskMotion: "none",
  inverseMaskDriftXPercent: 0,
  inverseMaskDriftYPercent: 0,
  inverseMaskSweepIntensity: 0,
  inverseMaskSweepCycles: 1,
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
  cameraRevealFontWeight: 600,
  cameraRevealTypographySizing: "fit",
  cameraRevealMediaFit: "wordmark",
  cameraRevealStartSeconds: 0,
  cameraRevealHoldSeconds: 0,
  cameraRevealDurationSeconds: 2.25,
  cameraRevealStartDistance: 0.2,
  cameraRevealEndDistance: 6.5,
  cameraRevealTargetX: -1.55,
  cameraRevealTargetY: 0.52,
  cameraRevealFov: 50,
  cameraRevealEasing: "ease_out",
  cameraRevealBezier: CAMERA_REVEAL_EASING_CURVES.ease_out,
  cameraRevealMotionCurve: CAMERA_REVEAL_MOTION_CURVES.ease_out,
  cameraRevealMotionKeyframes: CAMERA_REVEAL_MOTION_KEYFRAMES.ease_out,
  cameraRevealShutterAngle: 180,
  cameraRevealBlurSamples: 5,
  cameraRevealExtrusionDepth: 0.72,
  cameraRevealBevelWidth: 0.42,
  cameraRevealEdgeLight: 1,
  cameraRevealEdgeColor: "#d9dee7",
  cameraRevealWallMirror: 0.88,
  cameraRevealOrbitX: 0.42,
  cameraRevealOrbitY: -0.18,
  cameraRevealResolveMode: "none",
  cameraRevealResolveStartSeconds: 6.35,
  cameraRevealResolveDurationSeconds: 0.5,
  cameraRevealResolveBackgroundColor: "#ea580c",
  cameraRevealResolveTextColor: "#f6f3ec",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeCubicBezier(
  raw: unknown,
  fallback: CubicBezierTuple,
): CubicBezierTuple {
  if (!Array.isArray(raw) || raw.length !== 4) return [...fallback];
  return raw.map((value, index) => clamp(
    asFiniteNumber(value, fallback[index] ?? 0),
    0,
    1,
  )) as CubicBezierTuple;
}

function cloneMotionCurve(points: MotionCurvePoints): MotionCurvePoints {
  return points.map(([x, y]) => [x, y]) as MotionCurvePoints;
}

function cubicCoordinate(t: number, first: number, second: number) {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * first
    + 3 * inverse * t * t * second
    + t * t * t;
}

function motionCurveFromBezier(bezier: CubicBezierTuple): MotionCurvePoints {
  const samples = [0, 0.25, 0.5, 0.75, 1].map((x) => {
    if (x === 0 || x === 1) return [x, x] as MotionCurvePoint;
    let low = 0;
    let high = 1;
    for (let index = 0; index < 24; index += 1) {
      const midpoint = (low + high) / 2;
      if (cubicCoordinate(midpoint, bezier[0], bezier[2]) < x) low = midpoint;
      else high = midpoint;
    }
    const t = (low + high) / 2;
    return [x, cubicCoordinate(t, bezier[1], bezier[3])] as MotionCurvePoint;
  });
  return samples as MotionCurvePoints;
}

function normalizeMotionCurve(
  raw: unknown,
  fallback: MotionCurvePoints,
): MotionCurvePoints {
  if (!Array.isArray(raw) || raw.length !== 5) return cloneMotionCurve(fallback);
  const normalized: MotionCurvePoints = [[0, 0], [0.25, 0.25], [0.5, 0.5], [0.75, 0.75], [1, 1]];
  for (let index = 1; index < 4; index += 1) {
    const point = Array.isArray(raw[index]) ? raw[index] : fallback[index];
    const fallbackPoint = fallback[index];
    const minX = normalized[index - 1][0] + 0.04;
    const maxX = 1 - (4 - index) * 0.04;
    normalized[index] = [
      clamp(asFiniteNumber(point?.[0], fallbackPoint[0]), minX, maxX),
      clamp(asFiniteNumber(point?.[1], fallbackPoint[1]), normalized[index - 1][1], 1),
    ];
  }
  for (let index = 3; index > 0; index -= 1) {
    normalized[index][1] = Math.min(normalized[index][1], normalized[index + 1][1]);
  }
  return normalized;
}

function normalizeMotionKeyframes(
  raw: unknown,
  fallbackPoints: MotionCurvePoints,
): MotionCurveKeyframes {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 12) {
    return motionKeyframesFromPoints(fallbackPoints);
  }
  const rawObjects = raw.every((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
    ? raw as Array<Record<string, unknown>>
    : null;
  if (!rawObjects) return motionKeyframesFromPoints(fallbackPoints);

  const count = rawObjects.length;
  const points = rawObjects.map((entry, index) => [
    index === 0 ? 0 : index === count - 1 ? 1 : clamp(asFiniteNumber(entry.time, index / (count - 1)), 0, 1),
    index === 0 ? 0 : index === count - 1 ? 1 : clamp(asFiniteNumber(entry.progress, index / (count - 1)), 0, 1),
  ] as MotionCurvePoint);
  const gap = Math.min(0.04, 0.5 / count);
  for (let index = 1; index < count - 1; index += 1) {
    points[index][0] = clamp(points[index][0], points[index - 1][0] + gap, 1 - (count - 1 - index) * gap);
    points[index][1] = clamp(points[index][1], points[index - 1][1], 1);
  }
  for (let index = count - 2; index > 0; index -= 1) {
    points[index][1] = Math.min(points[index][1], points[index + 1][1]);
  }

  const automatic = motionKeyframesFromPoints(points);
  return automatic.map((keyframe, index) => {
    const entry = rawObjects[index];
    const previous = points[index - 1];
    const next = points[index + 1];
    const rawIn = Array.isArray(entry.inHandle) ? entry.inHandle : keyframe.inHandle;
    const rawOut = Array.isArray(entry.outHandle) ? entry.outHandle : keyframe.outHandle;
    return {
      ...keyframe,
      inHandle: previous
        ? [
            clamp(asFiniteNumber(rawIn[0], keyframe.inHandle[0]), previous[0] - keyframe.time, 0),
            clamp(asFiniteNumber(rawIn[1], keyframe.inHandle[1]), previous[1] - keyframe.progress, 0),
          ]
        : [0, 0],
      outHandle: next
        ? [
            clamp(asFiniteNumber(rawOut[0], keyframe.outHandle[0]), 0, next[0] - keyframe.time),
            clamp(asFiniteNumber(rawOut[1], keyframe.outHandle[1]), 0, next[1] - keyframe.progress),
          ]
        : [0, 0],
      linked: entry.linked !== false,
    };
  });
}

export function evaluateMotionKeyframes(keyframes: MotionCurveKeyframes, time: number) {
  const x = clamp(time, 0, 1);
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const segment = Math.max(0, keyframes.findIndex((keyframe) => x <= keyframe.time) - 1);
  const start = keyframes[segment];
  const end = keyframes[Math.min(segment + 1, keyframes.length - 1)];
  const firstX = start.time + start.outHandle[0];
  const firstY = start.progress + start.outHandle[1];
  const secondX = end.time + end.inHandle[0];
  const secondY = end.progress + end.inHandle[1];
  let low = 0;
  let high = 1;
  for (let index = 0; index < 24; index += 1) {
    const midpoint = (low + high) / 2;
    const inverse = 1 - midpoint;
    const sampleX = inverse * inverse * inverse * start.time
      + 3 * inverse * inverse * midpoint * firstX
      + 3 * inverse * midpoint * midpoint * secondX
      + midpoint * midpoint * midpoint * end.time;
    if (sampleX < x) low = midpoint;
    else high = midpoint;
  }
  const local = (low + high) / 2;
  const inverse = 1 - local;
  const progress = inverse * inverse * inverse * start.progress
    + 3 * inverse * inverse * local * firstY
    + 3 * inverse * local * local * secondY
    + local * local * local * end.progress;
  return clamp(progress, start.progress, end.progress);
}

/**
 * Evaluates a five-point monotonic cubic Hermite curve at normalized time.
 * Monotonic tangents keep camera progress from reversing between draggable points.
 */
export function evaluateMotionCurve(points: MotionCurvePoints, time: number) {
  const x = clamp(time, 0, 1);
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const intervalWidths = points.slice(0, -1).map((point, index) => points[index + 1][0] - point[0]);
  const secants = points.slice(0, -1).map((point, index) => (
    (points[index + 1][1] - point[1]) / intervalWidths[index]
  ));
  const tangents = new Array<number>(points.length);
  tangents[0] = secants[0];
  tangents[points.length - 1] = secants[secants.length - 1];
  for (let index = 1; index < points.length - 1; index += 1) {
    const before = secants[index - 1];
    const after = secants[index];
    if (before === 0 || after === 0 || before * after <= 0) {
      tangents[index] = 0;
      continue;
    }
    const beforeWidth = intervalWidths[index - 1];
    const afterWidth = intervalWidths[index];
    const firstWeight = 2 * afterWidth + beforeWidth;
    const secondWeight = afterWidth + 2 * beforeWidth;
    tangents[index] = (firstWeight + secondWeight)
      / (firstWeight / before + secondWeight / after);
  }

  const segment = Math.min(
    points.length - 2,
    Math.max(0, points.findIndex((point, index) => index > 0 && x <= point[0]) - 1),
  );
  const [x0, y0] = points[segment];
  const [x1, y1] = points[segment + 1];
  const width = x1 - x0;
  const local = (x - x0) / width;
  const localSquared = local * local;
  const localCubed = localSquared * local;
  const result = (2 * localCubed - 3 * localSquared + 1) * y0
    + (localCubed - 2 * localSquared + local) * width * tangents[segment]
    + (-2 * localCubed + 3 * localSquared) * y1
    + (localCubed - localSquared) * width * tangents[segment + 1];
  return clamp(result, 0, 1);
}

/**
 * Normalized bounds occupied by contained source media inside the composition.
 * Caption coordinates are authored relative to the source frame, so changing the
 * output aspect ratio must project them through this rect instead of leaving them
 * anchored to pillarbox/letterbox space.
 */
export function resolveCaptionContentRect(
  sourceAspectRatio: number | null,
  compositionAspectRatio: number,
): CaptionContentRect {
  if (
    sourceAspectRatio == null
    || !Number.isFinite(sourceAspectRatio)
    || sourceAspectRatio <= 0
    || !Number.isFinite(compositionAspectRatio)
    || compositionAspectRatio <= 0
  ) {
    return { left: 0, top: 0, width: 1, height: 1 };
  }

  if (sourceAspectRatio < compositionAspectRatio) {
    const width = sourceAspectRatio / compositionAspectRatio;
    return { left: (1 - width) / 2, top: 0, width, height: 1 };
  }

  if (sourceAspectRatio > compositionAspectRatio) {
    const height = compositionAspectRatio / sourceAspectRatio;
    return { left: 0, top: (1 - height) / 2, width: 1, height };
  }

  return { left: 0, top: 0, width: 1, height: 1 };
}

/**
 * Caption-authored geometry is the stable coordinate authority. Falling back to whichever
 * visual happens to be active is only valid for legacy captions without their own source frame.
 * This prevents split-screen captions from jumping when overlapping product clips have
 * different aspect ratios.
 */
export function resolveCaptionCoordinateAspectRatio(
  authoredAspectRatio: number | null,
  activeVisualAspectRatio: number | null,
): number | null {
  return authoredAspectRatio ?? activeVisualAspectRatio;
}

function asFiniteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asHexColor(value: unknown): string | null {
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) return null;
  return value.toLowerCase();
}

function asMediaFillUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 48);
}

function asMediaFillChangeTimesSeconds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const times = value
    .filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry))
    .map((entry) => clamp(entry, 0, 600))
    .sort((a, b) => a - b)
    .filter((entry, index, entries) => index === 0 || entry > entries[index - 1]!)
    .slice(0, 240);
  if (times.length > 0 && times[0] !== 0) times.unshift(0);
  return times.slice(0, 240);
}

export function isCaptionPositionPreset(value: unknown): value is CaptionPositionPreset {
  return typeof value === "string" && CAPTION_POSITION_PRESETS.includes(value as CaptionPositionPreset);
}

export function isCaptionAnimationPreset(value: unknown): value is AnimationPreset {
  return typeof value === "string" && ANIMATION_PRESETS.includes(value as AnimationPreset);
}

export function isCaptionFontPreset(value: unknown): value is CaptionFontPreset {
  return typeof value === "string" && CAPTION_FONT_PRESETS.includes(value as CaptionFontPreset);
}

export function isCaptionStyleVariant(value: unknown): value is CaptionStyleVariant {
  return typeof value === "string" && CAPTION_STYLE_VARIANTS.includes(value as CaptionStyleVariant);
}

/** Scales the absolute px values of a caption style (stroke, padding, radius) to a render size. */
export function scaleCaptionPixelStyle(
  style: Record<string, string | number>,
  renderScale: number,
): Record<string, string | number> {
  if (renderScale === 1) return style;
  return Object.fromEntries(
    Object.entries(style).map(([key, value]) => [
      key,
      typeof value === "string"
        ? value.replace(/(-?\d*\.?\d+)px/g, (_, raw: string) => `${Number(raw) * renderScale}px`)
        : value,
    ]),
  );
}

/** CSS properties for each style variant, applied to the caption text element. */
export function captionStyleCSS(
  variant: CaptionStyleVariant,
  textColor: string | null = null,
  outlineWidthPx: number | null = null,
): Record<string, string | number> {
  const variantStyle = ((): Record<string, string | number> => {
    switch (variant) {
      // The glyphs and nothing else. No stroke, no shadow, no box — so the fill is the only thing
      // on screen and reads at full strength. It buys that by giving up background-independent
      // separation, which is why the QC gate raises `caption_contrast_unprotected` for it: over a
      // bright or busy frame, plain text has nothing holding it apart from the video. Legitimate
      // when the frames behind the caption are known to be dark or quiet — confirm on rendered
      // frames, never assume.
      case "none":
        return {
          color: "#ffffff",
        };
      case "cinematic":
        return {
          color: "#f8f1e8",
          textShadow: "0 3px 16px rgba(0,0,0,0.72), 0 1px 2px rgba(0,0,0,0.9)",
        };
      case "bold_outline":
        // No blurred shadow. An 8px 50%-black blur sits directly on the glyph edges and greys
        // the antialiasing band on every stem, so the fill measures #ffffff and still reads dim.
        // Separation comes from the hard stroke, which does not touch the fill.
        return {
          color: "#ffffff",
          WebkitTextStroke: "4px #000000",
          paintOrder: "stroke",
        };
      case "highlight_yellow":
        return {
          color: "#FFD700",
          WebkitTextStroke: "3px #000000",
          paintOrder: "stroke",
          textShadow: "0 2px 10px rgba(0,0,0,0.6)",
        };
      case "highlight_red":
        return {
          color: "#FF3B30",
          WebkitTextStroke: "3px #000000",
          paintOrder: "stroke",
          textShadow: "0 2px 10px rgba(0,0,0,0.6)",
        };
      case "boxed":
        return {
          color: "#000000",
          backgroundColor: "rgba(255, 215, 0, 0.92)",
          padding: "6px 16px",
          borderRadius: "6px",
          display: "inline",
          boxDecorationBreak: "clone",
          WebkitBoxDecorationBreak: "clone",
        };
      case "yellow_banner":
        return {
          color: "#ffffff",
          backgroundColor: "#FFD700",
          padding: "18px 24px",
          borderRadius: "18px",
          boxSizing: "border-box",
          display: "block",
          textShadow: "0 2px 3px rgba(0,0,0,0.28)",
        };
      case "black_card":
        return {
          color: "#ffffff",
          // Dark but not solid: the picture still reads faintly through, text stays crisp.
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          padding: "12px 22px",
          borderRadius: "18px",
          display: "inline",
          boxDecorationBreak: "clone",
          WebkitBoxDecorationBreak: "clone",
        };
      case "benchmark_card":
        return {
          color: "#ffffff",
          display: "block",
        };
      case "thought_bubble":
        return {
          color: "#111111",
          backgroundColor: "#ffffff",
          border: "4px solid #111111",
          borderRadius: "999px",
          padding: "16px 30px",
          boxSizing: "border-box",
          display: "inline-block",
          boxShadow: "0 8px 0 rgba(0,0,0,0.2)",
        };
      case "neon":
        return {
          color: "#ffffff",
          textShadow:
            "0 0 7px #fff, 0 0 10px #fff, 0 0 21px #fff, 0 0 42px #0fa, 0 0 82px #0fa, 0 0 92px #0fa",
        };
      // Per-word variants deliberately contribute NO block-level fill — putting
      // the background here would paint one continuous bar behind the spaces
      // too. `perWordBackgroundCSS` carries it on each word span instead.
      case "yellow_words":
        return {};
      case "inverse":
        // White under Difference is a true per-channel inverse of the composed
        // video beneath each glyph: abs(backdrop - 255) = 255 - backdrop.
        // Keep the glyph layer clean; shadows, strokes, and boxes would add
        // pixels that do not participate in the source treatment.
        return {
          color: "#ffffff",
        };
      case "image_fill":
      case "camera_reveal":
        // The renderer replaces this transparent glyph fill with one or more
        // background-clipped image layers. A subtle edge keeps narrow counters
        // legible without covering the moving imagery.
        return {
          color: "transparent",
          WebkitTextStroke: "2px rgba(255,255,255,0.72)",
          paintOrder: "stroke",
        };
      default:
        return {
          color: "#f8f1e8",
          textShadow: "0 3px 16px rgba(0,0,0,0.72), 0 1px 2px rgba(0,0,0,0.9)",
        };
    }
  })();

  const outlinedStyle = outlineWidthPx != null
    ? { ...variantStyle, WebkitTextStroke: `${outlineWidthPx}px #000000`, paintOrder: "stroke" }
    : variantStyle;

  return textColor && variant !== "image_fill" && variant !== "camera_reveal"
    ? { ...outlinedStyle, color: textColor }
    : outlinedStyle;
}

/**
 * Blend modes belong on the caption's compositing wrapper, not its glyph node.
 * The wrapper is the direct sibling of visual lanes, so Difference can see the
 * already-composed pixels beneath it instead of being trapped inside the
 * caption lane's stacking context.
 */
export function captionCompositingCSS(
  variant: CaptionStyleVariant,
): Record<string, string | number> {
  return variant === "inverse" ? { mixBlendMode: "difference" } : {};
}

/** Optional look for Inverse Video; leaves content, placement and speech clocks intact. */
export const BLUE_STEEL_CAPTION_LOOK = {
  styleVariant: "inverse",
  textColor: "#ffffff",
  outlineWidthPx: 0,
  inverseMaskMotion: "none",
  inverseMaskDriftXPercent: 0,
  inverseMaskDriftYPercent: 0,
  inverseMaskSweepIntensity: 0,
  inverseMaskSweepCycles: 1,
} as const;

export function resolveCaptionProps(
  raw: Record<string, unknown> | null | undefined,
): CaptionElementProps {
  const text = typeof raw?.text === "string" ? raw.text : DEFAULT_CAPTION_PROPS.text;
  // Caption text is literal. Legacy case overrides are intentionally ignored.
  const textCase = "source" as const;
  const positionPreset = isCaptionPositionPreset(raw?.positionPreset)
    ? raw.positionPreset
    : DEFAULT_CAPTION_PROPS.positionPreset;
  const positionNudgeY = raw?.positionNudgeY === "slightly_up" || raw?.positionNudgeY === "slightly_down"
    ? raw.positionNudgeY
    : DEFAULT_CAPTION_PROPS.positionNudgeY;
  const textAlign = raw?.textAlign === "left" || raw?.textAlign === "center" || raw?.textAlign === "right"
    ? raw.textAlign
    : DEFAULT_CAPTION_PROPS.textAlign;
  const animationIn = isCaptionAnimationPreset(raw?.animationIn)
    ? raw.animationIn
    : DEFAULT_CAPTION_PROPS.animationIn;
  const animationOut = isCaptionAnimationPreset(raw?.animationOut)
    ? raw.animationOut
    : DEFAULT_CAPTION_PROPS.animationOut;
  const fontPreset = isCaptionFontPreset(raw?.fontPreset)
    ? raw.fontPreset
    : DEFAULT_CAPTION_PROPS.fontPreset;
  const legacySurfaceAttached = raw?.surface_attached === true;
  const surfaceMode = raw?.surfaceMode === "wall" || legacySurfaceAttached ? "wall" : "none";
  const rawGroupLayout = raw?.groupLayout;
  const groupLayout = (() => {
    if (!rawGroupLayout || typeof rawGroupLayout !== "object" || Array.isArray(rawGroupLayout)) return null;
    const candidate = rawGroupLayout as Record<string, unknown>;
    if (
      candidate.kind !== "paragraph_panel"
      || !Number.isInteger(candidate.row)
      || !Number.isInteger(candidate.rows)
      || (candidate.rows as number) < 1
      || (candidate.rows as number) > 12
      || (candidate.row as number) < 0
      || (candidate.row as number) >= (candidate.rows as number)
    ) return null;
    return {
      kind: "paragraph_panel" as const,
      ...(candidate.packing === "reels_safe" ? { packing: "reels_safe" as const } : {}),
      row: candidate.row as number,
      rows: candidate.rows as number,
    };
  })();
  const rawBenchmarkStackLayout = raw?.benchmarkStackLayout;
  const benchmarkStackLayout = (() => {
    if (!rawBenchmarkStackLayout || typeof rawBenchmarkStackLayout !== "object" || Array.isArray(rawBenchmarkStackLayout)) return null;
    const candidate = rawBenchmarkStackLayout as Record<string, unknown>;
    if (
      (candidate.kind !== "upper_canvas_pile"
        && candidate.kind !== "upper_canvas_cover"
        && candidate.kind !== "featured_benchmark_stack")
      || !Number.isInteger(candidate.index)
      || !Number.isInteger(candidate.total)
      || (candidate.total as number) < 2
      || (candidate.total as number) > 32
      || (candidate.index as number) < 0
      || (candidate.index as number) >= (candidate.total as number)
    ) return null;
    return {
      kind: candidate.kind as "upper_canvas_pile" | "upper_canvas_cover" | "featured_benchmark_stack",
      index: candidate.index as number,
      total: candidate.total as number,
    };
  })();
  const cameraRevealEasing: CameraRevealEasing =
    raw?.cameraRevealEasing === "linear"
    || raw?.cameraRevealEasing === "ease_out"
    || raw?.cameraRevealEasing === "ease_in_out"
    || raw?.cameraRevealEasing === "slow_middle"
    || raw?.cameraRevealEasing === "custom"
      ? raw.cameraRevealEasing
      : DEFAULT_CAPTION_PROPS.cameraRevealEasing;
  const cameraRevealBezier = normalizeCubicBezier(
    raw?.cameraRevealBezier,
    DEFAULT_CAPTION_PROPS.cameraRevealBezier,
  );
  const motionCurveFallback = cameraRevealEasing === "custom"
    ? motionCurveFromBezier(cameraRevealBezier)
    : CAMERA_REVEAL_MOTION_CURVES[cameraRevealEasing];
  const cameraRevealMotionCurve = normalizeMotionCurve(
    raw?.cameraRevealMotionCurve,
    motionCurveFallback,
  );
  const cameraRevealMotionKeyframes = normalizeMotionKeyframes(
    raw?.cameraRevealMotionKeyframes,
    cameraRevealMotionCurve,
  );

  return {
    text,
    fontSizing: raw?.fontSizing === "fixed" ? "fixed" : "fit",
    singleLine:
      raw?.singleLine === true
      || raw?.caption_single_line_contract === true
      || raw?.caption_follow_audio === true,
    textCase,
    positionPreset,
    positionNudgeY,
    offsetX: clamp(asFiniteNumber(raw?.offsetX, DEFAULT_CAPTION_PROPS.offsetX), -0.45, 0.45),
    offsetY: clamp(asFiniteNumber(raw?.offsetY, DEFAULT_CAPTION_PROPS.offsetY), -0.45, 0.45),
    // Stored positions keep their full reach (relation placement can need it); dragging and typing
    // stay inside the manual range (clampCaptionAbsPosition).
    absX:
      typeof raw?.absX === "number" && Number.isFinite(raw.absX)
        ? clamp(raw.absX, CAPTION_ABS_POSITION_REACH.min, CAPTION_ABS_POSITION_REACH.max)
        : DEFAULT_CAPTION_PROPS.absX,
    absY:
      typeof raw?.absY === "number" && Number.isFinite(raw.absY)
        ? clamp(raw.absY, CAPTION_ABS_POSITION_REACH.min, CAPTION_ABS_POSITION_REACH.max)
        : DEFAULT_CAPTION_PROPS.absY,
    groupLayout,
    maxWidth: clamp(asFiniteNumber(raw?.maxWidth, DEFAULT_CAPTION_PROPS.maxWidth), 0.25, 1),
    textAlign,
    fontPreset,
    fontSizePx: clamp(asFiniteNumber(raw?.fontSizePx, DEFAULT_CAPTION_PROPS.fontSizePx), 18, 300),
    textScaleX: clamp(asFiniteNumber(raw?.textScaleX, DEFAULT_CAPTION_PROPS.textScaleX), 0.5, 2.5),
    textScaleY: clamp(asFiniteNumber(raw?.textScaleY, DEFAULT_CAPTION_PROPS.textScaleY), 0.5, 2.5),
    textColor: asHexColor(raw?.textColor),
    outlineWidthPx:
      typeof raw?.outlineWidthPx === "number" && Number.isFinite(raw.outlineWidthPx)
        ? clamp(raw.outlineWidthPx, 0, 20)
        : DEFAULT_CAPTION_PROPS.outlineWidthPx,
    surfaceMode,
    surfacePerspectivePx: clamp(asFiniteNumber(raw?.surfacePerspectivePx, DEFAULT_CAPTION_PROPS.surfacePerspectivePx), 400, 3000),
    surfaceDepthPx: clamp(asFiniteNumber(raw?.surfaceDepthPx, surfaceMode === "wall" ? -90 : DEFAULT_CAPTION_PROPS.surfaceDepthPx), -400, 200),
    surfaceRotateXDeg: clamp(asFiniteNumber(raw?.surfaceRotateXDeg, DEFAULT_CAPTION_PROPS.surfaceRotateXDeg), -30, 30),
    surfaceRotateYDeg: clamp(asFiniteNumber(raw?.surfaceRotateYDeg, DEFAULT_CAPTION_PROPS.surfaceRotateYDeg), -30, 30),
    surfaceRotateZDeg: clamp(asFiniteNumber(raw?.surfaceRotateZDeg ?? raw?.surface_rotate_deg, DEFAULT_CAPTION_PROPS.surfaceRotateZDeg), -30, 30),
    surfaceSkewXDeg: clamp(asFiniteNumber(raw?.surfaceSkewXDeg ?? raw?.surface_skew_x_deg, DEFAULT_CAPTION_PROPS.surfaceSkewXDeg), -20, 20),
    surfaceSkewYDeg: clamp(asFiniteNumber(raw?.surfaceSkewYDeg ?? raw?.surface_skew_y_deg, DEFAULT_CAPTION_PROPS.surfaceSkewYDeg), -20, 20),
    surfaceOpacity: clamp(asFiniteNumber(raw?.surfaceOpacity ?? raw?.surface_opacity, surfaceMode === "wall" ? 0.78 : DEFAULT_CAPTION_PROPS.surfaceOpacity), 0.2, 1),
    surfaceBlurPx: clamp(asFiniteNumber(raw?.surfaceBlurPx ?? raw?.surface_blur_px, surfaceMode === "wall" ? 0.3 : DEFAULT_CAPTION_PROPS.surfaceBlurPx), 0, 3),
    surfaceBlendMode: raw?.surfaceBlendMode === "multiply" || (legacySurfaceAttached && raw?.surfaceBlendMode !== "normal") ? "multiply" : "normal",
    benchmarkRotationDeg: clamp(
      asFiniteNumber(raw?.benchmarkRotationDeg, DEFAULT_CAPTION_PROPS.benchmarkRotationDeg),
      -8,
      8,
    ),
    rotationDeg: clamp(asFiniteNumber(raw?.rotationDeg, DEFAULT_CAPTION_PROPS.rotationDeg), -180, 180),
    benchmarkStackLayout,
    styleVariant: isCaptionStyleVariant(raw?.styleVariant) ? raw.styleVariant : DEFAULT_CAPTION_PROPS.styleVariant,
    handwritingWeight: normalizeHandwritingWeight(raw?.handwritingWeight),
    handwritingRevealMode: raw?.handwritingRevealMode === "saved_strokes" ? "saved_strokes" : "line_mask",
    animationIn,
    animationOut,
    animationInDuration: clamp(
      asFiniteNumber(raw?.animationInDuration, DEFAULT_CAPTION_PROPS.animationInDuration),
      0,
      animationIn === "handwriting" ? 60 : 2,
    ),
    animationOutDuration: clamp(
      asFiniteNumber(raw?.animationOutDuration, DEFAULT_CAPTION_PROPS.animationOutDuration),
      0,
      animationOut === "handwriting" ? 60 : 2,
    ),
    dropInDistanceRatio: clamp(
      asFiniteNumber(raw?.dropInDistanceRatio, DEFAULT_CAPTION_PROPS.dropInDistanceRatio),
      0.02,
      0.45,
    ),
    timingMode:
      raw?.timingMode === "active_word"
      || raw?.timingMode === "single_word"
        ? raw.timingMode
        : "phrase",
    singleWordFlipSeconds: clamp(asFiniteNumber(raw?.singleWordFlipSeconds, DEFAULT_CAPTION_PROPS.singleWordFlipSeconds), 0, 0.3),
    hidePunctuation: raw?.hidePunctuation === true,
    wordTimings: normalizeWordTimings(raw?.wordTimings),
    wordStyles: normalizeWordStyles(raw?.wordStyles),
    activeWordColor: asHexColor(raw?.activeWordColor) ?? DEFAULT_CAPTION_PROPS.activeWordColor,
    activeWordTextColor: asHexColor(raw?.activeWordTextColor),
    activeWordKeepsOutline: raw?.activeWordKeepsOutline === true,
    activeWordPadXEm: clamp(asFiniteNumber(raw?.activeWordPadXEm, DEFAULT_CAPTION_PROPS.activeWordPadXEm), 0, 0.6),
    inverseMaskMotion: raw?.inverseMaskMotion === "drift" ? "drift" : "none",
    inverseMaskDriftXPercent: clamp(
      asFiniteNumber(raw?.inverseMaskDriftXPercent, DEFAULT_CAPTION_PROPS.inverseMaskDriftXPercent),
      -12,
      12,
    ),
    inverseMaskDriftYPercent: clamp(
      asFiniteNumber(raw?.inverseMaskDriftYPercent, DEFAULT_CAPTION_PROPS.inverseMaskDriftYPercent),
      -12,
      12,
    ),
    inverseMaskSweepIntensity: clamp(
      asFiniteNumber(raw?.inverseMaskSweepIntensity, DEFAULT_CAPTION_PROPS.inverseMaskSweepIntensity),
      0,
      1,
    ),
    inverseMaskSweepCycles: clamp(
      asFiniteNumber(raw?.inverseMaskSweepCycles, DEFAULT_CAPTION_PROPS.inverseMaskSweepCycles),
      0.25,
      4,
    ),
    mediaFillUrls: asMediaFillUrls(raw?.mediaFillUrls),
    mediaFillVideoPlaybackRate: clamp(asFiniteNumber(raw?.mediaFillVideoPlaybackRate, 1), 0.1, 4),
    mediaFillScene: raw?.mediaFillScene && typeof raw.mediaFillScene === "object"
      && ["startSeconds", "x", "y", "width", "height"].every(key => Number.isFinite((raw.mediaFillScene as Record<string, unknown>)[key]))
      && Number((raw.mediaFillScene as Record<string, unknown>).width) > 0 && Number((raw.mediaFillScene as Record<string, unknown>).height) > 0
      ? raw.mediaFillScene as CaptionElementProps["mediaFillScene"] : null,
    mediaFillVideoUrl: typeof raw?.mediaFillVideoUrl === "string" ? raw.mediaFillVideoUrl.trim() : "",
    mediaFillVideoPreviewUrl: typeof raw?.mediaFillVideoPreviewUrl === "string" ? raw.mediaFillVideoPreviewUrl.trim() : "",
    mediaFillChangeTimesSeconds: asMediaFillChangeTimesSeconds(raw?.mediaFillChangeTimesSeconds),
    mediaFillSecondsPerImage: clamp(
      asFiniteNumber(raw?.mediaFillSecondsPerImage, DEFAULT_CAPTION_PROPS.mediaFillSecondsPerImage),
      0.15,
      10,
    ),
    mediaFillCrossfadeSeconds: clamp(
      asFiniteNumber(raw?.mediaFillCrossfadeSeconds, DEFAULT_CAPTION_PROPS.mediaFillCrossfadeSeconds),
      0,
      1,
    ),
    mediaFillFirstTransition: raw?.mediaFillFirstTransition === "cut" ? "cut" : "inherit",
    mediaFillTransition:
      raw?.mediaFillTransition === "cut" || raw?.mediaFillTransition === "slide"
        ? raw.mediaFillTransition
        : "dissolve",
    mediaFillSlideDirection:
      raw?.mediaFillSlideDirection === "right"
      || raw?.mediaFillSlideDirection === "up"
      || raw?.mediaFillSlideDirection === "down"
        ? raw.mediaFillSlideDirection
        : "left",
    mediaFillTransitionBlur: clamp(
      asFiniteNumber(raw?.mediaFillTransitionBlur, DEFAULT_CAPTION_PROPS.mediaFillTransitionBlur),
      0,
      1,
    ),
    mediaFillScale: clamp(
      asFiniteNumber(raw?.mediaFillScale, DEFAULT_CAPTION_PROPS.mediaFillScale),
      1,
      4,
    ),
    mediaFillPanPercent: clamp(
      asFiniteNumber(raw?.mediaFillPanPercent, DEFAULT_CAPTION_PROPS.mediaFillPanPercent),
      -50,
      50,
    ),
    cameraRevealFontWeight: Math.round(clamp(
      asFiniteNumber(raw?.cameraRevealFontWeight, DEFAULT_CAPTION_PROPS.cameraRevealFontWeight),
      100,
      900,
    ) / 100) * 100,
    cameraRevealTypographySizing:
      raw?.cameraRevealTypographySizing === "font_size" ? "font_size" : "fit",
    cameraRevealMediaFit: raw?.cameraRevealMediaFit === "camera" ? "camera" : "wordmark",
    cameraRevealStartSeconds: clamp(
      asFiniteNumber(raw?.cameraRevealStartSeconds, DEFAULT_CAPTION_PROPS.cameraRevealStartSeconds),
      0,
      30,
    ),
    cameraRevealHoldSeconds: clamp(
      asFiniteNumber(raw?.cameraRevealHoldSeconds, DEFAULT_CAPTION_PROPS.cameraRevealHoldSeconds),
      0,
      5,
    ),
    cameraRevealDurationSeconds: clamp(
      asFiniteNumber(raw?.cameraRevealDurationSeconds, DEFAULT_CAPTION_PROPS.cameraRevealDurationSeconds),
      0.1,
      10,
    ),
    cameraRevealStartDistance: clamp(
      asFiniteNumber(raw?.cameraRevealStartDistance, DEFAULT_CAPTION_PROPS.cameraRevealStartDistance),
      0.01,
      6,
    ),
    cameraRevealEndDistance: clamp(
      asFiniteNumber(raw?.cameraRevealEndDistance, DEFAULT_CAPTION_PROPS.cameraRevealEndDistance),
      2,
      14,
    ),
    cameraRevealTargetX: clamp(
      asFiniteNumber(raw?.cameraRevealTargetX, DEFAULT_CAPTION_PROPS.cameraRevealTargetX),
      -2.5,
      2.5,
    ),
    cameraRevealTargetY: clamp(
      asFiniteNumber(raw?.cameraRevealTargetY, DEFAULT_CAPTION_PROPS.cameraRevealTargetY),
      -2.5,
      2.5,
    ),
    cameraRevealFov: clamp(
      asFiniteNumber(raw?.cameraRevealFov, DEFAULT_CAPTION_PROPS.cameraRevealFov),
      20,
      90,
    ),
    cameraRevealEasing,
    cameraRevealBezier,
    cameraRevealMotionCurve,
    cameraRevealMotionKeyframes,
    cameraRevealShutterAngle: clamp(
      asFiniteNumber(raw?.cameraRevealShutterAngle, DEFAULT_CAPTION_PROPS.cameraRevealShutterAngle),
      0,
      360,
    ),
    cameraRevealBlurSamples: Math.round(clamp(
      asFiniteNumber(raw?.cameraRevealBlurSamples, DEFAULT_CAPTION_PROPS.cameraRevealBlurSamples),
      1,
      10,
    )),
    cameraRevealExtrusionDepth: clamp(
      asFiniteNumber(raw?.cameraRevealExtrusionDepth, DEFAULT_CAPTION_PROPS.cameraRevealExtrusionDepth),
      0,
      1,
    ),
    cameraRevealBevelWidth: clamp(
      asFiniteNumber(raw?.cameraRevealBevelWidth, DEFAULT_CAPTION_PROPS.cameraRevealBevelWidth),
      0,
      1,
    ),
    cameraRevealEdgeLight: clamp(
      asFiniteNumber(raw?.cameraRevealEdgeLight, DEFAULT_CAPTION_PROPS.cameraRevealEdgeLight),
      0,
      2,
    ),
    cameraRevealEdgeColor: asHexColor(raw?.cameraRevealEdgeColor)
      ?? DEFAULT_CAPTION_PROPS.cameraRevealEdgeColor,
    cameraRevealWallMirror: clamp(
      asFiniteNumber(raw?.cameraRevealWallMirror, DEFAULT_CAPTION_PROPS.cameraRevealWallMirror),
      0,
      1,
    ),
    cameraRevealOrbitX: clamp(
      asFiniteNumber(raw?.cameraRevealOrbitX, DEFAULT_CAPTION_PROPS.cameraRevealOrbitX),
      -1.5,
      1.5,
    ),
    cameraRevealOrbitY: clamp(
      asFiniteNumber(raw?.cameraRevealOrbitY, DEFAULT_CAPTION_PROPS.cameraRevealOrbitY),
      -1.5,
      1.5,
    ),
    cameraRevealResolveMode:
      raw?.cameraRevealResolveMode === "brand_card" ? "brand_card" : "none",
    cameraRevealResolveStartSeconds: clamp(
      asFiniteNumber(
        raw?.cameraRevealResolveStartSeconds,
        DEFAULT_CAPTION_PROPS.cameraRevealResolveStartSeconds,
      ),
      0,
      30,
    ),
    cameraRevealResolveDurationSeconds: clamp(
      asFiniteNumber(
        raw?.cameraRevealResolveDurationSeconds,
        DEFAULT_CAPTION_PROPS.cameraRevealResolveDurationSeconds,
      ),
      0.05,
      5,
    ),
    cameraRevealResolveBackgroundColor:
      asHexColor(raw?.cameraRevealResolveBackgroundColor)
      ?? DEFAULT_CAPTION_PROPS.cameraRevealResolveBackgroundColor,
    cameraRevealResolveTextColor:
      asHexColor(raw?.cameraRevealResolveTextColor)
      ?? DEFAULT_CAPTION_PROPS.cameraRevealResolveTextColor,
  };
}

export function makeDefaultCaptionProps(text: string): CaptionElementProps {
  return composeCaptionProps(text);
}

export function captionStylePropsFromRaw(
  raw: Record<string, unknown> | null | undefined,
): CaptionStyleProps {
  const resolved = resolveCaptionProps(raw);
  const style = { ...resolved };
  delete (style as { text?: string }).text;
  delete (style as { singleLine?: boolean }).singleLine;
  delete (style as { timingMode?: CaptionTimingMode }).timingMode;
  delete (style as { singleWordFlipSeconds?: number }).singleWordFlipSeconds;
  delete (style as { hidePunctuation?: boolean }).hidePunctuation;
  delete (style as { wordTimings?: CaptionWordTiming[] }).wordTimings;
  // Word looks belong to these words, so a style copied to other text leaves them behind.
  delete (style as { wordStyles?: CaptionWordStyle[] }).wordStyles;
  return style;
}

export function sanitizeCaptionStyleProps(
  raw: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return { ...captionStylePropsFromRaw(raw) };
}

export function composeCaptionProps(
  text: string,
  styleRaw?: Record<string, unknown> | null,
): CaptionElementProps {
  const resolved = resolveCaptionProps({
    ...(styleRaw ?? {}),
    text,
  });
  const fallback = captionPresetBaseXY(resolved.positionPreset, resolved.maxWidth);

  // This anchor is bottom-relative; legacy top-left fallbacks would detach it
  // from the safe boundary when composing or reusing the style.
  if (resolved.positionPreset === "reels_bottom_center" || resolved.positionPreset === "reels_interface_bottom_center") return resolved;

  return {
    ...resolved,
    absX: resolved.absX ?? fallback.x,
    absY: resolved.absY ?? fallback.y,
  };
}

/** Absolute top-left X/Y coordinates (0–1 normalized) for each position preset. */
export function captionPresetBaseXY(
  preset: CaptionPositionPreset,
  maxWidth = DEFAULT_CAPTION_PROPS.maxWidth,
): { x: number; y: number } {
  const sideInset = 0.05;
  const x = preset.endsWith("left")
    ? sideInset
    : preset.endsWith("right")
      ? Math.max(0, 1 - sideInset - maxWidth)
      : Math.max(0, (1 - maxWidth) / 2);
  const y = preset.startsWith("top")
    ? 0.08
    : preset.startsWith("upper")
      ? 0.25
      : preset.startsWith("lower")
        ? 0.61
        : preset.startsWith("bottom")
          ? 0.74
          : 0.43;
  return { x, y };
}

/** Find the closest preset for an absolute x/y, or null if none is close enough. */
export function captionPresetFromXY(
  x: number,
  y: number,
  threshold = 0.02,
  maxWidth = DEFAULT_CAPTION_PROPS.maxWidth,
): CaptionPositionPreset | null {
  for (const preset of CAPTION_POSITION_PRESETS) {
    const base = captionPresetBaseXY(preset, maxWidth);
    if (Math.abs(x - base.x) <= threshold && Math.abs(y - base.y) <= threshold) return preset;
  }
  return null;
}

export function captionPresetTextAlign(preset: CaptionPositionPreset): "left" | "center" | "right" {
  if (preset.endsWith("left")) return "left";
  if (preset.endsWith("right")) return "right";
  return "center";
}

export function captionFontFamily(fontPreset: CaptionFontPreset) {
  return getSharedFont(fontPreset).cssFontFamily;
}

export function captionRemotionFontFamily(fontPreset: CaptionFontPreset) {
  return getSharedFont(fontPreset).remotionFontFamily;
}

export function captionTypographyCSS(fontPreset: CaptionFontPreset): Record<string, string | number> {
  switch (fontPreset) {
    case "dm_serif_display":
      return {
        fontWeight: 400,
        lineHeight: 1.08,
        letterSpacing: "0",
      };
    case "noto_sans_math":
      return {
        fontWeight: 400,
        lineHeight: 1,
        letterSpacing: "0",
      };
    case "handwritten_script":
      return {
        fontWeight: 400,
        lineHeight: 1.22,
        letterSpacing: "0",
      };
    case "romantic_script":
      return {
        fontWeight: 400,
        lineHeight: 1.24,
        letterSpacing: "0.005em",
      };
    case "mono":
      return {
        fontWeight: 500,
        lineHeight: 1.14,
        letterSpacing: "0.02em",
      };
    case "bebas_neue":
    case "anton":
      return {
        fontWeight: 400,
        lineHeight: 1,
        letterSpacing: "0.03em",
      };
    default:
      return {
        fontWeight: 600,
        lineHeight: 1.12,
        letterSpacing: "0.01em",
      };
  }
}

/** Collapse authored hard breaks only for the spoken-caption one-line contract. */
// Marks that belong inside a word or number stay: Meta's, 10-K, $1.5, 80,000, 10/10, 9:30.
const JOINING_MARKS = /['’\-.,/:]/u;
const WORD_CHARACTER = /[\p{L}\p{N}]/u;
// Signs that carry meaning on their own stay too.
const KEPT_SIGNS = /[%$€£&#@+]/u;

/**
 * Captions DreamCut makes from speech or a voiceover script draw without punctuation unless the
 * creator asks for it (owner, 2026-10-27). Typed text keeps what was typed; a stored caption without
 * the field keeps showing its punctuation.
 */
export const SPEECH_CAPTIONS_HIDE_PUNCTUATION = true;

/** Words as they read without punctuation: quotes, commas, full stops and dashes between words go. */
export function withoutPunctuation(text: string): string {
  const characters = [...text];
  return characters.map((character, index) => {
    if (!/\p{P}/u.test(character) || KEPT_SIGNS.test(character)) return character;
    const joins = JOINING_MARKS.test(character)
      && WORD_CHARACTER.test(characters[index - 1] ?? "") && WORD_CHARACTER.test(characters[index + 1] ?? "");
    return joins ? character : "";
  }).join("").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim();
}

/**
 * What a caption draws. With hidePunctuation, the text and each word drop their punctuation,
 * and a word that was only punctuation (a lone dash) is dropped with its timing, so the words
 * and timings still pair up. Both renderers read this.
 */
export function captionDrawnProps(props: CaptionElementProps): CaptionElementProps {
  if (!props.hidePunctuation) return props;
  return {
    ...props,
    text: withoutPunctuation(props.text),
    wordTimings: props.wordTimings.map((timing) => ({ ...timing, text: withoutPunctuation(timing.text) })).filter((timing) => timing.text.length > 0),
  };
}

export function captionDisplayText(props: CaptionElementProps): string {
  return props.singleLine ? props.text.replace(/\s+/g, " ").trim() : props.text;
}

function estimatedGlyphWidthEm(character: string): number {
  if (/\s/.test(character)) return 0.32;
  if (/[MW@#%&]/.test(character)) return 0.96;
  if (/[mw]/.test(character)) return 0.84;
  if (/[ilI1|!'.,:;]/.test(character)) return 0.3;
  if (/[A-Z0-9]/.test(character)) return 0.66;
  if (/[a-z]/.test(character)) return 0.54;
  return 1;
}

/**
 * Deterministic fit-down for speech captions. The authored size remains the
 * ceiling; only phrases that would exceed their semantic caption rail shrink.
 * This is shared by preview, export, and QC measurement.
 */
export function resolveCaptionFontSizePx(
  props: CaptionElementProps,
  contentWidthPx: number,
): number {
  if (!props.singleLine || props.fontSizing === "fixed") return props.fontSizePx;
  const text = captionDisplayText(props);
  if (!text) return props.fontSizePx;
  const typography = captionTypographyCSS(props.fontPreset);
  const letterSpacing = typeof typography.letterSpacing === "string"
    ? Number.parseFloat(typography.letterSpacing)
    : 0;
  const glyphWidthEm = Array.from(text).reduce((sum, character) => sum + estimatedGlyphWidthEm(character), 0);
  const trackingWidthEm = Number.isFinite(letterSpacing)
    ? Math.max(0, text.length - 1) * letterSpacing
    : 0;
  const outlineInsetPx = Math.max(0, props.outlineWidthPx ?? (props.styleVariant === "bold_outline" ? 4 : 0)) * 2;
  const availableWidthPx = Math.max(1, contentWidthPx - outlineInsetPx);
  const fitted = availableWidthPx / Math.max(1, glyphWidthEm + trackingWidthEm);
  return Math.max(8, Math.min(props.fontSizePx, fitted * 0.96));
}

/** Static anchor contract shared by caption rendering and spatial estimates.
 * Width/height of rendered text remain a separate measurement authority. */
export function resolveCaptionAnchorLayout(props: CaptionElementProps, content: CaptionContentRect) {
  if (props.benchmarkStackLayout?.kind === "featured_benchmark_stack") {
    const index = Math.max(0, Math.min(2, props.benchmarkStackLayout.index));
    const xPattern = [0.05, 0.12, 0.05];
    const yPattern = [0.08, 0.25, 0.42];
    const x = content.left + content.width * xPattern[index]!;
    const y = content.top + content.height * yPattern[index]!;
    return {
      x,
      y,
      anchorX: 0,
      anchorY: 0,
      horizontal: { left: `${x * 100}%`, transformBaseX: "0%" },
      vertical: { top: `${y * 100}%`, transformBaseY: "0%" },
    };
  }
  if (props.benchmarkStackLayout?.kind === "upper_canvas_pile") {
    const xPattern = [0, 1, 0.46, 0.12, 0.82, 0.28, 0.65, 0.04, 0.94, 0.52, 0.18, 0.74, 0.36, 0.88, 0.08, 0.6, 0.42];
    const yPattern = [0.16, 0.17, 0.22, 0.24, 0.27, 0.29, 0.26, 0.33, 0.31, 0.36, 0.35, 0.39, 0.38, 0.42, 0.4, 0.44, 0.43];
    const patternIndex = props.benchmarkStackLayout.index % xPattern.length;
    const horizontalTravel = Math.max(0, 0.96 - props.maxWidth);
    const relativeX = 0.02 + xPattern[patternIndex]! * horizontalTravel;
    const relativeY = yPattern[patternIndex]!;
    const x = content.left + content.width * relativeX;
    const y = content.top + content.height * relativeY;
    return {
      x,
      y,
      anchorX: 0,
      anchorY: 0,
      horizontal: { left: `${x * 100}%`, transformBaseX: "0%" },
      vertical: { top: `${y * 100}%`, transformBaseY: "0%" },
    };
  }
  if (props.benchmarkStackLayout?.kind === "upper_canvas_cover") {
    // Dense upper-half coverage: five full-width base rows tile the actual
    // canvas from y=0 through y=.5. The remaining cards alternate across that
    // base, so rotated corners never reveal the original plate or brand marks.
    const xPattern = [0, 0, 0, 0, 0, 0.98, 0.08, 0.86, 0.24, 0.72, 0, 1, 0.16, 0.82, 0.36, 0.04, 0.94];
    const yPattern = [0, 0.105, 0.21, 0.315, 0.42, 0.02, 0.08, 0.14, 0.2, 0.26, 0.32, 0.38, 0.44, 0.05, 0.17, 0.29, 0.41];
    const patternIndex = props.benchmarkStackLayout.index % xPattern.length;
    const horizontalTravel = Math.max(0, 1 - props.maxWidth);
    const relativeX = xPattern[patternIndex]! * horizontalTravel;
    const relativeY = yPattern[patternIndex]!;
    const x = relativeX;
    const y = relativeY;
    return {
      x,
      y,
      anchorX: 0,
      anchorY: 0,
      horizontal: { left: `${x * 100}%`, transformBaseX: "0%" },
      vertical: { top: `${y * 100}%`, transformBaseY: "0%" },
    };
  }
  if (props.groupLayout?.kind === "paragraph_panel") {
    const { row, rows } = props.groupLayout;
    const safePanel = props.groupLayout.packing === "reels_safe";
    const panelTop = safePanel ? 0.16 : 0.035;
    const panelBottom = safePanel ? 0.595 : 0.84;
    const relativeY = rows === 1
      ? panelTop
      : panelTop + (panelBottom - panelTop) * row / (rows - 1);
    const x = content.left + content.width * (safePanel ? 0.075 : 0.04);
    const y = content.top + content.height * relativeY;
    return {
      x,
      y,
      anchorX: 0,
      anchorY: 0,
      horizontal: { left: `${x * 100}%`, transformBaseX: "0%" },
      vertical: { top: `${y * 100}%`, transformBaseY: "0%" },
    };
  }
  const x = content.left + content.width * (props.absX ?? (props.positionPreset.endsWith("left") ? 0.09 : props.positionPreset.endsWith("right") ? 0.91 : 0.5));
  const presetY = props.positionPreset === "reels_interface_bottom_center"
    ? REELS_INTERFACE_BOTTOM
    : props.positionPreset === "reels_bottom_center"
    ? 1 - SAFE_AREA_REELS.bottom / SAFE_AREA_REELS.reference.height
    : props.positionPreset.startsWith("top")
    ? 0.11
    : props.positionPreset.startsWith("upper")
      ? 0.29
      : props.positionPreset.startsWith("lower")
        ? 0.68
        : props.positionPreset.startsWith("bottom")
          ? 0.82
          : 0.5;
  const semanticNudgeY = props.positionNudgeY === "slightly_down"
    ? 0.04
    : props.positionNudgeY === "slightly_up"
      ? -0.04
      : 0;
  const y = content.top + content.height * Math.max(CAPTION_ABS_POSITION_REACH.min, Math.min(CAPTION_ABS_POSITION_REACH.max, (props.absY ?? presetY) + semanticNudgeY));
  const anchorX = props.absX != null || props.positionPreset.endsWith("left") ? 0 : props.positionPreset.endsWith("right") ? 1 : 0.5;
  const anchorY = props.absY != null || props.positionPreset.startsWith("top") || props.positionPreset.startsWith("upper")
    ? 0
    : props.positionPreset === "reels_interface_bottom_center" || props.positionPreset === "reels_bottom_center" || props.positionPreset.startsWith("bottom") || props.positionPreset.startsWith("lower")
      ? 1
      : 0.5;
  return { x, y, anchorX, anchorY,
    horizontal: { left: `${x * 100}%`, transformBaseX: `${-anchorX * 100}%` },
    vertical: { top: `${y * 100}%`, transformBaseY: `${-anchorY * 100}%` } };
}
