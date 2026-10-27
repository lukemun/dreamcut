import { motionSubjectFromSourceUrl, type MotionSubject } from "../hyperframes/motion-media";
import { currentFrameRate } from "../timeline/frame-rate-scope";
import { transitionControl, availableTransitionFields, availableTransitionFieldValue } from "../timeline/transition-controls";
import { getTransitionMaxDurationSeconds } from "../timeline/transitions";
import { SHAPE_KIND_LABELS, type ShapeKind } from "../timeline/shapes";
import { DERIVED_FIELD_IDENTITY, PROPOSAL_TUNABLE_FIELDS, TIMING_PATCH_FIELDS, derivedChoiceFields, derivedChoiceValue, derivedFieldValue, derivedProposalFields, isCameraSizeField, isSupportedProposalControl, timingFieldOwnedByTrim, zoomTimingRange } from "./proposal-controls";
import type { ProposalControlReference } from "./proposal-controls";
import path from "node:path";

import type { TimelineElement } from "@/components/studio/timeline/types";
import { EFFECT_CONTROLS } from "@/lib/timeline/effect-controls";
import { transitionKeyframesSchema } from "@/lib/timeline/transition-effects";
import type { TimelineFile } from "@/lib/local-store/store";
import { findElement } from "@/lib/local-store/store";

import type { EditorAgentOperation, EditorAgentOption, EditorAgentProposal } from "./timeline-editor-agent-apply";
import { maskWindowValues } from "./proposal-mask-window";
import { blockLabel, blockReviewChanges } from "./proposal-blocks";

/**
 * Human-readable review rows for a proposal option.
 *
 * Everything here except `rationale` is DERIVED from the operation and the
 * element it targets. The agent authors why it wants a change; it never authors
 * the description of what the change is. A proposal therefore cannot present
 * itself in the review panel as doing something other than what approval writes.
 */

export type ProposalFieldChange = {
  field: string;
  label: string;
  before: string;
  after: string;
  target: "create_transition" | "create_audio" | "create_visual" | "create_text" | "create_shape" | "remove_visual" | "remove_text" | "set_lane_order" | "set_output_format" | "opening_sequence_edit" | "source_range_cut" | "source_range_restore" | "speed_change" | "set_preview_audio_source" | "use_video_stabilization" | "use_recast" | "use_voice_enhancement" | "reattach_original_audio" | "sync_speech_visual" | "replace_captions" | "patch" | "props" | "clear_patch" | "clear_props" | "timing_control" | "block";
  /** For `target: "block"`, the block's index in `option.blocks`. */
  operation_index: number;
  after_value?: unknown;
  control_range?: { min: number; max: number };
  control_unit?: "seconds" | "frames";
  control_group?: { operation_index: number; offset_seconds: number };
  implicit_default?: boolean;
  /** Block settings carry their own dial metadata from the block registry. */
  block_id?: string;
  control_display?: { step: number; suffix: string };
  control_tier?: "main" | "advanced";
  /** Section heading this dial sits under (one per beat, in time order); a review control's `section` is the agent-authored route to the same heading. */
  section?: string;
  control_choices?: { value: string; label: string }[];
};

export type ProposalReviewRow = {
  element_id: string;
  element_label: string;
  element_type: string;
  /** Derived verb describing the dominant kind of edit. */
  action: string;
  changes: ProposalFieldChange[];
  /** Agent-authored justification. Absent when the agent did not supply one. */
  rationale?: string;
};

export type ProposalOptionReview = {
  /** Full supported tuning inventory; factual changes stay in rows. */
  adjustment_rows: ProposalReviewRow[];
  review_controls?: ProposalControlReference[];
  /** Derived preview extent shown on the card, including playback context. */
  playback_range?: { start_seconds: number; end_seconds: number };
  /** Playback context only; never changes timeline content. */
  preview_range?: { start_seconds: number; end_seconds: number };
  option_id: string;
  label: string;
  recommended: boolean;
  summary: string;
  requested_mutations: number;
  /** e.g. "3 clips · 5 fields" */
  impact: string;
  rows: ProposalReviewRow[];
  /** Model-authored motion graphics and synthesized sounds this option places; the review can rate them. */
  motion_items?: ProposalMotionItem[];
  /** The agent's main dials for the graphics this option places; the rest sit in Advanced. */
  motion_main_controls?: string[];
  /** For cuts in speech: the words around each cut and the words it removes, so the card reads as before and after. */
  speech_edits?: SpeechEdit[];
};

/** One cut in speech as the creator reads it: `removed` is empty for a pause. */
export type SpeechEdit = { before: string; removed: string; after: string; seconds: number };

const SPEECH_CONTEXT_WORDS = 14;

/** The caption words of the recording a cut lands in, in recording order, read from the speech-bound captions. */
function speechEdits(timeline: TimelineFile, option: EditorAgentOption): SpeechEdit[] {
  const cuts = option.operations.flatMap(operation => operation.source_range_cut ? [{ operation, cut: operation.source_range_cut }] : []);
  if (!cuts.length) return [];
  const byId = new Map(timeline.elements.map(element => [element.id, element]));
  const wordsFor = new Map<string, Array<{ start: number; end: number; text: string }>>();
  const words = (sourceUrl: string) => {
    if (!wordsFor.has(sourceUrl)) wordsFor.set(sourceUrl, timeline.elements.flatMap(element => {
      const props = element.props as Record<string, unknown> | null;
      if (element.type !== "caption_text" || element.removed_at || typeof props?.text !== "string") return [];
      const speech = byId.get(String(props.caption_source_element_id ?? ""));
      const start = props.caption_source_start_seconds, end = props.caption_source_end_seconds;
      return speech?.source_url === sourceUrl && typeof start === "number" && typeof end === "number" ? [{ start, end, text: props.text }] : [];
    }).sort((a, b) => a.start - b.start));
    return wordsFor.get(sourceUrl)!;
  };
  return cuts.flatMap(({ operation, cut }) => {
    const clip = byId.get(operation.element_id);
    if (!clip?.source_url) return [];
    const all = words(clip.source_url);
    const a = cut.source_start_seconds, b = cut.source_end_seconds, edge = 1 / 60;
    const removed = all.filter(word => word.start >= a - edge && word.end <= b + edge);
    const before = all.filter(word => word.end <= a + edge && !removed.includes(word)).slice(-SPEECH_CONTEXT_WORDS);
    const after = all.filter(word => word.start >= b - edge && !removed.includes(word)).slice(0, SPEECH_CONTEXT_WORDS);
    const join = (list: typeof all) => list.map(word => word.text).join(" ");
    return [{ before: join(before), removed: join(removed), after: join(after), seconds: Number((b - a).toFixed(2)) }];
  });
}

export type ProposalMotionItem = MotionSubject & {
  /** The render of the same graphic this one takes over from, when the option swaps one. */
  replaces_source_url?: string;
  /** Filled server-side: that render's values, so the card can tell which settings changed. */
  replaced_values?: Record<string, string | number | boolean>;
  /** First operation placing this item; composition control renders swap its source. */
  operation_index: number;
  /** Where that source lives: a new graphic (create_visual/create_audio) or an existing clip's swap (patch). */
  target?: "create_visual" | "patch";
  source_url: string;
  /** Filled server-side from the render receipt when the composition declares controls. */
  controls?: unknown[];
  values?: Record<string, string | number | boolean>;
  source_fingerprint_sha256?: string;
  renders?: Array<{ source_url: string; values: Record<string, string | number | boolean> }>;
};

const PATCH_FIELD_LABELS: Record<string, string> = {
  timeline_start: "Start",
  duration: "Duration",
  trim_start: "Trim in",
  trim_end: "Trim out",
  lane_key: "Lane",
  lane_index: "Lane index",
  volume: "Volume",
  fade_in: "Fade in",
  fade_out: "Fade out",
  playback_rate: "Speed",
  type: "Clip type",
  source_url: "Source",
  title: "Title",
  source_duration_seconds: "Source duration",
  source_start_seconds: "Source in",
  source_end_seconds: "Source out",
  duration_seconds: "Duration",
  media_opacity: "Effect strength",
  recolor_amount: "Tint amount",
  recolor_color: "Mask color",
  sticker_outline_color: "Outline color",
  media_orientation: "Orientation",
  media_mirror: "Mirror",
  media_blend_mode: "Blend",
  subject_window_mode: "Show footage",
  subject_window_parent_id: "Subject clip",
  subject_window_mask: "Subject shape",
  subject_window_enabled: "Subject window",
  has_alpha: "Transparent subject mask",
  effect_role: "Effect",
  motion_preset: "Motion",
  remove_opening_seconds: "Opening removal",
  punch_in_source_seconds: "Punch-in source time",
  punch_in_scale: "Close-up scale",
  punch_in_offset_x: "Close-up position X",
  punch_in_offset_y: "Close-up position Y",
  inserted_element_id: "New segment",
  replacement_caption_element_id: "Opening caption",
  replacement_caption_text: "Opening caption text",
  max_affected_elements: "Affected-element safety cap",
  ripple_lane_keys: "Affected lanes",
  drop_boundary_captions: "Replace boundary caption",
  removed_segment_id: "Removed segment",
  video_stabilization: "Video stabilization",
  voice_enhancement: "Voice enhancement",
  follows_visual: "Linked to picture",
  place: "Placed",
  audio_authority: "Voice",
  source_element_id: "Speech source",
  speech_sync: "Speech synchronization",
  source_sha256: "Source fingerprint",
  caption_track: "Speech captions",
  remove_visual: "Removal",
  remove_text: "Removal",
  lane_order_keys: "Lane order",
  aspect_ratio: "Output aspect ratio",
  delivery_target: "Delivery target",
  beat_label: "Tutorial step",
  rough_beat_kind: "Motion type",
};

const PROP_FIELD_LABELS: Record<string, string> = {
  mask_window_close_start_seconds: "Bars start closing",
  mask_window_close_duration_seconds: "Closing time",
  mask_window_reopen_start_seconds: "Bars start reopening",
  mask_window_reopen_duration_seconds: "Reopening time",
  mask_window_top_percent: "Top bar depth",
  mask_window_bottom_percent: "Bottom bar depth",
  mask_window_foreground_id: "Synchronized ball layer",
  contour_model: "Animated contour",
  contour_radius_start: "Starting contour radius",
  contour_radius_end: "Ending contour radius",
  contour_duration: "Contour growth duration",
  contour_color: "Contour color",
  semanticLayout: "Semantic layout",
  crowdLayout: "Crowd layout",
  text: "Text",
  positionPreset: "Position",
  offsetX: "Offset X",
  offsetY: "Offset Y",
  absX: "Absolute X",
  absY: "Absolute Y",
  maxWidth: "Max width",
  textAlign: "Alignment",
  fontPreset: "Font",
  fontSizePx: "Font size",
  mediaFillVideoPlaybackRate: "Fill speed",
  textColor: "Text colour",
  styleVariant: "Caption style",
  benchmarkRotationDeg: "Benchmark card rotation",
  rotationDeg: "Rotation",
  wordStyles: "Word colours",
  shape_kind: "Shape",
  camera_id: "Camera",
  shape_width: "Width",
  shape_height: "Height",
  shape_fill: "Fill",
  shape_stroke: "Outline colour",
  shape_stroke_width: "Outline",
  shape_corner_radius: "Corners",
  shape_draw: "Drawn",
  shape_taper: "Taper",
  shape_wobble: "Wobble",
  shape_seed: "Variation",
  shape_sides: "Points",
  shape_star_depth: "Depth",
  shape_arc_start: "Start",
  shape_arc_end: "End",
  shape_arrow_head: "Head",
  shape_arrow_shaft: "Shaft",
  shape_contours: "Points",
  shape_morph: "Morph",
  media_rotation: "Rotation",
  keyframes: "Animation",
  benchmarkStackLayout: "Benchmark pile position",
  groupLayout: "Semantic text layout",
  surfaceMode: "Surface",
  timingMode: "Caption timing",
  activeWordColor: "Active-word colour",
  iris_radius: "Oval reveal",
  iris_feather: "Oval feather",
  zoom_blur: "Edge blur",
  transition_blur: "Transition blur",
  transition_keyframes: "Transition keyframes",
  inverseMaskMotion: "Inverse mask motion",
  inverseMaskDriftXPercent: "Inverse drift X",
  inverseMaskDriftYPercent: "Inverse drift Y",
  inverseMaskSweepIntensity: "Inverse light sweep",
  inverseMaskSweepCycles: "Inverse sweep passes",
  mediaFillUrls: "Fill images",
  mediaFillChangeTimesSeconds: "Audio-synced image changes",
  mediaFillSecondsPerImage: "Image hold",
  mediaFillCrossfadeSeconds: "Image crossfade",
  mediaFillFirstTransition: "First image change",
  mediaFillTransition: "Page change",
  mediaFillSlideDirection: "Slide direction",
  mediaFillTransitionBlur: "Transition motion blur",
  mediaFillScale: "Fill zoom",
  mediaFillPanPercent: "Image drift",
  cameraRevealFontWeight: "Wordmark weight",
  cameraRevealTypographySizing: "3D wordmark sizing",
  cameraRevealMediaFit: "Image framing",
  cameraRevealHoldSeconds: "Opening hold",
  cameraRevealShutterAngle: "Shutter angle",
  cameraRevealBlurSamples: "Blur samples",
  cameraRevealResolveMode: "Brand card ending",
  cameraRevealResolveStartSeconds: "Brand resolve start",
  cameraRevealResolveDurationSeconds: "Brand resolve length",
  cameraRevealResolveBackgroundColor: "Brand card colour",
  cameraRevealResolveTextColor: "Brand wordmark colour",
  animationIn: "Animation in",
  animationOut: "Animation out",
  animationInDuration: "Animation-in duration",
  animationOutDuration: "Animation-out duration",
  playback_ramp_start_rate: "Starting speed",
  playback_ramp_end_rate: "Ending speed",
  playback_ramp_fast_rate: "Opening speed",
  playback_ramp_top_rate: "Speed at note",
  playback_ramp_slow_start_source_seconds: "Slowdown starts · source",
  playback_ramp_slow_end_source_seconds: "Slowdown ends · source",
  playback_ramp_bar_close_start_seconds: "Bars start closing",
  playback_ramp_bar_close_duration_seconds: "Closing time",
  playback_ramp_bar_reopen_start_seconds: "Bars start reopening",
  playback_ramp_bar_reopen_duration_seconds: "Reopening time",
  playback_ramp_source_duration_seconds: "Source duration",
  playback_speed_steps: "Speed ramp",
  media_scale_keyframes: "Zoom keyframes (clip time)",
  media_offset_y_keyframes: "Vertical motion (clip time)",
  ...Object.fromEntries(EFFECT_CONTROLS.map((control) => [control.prop, control.label])),
};

const SECONDS_FIELDS = new Set([
  "timeline_start", "duration", "trim_start", "trim_end", "fade_in", "fade_out",
  "animationInDuration", "animationOutDuration", "mediaFillChangeTimesSeconds",
  "mediaFillSecondsPerImage", "mediaFillCrossfadeSeconds",
  "cameraRevealHoldSeconds", "cameraRevealResolveStartSeconds", "cameraRevealResolveDurationSeconds",
  "source_duration_seconds", "source_start_seconds", "source_end_seconds",
  "duration_seconds",
  "remove_opening_seconds", "punch_in_source_seconds",
  "source_start_seconds", "source_end_seconds",
]);

/** Field groups drive the derived verb. Order matters: the first match with a hit wins. */
const ACTION_GROUPS: Array<{ action: string; fields: ReadonlySet<string> }> = [
  { action: "Group presenter", fields: new Set(["compound_clip_id", "compound_clip_label", "compound_preview"]) },
  { action: "Arrange visual", fields: new Set(["semanticLayout", "crowdLayout"]) },
  { action: "Reword caption", fields: new Set(["text"]) },
  { action: "Retime", fields: new Set(["timeline_start", "duration", "trim_start", "trim_end", "playback_rate"]) },
  { action: "Ripple opening and punch in", fields: new Set(["remove_opening_seconds", "punch_in_source_seconds", "punch_in_scale", "punch_in_offset_x", "punch_in_offset_y"]) },
  { action: "Remove source range and ripple", fields: new Set(["source_start_seconds", "source_end_seconds", "removed_segment_id"]) },
  { action: "Move lane", fields: new Set(["lane_key", "lane_index"]) },
  { action: "Rebalance audio", fields: new Set(["volume", "fade_in", "fade_out"]) },
  { action: "Regrade", fields: new Set(["grade_exposure_ev", "grade_contrast", "grade_highlights", "grade_shadows", "grade_whites", "grade_blacks",  "grade_saturation", "grade_temperature", "grade_tint", "grade_hue_degrees"]) },
  { action: "Reframe", fields: new Set(["media_scale", "media_offset_x", "media_offset_y", "mask_inset", "mask_feather", "mask_corner_radius", "media_opacity"]) },
  { action: "Restyle caption", fields: new Set(["positionPreset", "offsetX", "offsetY", "absX", "absY", "maxWidth", "textAlign", "fontPreset", "fontSizePx", "textColor", "styleVariant", "benchmarkRotationDeg", "benchmarkStackLayout", "timingMode", "activeWordColor", "inverseMaskMotion", "inverseMaskDriftXPercent", "inverseMaskDriftYPercent", "inverseMaskSweepIntensity", "inverseMaskSweepCycles", "mediaFillUrls", "mediaFillChangeTimesSeconds", "mediaFillSecondsPerImage", "mediaFillCrossfadeSeconds", "mediaFillFirstTransition", "mediaFillTransition", "mediaFillSlideDirection", "mediaFillTransitionBlur", "mediaFillScale", "mediaFillPanPercent", "cameraRevealFontWeight", "cameraRevealTypographySizing", "cameraRevealMediaFit", "cameraRevealHoldSeconds", "cameraRevealStartSeconds", "cameraRevealDurationSeconds", "cameraRevealStartDistance", "cameraRevealEndDistance", "cameraRevealTargetX", "cameraRevealTargetY", "cameraRevealFov", "cameraRevealEasing", "cameraRevealShutterAngle", "cameraRevealBlurSamples", "cameraRevealExtrusionDepth", "cameraRevealBevelWidth", "cameraRevealEdgeLight", "cameraRevealEdgeColor", "cameraRevealWallMirror", "cameraRevealOrbitX", "cameraRevealOrbitY", "cameraRevealResolveMode", "cameraRevealResolveStartSeconds", "cameraRevealResolveDurationSeconds", "cameraRevealResolveBackgroundColor", "cameraRevealResolveTextColor"]) },
  { action: "Change animation", fields: new Set(["animationIn", "animationOut", "animationInDuration", "animationOutDuration", "media_scale_keyframes", "media_offset_y_keyframes"]) },
  { action: "Change surface", fields: new Set(["surfaceMode"]) },
];

function fieldLabel(field: string): string {
  if (field === "surface_track") return "Surface attachment";
  if (field === "compound_clip_id") return "Compound group";
  if (field === "compound_clip_label") return "Compound name";
  if (field === "compound_preview") return "Continuous preview";
  if (field === "recast") return "People";
  if (field === "factor") return "Speed";
  if (field === "ripple_lane_keys") return "Lanes that move together";
  if (field === "max_affected_elements") return "Most clips moved";
  return PATCH_FIELD_LABELS[field] ?? PROP_FIELD_LABELS[field] ?? field;
}

type TransitionKeyframeKey = keyof typeof transitionKeyframesSchema.shape;
type TransitionKeyframeDisplay = { label: string; suffix: string; scale?: number };

/** Review-row label and unit for every animatable `transition_keyframes` track.
 * Typed as a complete record so adding a schema key without a label fails typecheck. */
export const TRANSITION_KEYFRAME_DISPLAY: Record<TransitionKeyframeKey, TransitionKeyframeDisplay> = {
  sticker_outline_width: { label: "Paper outline", suffix: "px" },
  subject_flash: { label: "Flash", suffix: "%", scale: 100 },
  subject_glow: { label: "Glow", suffix: "%", scale: 100 },
  subject_glow_radius: { label: "Glow spread", suffix: "px" },
  media_offset_x: { label: "Horizontal position", suffix: " half-widths" },
  media_offset_y: { label: "Vertical position", suffix: " half-heights" },
  media_scale: { label: "Zoom", suffix: "×" },
  media_opacity: { label: "Opacity", suffix: "%", scale: 100 },
  iris_radius: { label: "Oval", suffix: "%", scale: 100 },
  iris_feather: { label: "Feather", suffix: "%", scale: 100 },
  mask_corner_radius: { label: "Crop roundness", suffix: "%", scale: 200 },
  zoom_blur: { label: "Edge blur", suffix: "px" },
  transition_blur: { label: "Blur", suffix: "px" },
  directional_blur_x: { label: "Horizontal blur", suffix: "px" },
  directional_blur_y: { label: "Vertical blur", suffix: "px" },
  gradient_map_amount: { label: "Color map", suffix: "%", scale: 100 },
  gradient_map_contrast: { label: "Color map contrast", suffix: "×" },
  glitch_amount: { label: "Glitch", suffix: "%", scale: 100 },
  glitch_shift: { label: "Glitch shift", suffix: "%", scale: 100 },
  glitch_rgb_split: { label: "Glitch color split", suffix: "px" },
  glitch_smear: { label: "Glitch smear", suffix: "%", scale: 100 },
  film_grain: { label: "Film grain", suffix: "%", scale: 100 },
  film_halation: { label: "Halation", suffix: "%", scale: 100 },
  film_bloom: { label: "Bloom", suffix: "%", scale: 100 },
  film_vignette: { label: "Vignette", suffix: "%", scale: 100 },
  film_split_tone: { label: "Split tone", suffix: "%", scale: 100 },
};

/** Unknown keys keep their own name rather than borrowing another track's label. */
export function transitionKeyframeDisplay(key: string): TransitionKeyframeDisplay {
  return Object.hasOwn(TRANSITION_KEYFRAME_DISPLAY, key)
    ? TRANSITION_KEYFRAME_DISPLAY[key as TransitionKeyframeKey]
    : { label: key.replace(/_/g, " "), suffix: "" };
}

export function formatFieldValue(field: string, value: unknown): string {
  if (field === "surface_track") return value ? "Text follows tracked surface" : "Detached";
  if (field === "transition_keyframes" && value && typeof value === "object") {
    return Object.entries(value).map(([key, points]) => {
      if (!Array.isArray(points)) return "";
      const { label, scale = 1, suffix } = transitionKeyframeDisplay(key);
      return `${label}: ${points.map(point => `${Number(point.t).toFixed(2)}s ${Number((Number(point.v) * scale).toFixed(2))}${suffix}`).join(" → ")}`;
    }).filter(Boolean).join("; ");
  }
  if (field === "semanticLayout" && value && typeof value === "object") {
    const layout = value as { slot?: unknown; size?: unknown; packing?: unknown; motion?: { from_slot?: unknown; to_slot?: unknown } };
    const base = `${String(layout.slot ?? "unknown")} · ${String(layout.size ?? "unknown")}`
      + (layout.packing ? ` · ${String(layout.packing)}` : "");
    return layout.motion
      ? `${base} · ${String(layout.motion.from_slot)} → ${String(layout.motion.to_slot)}`
      : base;
  }
  if (field === "crowdLayout" && value && typeof value === "object") {
    const layout = value as { region?: unknown; index?: unknown; total?: unknown };
    return `${String(layout.region ?? "crowd")} · ${Number(layout.index) + 1}/${String(layout.total ?? "?")}`;
  }
  if (field === "playback_speed_steps" && Array.isArray(value)) {
    const rates = value.map(point => Number(point.v)).filter(Number.isFinite);
    return rates.length ? `${Math.min(...rates).toFixed(1)}–${Math.max(...rates).toFixed(1)}×` : "None";
  }
  if (field === "media_scale_keyframes" && Array.isArray(value)) {
    return value.map((point) => `${Number(point.t).toFixed(3)}s: ${Number(point.v).toFixed(2)}× (${point.ease ?? "linear"})`).join(" → ");
  }
  if (field === "media_offset_y_keyframes" && Array.isArray(value)) {
    return value.map((point) => `${Number(point.t).toFixed(3)}s: Y ${Number(point.v).toFixed(3)} (${point.ease ?? "linear"})`).join(" → ");
  }
  if (value === undefined) return "—";
  if (value === null) return field === "shape_fill" || field === "shape_stroke" ? "none" : "default";
  if (field === "shape_kind") return SHAPE_KIND_LABELS[value as ShapeKind] ?? String(value);
  if (field === "camera_id") return value ? "Follows the camera" : "No camera";
  if (field === "compound_clip_id") return "Linked group";
  if (field === "compound_preview" && typeof value === "object") {
    const receipt = value as { duration: number; members: unknown[]; width?: number; height?: number };
    const size = receipt.width && receipt.height ? ` · ${receipt.width}×${receipt.height} proxy` : "";
    return `${receipt.members.length} sections · ${receipt.duration.toFixed(2)}s${size} · originals preserved`;
  }
  if (field === "ripple_lane_keys" && Array.isArray(value)) {
    return value.map((key) => {
      const visual = /^visual_(\d+)$/.exec(String(key));
      if (visual) return `Visual ${Number(visual[1]) + 1}`;
      const captions = /^captions_(\d+)$/.exec(String(key));
      if (captions) return Number(captions[1]) === 0 ? "Captions" : `Captions ${Number(captions[1]) + 1}`;
      return String(key);
    }).join(", ");
  }
  if (field === "keyframes" && value && typeof value === "object" && !Array.isArray(value)) {
    // One "first → last" per animated setting, in the setting's own display units.
    return Object.entries(value as Record<string, Array<{ t: number; v: unknown }>>)
      .filter(([, points]) => Array.isArray(points) && points.length > 0)
      .map(([key, points]) => key === "shape_contours" ? `Points: ${points.length} shapes over ${points[points.length - 1].t.toFixed(2)}s` : `${key === "media_opacity" ? "Opacity" : fieldLabel(key)} ${formatFieldValue(key, points[0].v)} → ${formatFieldValue(key, points[points.length - 1].v)} over ${points[points.length - 1].t.toFixed(2)}s`)
      .join("; ") || "none";
  }
  if (field === "shape_morph" && Array.isArray(value)) {
    return `${value.length} outlines over ${Number((value.at(-1) as { t?: number }).t ?? 0).toFixed(2)}s`;
  }
  if (field === "shape_contours" && Array.isArray(value)) {
    const points = value.reduce((sum, contour) => sum + ((contour as { points?: unknown[] }).points?.length ?? 0), 0);
    return `${value.length} ${value.length === 1 ? "outline" : "outlines"}, ${points} points`;
  }
  if (field === "wordStyles" && Array.isArray(value)) {
    // Word N counts from 1 for people; the stored index counts from 0.
    return value.map((entry) => {
      const style = entry as { index?: number; color?: string; background?: string };
      const looks = [style.color ? `colour ${style.color}` : "", style.background ? `highlight ${style.background}` : ""].filter(Boolean).join(", ");
      return `word ${(style.index ?? 0) + 1}: ${looks}`;
    }).join("; ") || "none";
  }
  if (Array.isArray(value)) return `[${value.map((entry) => formatFieldValue(field, entry)).join(", ")}]`;
  if (typeof value === "number") {
    if (SECONDS_FIELDS.has(field)) return `${value.toFixed(2)}s`;
    if (field === "playback_rate") return `${value.toFixed(2)}×`;
    if (field === "rotationDeg" || field === "media_rotation" || field === "shape_arc_start" || field === "shape_arc_end") return `${Number(value.toFixed(1))}°`;
    if (field === "shape_width" || field === "shape_height" || field === "shape_corner_radius" || field === "shape_draw"
      || field === "shape_taper" || field === "shape_wobble" || field === "shape_star_depth" || field === "shape_arrow_head" || field === "shape_arrow_shaft") return `${Number((value * 100).toFixed(1))}%`;
    if (field === "shape_stroke_width") return `${Number(value.toFixed(1))}px`;
    if (Number.isInteger(value)) return String(value);
    return String(Number(value.toFixed(4)));
  }
  if (typeof value === "boolean") return value ? "on" : "off";
  if (value && typeof value === "object" && field === "video_stabilization") {
    const receipt = value as Record<string, unknown>;
    const mode = receipt.mode === "lock_camera" ? "Lock camera" : "Smooth motion";
    const strength = typeof receipt.strength_percent === "number"
      ? ` · ${receipt.strength_percent}%`
      : "";
    return `${mode}${strength}`;
  }
  if (value && typeof value === "object" && field === "follows_visual") {
    const offset = (value as Record<string, unknown>).offset_seconds;
    return typeof offset === "number" ? `Moves with its picture · starts ${offset.toFixed(2)}s in` : "Moves with its picture";
  }
  if (field === "follows_visual" && value === null) return "Unlinked";
  if (value && typeof value === "object" && field === "place") {
    const place = value as Record<string, unknown>;
    const gap = typeof place.gap === "number" ? ` · ${Math.round(place.gap * 1000) / 10}% gap` : "";
    return `${PLACE_SIDE_WORDS[String(place.side)] ?? "Beside"} what it belongs to${gap}`;
  }
  if (field === "place" && value === null) return "Placed on its own";
  if (value && typeof value === "object" && field === "voice_enhancement") {
    const receipt = value as Record<string, unknown>;
    const strength = typeof receipt.strength_percent === "number"
      ? `${receipt.strength_percent}% strength`
      : "Enhanced speech";
    const limit = typeof receipt.attenuation_limit_db === "number"
      ? ` · up to ${receipt.attenuation_limit_db} dB background reduction`
      : "";
    return `${strength}${limit}`;
  }
  if (value && typeof value === "object" && field === "speech_sync") {
    const sync = value as Record<string, unknown>;
    const start = typeof sync.source_start_seconds === "number" ? sync.source_start_seconds.toFixed(2) : "?";
    const end = typeof sync.source_end_seconds === "number" ? sync.source_end_seconds.toFixed(2) : "?";
    return `Bound to speech source ${start}–${end}s`;
  }
  const text = String(value);
  if (field === "text") return text.length > 80 ? `${JSON.stringify(text.slice(0, 77))}…` : JSON.stringify(text);
  if (field === "rough_beat_kind" && text === "loading") return "Loading progress";
  return text;
}

/** A short, stable name for an element: caption text, else media filename, else the type. */
export function elementLabel(element: TimelineElement): string {
  const props = (element.props ?? {}) as Record<string, unknown>;
  if (element.type === "caption_text" && typeof props.text === "string" && props.text.trim()) {
    const text = props.text.trim().replace(/\s+/g, " ");
    return text.length > 40 ? `${text.slice(0, 39)}…` : text;
  }
  if (typeof props.title === "string" && props.title.trim()) return props.title.trim();
  // A prepared clip plays a package file ("render.mov"); name it by the file the creator imported.
  const source = typeof props.archival_source_url === "string" && props.archival_source_url ? props.archival_source_url : element.source_url;
  if (typeof source === "string" && source) {
    const base = path.basename(source.split("?")[0] ?? "");
    if (base) return decodeURIComponent(base);
  }
  return element.type;
}

function changedFields(operation: EditorAgentOperation): Array<{ field: string; after: unknown; target: ProposalFieldChange["target"] }> {
  return [
    ...Object.entries(operation.create_audio ?? {}).map(([field, after]) => ({ field, after, target: "create_audio" as const })),
    ...Object.entries(operation.create_visual ?? {})
      .filter(([field]) => field !== "editorial_role" && field !== "source_manifest_id")
      .map(([field, after]) => ({ field, after, target: "create_visual" as const })),
    ...Object.entries(operation.create_text ?? {})
      .map(([field, after]) => ({ field, after, target: "create_text" as const })),
    ...Object.entries(operation.create_shape ?? {})
      .map(([field, after]) => ({ field, after, target: "create_shape" as const })),
    ...(operation.remove_visual
      ? [{ field: "remove_visual", after: operation.remove_visual.reason, target: "remove_visual" as const }]
      : []),
    ...(operation.remove_text
      ? [{ field: "remove_text", after: operation.remove_text.reason, target: "remove_text" as const }]
      : []),
    ...(operation.create_transition
      ? Object.entries(operation.create_transition).flatMap(([field, after]) => field === "params" && after ? Object.entries(after).map(([key, value]) => ({field: `params.${key}`, after: value, target: "create_transition" as const})) : [{ field, after, target: "create_transition" as const }])
      : []),
    ...(operation.set_lane_order
      ? [{ field: "lane_order_keys", after: operation.set_lane_order.lane_order_keys, target: "set_lane_order" as const }]
      : []),
    ...(operation.set_lane_order?.muted_lane_keys
      ? [{ field: "muted_lane_keys", after: operation.set_lane_order.muted_lane_keys, target: "set_lane_order" as const }]
      : []),
    ...Object.entries(operation.set_output_format ?? {}).map(([field, after]) => ({ field, after, target: "set_output_format" as const })),
    ...Object.entries(operation.opening_sequence_edit ?? {}).map(([field, after]) => ({ field, after, target: "opening_sequence_edit" as const })),
    ...Object.entries(operation.source_range_cut ?? {}).map(([field, after]) => ({ field, after, target: "source_range_cut" as const })),
    ...Object.entries(operation.speed_change ?? {}).map(([field, after]) => ({ field, after, target: "speed_change" as const })),
    ...Object.entries(operation.source_range_restore ?? {}).map(([field, after]) => ({ field, after, target: "source_range_restore" as const })),
    ...Object.entries(operation.set_preview_audio_source ?? {}).map(([field, after]) => ({ field, after, target: "set_preview_audio_source" as const })),
    ...(operation.use_video_stabilization
      ? [{ field: "video_stabilization", after: operation.use_video_stabilization, target: "use_video_stabilization" as const }]
      : []),
    ...(operation.use_recast
      ? [{ field: "recast", after: `Recast with ${operation.use_recast.model}`, target: "use_recast" as const }]
      : []),
    ...(operation.use_voice_enhancement
      ? [{ field: "voice_enhancement", after: operation.use_voice_enhancement, target: "use_voice_enhancement" as const }]
      : []),
    ...(operation.reattach_original_audio
      ? [{ field: "audio_authority", after: "Original embedded audio", target: "reattach_original_audio" as const }]
      : []),
    ...Object.entries(operation.sync_speech_visual ?? {})
      .map(([field, after]) => ({ field, after, target: "sync_speech_visual" as const })),
    ...(operation.replace_captions
      ? [{
          field: "caption_track",
          after: `${operation.replace_captions.cues.length} force-aligned cues`,
          target: "replace_captions" as const,
        }, ...(["offsetX", "offsetY", "font_size_px", "singleWordFlipSeconds"] as const)
          .filter(field => typeof operation.replace_captions![field] === "number")
          .map(field => ({ field, after: operation.replace_captions![field], target: "replace_captions" as const }))]
      : []),
    ...Object.entries(operation.patch ?? {}).map(([field, after]) => ({ field, after, target: "patch" as const })),
    ...Object.entries(operation.props ?? {})
      .filter(([field]) => field !== "mask_window_foreground_id")
      .map(([field, after]) => ({ field, after, target: "props" as const })),
    ...(operation.clear_patch ?? []).map((field) => ({ field, after: null, target: "clear_patch" as const })),
    ...(operation.clear_props ?? []).map((field) => ({ field, after: null, target: "clear_props" as const })),
  ];
}

function currentValue(element: TimelineElement, field: string): unknown {
  if (field === "transition_keyframes") {
    const keyframes = element.props?.keyframes as Record<string, unknown> | undefined;
    return keyframes ? Object.fromEntries(Object.entries(keyframes).filter(([key]) => ["iris_radius", "iris_feather", "zoom_blur", "transition_blur", "directional_blur_x", "directional_blur_y", "media_scale", "media_opacity", "media_offset_x"].includes(key))) : undefined;
  }
  if (field === "semanticLayout") return (element.props as Record<string, unknown> | null)?.semantic_layout;
  if (field === "crowdLayout") return (element.props as Record<string, unknown> | null)?.crowd_layout;
  if (field === "playback_speed_steps") return (element.props?.keyframes as Record<string, unknown> | undefined)?.playback_rate;
  if (field === "media_scale_keyframes") return (element.props?.keyframes as Record<string, unknown> | undefined)?.media_scale;
  if (field in element) return (element as unknown as Record<string, unknown>)[field];
  return ((element.props ?? {}) as Record<string, unknown>)[field];
}

function deriveAction(fields: readonly string[]): string {
  const present = new Set(fields);
  const matched = ACTION_GROUPS.filter((group) => [...group.fields].some((field) => present.has(field)));
  if (matched.length === 1) return matched[0]!.action;
  if (matched.length === 0) return "Edit clip";
  // Several groups touched at once — name the edit generically rather than
  // picking one group and understating the rest.
  return "Multiple edits";
}

export function reviewOperation(timeline: TimelineFile, operation: EditorAgentOperation, operationIndex = 0, rowsById?: ReadonlyMap<string, TimelineElement>): ProposalReviewRow {
  const element = rowsById ? rowsById.get(operation.element_id) : findElement(timeline, operation.element_id);
  const create = operation.create_audio;
  const createVisual = operation.create_visual;
  const createText = operation.create_text;
  const createShape = operation.create_shape;
  const removeVisual = operation.remove_visual;
  const removeText = operation.remove_text;
  const setLaneOrder = operation.set_lane_order;
  const setOutputFormat = operation.set_output_format;
  const openingSequenceEdit = operation.opening_sequence_edit;
  const sourceRangeCut = operation.source_range_cut;
  const sourceRangeRestore = operation.source_range_restore;
  const speedChange = operation.speed_change;
  const setPreviewAudioSource = operation.set_preview_audio_source;
  const useVideoStabilization = operation.use_video_stabilization;
  const useVoiceEnhancement = operation.use_voice_enhancement;
  const reattachOriginalAudio = operation.reattach_original_audio;
  const syncSpeechVisual = operation.sync_speech_visual;
  const replaceCaptions = operation.replace_captions;
  const fields = changedFields(operation);
  const changes: ProposalFieldChange[] = fields.map(({ field, after, target }) => ({
    field,
    label: (target === "create_transition" ? transitionControl(field)?.label : undefined) ?? fieldLabel(field),
    before: element ? formatFieldValue(field, currentValue(element, field)) : "—",
    after: formatFieldValue(field, after),
    target,
    operation_index: operationIndex,
    after_value: after,
  }));
  return {
    element_id: operation.element_id,
    element_label: operation.create_transition ? "Between shots" : setLaneOrder
      ? "Timeline visual lanes"
      : setOutputFormat
        ? "Video output"
      : element
      ? elementLabel(element)
      : create?.title
        ?? createVisual?.title
        ?? createText?.title
        ?? createText?.text
        ?? createShape?.title
        ?? (createShape ? SHAPE_KIND_LABELS[createShape.shape_kind] : undefined)
        ?? (replaceCaptions ? "Speech captions" : undefined)
        ?? ((create?.source_url ?? createVisual?.source_url)
          ? decodeURIComponent(path.basename((create?.source_url ?? createVisual?.source_url)!.split("?")[0] ?? ""))
          : "(missing element)"),
    element_type: element?.type ?? create?.type ?? createVisual?.type ?? (createText ? "caption_text" : createShape ? "shape" : replaceCaptions ? "caption_text" : setOutputFormat ? "output_format" : "unknown"),
    action: operation.create_transition ? (operation.create_transition.params?.motion === "smear" ? "Add motion-smear transition" : `Add ${operation.create_transition.type} transition`) : create
      ? "Add audio clip"
      : createVisual
        ? createVisual.has_alpha
          ? "Add transparent visual layer"
          : "Add visual layer"
        : createText
          ? "Add graphic text"
        : createShape
          ? "Add shape"
        : removeVisual
          ? "Remove visual layer"
        : removeText
          ? "Remove graphic text"
        : setLaneOrder
          ? setLaneOrder.muted_lane_keys ? "Set lane visibility and mute state" : "Register visual lanes"
        : setOutputFormat
          ? "Change video format"
        : openingSequenceEdit
          ? "Ripple opening and punch in"
        : sourceRangeCut
          ? "Remove source range and ripple"
        : sourceRangeRestore
          ? "Restore source range and ripple"
        : speedChange
          ? speedChange.factor >= 1 ? "Speed up from here on" : "Slow down from here on"
        : setPreviewAudioSource
          ? "Repair preview audio"
          : useVideoStabilization
            ? "Use stabilized video"
            : useVoiceEnhancement
              ? "Enhance and level voice"
            : reattachOriginalAudio
              ? "Reset voice to original"
              : syncSpeechVisual
                ? "Synchronize talking-head picture"
              : replaceCaptions
                ? "Replace speech captions"
            : deriveAction(fields.map((entry) => entry.field)),
    changes,
    ...(operation.rationale ? { rationale: operation.rationale } : {}),
  };
}

/** One frame at the project rate (frame-rate-scope.ts). */
const frame = () => 1 / currentFrameRate();
// The editor's per-operation caps for moves and trims (validateOperationAgainstTimeline).
const TIMING_DELTA_CAP: Record<string, number> = { timeline_start: 60, trim_start: 30, trim_end: 30 };

/** Speech-bound pictures and the speech they follow keep one clock; their timing is never a lone dial. */
function speechBound(timeline: TimelineFile, element: TimelineElement | undefined) {
  if (!element) return false;
  const binding = (element.props as Record<string, unknown> | null)?.speech_sync_binding;
  return binding != null || timeline.elements.some(candidate => candidate.removed_at == null
    && ((candidate.props as Record<string, unknown> | null)?.speech_sync_binding as { source_element_id?: unknown } | undefined)?.source_element_id === element.id);
}

/**
 * Ranges for timing dials: never into a neighbouring clip on the lane (clips this option also
 * changes are ignored), never past the source or below one frame, and within the editor's caps.
 */
function timingRange(timeline: TimelineFile, option: EditorAgentOption, operationIndex: number, field: string): { min: number; max: number } | undefined {
  const operation = option.operations[operationIndex];
  const element = timeline.elements.find(candidate => candidate.id === operation?.element_id);
  const patch = (operation?.patch ?? {}) as Record<string, number | undefined>;
  if (!element || patch[field] === undefined) return undefined;
  const rate = patch.playback_rate ?? (element.playback_rate > 0 ? element.playback_rate : 1);
  const start = patch.timeline_start ?? element.timeline_start, duration = patch.duration ?? element.duration;
  const lane = (operation?.patch as { lane_key?: string } | undefined)?.lane_key ?? element.lane_key;
  const changed = new Set(option.operations.map(item => item.element_id));
  const others = timeline.elements.filter(candidate => candidate.removed_at == null && candidate.lane_key === lane && !changed.has(candidate.id));
  const previousEnd = Math.max(0, ...others.filter(candidate => candidate.timeline_start < start).map(candidate => candidate.timeline_start + candidate.duration));
  const nextStart = Math.min(Infinity, ...others.filter(candidate => candidate.timeline_start >= start).map(candidate => candidate.timeline_start));
  const sourceDuration = Number((element.props as Record<string, unknown> | null)?.source_duration_seconds);
  const value = patch[field]!;
  let min: number, max: number;
  if (field === "timeline_start") { min = previousEnd; max = Number.isFinite(nextStart) ? nextStart - duration : value + TIMING_DELTA_CAP.timeline_start; }
  else if (field === "trim_start") {
    // With a proposed length the head trim reshapes the clip: extending it earlier moves the
    // start back when the start is proposed, or pushes the end forward when it is not.
    const coupled = patch.duration !== undefined;
    const room = patch.timeline_start !== undefined ? start - previousEnd : Number.isFinite(nextStart) ? nextStart - start - duration : Infinity;
    min = coupled ? value - room * rate : 0;
    max = coupled ? value + (duration - frame()) * rate : Number.isFinite(sourceDuration) ? sourceDuration - (patch.trim_end ?? element.trim_end ?? 0) - duration * rate : value + TIMING_DELTA_CAP.trim_start;
  } else {
    const coupled = patch.duration !== undefined;
    min = coupled && Number.isFinite(nextStart) ? value - (nextStart - start - duration) * rate : 0;
    max = coupled ? value + (duration - frame()) * rate : Number.isFinite(sourceDuration) ? sourceDuration - (patch.trim_start ?? element.trim_start) - duration * rate : value + TIMING_DELTA_CAP.trim_end;
  }
  const original = Number((element as unknown as Record<string, unknown>)[field] ?? 0);
  min = Math.max(0, min, original - TIMING_DELTA_CAP[field]!);
  max = Math.min(max, original + TIMING_DELTA_CAP[field]!);
  return max > min ? { min: Math.round(min * 1e3) / 1e3, max: Math.round(max * 1e3) / 1e3 } : undefined;
}

/**
 * Source in/out for a clip this option adds: a longer source window makes a longer clip, so it stops
 * where the clip would run into the next clip on its lane (existing ones, or others this option adds).
 */
function createdSourceRange(timeline: TimelineFile, option: EditorAgentOption, operationIndex: number, field: "source_start_seconds" | "source_end_seconds"): { min: number; max: number } | undefined {
  const operation = option.operations[operationIndex];
  const created = (operation?.create_visual ?? operation?.create_audio) as Record<string, unknown> | undefined;
  if (!created) return undefined;
  const start = Number(created.source_start_seconds), end = Number(created.source_end_seconds), at = Number(created.timeline_start);
  if (![start, end, at].every(Number.isFinite) || end <= start) return undefined;
  const rate = typeof created.playback_rate === "number" && created.playback_rate > 0 ? created.playback_rate : 1;
  const lane = created.lane_key;
  const changed = new Set(option.operations.map(item => item.element_id));
  const starts = [
    ...timeline.elements.filter(candidate => candidate.removed_at == null && candidate.lane_key === lane && !changed.has(candidate.id)).map(candidate => candidate.timeline_start),
    ...option.operations.flatMap((item, index) => {
      const other = (item.create_visual ?? item.create_audio) as Record<string, unknown> | undefined;
      return other && index !== operationIndex && other.lane_key === lane && typeof other.timeline_start === "number" ? [other.timeline_start] : [];
    }),
  ].filter(value => value >= at + 1e-6);
  const nextStart = Math.min(Infinity, ...starts);
  if (!Number.isFinite(nextStart)) return undefined;
  const room = (nextStart - at) * rate;
  const sourceDuration = Number(created.source_duration_seconds);
  return field === "source_end_seconds"
    ? { min: 0, max: Math.round(Math.min(start + room, Number.isFinite(sourceDuration) ? sourceDuration : Infinity) * 1e3) / 1e3 }
    : { min: Math.round(Math.max(0, end - room) * 1e3) / 1e3, max: Math.round(end * 1e3) / 1e3 };
}

/**
 * The render a proposed graphic takes over from: the clip's current source for a swap, or a
 * clip of the same graphic this option removes at the same place and time. The card compares
 * the two value sets to decide which dials the change is about.
 */
function replacedMotionSource(timeline: TimelineFile, option: EditorAgentOption, operationIndex: number, compositionId: string): string | undefined {
  const operation = option.operations[operationIndex]!;
  const sameGraphic = (url: string | undefined) => Boolean(url) && motionSubjectFromSourceUrl(url!)?.id === compositionId;
  if (operation.patch?.source_url && !operation.create_visual) {
    const current = timeline.elements.find(element => element.id === operation.element_id)?.source_url ?? undefined;
    return sameGraphic(current) ? current : undefined;
  }
  const created = operation.create_visual;
  if (!created) return undefined;
  // Same place within half a frame at any project rate.
  const frame = 1 / 120;
  return option.operations.flatMap(candidate => {
    if (!candidate.remove_visual) return [];
    const removed = timeline.elements.find(element => element.id === candidate.element_id && !element.removed_at);
    return removed && sameGraphic(removed.source_url ?? undefined) && removed.lane_key === created.lane_key
      && Math.abs(removed.timeline_start - created.timeline_start) < frame ? [removed.source_url!] : [];
  })[0];
}

/** Each id's first row, as `elements.find` would return it; one index serves every lookup of a large talk. */
function firstRowsById(elements: readonly TimelineElement[]) {
  const byId = new Map<string, TimelineElement>();
  for (const element of elements) if (!byId.has(element.id)) byId.set(element.id, element);
  return byId;
}

export function reviewOption(timeline: TimelineFile, option: EditorAgentOption): ProposalOptionReview {
  const rowsById = firstRowsById(timeline.elements);
  const rows = option.operations.map((operation, index) => reviewOperation(timeline, operation, index, rowsById));
  const motionItems: ProposalMotionItem[] = option.operations.flatMap((operation, operation_index) => {
    const source_url = operation.create_visual?.source_url ?? operation.create_audio?.source_url ?? operation.patch?.source_url;
    const subject = source_url ? motionSubjectFromSourceUrl(source_url) : null;
    const target = operation.patch?.source_url && !operation.create_visual ? "patch" as const : "create_visual" as const;
    if (!subject || !source_url) return [];
    const replaces_source_url = replacedMotionSource(timeline, option, operation_index, subject.id);
    return [{ ...subject, operation_index, source_url, target, ...(replaces_source_url ? { replaces_source_url } : {}) }];
  // The same render placed twice is one set of dials; different renders (four section cards) each keep theirs.
  }).filter((subject, index, all) => all.findIndex((other) => other.kind === subject.kind && other.id === subject.id && other.source_url === subject.source_url) === index);
  const synchronizedForegroundIds = new Set(option.operations.flatMap(operation => {
    const window = maskWindowValues(operation.props);
    return window ? [window.mask_window_foreground_id] : [];
  }));
  const clipCount = new Set(rows.map((row) => row.element_id)).size;
  const fieldCount = rows.reduce((sum, row) => sum + row.changes.length, 0);
  for (const [index, control] of (option.timing_controls ?? []).entries()) {
    const groupIndex = option.timing_controls?.findIndex(group => group.member_control_ids?.includes(control.id)) ?? -1;
    const group = groupIndex >= 0 ? { operation_index: groupIndex, offset_seconds: control.spacing_seconds - option.timing_controls![groupIndex].spacing_seconds } : undefined;
    rows.push({
    element_id: `timing:${control.id}`, element_label: control.label ?? "Reveal sequence", element_type: "effect", action: control.kind === "hold" ? "Adjust hold" : "Adjust spacing",
    changes: [{ field: "spacing_seconds", label: control.label ?? "Spacing", before: "—", after: `${control.spacing_seconds}s`, after_value: control.spacing_seconds, target: "timing_control", operation_index: index, control_unit: control.display_unit, control_group: group, control_range: { min: control.min_spacing_seconds ?? (control.kind === "hold" ? 0 : 0.2), max: control.max_spacing_seconds ?? (control.kind === "hold" ? 3 : 1.2) } }],
  });
  }
  // Each block's settings are its dials; the clips it compiles are described above but tuned only through them.
  for (const [index, block] of (option.blocks ?? []).entries()) {
    rows.push({ element_id: `block:${block.block_id}`, element_label: blockLabel(block), element_type: "effect", action: "Adjust", changes: blockReviewChanges(block, index) });
  }
  const adjustmentRows = rows.map(row => {
    const operationIndex = row.changes[0]?.operation_index ?? -1;
    const rowElement = rowsById.get(row.element_id);
    const compiledFromBlock = !row.element_id.startsWith("block:") && !row.element_id.startsWith("timing:") && Boolean(option.operations[operationIndex]?.block_ref);
    const changes = row.changes.filter(change => !compiledFromBlock && isSupportedProposalControl(change.target, change.field, change.after_value)
      && !isCameraSizeField(option.operations[change.operation_index], change.target, change.field)
      // Trim dials own a trimmed clip's start and length; speech-bound clock fields are never lone dials.
      && !(change.target === "patch" && timingFieldOwnedByTrim(option.operations[change.operation_index], change.field))
      && !(change.target === "patch" && (TIMING_PATCH_FIELDS.has(change.field) || change.field === "duration") && speechBound(timeline, rowElement)))
      .map(change => {
        if ((change.target === "create_visual" || change.target === "create_audio") && (change.field === "source_start_seconds" || change.field === "source_end_seconds")) {
          const range = createdSourceRange(timeline, option, change.operation_index, change.field);
          return range ? {...change, control_range: range} : {...change};
        }
        if (change.target !== "patch" || !TIMING_PATCH_FIELDS.has(change.field)) return {...change};
        const range = timingRange(timeline, option, change.operation_index, change.field);
        return range ? {...change, control_range: range} : {...change};
      })
      // A timing dial with no room to move (boxed in by neighbours) is not offered.
      .filter(change => change.target !== "patch" || !TIMING_PATCH_FIELDS.has(change.field) || change.control_range);
    const peakProfile = option.operations[operationIndex]?.props?.playback_ramp_profile as {hold_end_source_seconds?: number} | undefined;
    if (typeof peakProfile?.hold_end_source_seconds === "number") {
      for (const change of changes) {
        if (change.field === "playback_ramp_slow_end_source_seconds") change.control_range = {min: 0.03, max: peakProfile.hold_end_source_seconds};
        if (change.field === "playback_ramp_slow_start_source_seconds") change.control_range = {min: 0.03, max: peakProfile.hold_end_source_seconds - 0.03};
      }
    }
    // Structured values (crop edges, a keyframed zoom) are tuned through derived dials.
    const derivedOperation = row.element_id.startsWith("timing:") || row.element_id.startsWith("block:") ? undefined : option.operations[operationIndex];
    const existing = rowElement;
    for (const target of ["props", "create_visual", "create_text", "create_shape"] as const) {
      const values = derivedOperation?.[target] as Record<string, unknown> | undefined;
      // A relation's side and alignment are choices; the gap is a number below.
      for (const field of derivedChoiceFields(target, values)) {
        const value = derivedChoiceValue(values, field)!;
        const before = target === "props" ? derivedChoiceValue(existing?.props as Record<string, unknown> | undefined, field) : undefined;
        changes.push({ field, label: PLACE_CHOICE_LABELS[field] ?? field, before: before ?? "—", after: value, after_value: value, target, operation_index: operationIndex });
      }
      for (const field of derivedProposalFields(target, values)) {
        const value = derivedFieldValue(values, field)!;
        const before = target === "props" ? derivedFieldValue(existing?.props as Record<string, unknown> | undefined, field) ?? DERIVED_FIELD_IDENTITY[field] : undefined;
        const spec = PROPOSAL_TUNABLE_FIELDS[field];
        const show = (number: number) => `${Math.round((spec.toDisplay?.(number) ?? number) * 100) / 100}${spec.suffix}`;
        const clipSeconds = target === "create_visual" ? values?.duration as number | undefined : derivedOperation?.patch?.duration ?? existing?.duration;
        const timingRange = zoomTimingRange(values, field, clipSeconds);
        changes.push({ field, label: spec.label ?? field, before: before === undefined ? "—" : show(before), after: show(value), after_value: value, target, operation_index: operationIndex,
          // A zoom dial stays on its side of fitted size so the motion never flattens away.
          ...(field === "media_scale_peak" ? { control_range: value > 1 ? { min: 1.01, max: spec.max } : { min: spec.min, max: 0.99 } } : {}),
          ...(timingRange ? { control_range: timingRange } : {}) });
      }
    }
    const transition = row.element_id.startsWith("timing:") || row.element_id.startsWith("block:") ? undefined : option.operations[operationIndex]?.create_transition;
    if (transition) for (const control of availableTransitionFields(transition)) {
      if (changes.some(change => change.field === control.field)) continue;
      const value = availableTransitionFieldValue(transition, control.field);
      changes.push({field: control.field, label: control.label, before: "—", after: String(value), after_value: value, target: "create_transition", operation_index: operationIndex, implicit_default: true});
    }
    if (transition) {
      const duration = changes.find(change => change.field === "duration_seconds");
      const linked = option.review_controls?.find(ref => ref.operation_index === operationIndex && ref.target === "create_transition" && ref.field === "duration_seconds")?.linked_operation_indices ?? [];
      const maxima = [operationIndex, ...linked].map(index => {
        const target = option.operations[index]?.create_transition;
        const from = timeline.elements.find(element => element.id === target?.from_element_id);
        const to = timeline.elements.find(element => element.id === target?.to_element_id);
        return from && to ? getTransitionMaxDurationSeconds(from, to) : undefined;
      });
      if (duration && maxima.every((max): max is number => max !== undefined && max > 0)) duration.control_range = { min: transitionControl("duration_seconds")!.min, max: Math.min(...maxima) };
    }
    // Explicitly locked fields stay outside the tuning scope, regardless of tier.
    const cutAt = transition ? timeline.elements.find(element => element.id === transition.to_element_id)?.timeline_start : undefined;
    const elementLabel = cutAt === undefined ? row.element_label : `Transition at ${cutAt.toFixed(2)}s`;
    return {...row, element_label: elementLabel, changes: changes.filter(change => !(synchronizedForegroundIds.has(row.element_id) && ["volume", "source_start_seconds", "source_end_seconds", "playback_rate"].includes(change.field))
      && !option.preserve_fields?.some(preserved => preserved.element_id === row.element_id
      && preserved.fields.includes(change.target === "props" ? `props.${change.field}` : change.field))
      && !option.timing_controls?.some(control => control.bindings.some(binding => binding.operation_index === change.operation_index && binding.target === change.target && binding.field === change.field)))};
  }).filter(row => row.changes.length);
  return {
    adjustment_rows: adjustmentRows,
    option_id: option.id,
    ...(option.review_controls ? { review_controls: option.review_controls } : {}),
    ...(option.preview_range ? { preview_range: option.preview_range } : {}),
    ...(option.motion_main_controls ? { motion_main_controls: option.motion_main_controls } : {}),
    label: option.label,
    recommended: option.recommended,
    summary: option.summary,
    requested_mutations: option.requested_mutations,
    impact: `${clipCount} ${clipCount === 1 ? "clip" : "clips"} · ${fieldCount} ${fieldCount === 1 ? "field" : "fields"}`,
    ...(motionItems.length > 0 ? { motion_items: motionItems } : {}),
    ...(() => { const edits = speechEdits(timeline, option); return edits.length ? { speech_edits: edits } : {}; })(),
    rows,
  };
}

/** Card words for a relation placement and its choice dials. */
const PLACE_SIDE_WORDS: Record<string, string> = { below: "Below", above: "Above", left: "Left of", right: "Right of", inside: "Inside" };
const PLACE_CHOICE_LABELS: Record<string, string> = { place_side: "Side", place_align: "Align", place_vertical_align: "Vertical", motion_from_side: "Comes in from" };

export function reviewProposal(timeline: TimelineFile, proposal: EditorAgentProposal): ProposalOptionReview[] {
  return proposal.options.map((option) => reviewOption(timeline, option));
}
