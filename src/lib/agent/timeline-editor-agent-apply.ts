import { reconcileSoundLinks, refreshMotionTiming, SOUND_LINK_PROP } from "../timeline/sound-link";
import { changedFromUnmutated, splitSingleWordCaptions } from "@/lib/timeline/caption-word-elements";
import { motionTimingForSource } from "@/lib/local-store/motion-timing";
import { isRecordedMotionRender, synthSoundDurationForSource } from "@/lib/local-store/synth-sounds";
import { motionSubjectFromSourceUrl } from "@/lib/hyperframes/motion-media";
import { TIMELINE_ASPECT_RATIO_VALUES } from "@/lib/aspect-ratios";
import { requantizeTimelineForFrameRate } from "@/lib/timeline/frame-rate-change";
import { gridMatteMaskSchema } from "../timeline/grid-matte";
import { subjectWindowBindingIssue, subjectWindowMaskSchema } from "../timeline/subject-window";
import { internalGridMatteDirectory } from "../local-store/internal-masks";
import { compileProposalSubjectEntrance } from "./proposal-subject-entrance";
import { compileProposalSpeedRamp } from "./proposal-speed-ramp";
import { assertPreservedFields, type PreservedFields } from "./proposal-preservation";
import { assertHoldControlSources, proposalTimingControlSchema, validateTimingControls } from "./proposal-timing-controls";
import { spiralGroupSchema } from "@/lib/timeline/spiral-group";
import { surfaceTrackSchema } from "@/lib/timeline/surface-track";
import { surfaceRegionSchema } from "@/lib/timeline/surface-placement";
import { validateSurfaceTrackSource } from "@/lib/local-store/surface-track";
import { deriveGravityDrop } from "@/lib/timeline/gravity-drop";
import { letterFallFinishSeconds, type LetterFallOrder } from "@/lib/timeline/letter-fall";
import { resolveLetterFallFollowers } from "@/lib/timeline/letter-fall-followers";
import { TIMING_PATCH_FIELDS, derivedChoiceFields, derivedProposalFields, isCameraSizeField, isSupportedProposalControl, proposalAvailableFieldValue, timingFieldOwnedByTrim } from "./proposal-controls";
import { timelineTransitionCreateSchema } from "@/lib/timeline/contracts";
import { buildTimelineTransitionLayout, validateTransitionAdjacency } from "@/lib/timeline/transitions";
import { transitionKeyframesSchema } from "@/lib/timeline/transition-effects";
import { MAX_SHAPE_CONTOURS, MAX_SHAPE_POINTS, SHAPE_ANIMATION_PRESETS, SHAPE_KINDS, SHAPE_LIMITS, encodeShapePoints, normalizeShapeContours, type ShapeContour } from "@/lib/timeline/shapes";
import { fitContourSetsToUnitBox, parseSvgPath } from "@/lib/timeline/svg-path";
import { CAMERA_ZOOM, isCamera } from "@/lib/timeline/camera";
import { matchOutlines } from "@/lib/timeline/shape-point-edit";
import { edgeAuraSchema } from "../timeline/edge-aura";
import { feedbackIdsSchema } from "../timeline/editing-feedback";
import { assertFeedbackReferences } from "../local-store/editing-feedback";
import { withFeedbackAttribution } from "../local-store/edit-attribution";
import { createHash } from "node:crypto";
import { preparedPlacement } from "@/lib/local-store/media-preparation";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { z } from "zod";
import { maskWindowPoints, maskWindowValues } from "./proposal-mask-window";
import { resolveOutlineLayers } from "@/lib/timeline/outline-layer";
import { getSpeedSourceWindow, isPlaybackReversed, sourceTimeToTimelineTime, speedStepDuration, timelineTimeToSourceTime } from "@/lib/timeline/speed-steps";
import { readKeyframeMap, writeKeyframeMap } from "@/lib/timeline/keyframes";

import { applyPreparedElementPatch as applyElementPatch } from "@/lib/local-store/cutout-effects";
import { reconcileCaptionFollowers } from "@/lib/local-store/caption-followers";
import { bindGeneratedCaption, captionAudioSourceId, captionFollowsAudio } from "@/lib/timeline/caption-audio-link";
import { customCutoutByRelativePath } from "@/lib/local-store/custom-cutouts";
import { assertCompoundPreview } from "@/lib/local-store/compound-preview";
import {
  isSafeProjectId,
  projectMediaDir,
  projectSourceManifestPath,
  projectTimelinePath,
} from "@/lib/local-store/paths";
import {
  activeElements,
  activeTransitions,
  captureProjectHistorySnapshot,
  findElement,
  withElementIdIndex,
  newRowTimestamps,
  readMetadata,
  readTimeline,
  withProjectLock,
  writeMetadata,
  writeTimeline,
  type TimelineFile, readProjectFrameRate } from "@/lib/local-store/store";
import type { TimelineAspectRatio, TimelineElement } from "@/components/studio/timeline/types";
import { getCompositionDimensions } from "@/lib/render/composition-adapters";
import { PLACE_PROP, PLACEMENT_ALIGNS, PLACEMENT_GAP, PLACEMENT_SIDES, canFollowRelation, placementRelation, reconcilePlacementRelations } from "@/lib/timeline/placement-relation";
import { syncTransitionsForElements } from "@/lib/local-store/transition-sync";
import { withPreparedPictureSize } from "@/lib/local-store/prepared-picture-size";
import { MAX_ABS_GAIN } from "@/lib/timeline/audio-gain";
import { ANIMATION_PRESETS } from "@/lib/timeline/animation-presets";
import {
  CAPTION_ABS_POSITION_REACH,
  CAPTION_FONT_PRESETS,
  CAPTION_POSITION_PRESETS,
  CAPTION_STYLE_VARIANTS,
  SPEECH_CAPTIONS_HIDE_PUNCTUATION,
} from "@/lib/timeline/captions";
import { TRANSITION_CONTROLS, transitionNumberSchema } from "@/lib/timeline/transition-controls";
import { EFFECT_CONTROLS } from "@/lib/timeline/effect-controls";
import {
  isVisualElementType,
  quantizeVisualFrameSpan,
  quantizeVisualTrimValue,
} from "@/lib/timeline/frame-quantization";
import { currentFrameRate, withFrameRate } from "@/lib/timeline/frame-rate-scope";
import {
  CHROMA_KEY_AMOUNT_FIELDS,
  CHROMA_KEY_COLOR_FIELD,
  commitChromaKeyAmountAtTime,
  commitChromaKeyColor,
  hasChromaKeyData,
} from "@/lib/timeline/chroma-key";
import {
  COLOR_GRADE_ADVANCED_FIELDS,
  COLOR_GRADE_FIELDS,
  COLOR_GRADE_KEYFRAME_FIELDS,
  LEGACY_COLOR_GRADE_FIELDS,
  isLegacyColorGrade,
  commitAdvancedColorGradeFieldAtTime,
  commitColorGradeFieldAtTime,
  type AdvancedColorGradeField,
  type ColorGradeField,
} from "@/lib/timeline/color-grade";
import {
  readMediaEffectProps,
  readMediaTransformProps,
} from "@/lib/timeline/media-transform";
import {
  captionTextMatchesWordTimings,
  normalizeWordTimings,
  validateWordTimings,
} from "@/lib/timeline/active-word-captions";
import { assertLaneCompatibleWithElementType } from "@/lib/timeline/lanes";
import { applyMediaMotionPreset } from "@/lib/timeline/motion-presets";
import {
  SAFE_GRID_SLOTS,
  SEMANTIC_VISUAL_PACKINGS,
  SEMANTIC_VISUAL_SIZES,
  resolveSemanticCrowdLayout,
  resolveSemanticVisualLayout,
} from "@/lib/timeline/semantic-layout";
import { splitElementAtomic } from "@/lib/local-store/split";
import { speechClockDependentIds } from "@/lib/timeline/speech-sync-contract";
import { assertGpuWriteAdmissible } from "@/lib/timeline/gpu-write-admission";
import { hydrateCaptionFill } from "@/lib/local-store/timeline-payload";
import { readPreviewSettings } from "@/lib/local-store/preview-settings";
import { BlockSettingError } from "./proposal-block-kit";
import { OPERATIONS_BLOCK_KIND, blockInstanceSchema, compileBlock, validateBlockRanges, type BlockInstance } from "./proposal-blocks";
import {
  readVolumeEnvelopePoints,
  retargetVolumeEnvelope,
  writeVolumeEnvelopePatch,
} from "@/lib/timeline/volume-envelope";

/**
 * Schema 2 groups operations into named OPTIONS so one proposal can offer the
 * human a choice (A/B/C) with a recommendation. Schema 1 — a flat `operations`
 * array — is still accepted on the wire and normalized to a single option, so
 * the shipped workflow and its fixtures keep working unchanged.
 */
export const EDITOR_AGENT_PROPOSAL_VERSION = 2;
export const EDITOR_AGENT_SUPPORTED_PROPOSAL_VERSIONS = [1, 2] as const;
// A complete voice-timed walkthrough spine can legitimately replace ten or
// more source clips in one atomic, human-previewed option. Keep the cap bounded
// while allowing that coherent operation to remain all-or-nothing.
// A tracked seven-layer paper stack can require one atomic source/timing edit
// across several contour beats; keep that coordinated preview under one cap.
export const EDITOR_AGENT_MAX_MUTATIONS = 512;
/** Caps are per-option: only one option is ever applied. */
export const EDITOR_AGENT_MAX_OPTIONS = 12;
export const SOLE_OPTION_ID = "only";

const projectIdSchema = z.string().min(1).max(128).refine(isSafeProjectId, "Invalid project id");
const finite = z.number().finite();
const unit = finite.min(0).max(1);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const agentEffectControls = EFFECT_CONTROLS.filter((control) => control.agentWritable);
const AGENT_COLOR_GRADE_FIELDS = new Set<string>([...COLOR_GRADE_FIELDS, ...COLOR_GRADE_ADVANCED_FIELDS]);
const AGENT_CHROMA_KEY_FIELDS = new Set<string>([CHROMA_KEY_COLOR_FIELD, ...CHROMA_KEY_AMOUNT_FIELDS]);
/** Agent-facing meaning of a registered effect control, from the registry that drives the editor. */
function effectControlDescription(control: (typeof agentEffectControls)[number]) {
  const range = control.kind === "number" ? ` Range ${control.min} to ${control.max}; ${control.identity} leaves the picture unchanged.`
    : control.kind === "tuple" ? ` Each value ${control.min} to ${control.max}; ${JSON.stringify(control.identity)} leaves it unchanged.`
    : control.kind === "list" ? ` ${JSON.stringify(control.identity)} leaves the picture unchanged.`
    : control.kind === "enum" ? ` One of ${control.values.join(", ")}; ${control.identity} is the default.`
    : control.kind === "color" ? " A #RRGGBB hex colour, for example #00FF00." : "";
  const animate = control.keyframeable ? ` Animate it with transition_keyframes.${control.prop}.` : "";
  const hint = (control as { agentHint?: string }).agentHint;
  return `${control.label} (editor Properties).${hint ? ` ${hint}` : ""}${range}${animate}`;
}
/** A graph or wheel value: whole points, each entry inside the bounds for its position. */
function listControlSchema(control: Extract<(typeof agentEffectControls)[number], { kind: "list" }>) {
  const { lengths, itemBounds } = control;
  return z.array(finite).min(lengths.min).max(lengths.max).superRefine((values, context) => {
    if (values.length % lengths.multiple) context.addIssue({ code: "custom", message: `${control.prop} needs a multiple of ${lengths.multiple} numbers` });
    values.forEach((value, index) => {
      const [min, max] = itemBounds[index % itemBounds.length]!;
      if (value < min || value > max) context.addIssue({ code: "custom", path: [index], message: `${control.prop}[${index}] must be ${min} to ${max}` });
    });
  });
}
const effectPropShape = Object.fromEntries(agentEffectControls.map((control) => [
  control.prop,
  (control.kind === "enum"
    ? z.enum(control.values)
    : control.kind === "color"
    ? hexColor
    : control.kind === "tuple"
      ? z.array(finite.min(control.min).max(control.max)).length(4)
      : control.kind === "list"
        ? listControlSchema(control)
        : finite.min(control.min).max(control.max)).describe(effectControlDescription(control)).optional(),
]));

const editorAgentSemanticVisualLayoutSchema = z.object({
  frame_model: z.enum(["canvas", "bottom_weighted_subject"]).optional(),
  slot: z.enum(SAFE_GRID_SLOTS),
  size: z.enum(SEMANTIC_VISUAL_SIZES),
  packing: z.enum(SEMANTIC_VISUAL_PACKINGS).optional(),
  motion: z.object({
    from_slot: z.enum(SAFE_GRID_SLOTS),
    to_slot: z.enum(SAFE_GRID_SLOTS),
    start_seconds: finite.min(0).max(600),
    duration_seconds: finite.gt(0).max(10),
    ease: z.enum(["linear", "easeIn", "easeOut", "easeInOut"]),
  }).strict().optional(),
}).strict();

const editorAgentSemanticCrowdLayoutSchema = z.object({
  region: z.enum(["upper_left_fan", "upper_center_cluster", "reels_row"]),
  index: z.number().int().min(0).max(31),
  total: z.number().int().min(2).max(32),
}).strict().refine((layout) => layout.index < layout.total, {
  message: "crowd index must be smaller than total",
  path: ["index"],
});

const editorAgentCaptionGroupLayoutSchema = z.object({
  kind: z.literal("paragraph_panel"),
  packing: z.literal("reels_safe").optional(),
  row: z.number().int().min(0).max(11),
  rows: z.number().int().min(1).max(12),
}).strict().refine((layout) => layout.row < layout.rows, {
  message: "paragraph panel row must be smaller than rows",
  path: ["row"],
});

const editorAgentBenchmarkStackLayoutSchema = z.object({
  kind: z.enum(["upper_canvas_pile", "upper_canvas_cover", "featured_benchmark_stack"]),
  index: z.number().int().min(0).max(31),
  total: z.number().int().min(2).max(32),
}).strict().refine((layout) => layout.index < layout.total, {
  message: "benchmark pile index must be smaller than total",
  path: ["index"],
});

/** Animated crop edges, [top, right, bottom, left] over clip-relative time; shared by props patches and new visuals. */
const maskInsetKeyframesSchema = z.array(z.object({
  t: finite.min(0).max(600).describe("Clip-relative seconds; the first point is 0."),
  v: z.tuple([finite.min(0).max(0.95), finite.min(0).max(0.95), finite.min(0).max(0.95), finite.min(0).max(0.95)])
    .describe("Crop edges [top, right, bottom, left] as fractions of the frame; [0,0,0,0] shows it all."),
  ease: z.enum(["linear", "easeIn", "easeOut", "easeInOut", "hold"]).describe("Easing from this point to the next.").optional(),
}).strict()).min(2).max(120).refine(
  (points) => points[0]?.t === 0 && points.every((point, index) =>
    (index === 0 || point.t > points[index - 1]!.t)
    && point.v[0] + point.v[2] < 1
    && point.v[1] + point.v[3] < 1),
  "Mask keyframes must start at zero, increase, and retain a visible opening",
);

/**
 * Creative props are deliberately enumerated. Every field here is represented
 * by an inspector control; renderer-only/internal props must never be exposed
 * by this agent command.
 */
/** Graphic text: colour or highlight box for chosen words, by word position (0 = first). Draws in every timing mode. */
const captionWordStylesSchema = z.array(z.object({
  index: z.number().int().min(0).max(499).describe("Word position in the text, 0 for the first word."),
  color: hexColor.describe("Word colour.").optional(),
  background: hexColor.describe("Highlight box behind the word.").optional(),
}).strict().refine((style) => style.color !== undefined || style.background !== undefined, "A word style needs a color or a background"))
  .max(100)
  .describe("Word looks: colour a word, or put a highlight box behind it, for example the brand word of a title. Words are counted from 0.");

const shapeHandle = z.tuple([finite.min(-4).max(4), finite.min(-4).max(4)]);
const shapeContoursSchema = z.array(z.object({
  closed: z.boolean().describe("true joins the last point back to the first."),
  points: z.array(z.object({
    x: finite.min(-2).max(2).describe("Across the shape's box, -0.5 left edge to 0.5 right edge."),
    y: finite.min(-2).max(2).describe("Down the shape's box, -0.5 top edge to 0.5 bottom edge."),
    in: shapeHandle.describe("Curve handle toward the previous point, as an offset from this point.").optional(),
    out: shapeHandle.describe("Curve handle toward the next point, as an offset from this point.").optional(),
  }).strict()).min(2).max(MAX_SHAPE_POINTS).describe("Points in drawing order."),
}).strict()).min(1).max(MAX_SHAPE_CONTOURS).describe("For path: freeform contours as points with optional curve handles; an inner contour cuts a hole. Prefer shape_path_d when you have SVG path data.");

/** Morph keys for an existing path shape (props.shape_morph). */
const shapeMorphSchema = z.array(z.object({
  t: finite.min(0).max(600).describe("Clip-relative seconds; times increase."),
  v: z.string().min(1).max(20000).describe("The outline at t as SVG path data; every key is drawn in the same coordinates, and they are fitted into the shape's box together."),
  ease: z.enum(["linear", "easeIn", "easeOut", "easeInOut", "hold"]).describe("How the outline travels to the next key.").optional(),
}).strict()).min(2).max(60)
  .describe("Morph an existing path shape: replaces its point animation with these outlines over time; its outline becomes the first key's. Outlines may differ in points and contours; they are matched automatically.");

/** Placement by relation (timeline/placement-relation.ts): name the anchors and the side; code computes the coordinates. */
const placeSchema = z.object({
  relative_to: z.union([z.string().uuid(), z.array(z.string().uuid()).min(1).max(32)])
    .describe("The anchor: an element id, or the ids of a group (for example every piece of a drawing from svg_pieces_compile's label_slot). Each must already be on the timeline or created earlier in this option."),
  side: z.enum(PLACEMENT_SIDES).describe("Where this sits against the anchor's box: below, above, left, right, or inside it."),
  gap: finite.min(PLACEMENT_GAP.min).max(PLACEMENT_GAP.max).default(PLACEMENT_GAP.default).describe("Space between this and the anchor as a share of the canvas height; 0.02 is a snug label gap. Inside, it is the inset from the anchor's edges."),
  align: z.enum(PLACEMENT_ALIGNS).default("center").describe("Along the anchor's edge: start (left or top edges line up), center, or end (right or bottom edges line up). Inside, it is horizontal: start left, end right."),
  vertical_align: z.enum(PLACEMENT_ALIGNS).describe("Inside only: start sits against the anchor's top edge, end against its bottom; omitted centres it. Inside + align start + vertical_align start is the top-left corner.").optional(),
}).strict().describe("Place this relative to other elements instead of giving coordinates: code computes the position, keeps it there when the anchor moves or is tuned, and shows it through the anchor's camera. The default for text and drawn shapes; do not combine with absX/absY, media_offset_x/y or a position preset.");

/** Look of a shape element; shared by create_shape and props patches. */
const shapePropShape = {
  shape_fill: hexColor.nullable().describe("Fill colour, or null for no fill (a ring or an outline box).").optional(),
  shape_stroke: hexColor.nullable().describe("Outline colour, or null for no outline.").optional(),
  shape_stroke_width: finite.min(0).max(200).describe("Outline width in pixels at 1080 canvas height.").optional(),
  shape_corner_radius: finite.min(0).max(0.5).describe("Rectangle corner rounding as a fraction of the shorter side; 0.5 makes a pill.").optional(),
  shape_sides: z.number().int().min(SHAPE_LIMITS.shape_sides.min).max(SHAPE_LIMITS.shape_sides.max).describe("Polygon corners or star points.").optional(),
  shape_star_depth: finite.min(SHAPE_LIMITS.shape_star_depth.min).max(SHAPE_LIMITS.shape_star_depth.max).describe("Star inner radius as a share of the outer one; lower is spikier.").optional(),
  shape_arc_start: finite.min(SHAPE_LIMITS.shape_arc_start.min).max(SHAPE_LIMITS.shape_arc_start.max).describe("Arc start in degrees clockwise from the top.").optional(),
  shape_arc_end: finite.min(SHAPE_LIMITS.shape_arc_end.min).max(SHAPE_LIMITS.shape_arc_end.max).describe("Arc end in degrees clockwise from the top; 360 more than the start is a full circle.").optional(),
  shape_arrow_head: finite.min(SHAPE_LIMITS.shape_arrow_head.min).max(SHAPE_LIMITS.shape_arrow_head.max).describe("Arrow head length as a share of the width.").optional(),
  shape_arrow_shaft: finite.min(SHAPE_LIMITS.shape_arrow_shaft.min).max(SHAPE_LIMITS.shape_arrow_shaft.max).describe("Arrow shaft thickness as a share of the height.").optional(),
  shape_contours: shapeContoursSchema.optional(),
  shape_draw: finite.min(0).max(1).describe("How much of the outline is drawn, 0 to 1, tracing each contour from its first point in order: the top for preset shapes, clockwise; the left end for a line. Keyframe it to draw the outline on.").optional(),
  shape_taper: finite.min(0).max(1).describe("Hand-drawn outline: how much each line thins to a point at its ends, 0 (even line) to 1. Any taper or wobble draws the outline as pen ink.").optional(),
  shape_wobble: finite.min(0).max(1).describe("Hand-drawn outline: how far each line drifts and swells, 0 (ruled) to 1 (loose sketch). About 0.3 reads as a confident pen.").optional(),
  shape_seed: finite.int().min(0).max(9999).describe("Hand-drawn outline: a whole number picking a different but repeatable wobble. Give sibling pieces different seeds.").optional(),
  camera_id: z.string().uuid().nullable().describe("The camera this shape is seen through: the element_id of a shape_kind camera (an existing one, or a create_shape earlier in this option). Its push-ins and pans then move this shape with every other follower; null detaches it.").optional(),
  media_rotation: finite.min(SHAPE_LIMITS.media_rotation.min).max(SHAPE_LIMITS.media_rotation.max).describe("Clockwise turn in degrees.").optional(),
  place: placeSchema.optional(),
};

export const editorAgentPropsSchema = z.object({
  title: z.string().trim().min(1).max(240).describe("The clip's name on the timeline, in plain words.").optional(),
  surface_track: surfaceTrackSchema.nullable().optional(),
  surface_region: surfaceRegionSchema.describe("The part of the tracked surface a picture covers, [left, top, right, bottom] as fractions of the surface.").optional(),
  subject_effect_state: z.enum(["enabled", "disabled", "removed"]).optional(),
  subject_glow_enabled: z.boolean().optional(),
  subject_flash_state: z.enum(["enabled", "disabled", "removed"]).optional(),
  subject_glow_state: z.enum(["enabled", "disabled", "removed"]).optional(),
  gravity_drop_start_seconds: finite.min(0).max(600).optional(),
  gravity_drop_seconds: finite.min(0.2).max(2).optional(),
  letter_fall_start_seconds: finite.min(0).max(600).optional(),
  letter_fall_seconds: finite.min(0.2).max(2).optional(),
  letter_fall_stagger_seconds: finite.min(0).max(0.15).optional(),
  letter_fall_order: z.enum(["outside_in", "left_to_right", "right_to_left"]).optional(),
  gravity_drop_after_text_id: z.string().uuid().optional(),
  playback_ramp_start_rate: finite.min(0.5).max(4).optional(),
  playback_ramp_end_rate: finite.min(0.5).max(4).optional(),
  playback_ramp_fast_rate: finite.min(0.5).max(4).optional(),
  playback_ramp_top_rate: finite.min(0.25).max(2).optional(),
  playback_ramp_slow_start_source_seconds: finite.min(0).max(600).describe("Source-clock second where the slowdown begins, measured in the original media, not timeline time (editor label: Slowdown starts \u00b7 source).").optional(),
  playback_ramp_slow_end_source_seconds: finite.min(0).max(600).optional(),
  playback_ramp_bar_close_start_seconds: finite.min(0.03).max(600).optional(),
  playback_ramp_bar_close_duration_seconds: finite.min(0.03).max(600).optional(),
  playback_ramp_bar_reopen_start_seconds: finite.min(0.03).max(600).optional(),
  playback_ramp_bar_reopen_duration_seconds: finite.min(0.03).max(600).optional(),
  playback_ramp_profile: z.object({
    origin_source_seconds: finite.min(0),
    origin_timeline_seconds: finite.min(0),
    hold_end_source_seconds: finite.min(0),
    recovery_end_source_seconds: finite.min(0),
    mask_depth: z.tuple([finite.min(0).max(.95), finite.min(0).max(.95), finite.min(0).max(.95), finite.min(0).max(.95)]).optional(),
    mask_source_keyframes: z.array(z.object({
      t: finite.min(0),
      v: z.tuple([finite.min(0).max(.95), finite.min(0).max(.95), finite.min(0).max(.95), finite.min(0).max(.95)]),
      ease: z.enum(["linear", "easeIn", "easeOut", "easeInOut", "hold"]).optional(),
    }).strict()).min(2).max(120).optional(),
  }).strict().optional(),
  playback_ramp_source_duration_seconds: finite.positive().optional(),
  /** Plays the used source window from its end back to its start at the clip's constant speed. */
  playback_reverse: z.boolean().describe("Reverse a video clip: true plays its used source from the end back to the start (picture and sound) at its constant speed; false plays forward. Not combinable with speed steps or ramps.").optional(),
  playback_speed_steps: z.array(z.object({
    source_t: finite.min(0), v: finite.min(0.25).max(4),
  }).strict()).min(1).max(120).refine(points => points.every((p, i) => i === 0 || p.source_t > points[i - 1]!.source_t),
    "Speed steps must have increasing source times").describe("Constant-speed sections on the source clock: each {source_t, v} plays at v\u00d7 (0.25\u20134) from source second source_t until the next step; source_t must increase and lie inside the used source window. The clip duration must equal the resulting playback length. Not combinable with playback_reverse.").optional(),
  transition_keyframes: transitionKeyframesSchema.describe("Animate visual properties inside the clip: each key (for example media_scale, media_opacity, iris_radius) holds [{t, v, ease}] where t is clip-relative seconds within the clip duration. Captions support media_offset_x only.").optional(),
  edge_aura: edgeAuraSchema.optional(),
  contour_model: z.literal("rg-distance-1024-v1").optional(),
  contour_radius_start: finite.min(0).max(900).optional(),
  contour_radius_end: finite.min(0).max(900).optional(),
  contour_duration: finite.min(0).max(600).optional(),
  contour_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  compound_clip_id: z.string().uuid().nullable().optional(),
  compound_clip_label: z.string().min(1).max(120).nullable().optional(),
  compound_preview: z.object({
    id: z.string().uuid(), source_url: z.string().startsWith("/api/projects/"), sha256: z.string().regex(/^[a-f0-9]{64}$/),
    duration: finite.gt(0), frame_count: z.number().int().positive(),
    width: z.number().int().positive().optional(), height: z.number().int().positive().optional(),
    proxy_profile: z.literal("presenter-alpha-640-edge-v1").optional(),
    members: z.array(z.object({ id: z.string().uuid(), signature: z.string().max(30000) }).strict()).min(2).max(32),
  }).strict().nullable().optional(),
  grid_matte_enabled: z.boolean().optional(),
  grid_matte_mask: gridMatteMaskSchema.nullable().optional(),
  grid_matte_cell_size: finite.min(0).max(360).optional(),
  grid_matte_coverage: finite.min(0).max(4).optional(),
  grid_matte_line_opacity: finite.min(0).max(1).optional(),
  grid_matte_line_width: finite.min(0).max(8).optional(),
  subject_window_parent_id: z.string().uuid().nullable().describe("Subject window: the video clip whose moving cutout this clip shows through. The window follows that clip's own timing and placement. Set with subject_window_mask; null removes the window.").optional(),
  subject_window_mask: subjectWindowMaskSchema.nullable().describe("Subject window: the prepared cutout mask of the subject clip's footage (cutout_status grid_matte_mask). It must cover every source second the subject clip shows.").optional(),
  subject_window_enabled: z.boolean().describe("Subject window on (true) or switched off (false) without losing its subject and settings.").optional(),
  outline_width: z.number().finite().min(0).max(64).optional(),
  outline_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sticker_outline: z.boolean().optional(),
  sticker_outline_width: finite.min(0).max(32).optional(),
  sticker_outline_color: hexColor.optional(),
  semanticLayout: editorAgentSemanticVisualLayoutSchema.describe("Named placement on the safe grid: a slot (for example lower_right) and a size class; code derives position and scale. Prefer this over media_offset_x/y or absX/absY unless exact placement is requested.").optional(),
  crowdLayout: editorAgentSemanticCrowdLayoutSchema.optional(),
  groupLayout: editorAgentCaptionGroupLayoutSchema.optional(),
  benchmarkStackLayout: editorAgentBenchmarkStackLayoutSchema.optional(),
  absX: finite.min(CAPTION_ABS_POSITION_REACH.min).max(CAPTION_ABS_POSITION_REACH.max).optional(),
  absY: finite.min(CAPTION_ABS_POSITION_REACH.min).max(CAPTION_ABS_POSITION_REACH.max).optional(),
  volume_envelope: z.array(z.object({
    time_seconds: finite.min(0).max(3_600),
    volume: finite.min(0).max(4),
  }).strict()).min(2).max(120).refine(
    (points) => points[0]?.time_seconds === 0
      && points.every((point, index) => index === 0 || point.time_seconds > points[index - 1]!.time_seconds),
    "Volume envelopes must start at zero and have strictly increasing times",
  ).optional().describe("Volume automation within the clip: points {time_seconds, volume} in clip-relative seconds starting at 0 with strictly increasing times; volume is a linear gain (1 = unchanged, 0 = silent, up to 4). Use for fades and ducking inside one clip."),
  media_scale_keyframes: z.array(z.object({
    t: finite.min(0).max(600),
    v: finite.min(0.1).max(3),
    ease: z.enum(["linear", "easeIn", "easeOut", "easeInOut", "hold"]).optional(),
  }).strict()).min(2).max(120).refine(
    (points) => points[0]?.t === 0 && points.every((point, index) => index === 0 || point.t > points[index - 1]!.t),
    "Zoom keyframes must start at zero and have strictly increasing times",
  ).optional(),
  media_offset_y_keyframes: z.array(z.object({
    t: finite.min(0).max(600),
    v: finite.min(-2).max(2),
    ease: z.enum(["linear", "easeIn", "easeOut", "easeInOut", "hold"]).optional(),
  }).strict()).min(2).max(120).refine(
    (points) => points[0]?.t === 0 && points.every((point, index) => index === 0 || point.t > points[index - 1]!.t),
    "Vertical-position keyframes must start at zero and have strictly increasing times",
  ).optional(),
  mask_inset_keyframes: maskInsetKeyframesSchema.optional(),
  mask_window_close_start_seconds: finite.min(0.03).max(600).optional(),
  mask_window_close_duration_seconds: finite.min(0.03).max(600).optional(),
  mask_window_reopen_start_seconds: finite.min(0.03).max(600).optional(),
  mask_window_reopen_duration_seconds: finite.min(0.03).max(600).optional(),
  mask_window_top_percent: finite.min(0.1).max(0.45).optional(),
  mask_window_bottom_percent: finite.min(0.1).max(0.5).optional(),
  mask_window_foreground_id: z.string().uuid().optional(),
  text: z.string().max(4_000).optional(),
  positionPreset: z.enum(CAPTION_POSITION_PRESETS).optional(),
  positionNudgeY: z.enum(["none", "slightly_up", "slightly_down"]).optional(),
  maxWidth: finite.min(0.25).max(1).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  fontPreset: z.enum(CAPTION_FONT_PRESETS as [string, ...string[]]).optional(),
  fontSizePx: finite.min(18).max(300).optional(),
  handwritingWeight: finite.min(0).max(4).optional(),
  fontSizing: z.enum(["fit", "fixed"]).optional(),
  textColor: hexColor.optional(),
  styleVariant: z.enum(CAPTION_STYLE_VARIANTS).optional(),
  surfaceMode: z.enum(["none", "wall"]).optional(),
  surfacePerspectivePx: finite.min(400).max(3000).optional(),
  surfaceDepthPx: finite.min(-400).max(200).optional(),
  surfaceRotateXDeg: finite.min(-30).max(30).optional(),
  surfaceRotateYDeg: finite.min(-30).max(30).optional(),
  surfaceRotateZDeg: finite.min(-30).max(30).optional(),
  surfaceSkewXDeg: finite.min(-20).max(20).optional(),
  surfaceSkewYDeg: finite.min(-20).max(20).optional(),
  surfaceOpacity: finite.min(0.2).max(1).optional(),
  surfaceBlurPx: finite.min(0).max(3).optional(),
  surfaceBlendMode: z.enum(["normal", "multiply"]).optional(),
  benchmarkRotationDeg: finite.min(-8).max(8).optional(),
  rotationDeg: finite.min(-180).max(180).describe("Rotation (editor Properties). Turns the whole text block in degrees, clockwise; added to any entrance or exit spin. Range -180 to 180; 0 leaves it upright.").optional(),
  wordStyles: captionWordStylesSchema.optional(),
  timingMode: z.enum(["phrase", "active_word", "single_word"]).describe("Caption reveal: phrase shows the whole cue, active_word highlights the word being spoken, single_word shows one word at a time. Word modes need word timings. A caption always holds exactly the words it shows: a multi-word single_word caption is saved as one caption per word.").optional(),
  hidePunctuation: z.boolean().describe("Speech captions: draw the words without punctuation (commas, full stops, quotes). Captions made from speech hide it by default; set false only when the creator explicitly asks for punctuation. The caption text stays the aligned words; the creator switches it in Captions → Punctuation.").optional(),
  caption_follow_audio: z.boolean().describe("When true, the caption stays bound to its linked speech clip and retimes with that clip's trims and speed changes.").optional(),
  wordTimings: z.array(z.object({
    text: z.string().trim().min(1).max(200),
    start: finite.min(0).max(600),
    end: finite.gt(0).max(600),
    color: hexColor.optional(),
    scale: finite.min(0.5).max(3).optional(),
    rowBreakBefore: z.boolean().optional(),
    rowBreakAfter: z.boolean().optional(),
  }).strict()).min(1).max(100).optional(),
  activeWordColor: hexColor.optional(),
  inverseMaskMotion: z.enum(["none", "drift"]).optional(),
  inverseMaskDriftXPercent: finite.min(-12).max(12).optional(),
  inverseMaskDriftYPercent: finite.min(-12).max(12).optional(),
  inverseMaskSweepIntensity: finite.min(0).max(1).optional(),
  inverseMaskSweepCycles: finite.min(0.25).max(4).optional(),
  mediaFillScene: z.object({ startSeconds: finite.min(0), x: finite, y: finite, width: finite.gt(0), height: finite.gt(0) }).strict().nullable().optional(),
  mediaFillVideoUrl: z.string().max(2_048).optional(),
  mediaFillVideoPlaybackRate: finite.min(0.1).max(4).optional(),
  mediaFillVideoPreviewUrl: z.string().max(2_048).optional(),
  mediaFillUrls: z.array(z.string().min(1).max(2_048)).max(24).optional(),
  mediaFillChangeTimesSeconds: z.array(finite.min(0).max(600)).max(240).optional(),
  mediaFillSecondsPerImage: finite.min(0.15).max(10).optional(),
  mediaFillCrossfadeSeconds: finite.min(0).max(1).optional(),
  mediaFillFirstTransition: z.enum(["inherit", "cut"]).optional(),
  mediaFillTransition: z.enum(["cut", "dissolve", "slide"]).optional(),
  mediaFillSlideDirection: z.enum(["left", "right", "up", "down"]).optional(),
  mediaFillTransitionBlur: finite.min(0).max(1).optional(),
  mediaFillScale: finite.min(1).max(4).optional(),
  mediaFillPanPercent: finite.min(-50).max(50).optional(),
  cameraRevealFontWeight: finite.min(100).max(900).optional(),
  cameraRevealTypographySizing: z.enum(["fit", "font_size"]).optional(),
  cameraRevealMediaFit: z.enum(["wordmark", "camera"]).optional(),
  cameraRevealHoldSeconds: finite.min(0).max(5).optional(),
  cameraRevealStartDistance: finite.min(0.01).max(6).optional(),
  cameraRevealShutterAngle: finite.min(0).max(360).optional(),
  cameraRevealBlurSamples: z.number().int().min(1).max(10).optional(),
  cameraRevealResolveMode: z.enum(["none", "brand_card"]).optional(),
  cameraRevealResolveStartSeconds: finite.min(0).max(30).optional(),
  cameraRevealResolveDurationSeconds: finite.min(0.05).max(5).optional(),
  cameraRevealResolveBackgroundColor: hexColor.optional(),
  cameraRevealResolveTextColor: hexColor.optional(),
  animationIn: z.enum(ANIMATION_PRESETS).optional(),
  animationOut: z.enum(ANIMATION_PRESETS).optional(),
  animationInDuration: finite.min(0).max(60).optional(),
  animationOutDuration: finite.min(0).max(60).optional(),
  ...effectPropShape,
  ...shapePropShape,
  shape_kind: z.enum(SHAPE_KINDS).describe("Change a shape's base shape; path keeps its own shape_contours.").optional(),
  shape_morph: shapeMorphSchema.optional(),
  shape_width: finite.min(SHAPE_LIMITS.shape_width.min).max(SHAPE_LIMITS.shape_width.max).describe("Shape width as a fraction of the canvas height.").optional(),
  shape_height: finite.min(SHAPE_LIMITS.shape_height.min).max(SHAPE_LIMITS.shape_height.max).describe("Shape height as a fraction of the canvas height.").optional(),
}).strict();

const proposalSourceUrlSchema = z.string().trim().min(1).refine(
  (value) => {
    if (/^https?:\/\//.test(value)) {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    }
    return /^\/api\/(?:projects\/.+\/media|music-catalog\/media|sfx-catalog\/media|image-catalog\/media|visual-catalog\/media)\/.+/.test(value);
  },
  "Must be an absolute URL or a local media API path",
);

const editorAgentPatchSchema = z.object({
  timeline_start: finite.min(0).describe("Where the clip starts on the timeline, in seconds.").optional(),
  duration: finite.gt(0).describe("How long the clip lasts on the timeline, in seconds.").optional(),
  trim_start: finite.min(0).describe("Seconds removed from the start of the source media (source clock). Use to shorten from the front.").optional(),
  trim_end: finite.min(0).describe("Seconds removed from the end of the source media (source clock). Use to shorten from the back.").optional(),
  lane_key: z.string().min(1).max(128).regex(/^[a-z0-9_:-]+$/).describe("Timeline lane the clip sits on, for example visual_1 or audio_1; must match the clip type.").optional(),
  lane_index: z.number().int().min(0).describe("Order of the lane among lanes of its kind; higher visual lanes draw on top.").optional(),
  volume: finite.min(0).max(4).describe("Clip loudness as a linear gain: 1 = unchanged, 0 = silent, up to 4. For changes over time use props.volume_envelope.").optional(),
  fade_in: finite.min(0).describe("Seconds of fade from silence or black at the clip start.").optional(),
  fade_out: finite.min(0).describe("Seconds of fade to silence or black at the clip end.").optional(),
  playback_rate: finite.gt(0).max(4).describe("Constant speed multiplier, above 0 and at most 4 (0.5 = half speed). Changing it rescales the clip's duration. To play backward, keep this positive and set props.playback_reverse to true.").optional(),
  source_url: proposalSourceUrlSchema.optional(),
}).strict();

const clearablePatchFieldSchema = z.enum(["trim_end"]);
// Legacy v1 grade fields stay clearable so proposals drafted before the colour upgrade still validate.
const clearablePropFieldSchema = z.enum(["follows_visual", "place", "spiral_group", "textColor", "wordTimings", "keyframes", "groupLayout", "benchmarkStackLayout", "absX", "absY", ...COLOR_GRADE_KEYFRAME_FIELDS, ...LEGACY_COLOR_GRADE_FIELDS]);

/**
 * Playable media creation is source-boundary based: proposal authors name the
 * full source duration and the absolute source window they want. Approval
 * derives duration and tail trim, so a proposed trim can never become a
 * destructive source slip.
 */
export const editorAgentCreateAudioSchema = z.object({
  type: z.enum(["vo_segment", "vo_full", "music", "sound_effect"]),
  source_url: proposalSourceUrlSchema,
  source_sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  title: z.string().min(1).max(500).optional(),
  timeline_start: finite.min(0),
  source_duration_seconds: finite.gt(0),
  source_start_seconds: finite.min(0),
  source_end_seconds: finite.gt(0),
  lane_key: z.string().min(1).max(128).regex(/^[a-z0-9_:-]+$/),
  lane_index: z.number().int().min(0),
  volume: finite.min(0).max(MAX_ABS_GAIN).default(1),
  fade_in: finite.min(0).default(0),
  fade_out: finite.min(0).default(0),
  playback_rate: finite.gt(0).max(4).default(1),
  voice_enhancement: z.object({
    strength_percent: finite.min(0).max(100),
    attenuation_limit_db: finite.min(0).max(30),
    recipe: z.string().min(1).max(2_000),
    original_source_url: proposalSourceUrlSchema,
  }).strict().optional(),
  /** Link this sound to a picture clip (existing or created in the same option): it starts at that
   * clip's start plus offset_seconds and moves with it, until unlinked (clear_props: follows_visual). */
  follows_visual: z.object({
    element_id: z.string().uuid().describe("The picture clip this sound moves with: an existing element id, or the element_id of a create_visual earlier in the same option."),
    offset_seconds: finite.min(-600).max(600).describe("Seconds from the anchor (the cue, or the picture's start when no cue) to this sound's start, on the timeline clock. Usually 0 with a cue."),
    cue: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/).optional().describe("A named moment of a linked motion graphic (its controls file timing.cues, e.g. \"impact\"). The sound then follows that moment when timing knobs change. Omit to anchor to the clip start."),
  }).strict().optional().describe("Link this sound to a picture clip so it starts at the anchor plus offset and moves with it (timeline_start is then derived). Use for a motion graphic's sound effects in a first proposal; unlink later with clear_props: [\"follows_visual\"] to edit or swap sounds one by one."),
}).strict().superRefine((create, ctx) => {
  if (create.source_end_seconds <= create.source_start_seconds) {
    ctx.addIssue({ code: "custom", path: ["source_end_seconds"], message: "must be after source_start_seconds" });
  }
  if (create.source_end_seconds > create.source_duration_seconds + 1e-6) {
    ctx.addIssue({ code: "custom", path: ["source_end_seconds"], message: "must not exceed source_duration_seconds" });
  }
});

const editorAgentUseVideoStabilizationSchema = z.object({
  processed_source_url: proposalSourceUrlSchema,
  processed_preview_source_url: proposalSourceUrlSchema,
  original_source_url: proposalSourceUrlSchema,
  original_preview_source_url: proposalSourceUrlSchema,
  original_preview_audio_source_url: proposalSourceUrlSchema,
  original_render_authority_source_url: proposalSourceUrlSchema,
  render_authority_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  preview_proxy_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  source_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  mode: z.enum(["smooth_motion", "lock_camera"]),
  strength_percent: finite.min(0).max(100),
  shakiness: z.number().int().min(1).max(10),
  smoothing_frames: z.number().int().min(0).max(120),
  auto_zoom: z.boolean(),
  recipe: z.string().min(1).max(500),
}).strict();

/**
 * Swap a placed video clip's picture for a recast of the same moment (people replaced from photos with
 * Generate's recast models). The recast was generated from a window of this clip's source that starts at
 * `source_window_start` on the source clock, so the clip keeps its timeline timing and its in-point moves into
 * the recast's own clock. The recast must be kept in the Library and prepared, like any placed video.
 */
const editorAgentUseRecastSchema = z.object({
  recast_source_url: proposalSourceUrlSchema.describe("The kept recast clip in this project's media, e.g. /api/projects/<id>/media/generated/take.mp4"),
  source_window_start: finite.min(0).describe("Where the recast starts on the clip's original footage clock, in seconds (the window sent to the model); for a clip already recast, still the original footage's clock"),
  generation_id: z.string().uuid().describe("The Generate request that produced the recast"),
  model: z.string().min(1).max(120).describe("The recast model's name, e.g. H3 Max Recast"),
}).strict();

/** Bind a prepared, timing-identical speech authority to an existing clip.
 * The media work happens before proposal creation; preview and approval only
 * select the verified result while preserving the original authority. */
const editorAgentUseVoiceEnhancementSchema = z.object({
  processed_source_url: proposalSourceUrlSchema,
  processed_preview_audio_source_url: proposalSourceUrlSchema,
  original_source_url: proposalSourceUrlSchema,
  original_preview_audio_source_url: proposalSourceUrlSchema,
  original_render_authority_source_url: proposalSourceUrlSchema,
  processed_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  strength_percent: finite.min(0).max(100),
  attenuation_limit_db: finite.min(0).max(30),
  recipe: z.string().min(1).max(2_000),
  normalization_target_lufs: finite.min(-30).max(-5),
  normalization_true_peak_dbtp: finite.min(-12).max(0),
  normalization_recipe: z.string().min(1).max(2_000),
}).strict();

const editorAgentReattachOriginalAudioSchema = z.object({
  audio_element_id: z.string().uuid(),
}).strict();

/** Atomically map a transparent talking-head derivative back onto the same
 * source clock as its audible parent. Timing fields are derived, never
 * independently authored, so speed changes cannot create silent lip drift. */
const editorAgentSyncSpeechVisualSchema = z.object({
  /** Optional replacement derivative. It must be a cataloged cutout of the
   * same audible source authority; timing continues to be derived below. */
  source_url: proposalSourceUrlSchema.optional(),
  source_element_id: z.string().uuid(),
  source_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  source_start_seconds: finite.min(0),
  source_end_seconds: finite.gt(0),
  lane_key: z.string().min(1).max(128).regex(/^[a-z0-9_:-]+$/).optional(),
  lane_index: z.number().int().min(0).optional(),
  /** Optional semantic placement applied atomically with the clock rebind. */
  semanticLayout: editorAgentSemanticVisualLayoutSchema.optional(),
}).strict().superRefine((sync, ctx) => {
  if (sync.source_end_seconds <= sync.source_start_seconds) {
    ctx.addIssue({ code: "custom", path: ["source_end_seconds"], message: "must be after source_start_seconds" });
  }
  if ((sync.lane_key == null) !== (sync.lane_index == null)) {
    ctx.addIssue({ code: "custom", path: ["lane_key"], message: "lane_key and lane_index must be supplied together" });
  }
});

const editorAgentCaptionTimingSourceSchema = z.object({
  element_id: z.string().uuid(),
  alignment_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  source_start_seconds: finite.min(0),
  source_end_seconds: finite.gt(0),
  playback_rate: finite.gt(0).max(4),
}).strict().superRefine((source, ctx) => {
  if (source.source_end_seconds <= source.source_start_seconds) {
    ctx.addIssue({ code: "custom", path: ["source_end_seconds"], message: "must be after source_start_seconds" });
  }
});

const editorAgentCaptionCueSchema = z.object({
  element_id: z.string().uuid(),
  text: z.string().trim().min(1).max(500),
  timeline_start: finite.min(0),
  duration: finite.gt(0).max(15),
  caption_source_text: z.string().trim().min(1).max(1_000),
  caption_alignment_path: z.string().trim().min(1).max(2_048),
  timing_source: editorAgentCaptionTimingSourceSchema,
  /** How spoken words read on screen: each `spoken` run of aligned words (as aligned, e.g. "eighty k")
   * displays as `display` (e.g. "$80K"). Applied in order; the cue text must equal the result. */
  caption_display_substitutions: z.array(z.object({
    spoken: z.string().trim().min(1).max(200).describe("Aligned spoken words as they appear in caption_source_text, e.g. \"eighty k\"."),
    display: z.string().trim().min(1).max(200).describe("How those words read on screen, e.g. \"$80K\"."),
  }).strict()).max(20).describe("Spoken-to-written swaps for this cue; text must equal the spoken words with these applied. Timing still comes from the spoken words.").optional(),
  /** Optional display hold remains source-clock bound while letting kinetic
   * text layers persist after their own spoken phrase has landed. */
  hold_until_source_seconds: finite.gt(0).max(3_600).optional(),
  /** Layered kinetic captions remain native, selectable text elements. */
  lane_key: z.string().regex(/^captions_\d+$/).optional(),
  lane_index: z.number().int().min(0).max(64).optional(),
  caption_fast_verbatim: z.boolean().default(false),
  caption_rapid_fragment: z.boolean().default(false),
  style: z.object({
    fontSizing: z.enum(["fit", "fixed"]).optional(),
    fontSizePx: finite.min(18).max(300).optional(),
    maxWidth: finite.min(0.25).max(1).optional(),
    positionPreset: z.enum(CAPTION_POSITION_PRESETS).optional(),
    positionNudgeY: z.enum(["none", "slightly_up", "slightly_down"]).optional(),
    fontPreset: z.enum(CAPTION_FONT_PRESETS as [string, ...string[]]).optional(),
    styleVariant: z.enum(CAPTION_STYLE_VARIANTS).optional(),
    textColor: hexColor.optional(),
    textAlign: z.enum(["left", "center", "right"]).optional(),
    timingMode: z.enum(["phrase", "active_word", "single_word"]).optional(),
    wordTimings: z.array(z.object({
      text: z.string().trim().min(1).max(200),
      start: finite.min(0).max(600),
      end: finite.gt(0).max(600),
      color: hexColor.optional(),
      scale: finite.min(0.5).max(3).optional(),
      rowBreakBefore: z.boolean().optional(),
      rowBreakAfter: z.boolean().optional(),
    }).strict()).min(1).max(100).optional(),
    animationIn: z.enum(ANIMATION_PRESETS).optional(),
    animationInDuration: finite.min(0).max(60).optional(),
    groupLayout: editorAgentCaptionGroupLayoutSchema.optional(),
  }).strict().optional(),
}).strict().superRefine((cue, ctx) => {
  if ((cue.lane_key == null) !== (cue.lane_index == null)) {
    ctx.addIssue({ code: "custom", path: ["lane_key"], message: "lane_key and lane_index must be supplied together" });
  }
  if (cue.lane_key != null && Number(cue.lane_key.slice("captions_".length)) !== cue.lane_index) {
    ctx.addIssue({ code: "custom", path: ["lane_index"], message: "must match the caption lane suffix" });
  }
});

/**
 * Caption generation is one atomic structural edit: approval replaces the
 * complete active speech-caption rail with one force-aligned cue set. Treating
 * each cue as an independent proposal operation would allow partial approval
 * to leave missing or duplicated speech.
 */
const editorAgentReplaceCaptionsSchema = z.object({
  cues: z.array(editorAgentCaptionCueSchema).min(1).max(250),
  /** Explicit legacy exceptions retained atomically with a rail rebuild. */
  preserve_element_ids: z.array(z.string().uuid()).max(250).optional(),
  /** Remove every active caption that reaches this timeline point or begins
   * after it. This is the deterministic contract for a user request such as
   * "redo the captions from my mark"; earlier captions remain untouched. */
  from_timeline_seconds: finite.min(0).optional(),
  /** Limit replacement to captions bound to these speech clips. Omit only
   * when intentionally rebuilding the complete active caption rail. */
  source_element_ids: z.array(z.string().uuid()).min(1).max(32).optional(),
  lane_key: z.literal("captions_0"),
  font_preset: z.enum(CAPTION_FONT_PRESETS as [string, ...string[]]),
  font_size_px: finite.min(18).max(300),
  style_variant: z.enum(CAPTION_STYLE_VARIANTS),
  position_preset: z.enum(CAPTION_POSITION_PRESETS),
  max_width: finite.min(0.25).max(0.95),
  grouping: z.literal("pause_first_v1"),
  word_limit: z.number().int().min(1).max(4),
  /** Creator dials: move every caption left/right and up/down from its preset spot (share of the
   * frame, -0.45 to 0.45), keeping each caption centred on that spot. */
  offsetX: finite.min(-0.45).max(0.45).describe("X dial: move every caption left (negative) or right as a share of the frame width; send 0 so the creator gets the dial.").optional(),
  offsetY: finite.min(-0.45).max(0.45).describe("Y dial: move every caption up (negative) or down as a share of the frame height; keep text off the speaker's face.").optional(),
  /** How each cue reveals: the whole phrase, the word being spoken highlighted, or one word at a time. */
  timing_mode: z.enum(["phrase", "active_word", "single_word"]).describe("phrase shows the whole cue, active_word highlights the spoken word, single_word shows one word at a time and is saved as one caption per word.").optional(),
  singleWordFlipSeconds: finite.min(0).max(0.3).describe("Word flip dial for single_word: seconds each word flips in and out; 0 is a plain cut. Send it (0 unless the creator asked for motion) so the creator gets the dial.").optional(),
  hide_punctuation: z.boolean().describe("Draw every caption without punctuation (commas, full stops, quotes); cue text stays the aligned words. Defaults to true; send false only when the creator explicitly asks for punctuation. The creator can switch it in Captions → Punctuation.").optional(),
  font_sizing: z.enum(["fixed", "fit"]).describe("fixed keeps every caption at font_size_px and never shrinks it (keep cues short enough to fit on one line); fit shrinks a long caption to fit its line. Omitted is fit.").optional(),
  /** Optional complete top-first lane order used when the replacement adds
   * separately editable caption layers. */
  lane_order_keys: z.array(
    z.string().min(1).max(128).regex(/^[a-z0-9_:-]+$/),
  ).min(1).max(64).refine((keys) => new Set(keys).size === keys.length, "lane order keys must be unique").optional(),
}).strict();

/**
 * Visual proposal creation is intentionally narrow: it mounts one already-
 * prepared local/remote visual source without generation. Transparent effect
 * derivatives use this path so the human can preview and tune them before
 * approval instead of requiring a direct timeline mutation.
 */
export const editorAgentCreateVisualSchema = z.object({
  window_open_duration: finite.min(0).max(10).optional(),
  window_corner_radius: finite.min(0).max(200).optional(),
  window_side_margin_percent: finite.min(0).max(45).optional(),
  window_vertical_margin_percent: finite.min(0).max(45).optional(),
  /** Preserve a chosen source grade when mounting a handled picture interval. */
  color_grade: z.object(Object.fromEntries(Object.entries(effectPropShape).filter(([field]) => AGENT_COLOR_GRADE_FIELDS.has(field)))).strict().optional(),
  volume: finite.min(0).max(MAX_ABS_GAIN).optional(),
  transition_keyframes: transitionKeyframesSchema.optional(),
  edge_aura: edgeAuraSchema.optional(),
  outline_parent_id: z.string().uuid().optional(),
  outline_width: finite.min(0).max(64).optional(),
  /** Show this clip only inside/outside another clip's moving cutout, on that clip's clock. */
  subject_window_parent_id: z.string().uuid().describe("Subject window: the video clip (existing element id or an earlier create_visual in this option) whose moving cutout this clip shows through. Requires subject_window_mask.").optional(),
  subject_window_mask: subjectWindowMaskSchema.describe("Subject window: the subject footage's prepared cutout mask (cutout_status grid_matte_mask).").optional(),
  ...Object.fromEntries(Object.entries(effectPropShape).filter(([field]) => field.startsWith("subject_window_"))),
  outline_color: hexColor.optional(),
  type: z.enum(["video_clip", "still"]),
  source_url: proposalSourceUrlSchema,
  title: z.string().min(1).max(500).optional(),
  timeline_start: finite.min(0),
  source_duration_seconds: finite.gt(0).optional(),
  source_start_seconds: finite.min(0).optional(),
  source_end_seconds: finite.gt(0).optional(),
  duration_seconds: finite.gt(0).optional(),
  /** Preserve the source clock when mounting a muted picture-only duplicate
   * of an existing speaking clip. */
  playback_rate: finite.min(0.25).max(4).optional(),
  lane_key: z.string().min(1).max(128).regex(/^[a-z0-9_:-]+$/),
  lane_index: z.number().int().min(0),
  editorial_role: z.literal("product-walkthrough-rough-spine").optional(),
  beat_label: z.string().trim().min(1).max(240).optional(),
  ripple_after: z.boolean().optional().describe("For an inserted clip such as an opener: when a timing knob changes its render's length, every clip after it moves by the difference. Omit for overlays that should not push the edit."),
  rough_beat_kind: z.enum(["settled", "motion", "loading"]).optional(),
  source_manifest_id: z.string().trim().min(1).max(240).optional(),
  media_orientation: z.enum(["original", "clockwise", "counterclockwise"]).optional(),
  media_mirror: z.enum(["none", "horizontal"]).optional(),
  media_blend_mode: z.enum(["normal", "difference", "exclusion"]).optional(),
  subject_entrance_seconds: finite.min(0).max(10).optional(),
  subject_flash_seconds: finite.min(1/30).max(2).optional(),
  subject_glow_fade_seconds: finite.min(1/30).max(3).optional(),
  subject_flash: unit.optional(),
  subject_glow: finite.min(0).max(3).optional(),
  subject_glow_radius: finite.min(0).max(80).optional(),
  recolor_color: hexColor.optional(),
  recolor_amount: unit.optional(),
  recolor_preserve_shading: unit.optional(),
  media_opacity: unit.optional(),
  has_alpha: z.boolean().optional(),
  sticker_outline: z.boolean().optional(),
  sticker_outline_width: finite.min(0).max(32).optional(),
  sticker_outline_color: hexColor.optional(),
  directional_blur_x: finite.min(0).max(1080).describe("Horizontal blur in pixels at 1080 width. With transition_keyframes.directional_blur_x it is that envelope's peak, so the card's Horizontal blur dial scales the whole envelope.").optional(),
  directional_blur_y: finite.min(0).max(1080).describe("Vertical blur in pixels at 1080 width; with a directional_blur_y envelope it is that envelope's peak.").optional(),
  effect_role: z.string().min(1).max(128).optional(),
  media_scale: finite.min(0.1).max(3).optional(),
  media_offset_x: finite.min(-2).max(2).optional(),
  media_offset_y: finite.min(-2).max(2).optional(),
  semanticLayout: editorAgentSemanticVisualLayoutSchema.optional(),
  crowdLayout: editorAgentSemanticCrowdLayoutSchema.optional(),
  motion_preset: z.enum(["float", "bounce", "orbit", "spiral"]).optional(),
  spiral_group: spiralGroupSchema.optional(),
  camera_id: z.string().uuid().describe("The camera this clip is seen through: the element_id of a shape_kind camera (an existing one, or a create_shape earlier in this option). Its push-ins and pans move it as its outermost transform.").optional(),
  surface_track: surfaceTrackSchema.describe("Place this picture on a tracked flat surface in other footage (a billboard, a TV, a phone): the four-corner track from surface_track_status. The picture's whole frame is drawn onto the surface with perspective, follows the footage's source clock and any camera the footage follows. Do not also set camera_id.").optional(),
  surface_region: surfaceRegionSchema.describe("The part of the tracked surface this picture covers, [left, top, right, bottom] as fractions of the surface: inset from [0,0,1,1] to leave the screen's own edge showing, or split it to put several pictures side by side.").optional(),
  mask_line_rotation: finite.min(-180).max(180).optional(),
  mask_inset: z.array(finite.min(0).max(0.95)).length(4).optional(),
  mask_inset_keyframes: maskInsetKeyframesSchema.describe("Animate the crop edges over the clip: [{t, v: [top, right, bottom, left], ease}], t in clip-relative seconds from 0. Use for wipes and windows that open or widen.").optional(),
  mask_feather: finite.min(0).max(0.5).optional(),
  mask_corner_radius: finite.min(0).max(0.5).describe("Crop roundness: corner radius of the visible crop (mask_inset) as a fraction of its shorter side, 0 to 0.5; 0.5 on a crop that is square in pixels is a circle (a corner bubble). Animate it with transition_keyframes.mask_corner_radius.").optional(),
  animationIn: z.enum(ANIMATION_PRESETS).optional(),
  animationOut: z.enum(ANIMATION_PRESETS).optional(),
  animationInDuration: finite.min(0).max(60).optional(),
  animationOutDuration: finite.min(0).max(60).optional(),
  chroma_key_color: hexColor.optional(),
  chroma_key_tolerance: unit.optional(),
  chroma_key_softness: unit.optional(),
  chroma_key_spill: unit.optional(),
  // Color map and glitch clip effects; the registry owns their ranges and meaning.
  ...Object.fromEntries(Object.entries(effectPropShape).filter(([field]) => field.startsWith("gradient_map_") || field.startsWith("glitch_") || field.startsWith("film_"))),
  /** Atomically mount a cataloged transparent talking-head derivative on the
   * audible source clock. The cutout receipt is resolved from its source URL;
   * authored timing never becomes an independent authority. */
  speech_sync: editorAgentSyncSpeechVisualSchema.optional(),
}).strict().superRefine((create, ctx) => {
  const sourceWindowValues = [
    create.source_duration_seconds,
    create.source_start_seconds,
    create.source_end_seconds,
  ];
  const sourceWindowCount = sourceWindowValues.filter((value) => value !== undefined).length;
  const hasSourceWindow = sourceWindowCount === sourceWindowValues.length;
  if (sourceWindowCount > 0 && !hasSourceWindow) {
    ctx.addIssue({ code: "custom", path: ["source_duration_seconds"], message: "source window fields must be supplied together" });
  }
  if (create.type === "video_clip" && !hasSourceWindow) {
    ctx.addIssue({ code: "custom", path: ["source_duration_seconds"], message: "video clips require a complete source window" });
  }
  if (create.type === "video_clip" && create.duration_seconds !== undefined) {
    ctx.addIssue({ code: "custom", path: ["duration_seconds"], message: "video duration is derived from its source window; omit duration_seconds and set source_start_seconds and source_end_seconds (with source_duration_seconds) instead" });
  }
  if (create.speech_sync && create.playback_rate !== undefined) {
    ctx.addIssue({ code: "custom", path: ["playback_rate"], message: "speech-synchronized visuals derive playback rate from their speech source" });
  }
  if (create.type === "still" && create.duration_seconds === undefined && !hasSourceWindow) {
    ctx.addIssue({ code: "custom", path: ["duration_seconds"], message: "stills require duration_seconds or a legacy source window" });
  }
  if (create.type === "still" && create.duration_seconds !== undefined && sourceWindowCount > 0) {
    ctx.addIssue({ code: "custom", path: ["duration_seconds"], message: "compact still duration cannot be combined with source window fields" });
  }
  if (
    (create.semanticLayout || create.crowdLayout)
    && (create.media_scale !== undefined || create.media_offset_x !== undefined || create.media_offset_y !== undefined)
  ) {
    ctx.addIssue({ code: "custom", path: ["semanticLayout"], message: "semantic layout cannot be combined with raw visual coordinates" });
  }
  if (create.semanticLayout && create.crowdLayout) {
    ctx.addIssue({ code: "custom", path: ["crowdLayout"], message: "choose semantic layout or crowd layout, not both" });
  }
  if (create.semanticLayout?.motion && create.motion_preset) {
    ctx.addIssue({ code: "custom", path: ["motion_preset"], message: "semantic slot motion cannot be combined with a motion preset" });
  }
  if (
    create.source_end_seconds !== undefined
    && create.source_start_seconds !== undefined
    && create.source_end_seconds <= create.source_start_seconds
  ) {
    ctx.addIssue({ code: "custom", path: ["source_end_seconds"], message: "must be after source_start_seconds" });
  }
  if (
    create.source_end_seconds !== undefined
    && create.source_duration_seconds !== undefined
    && create.source_end_seconds > create.source_duration_seconds + 1e-6
  ) {
    ctx.addIssue({ code: "custom", path: ["source_end_seconds"], message: "must not exceed source_duration_seconds" });
  }
  if (create.speech_sync && (create.type !== "video_clip" || create.has_alpha !== true)) {
    ctx.addIssue({ code: "custom", path: ["speech_sync"], message: "speech-synchronized creation requires a transparent video clip" });
  }
  if (create.sticker_outline_width !== undefined && create.sticker_outline !== true) {
    ctx.addIssue({ code: "custom", path: ["sticker_outline_width"], message: "outline width requires sticker_outline" });
  }
  if (
    create.chroma_key_color === undefined
    && (create.chroma_key_tolerance !== undefined
      || create.chroma_key_softness !== undefined
      || create.chroma_key_spill !== undefined)
  ) {
    ctx.addIssue({ code: "custom", path: ["chroma_key_color"], message: "chroma key amounts require chroma_key_color" });
  }
});

/** Create one independently timed native graphic-text actor. This is distinct
 * from replace_captions: it does not claim speech ownership or alter the
 * source-bound caption rail. */
const shapeKeyTrack = (min: number, max: number, unit: string, meaning: string) => z.array(z.object({
  t: finite.min(0).max(600).describe("Clip-relative seconds; the first key is at 0 and times increase."),
  v: finite.min(min).max(max).describe(`Value at t (${unit}).`),
  ease: z.enum(["linear", "easeIn", "easeOut", "easeInOut", "hold"]).describe("How the value travels to the next key.").optional(),
}).strict()).min(2).max(120).describe(meaning);

/** A shape drawn from numbers on a visual lane: a preset or freeform contours (timeline/shapes.ts). */
export const editorAgentCreateShapeSchema = z.object({
  title: z.string().min(1).max(240).describe("The shape's name on the timeline, in plain words, for example \"Ring\".").optional(),
  timeline_start: finite.min(0).describe("Where the shape starts on the timeline, in seconds."),
  duration_seconds: finite.positive().max(600).describe("How long the shape is on screen, in seconds."),
  lane_key: z.string().regex(/^visual_\d+$/).describe("A visual lane. Overlapping visuals need separate lanes."),
  lane_index: z.number().int().min(0).describe("Order among visual lanes; higher lanes draw on top."),
  shape_kind: z.enum(SHAPE_KINDS).describe("A base shape: rect (boxes, bars, underlines), ellipse (circles, rings), polygon, star, line, arc, arrow; path for any other outline, given as shape_path_d or shape_contours; or camera, which draws nothing: keyframe its media_offset_x/y (where it looks), media_scale (zoom) and media_rotation for a push-in or pan, and point shapes at it with camera_id."),
  shape_width: finite.min(SHAPE_LIMITS.shape_width.min).max(SHAPE_LIMITS.shape_width.max).describe("Width as a fraction of the canvas height, so equal width and height make a circle or square."),
  shape_height: finite.min(SHAPE_LIMITS.shape_height.min).max(SHAPE_LIMITS.shape_height.max).describe("Height as a fraction of the canvas height."),
  ...shapePropShape,
  shape_path_d: z.string().min(1).max(20000).describe("For path: SVG path data (the d of a <path>, any commands). It is fitted into the shape's width and height and stored as editable points; draw it at its own aspect ratio to keep its proportions.").optional(),
  media_opacity: finite.min(0).max(1).describe("Opacity, 0 to 1.").optional(),
  animationIn: z.enum(SHAPE_ANIMATION_PRESETS).describe("fade: the shape fades in over animationInDuration seconds from its start.").optional(),
  animationOut: z.enum(SHAPE_ANIMATION_PRESETS).describe("fade: the shape fades out over animationOutDuration seconds before its end.").optional(),
  animationInDuration: finite.min(0).max(2).describe("Seconds the fade in takes.").optional(),
  animationOutDuration: finite.min(0).max(2).describe("Seconds the fade out takes.").optional(),
  media_scale: finite.min(0.1).max(CAMERA_ZOOM.max).describe("Size multiplier around the shape's centre; 1 is its own width and height. Up to 3, or up to 10 for a camera's zoom.").optional(),
  media_offset_x: finite.min(-2).max(2).describe("Horizontal centre in half-canvas units: 0 centred, 1 the right edge.").optional(),
  media_offset_y: finite.min(-2).max(2).describe("Vertical centre in half-canvas units: 0 centred, 1 the bottom edge.").optional(),
  keyframes: z.object({
    media_scale: shapeKeyTrack(0.1, CAMERA_ZOOM.max, "scale", "Size over time, for example a shockwave growing from 0.9 to 1.9; up to 3, or up to 10 for a camera's zoom."),
    media_offset_x: shapeKeyTrack(-2, 2, "half-canvas units", "Horizontal centre over time, for example a bar sliding in."),
    media_offset_y: shapeKeyTrack(-2, 2, "half-canvas units", "Vertical centre over time."),
    media_opacity: shapeKeyTrack(0, 1, "opacity", "Opacity over time, for example fading a shockwave out as it grows."),
    media_rotation: shapeKeyTrack(SHAPE_LIMITS.media_rotation.min, SHAPE_LIMITS.media_rotation.max, "degrees", "Clockwise turn over time, in degrees."),
    shape_draw: shapeKeyTrack(0, 1, "drawn share of the outline", "How much of the outline is drawn over time, for example 0 to 1 to draw a ring on."),
    shape_contours: z.array(z.object({
      t: finite.min(0).max(600).describe("Clip-relative seconds; the first key is at 0 and times increase."),
      v: z.string().min(1).max(20000).describe("The outline at t as SVG path data, drawn in the same coordinates as shape_path_d."),
      ease: z.enum(["linear", "easeIn", "easeOut", "easeInOut", "hold"]).describe("How the outline travels to the next key.").optional(),
    }).strict()).min(2).max(60).describe("Morph a path shape: outlines over time. Outlines may differ in points and contours; they are matched automatically (points added along edges, a missing contour grows from a point). For the cleanest morph give partner outlines the same number of points, starting at matching places."),
  }).partial().strict().describe("Animate inside the clip: for a shockwave keyframe media_scale up and media_opacity down; for a ring drawing in keyframe shape_draw from 0 to 1; to morph a path shape keyframe shape_contours.").optional(),
}).strict().superRefine((shape, ctx) => {
  const freeform = shape.shape_path_d != null || shape.shape_contours != null;
  // Only a camera zooms past a shape's 3× size.
  if (shape.shape_kind !== "camera" && [shape.media_scale, ...(shape.keyframes?.media_scale ?? []).map(key => key.v)].some(v => v != null && v > 3)) {
    ctx.addIssue({ code: "custom", message: "media_scale above 3 is only for a camera's zoom." });
  }
  if (shape.shape_kind === "path" && !freeform) ctx.addIssue({ code: "custom", message: "A path shape needs shape_path_d or shape_contours." });
  if (shape.shape_kind !== "path" && freeform) ctx.addIssue({ code: "custom", message: "shape_path_d and shape_contours are only for shape_kind path." });
  if (shape.shape_path_d != null && shape.shape_contours != null) ctx.addIssue({ code: "custom", message: "Give shape_path_d or shape_contours, not both." });
  if (shape.shape_path_d != null) {
    try { if (parseSvgPath(shape.shape_path_d).length === 0) ctx.addIssue({ code: "custom", message: "shape_path_d draws nothing." }); }
    catch (error) { ctx.addIssue({ code: "custom", message: error instanceof Error ? error.message : "shape_path_d is not valid SVG path data." }); }
  }
  const morph = shape.keyframes?.shape_contours;
  if (morph) {
    if (shape.shape_kind !== "path") { ctx.addIssue({ code: "custom", message: "keyframes.shape_contours morphs only a path shape." }); return; }
    if (shape.shape_path_d == null) {
      ctx.addIssue({ code: "custom", message: "A morph needs shape_path_d: its keys are SVG path data in the same coordinates." });
      return;
    }
    morph.forEach((key, index) => {
      try { if (parseSvgPath(key.v).length === 0) ctx.addIssue({ code: "custom", message: `Morph key ${index + 1} draws nothing.` }); }
      catch (error) { ctx.addIssue({ code: "custom", message: `Morph key ${index + 1}: ${error instanceof Error ? error.message : "not valid SVG path data"}` }); }
    });
  }
});

export const editorAgentCreateTextSchema = z.object({
  surface_track: surfaceTrackSchema.optional(),
  singleLine: z.boolean().optional(),
  spiral_group: spiralGroupSchema.optional(),
  camera_id: z.string().uuid().describe("The camera this text is seen through: the element_id of a shape_kind camera (an existing one, or a create_shape earlier in this option). Its push-ins and pans move it as its outermost transform.").optional(),
  place: placeSchema.optional(),
  absX: editorAgentPropsSchema.shape.absX,
  absY: editorAgentPropsSchema.shape.absY,
  mediaFillUrls: editorAgentPropsSchema.shape.mediaFillUrls,
  mediaFillScene: editorAgentPropsSchema.shape.mediaFillScene,
  mediaFillVideoUrl: editorAgentPropsSchema.shape.mediaFillVideoUrl,
  mediaFillVideoPlaybackRate: editorAgentPropsSchema.shape.mediaFillVideoPlaybackRate,
  mediaFillVideoPreviewUrl: editorAgentPropsSchema.shape.mediaFillVideoPreviewUrl,
  mediaFillSecondsPerImage: editorAgentPropsSchema.shape.mediaFillSecondsPerImage,
  mediaFillCrossfadeSeconds: editorAgentPropsSchema.shape.mediaFillCrossfadeSeconds,
  mediaFillScale: editorAgentPropsSchema.shape.mediaFillScale,
  mediaFillPanPercent: editorAgentPropsSchema.shape.mediaFillPanPercent,
  text: z.string().trim().min(1).max(500),
  title: z.string().trim().min(1).max(240).optional(),
  timeline_start: finite.min(0),
  duration_seconds: finite.gt(0).max(600),
  lane_key: z.string().regex(/^captions_[0-9]+$/),
  lane_index: z.number().int().min(0).max(99),
  positionPreset: z.enum(CAPTION_POSITION_PRESETS).describe("A named spot on the frame, when the text is not placed relative to something (place).").optional(),
  fontPreset: z.enum(CAPTION_FONT_PRESETS as [string, ...string[]]),
  handwritingWeight: editorAgentPropsSchema.shape.handwritingWeight,
  fontSizePx: finite.min(18).max(300),
  styleVariant: z.enum(CAPTION_STYLE_VARIANTS),
  maxWidth: finite.min(0.15).max(1),
  textAlign: z.enum(["left", "center", "right"]),
  textColor: hexColor.optional(),
  rotationDeg: editorAgentPropsSchema.shape.rotationDeg,
  wordStyles: captionWordStylesSchema.optional(),
  animationIn: z.enum(ANIMATION_PRESETS).optional(),
  animationOut: z.enum(ANIMATION_PRESETS).optional(),
  animationInDuration: finite.min(0).max(60).optional(),
  animationOutDuration: finite.min(0).max(60).optional(),
}).strict().superRefine((create, ctx) => {
  if (!create.place && !create.positionPreset && create.absX === undefined && create.absY === undefined) {
    ctx.addIssue({ code: "custom", path: ["place"], message: "Place the text: relative to an element (place), or at a positionPreset" });
  }
  const expectedLaneIndex = Number(create.lane_key.slice("captions_".length));
  if (create.lane_index !== expectedLaneIndex) {
    ctx.addIssue({ code: "custom", path: ["lane_index"], message: "must match the caption lane suffix" });
  }
});

const editorAgentRemoveVisualSchema = z.object({
  reason: z.string().trim().min(1).max(500),
}).strict();

const editorAgentRemoveTextSchema = z.object({
  reason: z.string().trim().min(1).max(500),
}).strict();

const editorAgentSetLaneOrderSchema = z.object({
  lane_order_keys: z.array(
    z.string().min(1).max(128).regex(/^[a-z0-9_:-]+$/),
  ).min(1).max(64).refine((keys) => new Set(keys).size === keys.length, "lane order keys must be unique"),
  muted_lane_keys: z.array(z.string().min(1).max(128).regex(/^[a-z0-9_:-]+$/)).max(100).optional(),
  expected_muted_lane_keys: z.array(z.string().min(1).max(128)).max(100).optional(),
}).strict().refine((value) => (value.muted_lane_keys === undefined) === (value.expected_muted_lane_keys === undefined), "Lane mute edits require the observed mute state");

/** Proposal derivation is synchronous; its entry points scope the project rate (frame-rate-scope.ts). */
function projectRateOrCurrent(projectId: string | undefined): number {
  if (!projectId) return currentFrameRate();
  try { return readProjectFrameRate(projectId); } catch { return currentFrameRate(); }
}

const editorAgentSetOutputFormatSchema = z.object({
  aspect_ratio: z.enum(TIMELINE_ASPECT_RATIO_VALUES).optional(),
  frame_rate: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(50), z.literal(60)]).optional()
    .describe("Project frames per second for preview, editing and export (24, 25, 30, 50 or 60). Changing it re-snaps every picture clip to the new frame grid; captions and audio keep their exact times."),
  delivery_target: z.enum(["web", "feed", "reels", "tiktok", "shorts"]).optional(),
}).strict().refine(
  (value) => value.aspect_ratio != null || value.frame_rate != null || value.delivery_target != null,
  "Output format needs an aspect ratio, frame rate or delivery target",
);
type EditorAgentOutputFormat = z.infer<typeof editorAgentSetOutputFormatSchema>;

/**
 * A bounded structural edit for a talking-head opening. It behaves like the
 * existing proposal preview sandbox: the source timeline stays untouched until
 * approval, while the derived copy ripples the opening removal and creates a
 * deterministic right-hand video segment for a punch-in.
 *
 * The punch point is source-anchored so fine-tuning the opening removal cannot
 * move the editorial moment the user marked.
 */
export const editorAgentOpeningSequenceEditSchema = z.object({
  remove_opening_seconds: finite.min(1 / 30).max(30),
  punch_in_source_seconds: finite.min(0).max(3_600),
  punch_in_scale: finite.min(0.1).max(3),
  punch_in_offset_x: finite.min(-2).max(2).default(0),
  punch_in_offset_y: finite.min(-2).max(2).default(0),
  inserted_element_id: z.string().uuid(),
  replacement_caption_element_id: z.string().uuid(),
  replacement_caption_text: z.string().trim().min(1).max(500),
  max_affected_elements: z.number().int().min(1).max(200),
  drop_boundary_captions: z.boolean().default(true),
}).strict();

/** Remove one verified source-time interval from a speaking clip and ripple
 * every overlapping/downstream layer. The supplied ids make preview and
 * approval derive the exact same editable split graph. */
export const editorAgentSourceRangeCutSchema = z.object({
  source_start_seconds: finite.min(0).max(3_600),
  source_end_seconds: finite.gt(0).max(3_600),
  removed_segment_id: z.string().uuid(),
  inserted_element_id: z.string().uuid(),
  max_affected_elements: z.number().int().min(1).max(500),
  ripple_lane_keys: z.array(z.string().min(1).max(128).regex(/^[a-z0-9_:-]+$/)).min(1).max(100).optional(),
}).strict().superRefine((cut, ctx) => {
  if (cut.source_end_seconds <= cut.source_start_seconds) {
    ctx.addIssue({ code: "custom", path: ["source_end_seconds"], message: "must be after source_start_seconds" });
  }
  if (cut.removed_segment_id === cut.inserted_element_id) {
    ctx.addIssue({ code: "custom", path: ["inserted_element_id"], message: "split ids must be unique" });
  }
});

/** Speed up or slow down a speaker clip and everything after it on the named lanes, keeping them in
 * step: later clips move closer (or further apart) by the same factor, media plays faster (the same
 * footage, shorter), and animation inside each clip keeps its place. Captions that follow the voice
 * re-time themselves. `factor` is the card's Speed dial. */
export const editorAgentSpeedChangeSchema = z.object({
  factor: finite.min(0.5).max(2).describe("How much faster everything plays from this clip on: 1.15 is 15% faster, 0.9 slower. The card's Speed dial."),
  ripple_lane_keys: z.array(z.string().min(1).max(128).regex(/^[a-z0-9_:-]+$/)).min(1).max(100)
    .describe("Lanes that speed up together, including this clip's lane: usually the speaker and every picture, label and sound above it. Captions that follow the voice need not be listed."),
  max_affected_elements: z.number().int().min(1).max(500).describe("Most clips this may move; the change is refused above it."),
}).strict().describe("Speed up or slow down this speaker clip and every later clip on the named lanes together, keeping animation and voice-bound captions in step.");

/** Restore source media immediately before an existing clip while rippling
 * the named speech-timed lanes forward. This is the inverse of tightening a
 * mid-sentence source-range cut: the target keeps its timeline start, reveals
 * the earlier source, and grows by the restored interval. */
export const editorAgentSourceRangeRestoreSchema = z.object({
  source_start_seconds: finite.min(0).max(3_600),
  max_affected_elements: z.number().int().min(1).max(500),
  ripple_lane_keys: z.array(z.string().min(1).max(128).regex(/^[a-z0-9_:-]+$/)).min(1).max(100),
  reset_target_volume_to_unity: z.boolean().default(false),
}).strict();

/** Switch editor playback to a lightweight, timing-identical audio
 * derivative without changing the render-authority media. */
export const editorAgentPreviewAudioSourceSchema = z.object({
  source_url: proposalSourceUrlSchema,
  baked_gain: finite.gt(0).max(4).default(1),
}).strict();

export const editorAgentOperationSchema = z.object({
  // Models reach for a discriminator; the keys below decide what an operation does, so a label is
  // accepted, ignored and stripped before storage rather than costing a rejected round trip.
  type: z.string().max(64).describe("Optional and ignored: the keys you set (patch, props, create_*, remove_*) decide what the operation does.").optional(),
  element_id: z.string().uuid(),
  create_transition: timelineTransitionCreateSchema.extend({ duration_seconds: transitionNumberSchema("duration_seconds") }).optional(),
  create_audio: editorAgentCreateAudioSchema.optional(),
  create_visual: editorAgentCreateVisualSchema.optional(),
  create_text: editorAgentCreateTextSchema.optional(),
  create_shape: editorAgentCreateShapeSchema.describe("Add a rectangle or ellipse on a visual lane: boxes, bars, underlines, rings, circles and shockwaves. Every shape is its own editable element.").optional(),
  remove_visual: editorAgentRemoveVisualSchema.optional(),
  remove_text: editorAgentRemoveTextSchema.optional(),
  set_lane_order: editorAgentSetLaneOrderSchema.optional(),
  set_output_format: editorAgentSetOutputFormatSchema.optional(),
  opening_sequence_edit: editorAgentOpeningSequenceEditSchema.optional(),
  source_range_cut: editorAgentSourceRangeCutSchema.optional(),
  source_range_restore: editorAgentSourceRangeRestoreSchema.optional(),
  speed_change: editorAgentSpeedChangeSchema.optional(),
  set_preview_audio_source: editorAgentPreviewAudioSourceSchema.optional(),
  use_video_stabilization: editorAgentUseVideoStabilizationSchema.optional(),
  use_recast: editorAgentUseRecastSchema.optional().describe("Replace the people in a placed video clip with a recast of the same moment (Generate's recast models, kept in the Library). The clip keeps its timeline timing; its in-point moves onto the recast's clock"),
  use_voice_enhancement: editorAgentUseVoiceEnhancementSchema.optional(),
  reattach_original_audio: editorAgentReattachOriginalAudioSchema.optional(),
  sync_speech_visual: editorAgentSyncSpeechVisualSchema.optional(),
  replace_captions: editorAgentReplaceCaptionsSchema.optional(),
  patch: editorAgentPatchSchema.optional(),
  props: editorAgentPropsSchema.optional(),
  clear_patch: z.array(clearablePatchFieldSchema).max(1).optional(),
  clear_props: z.array(clearablePropFieldSchema).max(17).optional(),
  /**
   * Why this edit — the only review field the agent authors. The verb, target,
   * and impact shown beside it are DERIVED from the patch (see proposal-review),
   * so a proposal cannot describe itself as doing something it does not do.
   */
  rationale: z.string().max(500).optional(),
  /** Set by the server on operations a block compiled; they are rebuilt from the block's settings on every parse. */
  block_ref: z.object({
    block_id: z.string().min(1).max(64).describe("The block (option.blocks[].block_id) this operation was compiled from."),
    role: z.string().min(1).max(64).describe("The block's role for this operation, e.g. hold, exit, enter, empty_set."),
    index: z.number().int().min(0).describe("Which instance of that role, from 0."),
  }).strict()
    .describe("Set by the server: the block (option.blocks) and role this operation was compiled from. Do not send it.").optional(),
}).strict().superRefine((operation, ctx) => {
  const hasEdit = operation.use_video_stabilization != null
    || operation.use_recast != null
    || operation.use_voice_enhancement != null
    || operation.patch != null
    || operation.props != null
    || Boolean(operation.clear_patch?.length)
    || Boolean(operation.clear_props?.length);
  const structuralCount = Number(operation.create_transition != null) + Number(operation.create_audio != null)
    + Number(operation.create_visual != null)
    + Number(operation.create_text != null)
    + Number(operation.create_shape != null)
    + Number(operation.remove_visual != null)
    + Number(operation.remove_text != null)
    + Number(operation.set_lane_order != null)
    + Number(operation.set_output_format != null)
    + Number(operation.opening_sequence_edit != null)
    + Number(operation.source_range_cut != null)
    + Number(operation.source_range_restore != null)
    + Number(operation.speed_change != null)
    + Number(operation.reattach_original_audio != null)
    + Number(operation.sync_speech_visual != null)
    + Number(operation.replace_captions != null);
  const hasPreviewAudioRepair = operation.set_preview_audio_source != null;
  if (structuralCount === 0 && !hasEdit && !hasPreviewAudioRepair) {
    ctx.addIssue({ code: "custom", message: "Empty mutation" });
  }
  if (structuralCount > 1) {
    ctx.addIssue({ code: "custom", message: "Only one structural operation is allowed per proposal row" });
  }
  if (structuralCount > 0 && hasEdit) {
    ctx.addIssue({ code: "custom", message: "Structural operations cannot be combined with an edit patch" });
  }
  if (hasPreviewAudioRepair && structuralCount > 0 && operation.source_range_restore == null) {
    ctx.addIssue({
      code: "custom",
      path: ["set_preview_audio_source"],
      message: "Preview-audio repair can only accompany source_range_restore on a structural row",
    });
  }
  for (const field of operation.clear_patch ?? []) {
    if (operation.patch && field in operation.patch) ctx.addIssue({ code: "custom", path: ["clear_patch"], message: `${field} cannot be patched and cleared` });
  }
  for (const field of operation.clear_props ?? []) {
    if (operation.props && field in operation.props) ctx.addIssue({ code: "custom", path: ["clear_props"], message: `${field} cannot be patched and cleared` });
  }
});

/** Changed-or-explicitly-cleared field count — the unit every cap is denominated in. */
export function countOperationMutations(operations: readonly z.infer<typeof editorAgentOperationSchema>[]): number {
  return operations.reduce((sum, operation) => sum
    + Object.keys(operation.create_transition ?? {}).length
    + Object.keys(operation.create_audio ?? {}).length
    + Object.keys(operation.create_visual ?? {}).length
    + Object.keys(operation.create_text ?? {}).length
    + Object.keys(operation.create_shape ?? {}).length
    + Number(operation.remove_visual != null)
    + Number(operation.remove_text != null)
    + Number(operation.set_lane_order != null)
    + Number(operation.set_lane_order?.muted_lane_keys != null)
    + Object.keys(operation.set_output_format ?? {}).length
    + Object.keys(operation.opening_sequence_edit ?? {}).length
    + Object.keys(operation.source_range_cut ?? {}).length
    + Object.keys(operation.source_range_restore ?? {}).length
    + Object.keys(operation.speed_change ?? {}).length
    + Object.keys(operation.set_preview_audio_source ?? {}).length
    + Number(operation.use_video_stabilization != null)
    + Number(operation.use_recast != null)
    + Number(operation.use_voice_enhancement != null)
    + Object.keys(operation.reattach_original_audio ?? {}).length
    + Object.keys(operation.sync_speech_visual ?? {}).length
    + Number(operation.replace_captions != null)
    + Object.keys(operation.patch ?? {}).length
    + Object.keys(operation.props ?? {}).length
    + (operation.clear_patch?.length ?? 0)
    + (operation.clear_props?.length ?? 0), 0);
}

const optionIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, "Option ids are lowercase slugs");
const supersededProposalIdSchema = z.string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, "Superseded proposal ids must be safe proposal ids");

const reviewControlSchema = z.object({
  operation_index: z.number().int().min(0),
  target: z.enum(["create_transition", "create_audio", "create_visual", "create_text", "create_shape", "opening_sequence_edit", "replace_captions", "speed_change", "patch", "props", "timing_control"]),
  field: z.string().min(1).max(128),
  // A caption track on a cut-up talk is one compile per talk piece, often more than fifty; one linked dial drives them all.
  linked_operation_indices: z.array(z.number().int().min(0)).min(1).max(500).optional(),
  // Dials sharing a section sit together under it, in review_controls order: one section per beat.
  section: z.string().trim().min(1).max(60).optional(),
}).strict();
type ReviewControlRef = z.infer<typeof reviewControlSchema>;
export type DroppedReviewControl = { index: number; reason: string };

/** A linked dial shows one value for every clip it moves: numbers, colours, or equal wheels and curves. */
function linkedControlValuesMatch(value: unknown, primary: unknown) {
  if (typeof value === "number" || typeof value === "string") return value === primary;
  return Array.isArray(value) && Array.isArray(primary) && value.length === primary.length
    && value.every((item, index) => typeof item === "number" && item === primary[index]);
}

/**
 * Review dials are optional. An invalid one is dropped with its reason instead of
 * rejecting the edit, so a valid change still stages and the agent can repair the dial.
 */
function partitionReviewControls(input: { review_controls?: unknown[]; timing_controls?: readonly unknown[]; operations: readonly unknown[] }) {
  const option = input as { review_controls?: unknown[]; timing_controls?: unknown[]; operations: Record<string, unknown>[] };
  const kept: ReviewControlRef[] = [], dropped: DroppedReviewControl[] = [];
  const controlKeys = new Set<string>();
  for (const [index, raw] of (option.review_controls ?? []).entries()) {
    const parsed = reviewControlSchema.safeParse(raw);
    if (!parsed.success) { dropped.push({ index, reason: parsed.error.issues.map(issue => `${issue.path.join(".") || "control"}: ${issue.message}`).join("; ") }); continue; }
    const ref = parsed.data;
    if (ref.target === "timing_control") {
      const key = `timing:${ref.operation_index}`;
      if (!option.timing_controls?.[ref.operation_index] || ref.field !== "spacing_seconds" || ref.linked_operation_indices || controlKeys.has(key)) {
        dropped.push({ index, reason: "Spacing must reference one declared timing control" }); continue;
      }
      controlKeys.add(key); kept.push(ref); continue;
    }
    const primary = option.operations[ref.operation_index]?.[ref.target] as Record<string, unknown> | undefined;
    const keys: string[] = [];
    const valid = [ref.operation_index, ...(ref.linked_operation_indices ?? [])].every(operationIndex => {
      const target = option.operations[operationIndex]?.[ref.target] as Record<string, unknown> | undefined;
      const key = `${operationIndex}:${ref.target}:${ref.field}`;
      const value = target ? proposalAvailableFieldValue(ref.target, target, ref.field) : undefined;
      // A field may be controlled once, by one dial, including within this dial's own links.
      const repeated = controlKeys.has(key) || keys.includes(key);
      keys.push(key);
      return Boolean(target) && value !== undefined && isSupportedProposalControl(ref.target, ref.field, value) && !repeated
        && (operationIndex === ref.operation_index || linkedControlValuesMatch(value, proposalAvailableFieldValue(ref.target, primary, ref.field)));
    });
    if (!valid) { dropped.push({ index, reason: "Control must uniquely reference a supported field this option proposes; linked values (numbers, colours, wheels or curves) must match" }); continue; }
    for (const key of keys) controlKeys.add(key);
    kept.push(ref);
  }
  return { kept, dropped };
}

const DIAL_TARGETS = ["patch", "props", "create_visual", "create_text", "create_shape", "create_audio", "create_transition", "opening_sequence_edit", "replace_captions", "speed_change"] as const;

/**
 * Default review dials, chosen deterministically when the agent sends none: every supported
 * field the option changes becomes its own main dial, in operation order. It never links
 * dials (grouping is an editorial choice) and never trims to the slider limit, so an
 * oversized draft is still refused by the control budget rather than hiding controls.
 */
export function defaultReviewControls(operations: readonly Record<string, unknown>[]): ReviewControlRef[] {
  return operations.flatMap((operation, operationIndex) => DIAL_TARGETS.flatMap(target => {
    const values = operation[target] as Record<string, unknown> | undefined;
    if (!values || typeof values !== "object") return [];
    const fields = target === "create_transition" ? TRANSITION_CONTROLS.map(control => control.field) : [...Object.keys(values), ...derivedProposalFields(target, values), ...derivedChoiceFields(target, values)];
    return fields.filter(field => {
      const value = proposalAvailableFieldValue(target, values, field);
      return value !== undefined && isSupportedProposalControl(target, field, value)
        && !(target === "patch" && timingFieldOwnedByTrim(operation as { patch?: Record<string, unknown> }, field))
        && !isCameraSizeField(operation, target, field);
    }).map(field => ({ operation_index: operationIndex, target, field }));
  }));
}

// Identities and bindings are not creator decisions, so they are never dial gaps.
const NOT_A_DIAL = /(?:_ids?|_model)$|^(?:source_url|lane_key|speech_sync_binding)$/;

/**
 * Changed fields on existing clips that no review dial can tune, recorded on the proposal at
 * authoring time so an uploaded audit trail shows capability gaps without rerunning this code
 * (which changes as dials are added). Derived dials count: a crop or a keyframed zoom is covered.
 */
export function controlGaps(operations: readonly Record<string, unknown>[]) {
  return operations.flatMap((operation, operationIndex) => (["patch", "props"] as const).flatMap(target => {
    const values = operation[target] as Record<string, unknown> | undefined;
    if (!values || typeof values !== "object") return [];
    const derived = derivedProposalFields(target, values);
    return Object.entries(values).flatMap(([field, value]) => {
      if (NOT_A_DIAL.test(field) || isSupportedProposalControl(target, field, value)) return [];
      if (field === "mask_inset" && derived.some(name => name.startsWith("mask_inset_"))) return [];
      if (field === "place" && derived.includes("place_gap")) return [];
      if (field === "media_scale_keyframes" && derived.includes("media_scale_peak")) return [];
      // Each animated track is its own gap, except a zoom the peak dial covers.
      if (field === "transition_keyframes" && value && typeof value === "object") {
        return Object.keys(value).filter(track => !(track === "media_scale" && derived.includes("media_scale_peak")))
          .map(track => ({ operation_index: operationIndex, target, field: `${field}.${track}`, value_kind: "keyframes" as const }));
      }
      const value_kind = field.endsWith("keyframes") || field === "playback_speed_steps" ? "keyframes" as const
        : Array.isArray(value) ? "list" as const : value === null ? "object" as const
        : typeof value === "boolean" || typeof value === "number" || typeof value === "string" ? typeof value as "boolean" | "number" | "string" : "object" as const;
      return [{ operation_index: operationIndex, target, field, value_kind }];
    });
  }));
}

/**
 * Authoring-time annotations: every option records its control_gaps, and one sent without
 * dials (or with an empty list) gets defaultReviewControls. Applied by the create and preflight routes on the raw draft, never
 * when a stored proposal is re-parsed, so historical review cards keep their dials.
 */
export function withDefaultReviewControls<T>(raw: T): T {
  const proposal = raw as { options?: unknown };
  if (!proposal || typeof proposal !== "object" || !Array.isArray(proposal.options)) return raw;
  return { ...proposal, options: proposal.options.map(option => {
    const draft = option as { review_controls?: unknown; operations?: unknown };
    if (!draft || typeof draft !== "object" || !Array.isArray(draft.operations)) return option;
    const operations = draft.operations.filter(item => item && typeof item === "object");
    const gaps = controlGaps(operations);
    const annotated = { ...draft, control_gaps: gaps.length ? gaps : undefined };
    // An explicit [] is a choice (e.g. a motion graphic whose own controls are the dials): every
    // supported field stays in Advanced adjustments. Omitting it asks the server to choose.
    if (Array.isArray(draft.review_controls)) return { ...annotated, review_controls: withSoundVolumeFirst(draft.review_controls, operations) };
    return { ...annotated, review_controls: withSoundVolumeFirst(defaultReviewControls(operations), operations), review_controls_origin: "server" };
  }) } as T;
}

/** A sound's volume is always a main dial, shown first: the one setting every sound card is tuned by. */
function withSoundVolumeFirst(controls: readonly unknown[], operations: readonly Record<string, unknown>[]): unknown[] {
  const isVolume = (ref: unknown): ref is ReviewControlRef => Boolean(ref) && typeof ref === "object"
    && (ref as ReviewControlRef).field === "volume" && ["create_audio", "patch"].includes((ref as ReviewControlRef).target);
  const covered = (index: number) => controls.some(ref => isVolume(ref)
    && (ref.operation_index === index || (ref.linked_operation_indices ?? []).includes(index)));
  const missing = operations.flatMap((operation, index) => (["create_audio", "patch"] as const).flatMap(target => {
    const values = operation[target] as Record<string, unknown> | undefined;
    if (!values || typeof values !== "object" || (target === "patch" && values.volume === undefined)) return [];
    const value = proposalAvailableFieldValue(target, values, "volume");
    return value !== undefined && isSupportedProposalControl(target, "volume", value) && !covered(index)
      ? [{ operation_index: index, target, field: "volume" }] : [];
  }));
  return [...controls.filter(isVolume), ...missing, ...controls.filter(ref => !isVolume(ref))];
}

/** Non-fatal problems the agent should fix in its next draft, such as dropped review dials. */
export function proposalWarnings(proposal: { options: { id: string; dropped_review_controls?: DroppedReviewControl[] }[] }) {
  return proposal.options.flatMap(option => (option.dropped_review_controls ?? [])
    .map(item => `Option ${option.id}: review_controls[${item.index}] was dropped (${item.reason}); the edit is staged without that dial.`));
}


// Card text is read by the creator in the review panel; proposal_create refuses build vocabulary (card-wording.ts).
const PLAIN_CARD_WORDS = "Describe what the viewer will see or hear, in everyday words, as the creator would say it. No build terms (baked, native text, transparent clip, element, alpha, composite, props), field names or ids; name clips by what they show. Quote on-screen words.";
const CARD_TITLE_TEXT = `The card's title: one line naming the visible or audible change, e.g. "The DREAMCUT word becomes its own clip you can edit". ${PLAIN_CARD_WORDS}`;
const CARD_LABEL_TEXT = `Short name for this option, e.g. "Snappier" or "Slide in from the left". ${PLAIN_CARD_WORDS}`;
const CARD_OPTION_TEXT = `What this option changes on screen or in the sound. ${PLAIN_CARD_WORDS}`;
export const editorAgentOptionSchema = z.object({
  speaker_overlap_intended: z.boolean().describe("Set true only when the creator asked for a graphic in this option to cover the speaker's face. Without it, an option whose text or drawing lands on the face is refused.").optional(),
  coordinate_fallback_reason: z.string().trim().min(12).max(500).describe("Why text or shapes in this option are placed by coordinates (absX/absY, media_offset_x/y) instead of place: the relation the place vocabulary cannot express, the creator's request for exact values, or the measuring tool the values came from (svg_pieces_compile returns one). Without it, coordinate placement on text and shapes is refused.").optional(),
  review_questions: z.array(z.enum(["speed", "hold", "reveal"])).max(3).optional(),
  preserve_fields: z.array(z.object({ element_id: z.string().min(1), fields: z.array(z.string().regex(/^(?:source_url|timeline_start|duration|trim_start|trim_end|playback_rate|lane_key|props\.[A-Za-z][A-Za-z0-9_]*)$/)).min(1).max(100) }).strict()).max(100).optional(),
  timing_controls: z.array(proposalTimingControlSchema).max(32).optional(),
  dropped_review_controls: z.array(z.object({ index: z.number().int().min(0).describe("Position of the dropped dial in review_controls."), reason: z.string().max(2_000).describe("Why the dial was dropped.") }).strict()).max(50)
    .describe("Set by the server when it drops an invalid review dial; do not send it.").optional(),
  review_controls: z.array(z.unknown()).max(50).describe("Usually omit it: the server makes every supported field this option changes a main dial. Send it only to choose different main dials or link equal values across clips: each {operation_index, target, field, linked_operation_indices?, section?} exposes one field this option proposes. For a sequence of beats (stops, hops, sections), give every dial of one beat the same section, named by what the viewer sees there (for example To the pole), and list the beats in time order: the card shows one heading per section in that order. Send [] when no field needs a main dial (for example a motion graphic whose own controls are the dials); every supported field stays in Advanced adjustments. A sound's volume is always a main dial, shown first. An invalid dial is dropped with a reason and the edit still stages.").optional(),
  motion_main_controls: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,47}$/)).max(15).describe("Your choice of a placed motion graphic's main dials: the ids of its controls the creator most likely wants for this change, judged each time (see the dreamcut-proposals skill). The rest sit in Advanced adjustments. [] puts them all in Advanced. Omitted: the card leads with the settings that differ from the render the graphic replaces, or every dial for a new graphic. Ids a graphic does not declare are ignored.").optional(),
  review_controls_origin: z.enum(["agent", "server"]).describe("Set by the server: who chose the main dials; do not send it.").optional(),
  control_gaps: z.array(z.object({
    operation_index: z.number().int().min(0).describe("Operation whose field has no dial."),
    target: z.enum(["patch", "props"]).describe("Where the field is set."),
    field: z.string().min(1).max(128).describe("The changed field the creator cannot tune."),
    value_kind: z.enum(["boolean", "number", "string", "list", "keyframes", "object"]).describe("Shape of the value, to tell toggles, lists and animation apart."),
  }).strict()).max(200).describe("Set by the server: changed fields the creator cannot tune from the review card; do not send it.").optional(),
  preview_range: z.object({ start_seconds: finite.min(0), end_seconds: finite.gt(0) }).strict().refine(range => range.end_seconds > range.start_seconds, "Preview end must follow its start").optional(),
  id: optionIdSchema,
  label: z.string().min(1).max(120).describe(CARD_LABEL_TEXT),
  recommended: z.boolean(),
  summary: z.string().min(1).max(2_000).describe(CARD_OPTION_TEXT),
  requested_mutations: z.number().int().min(0).max(EDITOR_AGENT_MAX_MUTATIONS).describe("Omit it; the server counts the fields this option changes. A value you send must equal that count.").optional(),
  operations: z.array(editorAgentOperationSchema).max(EDITOR_AGENT_MAX_MUTATIONS).describe("The changes, applied in order. With operations_from, the compiled operations come first and these follow."),
  operations_from: z.array(z.object({ compile_id: z.string().uuid().describe("A compile_id returned by a compile tool such as caption_proposal_compile, for this card's expected_revision.") }).strict()).min(1).max(8)
    .describe("Use a compile tool's stored operations instead of pasting them: they are placed first, in this order, and their review_controls are used when the option sends none.").optional(),
  blocks: z.array(blockInstanceSchema).max(16)
    .describe("Building blocks (see proposal-building-blocks): each is a registered kind with measured inputs and typed settings. The server compiles them to operations after `operations`, on every preview, dial move and approval, and their settings are the card's dials (no review_controls needed). Send settings only to depart from the defaults.").optional(),
}).strict().superRefine((option, ctx) => {
  if (option.operations_from) ctx.addIssue({ code: "custom", path: ["operations_from"], message: "Compiled operations are expanded by proposal_create and proposal_spatial_preflight; send this card through one of them" });
  if (!option.operations.length && !option.operations_from && !option.blocks?.length) ctx.addIssue({ code: "custom", path: ["operations"], message: "An option needs at least one operation or block" });
  const blockIds = new Set<string>();
  for (const [index, block] of (option.blocks ?? []).entries()) {
    if (blockIds.has(block.block_id)) ctx.addIssue({ code: "custom", path: ["blocks", index, "block_id"], message: `Duplicate block id ${block.block_id}` });
    blockIds.add(block.block_id);
  }
  validateTimingControls({ ...option, review_controls: partitionReviewControls(option).kept }, ctx);
  for (const [index, operation] of option.operations.entries()) {
    try {
      const values = maskWindowValues(operation.props);
      if (!values) continue;
      if (operation.props?.mask_inset_keyframes) throw new Error("Use picture-window controls instead of separate mask keyframes");
      maskWindowPoints(values, operation.patch?.duration ?? 600);
      const foreground = option.operations.find(candidate => candidate.element_id === values.mask_window_foreground_id)?.create_visual;
      const end = values.mask_window_reopen_start_seconds + values.mask_window_reopen_duration_seconds;
      if (!foreground || foreground.type !== "video_clip" || foreground.has_alpha !== true || foreground.playback_rate !== 1
        || foreground.timeline_start !== values.mask_window_close_start_seconds
        || foreground.source_start_seconds !== values.mask_window_close_start_seconds
        || Math.abs(Number(foreground.source_end_seconds) - end) > 1e-6) throw new Error("Foreground source window must follow the picture-window timing");
    } catch (error) { ctx.addIssue({code: "custom", path: ["operations", index], message: String(error)}); }
  }
  const reviewControls = partitionReviewControls(option).kept;
  for (const question of option.review_questions ?? []) {
    const ready = reviewControls.some(ref => question === "hold"
      ? ref.target === "timing_control" && option.timing_controls?.[ref.operation_index]?.kind === "hold"
      : question === "speed"
        ? ["playback_rate", "mediaFillVideoPlaybackRate", "playback_ramp_fast_rate", "playback_ramp_top_rate"].includes(ref.field)
        : ["animationInDuration", "animationOutDuration"].includes(ref.field));
    if (!ready) ctx.addIssue({ code: "custom", path: ["review_controls"], message: `The ${question} review question needs an explicit supported ${question === "hold" ? "bound hold timing control" : question === "speed" ? "playback-rate control" : "entrance/exit duration control"} in the first draft` });
  }
  if (option.requested_mutations !== undefined && option.requested_mutations !== countOperationMutations([...authoredOperations(option.operations), ...compiledBlockOperations(option)])) {
    ctx.addIssue({ code: "custom", path: ["requested_mutations"], message: "must equal the number of changed or cleared fields in this option" });
  }
  const seen = new Set<string>();
  for (const operation of [...authoredOperations(option.operations), ...compiledBlockOperations(option, ctx)]) {
    if (seen.has(operation.element_id)) {
      ctx.addIssue({ code: "custom", path: ["operations"], message: `Duplicate operation for element ${operation.element_id}` });
    }
    seen.add(operation.element_id);
  }
}).transform(option => {
  const { kept, dropped } = partitionReviewControls(option);
  const { review_controls: requested, dropped_review_controls: earlier = [], review_controls_origin: origin, ...rest } = option;
  const all = [...earlier, ...dropped];
  // Blocks compile on every parse, so a tuned setting rebuilds its operations here.
  const operations = [...authoredOperations(rest.operations), ...compiledBlockOperations(option)];
  // The server owns the count; an agent only restates it when it chooses to.
  return { ...rest, operations: operations.map(withoutLabel), requested_mutations: countOperationMutations(operations), ...(requested ? { review_controls: kept, ...(origin || requested.length ? { review_controls_origin: origin ?? "agent" } : {}) } : {}), ...(all.length ? { dropped_review_controls: all } : {}) };
});

/** An operation without its ignored `type` label. */
function withoutLabel<T extends { type?: string }>({ type: _label, ...operation }: T): Omit<T, "type"> { return operation; }

type ParsedOperation = z.infer<typeof editorAgentOperationSchema>;
/** The operations the agent wrote: block-compiled ones (block_ref) are rebuilt from their settings. */
function authoredOperations<T extends { block_ref?: unknown }>(operations: readonly T[]): T[] {
  return operations.filter(operation => !operation.block_ref);
}

/**
 * Compile an option's blocks to operations and check each against the operation schema. Compiled
 * operations are deterministic in settings and inputs, so this runs on every parse: review, preview,
 * tuning and approval all see the same result. Problems are reported on the block, never as an index.
 */
function compiledBlockOperations(option: { blocks?: BlockInstance[] }, ctx?: z.RefinementCtx): ParsedOperation[] {
  const compiled: ParsedOperation[] = [];
  for (const [index, block] of (option.blocks ?? []).entries()) {
    try {
      for (const operation of compileBlock(block)) {
        const parsed = editorAgentOperationSchema.safeParse(operation);
        if (!parsed.success) throw new Error(`Block "${block.block_id}" (${block.kind}) compiled an invalid ${operation.block_ref.role} operation: ${parsed.error.issues.map(issue => `${issue.path.join(".") || "operation"}: ${issue.message}`).join("; ")}`);
        compiled.push(parsed.data);
      }
    } catch (error) {
      if (!ctx) throw error;
      ctx.addIssue({ code: "custom", path: ["blocks", index], message: error instanceof Error ? error.message : String(error) });
    }
  }
  return compiled;
}

/**
 * Server-owned block fields on a raw draft: the id seed (element ids derive from it, so they are
 * stable for the card's life), the project frame grid, and raw operations sent as an
 * `operations@1` block hoisted into `operations`.
 */
function withBlockContext<T>(raw: T, frameRate: number): T {
  const proposal = raw as { options?: unknown; expected_revision?: unknown };
  if (!proposal || typeof proposal !== "object" || !Array.isArray(proposal.options)) return raw;
  const seed = typeof proposal.expected_revision === "string" ? proposal.expected_revision.slice(0, 16) : "draft";
  return { ...proposal, options: proposal.options.map(option => {
    const draft = option as { blocks?: unknown; operations?: unknown };
    if (!draft || typeof draft !== "object" || !Array.isArray(draft.blocks)) return option;
    const blocks = draft.blocks.filter(block => block && typeof block === "object") as Record<string, unknown>[];
    const hoisted = blocks.filter(block => block.kind === OPERATIONS_BLOCK_KIND).flatMap(block => {
      const operations = (block.inputs as { operations?: unknown } | undefined)?.operations;
      return Array.isArray(operations) ? operations : [];
    });
    const rest = blocks.filter(block => block.kind !== OPERATIONS_BLOCK_KIND).map(block => ({ ...block, seed: block.seed ?? seed, frame_rate: block.frame_rate ?? frameRate }));
    return { ...draft, operations: [...(Array.isArray(draft.operations) ? draft.operations : []), ...hoisted], ...(rest.length ? { blocks: rest } : { blocks: undefined }) };
  }) } as T;
}

const capsSchema = z.object({
  max_mutations: z.number().int().min(0).max(EDITOR_AGENT_MAX_MUTATIONS).describe("Omit it; the server applies its runtime cap. A value you send must equal that cap.").optional(),
  requested_mutations: z.number().int().min(0).max(EDITOR_AGENT_MAX_MUTATIONS).describe("Omit it; the server counts the changed fields. A value you send must equal that count.").optional(),
  max_renders: z.number().int().min(0).max(1).default(0).describe("Renders the proposal may request; 0 (default) for ordinary edits. Export happens only on an explicit creator request."),
}).strict().default({ max_renders: 0 }).describe("Optional change budget; the server derives the counts from the operations.");

/** Fill the server-owned counts: the widest option, or the flat operation list for schema 1. */
function derivedCaps(caps: z.infer<typeof capsSchema>, counted: number) {
  return { max_mutations: caps.max_mutations ?? counted, requested_mutations: counted, max_renders: caps.max_renders };
}

export const proposalWaveSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).describe("Shared by every step of one larger edit, e.g. \"opener-ep1\"."),
  step: z.number().int().min(1).max(20).describe("This step's place in the queue, from 1. Order steps the way a creator would settle them: placement and timing before sound, sound before polish."),
  title: z.string().trim().min(1).max(48).describe("A few plain words naming what this step changes, shown in the queue, e.g. \"Place the opener\" or \"Sound effects\"."),
  needs_steps: z.array(z.number().int().min(1).max(19)).max(19).optional().describe("Legacy: earlier steps this one builds on. A step must apply on its own whatever happens to the others, so new steps omit it (the default is none); steps that depend on each other belong in one card."),
}).strict().superRefine((wave, ctx) => {
  if (wave.needs_steps?.some(step => step >= wave.step)) ctx.addIssue({ code: "custom", path: ["needs_steps"], message: "can only name earlier steps" });
}).describe("Send a large edit as a queue of small steps the creator settles one after another. Each step is its own proposal_create call with the same wave id, and each must apply on its own in any order: approving, tuning or rejecting one never breaks another.");

const proposalHeadShape = {
  responds_to_feedback_ids: feedbackIdsSchema.optional(),
  project_id: projectIdSchema,
  expected_revision: z.string().length(64).regex(/^[0-9a-f]+$/).describe("The timeline revision this proposal was written against: the revision from your latest timeline_get. A stale revision fails rather than overwriting newer edits."),
  rebase_policy: z.enum(["strict", "independent"]).default("strict").describe("strict (default) requires the exact revision; independent lets disjoint, independent proposal cards apply after other edits."),
  mode: z.enum(["workshop", "production_finish"]).describe("workshop for ordinary editing proposals; production_finish only for final delivery polish the creator asked for."),
  decision: z.enum(["propose", "no_change", "blocked"]).describe("propose when options change the timeline; no_change when nothing should change; blocked when a required capability or input is missing (explain it in unresolved_gaps)."),
  summary: z.string().min(1).max(2_000).describe(CARD_TITLE_TEXT),
  assumptions: z.array(z.string().max(1_000)).max(20),
  unresolved_gaps: z.array(z.string().max(1_000)).max(20),
  /**
   * Explicit proposal lineage. Approval resolves these older pending drafts as
   * superseded in the same human action instead of leaving them behind as
   * misleading stale work.
   */
  supersedes_proposal_ids: z.array(supersededProposalIdSchema).max(100).default([]),
  /**
   * One step of a larger edit sent as an ordered queue. The creator tunes and approves one
   * step at a time; a step that builds on earlier ones is drafted on top of them and opens
   * once they are approved.
   */
  wave: proposalWaveSchema.optional(),
  caps: capsSchema,
};

/** Canonical shape. `caps.requested_mutations` is the MAX across options — the most that any single approval could change. */
export const editorAgentProposalSchema = z.object({
  ...proposalHeadShape,
  schema_version: z.literal(2),
  options: z.array(editorAgentOptionSchema).max(EDITOR_AGENT_MAX_OPTIONS),
}).strict().superRefine((proposal, ctx) => {
  if (new Set(proposal.supersedes_proposal_ids).size !== proposal.supersedes_proposal_ids.length) {
    ctx.addIssue({ code: "custom", path: ["supersedes_proposal_ids"], message: "must not contain duplicate proposal ids" });
  }
  if (proposal.decision !== "propose") {
    if (proposal.options.length !== 0) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "blocked/no_change proposals cannot mutate" });
    }
    return;
  }
  if (proposal.options.length === 0) {
    ctx.addIssue({ code: "custom", path: ["options"], message: "a propose decision needs at least one option" });
    return;
  }
  const ids = new Set<string>();
  for (const option of proposal.options) {
    if (ids.has(option.id)) ctx.addIssue({ code: "custom", path: ["options"], message: `Duplicate option id ${option.id}` });
    ids.add(option.id);
    if (proposal.caps.max_mutations !== undefined && option.requested_mutations > proposal.caps.max_mutations) {
      ctx.addIssue({ code: "custom", path: ["options"], message: `Option ${option.id} exceeds the declared mutation cap` });
    }
  }
  const recommended = proposal.options.filter((option) => option.recommended);
  if (recommended.length !== 1) {
    ctx.addIssue({ code: "custom", path: ["options"], message: "exactly one option must be recommended" });
  }
  const widest = Math.max(...proposal.options.map((option) => option.requested_mutations));
  if (proposal.caps.requested_mutations !== undefined && proposal.caps.requested_mutations !== widest) {
    ctx.addIssue({ code: "custom", path: ["caps", "requested_mutations"], message: "must equal the largest option's mutation count" });
  }
  if (proposal.caps.max_mutations !== undefined && widest > proposal.caps.max_mutations) {
    ctx.addIssue({ code: "custom", path: ["caps", "max_mutations"], message: "is below the number of fields the widest option changes" });
  }
}).transform(proposal => ({ ...proposal, caps: derivedCaps(proposal.caps, Math.max(0, ...proposal.options.map(option => option.requested_mutations))) }));

/** Wire-compatible schema 1: a flat operation list, normalized to a single option below. */
const editorAgentProposalV1Schema = z.object({
  ...proposalHeadShape,
  schema_version: z.literal(1),
  operations: z.array(editorAgentOperationSchema).max(EDITOR_AGENT_MAX_MUTATIONS),
}).strict().superRefine((proposal, ctx) => {
  if (new Set(proposal.supersedes_proposal_ids).size !== proposal.supersedes_proposal_ids.length) {
    ctx.addIssue({ code: "custom", path: ["supersedes_proposal_ids"], message: "must not contain duplicate proposal ids" });
  }
  const counted = countOperationMutations(proposal.operations);
  if (proposal.caps.requested_mutations !== undefined && proposal.caps.requested_mutations !== counted) {
    ctx.addIssue({ code: "custom", path: ["caps", "requested_mutations"], message: "must equal the number of changed or cleared fields" });
  }
  if (proposal.caps.max_mutations !== undefined && counted > proposal.caps.max_mutations) {
    ctx.addIssue({ code: "custom", path: ["operations"], message: "exceeds declared mutation cap" });
  }
  if (proposal.decision !== "propose" && proposal.operations.length !== 0) {
    ctx.addIssue({ code: "custom", path: ["operations"], message: "blocked/no_change proposals cannot mutate" });
  }
});

export type EditorAgentProposal = z.infer<typeof editorAgentProposalSchema>;
export type EditorAgentOption = z.infer<typeof editorAgentOptionSchema>;
export type EditorAgentOperation = z.infer<typeof editorAgentOperationSchema>;

/**
 * Parse either wire version into the canonical schema-2 shape. A schema-1
 * proposal becomes one recommended option so older callers keep their meaning.
 */
export function parseEditorAgentProposal(raw: unknown): EditorAgentProposal {
  const version = (raw as { schema_version?: unknown } | null)?.schema_version;
  if (version === 1) {
    const v1 = editorAgentProposalV1Schema.parse(raw);
    const { operations, schema_version: _ignored, ...head } = v1;
    const caps = derivedCaps(head.caps, countOperationMutations(operations));
    return {
      ...head,
      caps,
      schema_version: 2,
      options: operations.length === 0 ? [] : [{
        id: SOLE_OPTION_ID,
        label: "Proposed edit",
        recommended: true,
        summary: v1.summary,
        requested_mutations: caps.requested_mutations,
        operations: operations.map(withoutLabel),
      }],
    };
  }
  const parsed = editorAgentProposalSchema.parse(withBlockContext(raw, projectRateOrCurrent((raw as { project_id?: string } | null)?.project_id)));
  return editorAgentProposalSchema.parse({ ...parsed, options: parsed.options.map(option => ({
    ...option, operations: option.operations.map(op => compileProposalSubjectEntrance(compileProposalSpeedRamp(op))),
  })) });
}

export function proposalOption(proposal: EditorAgentProposal, optionId?: string): EditorAgentOption {
  if (proposal.options.length === 0) throw new Error("Proposal contains no options");
  if (optionId == null) {
    const recommended = proposal.options.find((option) => option.recommended);
    if (!recommended) throw new Error("Proposal has no recommended option; pass an option id");
    return recommended;
  }
  const match = proposal.options.find((option) => option.id === optionId);
  if (!match) throw new Error(`Unknown option ${optionId}`);
  return match;
}

const CAPTION_ONLY_PROPS = new Set([
  "text", "positionPreset", "positionNudgeY", "maxWidth", "textAlign",
  "fontPreset", "fontSizePx", "handwritingWeight", "textColor", "styleVariant", "benchmarkRotationDeg", "benchmarkStackLayout",
  "timingMode", "wordTimings", "activeWordColor",
  "inverseMaskMotion", "inverseMaskDriftXPercent", "inverseMaskDriftYPercent",
  "inverseMaskSweepIntensity", "inverseMaskSweepCycles",
  "mediaFillScene", "mediaFillVideoPreviewUrl", "mediaFillVideoUrl", "mediaFillVideoPlaybackRate", "mediaFillUrls", "mediaFillChangeTimesSeconds", "mediaFillSecondsPerImage", "mediaFillCrossfadeSeconds",
  "mediaFillFirstTransition",
  "mediaFillTransition", "mediaFillSlideDirection", "mediaFillTransitionBlur",
  "mediaFillScale", "mediaFillPanPercent", "cameraRevealFontWeight",
  "cameraRevealTypographySizing",
  "cameraRevealMediaFit", "cameraRevealHoldSeconds", "cameraRevealShutterAngle",
  "cameraRevealBlurSamples", "cameraRevealResolveMode",
  "cameraRevealResolveStartSeconds", "cameraRevealResolveDurationSeconds",
  "cameraRevealResolveBackgroundColor", "cameraRevealResolveTextColor",
]);
const SURFACE_PROPS = new Set([
  "surfaceMode", "surfacePerspectivePx", "surfaceDepthPx",
  "surfaceRotateXDeg", "surfaceRotateYDeg", "surfaceRotateZDeg",
  "surfaceSkewXDeg", "surfaceSkewYDeg", "surfaceOpacity", "surfaceBlurPx", "surfaceBlendMode",
]);
const ANIMATION_PROPS = new Set(["animationIn", "animationOut", "animationInDuration", "animationOutDuration"]);
const EFFECT_PROPS = new Set<string>(agentEffectControls.map((control) => control.prop));
const VISUAL_TYPES = new Set(["still", "video_clip"]);
// A drawn shape carries its own transform (create_shape sets it), so a later card may move, size, turn or fade it.
const SHAPE_TRANSFORM_PROPS = new Set(["media_offset_x", "media_offset_y", "media_scale", "media_rotation", "media_opacity"]);
const AUDIO_CAPABLE_TYPES = new Set(["video_clip", "vo_segment", "vo_full", "music", "sound_effect"]);
const TRIMMABLE_TYPES = new Set(["video_clip", "vo_segment", "vo_full", "music", "sound_effect"]);

export function editorAgentCapabilities() {
  return {
    mutation_count_semantics: "changed_or_explicitly_cleared_fields",
    patch_fields: ["timeline_start", "duration", "trim_start", "trim_end", "lane_key", "lane_index", "volume", "fade_in", "fade_out", "playback_rate"],
    // Video picture and its sound play backward at one constant speed; speed steps and ramps do not combine with it.
    playback_props: ["playback_reverse"],
    caption_props: [...CAPTION_ONLY_PROPS],
    surface_props: [...SURFACE_PROPS],
    animation_props: [...ANIMATION_PROPS],
    effect_controls: agentEffectControls.map((control) => ({
      prop: control.prop,
      kind: control.kind,
      ...(control.kind === "enum" ? { values: control.values } : control.kind === "color" ? {}
        : control.kind === "list" ? { lengths: control.lengths, item_bounds: control.itemBounds } : { min: control.min, max: control.max }),
      identity: control.identity,
      keyframeable: control.keyframeable,
      ui_control: control.uiControl,
      ...(AGENT_CHROMA_KEY_FIELDS.has(control.prop)
        ? {
            model: "color-key-v1 (derived automatically; never write chroma_key_model)",
            enable_rule: `${CHROMA_KEY_COLOR_FIELD} is the enable switch: set it to key the clip, clear it to turn the key off. The three amounts do nothing on their own.`,
          }
        : {}),
      ...(AGENT_COLOR_GRADE_FIELDS.has(control.prop)
        ? {
            units: control.prop === "grade_exposure_ev"
              ? "EV"
              : control.prop === "grade_hue_degrees"
                ? "degrees"
                : control.kind === "list"
                  ? "see the field description"
                  : "normalized multiplier or relative balance",
            color_space: "scene-linear, Rec.709 primaries; tone positions on the grade axis (0.48 mid grey, 0.68 SDR white)",
            model: "dreamcut-scene-v2 (derived automatically; never write color_grade_model)",
          }
        : {}),
    })),
    clear_patch: ["trim_end"],
    clear_props: ["textColor", "wordTimings"],
    applicability: {
      visual_effect_types: [...VISUAL_TYPES],
      audio_capable_types: [...AUDIO_CAPABLE_TYPES],
      trimmable_types: [...TRIMMABLE_TYPES],
      caption_props_type: "caption_text",
      surface_props_types: ["caption_text", ...VISUAL_TYPES],
      position_fields_require_unlocked: true,
    },
  };
}

function numericDelta(current: unknown, next: unknown) {
  return typeof current === "number" && Number.isFinite(current) && typeof next === "number"
    ? Math.abs(next - current)
    : 0;
}

function normalizeEffectProps(props: Record<string, unknown> | undefined) {
  if (!props) return undefined;
  const next = { ...props };
  for (const control of agentEffectControls) {
    if (control.prop in next) next[control.prop] = control.normalize(next[control.prop]);
  }
  return next;
}

/** Fields describing the clip's current prepared source; a recast prepares its own. */
const RECAST_REPLACED_PROPS = ["preview_source_url", "preview_audio_source_url", "preview_audio_baked_gain", "archival_source_url", "source_duration_seconds", "has_alpha", "media_preparation_recipe",
  "render_authority_source_url", "render_authority_sha256", "preview_proxy_sha256", "source_sha256", "preview_sha256"];
function applyRecast(projectId: string, element: TimelineElement, recast: z.infer<typeof editorAgentUseRecastSchema>) {
  const original = { ...((element.props ?? {}) as Record<string, unknown>) };
  // Speed ramps keep several props on the source clock (slow start/end, profile origin and holds, mask
  // keyframes) that are not yet moved onto a recast's clock, so a ramped clip is refused rather than mistimed.
  if (Object.entries(original).some(([key, value]) => key.startsWith("playback_ramp_") && value != null)) {
    throw new Error("This clip has a speed ramp, which a recast cannot keep in time yet; remove the ramp, recast, then add it again");
  }
  const kept = Object.fromEntries(Object.entries(original).filter(([key]) => !RECAST_REPLACED_PROPS.includes(key) && key !== "recast"));
  const prepared = preparedPlacement(projectId, recast.recast_source_url, { ...kept, archival_source_url: recast.recast_source_url });
  const rate = element.playback_rate > 0 ? element.playback_rate : 1;
  const length = Number(prepared.props.source_duration_seconds);
  const previous = original.recast as { original_source_url?: string; original_trim_start?: number; source_window_start?: number } | undefined;
  // Windows are on the original footage's clock; a clip already recast sits on its recast's clock.
  const originalIn = element.trim_start + (previous?.source_window_start ?? 0);
  // The consumed source window follows the clip's speed steps (source-clock `source_t`), not duration × rate.
  const consumedEnd = isPlaybackReversed(element)
    ? getSpeedSourceWindow(element).end ?? element.trim_start + element.duration * rate
    : timelineTimeToSourceTime(element, element.duration);
  const inPoint = Math.round((originalIn - recast.source_window_start) * 1e6) / 1e6;
  const used = Math.round((consumedEnd - element.trim_start) * 1e6) / 1e6;
  if (inPoint < -0.02 || !Number.isFinite(length) || inPoint + used > length + 0.05) {
    throw new Error(`The recast covers ${recast.source_window_start.toFixed(2)}–${(recast.source_window_start + (Number.isFinite(length) ? length : 0)).toFixed(2)}s of the source, but this clip uses ${originalIn.toFixed(2)}–${(originalIn + used).toFixed(2)}s; recast a window that contains the clip`);
  }
  // Source-clock keyframes (speed steps' `source_t`) move with the in-point onto the recast's clock.
  const shift = Math.max(0, inPoint) - element.trim_start;
  const keyframes = readKeyframeMap(prepared.props);
  const shifted = Object.fromEntries(Object.entries(keyframes).map(([field, points]) => [field,
    points.map(point => typeof point.source_t === "number" ? { ...point, source_t: Math.round((point.source_t + shift) * 1e6) / 1e6 } : point)]));
  const props = Object.keys(keyframes).length ? writeKeyframeMap(prepared.props, shifted) : prepared.props;
  element.props = { ...props, recast: { schema_version: 1, generation_id: recast.generation_id, model: recast.model, source_window_start: recast.source_window_start,
    // A recast of a recast still records the footage it first replaced.
    original_source_url: previous?.original_source_url ?? (typeof original.archival_source_url === "string" ? original.archival_source_url : element.source_url),
    original_trim_start: previous?.original_trim_start ?? originalIn } };
  element.source_url = prepared.source_url;
  element.trim_start = Math.max(0, inPoint);
  element.trim_end = Math.max(0, Math.round((length - element.trim_start - used) * 1e6) / 1e6);
}

/**
 * A placed motion graphic may take a new render of its own composition (its timing then follows
 * the render), and a synthesized sound effect may take another synthesized sound (its length then
 * follows the new file). Real footage keeps its synchronized source.
 */
function isRenderSwap(element: Pick<TimelineElement, "type" | "source_url">, next: unknown): boolean {
  if (typeof next !== "string" || !element.source_url) return false;
  const from = motionSubjectFromSourceUrl(element.source_url), to = motionSubjectFromSourceUrl(next);
  if (!from || !to || from.kind !== to.kind) return false;
  if (from.kind === "composition") return element.type === "video_clip" && from.id === to.id;
  return element.type === "sound_effect";
}

function validateOperationAgainstElement(
  operation: EditorAgentOperation,
  element: ReturnType<typeof findElement>,
): asserts element is NonNullable<ReturnType<typeof findElement>> {
  if (!element || element.removed_at != null) throw new Error(`Timeline element not found: ${operation.element_id}`);
  if (operation.set_preview_audio_source && !AUDIO_CAPABLE_TYPES.has(element.type)) {
    throw new Error(`Preview audio is not applicable to ${element.type}`);
  }
  const operationProps = operation.props as Record<string, unknown> | undefined;
  const propKeys = Object.keys(operationProps ?? {});
  if (propKeys.some(key => key.startsWith("letter_fall_"))) {
    if (element.type !== "caption_text") throw new Error("Letter fall requires native text");
    const merged = { ...element.props, ...operation.props };
    const start = Number(merged.letter_fall_start_seconds);
    const seconds = Number(merged.letter_fall_seconds);
    const stagger = Number(merged.letter_fall_stagger_seconds);
    const finish = letterFallFinishSeconds(String(merged.text ?? ""), { start, seconds, stagger, order: (merged.letter_fall_order ?? "outside_in") as LetterFallOrder });
    if (![start, seconds, stagger, finish].every(Number.isFinite) || finish > (operation.patch?.duration ?? element.duration) + 1e-6)
      throw new Error("All letter falls must finish within the text clip");
    if (merged.gravity_drop_start_seconds !== undefined) throw new Error("Choose letter fall or whole-label gravity drop");
  }
  if (operation.props?.gravity_drop_start_seconds !== undefined || operation.props?.gravity_drop_seconds !== undefined) {
    if (!VISUAL_TYPES.has(element.type) && element.type !== "caption_text") throw new Error("Gravity drop requires a visual object or text");
    const start = operation.props.gravity_drop_start_seconds ?? Number(element.props?.gravity_drop_start_seconds);
    const seconds = operation.props.gravity_drop_seconds ?? Number(element.props?.gravity_drop_seconds);
    if (!Number.isFinite(start) || !Number.isFinite(seconds) || start + seconds > (operation.patch?.duration ?? element.duration) + 1e-6) throw new Error("Gravity drop must have complete timing within the clip");
    if (operation.props.media_offset_y_keyframes || operation.props.transition_keyframes) throw new Error("Choose gravity drop or explicit transition tracks");
  }
  if (operation.props?.semanticLayout) {
    if (!VISUAL_TYPES.has(element.type)) throw new Error("Semantic layout requires a visual clip");
    const motion = operation.props.semanticLayout.motion;
    const duration = operation.patch?.duration ?? element.duration;
    if (motion && motion.start_seconds + motion.duration_seconds > duration + 1e-6) {
      throw new Error("Semantic layout motion must fit within the clip duration");
    }
    if (operationProps?.media_offset_x !== undefined || operationProps?.media_offset_y !== undefined) {
      throw new Error("Semantic layout cannot be combined with raw visual coordinates");
    }
  }
  if (operation.props?.crowdLayout) {
    if (!VISUAL_TYPES.has(element.type)) throw new Error("Crowd layout requires a visual clip");
    if (operation.props.semanticLayout) throw new Error("Choose semantic layout or crowd layout, not both");
    if (operationProps?.media_offset_x !== undefined || operationProps?.media_offset_y !== undefined || operationProps?.media_scale !== undefined) {
      throw new Error("Crowd layout cannot be combined with raw visual coordinates");
    }
  }
  const morph = operation.props?.shape_morph;
  if (morph) {
    const kind = operation.props?.shape_kind ?? element.props?.shape_kind;
    if (element.type !== "shape" || kind !== "path") throw new Error("shape_morph morphs only a path shape");
    if (morph.some((key) => key.t > (operation.patch?.duration ?? element.duration) + 1e-6)) throw new Error("Morph keys must fit within the shape's duration");
    for (const key of morph) if (parseSvgPath(key.v).length === 0) throw new Error("A morph key draws nothing");
  }
  const transitionPoints = operation.props?.transition_keyframes;
  if (transitionPoints) {
    const captionPan = element.type === "caption_text" && Object.keys(transitionPoints).every(field => field === "media_offset_x");
    if (!VISUAL_TYPES.has(element.type) && !captionPan) throw new Error("Transition keyframes require a visual clip; captions support horizontal motion only");
    const duration = operation.patch?.duration ?? element.duration;
    // A microsecond of slack: clip lengths carry float noise (24.19999999999999 for 24.2), and a key at the end is valid.
    if (Object.values(transitionPoints).some(points => points?.some(point => point.t > duration + 1e-6))) throw new Error("Transition keyframes must fit within the clip duration");
  }
  const reverse = operation.props?.playback_reverse;
  if (reverse !== undefined) {
    if (element.type !== "video_clip") throw new Error("Reverse requires a video clip");
    if (reverse && element.props?.speech_sync_binding) throw new Error("Reverse cannot retime a speech-bound visual");
    const rampField = Object.keys(operation.props ?? {}).find(field => field === "playback_speed_steps" || field.startsWith("playback_ramp_"));
    const existingSteps = ((element.props?.keyframes as Record<string, unknown> | undefined)?.playback_rate as unknown[] | undefined)?.length;
    if (reverse && (rampField || (existingSteps && !(operation.clear_props ?? []).includes("keyframes")))) {
      throw new Error("Reverse plays at one constant speed; remove speed steps or ramps from this clip first");
    }
  }
  const speedPoints = operation.props?.playback_speed_steps;
  if (speedPoints) {
    if (element.type !== "video_clip") throw new Error("Speed steps require a video clip");
    if (element.props?.speech_sync_binding) throw new Error("Speed steps cannot retime a speech-bound visual");
    const projected = {...element, ...operation.patch};
    const sourceEnd = Number(element.props?.source_duration_seconds) - (projected.trim_end ?? 0);
    if (!Number.isFinite(sourceEnd) || speedPoints.some(p => p.source_t <= (projected.trim_start ?? 0) || p.source_t >= sourceEnd)) {
      throw new Error("Speed steps must lie inside the available source window");
    }
    const props = {...element.props, keyframes: {playback_rate: speedPoints.map(p => ({...p, t: p.source_t, ease: "hold"}))}};
    if (Math.abs(speedStepDuration({...projected, props}) - projected.duration) > 1 / currentFrameRate() + 1e-6) {
      throw new Error("Speed-step duration must match the complete source window");
    }
  }
  const zoomPoints = operation.props?.media_scale_keyframes;
  if (zoomPoints) {
    if (!VISUAL_TYPES.has(element.type)) throw new Error("Zoom keyframes require a visual clip");
    const duration = operation.patch?.duration ?? element.duration;
    if (zoomPoints.some((point) => point.t > duration)) throw new Error("Zoom keyframes must fit within the clip duration");
    if (operationProps?.media_scale !== undefined) throw new Error("Use the first zoom keyframe to set the starting scale");
  }
  const verticalPoints = operation.props?.media_offset_y_keyframes;
  if (verticalPoints) {
    if (!VISUAL_TYPES.has(element.type)) throw new Error("Vertical-position keyframes require a visual clip");
    const duration = operation.patch?.duration ?? element.duration;
    if (verticalPoints.some((point) => point.t > duration + 1e-6)) {
      throw new Error("Vertical-position keyframes must fit within the clip duration");
    }
    if (operationProps?.media_offset_y !== undefined) {
      throw new Error("Use the first vertical-position keyframe to set the starting position");
    }
  }
  const windowValues = maskWindowValues(operation.props);
  const maskPoints = windowValues
    ? maskWindowPoints(windowValues, operation.patch?.duration ?? element.duration)
    : operation.props?.mask_inset_keyframes;
  if (maskPoints) {
    if (!VISUAL_TYPES.has(element.type)) throw new Error("Mask keyframes require a visual clip");
    const duration = operation.patch?.duration ?? element.duration;
    if (maskPoints.some((point) => point.t > duration + 1e-6)) {
      throw new Error("Mask keyframes must fit within the clip duration");
    }
    if (operationProps?.mask_inset !== undefined) {
      throw new Error("Use the first mask keyframe to set the starting mask");
    }
  }
  if (propKeys.some((key) => CAPTION_ONLY_PROPS.has(key)) && element.type !== "caption_text") {
    throw new Error(`Caption properties are not applicable to ${element.type}`);
  }
  if (propKeys.some((key) => SURFACE_PROPS.has(key)) && element.type !== "caption_text" && !VISUAL_TYPES.has(element.type)) {
    throw new Error(`Surface properties are not applicable to ${element.type}`);
  }
  if (propKeys.some((key) => EFFECT_PROPS.has(key) && !(element.type === "shape" && SHAPE_TRANSFORM_PROPS.has(key))) && !VISUAL_TYPES.has(element.type)) {
    throw new Error(`Visual effect properties are not applicable to ${element.type}`);
  }
  const proposesChromaAmounts = CHROMA_KEY_AMOUNT_FIELDS.some((field) => operationProps?.[field] !== undefined);
  if (
    proposesChromaAmounts
    && operationProps?.[CHROMA_KEY_COLOR_FIELD] === undefined
    && !hasChromaKeyData(element.props)
  ) {
    throw new Error(`Chroma key amounts require ${CHROMA_KEY_COLOR_FIELD} on the clip or in the same operation`);
  }
  if (propKeys.some((key) => ANIMATION_PROPS.has(key)) && element.type !== "caption_text" && element.type !== "shape" && !VISUAL_TYPES.has(element.type)) {
    throw new Error(`Animation properties are not applicable to ${element.type}`);
  }
  // A later card may change a drawn shape's entrance and exit within what create_shape allows.
  if (element.type === "shape") {
    for (const key of ["animationIn", "animationOut"] as const) {
      const value = operationProps?.[key];
      if (value !== undefined && !(SHAPE_ANIMATION_PRESETS as readonly unknown[]).includes(value)) throw new Error(`A shape's ${key} is one of ${SHAPE_ANIMATION_PRESETS.join(", ")}`);
    }
    for (const key of ["animationInDuration", "animationOutDuration"] as const) {
      const value = operationProps?.[key];
      if (typeof value === "number" && value > 2) throw new Error(`A shape's ${key} is at most 2 seconds`);
    }
  }
  if (element.type === "caption_text" && typeof operationProps?.text === "string") {
    const timings = normalizeWordTimings(element.props?.wordTimings);
    if (timings.length > 0 && !captionTextMatchesWordTimings(operationProps.text, timings)) {
      if (operationProps.timingMode !== "phrase" || !operation.clear_props?.includes("wordTimings")) {
        throw new Error("Changing aligned caption words requires timingMode=phrase and clearing wordTimings");
      }
    }
  }
  if (
    element.type === "caption_text"
    && (operationProps?.timingMode === "active_word"
      || operationProps?.timingMode === "single_word"
      || operationProps?.wordTimings !== undefined)
  ) {
    const nextText = typeof operationProps.text === "string"
      ? operationProps.text
      : String(element.props?.text ?? "");
    const nextTimings = operationProps.wordTimings ?? element.props?.wordTimings;
    const duration = operation.patch?.duration ?? element.duration;
    const validation = validateWordTimings(nextText, duration, nextTimings, currentFrameRate());
    if (validation.findings.length > 0) {
      throw new Error(`Invalid aligned caption word timings: ${validation.findings[0]!.message}`);
    }
  }
  const patch = operation.patch ?? {};
  if ("source_url" in patch && element.type !== "still" && !isRenderSwap(element, patch.source_url)) {
    throw new Error(`Source replacement is only applicable to still elements, a new render of the same motion graphic, or another synthesized sound; ${element.type} must preserve its synchronized media source`);
  }
  if (("volume" in patch || "fade_in" in patch || "fade_out" in patch) && !AUDIO_CAPABLE_TYPES.has(element.type)) {
    throw new Error(`Audio properties are not applicable to ${element.type}`);
  }
  if (("trim_start" in patch || "trim_end" in patch || "playback_rate" in patch || operation.clear_patch?.includes("trim_end")) && !TRIMMABLE_TYPES.has(element.type)) {
    throw new Error(`Trim/playback properties are not applicable to ${element.type}`);
  }
  if (element.position_locked && ("timeline_start" in patch || "lane_key" in patch || "lane_index" in patch)) {
    throw new Error(`Element ${element.id} has locked position`);
  }

  // Revealing an entire existing source is bounded by its known duration, not
  // by the small-adjustment trim cap. Keep placement and playback unchanged.
  const sourceLength = Number(element.props?.source_duration_seconds);
  const sourceRate = element.playback_rate ?? 1;
  const restoresWholeSource = TRIMMABLE_TYPES.has(element.type)
    && Number.isFinite(sourceLength) && sourceLength > 0 && sourceRate > 0
    && patch.timeline_start === element.timeline_start
    && patch.trim_start === 0 && patch.trim_end === 0
    && patch.duration === Math.round(sourceLength / sourceRate * currentFrameRate()) / currentFrameRate()
    && (patch.playback_rate === undefined || patch.playback_rate === sourceRate)
    && patch.source_url === undefined;
  const deltaCaps: Record<string, number> = {
    timeline_start: 60, duration: 30, trim_start: 30, trim_end: 30,
    // Layered motion-graphic captions may intentionally fan across many
    // registered caption lanes (for example a 17-card benchmark pile). Keep
    // the tighter lane-move guard for playable media and ordinary visuals.
    lane_index: element.type === "caption_text" ? 64 : 4,
    // Playback speed uses its schema's absolute range (up to 4x), matching the
    // review dial. A relative +1 cap made valid tuning fail on slow source clips.
    volume: 1, fade_in: 2, fade_out: 2,
  };
  for (const [field, cap] of Object.entries(deltaCaps)) {
    if (restoresWholeSource && ["duration", "trim_start", "trim_end"].includes(field)) continue;
    // Explicit silence must remain possible for boosted audio too. This does
    // not relax gain increases or the separate gain-envelope consistency rules.
    if (field === "volume" && patch.volume === 0) continue;
    // A dial's range replaces the cap, except for moves and trims, which keep it.
    if (!TIMING_PATCH_FIELDS.has(field) && isSupportedProposalControl("patch", field, patch[field as keyof typeof patch])) continue;
    if (field in patch && numericDelta((element as unknown as Record<string, unknown>)[field], patch[field as keyof typeof patch]) > cap) {
      throw new Error(`${field} change exceeds the per-operation delta cap of ${cap}`);
    }
  }

  const currentTransform = readMediaTransformProps(element.props);
  const currentEffect = readMediaEffectProps(element.props);
  const currentProps = { ...(element.props ?? {}) } as Record<string, unknown>;
  const propDeltaCaps: Record<string, [unknown, number]> = {
    media_scale: [currentTransform.scale, 1], media_offset_x: [currentTransform.offsetX, 0.5],
    media_offset_y: [currentTransform.offsetY, 0.5], media_opacity: [currentEffect.opacity, 0.75],
    mask_feather: [currentEffect.maskFeather, 0.25], absX: [currentProps.absX, 0.5], absY: [currentProps.absY, 0.5],
    offsetX: [currentProps.offsetX, 0.5], offsetY: [currentProps.offsetY, 0.5],
    maxWidth: [currentProps.maxWidth, 0.5],
    // Text size uses the schema's 18–300px range, matching the review dial.
    // A relative cap prevented caption-to-title changes within that range.
    // Duration dials use the validated 0–60s field range; a hidden 1s delta cap made valid controls fail.
    animationInDuration: [currentProps.animationInDuration, 60], animationOutDuration: [currentProps.animationOutDuration, 60],
    // Grade controls use their validated absolute ranges. A second relative cap
    // rejected valid human dial adjustments in both preview and approval.
  };
  for (const [field, [current, cap]] of Object.entries(propDeltaCaps)) {
    const value = operationProps?.[field];
    if (isSupportedProposalControl("props", field, value)) continue;
    if (value !== undefined && numericDelta(current, value) > cap) throw new Error(`${field} change exceeds the per-operation delta cap of ${cap}`);
  }
  // Crop edges are bounded per edge by the schema and judged in the card preview. No change cap: a
  // corner bubble moves edges past half the frame, and any window minimum breaks the edge dials' ends.
}

type SpeechVisualReceipt = {
  source_sha256?: unknown;
  source_interval_seconds?: unknown;
};

function speechVisualReceipt(element: TimelineElement) {
  const receipt = (element.props as Record<string, unknown> | null)?.custom_cutout_receipt as SpeechVisualReceipt | undefined;
  const interval = receipt?.source_interval_seconds;
  if (
    typeof receipt?.source_sha256 !== "string"
    || !Array.isArray(interval)
    || interval.length !== 2
    || typeof interval[0] !== "number"
    || typeof interval[1] !== "number"
  ) return null;
  return { source_sha256: receipt.source_sha256, start: interval[0], end: interval[1] };
}

function catalogedCutoutReceipt(projectId: string, sourceUrl: string) {
  const marker = `/api/projects/${projectId}/media/`;
  if (!sourceUrl.startsWith(marker)) return null;
  return customCutoutByRelativePath(projectId).get(sourceUrl.slice(marker.length)) ?? null;
}

const managedSourceHashCache = new Map<string, string>();

/**
 * A clip playing an editor-prepared copy speaks with its archival source's authority: prepared
 * playback media lives under `.prepared/<recipe>/<archival sha256>/`, so the path itself names the
 * managed original it was made from (with timing parity under the preview proxy contract).
 */
function preparedArchivalSha256(projectId: string, sourceUrl: string, archivalUrl: unknown): string | null {
  if (typeof archivalUrl !== "string" || !sourceUrl.startsWith(`/api/projects/${projectId}/media/.prepared/`)) return null;
  const archivalSha = managedSourceSha256(projectId, archivalUrl);
  return archivalSha && sourceUrl.split("/").includes(archivalSha) ? archivalSha : null;
}

function managedSourceSha256(projectId: string, sourceUrl: string): string | null {
  const marker = `/api/projects/${projectId}/media/`;
  if (!sourceUrl.startsWith(marker)) return null;
  const mediaPath = sourceUrl.slice(marker.length);
  const cacheKey = `${projectId}:${mediaPath}`;
  const cached = managedSourceHashCache.get(cacheKey);
  if (cached) return cached;
  try {
    const manifest = JSON.parse(fs.readFileSync(projectSourceManifestPath(projectId), "utf8")) as {
      assets?: Array<{ media_path?: unknown; source_sha256?: unknown; storage_mode?: unknown }>;
    };
    const asset = manifest.assets?.find((candidate) =>
      candidate.media_path === mediaPath
      && candidate.storage_mode === "managed_copy"
      && typeof candidate.source_sha256 === "string"
      && /^[0-9a-f]{64}$/.test(candidate.source_sha256),
    );
    if (!asset || typeof asset.source_sha256 !== "string") return null;
    const mediaRoot = projectMediaDir(projectId);
    const resolved = path.resolve(mediaRoot, mediaPath);
    if (resolved !== mediaRoot && !resolved.startsWith(`${mediaRoot}${path.sep}`)) return null;
    if (!fs.existsSync(resolved)) return null;
    const actual = createHash("sha256").update(fs.readFileSync(resolved)).digest("hex");
    if (actual !== asset.source_sha256) return null;
    managedSourceHashCache.set(cacheKey, actual);
    return actual;
  } catch {
    return null;
  }
}

function assertSpeechVisualSync(
  timeline: TimelineFile,
  element: TimelineElement,
  sync: z.infer<typeof editorAgentSyncSpeechVisualSchema>,
) {
  if (element.type !== "video_clip" || element.removed_at != null) {
    throw new Error("Speech visual sync requires an active video clip");
  }
  const replacementReceipt = sync.source_url
    ? catalogedCutoutReceipt(element.project_id, sync.source_url)
    : null;
  if (sync.source_url && !replacementReceipt) {
    throw new Error("Speech visual replacement requires a cataloged cutout receipt");
  }
  if (replacementReceipt?.preview) {
    const preview = replacementReceipt.preview;
    const root = projectMediaDir(element.project_id);
    const file = path.resolve(root, preview.relative_path);
    if (!file.startsWith(`${root}${path.sep}`)
      || preview.frame_count !== replacementReceipt.frame_count
      || Math.abs(preview.duration_seconds - replacementReceipt.output_duration_seconds) > 1 / replacementReceipt.frame_rate
      || !fs.existsSync(file)
      || createHash("sha256").update(fs.readFileSync(file)).digest("hex") !== preview.sha256) {
      throw new Error("Cutout preview receipt is missing, stale, or out of sync");
    }
  }
  const receipt = replacementReceipt
    ? {
        source_sha256: replacementReceipt.source_sha256,
        start: replacementReceipt.source_interval_seconds[0],
        end: replacementReceipt.source_interval_seconds[1],
      }
    : speechVisualReceipt(element);
  if (!receipt) throw new Error("Speech visual sync requires a source-bound cutout receipt");
  const source = findElement(timeline, sync.source_element_id);
  if (!source || source.removed_at != null || !AUDIO_CAPABLE_TYPES.has(source.type)) {
    throw new Error("Speech visual sync source must be an active audio-capable clip");
  }
  const sourceProps = (source.props ?? {}) as Record<string, unknown>;
  const audibleAuthoritySha = source.source_url === sourceProps.render_authority_source_url
    && typeof sourceProps.render_authority_sha256 === "string"
    ? sourceProps.render_authority_sha256
    : typeof sourceProps.source_sha256 === "string"
      ? sourceProps.source_sha256
      : source.source_url
        ? managedSourceSha256(source.project_id, source.source_url)
          ?? preparedArchivalSha256(source.project_id, source.source_url, sourceProps.archival_source_url)
        : null;
  if (audibleAuthoritySha !== sync.source_sha256 || receipt.source_sha256 !== sync.source_sha256) {
    throw new Error("Speech visual and audible source hashes must match");
  }
  const tolerance = 1 / currentFrameRate() + 1e-6;
  if (sync.source_start_seconds < receipt.start - tolerance || sync.source_end_seconds > receipt.end + tolerance) {
    throw new Error("Speech visual source window must stay inside its cutout receipt");
  }
  const sourceDuration = typeof sourceProps.source_duration_seconds === "number"
    ? sourceProps.source_duration_seconds
    : source.trim_start + source.duration * source.playback_rate + (source.trim_end ?? 0);
  const retainedEnd = sourceDuration - (source.trim_end ?? 0);
  if (sync.source_start_seconds < source.trim_start - tolerance || sync.source_end_seconds > retainedEnd + tolerance) {
    throw new Error("Speech visual source window must stay inside the audible clip");
  }
}

/**
 * No two active visuals may occupy the same span of the same visual lane.
 *
 * Creation checked this; MOVING an existing clip did not, so a patch that slid
 * a clip onto its neighbour was accepted. Run against the DERIVED timeline so
 * it sees final positions rather than proposed ones.
 */
function assertNoVisualOverlap(timeline: TimelineFile, elementIds: string[]) {
  const moved = new Set(elementIds);
  // Deliberate stacks: a compositing overlay, and the opening-sequence punch-in
  // that sits on its own source clip so the picture cuts while the original
  // narration keeps playing underneath.
  const isIntentionalOverlay = (candidate: TimelineElement) => {
    const props = candidate.props as Record<string, unknown> | null;
    return props?.effect_role === "active_camouflage_subject_overlay"
      || props?.intentional_visual_overlay === true;
  };
  const visuals = activeElements(timeline).filter((candidate) =>
    candidate.type === "video_clip" || candidate.type === "still" || candidate.type === "shape");
  for (const element of visuals) {
    if (!moved.has(element.id) || isIntentionalOverlay(element)) continue;
    const end = element.timeline_start + element.duration;
    const collision = visuals.find((candidate) =>
      candidate.id !== element.id
      && candidate.lane_key === element.lane_key
      && !isIntentionalOverlay(candidate)
      && candidate.timeline_start < end - 1e-6
      && candidate.timeline_start + candidate.duration > element.timeline_start + 1e-6);
    if (collision) {
      throw new Error(
        `Visual overlap on ${element.lane_key}: ${element.id} would sit on top of ${collision.id}. `
        + "Move one of them or use a separate visual lane.",
      );
    }
  }
}

/**
 * A relation (place) names real anchors and is the element's one placement mode: no coordinates,
 * preset or own camera beside it, since the resolver owns position and camera.
 */
function validatePlacementRelation(operation: EditorAgentOperation, timeline: TimelineFile) {
  const values = (operation.create_text ?? operation.create_shape ?? operation.props) as Record<string, unknown> | undefined;
  const place = values?.place as { relative_to: string | string[] } | undefined;
  if (!place) return;
  const existing = findElement(timeline, operation.element_id);
  const follower = operation.create_text ? { type: "caption_text", props: {} } : operation.create_shape ? { type: "shape", props: { shape_kind: operation.create_shape.shape_kind } } : existing;
  if (!follower || !canFollowRelation(follower as TimelineElement)) throw new Error("place positions text and drawn shapes only");
  const coordinates = ["absX", "absY", "media_offset_x", "media_offset_y"].filter(field => values![field] !== undefined);
  const keyframes = values!.keyframes as Record<string, unknown> | undefined;
  if (keyframes?.media_offset_x || keyframes?.media_offset_y) coordinates.push("keyframes.media_offset_x/y");
  if (operation.create_text?.positionPreset || operation.props?.positionPreset) coordinates.push("positionPreset");
  if (coordinates.length) throw new Error(`place is the one placement for ${operation.element_id}; remove ${coordinates.join(", ")} (one placement mode per element).`);
  const ids = typeof place.relative_to === "string" ? [place.relative_to] : place.relative_to;
  const live = activeElements(timeline);
  const anchors = ids.map(id => {
    if (id === operation.element_id) throw new Error("An element cannot be placed relative to itself");
    const anchor = live.find(candidate => candidate.id === id);
    if (!anchor) throw new Error(`place.relative_to ${id} is not on the timeline; anchor to an existing element or one created earlier in the same option.`);
    if (isCamera(anchor)) throw new Error("A camera has no box to place against; anchor to what it looks at.");
    return anchor;
  });
  const cameras = new Set(anchors.map(anchor => anchor.props?.camera_id ?? null));
  if (cameras.size > 1) throw new Error("The anchors follow different cameras; anchor to elements seen through the same camera.");
  const own = values!.camera_id;
  if (typeof own === "string" && own !== [...cameras][0]) throw new Error("A placed element is seen through its anchor's camera; remove camera_id.");
}

function validateOperationAgainstTimeline(operation: EditorAgentOperation, timeline: TimelineFile) {
  const cameraId = operation.create_shape?.camera_id ?? operation.create_visual?.camera_id ?? operation.create_text?.camera_id ?? operation.props?.camera_id;
  if (typeof cameraId === "string") {
    if (!activeElements(timeline).some((candidate) => candidate.id === cameraId && isCamera(candidate))) {
      throw new Error(`camera_id ${cameraId} is not a camera on the timeline; create the camera (shape_kind camera) earlier in the same option.`);
    }
    const selfKind = operation.create_shape?.shape_kind ?? findElement(timeline, operation.element_id)?.props?.shape_kind;
    if (selfKind === "camera") throw new Error("A camera cannot follow another camera.");
  }
  validatePlacementRelation(operation, timeline);
  const element = findElement(timeline, operation.element_id);
  if (operation.props?.compound_preview) {
    if (!element || operation.props.compound_clip_id !== operation.props.compound_preview.id
      || !operation.props.compound_preview.members.some(m => m.id === element.id)) throw new Error("Compound preview must bind one of its prepared members");
    assertCompoundPreview(element.project_id, operation.props.compound_preview);
  }
  if (operation.create_audio) {
    if (element) throw new Error(`Timeline element already exists: ${operation.element_id}`);
    assertLaneCompatibleWithElementType(operation.create_audio.type, operation.create_audio.lane_key);
    const proposedDuration = (
      operation.create_audio.source_end_seconds - operation.create_audio.source_start_seconds
    ) / operation.create_audio.playback_rate;
    // A linked sound lands at its picture's start plus its offset, so check it there.
    const proposedStart = linkedAudioStart(operation.create_audio, timeline);
    const proposedEnd = proposedStart + proposedDuration;
    const overlapsAudioOnSameLane = activeElements(timeline).some((candidate) =>
      (candidate.type === "vo_segment"
        || candidate.type === "vo_full"
        || candidate.type === "music"
        || candidate.type === "sound_effect")
      && candidate.lane_key === operation.create_audio!.lane_key
      && candidate.timeline_start < proposedEnd - 1e-6
      && candidate.timeline_start + candidate.duration > proposedStart + 1e-6);
    if (overlapsAudioOnSameLane) {
      throw new Error(
        `Audio overlap on ${operation.create_audio.lane_key}: place overlapping audio on a separate lane.`,
      );
    }
    return;
  }
  if (operation.create_visual) {
    if (element) throw new Error(`Timeline element already exists: ${operation.element_id}`);
    assertLaneCompatibleWithElementType(operation.create_visual.type, operation.create_visual.lane_key);
    const projectId = activeElements(timeline)[0]?.project_id;
    const synchronizedCandidate = operation.create_visual.speech_sync && projectId
      ? createVisualElement(projectId, operation.element_id, operation.create_visual, timeline)
      : null;
    const proposedStart = synchronizedCandidate?.timeline_start ?? operation.create_visual.timeline_start;
    const authoredRate = operation.create_visual.playback_rate ?? 1;
    const proposedDuration = synchronizedCandidate?.duration
      ?? operation.create_visual.duration_seconds
      ?? (((operation.create_visual.source_end_seconds ?? 0) - (operation.create_visual.source_start_seconds ?? 0)) / authoredRate);
    const proposedEnd = proposedStart + proposedDuration;
    const overlapsVisualOnSameLane = activeElements(timeline).some((candidate) =>
      (candidate.type === "video_clip" || candidate.type === "still" || candidate.type === "shape")
      && candidate.lane_key === operation.create_visual!.lane_key
      && candidate.timeline_start < proposedEnd - 1e-6
      && candidate.timeline_start + candidate.duration > proposedStart + 1e-6);
    if (
      overlapsVisualOnSameLane
      && operation.create_visual.effect_role !== "active_camouflage_subject_overlay"
    ) {
      throw new Error(
        `Overlapping authored visuals require separate registered visual lanes; lane_index does not create `
        + `a compositing lane. "${operation.create_visual.lane_key}" already has a visual at that time: put this one on a `
        + `visual_N lane key no visual uses then, and add that key to the set_lane_order operation when the card sets lane order.`,
      );
    }
    const isAuthoredVideoEffect = operation.create_visual.type === "video_clip"
      && /\/media\/video-effects\//.test(operation.create_visual.source_url);
    const allowedDerivativeRoles = new Set(["active_camouflage_subject_overlay"]);
    if (
      isAuthoredVideoEffect
      && !allowedDerivativeRoles.has(operation.create_visual.effect_role ?? "")
    ) {
      throw new Error(
        "Project-local video-effects cannot be mounted as authored visuals without an approved editable "
        + "effect graph. Proof plates, annotations, ads, and motion graphics must remain separate still operations.",
      );
    }
    if (operation.create_visual.speech_sync) {
      if (!projectId) throw new Error("Speech-synchronized visual creation requires a project timeline");
      const candidate = synchronizedCandidate!;
      assertSpeechVisualSync(timeline, candidate, operation.create_visual.speech_sync);
    }
    return;
  }
  if (operation.create_text) {
    if (element) throw new Error(`Timeline element already exists: ${operation.element_id}`);
    assertLaneCompatibleWithElementType("caption_text", operation.create_text.lane_key);
    const proposedEnd = operation.create_text.timeline_start + operation.create_text.duration_seconds;
    const overlapsTextOnSameLane = activeElements(timeline).some((candidate) =>
      candidate.type === "caption_text"
      && candidate.lane_key === operation.create_text!.lane_key
      && candidate.timeline_start < proposedEnd - 1e-6
      && candidate.timeline_start + candidate.duration > operation.create_text!.timeline_start + 1e-6);
    if (overlapsTextOnSameLane) {
      throw new Error("Overlapping graphic text requires a separate caption lane.");
    }
    return;
  }
  if (operation.create_shape) {
    if (element) throw new Error(`Timeline element already exists: ${operation.element_id}`);
    const create = operation.create_shape;
    assertLaneCompatibleWithElementType("shape", create.lane_key);
    if (Object.values(create.keyframes ?? {}).some((points) => points?.some((point) => point.t > create.duration_seconds + 1e-6))) {
      throw new Error("Shape keyframes must fit within the shape's duration");
    }
    const proposedEnd = create.timeline_start + create.duration_seconds;
    const overlapsVisualOnSameLane = activeElements(timeline).some((candidate) =>
      candidate.lane_key === create.lane_key
      && candidate.timeline_start < proposedEnd - 1e-6
      && candidate.timeline_start + candidate.duration > create.timeline_start + 1e-6);
    if (overlapsVisualOnSameLane) throw new Error("An overlapping shape needs its own visual lane.");
    return;
  }
  if (operation.remove_visual) {
    if (!element || element.removed_at != null) {
      throw new Error(`Visual element is missing or already removed: ${operation.element_id}`);
    }
    if (element.type !== "video_clip" && element.type !== "still" && element.type !== "shape") {
      throw new Error("Only visual elements can use remove_visual");
    }
    return;
  }
  if (operation.remove_text) {
    if (!element || element.removed_at != null) {
      throw new Error(`Text element is missing or already removed: ${operation.element_id}`);
    }
    if (element.type !== "caption_text") {
      throw new Error("Only caption text elements can use remove_text");
    }
    return;
  }
  if (operation.create_transition) {
    const transition = operation.create_transition;
    if (timeline.transitions.some(item => item.id === operation.element_id || (!item.removed_at && item.from_element_id === transition.from_element_id && item.to_element_id === transition.to_element_id))) throw new Error("Transition already exists");
    const validation = validateTransitionAdjacency(activeElements(timeline), transition.from_element_id, transition.to_element_id, transition.duration_seconds);
    if (!validation.ok) throw new Error(validation.reason);
    return;
  }
  if (operation.set_lane_order || operation.set_output_format) return;
  if (operation.speed_change) {
    validateOperationAgainstElement(operation, element);
    if (!SOURCE_TIMED_CUT_TYPES.has(element.type)) throw new Error("A speed change starts from a speaker or media clip");
    const change = operation.speed_change;
    if (!change.ripple_lane_keys.includes(element.lane_key)) throw new Error("Speed change lanes must include this clip's lane");
    const affected = speedChangeAffected(timeline, element, change);
    if (affected.length > change.max_affected_elements) {
      throw new Error(`Speed change affects ${affected.length} elements, above its declared cap of ${change.max_affected_elements}`);
    }
    const locked = affected.find(candidate => candidate.position_locked);
    if (locked) throw new Error(`Speed change cannot move locked element ${locked.id}`);
    return;
  }
  if (operation.source_range_cut) {
    validateOperationAgainstElement(operation, element);
    if (!SOURCE_TIMED_CUT_TYPES.has(element.type)) throw new Error("Source-range cuts require a source-timed media clip");
    if (element.position_locked) throw new Error(`Element ${element.id} has locked position`);
    const cut = operation.source_range_cut;
    if (cut.ripple_lane_keys && !cut.ripple_lane_keys.includes(element.lane_key)) {
      throw new Error("Source-range cut affected lanes must include the target lane");
    }
    for (const id of [cut.removed_segment_id, cut.inserted_element_id]) {
      if (findElement(timeline, id)) throw new Error(`Timeline element already exists: ${id}`);
    }
    const rate = element.playback_rate > 0 ? element.playback_rate : 1;
    const sourceIn = element.trim_start;
    const sourceOut = sourceIn + element.duration * rate;
    const frameInSource = rate / currentFrameRate();
    if (
      cut.source_start_seconds < sourceIn + frameInSource - 1e-6
      || cut.source_end_seconds > sourceOut - frameInSource + 1e-6
    ) {
      const earliest = Math.ceil((sourceIn + frameInSource) * 1e4) / 1e4;
      const latest = Math.floor((sourceOut - frameInSource) * 1e4) / 1e4;
      throw new Error(`Source-range cut must leave at least one complete frame on both sides: on ${element.id} cut between source ${earliest} s and ${latest} s, or target the neighbouring clip`);
    }
    const cutStart = Math.round((element.timeline_start + (cut.source_start_seconds - sourceIn) / rate) * currentFrameRate()) / currentFrameRate();
    const cutEnd = Math.round((element.timeline_start + (cut.source_end_seconds - sourceIn) / rate) * currentFrameRate()) / currentFrameRate();
    if (cutEnd - cutStart < 1 / currentFrameRate()) throw new Error("Source-range cut must remove at least one frame");
    const affected = activeElements(timeline).filter((candidate) =>
      (!cut.ripple_lane_keys || cut.ripple_lane_keys.includes(candidate.lane_key))
      && (candidate.id === element.id || candidate.timeline_start + candidate.duration > cutStart + 1e-6));
    if (affected.length > cut.max_affected_elements) {
      throw new Error(
        `Source-range cut affects ${affected.length} elements, above its declared cap of ${cut.max_affected_elements}`,
      );
    }
    for (const candidate of affected) {
      if (candidate.id !== element.id && candidate.position_locked) {
        throw new Error(`Source-range cut cannot ripple locked element ${candidate.id}`);
      }
      const props = candidate.props as Record<string, unknown> | null;
      const overlapsBoundary = candidate.timeline_start < cutEnd - 1e-6
        && candidate.timeline_start + candidate.duration > cutStart + 1e-6;
      if (
        candidate.type === "caption_text"
        && !captionFollowsAudio(candidate)
        && overlapsBoundary
        && (props?.timingMode === "active_word"
          || props?.timingMode === "single_word")
      ) {
        throw new Error("Word-timed captions crossing the cut must be regenerated in a separate proposal");
      }
    }
    return;
  }
  if (operation.source_range_restore) {
    const restore = operation.source_range_restore;
    if (!element || element.removed_at != null || !SOURCE_TIMED_CUT_TYPES.has(element.type)) {
      throw new Error("Source-range restore requires an active source-timed clip");
    }
    if (element.position_locked) throw new Error(`Element ${element.id} has locked position`);
    const speechDependents = speechClockDependentIds(timeline.elements, element.id)
      .filter((id) => findElement(timeline, id)?.type !== "caption_text");
    if (speechDependents.length > 0) {
      throw new Error(
        "Source-range restore cannot change a speech clock with linked picture or captions; rebuild those source-bound views in the same proposal.",
      );
    }
    if (restore.source_start_seconds >= element.trim_start - 1e-6) {
      throw new Error("Source-range restore must reveal media before the current trim start");
    }
    if (!restore.ripple_lane_keys.includes(element.lane_key)) {
      throw new Error(`Source-range restore must ripple the target lane: ${element.lane_key}`);
    }
    const rate = element.playback_rate > 0 ? element.playback_rate : 1;
    const restoredSeconds = Math.round(((element.trim_start - restore.source_start_seconds) / rate) * currentFrameRate()) / currentFrameRate();
    if (restoredSeconds < 1 / currentFrameRate()) throw new Error("Source-range restore must add at least one frame");
    const affected = activeElements(timeline).filter((candidate) =>
      restore.ripple_lane_keys.includes(candidate.lane_key)
      && (candidate.id === element.id || candidate.timeline_start + candidate.duration >= element.timeline_start - 1e-6));
    if (affected.length > restore.max_affected_elements) {
      throw new Error(
        `Source-range restore affects ${affected.length} elements, above its declared cap of ${restore.max_affected_elements}`,
      );
    }
    for (const candidate of affected) {
      if (candidate.id !== element.id && candidate.position_locked) {
        throw new Error(`Source-range restore cannot ripple locked element ${candidate.id}`);
      }
    }
    return;
  }
  if (operation.opening_sequence_edit) {
    validateOperationAgainstElement(operation, element);
    if (element.type !== "video_clip") {
      throw new Error("Opening sequence edits require a video clip");
    }
    if (element.position_locked) {
      throw new Error(`Element ${element.id} has locked position`);
    }
    if (findElement(timeline, operation.opening_sequence_edit.inserted_element_id)) {
      throw new Error(`Timeline element already exists: ${operation.opening_sequence_edit.inserted_element_id}`);
    }
    const replacementCaption = findElement(
      timeline,
      operation.opening_sequence_edit.replacement_caption_element_id,
    );
    if (!replacementCaption || replacementCaption.removed_at != null || replacementCaption.type !== "caption_text") {
      throw new Error("Opening sequence edit replacement caption must be an active caption");
    }
    const affected = activeElements(timeline);
    if (affected.length > operation.opening_sequence_edit.max_affected_elements) {
      throw new Error(
        `Opening sequence edit affects ${affected.length} elements, above its declared cap of ${operation.opening_sequence_edit.max_affected_elements}`,
      );
    }
    const rate = element.playback_rate > 0 ? element.playback_rate : 1;
    const nextTrimStart = element.trim_start + operation.opening_sequence_edit.remove_opening_seconds * rate;
    const splitLocalSeconds =
      (operation.opening_sequence_edit.punch_in_source_seconds - nextTrimStart) / rate;
    const nextDuration = element.duration - operation.opening_sequence_edit.remove_opening_seconds;
    if (nextDuration < 2 / currentFrameRate() || splitLocalSeconds < 1 / currentFrameRate() || splitLocalSeconds > nextDuration - 1 / currentFrameRate()) {
      throw new Error("Punch-in source time must remain inside the retained video after the opening removal");
    }
    return;
  }
  if (operation.reattach_original_audio) {
    if (!element || element.removed_at != null || element.type !== "video_clip") {
      throw new Error("Reattaching original audio requires an active video clip");
    }
    const audio = findElement(timeline, operation.reattach_original_audio.audio_element_id);
    if (
      !audio
      || audio.removed_at != null
      || (audio.type !== "vo_segment" && audio.type !== "vo_full")
    ) {
      throw new Error("Reattaching original audio requires an active detached voice clip");
    }
    const frame = 1 / currentFrameRate();
    if (
      Math.abs(audio.timeline_start - element.timeline_start) > frame
      || Math.abs(audio.duration - element.duration) > frame
    ) {
      throw new Error("Detached voice clip must remain aligned with its video");
    }
    return;
  }
  if (operation.sync_speech_visual) {
    if (!element || element.removed_at != null) throw new Error("Speech visual is missing or removed");
    assertSpeechVisualSync(timeline, element, operation.sync_speech_visual);
    if (operation.sync_speech_visual.lane_key) {
      assertLaneCompatibleWithElementType(element.type, operation.sync_speech_visual.lane_key);
      if (Math.abs((operation.sync_speech_visual.lane_index ?? element.lane_index) - element.lane_index) > 4) {
        throw new Error("lane_index change exceeds the per-operation delta cap of 4");
      }
    }
    return;
  }
  if (operation.replace_captions) {
    if (element) throw new Error(`Caption-track proposal id already exists: ${operation.element_id}`);
    for (const id of operation.replace_captions.preserve_element_ids ?? []) {
      const preserved = findElement(timeline, id);
      if (!preserved || preserved.removed_at != null || preserved.type !== "caption_text") {
        throw new Error(`Preserved caption must be active: ${id}`);
      }
    }
    const scopedSourceIds = operation.replace_captions.source_element_ids;
    if (scopedSourceIds) {
      const scoped = new Set(scopedSourceIds);
      for (const sourceId of scoped) {
        const source = findElement(timeline, sourceId);
        if (!source || source.removed_at != null || !AUDIO_CAPABLE_TYPES.has(source.type)) {
          throw new Error(`Caption replacement source is not an active speech clip: ${sourceId}`);
        }
      }
      for (const cue of operation.replace_captions.cues) {
        if (!scoped.has(cue.timing_source.element_id)) {
          throw new Error(`Caption cue ${cue.element_id} falls outside the scoped speech clips`);
        }
      }
    }
    const cueIds = new Set<string>();
    const replacementStart = operation.replace_captions.from_timeline_seconds;
    let previousStart = -Infinity;
    const previousEndByLane = new Map<string, number>();
    for (const cue of operation.replace_captions.cues) {
      if (replacementStart != null && cue.timeline_start < replacementStart - 1e-6) {
        throw new Error(`Caption cue ${cue.element_id} begins before the requested replacement boundary`);
      }
      if (cueIds.has(cue.element_id) || findElement(timeline, cue.element_id)) {
        throw new Error(`Caption cue id already exists: ${cue.element_id}`);
      }
      cueIds.add(cue.element_id);
      assertCaptionCueTimingAuthority(cue, timeline);
      if (cue.timeline_start < previousStart - 1e-6) {
        throw new Error("Caption cues must be ordered by timeline start");
      }
      previousStart = cue.timeline_start;
      const laneKey = cue.lane_key ?? operation.replace_captions.lane_key;
      for (const preservedId of operation.replace_captions.preserve_element_ids ?? []) {
        const preserved = findElement(timeline, preservedId)!;
        if (preserved.lane_key === laneKey
          && cue.timeline_start < preserved.timeline_start + preserved.duration - 1e-6
          && preserved.timeline_start < cue.timeline_start + cue.duration - 1e-6) {
          throw new Error(`Caption cue ${cue.element_id} overlaps preserved caption ${preservedId}`);
        }
      }
      const previousEnd = previousEndByLane.get(laneKey) ?? -Infinity;
      if (cue.timeline_start < previousEnd - 1e-6) {
        throw new Error(`Caption cues on ${laneKey} must not overlap`);
      }
      previousEndByLane.set(laneKey, cue.timeline_start + cue.duration);
    }
    return;
  }
  if (operation.use_video_stabilization) {
    validateOperationAgainstElement(operation, element);
    if (element.type !== "video_clip") {
      throw new Error("Video stabilization proposals require a video clip");
    }
  }
  if (operation.use_recast) {
    validateOperationAgainstElement(operation, element);
    if (element.type !== "video_clip") throw new Error("Recast proposals require a video clip");
    if (operation.use_video_stabilization || operation.patch?.source_url !== undefined) throw new Error("A recast replaces the clip's picture on its own; propose stabilization or another source separately");
  }
  if (operation.use_voice_enhancement) {
    validateOperationAgainstElement(operation, element);
    if (!AUDIO_CAPABLE_TYPES.has(element.type)) {
      throw new Error("Voice enhancement proposals require an audio-capable clip");
    }
  }
  const binding = (element?.props as Record<string, unknown> | null)?.speech_sync_binding;
  if (
    binding
    && operation.patch
    && ["timeline_start", "duration", "trim_start", "trim_end", "playback_rate"]
      .some((field) => field in operation.patch!)
  ) {
    throw new Error("Speech-derived visual timing is source-bound; use sync_speech_visual so picture, audio, and captions move together");
  }
  validateOperationAgainstElement(operation, element);
}

type CaptionAlignmentWord = { word: string; start: number; end: number };
const captionAlignmentCache = new Map<string, { sha256: string; words: CaptionAlignmentWord[] }>();

function normalizedCaptionWords(text: string) {
  return text.trim().replace(/\s+/g, " ");
}

/** Aligned words with display substitutions folded in, so a spoken "eighty k" times as one "$80K"
 * word (start of the first spoken word, end of the last) when captions reveal word by word. */
export function captionDisplayWords<T extends { word: string; start: number; end: number }>(words: readonly T[], substitutions: ReadonlyArray<{ spoken: string; display: string }> = []) {
  const bare = (text: string) => text.replace(/[.,!?;:]+$/, "");
  const out: Array<{ word: string; start: number; end: number }> = [];
  for (let i = 0; i < words.length;) {
    const match = substitutions.find(({ spoken }) => {
      const parts = normalizedCaptionWords(spoken).split(" ");
      return parts.every((part, k) => i + k < words.length && bare(words[i + k]!.word) === part);
    });
    if (!match) { out.push({ word: words[i]!.word, start: words[i]!.start, end: words[i]!.end }); i += 1; continue; }
    const count = normalizedCaptionWords(match.spoken).split(" ").length, last = words[i + count - 1]!;
    out.push({ word: normalizedCaptionWords(match.display) + last.word.slice(bare(last.word).length), start: words[i]!.start, end: last.end });
    i += count;
  }
  return out;
}

/** The aligned words as they read on screen: each substitution replaces whole words only, so a
 * spoken "eighty k" can read "$80K" while every other word stays exactly as spoken. */
export function captionDisplayText(alignedText: string, substitutions: ReadonlyArray<{ spoken: string; display: string }> = []) {
  let text = normalizedCaptionWords(alignedText);
  for (const { spoken, display } of substitutions) {
    const pattern = new RegExp(`(^|\\s)${normalizedCaptionWords(spoken).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|\\s|[.,!?;:])`, "g");
    if (!pattern.test(text)) throw new Error(`Caption substitution "${spoken}" does not match the spoken words`);
    text = text.replace(pattern, (_match, lead: string) => `${lead}${normalizedCaptionWords(display)}`);
  }
  return text;
}

function readCaptionAlignment(filePath: string) {
  const resolved = fs.realpathSync(filePath);
  const bytes = fs.readFileSync(resolved);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const cached = captionAlignmentCache.get(resolved);
  if (cached?.sha256 === sha256) return cached;
  const raw = JSON.parse(bytes.toString("utf8")) as unknown;
  if (!Array.isArray(raw)) throw new Error("Caption alignment must be an array of timed words");
  let previousEnd = -Infinity;
  const words = raw.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error(`Caption alignment word ${index + 1} is invalid`);
    const item = entry as Record<string, unknown>;
    const word = typeof item.word === "string" ? item.word : typeof item.text === "string" ? item.text : "";
    if (!word.trim() || typeof item.start !== "number" || typeof item.end !== "number" || item.end <= item.start) {
      throw new Error(`Caption alignment word ${index + 1} is invalid`);
    }
    if (item.start < previousEnd - 0.001) throw new Error(`Caption alignment word ${index + 1} overlaps its predecessor`);
    previousEnd = item.end;
    return { word: word.trim(), start: item.start, end: item.end };
  });
  const result = { sha256, words };
  captionAlignmentCache.set(resolved, result);
  return result;
}

function assertCaptionCueTimingAuthority(
  cue: z.infer<typeof editorAgentCaptionCueSchema>,
  timeline: TimelineFile,
) {
  const source = findElement(timeline, cue.timing_source.element_id);
  if (!source || source.removed_at != null || !AUDIO_CAPABLE_TYPES.has(source.type)) {
    throw new Error(`Caption cue ${cue.element_id} must reference an active speech clip`);
  }
  const rate = source.playback_rate > 0 ? source.playback_rate : 1;
  if (Math.abs(rate - cue.timing_source.playback_rate) > 1e-6) {
    throw new Error(`Caption cue ${cue.element_id} was mapped for ${cue.timing_source.playback_rate}x but its speech clip is ${rate}x`);
  }
  const props = (source.props ?? {}) as Record<string, unknown>;
  const sourceDuration = typeof props.source_duration_seconds === "number" ? props.source_duration_seconds : null;
  if (sourceDuration == null) throw new Error(`Speech clip ${source.id} is missing its source duration`);
  const retainedStart = source.trim_start;
  const retainedEnd = sourceDuration - (source.trim_end ?? 0);
  const timing = cue.timing_source;
  if (timing.source_start_seconds < retainedStart - 0.001 || timing.source_end_seconds > retainedEnd + 0.001) {
    throw new Error(`Caption cue ${cue.element_id} falls outside its retained speech source window`);
  }
  const expectedStart = source.timeline_start + sourceTimeToTimelineTime(source, timing.source_start_seconds);
  const displayEndSourceSeconds = cue.hold_until_source_seconds ?? timing.source_end_seconds;
  if (
    displayEndSourceSeconds < timing.source_end_seconds - 0.001
    || displayEndSourceSeconds > retainedEnd + 0.001
  ) {
    throw new Error(`Caption cue ${cue.element_id} has an invalid source-clock display hold`);
  }
  const expectedDuration = sourceTimeToTimelineTime(source, displayEndSourceSeconds) - sourceTimeToTimelineTime(source, timing.source_start_seconds);
  if (Math.abs(cue.timeline_start - expectedStart) > 0.001 || Math.abs(cue.duration - expectedDuration) > 0.001) {
    throw new Error(`Caption cue ${cue.element_id} is not mapped to the current speech playback clock`);
  }

  const alignment = readCaptionAlignment(cue.caption_alignment_path);
  if (alignment.sha256 !== timing.alignment_sha256) {
    throw new Error(`Caption cue ${cue.element_id} alignment hash does not match its timing evidence`);
  }
  const aligned = alignment.words.filter((word) =>
    word.start >= timing.source_start_seconds - 0.001
    && word.end <= timing.source_end_seconds + 0.001,
  );
  if (
    aligned.length === 0
    || Math.abs(aligned[0]!.start - timing.source_start_seconds) > 0.001
    || Math.abs(aligned.at(-1)!.end - timing.source_end_seconds) > 0.001
  ) {
    throw new Error(`Caption cue ${cue.element_id} does not begin and end on aligned word boundaries`);
  }
  const alignedText = normalizedCaptionWords(aligned.map((word) => word.word).join(" "));
  if (
    normalizedCaptionWords(cue.caption_source_text) !== alignedText
    || normalizedCaptionWords(cue.text) !== captionDisplayText(alignedText, cue.caption_display_substitutions)
  ) {
    throw new Error(`Caption cue ${cue.element_id} does not match its aligned spoken words`);
  }
  if (
    cue.style?.timingMode === "active_word"
    || cue.style?.timingMode === "single_word"
    || cue.style?.wordTimings !== undefined
  ) {
    const validation = validateWordTimings(cue.text, cue.duration, cue.style?.wordTimings, currentFrameRate());
    if (validation.findings.length > 0) {
      throw new Error(`Caption cue ${cue.element_id} has invalid display timings: ${validation.findings[0]!.message}`);
    }
  }
}

/** Where a created sound starts: at its linked picture's start plus offset when that picture exists. */
function linkedAudioStart(create: z.infer<typeof editorAgentCreateAudioSchema>, timeline: TimelineFile) {
  const link = create.follows_visual;
  const picture = link ? activeElements(timeline).find((element) => element.id === link.element_id) : undefined;
  if (!picture || !link) return create.timeline_start;
  // A cue's time comes from the picture's render (recorded timing, or looked up for a just-created clip).
  const cues = (picture.props?.motion_timing as { cues?: Record<string, number> } | undefined)?.cues
    ?? (link.cue ? motionTimingForSource(picture.project_id, picture.source_url)?.cues : undefined);
  const cue = link.cue && typeof cues?.[link.cue] === "number" ? cues[link.cue] : 0;
  return Math.max(0, Math.round((picture.timeline_start + cue + link.offset_seconds) * 1e6) / 1e6);
}

function createAudioElement(
  projectId: string,
  elementId: string,
  create: z.infer<typeof editorAgentCreateAudioSchema>,
): TimelineElement {
  const duration = (create.source_end_seconds - create.source_start_seconds) / create.playback_rate;
  const trimEnd = Math.max(0, create.source_duration_seconds - create.source_end_seconds);
  return {
    id: elementId,
    project_id: projectId,
    type: create.type,
    source_url: create.source_url,
    props: {
      ...(create.title ? { title: create.title } : {}),
      source_duration_seconds: create.source_duration_seconds,
      source_start_seconds: create.source_start_seconds,
      source_end_seconds: create.source_end_seconds,
      ...(create.source_sha256 ? { source_sha256: create.source_sha256 } : {}),
      ...(create.follows_visual ? { [SOUND_LINK_PROP]: { ...create.follows_visual } } : {}),
      ...(create.voice_enhancement
        ? {
            voice_enhancement_original_source_url: create.voice_enhancement.original_source_url,
            voice_enhancement_original_preview_audio_source_url: create.voice_enhancement.original_source_url,
            voice_enhancement_original_render_authority_source_url: create.voice_enhancement.original_source_url,
            voice_enhancement: {
              schema_version: 1,
              enabled: true,
              strength_percent: create.voice_enhancement.strength_percent,
              attenuation_limit_db: create.voice_enhancement.attenuation_limit_db,
              recipe: create.voice_enhancement.recipe,
              original_source_url: create.voice_enhancement.original_source_url,
              processed_source_url: create.source_url,
              created_at: new Date().toISOString(),
            },
          }
        : {}),
    },
    beat_id: null,
    voice_clip_id: null,
    character_id: null,
    timeline_start: create.timeline_start,
    duration,
    lane_key: create.lane_key,
    lane_index: create.lane_index,
    trim_start: create.source_start_seconds,
    trim_end: trimEnd,
    volume: create.volume,
    fade_in: create.fade_in,
    fade_out: create.fade_out,
    playback_rate: create.playback_rate,
    position_locked: false,
    removed_at: null,
    removed_reason: null,
    ...newRowTimestamps(),
  };
}

/**
 * Subject windows bind to another clip's clock. Whenever a windowed clip or its subject changes,
 * the subject must still exist and its prepared mask (published by this project's cutout_status)
 * must cover every source second it shows; otherwise the window would silently close or fail.
 */
function assertSubjectWindowBindings(projectId: string | undefined, timeline: TimelineFile, touched: readonly string[]) {
  const active = activeElements(timeline);
  let rendered: Map<string, TimelineElement> | null = null;
  for (const element of active) {
    const props = element.props ?? {};
    if (props.subject_window_parent_id == null && props.subject_window_mask == null) continue;
    const subjectId = typeof props.subject_window_parent_id === "string" ? props.subject_window_parent_id : null;
    if (!touched.includes(element.id) && !(subjectId && touched.includes(subjectId))) continue;
    // Transitions live beside the elements; the rendered subject carries them, as the renderers see it.
    rendered ??= new Map(buildTimelineTransitionLayout(timeline.elements, timeline.transitions ?? []).renderedElements.map((item) => [item.id, item as TimelineElement]));
    const subject = subjectId ? rendered.get(subjectId) ?? timeline.elements.find((candidate) => candidate.id === subjectId) : undefined;
    const issue = subjectWindowBindingIssue(element, subject, projectRateOrCurrent(projectId));
    if (issue) throw new Error(issue);
    const mask = props.subject_window_mask as { source_url: string };
    const prefix = projectId ? `/api/projects/${projectId}/media/grid-mattes/` : null;
    const cutoutId = prefix && mask.source_url.startsWith(prefix) ? mask.source_url.slice(prefix.length) : null;
    if (!projectId || !cutoutId || !/^[a-zA-Z0-9_-]+$/.test(cutoutId)) throw new Error("Subject window mask must be this project's prepared cutout (cutout_status grid_matte_mask).");
    const manifestPath = path.join(internalGridMatteDirectory(projectId), cutoutId, "manifest.json");
    const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { binding?: unknown } : null;
    const canonical = (value: unknown) => JSON.stringify(Object.entries((value ?? {}) as Record<string, unknown>).sort(([x], [y]) => x.localeCompare(y)));
    if (!manifest || canonical(manifest.binding) !== canonical(mask)) throw new Error("Subject window mask does not match its prepared cutout. Read it again with cutout_status.");
  }
}

function createVisualElement(
  projectId: string,
  elementId: string,
  create: z.infer<typeof editorAgentCreateVisualSchema>,
  timeline: TimelineFile,
): TimelineElement {
  const receipt = catalogedCutoutReceipt(projectId, create.source_url);
  if (create.speech_sync && !receipt) {
    throw new Error("Speech-synchronized visual creation requires a cataloged cutout receipt");
  }
  const speechSource = create.speech_sync
    ? findElement(timeline, create.speech_sync.source_element_id)
    : null;
  if (create.speech_sync && !speechSource) throw new Error("Speech-synchronized visual source is missing");
  const speechRate = speechSource && speechSource.playback_rate > 0 ? speechSource.playback_rate : 1;
  const rawTimelineStart = create.speech_sync && speechSource
    ? speechSource.timeline_start + (create.speech_sync.source_start_seconds - speechSource.trim_start) / speechRate
    : create.timeline_start;
  const authoredPlaybackRate = create.playback_rate ?? 1;
  const rawDuration = create.speech_sync
    ? (create.speech_sync.source_end_seconds - create.speech_sync.source_start_seconds) / speechRate
    : create.duration_seconds ?? (((create.source_end_seconds ?? 0) - (create.source_start_seconds ?? 0)) / authoredPlaybackRate);
  // Created visuals must land on the project frame grid exactly like patched ones —
  // they bypass applyElementPatch, so quantize here or an agent-authored clip
  // at 1.017s enters the timeline off-grid.
  const span = quantizeVisualFrameSpan(rawTimelineStart, rawDuration, { fps: currentFrameRate() });
  const duration = span.duration;
  const trimStart = create.type === "video_clip"
    ? quantizeVisualTrimValue(Math.max(0, create.speech_sync && receipt
      ? create.speech_sync.source_start_seconds - receipt.source_interval_seconds[0]
      : create.source_start_seconds ?? 0), currentFrameRate())
    : create.source_start_seconds ?? 0;
  const rawTrimEnd = create.speech_sync && receipt
    ? Math.max(0, receipt.output_duration_seconds - trimStart - span.duration * speechRate)
    : create.source_duration_seconds !== undefined && create.source_end_seconds !== undefined
    ? Math.max(0, create.source_duration_seconds - create.source_end_seconds)
    : null;
  const trimEnd = rawTrimEnd != null && create.type === "video_clip"
    ? quantizeVisualTrimValue(rawTrimEnd, currentFrameRate())
    : rawTrimEnd;
  const authoritativeSourceDuration = create.speech_sync && receipt
    ? receipt.output_duration_seconds
    : create.source_duration_seconds;
  let baseProps: Record<string, unknown> = {
    ...(create.spiral_group ? { spiral_group: create.spiral_group } : {}),
    ...(create.camera_id ? { camera_id: create.camera_id } : {}),
    ...(create.surface_track ? { surface_track: create.surface_track } : {}),
    ...(create.surface_region ? { surface_region: create.surface_region } : {}),
    ...(create.title ? { title: create.title } : {}),
    ...(authoritativeSourceDuration !== undefined
      ? { source_duration_seconds: authoritativeSourceDuration }
      : {}),
    ...(create.source_start_seconds !== undefined
      ? { source_start_seconds: create.source_start_seconds }
      : {}),
    ...(create.source_end_seconds !== undefined
      ? { source_end_seconds: create.source_end_seconds }
      : {}),
    ...(receipt ? { custom_cutout_receipt: receipt } : {}),
    ...(create.speech_sync ? {
      speech_sync_binding: {
        schema_version: 1,
        source_element_id: create.speech_sync.source_element_id,
        source_sha256: create.speech_sync.source_sha256,
        source_start_seconds: create.speech_sync.source_start_seconds,
        source_end_seconds: create.speech_sync.source_end_seconds,
        source_playback_rate: speechRate,
      },
    } : {}),
    ...(create.editorial_role ? { editorial_role: create.editorial_role } : {}),
    ...(create.beat_label ? { beat_label: create.beat_label } : {}),
    ...(create.ripple_after ? { ripple_after: true } : {}),
    ...(create.rough_beat_kind ? { rough_beat_kind: create.rough_beat_kind } : {}),
    ...(create.source_manifest_id ? { source_manifest_id: create.source_manifest_id } : {}),
    ...(create.editorial_role === "product-walkthrough-rough-spine" ? { objectFit: "contain" } : {}),
    ...(create.source_start_seconds !== undefined && create.source_end_seconds !== undefined
      ? {
          source_interval: {
            start_seconds: create.source_start_seconds,
            duration_seconds: create.source_end_seconds - create.source_start_seconds,
          },
        }
      : {}),
    ...(create.edge_aura !== undefined ? { edge_aura: create.edge_aura } : {}),
    ...(create.media_orientation ? { media_orientation: create.media_orientation } : {}),
    ...(create.media_mirror ? { media_mirror: create.media_mirror } : {}),
    media_blend_mode: create.media_blend_mode ?? "normal",
    ...(create.subject_flash !== undefined ? { subject_flash: create.subject_flash } : {}),
    ...(create.subject_glow !== undefined ? { subject_glow: create.subject_glow } : {}),
    ...(create.subject_glow_radius !== undefined ? { subject_glow_radius: create.subject_glow_radius } : {}),
    ...(create.recolor_color !== undefined ? { recolor_color: create.recolor_color } : {}),
    ...(create.recolor_amount !== undefined ? { recolor_amount: create.recolor_amount } : {}),
    ...(create.recolor_preserve_shading !== undefined ? { recolor_preserve_shading: create.recolor_preserve_shading } : {}),
    ...Object.fromEntries(Object.entries(create).filter(([field, value]) => (field.startsWith("gradient_map_") || field.startsWith("glitch_") || field.startsWith("film_") || field.startsWith("subject_window_")) && value !== undefined)),
    media_opacity: create.media_opacity ?? 1,
    has_alpha: create.has_alpha ?? false,
    ...(create.sticker_outline === true ? { sticker_outline: true } : {}),
    ...(create.sticker_outline_color !== undefined ? { sticker_outline_color: create.sticker_outline_color } : {}),
    ...(create.sticker_outline_width !== undefined ? { sticker_outline_width: create.sticker_outline_width } : {}),
    ...(create.directional_blur_x !== undefined ? { directional_blur_x: create.directional_blur_x } : {}),
    ...(create.directional_blur_y !== undefined ? { directional_blur_y: create.directional_blur_y } : {}),
    ...(create.effect_role ? { effect_role: create.effect_role } : {}),
    ...(create.media_scale !== undefined ? { media_scale: create.media_scale } : {}),
    ...(create.media_offset_x !== undefined ? { media_offset_x: create.media_offset_x } : {}),
    ...(create.media_offset_y !== undefined ? { media_offset_y: create.media_offset_y } : {}),
    ...(create.window_open_duration !== undefined ? { window_open_duration: create.window_open_duration } : {}),
    ...(create.window_corner_radius !== undefined ? { window_corner_radius: create.window_corner_radius } : {}),
    ...(create.window_side_margin_percent !== undefined ? { window_side_margin_percent: create.window_side_margin_percent } : {}),
    ...(create.window_vertical_margin_percent !== undefined ? { window_vertical_margin_percent: create.window_vertical_margin_percent } : {}),
    ...(create.mask_line_rotation !== undefined ? { mask_line_rotation: create.mask_line_rotation } : {}),
    ...(create.mask_inset !== undefined ? { mask_inset: create.mask_inset } : {}),
    ...(create.mask_feather !== undefined ? { mask_feather: create.mask_feather } : {}),
    ...(create.mask_corner_radius !== undefined ? { mask_corner_radius: create.mask_corner_radius } : {}),
    ...(create.animationIn !== undefined ? { animationIn: create.animationIn } : {}),
    ...(create.animationOut !== undefined ? { animationOut: create.animationOut } : {}),
    ...(create.animationInDuration !== undefined ? { animationInDuration: create.animationInDuration } : {}),
    ...(create.animationOutDuration !== undefined ? { animationOutDuration: create.animationOutDuration } : {}),
    ...(create.semanticLayout
      ? resolveSemanticVisualLayout(
          create.semanticLayout,
          create.sticker_outline === true ? "bottom_weighted_subject" : "canvas",
        )
      : {}),
    ...(create.crowdLayout ? resolveSemanticCrowdLayout(create.crowdLayout) : {}),
  };
  for (const field of COLOR_GRADE_FIELDS) {
    const value = create.color_grade?.[field];
    if (typeof value === "number") baseProps = commitColorGradeFieldAtTime(baseProps, 0, field as ColorGradeField, value);
  }
  for (const field of COLOR_GRADE_ADVANCED_FIELDS) {
    const value = (create.color_grade as Record<string, unknown> | undefined)?.[field];
    if (Array.isArray(value)) baseProps = commitAdvancedColorGradeFieldAtTime(baseProps, 0, field as AdvancedColorGradeField, value);
  }
  if (create.chroma_key_color !== undefined) {
    baseProps = commitChromaKeyColor(baseProps, create.chroma_key_color);
    for (const field of CHROMA_KEY_AMOUNT_FIELDS) {
      const value = create[field];
      if (value !== undefined) baseProps = commitChromaKeyAmountAtTime(baseProps, 0, field, value);
    }
  }
  if (create.transition_keyframes) {
    if (Object.values(create.transition_keyframes).some(points => points?.some(point => point.t > duration + 1e-6))) throw new Error("Transition keyframes must fit within the clip duration");
    baseProps.keyframes = { ...((baseProps.keyframes ?? {}) as Record<string, unknown>), ...create.transition_keyframes };
  }
  if (create.mask_inset_keyframes) {
    if (create.mask_inset_keyframes.some(point => point.t > duration)) throw new Error("Mask keyframes must fit within the clip duration");
    baseProps.keyframes = { ...((baseProps.keyframes ?? {}) as Record<string, unknown>), mask_inset: create.mask_inset_keyframes };
  }
  const prepared =create.type === "video_clip" ? preparedPlacement(projectId, create.source_url, baseProps) : null;
  if (prepared) baseProps = prepared.props;
  return {
    id: elementId,
    project_id: projectId,
    type: create.type,
    source_url: prepared?.source_url ?? create.source_url,
    props: create.motion_preset
      ? applyMediaMotionPreset(baseProps, create.motion_preset, duration)
      : baseProps,
    beat_id: null,
    voice_clip_id: create.speech_sync?.source_element_id ?? null,
    character_id: null,
    timeline_start: span.timeline_start,
    duration,
    lane_key: create.lane_key,
    lane_index: create.lane_index,
    trim_start: trimStart,
    trim_end: trimEnd,
    volume: create.volume ?? 0,
    fade_in: 0,
    fade_out: 0,
    playback_rate: create.speech_sync ? speechRate : authoredPlaybackRate,
    position_locked: false,
    removed_at: null,
    removed_reason: null,
    ...newRowTimestamps(),
  };
}

/** Outline and point keyframes for a shape_morph patch: keys fitted together, matched, stored as flat point lists. */
function shapeMorphProps(props: Record<string, unknown>, morph: z.infer<typeof shapeMorphSchema>): Record<string, unknown> {
  const outlines = fitContourSetsToUnitBox(morph.map((key) => parseSvgPath(key.v))).sets;
  const matched = matchOutlines(outlines.map(normalizeShapeContours));
  const keyframes = { ...((props.keyframes ?? {}) as Record<string, unknown>) };
  keyframes.shape_contours = morph.map((key, index) => ({ t: key.t, v: encodeShapePoints(matched[index]), ...(key.ease ? { ease: key.ease } : {}) }));
  return { shape_contours: matched[0], keyframes };
}

function createShapeElement(
  projectId: string,
  elementId: string,
  create: z.infer<typeof editorAgentCreateShapeSchema>,
): TimelineElement {
  const now = new Date().toISOString();
  const { title, timeline_start, duration_seconds, lane_key, lane_index, keyframes, shape_path_d, ...look } = create;
  const definedLook: Record<string, unknown> = Object.fromEntries(Object.entries(look).filter(([, value]) => value !== undefined));
  // SVG path data is stored as editable points, so the person can drag them later.
  const morph = keyframes?.shape_contours;
  let morphOutlines: ShapeContour[][] = [];
  if (shape_path_d != null) {
    // Keys share the shape's SVG coordinates, so they are fitted into its box together.
    const fitted = fitContourSetsToUnitBox([parseSvgPath(shape_path_d), ...(morph ?? []).map((key) => parseSvgPath(key.v))]).sets;
    definedLook.shape_contours = fitted[0];
    morphOutlines = fitted.slice(1);
  }
  if (definedLook.shape_contours != null) definedLook.shape_contours = normalizeShapeContours(definedLook.shape_contours);
  if (morph) {
    // Every key gets the outline's structure, so the shape can travel point by point.
    const matched = matchOutlines([definedLook.shape_contours as ShapeContour[], ...morphOutlines.map(normalizeShapeContours)]);
    definedLook.shape_contours = matched[0];
    morphOutlines = matched.slice(1);
  }
  // Morph keys are stored as flat point lists, like any other keyframed value.
  const storedKeyframes = morph
    ? { ...keyframes, shape_contours: morph.map((key, index) => ({ t: key.t, v: encodeShapePoints(morphOutlines[index]), ...(key.ease ? { ease: key.ease } : {}) })) }
    : keyframes;
  return {
    id: elementId,
    project_id: projectId,
    type: "shape",
    source_url: null,
    props: {
      ...(title ? { title } : {}),
      ...definedLook,
      ...(storedKeyframes && Object.keys(storedKeyframes).length ? { keyframes: storedKeyframes } : {}),
    },
    beat_id: null,
    voice_clip_id: null,
    character_id: null,
    timeline_start,
    duration: duration_seconds,
    lane_key,
    lane_index,
    trim_start: 0,
    trim_end: 0,
    volume: 0,
    fade_in: 0,
    fade_out: 0,
    playback_rate: 1,
    position_locked: false,
    removed_at: null,
    removed_reason: null,
    created_at: now,
    updated_at: now,
  } as TimelineElement;
}

function createTextElement(
  projectId: string,
  elementId: string,
  create: z.infer<typeof editorAgentCreateTextSchema>,
): TimelineElement {
  return {
    id: elementId,
    project_id: projectId,
    type: "caption_text",
    source_url: null,
    props: {
      text: create.text,
      ...(create.surface_track ? { surface_track: create.surface_track } : {}),
      ...(create.spiral_group ? { spiral_group: create.spiral_group } : {}),
      ...(create.camera_id ? { camera_id: create.camera_id } : {}),
      ...(create.absX !== undefined ? { absX: create.absX } : {}),
      ...(create.absY !== undefined ? { absY: create.absY } : {}),
      ...(create.mediaFillVideoPreviewUrl !== undefined ? { mediaFillVideoPreviewUrl: create.mediaFillVideoPreviewUrl } : {}),
      ...(create.mediaFillVideoPlaybackRate !== undefined ? { mediaFillVideoPlaybackRate: create.mediaFillVideoPlaybackRate } : {}),
      ...(create.mediaFillScene !== undefined ? { mediaFillScene: create.mediaFillScene } : {}),
      ...(create.mediaFillVideoUrl !== undefined ? { mediaFillVideoUrl: create.mediaFillVideoUrl } : {}),
      ...(create.mediaFillUrls !== undefined ? { mediaFillUrls: create.mediaFillUrls } : {}),
      ...(create.mediaFillSecondsPerImage !== undefined ? { mediaFillSecondsPerImage: create.mediaFillSecondsPerImage } : {}),
      ...(create.mediaFillCrossfadeSeconds !== undefined ? { mediaFillCrossfadeSeconds: create.mediaFillCrossfadeSeconds } : {}),
      ...(create.mediaFillScale !== undefined ? { mediaFillScale: create.mediaFillScale } : {}),
      ...(create.mediaFillPanPercent !== undefined ? { mediaFillPanPercent: create.mediaFillPanPercent } : {}),
      ...(create.title ? { title: create.title } : {}),
      ...(create.positionPreset ? { positionPreset: create.positionPreset } : {}),
      ...(create.place ? { place: create.place } : {}),
      fontPreset: create.fontPreset,
      fontSizePx: create.fontSizePx,
      ...(create.handwritingWeight !== undefined ? { handwritingWeight: create.handwritingWeight } : {}),
      styleVariant: create.styleVariant,
      maxWidth: create.maxWidth,
      textAlign: create.textAlign,
      ...(create.textColor ? { textColor: create.textColor } : {}),
      ...(create.rotationDeg !== undefined ? { rotationDeg: create.rotationDeg } : {}),
      ...(create.wordStyles?.length ? { wordStyles: create.wordStyles } : {}),
      singleLine: create.singleLine ?? true,
      ...(create.animationIn ? { animationIn: create.animationIn } : {}),
      ...(create.animationOut ? { animationOut: create.animationOut } : {}),
      ...(create.animationInDuration !== undefined ? { animationInDuration: create.animationInDuration } : {}),
      ...(create.animationOutDuration !== undefined ? { animationOutDuration: create.animationOutDuration } : {}),
      graphic_text_role: "native_label",
    },
    beat_id: null,
    voice_clip_id: null,
    character_id: null,
    timeline_start: create.timeline_start,
    duration: create.duration_seconds,
    lane_key: create.lane_key,
    lane_index: create.lane_index,
    trim_start: 0,
    trim_end: null,
    volume: 1,
    fade_in: 0,
    fade_out: 0,
    playback_rate: 1,
    position_locked: false,
    removed_at: null,
    removed_reason: null,
    ...newRowTimestamps(),
  };
}

function applyOpeningSequenceEdit(
  timeline: TimelineFile,
  projectId: string,
  operation: EditorAgentOperation,
): string[] {
  const edit = operation.opening_sequence_edit;
  if (!edit) return [];
  const target = findElement(timeline, operation.element_id);
  validateOperationAgainstTimeline(operation, timeline);
  if (!target) throw new Error(`Timeline element not found: ${operation.element_id}`);

  const removedSeconds = edit.remove_opening_seconds;
  const now = new Date().toISOString();
  const touched = new Set<string>();
  const replacementCaption = findElement(timeline, edit.replacement_caption_element_id);
  if (!replacementCaption) throw new Error("Opening sequence replacement caption not found");
  const replacementCaptionEnd = replacementCaption.timeline_start + replacementCaption.duration;

  for (const candidate of activeElements(timeline)) {
    const start = candidate.timeline_start;
    const end = start + candidate.duration;
    if (candidate.id === target.id) {
      const rate = candidate.playback_rate > 0 ? candidate.playback_rate : 1;
      candidate.trim_start += removedSeconds * rate;
      candidate.duration -= removedSeconds;
      candidate.updated_at = now;
      touched.add(candidate.id);
      continue;
    }
    if (start >= removedSeconds) {
      candidate.timeline_start = Math.max(0, start - removedSeconds);
      candidate.updated_at = now;
      touched.add(candidate.id);
      continue;
    }
    if (end <= removedSeconds || (candidate.type === "caption_text" && edit.drop_boundary_captions)) {
      candidate.removed_at = now;
      candidate.removed_reason = "proposal_opening_ripple";
      candidate.updated_at = now;
      touched.add(candidate.id);
      continue;
    }

    // A non-caption element spanning the opening boundary keeps its tail. For
    // source-timed media, advance the source trim by the removed wall time.
    const overlap = removedSeconds - start;
    const rate = candidate.playback_rate > 0 ? candidate.playback_rate : 1;
    candidate.timeline_start = 0;
    candidate.duration = end - removedSeconds;
    if (["video_clip", "music", "sound_effect", "vo_segment", "vo_full"].includes(candidate.type)) {
      candidate.trim_start += overlap * rate;
    }
    candidate.updated_at = now;
    touched.add(candidate.id);
  }

  replacementCaption.timeline_start = 0;
  replacementCaption.duration = Math.max(1 / currentFrameRate(), replacementCaptionEnd - removedSeconds);
  replacementCaption.props = {
    ...(replacementCaption.props ?? {}),
    text: edit.replacement_caption_text,
  };
  replacementCaption.removed_at = null;
  replacementCaption.removed_reason = null;
  replacementCaption.updated_at = now;
  touched.add(replacementCaption.id);

  const rate = target.playback_rate > 0 ? target.playback_rate : 1;
  const punchAt = Math.round((
    target.timeline_start
    + (edit.punch_in_source_seconds - target.trim_start) / rate
  ) * currentFrameRate()) / currentFrameRate();
  const targetEnd = target.timeline_start + target.duration;

  // Keep the retained presenter clip intact as the sole narration authority.
  // Splitting it mounted a second trimmed audio player at the punch point; even
  // frame-perfect source windows can make a browser replay a buffered syllable.
  // A silent visual overlay gives the same hard picture cut while the original
  // voice continues through the boundary without seeking or restarting.
  const inserted: TimelineElement = {
    ...structuredClone(target),
    id: edit.inserted_element_id,
    project_id: projectId,
    timeline_start: punchAt,
    duration: targetEnd - punchAt,
    trim_start: edit.punch_in_source_seconds,
    volume: 0,
    fade_in: 0,
    props: normalizeEffectProps({
      ...(target.props ?? {}),
      split_from_id: target.id,
      // Sits on top of its own source clip on purpose (see the note above), so
      // the shared visual-overlap guard must not read it as a collision.
      intentional_visual_overlay: true,
      media_scale: edit.punch_in_scale,
      media_offset_x: edit.punch_in_offset_x,
      media_offset_y: edit.punch_in_offset_y,
    }) ?? target.props,
    removed_at: null,
    removed_reason: null,
    ...newRowTimestamps(),
  };
  timeline.elements.push(inserted);
  inserted.updated_at = now;
  touched.add(inserted.id);

  // The ripple subtracts an arbitrary float from every start time, which walks
  // visuals off the frame grid. Re-quantize everything it moved before handing
  // the timeline back; without this a single opening trim de-quantizes the
  // whole cut.
  for (const candidate of activeElements(timeline)) {
    if (!touched.has(candidate.id) || !isVisualElementType(candidate.type)) continue;
    const span = quantizeVisualFrameSpan(candidate.timeline_start, candidate.duration, { fps: currentFrameRate() });
    candidate.timeline_start = span.timeline_start;
    candidate.duration = span.duration;
    if (candidate.type === "video_clip") {
      candidate.trim_start = quantizeVisualTrimValue(Math.max(0, candidate.trim_start), currentFrameRate());
      if (candidate.trim_end != null) candidate.trim_end = quantizeVisualTrimValue(Math.max(0, candidate.trim_end), currentFrameRate());
    }
  }
  assertNoVisualOverlap(timeline, [...touched]);
  return [...touched];
}

const SOURCE_TIMED_CUT_TYPES = new Set([
  "video_clip", "music", "sound_effect", "vo_segment", "vo_full",
]);

function deterministicCutElementId(seed: string): string {
  const chars = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  chars[12] = "4";
  chars[16] = "8";
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function markRemoved(element: TimelineElement, reason: string) {
  const now = new Date().toISOString();
  element.removed_at = now;
  element.removed_reason = reason;
  element.updated_at = now;
}

/**
 * A cut names the clip it was drafted against, but an earlier cut (in this card or an approved one)
 * may have split that clip, leaving the stretch to remove in a later piece. Cuts are positions in the
 * recording, so find the piece of the same recording, on the same lane, that now holds the stretch.
 * This lets several cut cards on one recording each apply on their own, in any order.
 */
function resolveSourceCutTarget(operation: EditorAgentOperation, timeline: TimelineFile): EditorAgentOperation {
  const cut = operation.source_range_cut;
  if (!cut) return operation;
  const named = findElement(timeline, operation.element_id);
  if (!named) return operation;
  const holds = (element: TimelineElement) => {
    if (element.removed_at != null || !SOURCE_TIMED_CUT_TYPES.has(element.type)) return false;
    const rate = element.playback_rate > 0 ? element.playback_rate : 1;
    return cut.source_start_seconds >= element.trim_start - 1e-6
      && cut.source_end_seconds <= element.trim_start + element.duration * rate + 1e-6;
  };
  if (holds(named)) return operation;
  const piece = activeElements(timeline).find((element) => element.id !== named.id && element.type === named.type
    && element.lane_key === named.lane_key && element.source_url === named.source_url && holds(element));
  return piece ? { ...operation, element_id: piece.id } : operation;
}

function splitOutSourceTimedRange(
  timeline: TimelineFile,
  projectId: string,
  element: TimelineElement,
  cutStart: number,
  cutEnd: number,
  middleId: string,
  rightId: string,
): string[] {
  if (findElement(timeline, middleId) || findElement(timeline, rightId)) {
    throw new Error("Derived source-range cut ids already exist");
  }
  const first = splitElementAtomic(timeline, projectId, element.id, cutStart, currentFrameRate(), 1);
  if (!first.ok) throw new Error(`Could not split ${element.id} at the cut start`);
  first.inserted.id = middleId;
  const second = splitElementAtomic(timeline, projectId, middleId, cutEnd, currentFrameRate(), 1);
  if (!second.ok) throw new Error(`Could not split ${element.id} at the cut end`);
  second.inserted.id = rightId;
  second.inserted.props = { ...second.inserted.props, caption_split_source_element_id: element.id };
  markRemoved(second.updated, "proposal_source_range_cut");
  applyElementPatch(second.inserted, { timeline_start: cutStart });
  return [first.updated.id, middleId, rightId];
}

function applySourceRangeRestore(
  timeline: TimelineFile,
  operation: EditorAgentOperation,
): string[] {
  const restore = operation.source_range_restore;
  if (!restore) return [];
  validateOperationAgainstTimeline(operation, timeline);
  const target = findElement(timeline, operation.element_id);
  if (!target) throw new Error(`Timeline element not found: ${operation.element_id}`);

  const rate = target.playback_rate > 0 ? target.playback_rate : 1;
  const boundary = target.timeline_start;
  const restoredSeconds = Math.round(((target.trim_start - restore.source_start_seconds) / rate) * currentFrameRate()) / currentFrameRate();
  const originalElements = activeElements(timeline).filter((candidate) =>
    restore.ripple_lane_keys.includes(candidate.lane_key));
  const touched = new Set<string>();

  const nextDuration = target.duration + restoredSeconds;
  const sourceDuration = Number((target.props as Record<string, unknown> | null)?.source_duration_seconds);
  const nextTrimEnd = Number.isFinite(sourceDuration)
    ? Math.max(0, sourceDuration - restore.source_start_seconds - nextDuration * rate)
    : target.trim_end;
  const unityVolumePatch = restore.reset_target_volume_to_unity
    ? writeVolumeEnvelopePatch(
        target,
        retargetVolumeEnvelope(readVolumeEnvelopePoints(target, target.duration), 1),
        nextDuration,
      )
    : null;
  const previewAudioPatch = operation.set_preview_audio_source
    ? {
        props: {
          ...(((unityVolumePatch?.props ?? target.props) ?? {}) as Record<string, unknown>),
          preview_audio_source_url: operation.set_preview_audio_source.source_url,
          preview_audio_baked_gain: operation.set_preview_audio_source.baked_gain,
        },
      }
    : null;
  applyElementPatch(target, {
    trim_start: restore.source_start_seconds,
    duration: nextDuration,
    ...(nextTrimEnd != null ? { trim_end: nextTrimEnd } : {}),
    ...(unityVolumePatch ?? {}),
    ...(previewAudioPatch ?? {}),
  });
  touched.add(target.id);

  for (const candidate of originalElements) {
    if (candidate.id === target.id) continue;
    if (captionFollowsAudio(candidate) && findElement(timeline, captionAudioSourceId(candidate)!)) continue;
    const start = candidate.timeline_start;
    const end = start + candidate.duration;
    if (start >= boundary - 1e-6) {
      applyElementPatch(candidate, { timeline_start: start + restoredSeconds });
      touched.add(candidate.id);
      continue;
    }
    if (end > boundary + 1e-6) {
      applyElementPatch(candidate, { duration: candidate.duration + restoredSeconds });
      touched.add(candidate.id);
      continue;
    }
    if (candidate.type === "caption_text" && Math.abs(end - boundary) <= 1e-6) {
      const captionSourceEnd = Number((candidate.props as Record<string, unknown> | null)?.caption_source_end_seconds);
      if (Number.isFinite(captionSourceEnd) && captionSourceEnd > restore.source_start_seconds) {
        const restoredCaptionEnd = boundary + (captionSourceEnd - restore.source_start_seconds) / rate;
        applyElementPatch(candidate, { duration: restoredCaptionEnd - start });
        touched.add(candidate.id);
      }
    }
  }

  syncTransitionsForElements(timeline, [...touched]);
  return [...touched];
}

/** Everything a speed change moves: clips on its lanes that end after it starts. Captions that
 * follow the voice are re-timed by their own binding, so they are left to it. */
function speedChangeAffected(timeline: TimelineFile, target: TimelineElement, change: z.infer<typeof editorAgentSpeedChangeSchema>) {
  return activeElements(timeline).filter(candidate => change.ripple_lane_keys.includes(candidate.lane_key)
    && !(candidate.type === "caption_text" && captionFollowsAudio(candidate))
    && candidate.timeline_start + candidate.duration > target.timeline_start + 1e-6);
}

function applySpeedChange(timeline: TimelineFile, operation: EditorAgentOperation): string[] {
  const change = operation.speed_change;
  if (!change) return [];
  validateOperationAgainstTimeline(operation, timeline);
  const target = findElement(timeline, operation.element_id);
  if (!target) throw new Error(`Timeline element not found: ${operation.element_id}`);
  const fps = currentFrameRate(), anchor = target.timeline_start, factor = change.factor;
  // Timeline time after the anchor runs `factor` times faster; frames stay whole.
  const remap = (seconds: number) => seconds <= anchor ? seconds : anchor + (seconds - anchor) / factor;
  const snap = (seconds: number) => Math.round(seconds * fps) / fps;
  const touched: string[] = [];
  for (const element of speedChangeAffected(timeline, target, change)) {
    const start = snap(remap(element.timeline_start));
    const duration = Math.max(1 / fps, snap(remap(element.timeline_start + element.duration)) - start);
    const local = (t: number) => remap(element.timeline_start + t) - start;
    const keyframes = readKeyframeMap(element.props as Record<string, unknown> | null);
    if (Object.keys(keyframes).length) {
      const scaled = Object.fromEntries(Object.entries(keyframes).map(([field, points]) => [field, points.map(point => ({
        ...point, t: Math.min(duration, Math.max(0, local(point.t))),
        // A speed step is a rate: it speeds up by the same factor; its source boundary stays put.
        ...(field === "playback_rate" && typeof point.v === "number" ? { v: point.v * factor } : {}),
      }))]));
      element.props = writeKeyframeMap(element.props as Record<string, unknown> | null, scaled);
    }
    const envelope = (element.props as Record<string, unknown> | null)?.volume_envelope;
    if (Array.isArray(envelope)) {
      element.props = { ...element.props, volume_envelope: envelope.map(point => ({ ...point, time_seconds: Math.max(0, local(point.time_seconds)) })) };
    }
    // Media keeps the same footage and plays it faster; trim_end is unchanged.
    if (SOURCE_TIMED_CUT_TYPES.has(element.type) && element.playback_rate > 0) {
      const span = element.duration * element.playback_rate;
      const rate = span / duration;
      if (rate > 4) {
        // Media plays at most 4×: a clip that would pass it keeps its place and length and shows
        // a little less of its footage, so the Speed dial keeps its whole range.
        element.playback_rate = 4;
        const sourceDuration = (element.props as Record<string, unknown> | null)?.source_duration_seconds;
        element.trim_end = typeof sourceDuration === "number"
          ? Math.max(0, sourceDuration - element.trim_start - duration * 4)
          : (element.trim_end ?? 0) + span - duration * 4;
      } else element.playback_rate = rate;
    }
    element.timeline_start = start;
    element.duration = duration;
    element.updated_at = new Date().toISOString();
    touched.push(element.id);
  }
  return touched;
}

function applySourceRangeCut(
  timeline: TimelineFile,
  projectId: string,
  operation: EditorAgentOperation,
): string[] {
  const cut = operation.source_range_cut;
  if (!cut) return [];
  validateOperationAgainstTimeline(operation, timeline);
  const target = findElement(timeline, operation.element_id);
  if (!target) throw new Error(`Timeline element not found: ${operation.element_id}`);

  const rate = target.playback_rate > 0 ? target.playback_rate : 1;
  const cutStart = Math.round((
    target.timeline_start + (cut.source_start_seconds - target.trim_start) / rate
  ) * currentFrameRate()) / currentFrameRate();
  const cutEnd = Math.round((
    target.timeline_start + (cut.source_end_seconds - target.trim_start) / rate
  ) * currentFrameRate()) / currentFrameRate();
  const removedSeconds = cutEnd - cutStart;
  const originalElements = activeElements(timeline).filter((candidate) =>
    !cut.ripple_lane_keys || cut.ripple_lane_keys.includes(candidate.lane_key));
  const touched = new Set<string>();

  for (const id of splitOutSourceTimedRange(
    timeline,
    projectId,
    target,
    cutStart,
    cutEnd,
    cut.removed_segment_id,
    cut.inserted_element_id,
  )) touched.add(id);

  for (const candidate of originalElements) {
    if (candidate.id === target.id) continue;
    if (captionFollowsAudio(candidate) && findElement(timeline, captionAudioSourceId(candidate)!)) continue;
    const start = candidate.timeline_start;
    const end = start + candidate.duration;
    if (end <= cutStart + 1e-6) continue;

    if (start >= cutEnd - 1e-6) {
      applyElementPatch(candidate, { timeline_start: start - removedSeconds });
      touched.add(candidate.id);
      continue;
    }

    if (start >= cutStart - 1e-6 && end <= cutEnd + 1e-6) {
      markRemoved(candidate, "proposal_source_range_cut");
      touched.add(candidate.id);
      continue;
    }

    const isSourceTimed = SOURCE_TIMED_CUT_TYPES.has(candidate.type);
    if (start < cutStart && end > cutEnd) {
      if (isSourceTimed) {
        const seed = `${cut.inserted_element_id}:${candidate.id}`;
        for (const id of splitOutSourceTimedRange(
          timeline,
          projectId,
          candidate,
          cutStart,
          cutEnd,
          deterministicCutElementId(`${seed}:removed`),
          deterministicCutElementId(`${seed}:right`),
        )) touched.add(id);
      } else {
        applyElementPatch(candidate, { duration: candidate.duration - removedSeconds });
        touched.add(candidate.id);
      }
      continue;
    }

    if (start < cutStart) {
      if (isSourceTimed) {
        const split = splitElementAtomic(timeline, projectId, candidate.id, cutStart, currentFrameRate(), 1);
        if (!split.ok) throw new Error(`Could not trim ${candidate.id} at the cut start`);
        split.inserted.id = deterministicCutElementId(`${cut.inserted_element_id}:${candidate.id}:tail`);
        markRemoved(split.inserted, "proposal_source_range_cut");
        touched.add(split.inserted.id);
      } else {
        applyElementPatch(candidate, { duration: cutStart - start });
      }
      touched.add(candidate.id);
      continue;
    }

    if (isSourceTimed) {
      const split = splitElementAtomic(timeline, projectId, candidate.id, cutEnd, currentFrameRate(), 1);
      if (!split.ok) throw new Error(`Could not trim ${candidate.id} at the cut end`);
      split.inserted.id = deterministicCutElementId(`${cut.inserted_element_id}:${candidate.id}:head`);
      markRemoved(split.updated, "proposal_source_range_cut");
      applyElementPatch(split.inserted, { timeline_start: cutStart });
      touched.add(split.inserted.id);
    } else {
      applyElementPatch(candidate, {
        timeline_start: cutStart,
        duration: end - cutEnd,
      });
    }
    touched.add(candidate.id);
  }

  return [...touched];
}

function applyReattachOriginalAudio(
  timeline: TimelineFile,
  operation: EditorAgentOperation,
): string[] {
  const reattach = operation.reattach_original_audio;
  if (!reattach) return [];
  validateOperationAgainstTimeline(operation, timeline);
  const video = findElement(timeline, operation.element_id);
  const audio = findElement(timeline, reattach.audio_element_id);
  if (!video || !audio) throw new Error("Original-audio reattach targets are missing");

  const now = new Date().toISOString();
  const props = { ...(video.props ?? {}) } as Record<string, unknown>;
  const savedEnvelope = Array.isArray(props.detached_audio_original_volume_envelope)
    ? props.detached_audio_original_volume_envelope
    : Array.isArray(props.volume_envelope)
      && props.volume_envelope.some((point) =>
        point && typeof point === "object" && Number((point as { volume?: unknown }).volume) > 0)
        ? props.volume_envelope
        : [
            { time_seconds: 0, volume: 1 },
            { time_seconds: video.duration, volume: 1 },
          ];
  const savedVolume = typeof props.detached_audio_original_volume === "number"
    ? props.detached_audio_original_volume
    : 1;
  delete props.detached_audio_element_id;
  delete props.detached_audio_original_volume;
  delete props.detached_audio_original_volume_envelope;
  props.volume_envelope = savedEnvelope;

  video.props = props;
  video.volume = savedVolume;
  video.updated_at = now;
  audio.removed_at = now;
  audio.removed_reason = "proposal_reattach_original_audio";
  audio.updated_at = now;
  return [video.id, audio.id];
}

function applySpeechVisualSync(
  timeline: TimelineFile,
  operation: EditorAgentOperation,
): string[] {
  const sync = operation.sync_speech_visual;
  if (!sync) return [];
  validateOperationAgainstTimeline(operation, timeline);
  const visual = findElement(timeline, operation.element_id);
  const source = findElement(timeline, sync.source_element_id);
  if (!visual || !source) throw new Error("Speech visual sync targets are missing");
  const replacementReceipt = sync.source_url
    ? catalogedCutoutReceipt(visual.project_id, sync.source_url)
    : null;
  const receipt = replacementReceipt
    ? {
        source_sha256: replacementReceipt.source_sha256,
        start: replacementReceipt.source_interval_seconds[0],
        end: replacementReceipt.source_interval_seconds[1],
      }
    : speechVisualReceipt(visual);
  if (!receipt) throw new Error("Speech visual receipt is missing");
  const rate = source.playback_rate > 0 ? source.playback_rate : 1;
  const rawStart = source.timeline_start + (sync.source_start_seconds - source.trim_start) / rate;
  const rawDuration = (sync.source_end_seconds - sync.source_start_seconds) / rate;
  const span = quantizeVisualFrameSpan(rawStart, rawDuration, { fps: currentFrameRate() });
  const sourceDuration = replacementReceipt?.output_duration_seconds
    ?? Number((visual.props as Record<string, unknown> | null)?.source_duration_seconds);
  const trimStart = Math.max(0, sync.source_start_seconds - receipt.start);
  const retainedSourceDuration = span.duration * rate;
  const trimEnd = Math.max(0, sourceDuration - trimStart - retainedSourceDuration);
  const now = new Date().toISOString();
  visual.timeline_start = span.timeline_start;
  visual.duration = span.duration;
  visual.trim_start = quantizeVisualTrimValue(trimStart, currentFrameRate());
  visual.trim_end = quantizeVisualTrimValue(trimEnd, currentFrameRate());
  visual.playback_rate = rate;
  if (sync.source_url && replacementReceipt) {
    visual.source_url = sync.source_url;
  }
  if (sync.lane_key != null && sync.lane_index != null) {
    visual.lane_key = sync.lane_key;
    visual.lane_index = sync.lane_index;
  }
  visual.voice_clip_id = source.id;
  visual.props = {
    ...(visual.props ?? {}),
    ...(replacementReceipt
      ? {
          source_duration_seconds: replacementReceipt.output_duration_seconds,
          custom_cutout_receipt: replacementReceipt,
          preview_source_url: replacementReceipt.preview
            ? `/api/projects/${visual.project_id}/media/${replacementReceipt.preview.relative_path}`
            : null,
          source_interval: {
            start_seconds: 0,
            duration_seconds: replacementReceipt.output_duration_seconds,
          },
        }
      : {}),
    speech_sync_binding: {
      schema_version: 1,
      source_element_id: source.id,
      source_sha256: sync.source_sha256,
      source_start_seconds: sync.source_start_seconds,
      source_end_seconds: sync.source_end_seconds,
      source_playback_rate: rate,
    },
    ...(sync.semanticLayout ? resolveSemanticVisualLayout(sync.semanticLayout) : {}),
  };
  visual.updated_at = now;
  return [visual.id];
}

function applyCaptionReplacement(
  timeline: TimelineFile,
  projectId: string,
  operation: EditorAgentOperation,
): string[] {
  const replacement = operation.replace_captions;
  if (!replacement) return [];
  validateOperationAgainstTimeline(operation, timeline);
  const now = new Date().toISOString();
  const touched: string[] = [];
  const scopedSourceIds = replacement.source_element_ids
    ? new Set(replacement.source_element_ids)
    : null;
  for (const existing of activeElements(timeline)) {
    if (existing.type !== "caption_text") continue;
    if (replacement.preserve_element_ids?.includes(existing.id)) continue;
    const replacementStart = replacement.from_timeline_seconds;
    if (replacementStart != null && existing.timeline_start + existing.duration <= replacementStart + 1e-6) continue;
    if (
      scopedSourceIds
      && !scopedSourceIds.has(String((existing.props as Record<string, unknown> | null)?.caption_source_element_id ?? ""))
    ) continue;
    existing.removed_at = now;
    existing.removed_reason = "proposal_caption_replace";
    existing.updated_at = now;
    touched.push(existing.id);
  }
  for (const cue of replacement.cues) {
    const speechSource = timeline.elements.find((row) => row.id === cue.timing_source.element_id)!;
    const wordCount = cue.text.trim().split(/\s+/).length;
    const caption: TimelineElement = {
      id: cue.element_id,
      project_id: projectId,
      type: "caption_text",
      source_url: null,
      props: {
        text: cue.text,
        fontSizePx: replacement.font_size_px,
        maxWidth: replacement.max_width,
        positionPreset: replacement.position_preset,
        ...(replacement.offsetX != null ? { offsetX: replacement.offsetX } : {}),
        ...(replacement.offsetY != null ? { offsetY: replacement.offsetY } : {}),
        ...(replacement.timing_mode ? { timingMode: replacement.timing_mode } : {}),
        ...(replacement.singleWordFlipSeconds != null ? { singleWordFlipSeconds: replacement.singleWordFlipSeconds } : {}),
        hidePunctuation: replacement.hide_punctuation ?? SPEECH_CAPTIONS_HIDE_PUNCTUATION,
        ...(replacement.font_sizing ? { fontSizing: replacement.font_sizing } : {}),
        fontPreset: replacement.font_preset,
        styleVariant: replacement.style_variant,
        caption_source_text: cue.caption_source_text,
        caption_alignment_path: cue.caption_alignment_path,
        caption_alignment_sha256: cue.timing_source.alignment_sha256,
        caption_source_element_id: cue.timing_source.element_id,
        caption_source_start_seconds: cue.timing_source.source_start_seconds,
        caption_source_end_seconds: cue.timing_source.source_end_seconds,
        caption_source_playback_rate: cue.timing_source.playback_rate,
        ...(cue.hold_until_source_seconds != null
          ? { caption_hold_until_source_seconds: cue.hold_until_source_seconds }
          : {}),
        caption_timing: "mfa_alignment",
        caption_single_line_contract: true,
        caption_grouping: replacement.grouping,
        caption_word_limit: replacement.word_limit,
        caption_word_count: wordCount,
        // Keep alignment even in phrase mode so future cuts do not need another transcription.
        wordTimings: captionDisplayWords(readCaptionAlignment(cue.caption_alignment_path).words
          .filter((word) => word.start >= cue.timing_source.source_start_seconds - 0.001
            && word.end <= cue.timing_source.source_end_seconds + 0.001), cue.caption_display_substitutions)
          .map((word) => ({ text: word.word,
            start: sourceTimeToTimelineTime(speechSource, word.start) - sourceTimeToTimelineTime(speechSource, cue.timing_source.source_start_seconds),
            end: sourceTimeToTimelineTime(speechSource, word.end) - sourceTimeToTimelineTime(speechSource, cue.timing_source.source_start_seconds) })),
        ...(cue.style ?? {}),
        ...(cue.caption_fast_verbatim ? { caption_fast_verbatim: true } : {}),
        ...(cue.caption_rapid_fragment ? { caption_rapid_fragment: true } : {}),
      },
      beat_id: null,
      voice_clip_id: cue.timing_source.element_id,
      character_id: null,
      timeline_start: cue.timeline_start,
      duration: cue.duration,
      lane_key: cue.lane_key ?? replacement.lane_key,
      lane_index: cue.lane_index ?? 0,
      trim_start: 0,
      trim_end: null,
      volume: 1,
      fade_in: 0,
      fade_out: 0,
      playback_rate: 1,
      position_locked: false,
      removed_at: null,
      removed_reason: null,
      ...newRowTimestamps(),
    };
    const source = timeline.elements.find((row) => row.id === cue.timing_source.element_id)!;
    bindGeneratedCaption(caption, source);
    timeline.elements.push(caption);
    touched.push(caption.id);
  }
  return touched;
}

export function validateEditorAgentProposal(raw: unknown, runtimeMaxMutations: number) {
  const parsed = parseEditorAgentProposal(raw);
  const proposal = {
    ...parsed,
    options: parsed.options.map((option) => ({
      ...option,
      operations: option.operations.map((operation) => ({ ...operation, props: normalizeEffectProps(operation.props) })),
    })),
  } as EditorAgentProposal;
  const maxMutations = Math.max(0, Math.min(EDITOR_AGENT_MAX_MUTATIONS, Math.floor(runtimeMaxMutations)));
  // An omitted cap is the runtime's; only a cap the agent states must match it.
  if ((raw as { caps?: { max_mutations?: unknown } } | null)?.caps?.max_mutations === undefined) {
    if (proposal.caps.requested_mutations > maxMutations) throw new Error(`Proposal changes ${proposal.caps.requested_mutations} fields; the runtime cap is ${maxMutations}`);
    proposal.caps = { ...proposal.caps, max_mutations: maxMutations };
  }
  if (proposal.caps.max_mutations !== maxMutations) {
    throw new Error(`Proposal cap ${proposal.caps.max_mutations} does not match runtime cap ${maxMutations}`);
  }
  return proposal;
}

/** `baseTimeline`: a later wave step validates on top of the earlier steps it needs. */
/** One option derived onto the live timeline during validation, kept so a caller need not derive it again. */
export type LiveOptionDerivation = { option: EditorAgentOption; base: TimelineFile; derived: ReturnType<typeof deriveProposalTimeline> };

/**
 * How `onDerived` receives each derive. `independent` (the default): a result that shares nothing with
 * the base, the caller's to change. `read_only`: the derive itself, without that copy (about half a
 * derive's cost on a long talk). Rows the option leaves alone are the base's own objects; the rest is
 * frozen as `freezeOwnParts` describes. The receiver must not change the result (nested values included)
 * and must not change the base while the result is in use.
 */
export type DerivedAccess = "independent" | "read_only";

export function validateEditorAgentProposalAgainstProject(raw: unknown, runtimeMaxMutations: number, projectId: string, baseTimeline?: TimelineFile,
  onDerived?: (derivation: LiveOptionDerivation) => void, derivedAccess: DerivedAccess = "independent") {
  return withFrameRate(projectRateOrCurrent(projectId), () => validateAgainstProjectAtRate(raw, runtimeMaxMutations, projectId, baseTimeline, onDerived, derivedAccess));
}

/**
 * Freeze a derive's own parts for a read-only receiver: the result, its timeline object, row and
 * transition arrays, each row that is not the base's own object and that row's props, the touched ids
 * and lane keys. Values nested deeper may be shared with the proposal's operations (a patch's keyframes)
 * or the base, so they are left as they are.
 */
function freezeOwnParts(derived: ProposalDerivation, base: TimelineFile): ProposalDerivation {
  const baseRows = new Set<TimelineElement>(base.elements);
  for (const row of derived.timeline.elements) {
    if (baseRows.has(row)) continue;
    if (row.props) Object.freeze(row.props);
    Object.freeze(row);
  }
  for (const transition of derived.timeline.transitions ?? []) Object.freeze(transition);
  for (const value of [derived.timeline.elements, derived.timeline.transitions, derived.timeline, derived.touched,
    derived.laneOrderKeys, derived.mutedLaneKeys, derived.outputFormat, derived]) if (value) Object.freeze(value);
  return derived;
}

function validateAgainstProjectAtRate(raw: unknown, runtimeMaxMutations: number, projectId: string, baseTimeline: TimelineFile | undefined,
  onDerived: ((derivation: LiveOptionDerivation) => void) | undefined, derivedAccess: DerivedAccess) {
  const proposal = validateEditorAgentProposal(raw, runtimeMaxMutations);
  if (proposal.project_id !== projectId) throw new Error("--project does not match proposal.project_id");
  const timeline = baseTimeline ?? readTimeline(projectId);
  // Every option must be independently applicable — the human may pick any of them.
  for (const option of proposal.options) {
    // Draft-time only (not on every re-parse): each block must compile across every setting's advertised range.
    for (const block of option.blocks ?? []) {
      try { validateBlockRanges(block); } catch (error) {
        throw Object.assign(new Error(`Option ${option.id}: ${error instanceof Error ? error.message : String(error)}`), error instanceof BlockSettingError ? { block_id: error.block_id, field: error.field, value: error.value } : {});
      }
    }
    // Validate against a derived copy in operation order so one atomic unit may
    // retire an actor before mounting its exact replacement on the same lane.
    assertHoldControlSources(option, timeline.elements);
    // The admission check only reads the result, so it may share untouched rows with `timeline`.
    const derivation = deriveSharingRows(timeline, option.operations, projectId, option.preserve_fields);
    // GPU-first: an option may not introduce content Browser GPU cannot draw.
    assertGpuWriteAdmissible(timeline, derivation.derived.timeline, `Proposal option ${option.id}`,
      props => hydrateCaptionFill(props, readPreviewSettings(projectId).quality));
    if (onDerived) {
      onDerived({ option, base: timeline, derived: derivedAccess === "read_only" ? freezeOwnParts(derivation.derived, timeline) : independentDerivation(derivation) });
    }
  }
  return proposal;
}

export function timelineRevision(projectId: string): string {
  return createHash("sha256").update(fs.readFileSync(projectTimelinePath(projectId))).digest("hex");
}

const SPEECH_CLOCK_PATCH_FIELDS = ["timeline_start", "duration", "trim_start", "trim_end", "playback_rate"] as const;

/**
 * A speech clip with source-bound picture or captions is one editorial clock.
 * Refuse proposals that move only the master: every visible derivative must be
 * re-derived and the complete caption rail must be replaced in the same option.
 */
function assertSpeechClockBundleIsAtomic(
  timeline: TimelineFile,
  operations: readonly EditorAgentOperation[],
) {
  for (const [sourceOperationIndex, operation] of operations.entries()) {
    if (!operation.patch || !SPEECH_CLOCK_PATCH_FIELDS.some((field) => field in operation.patch!)) continue;
    const source = findElement(timeline, operation.element_id);
    if (!source || source.removed_at != null || !AUDIO_CAPABLE_TYPES.has(source.type)) continue;

    const linkedVisuals = activeElements(timeline).filter((candidate) => {
      const binding = (candidate.props as Record<string, unknown> | null)?.speech_sync_binding;
      return binding != null
        && typeof binding === "object"
        && (binding as { source_element_id?: unknown }).source_element_id === source.id;
    });
    if (linkedVisuals.length === 0) continue;

    const missingVisual = linkedVisuals.find((visual) => {
      const syncIndex = operations.findIndex((candidate) =>
        candidate.element_id === visual.id
        && candidate.sync_speech_visual != null);
      return syncIndex <= sourceOperationIndex;
    });
    if (missingVisual) {
      throw new Error(
        "Speech clock changes must synchronize every linked talking-head visual in the same option after the source edit",
      );
    }

  }
}

export function inspectEditorAgentProject(projectId: string, maxElements = 500) {
  projectIdSchema.parse(projectId);
  const timeline = readTimeline(projectId);
  const elements = activeElements(timeline);
  if (elements.length > maxElements) {
    throw new Error(`Project has ${elements.length} active elements; inspect cap is ${maxElements}`);
  }
  return {
    project_id: projectId,
    revision: timelineRevision(projectId),
    metadata: readMetadata(projectId),
    elements,
    transitions: activeTransitions(timeline),
  };
}

/**
 * Apply an option's operations to a COPY of the timeline and return it. Pure —
 * nothing reaches disk. The preview endpoint and the real commit both go through
 * here, so what the player shows is what approval writes.
 */
/** The output canvas placement relations resolve on: the proposed aspect, else the project's. */
function relationCanvas(projectId: string, outputFormat?: EditorAgentOutputFormat) {
  let aspect = outputFormat?.aspect_ratio;
  try { aspect ??= readMetadata(projectId).output_aspect_ratio; } catch { /* a timeline outside a project folder */ }
  return getCompositionDimensions((aspect ?? "16:9") as TimelineAspectRatio);
}

export function deriveProposalTimeline(
  timeline: TimelineFile,
  operations: readonly EditorAgentOperation[],
  projectId = timeline.elements[0]?.project_id,
  preserveFields: PreservedFields = [],
): { timeline: TimelineFile; touched: string[]; laneOrderKeys?: string[]; mutedLaneKeys?: string[]; outputFormat?: EditorAgentOutputFormat } {
  return independentDerivation(deriveSharingRows(timeline, operations, projectId, preserveFields));
}

type ProposalDerivation = ReturnType<typeof deriveProposalTimeline>;
/** A derive whose result may share rows (and nested values) with its input when `sharesInput` is set. */
type SharedDerivation = { derived: ProposalDerivation; sharesInput: boolean };

/** The result as callers have always had it: nothing in it is shared with the derive's input. */
function independentDerivation({ derived, sharesInput }: SharedDerivation): ProposalDerivation {
  return sharesInput ? { ...derived, timeline: structuredClone(derived.timeline) } : derived;
}

/**
 * The same derive, except that rows the option leaves alone are the input's own objects (which may be
 * deep-frozen), not copies. Only for callers that never change the result or anything in it.
 */
function deriveSharingRows(
  timeline: TimelineFile,
  operations: readonly EditorAgentOperation[],
  projectId = timeline.elements[0]?.project_id,
  preserveFields: PreservedFields = [],
): SharedDerivation {
  return withFrameRate(projectRateOrCurrent(projectId), () => deriveProposalTimelineAtRate(timeline, operations, projectId as string, preserveFields));
}

/**
 * Operation fields whose derive steps change only the rows they name, plus rows the guards in
 * `deriveProposalTimelineAtRate` copy before a linked-row step. An option using any other field
 * (cuts, speed changes, caption replacement, speech sync…) changes rows across the timeline, so its
 * draft starts as a full copy, as every derive once did.
 */
const ROW_SCOPED_OPERATION_FIELDS = new Set([
  "type", "element_id", "rationale", "patch", "props", "clear_patch", "clear_props",
  "create_transition", "create_audio", "create_visual", "create_text", "create_shape", "remove_visual", "remove_text",
  "set_lane_order", "set_output_format", "set_preview_audio_source", "use_video_stabilization", "use_recast", "use_voice_enhancement",
]);
const CAPTION_FOLLOWED_TYPES = new Set(["vo_segment", "vo_full", "video_clip"]);

/** The clock fields `reconcileCaptionFollowers` compares (caption-followers.ts `CLOCK`), plus the row type. */
const CAPTION_FOLLOWED_CLOCK_FIELDS = ["type", "timeline_start", "duration", "trim_start", "trim_end", "playback_rate", "removed_at"] as const;

/**
 * Could `reconcileCaptionFollowers` move captions? A superset of its clock test: a clock field, or any
 * keyframe (it reads the speed keyframes). Swapping a clip's audio or source (voice enhancement) leaves
 * the clock alone, so its captions stay shared.
 */
function followedClockMayDiffer(before: TimelineElement, after: TimelineElement) {
  if (!CAPTION_FOLLOWED_TYPES.has(before.type) && !CAPTION_FOLLOWED_TYPES.has(after.type)) return false;
  const value = (input: unknown) => input !== null && typeof input === "object" ? JSON.stringify(input) : input;
  if (CAPTION_FOLLOWED_CLOCK_FIELDS.some((field) => value(before[field]) !== value(after[field]))) return true;
  return JSON.stringify(before.props?.keyframes ?? null) !== JSON.stringify(after.props?.keyframes ?? null);
}

function deriveProposalTimelineAtRate(
  timeline: TimelineFile,
  operations: readonly EditorAgentOperation[],
  projectId: string,
  preserveFields: PreservedFields,
): SharedDerivation {
  operations = operations.map(operation => {
    const compiled = compileProposalSubjectEntrance(compileProposalSpeedRamp(operation));
    if (operation.props?.playback_ramp_start_rate !== undefined) {
      const element = timeline.elements.find(element => element.id === operation.element_id);
      if (element?.props?.source_duration_seconds !== operation.props.playback_ramp_source_duration_seconds) throw new Error("Speed ramp source duration must match the current clip");
    }
    return compiled;
  });
  assertSpeechClockBundleIsAtomic(timeline, operations);
  // Copy-on-write: a row-scoped option starts from the input's rows and copies a row (deeply) before
  // anything in this derive changes it. The input is never changed either way.
  const sharesInput = operations.every((operation) => Object.entries(operation).every(([field, value]) => value === undefined || ROW_SCOPED_OPERATION_FIELDS.has(field)));
  const draft: TimelineFile = sharesInput
    ? { ...timeline, elements: [...timeline.elements], transitions: structuredClone(timeline.transitions) }
    : structuredClone(timeline) as TimelineFile;
  const ownedRows = new WeakSet<TimelineElement>();
  const ownAt = (index: number) => {
    const row = draft.elements[index]!;
    if (!sharesInput || ownedRows.has(row)) return row;
    const copy = structuredClone(row);
    ownedRows.add(copy);
    draft.elements[index] = copy;
    return copy;
  };
  const own = (row: TimelineElement | undefined) => {
    if (!sharesInput || !row || ownedRows.has(row)) return row;
    const index = draft.elements.indexOf(row);
    if (index < 0) throw new Error(`Derived row ${row.id} is not on the draft`);
    return ownAt(index);
  };
  const ownWhere = (pick: (row: TimelineElement) => boolean) => {
    if (!sharesInput) return;
    for (let index = 0; index < draft.elements.length; index += 1) if (pick(draft.elements[index]!)) ownAt(index);
  };
  const touched: string[] = [];
  let laneOrderKeys: string[] | undefined;
  let mutedLaneKeys: string[] | undefined;
  let outputFormat: EditorAgentOutputFormat | undefined;
  const seen = new Set<string>();
  const applyOperations = () => {
    for (const drafted of operations) {
      const operation = resolveSourceCutTarget(drafted, draft);
      if (seen.has(operation.element_id)) throw new Error(`Duplicate operation for element ${operation.element_id}`);
      seen.add(operation.element_id);
      validateOperationAgainstTimeline(operation, draft);
      if (operation.create_transition) {
        if (!projectId) throw new Error("Creating a transition requires the proposal project id");
        const spec = operation.create_transition;
        const validation = validateTransitionAdjacency(activeElements(draft), spec.from_element_id, spec.to_element_id, spec.duration_seconds);
        if (!validation.ok) throw new Error(validation.reason);
        const now = new Date().toISOString();
        draft.transitions.push({ ...spec, id: operation.element_id, project_id: projectId, duration_seconds: validation.durationSeconds, params: spec.params ?? {}, removed_at: null, removed_reason: null, created_at: now, updated_at: now });
        touched.push(spec.from_element_id, spec.to_element_id);
        continue;
      }
      if (operation.create_audio) {
        if (!projectId) throw new Error("Creating an audio clip requires the proposal project id");
        const created = createAudioElement(projectId, operation.element_id, { ...operation.create_audio, timeline_start: linkedAudioStart(operation.create_audio, draft) });
        draft.elements.push(created);
        touched.push(created.id);
        continue;
      }
      if (operation.create_visual) {
        if (!projectId) throw new Error("Creating a visual clip requires the proposal project id");
        const created = createVisualElement(projectId, operation.element_id, operation.create_visual, draft);
        const parentId = operation.create_visual.outline_parent_id;
        if (parentId) {
          const parent = activeElements(draft).find((item) => item.id === parentId);
          if (!parent || parent.type !== "video_clip" || parent.props?.has_alpha !== true || parent.props?.outline_parent_id) {
            throw new Error("Outline requires an active original transparent video");
          }
          if (parent.source_url !== created.source_url) throw new Error("Outline must reference its subject source");
          const receipt = catalogedCutoutReceipt(projectId, parent.source_url!);
          if (!receipt || receipt.scratchpad_treatment) throw new Error("Outline requires a cataloged unstyled cutout");
          const sourcePath = path.resolve(projectMediaDir(projectId), receipt.output_relative_path);
          if (!sourcePath.startsWith(path.resolve(projectMediaDir(projectId)) + path.sep)) throw new Error("Invalid cutout path");
          const hash = createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex");
          const mask = JSON.parse(fs.readFileSync(path.join(projectMediaDir(projectId), "outline-masks", hash, "manifest.json"), "utf8"));
          if (mask.source_sha256 !== hash || mask.frame_count < 1 || mask.timestamps?.length !== mask.frame_count
            || mask.source_url !== `/api/projects/${projectId}/media/outline-masks/${hash}`) throw new Error("Outline mask provenance mismatch");
          created.props = { ...created.props, outline_parent_id: parentId, outline_mask: mask, outline_source_url: parent.source_url,
            outline_width: operation.create_visual.outline_width ?? 8, outline_color: operation.create_visual.outline_color ?? "#ffffff" };
        }
        // A block-built clip remembers its block and role, so a later card can reopen the same settings.
        if (operation.block_ref) created.props = { ...created.props, block_ref: operation.block_ref };
        draft.elements.push(created);
        draft.elements = resolveOutlineLayers(draft.elements);
        touched.push(created.id);
        continue;
      }
      if (operation.create_shape) {
        if (!projectId) throw new Error("Creating a shape requires the proposal project id");
        const created = createShapeElement(projectId, operation.element_id, operation.create_shape);
        draft.elements.push(created);
        touched.push(created.id);
        continue;
      }
      if (operation.create_text) {
        if (!projectId) throw new Error("Creating graphic text requires the proposal project id");
        const created = createTextElement(projectId, operation.element_id, operation.create_text);
        draft.elements.push(created);
        touched.push(created.id);
        continue;
      }
      if (operation.remove_visual) {
        const element = own(findElement(draft, operation.element_id));
        if (!element) throw new Error(`Timeline element not found: ${operation.element_id}`);
        const now = new Date().toISOString();
        element.removed_at = now;
        element.removed_reason = `proposal_visual_remove:${operation.remove_visual.reason}`;
        element.updated_at = now;
        touched.push(element.id);
        continue;
      }
      if (operation.remove_text) {
        const element = own(findElement(draft, operation.element_id));
        if (!element) throw new Error(`Timeline element not found: ${operation.element_id}`);
        const now = new Date().toISOString();
        element.removed_at = now;
        element.removed_reason = `proposal_text_remove:${operation.remove_text.reason}`;
        element.updated_at = now;
        touched.push(element.id);
        continue;
      }
      if (operation.set_lane_order) {
        laneOrderKeys = [...operation.set_lane_order.lane_order_keys];
        if (operation.set_lane_order.muted_lane_keys) {
          if (projectId && JSON.stringify([...readMetadata(projectId).muted_lane_keys].sort()) !== JSON.stringify([...(operation.set_lane_order.expected_muted_lane_keys ?? [])].sort())) throw new Error("Lane mute state changed; refresh and propose again");
          mutedLaneKeys = [...new Set(operation.set_lane_order.muted_lane_keys)];
          if (mutedLaneKeys.some(key => !laneOrderKeys!.includes(key))) throw new Error("Muted lane must exist in the proposed lane order");
        }
        continue;
      }
      if (operation.set_output_format) {
        outputFormat = { ...operation.set_output_format };
        continue;
      }
      if (operation.source_range_cut) {
        if (!projectId) throw new Error("Source-range cuts require the proposal project id");
        for (const elementId of applySourceRangeCut(draft, projectId, operation)) {
          if (!touched.includes(elementId)) touched.push(elementId);
        }
        continue;
      }
      if (operation.speed_change) {
        for (const elementId of applySpeedChange(draft, operation)) {
          if (!touched.includes(elementId)) touched.push(elementId);
        }
        continue;
      }
      if (operation.source_range_restore) {
        for (const elementId of applySourceRangeRestore(draft, operation)) {
          if (!touched.includes(elementId)) touched.push(elementId);
        }
        continue;
      }
      if (operation.opening_sequence_edit) {
        if (!projectId) throw new Error("Opening sequence edits require the proposal project id");
        for (const elementId of applyOpeningSequenceEdit(draft, projectId, operation)) {
          if (!touched.includes(elementId)) touched.push(elementId);
        }
        continue;
      }
      if (operation.reattach_original_audio) {
        for (const elementId of applyReattachOriginalAudio(draft, operation)) {
          if (!touched.includes(elementId)) touched.push(elementId);
        }
        continue;
      }
      if (operation.sync_speech_visual) {
        for (const elementId of applySpeechVisualSync(draft, operation)) {
          if (!touched.includes(elementId)) touched.push(elementId);
        }
        continue;
      }
      if (operation.replace_captions) {
        if (!projectId) throw new Error("Replacing captions requires the proposal project id");
        for (const elementId of applyCaptionReplacement(draft, projectId, operation)) {
          if (!touched.includes(elementId)) touched.push(elementId);
        }
        if (operation.replace_captions.lane_order_keys) {
          laneOrderKeys = [...operation.replace_captions.lane_order_keys];
        }
        continue;
      }
      const element = own(findElement(draft, operation.element_id));
      validateOperationAgainstElement(operation, element);
      const stabilization = operation.use_video_stabilization;
      const voiceEnhancement = operation.use_voice_enhancement;
      const currentProps = { ...((element?.props ?? {}) as Record<string, unknown>) };
      const previewAudioProps = operation.set_preview_audio_source
        ? {
            preview_audio_source_url: operation.set_preview_audio_source.source_url,
            preview_audio_baked_gain: operation.set_preview_audio_source.baked_gain,
          }
        : {};
      const muteEmbeddedAudio = stabilization != null && operation.patch?.volume === 0;
      const stabilizationProps = stabilization
        ? {
            preview_source_url: stabilization.processed_preview_source_url,
            preview_audio_source_url: stabilization.processed_preview_source_url,
            preview_audio_baked_gain: 1,
            render_authority_source_url: stabilization.processed_source_url,
            render_authority_sha256: stabilization.render_authority_sha256,
            preview_proxy_sha256: stabilization.preview_proxy_sha256,
            source_sha256: stabilization.source_sha256,
            preview_sha256: stabilization.preview_proxy_sha256,
            video_stabilization_original_source_url: stabilization.original_source_url,
            video_stabilization_original_preview_source_url: stabilization.original_preview_source_url,
            video_stabilization_original_preview_audio_source_url:
              stabilization.original_preview_audio_source_url,
            video_stabilization_original_render_authority_source_url:
              stabilization.original_render_authority_source_url,
            video_stabilization: {
              schema_version: 1,
              enabled: true,
              mode: stabilization.mode,
              strength_percent: stabilization.strength_percent,
              shakiness: stabilization.shakiness,
              smoothing_frames: stabilization.smoothing_frames,
              auto_zoom: stabilization.auto_zoom,
              recipe: stabilization.recipe,
              processed_source_url: stabilization.processed_source_url,
              processed_preview_source_url: stabilization.processed_preview_source_url,
              created_at: new Date().toISOString(),
            },
            ...(muteEmbeddedAudio
              ? {
                  detached_audio_original_volume:
                    element && element.volume > 0 ? element.volume : 1,
                  detached_audio_original_volume_envelope:
                    Array.isArray(currentProps.volume_envelope)
                      ? currentProps.volume_envelope
                      : [
                          { time_seconds: 0, volume: 1 },
                          { time_seconds: element?.duration ?? 0, volume: 1 },
                        ],
                  volume_envelope: [
                    { time_seconds: 0, volume: 0 },
                    { time_seconds: element?.duration ?? 0, volume: 0 },
                  ],
                }
              : {}),
          }
        : {};
      const voiceEnhancementProps = voiceEnhancement
        ? {
            preview_audio_source_url: voiceEnhancement.processed_preview_audio_source_url,
            preview_audio_baked_gain: 1,
            render_authority_source_url: voiceEnhancement.processed_source_url,
            render_authority_sha256: voiceEnhancement.processed_sha256,
            source_sha256: voiceEnhancement.processed_sha256,
            voice_enhancement_original_source_url: voiceEnhancement.original_source_url,
            voice_enhancement_original_preview_audio_source_url:
              voiceEnhancement.original_preview_audio_source_url,
            voice_enhancement_original_render_authority_source_url:
              voiceEnhancement.original_render_authority_source_url,
            voice_enhancement: {
              schema_version: 1,
              enabled: true,
              strength_percent: voiceEnhancement.strength_percent,
              attenuation_limit_db: voiceEnhancement.attenuation_limit_db,
              recipe: voiceEnhancement.recipe,
              original_source_url: voiceEnhancement.original_source_url,
              processed_source_url: voiceEnhancement.processed_source_url,
              processed_preview_audio_source_url: voiceEnhancement.processed_preview_audio_source_url,
              normalization: {
                target_lufs: voiceEnhancement.normalization_target_lufs,
                true_peak_dbtp: voiceEnhancement.normalization_true_peak_dbtp,
                recipe: voiceEnhancement.normalization_recipe,
              },
              created_at: new Date().toISOString(),
            },
          }
        : {};
      const operationProps = operation.props as Record<string, unknown> | undefined;
      const directOperationProps = Object.fromEntries(
        Object.entries(operationProps ?? {}).filter(([field]) =>
          field !== "playback_speed_steps" && !field.startsWith("playback_ramp_") && !field.startsWith("mask_window_") && field !== "transition_keyframes" && field !== "shape_morph" && field !== "semanticLayout" && field !== "crowdLayout" && field !== "media_scale_keyframes" && field !== "media_offset_y_keyframes" && field !== "mask_inset_keyframes"
          && !AGENT_COLOR_GRADE_FIELDS.has(field) && !AGENT_CHROMA_KEY_FIELDS.has(field)),
      );
      const semanticLayoutProps = operation.props?.semanticLayout
        ? resolveSemanticVisualLayout(operation.props.semanticLayout)
        : {};
      const crowdLayoutProps = operation.props?.crowdLayout
        ? resolveSemanticCrowdLayout(operation.props.crowdLayout)
        : {};
      let mergedProps: Record<string, unknown> = {
        ...currentProps,
        ...stabilizationProps,
        ...voiceEnhancementProps,
        ...previewAudioProps,
        ...directOperationProps,
        ...semanticLayoutProps,
        ...crowdLayoutProps,
        ...Object.fromEntries((operation.clear_props ?? []).map((field) => [field, null])),
      };
      // Resetting a grade field also clears its animation, as in the Inspector.
      const requestedClears = (operation.clear_props ?? []) as string[];
      const clearedGradeFields = requestedClears.filter(field => (COLOR_GRADE_KEYFRAME_FIELDS as readonly string[]).includes(field) || (LEGACY_COLOR_GRADE_FIELDS as readonly string[]).includes(field));
      // On an upgraded clip, v1's tone adjustments live in the custom tone curves they were fitted into.
      if (!isLegacyColorGrade(mergedProps) && requestedClears.some(field => (LEGACY_COLOR_GRADE_FIELDS as readonly string[]).includes(field))) {
        clearedGradeFields.push("grade_curve_y", "grade_curve_r", "grade_curve_g", "grade_curve_b");
      }
      if (clearedGradeFields.length) {
        const keyframes = { ...((mergedProps.keyframes ?? {}) as Record<string, unknown>) };
        for (const field of clearedGradeFields) { delete mergedProps[field]; delete keyframes[field]; }
        if (Object.keys(keyframes).length) mergedProps.keyframes = keyframes;
        else delete mergedProps.keyframes;
      }
      if (operation.props?.playback_speed_steps) {
        const points = operation.props.playback_speed_steps.map(p => ({...p, t: p.source_t, ease: "hold" as const}));
        const projected = {...element, ...operation.patch, props: {...mergedProps, keyframes: {playback_rate: points}}};
        mergedProps.keyframes = {
          ...((mergedProps.keyframes ?? {}) as Record<string, unknown>),
          playback_rate: points.map(p => ({...p, t: sourceTimeToTimelineTime(projected, p.source_t)})),
        };
      }
      if (operation.props?.media_scale_keyframes) {
        // Merge onto what this operation already set (speed steps above), not the stored tracks.
        mergedProps.keyframes = {
          ...((mergedProps.keyframes ?? {}) as Record<string, unknown>),
          media_scale: operation.props.media_scale_keyframes,
        };
      }
      if (operation.props?.media_offset_y_keyframes) {
        mergedProps.keyframes = {
          ...((mergedProps.keyframes ?? {}) as Record<string, unknown>),
          media_offset_y: operation.props.media_offset_y_keyframes,
        };
      }
      const pictureWindow = maskWindowValues(operation.props);
      if (operation.props?.mask_inset_keyframes || pictureWindow) {
        mergedProps.keyframes = {
          ...((mergedProps.keyframes ?? {}) as Record<string, unknown>),
          mask_inset: pictureWindow ? maskWindowPoints(pictureWindow, operation.patch?.duration ?? element.duration) : operation.props!.mask_inset_keyframes,
        };
      }
      if (operation.props?.transition_keyframes) {
        mergedProps.keyframes = { ...((mergedProps.keyframes ?? {}) as Record<string, unknown>), ...operation.props.transition_keyframes };
      }
      if (operation.props?.shape_morph) mergedProps = { ...mergedProps, ...shapeMorphProps(mergedProps, operation.props.shape_morph) };
      if (operation.props?.gravity_drop_start_seconds !== undefined || operation.props?.gravity_drop_seconds !== undefined) {
        mergedProps = deriveGravityDrop(mergedProps,
          Number(mergedProps.gravity_drop_start_seconds), Number(mergedProps.gravity_drop_seconds));
      }
      const chromaColor = operationProps?.[CHROMA_KEY_COLOR_FIELD];
      if (typeof chromaColor === "string") {
        mergedProps = commitChromaKeyColor(mergedProps, chromaColor);
      }
      for (const field of CHROMA_KEY_AMOUNT_FIELDS) {
        const value = operationProps?.[field];
        if (typeof value === "number") {
          mergedProps = commitChromaKeyAmountAtTime(mergedProps, 0, field, value);
        }
      }
      for (const field of COLOR_GRADE_FIELDS) {
        const value = operationProps?.[field];
        if (typeof value === "number") {
          mergedProps = commitColorGradeFieldAtTime(mergedProps, 0, field as ColorGradeField, value);
        }
      }
      for (const field of COLOR_GRADE_ADVANCED_FIELDS) {
        const value = operationProps?.[field];
        if (Array.isArray(value)) mergedProps = commitAdvancedColorGradeFieldAtTime(mergedProps, 0, field, value);
      }
      const requestedVolume = operation.patch?.volume;
      if (element && requestedVolume !== undefined && AUDIO_CAPABLE_TYPES.has(element.type)) {
        const duration = operation.patch?.duration ?? element.duration;
        const currentEnvelope = readVolumeEnvelopePoints(element, element.duration);
        const nextEnvelope = requestedVolume === 0
          ? [
              { time_seconds: 0, volume: 0 },
              { time_seconds: duration, volume: 0 },
            ]
          : retargetVolumeEnvelope(currentEnvelope, requestedVolume);
        // Synchronize against the already-merged proposal props so a volume
        // repair cannot silently revert another field in the same row (for
        // example the lightweight preview-audio authority).
        const synchronized = writeVolumeEnvelopePatch({ ...element, props: mergedProps }, nextEnvelope, duration);
        mergedProps = {
          ...mergedProps,
          ...synchronized.props,
        };
      }
      // Grade/key normalizers omit neutral scalar values. The patch layer merges
      // props, so remove those old values from this derived copy before merging;
      // otherwise tuning a field back to neutral resurrects its prior value.
      for (const field of [...COLOR_GRADE_FIELDS, ...COLOR_GRADE_ADVANCED_FIELDS, ...CHROMA_KEY_AMOUNT_FIELDS]) {
        if ((typeof operationProps?.[field] === "number" || Array.isArray(operationProps?.[field])) && !Object.hasOwn(mergedProps, field)) {
          delete element.props?.[field];
        }
      }
      applyElementPatch(element, {
        ...(stabilization ? { source_url: stabilization.processed_source_url } : {}),
        ...(voiceEnhancement ? { source_url: voiceEnhancement.processed_source_url, volume: 1 } : {}),
        ...(operation.patch ?? {}),
        ...Object.fromEntries((operation.clear_patch ?? []).map((field) => [field, null])),
        ...(stabilization
          || voiceEnhancement
          || operation.set_preview_audio_source
          || operation.props
          || operation.clear_props?.length
          || requestedVolume !== undefined
          ? { props: mergedProps }
          : {}),
      });
      // A placed motion graphic only takes a render recorded for it in this project.
      if (element.type === "video_clip" && typeof operation.patch?.source_url === "string" && !isRecordedMotionRender(projectId, operation.patch.source_url)) {
        throw new Error("The new motion graphic render is not recorded in this project; prepare it with motion_graphic_prepare first");
      }
      // A recast keeps the clip's timeline timing; its in-point moves onto the recast's own clock.
      if (operation.use_recast) applyRecast(projectId, element, operation.use_recast);
      // A synthesized sound swapped for another plays the whole new file.
      if (element.type === "sound_effect" && typeof operation.patch?.source_url === "string") {
        const length = synthSoundDurationForSource(projectId, operation.patch.source_url);
        if (length == null) throw new Error("The new sound has not been rendered in this project; prepare it with sound_synth_prepare first");
        element.duration = length; element.trim_start = 0; element.trim_end = 0;
        element.props = { ...element.props, source_duration_seconds: length, source_start_seconds: 0, source_end_seconds: length };
      }
      touched.push(element.id);
    }
  };
  // A row-scoped option only appends rows or swaps a row for its own copy, so one id index serves its
  // lookups (validation's included); cuts and the like splice rows and keep the linear scan.
  if (sharesInput) withElementIdIndex(draft, applyOperations); else applyOperations();
  draft.elements = resolveLetterFallFollowers(draft.elements, true);
  // The linked-row steps below change rows in place: copy every row each one could change first.
  ownWhere((row) => row.props?.[PLACE_PROP] != null);
  // Text and shapes placed by relation take their coordinates from their anchors, as tuned here.
  for (const id of reconcilePlacementRelations(withPreparedPictureSize(projectId, timeline.elements), withPreparedPictureSize(projectId, draft.elements), relationCanvas(projectId, outputFormat))) {
    if (!touched.includes(id)) touched.push(id);
  }
  if (sharesInput) {
    const inputRows = new Map(timeline.elements.map((row) => [row.id, row]));
    if (draft.elements.some((row) => { const input = inputRows.get(row.id); return input !== undefined && input !== row && followedClockMayDiffer(input, row); })) ownWhere(() => true);
  }
  for (const id of reconcileCaptionFollowers(timeline.elements, draft.elements, projectId)) {
    if (!touched.includes(id)) touched.push(id);
  }
  // A motion graphic re-rendered by a timing knob takes the render's length and cue times (and pushes
  // what follows when it was inserted), before linked sounds re-anchor to those cues.
  if (sharesInput) {
    for (const id of touched) {
      const index = draft.elements.findIndex((row) => row.id === id && row.removed_at == null && row.type === "video_clip");
      if (index >= 0 && ownAt(index).props?.ripple_after === true) ownWhere(() => true);
    }
  }
  for (const id of refreshMotionTiming(draft.elements, [...touched], (url) => motionTimingForSource(projectId, url), new Set(timeline.elements.map((element) => element.id)))) {
    if (!touched.includes(id)) touched.push(id);
  }
  // Linked sounds take their start from their picture, so a moved or retimed picture carries them.
  const AUDIO_TYPES = new Set(["vo_segment", "vo_full", "music", "sound_effect"]);
  ownWhere((row) => row.props?.[SOUND_LINK_PROP] != null);
  for (const id of reconcileSoundLinks(timeline.elements, draft.elements)) {
    if (!touched.includes(id)) touched.push(id);
    // A sound carried by its picture must still not overlap other audio on its lane.
    const sound = activeElements(draft).find((element) => element.id === id)!;
    if (activeElements(draft).some((other) => other.id !== id && AUDIO_TYPES.has(other.type) && other.lane_key === sound.lane_key
      && other.timeline_start < sound.timeline_start + sound.duration - 1e-6 && other.timeline_start + other.duration > sound.timeline_start + 1e-6)) {
      throw new Error(`Audio overlap on ${sound.lane_key}: a linked sound moved with its picture onto other audio. Move it to a separate lane.`);
    }
  }
  syncTransitionsForElements(draft, touched);
  // Final positions are known now, so a MOVED clip that landed on a neighbour
  // is caught here — creation-time checks only see proposed coordinates.
  assertNoVisualOverlap(draft, touched);
  if (laneOrderKeys) {
    const activeLaneKeys = new Set(activeElements(draft).map((element) => element.lane_key));
    for (const laneKey of activeLaneKeys) {
      if (!laneOrderKeys.includes(laneKey)) {
        throw new Error(`Proposed lane order is missing active lane: ${laneKey}`);
      }
    }
  }
  const resolved = { ...draft, elements: resolveOutlineLayers(draft.elements) };
  for (const element of activeElements(resolved).filter(e => touched.includes(e.id) && e.props?.surface_track)) {
    const track=validateSurfaceTrackSource(projectId,element.props!.surface_track);
    const parent=findElement(resolved,track.parentId);
    if(!parent||parent.removed_at||parent.source_url!==track.sourceUrl)throw Error("Surface attachment parent is missing or changed");
  }
  assertSubjectWindowBindings(projectId, resolved, touched);
  assertPreservedFields(timeline, resolved, preserveFields);
  // A frame-rate change moves every picture clip onto the new grid, in preview and approval alike.
  const retimed = outputFormat?.frame_rate ? { ...resolved, elements: requantizeTimelineForFrameRate(resolved.elements, outputFormat.frame_rate) } : resolved;
  // Approval writes one caption per shown word; the preview must show the same elements.
  if (retimed.elements.some((element) => element.type === "caption_text" && element.props?.timingMode === "single_word")) {
    retimed.elements = [...retimed.elements];
    // Built once: per caption it would stringify the whole timeline again, minutes on a long talk.
    // The input is never changed, so a row still holding its input object is unchanged.
    const changed = changedFromUnmutated(timeline.elements), touchedIds = new Set(touched);
    splitSingleWordCaptions(retimed.elements, { fps: projectRateOrCurrent(projectId), only: (element) => touchedIds.has(element.id) || changed(element) });
  }
  return {
    sharesInput,
    derived: {
      timeline: retimed,
      touched,
      ...(laneOrderKeys ? { laneOrderKeys } : {}),
      ...(mutedLaneKeys ? { mutedLaneKeys } : {}),
      ...(outputFormat ? { outputFormat } : {}),
    },
  };
}

/**
 * One option's derived rows for review, onto a base the caller holds. The result shares every row the
 * option leaves alone with `base`: read it, never change it.
 */
export function readOnlyProposalPreview(proposal: EditorAgentProposal, optionId: string | undefined, base: TimelineFile) {
  const option = proposalOption(proposal, optionId);
  assertHoldControlSources(option, base.elements);
  const { derived } = deriveSharingRows(base, option.operations, proposal.project_id, option.preserve_fields);
  return {
    option,
    timeline: derived.timeline,
    touched: derived.touched,
    ...(derived.laneOrderKeys ? { laneOrderKeys: derived.laneOrderKeys } : {}),
    ...(derived.mutedLaneKeys ? { mutedLaneKeys: derived.mutedLaneKeys } : {}),
    ...(derived.outputFormat ? { outputFormat: derived.outputFormat } : {}),
  };
}

/**
 * Draft timeline for one option, read from disk. Used by the preview route; writes nothing.
 * Like `readOnlyProposalPreview`, the result shares the rows the option leaves alone with the base: with
 * a held `base`, read the result and never change it or the base while it is in use (a timeline read
 * here is private to the call, so the result is the caller's).
 */
export function previewEditorAgentProposal(
  proposal: EditorAgentProposal,
  optionId?: string,
  /** A base timeline the caller already holds (the dial sweep builds dozens of previews of one card). */
  base?: TimelineFile,
): {
  option: EditorAgentOption;
  timeline: TimelineFile;
  touched: string[];
  stale: boolean;
  laneOrderKeys?: string[]; mutedLaneKeys?: string[];
  outputFormat?: EditorAgentOutputFormat;
} {
  const option = proposalOption(proposal, optionId);
  const stale = base ? false : timelineRevision(proposal.project_id) !== proposal.expected_revision;
  // The derive copies what it changes, so a held base is never changed.
  const { timeline, touched, laneOrderKeys, mutedLaneKeys, outputFormat } = readOnlyProposalPreview(proposal, option.id, base ?? readTimeline(proposal.project_id));
  return {
    option, timeline, touched, stale,
    ...(laneOrderKeys ? { laneOrderKeys } : {}),
    ...(mutedLaneKeys ? { mutedLaneKeys } : {}),
    ...(outputFormat ? { outputFormat } : {}),
  };
}

/**
 * Compose independently reviewable proposal options onto one in-memory
 * timeline. This powers batch review: the human sees the edits together while
 * every source proposal remains separately selectable and auditable.
 */
export function mergeBatchLaneOrderKeys(existing: readonly string[], proposed: readonly string[]) {
  const proposedSet = new Set(proposed);
  const before = new Map<string, string[]>();
  const tail: string[] = [];
  for (let index = 0; index < existing.length; index += 1) {
    const laneKey = existing[index]!;
    if (proposedSet.has(laneKey)) continue;
    const followingShared = existing.slice(index + 1).find((candidate) => proposedSet.has(candidate));
    if (followingShared) {
      const bucket = before.get(followingShared) ?? [];
      bucket.push(laneKey);
      before.set(followingShared, bucket);
    } else {
      tail.push(laneKey);
    }
  }
  return proposed.flatMap((laneKey) => [...(before.get(laneKey) ?? []), laneKey]).concat(tail);
}

function mergeBatchLaneOrderOperations(
  operations: readonly EditorAgentOperation[],
  existingLaneOrderKeys: readonly string[],
  timeline: TimelineFile,
): EditorAgentOperation[] {
  const activeLaneKeys = new Set(activeElements(timeline).map((element) => element.lane_key));
  const activeExistingOrder = existingLaneOrderKeys.filter((laneKey) => activeLaneKeys.has(laneKey));
  return operations.map((operation) => {
    if (operation.set_lane_order) return {
        ...operation,
        set_lane_order: {
          ...operation.set_lane_order,
          lane_order_keys: mergeBatchLaneOrderKeys(
            activeExistingOrder,
            operation.set_lane_order.lane_order_keys,
          ),
        },
      };
    if (operation.replace_captions?.lane_order_keys) return {
      ...operation,
      replace_captions: {
        ...operation.replace_captions,
        lane_order_keys: mergeBatchLaneOrderKeys(
          activeExistingOrder,
          operation.replace_captions.lane_order_keys,
        ),
      },
    };
    return operation;
  });
}

/**
 * Validation derives the parsed option, whose operations carry top-level keys set to `undefined` where the
 * stored option omits them (`props` after effect normalization). Derivation reads operation fields by name
 * and never enumerates an operation's keys, so those are the same input; nested values must match exactly
 * (an undefined `patch` field is spread onto the element).
 */
function sameOperationsForDerive(left: readonly EditorAgentOperation[], right: readonly EditorAgentOperation[]) {
  const defined = (operation: EditorAgentOperation) => Object.fromEntries(Object.entries(operation).filter(([, value]) => value !== undefined));
  return left.length === right.length && left.every((operation, index) => isDeepStrictEqual(defined(operation), defined(right[index]!)));
}

/**
 * `liveTimeline`: the project's current timeline when the caller has already read it (never mutated).
 * `liveDerivations[i]`: option i as validation already derived it onto `liveTimeline`. The first option
 * derives onto that same timeline, so it is reused when its operations and protected fields are the same.
 */
export function previewEditorAgentProposalBatch(
  projectId: string,
  options: readonly EditorAgentOption[],
  liveTimeline?: TimelineFile,
  liveDerivations?: readonly (LiveOptionDerivation | undefined)[],
): {
  timeline: TimelineFile;
  touched: string[];
  laneOrderKeys?: string[]; mutedLaneKeys?: string[];
  outputFormat?: EditorAgentOutputFormat;
} {
  const original = liveTimeline ?? readTimeline(projectId);
  let timeline = original;
  const touched = new Set<string>();
  let compositeLaneOrderKeys = readMetadata(projectId).lane_order_keys;
  let laneOrderKeys: string[] | undefined;
  let mutedLaneKeys: string[] | undefined;
  let outputFormat: EditorAgentOutputFormat | undefined;
  for (const [index, option] of options.entries()) {
    assertHoldControlSources(option, timeline.elements);
    const operations = mergeBatchLaneOrderOperations(option.operations, compositeLaneOrderKeys, timeline);
    const prior = liveDerivations?.[index];
    const derived = prior && liveTimeline && timeline === liveTimeline && prior.base === liveTimeline
      && sameOperationsForDerive(operations, prior.option.operations)
      && isDeepStrictEqual(option.preserve_fields, prior.option.preserve_fields)
      ? prior.derived
      // Read-only like the single preview: later options derive onto this result without changing it.
      : deriveSharingRows(timeline, operations, projectId, option.preserve_fields).derived;
    timeline = derived.timeline;
    for (const elementId of derived.touched) touched.add(elementId);
    if (derived.laneOrderKeys) {
      laneOrderKeys = derived.laneOrderKeys;
      compositeLaneOrderKeys = derived.laneOrderKeys;
    }
    if (derived.mutedLaneKeys) mutedLaneKeys = derived.mutedLaneKeys;
    if (derived.outputFormat) outputFormat = { ...outputFormat, ...derived.outputFormat };
  }
  for (const option of options) assertPreservedFields(original, timeline, option.preserve_fields ?? []);
  return {
    timeline,
    touched: [...touched],
    ...(laneOrderKeys ? { laneOrderKeys } : {}),
    ...(mutedLaneKeys ? { mutedLaneKeys } : {}),
    ...(outputFormat ? { outputFormat } : {}),
  };
}

/** Apply several already-validated options in one timeline write and one Undo snapshot. */
export async function applyEditorAgentProposalBatch(
  projectId: string,
  expectedRevision: string,
  options: readonly EditorAgentOption[],
  historyExtras?: {
    proposalIds?: string[];
    feedbackIds?: string[];
    appliedProposalIds?: string[];
    beforeFinalSnapshot?: (context: {
      beforeRevision: string;
      afterRevision: string;
      touchedElementIds: string[];
    }) => void | Promise<void>;
  },
) {
  if (options.length < 1) throw new Error("Select at least one proposal option");
  const feedbackIds = assertFeedbackReferences(projectId, historyExtras?.feedbackIds ?? []);
  return withFeedbackAttribution({ responds_to_feedback_ids: feedbackIds, proposal_ids: historyExtras?.appliedProposalIds }, () => withProjectLock(projectId, async () => {
    const beforeRevision = timelineRevision(projectId);
    if (beforeRevision !== expectedRevision) {
      throw Object.assign(new Error("Timeline revision changed after batch review; refresh and try again"), { status: 409 });
    }
    const beforeSnapshot = captureProjectHistorySnapshot(projectId, "editor_agent_batch_before", historyExtras);
    const original = readTimeline(projectId);
    let timeline = original;
    const touched = new Set<string>();
    let compositeLaneOrderKeys = readMetadata(projectId).lane_order_keys;
    let laneOrderKeys: string[] | undefined;
  let mutedLaneKeys: string[] | undefined;
    let outputFormat: EditorAgentOutputFormat | undefined;
    for (const option of options) {
      const operations = mergeBatchLaneOrderOperations(option.operations, compositeLaneOrderKeys, timeline);
      const derived = deriveProposalTimeline(timeline, operations, projectId, option.preserve_fields);
      timeline = derived.timeline;
      for (const elementId of derived.touched) touched.add(elementId);
      if (derived.laneOrderKeys) {
        laneOrderKeys = derived.laneOrderKeys;
        compositeLaneOrderKeys = derived.laneOrderKeys;
      }
      if (derived.mutedLaneKeys) mutedLaneKeys = derived.mutedLaneKeys;
    if (derived.outputFormat) outputFormat = { ...outputFormat, ...derived.outputFormat };
    }
    for (const option of options) assertPreservedFields(original, timeline, option.preserve_fields ?? []);
    writeTimeline(projectId, timeline, "editor_agent_batch");
    if (mutedLaneKeys) { const metadata = readMetadata(projectId); metadata.muted_lane_keys = mutedLaneKeys; writeMetadata(projectId, metadata, "editor_agent_batch_mutes"); }
    if (laneOrderKeys) {
      const metadata = readMetadata(projectId);
      metadata.lane_order_keys = laneOrderKeys;
      writeMetadata(projectId, metadata, "editor_agent_batch_lane_order");
    }
    if (outputFormat) {
      const metadata = readMetadata(projectId);
      if (outputFormat.aspect_ratio) metadata.output_aspect_ratio = outputFormat.aspect_ratio;
      if (outputFormat.frame_rate) metadata.frame_rate = outputFormat.frame_rate;
      if (outputFormat.delivery_target) metadata.delivery_target = outputFormat.delivery_target;
      writeMetadata(projectId, metadata, "editor_agent_batch_output_format");
    }
    const afterRevision = timelineRevision(projectId);
    await historyExtras?.beforeFinalSnapshot?.({
      beforeRevision,
      afterRevision,
      touchedElementIds: [...touched],
    });
    const afterSnapshot = captureProjectHistorySnapshot(projectId, "editor_agent_batch_applied", historyExtras);
    return {
      applied: true as const,
      project_id: projectId,
      before_revision: beforeRevision,
      after_revision: afterRevision,
      touched_element_ids: [...touched],
      history: { before: beforeSnapshot, after: afterSnapshot },
    };
  }));
}

export async function applyEditorAgentProposal(
  raw: unknown,
  runtimeMaxMutations: number,
  optionId?: string,
  historyExtras?: {
    proposalIds?: string[];
    feedbackIds?: string[];
    appliedProposalIds?: string[];
    beforeFinalSnapshot?: (context: {
      beforeRevision: string;
      afterRevision: string;
      touchedElementIds: string[];
    }) => void | Promise<void>;
  },
) {
  const proposal = validateEditorAgentProposal(raw, runtimeMaxMutations);
  if (proposal.decision !== "propose") throw new Error(`Proposal decision is ${proposal.decision}; nothing may be applied`);
  const option = proposalOption(proposal, optionId);

  const feedbackIds = assertFeedbackReferences(proposal.project_id, proposal.responds_to_feedback_ids ?? []);
  return withFeedbackAttribution({ responds_to_feedback_ids: feedbackIds, proposal_ids: historyExtras?.appliedProposalIds }, () => withProjectLock(proposal.project_id, async () => {
    const beforeRevision = timelineRevision(proposal.project_id);
    if (beforeRevision !== proposal.expected_revision) {
      throw Object.assign(new Error("Timeline revision changed after proposal; inspect and propose again"), { status: 409 });
    }
    // Bracket the writes with explicit snapshots so the editor can surface the
    // whole approval (timeline + any metadata writes) as ONE visible Undo entry.
    const beforeSnapshot = captureProjectHistorySnapshot(
      proposal.project_id,
      `editor_agent_${proposal.mode}_before`,
      historyExtras,
    );
    assertHoldControlSources(option, readTimeline(proposal.project_id).elements);
    const derived = deriveProposalTimeline(readTimeline(proposal.project_id), option.operations, proposal.project_id, option.preserve_fields);
    writeTimeline(proposal.project_id, derived.timeline, `editor_agent_${proposal.mode}`);
    if (derived.mutedLaneKeys) { const metadata = readMetadata(proposal.project_id); metadata.muted_lane_keys = derived.mutedLaneKeys; writeMetadata(proposal.project_id, metadata, `editor_agent_${proposal.mode}_mutes`); }
    if (derived.laneOrderKeys) {
      const metadata = readMetadata(proposal.project_id);
      metadata.lane_order_keys = derived.laneOrderKeys;
      writeMetadata(proposal.project_id, metadata, `editor_agent_${proposal.mode}_lane_order`);
    }
    if (derived.outputFormat) {
      const metadata = readMetadata(proposal.project_id);
      if (derived.outputFormat.aspect_ratio) metadata.output_aspect_ratio = derived.outputFormat.aspect_ratio;
      if (derived.outputFormat.frame_rate) metadata.frame_rate = derived.outputFormat.frame_rate;
      if (derived.outputFormat.delivery_target) metadata.delivery_target = derived.outputFormat.delivery_target;
      writeMetadata(proposal.project_id, metadata, `editor_agent_${proposal.mode}_output_format`);
    }
    const afterRevision = timelineRevision(proposal.project_id);
    await historyExtras?.beforeFinalSnapshot?.({
      beforeRevision,
      afterRevision,
      touchedElementIds: derived.touched,
    });
    const afterSnapshot = captureProjectHistorySnapshot(
      proposal.project_id,
      `editor_agent_${proposal.mode}_applied`,
      historyExtras,
    );
    return {
      applied: true as const,
      project_id: proposal.project_id,
      mode: proposal.mode,
      option_id: option.id,
      option_label: option.label,
      before_revision: beforeRevision,
      after_revision: afterRevision,
      mutation_count: option.requested_mutations,
      operation_count: derived.touched.length,
      touched_element_ids: derived.touched,
      history: { before: beforeSnapshot, after: afterSnapshot },
    };
  }));
}
