import { currentFrameRate } from "../timeline/frame-rate-scope";
import { HANDWRITING_WEIGHT } from "../timeline/handwriting-weight";
import { TRANSITION_CONTROLS, proposedFieldValue, availableTransitionFieldValue } from "../timeline/transition-controls";
import { EFFECT_CONTROLS, type EffectProposalNumber } from "../timeline/effect-controls";
import { FADER_MIN_DB, FADER_MAX_DB, gainToFaderDb, faderDbToGain } from "../timeline/audio-gain";

export type ProposalControlReference = {
  operation_index: number;
  target: "create_transition" | "create_audio" | "create_visual" | "create_text" | "opening_sequence_edit" | "replace_captions" | "patch" | "props" | "timing_control";
  field: string;
  linked_operation_indices?: number[];
};

export function proposalAvailableFieldValue(target: string, values: Record<string, unknown> | undefined, field: string) {
  if (target === "create_transition") return availableTransitionFieldValue(values, field);
  return proposedFieldValue(values, field) ?? (DERIVED_TARGETS.has(target) ? derivedFieldValue(values, field) : undefined);
}

/*
 * Derived dials: one number tuning part of a structured value the editor stores whole. Each
 * crop edge reads and writes one entry of `mask_inset` ([top, right, bottom, left]); the zoom
 * amount is the peak of a keyframed `media_scale` track, and moving it rescales every point's
 * distance from fitted (1), so a 1 → 1.1 punch-in tuned to 1.2 becomes 1 → 1.2 with the same
 * timing and easing. Approval writes the structured value, never these names.
 */
const DERIVED_TARGETS = new Set(["props", "create_visual"]);
const CROP_EDGES = ["mask_inset_top", "mask_inset_right", "mask_inset_bottom", "mask_inset_left"] as const;
const ZOOM_PEAK = "media_scale_peak";
/** What a derived dial reads when the structured value is absent, for before/after display. */
export const DERIVED_FIELD_IDENTITY: Record<string, number> = { ...Object.fromEntries(CROP_EDGES.map(field => [field, 0])), [ZOOM_PEAK]: 1 };

// A zoom is animated either by the dedicated media_scale_keyframes prop or a media_scale transition track.
function scaleTrackKey(values: Record<string, unknown> | undefined): "media_scale_keyframes" | "transition_keyframes" | undefined {
  const valid = (track: unknown) => Array.isArray(track) && track.length > 0 && track.every(point => typeof point?.v === "number");
  if (valid(values?.media_scale_keyframes)) return "media_scale_keyframes";
  return valid((values?.transition_keyframes as Record<string, unknown> | undefined)?.media_scale) ? "transition_keyframes" : undefined;
}
function scaleTrack(values: Record<string, unknown> | undefined) {
  const key = scaleTrackKey(values);
  return (key === "media_scale_keyframes" ? values!.media_scale_keyframes : key ? (values!.transition_keyframes as Record<string, unknown>).media_scale : undefined) as {t: number; v: number}[] | undefined;
}
/** The point farthest from fitted size; its value is the punch-in (or pull-out) amount. */
function trackPeak(track: {v: number}[]) {
  return track.reduce((peak, point) => Math.abs(point.v - 1) > Math.abs(peak - 1) ? point.v : peak, 1);
}

export function derivedFieldValue(values: Record<string, unknown> | undefined, field: string): number | undefined {
  const edge = CROP_EDGES.indexOf(field as typeof CROP_EDGES[number]);
  if (edge >= 0) {
    const inset = values?.mask_inset;
    return Array.isArray(inset) && inset.length === 4 && typeof inset[edge] === "number" ? inset[edge] : undefined;
  }
  if (field === ZOOM_PEAK) {
    const track = scaleTrack(values);
    // A static scale beside the track is the authored size; the peak dial needs real motion.
    return track && values?.media_scale === undefined && trackPeak(track) !== 1 ? trackPeak(track) : undefined;
  }
  return undefined;
}

/** Derived dial names available on these values, for default selection. */
export function derivedProposalFields(target: string, values: Record<string, unknown> | undefined): string[] {
  if (!DERIVED_TARGETS.has(target)) return [];
  return [...CROP_EDGES, ZOOM_PEAK].filter(field => derivedFieldValue(values, field) !== undefined);
}

/** Write a derived dial into its structured value; false when `field` is not derived. */
export function setDerivedField(values: Record<string, unknown>, field: string, value: number): boolean {
  const edge = CROP_EDGES.indexOf(field as typeof CROP_EDGES[number]);
  if (edge >= 0) {
    const inset = [...(values.mask_inset as number[])];
    inset[edge] = value;
    values.mask_inset = inset;
    return true;
  }
  if (field === ZOOM_PEAK) {
    const track = scaleTrack(values)!;
    const ratio = (value - 1) / (trackPeak(track) - 1);
    const scaled = track.map(point => ({ ...point, v: Math.round((1 + (point.v - 1) * ratio) * 1e4) / 1e4 }));
    if (scaleTrackKey(values) === "media_scale_keyframes") values.media_scale_keyframes = scaled;
    else values.transition_keyframes = { ...(values.transition_keyframes as Record<string, unknown>), media_scale: scaled };
    return true;
  }
  return false;
}

/** A linked group's children never appear a second time in Advanced. */
export function proposalControlIsLinkedChild(change: {operation_index: number; target: string; field: string}, plan?: readonly ProposalControlReference[]) {
  return !!plan?.some(ref => ref.target === change.target && ref.field === change.field && ref.linked_operation_indices?.includes(change.operation_index));
}

export function proposalControlTier(change: {operation_index: number; target: string; field: string; after_value?: unknown}, plan?: readonly ProposalControlReference[]): "main" | "advanced" | null {
  // The peak-ramp compiler owns these values. Tuning a derived duration or the
  // playback-rate base separately would break the linked source clock.
  if (["duration", "playback_rate"].includes(change.field) && change.target === "patch"
    && plan?.some(ref => ref.field === "playback_ramp_fast_rate"
      && [ref.operation_index, ...(ref.linked_operation_indices ?? [])].includes(change.operation_index))) return null;
  if (!isSupportedProposalControl(change.target, change.field, change.after_value) || proposalControlIsLinkedChild(change, plan)) return null;
  return proposalControlIsVisible(change, plan) ? "main" : "advanced";
}

type TunableField = {
  min: number;
  max: number;
  step: number;
  suffix: string;
  label?: string;
  toDisplay?: (value: number) => number;
  fromDisplay?: (value: number) => number;
};

/** Effect numbers get proposal support from the capability definition, not a second list. */
const effectNumbers: Record<string, TunableField> = Object.fromEntries(EFFECT_CONTROLS
  .filter(control => control.agentWritable && control.kind === "number")
  .map(control => {
    if (control.kind !== "number") throw new Error("Expected numeric effect");
    const { step, suffix, scale = 1, offset = 0, label = control.label } = control.proposal as EffectProposalNumber;
    return [control.prop, { label, step, suffix, min: control.min * scale + offset, max: control.max * scale + offset,
      toDisplay: (value: number) => value * scale + offset,
      fromDisplay: (value: number) => (value - offset) / scale }];
  }));

const transitionNumbers: Record<string, TunableField> = Object.fromEntries(TRANSITION_CONTROLS.map(control => {
  const scale = "scale" in control ? control.scale : 1;
  const quantize = (value: number) => control.suffix === "frames" ? Math.round(value) : value;
  return [control.field, {label: control.label, min: control.min * scale, max: control.max * scale, step: control.step * scale, suffix: control.suffix, toDisplay: (value: number) => quantize(value * scale), fromDisplay: (value: number) => quantize(value) / scale}];
}));

/** Domain ownership keeps transition duration independent of text/audio duration. */
export function proposalTunableField(target: string, field: string, nativeRange?: {min: number; max: number}, unit?: "seconds" | "frames"): TunableField | undefined {
  const spec = target === "timing_control" && unit === "frames" ? {
    ...PROPOSAL_TUNABLE_FIELDS[field], min: 0, max: 3 * currentFrameRate(), step: 1, suffix: "frames",
    toDisplay: (value: number) => Math.round(value * currentFrameRate()),
    fromDisplay: (value: number) => Math.round(value) / currentFrameRate(),
  } : target === "create_transition" ? transitionNumbers[field] : PROPOSAL_TUNABLE_FIELDS[field];
  if (!spec || !nativeRange) return spec;
  // Source-dependent bounds are native values, just like the stored value.
  const display = spec.toDisplay ?? ((value: number) => value);
  return {...spec, min: display(nativeRange.min), max: display(nativeRange.max)};
}

export const PROPOSAL_TUNABLE_FIELDS: Record<string, TunableField> = {
  ...effectNumbers,
  // The review UI narrows these clip-wide bounds against the other three
  // timing values and the actual source duration before showing each slider.
  mask_window_close_start_seconds: { label: "Bars start closing", min: .03, max: 600, step: .01, suffix: "s" },
  mask_window_close_duration_seconds: { label: "Closing time", min: .03, max: 600, step: .01, suffix: "s" },
  mask_window_reopen_start_seconds: { label: "Bars start reopening", min: .03, max: 600, step: .01, suffix: "s" },
  mask_window_reopen_duration_seconds: { label: "Reopening time", min: .03, max: 600, step: .01, suffix: "s" },
  mask_window_top_percent: { label: "Top bar depth", min: 10, max: 45, step: 1, suffix: "%", toDisplay: value => value * 100, fromDisplay: value => value / 100 },
  mask_window_bottom_percent: { label: "Bottom bar depth", min: 10, max: 50, step: 1, suffix: "%", toDisplay: value => value * 100, fromDisplay: value => value / 100 },
  subject_entrance_seconds: { label: "Entrance delay", min: 0, max: 1, step: 1/30, suffix: "s" },
  subject_flash_seconds: { label: "Flash duration", min: 1/30, max: .5, step: 1/30, suffix: "s" },
  subject_glow_fade_seconds: { label: "Glow fade", min: 1/30, max: .5, step: 1/30, suffix: "s" },
  spacing_seconds: { label: "Spacing", min: 0.2, max: 1.2, step: 0.01, suffix: "s" },
  duration_seconds: { min: 1 / 30, max: 10, step: 1 / 30, suffix: "s", label: "Duration" },
  duration: { min: 1 / 30, max: 10, step: 1 / 30, suffix: "s", label: "Duration" },
  gravity_drop_seconds: { min: 0.2, max: 2, step: 0.01, suffix: "s", label: "Fall duration" },
  letter_fall_seconds: { min: 0.2, max: 2, step: 0.01, suffix: "s", label: "Letter fall time" },
  letter_fall_stagger_seconds: { min: 0, max: 0.15, step: 0.005, suffix: "s", label: "Letter stagger" },
  mask_line_rotation: {min:-180,max:180,step:.1,suffix:"°",label:"Diagonal angle"},
  mediaFillVideoPlaybackRate: { min: 0.1, max: 4, step: 0.01, suffix: "×", label: "Fill speed" },
  fontSizePx: { min: 18, max: 300, step: 1, suffix: "px", label: "Size" },
  // Caption rail dials (replace_captions): size and a centred nudge from the preset spot.
  font_size_px: { min: 18, max: 300, step: 1, suffix: "px", label: "Size" },
  offsetX: { min: -45, max: 45, step: 0.5, suffix: "%", label: "X", toDisplay: value => value * 100, fromDisplay: value => value / 100 },
  offsetY: { min: -45, max: 45, step: 0.5, suffix: "%", label: "Y", toDisplay: value => value * 100, fromDisplay: value => value / 100 },
  singleWordFlipSeconds: { min: 0, max: 0.3, step: 0.01, suffix: "s", label: "Word flip" },
  absX: { min: -50, max: 150, step: 0.01, suffix: "%", label: "Horizontal", toDisplay: value => value * 100, fromDisplay: value => value / 100 },
  absY: { min: -50, max: 150, step: 0.01, suffix: "%", label: "Vertical", toDisplay: value => value * 100, fromDisplay: value => value / 100 },
  contour_radius_start: { min: 0, max: 900, step: 1, suffix: "px" },
  contour_radius_end: { min: 0, max: 900, step: 1, suffix: "px" },
  contour_duration: { min: 0, max: 600, step: 1 / 30, suffix: "s" },
  remove_opening_seconds: { min: 0.03, max: 8, step: 0.01, suffix: "s" },
  punch_in_source_seconds: { min: 0, max: 600, step: 0.01, suffix: "s" },
  punch_in_scale: { min: 1, max: 2, step: 0.01, suffix: "×" },
  punch_in_offset_x: { min: -0.5, max: 0.5, step: 0.01, suffix: "" },
  punch_in_offset_y: { min: -0.5, max: 0.5, step: 0.01, suffix: "" },
  source_start_seconds: { min: 0, max: 3600, step: 1 / 30, suffix: "s" },
  source_end_seconds: { min: 0, max: 3600, step: 1 / 30, suffix: "s" },
  playback_ramp_start_rate: { label: "Starting speed", min: 0.5, max: 4, step: 0.01, suffix: "×" },
  playback_ramp_end_rate: { label: "Ending speed", min: 0.5, max: 4, step: 0.01, suffix: "×" },
  playback_ramp_fast_rate: { label: "Opening speed", min: 0.5, max: 4, step: 0.01, suffix: "×" },
  playback_ramp_top_rate: { label: "Speed at note", min: 0.25, max: 2, step: 0.01, suffix: "×" },
  playback_ramp_slow_start_source_seconds: { label: "Slowdown starts · source", min: 0, max: 600, step: 0.01, suffix: "s" },
  playback_ramp_slow_end_source_seconds: { label: "Slowdown ends · source", min: 0, max: 600, step: 0.01, suffix: "s" },
  playback_ramp_bar_close_start_seconds: { label: "Bars start closing", min: .03, max: 600, step: .01, suffix: "s" },
  playback_ramp_bar_close_duration_seconds: { label: "Closing time", min: .03, max: 600, step: .01, suffix: "s" },
  playback_ramp_bar_reopen_start_seconds: { label: "Bars start reopening", min: .03, max: 600, step: .01, suffix: "s" },
  playback_ramp_bar_reopen_duration_seconds: { label: "Reopening time", min: .03, max: 600, step: .01, suffix: "s" },
  playback_rate: { min: 0.5, max: 4, step: 0.01, suffix: "×" },
  volume: { min: FADER_MIN_DB, max: FADER_MAX_DB, step: 0.1, suffix: "dB", toDisplay: (gain) => gainToFaderDb(gain) ?? FADER_MIN_DB, fromDisplay: faderDbToGain },
  fade_in: { min: 0, max: 2, step: 0.01, suffix: "s" },
  fade_out: { min: 0, max: 2, step: 0.01, suffix: "s" },
  handwritingWeight: HANDWRITING_WEIGHT,
  animationInDuration: { label: "Animation in", min: 0, max: 60, step: 0.01, suffix: "s" },
  animationOutDuration: { label: "Animation out", min: 0, max: 60, step: 0.01, suffix: "s" },
  cameraRevealShutterAngle: { min: 0, max: 360, step: 10, suffix: "°" },
  cameraRevealBlurSamples: { min: 1, max: 10, step: 1, suffix: "" },
  // Derived dials (see derivedFieldValue). Crop stays within the editor's per-edge change cap.
  mask_inset_top: { label: "Crop top", min: 0, max: 50, step: 1, suffix: "%", toDisplay: value => value * 100, fromDisplay: value => value / 100 },
  mask_inset_right: { label: "Crop right", min: 0, max: 50, step: 1, suffix: "%", toDisplay: value => value * 100, fromDisplay: value => value / 100 },
  mask_inset_bottom: { label: "Crop bottom", min: 0, max: 50, step: 1, suffix: "%", toDisplay: value => value * 100, fromDisplay: value => value / 100 },
  mask_inset_left: { label: "Crop left", min: 0, max: 50, step: 1, suffix: "%", toDisplay: value => value * 100, fromDisplay: value => value / 100 },
  media_scale_peak: { label: "Zoom amount", min: 0.5, max: 3, step: 0.01, suffix: "×" },
  // Timing dials on existing clips; the review narrows each range to the lane and source.
  timeline_start: { label: "Start", min: 0, max: 3600, step: 1 / 30, suffix: "s" },
  trim_start: { label: "Trim start", min: 0, max: 3600, step: 1 / 30, suffix: "s" },
  trim_end: { label: "Trim end", min: 0, max: 3600, step: 1 / 30, suffix: "s" },
};


/*
 * Timing dials on an existing clip's patch. Each moves only the fields the proposal already
 * changes, the way the inspector's own trims do: Trim start keeps a head trim's out point
 * (shifting start and length together, or only the length when the start is not proposed),
 * Trim end changes the length, Start moves the clip.
 * When an operation trims, its start and length belong to the trim dials, so separate Start
 * and Length dials never fight them. Speech-bound clips get none (see the review).
 */
export const TIMING_PATCH_FIELDS = new Set(["timeline_start", "trim_start", "trim_end"]);
const MIN_CLIP_SECONDS = 1 / 30;

/** Start or length an operation's trim dials already own. */
export function timingFieldOwnedByTrim(operation: { patch?: Record<string, unknown> } | undefined, field: string) {
  const patch = operation?.patch;
  return ["timeline_start", "duration"].includes(field) && typeof patch?.[field] === "number"
    && (typeof patch.trim_start === "number" || typeof patch.trim_end === "number");
}

/**
 * Apply one timing dial to a patch, moving coupled fields that are already proposed.
 * `rate` is the clip's playback rate after this patch (source seconds per timeline second).
 */
export function setTimingField(patch: Record<string, number>, field: string, value: number, rate: number) {
  if (field === "trim_start") {
    // A proposed length keeps the source out point; a proposed start also keeps the timeline out point.
    const shift = (value - (patch.trim_start ?? value)) / rate;
    if (typeof patch.duration === "number") {
      if (patch.duration - shift < MIN_CLIP_SECONDS) throw new Error("Trim start would leave the clip shorter than one frame");
      patch.duration = Math.round((patch.duration - shift) * 1e6) / 1e6;
      if (typeof patch.timeline_start === "number") patch.timeline_start = Math.round((patch.timeline_start + shift) * 1e6) / 1e6;
    }
  } else if (field === "trim_end" && typeof patch.duration === "number") {
    const shift = (value - (patch.trim_end ?? value)) / rate;
    if (patch.duration - shift < MIN_CLIP_SECONDS) throw new Error("Trim end would leave the clip shorter than one frame");
    patch.duration = Math.round((patch.duration - shift) * 1e6) / 1e6;
  }
  patch[field] = value;
}

/** Colour dials a proposal card renders as a swatch. */
export const PROPOSAL_COLOR_CONTROL_FIELDS: readonly string[] = ["recolor_color", "sticker_outline_color", "gradient_map_shadows", "gradient_map_midtones", "gradient_map_highlights"];
/** String dials: colours plus registered picture choices. */
export const PROPOSAL_STRING_CONTROL_FIELDS: readonly string[] = [...PROPOSAL_COLOR_CONTROL_FIELDS, "media_orientation", "media_mirror", "media_blend_mode", "subject_window_mode"];

export function isSupportedProposalControl(target: string, field: string, value: unknown): boolean {
  if (TIMING_PATCH_FIELDS.has(field) && target !== "patch") return false;
  if (target === "create_transition") return typeof value === "number" && TRANSITION_CONTROLS.some(control => control.field === field);
  if (target === "timing_control") return field === "spacing_seconds" && typeof value === "number";
  if (target === "replace_captions") return typeof value === "number" && CAPTION_RAIL_DIALS.has(field);
  return ["create_audio", "create_visual", "create_text", "opening_sequence_edit", "patch", "props"].includes(target)
    && ((typeof value === "number" && Object.hasOwn(PROPOSAL_TUNABLE_FIELDS, field))
      || (typeof value === "string" && ["props", "create_visual"].includes(target) && PROPOSAL_STRING_CONTROL_FIELDS.includes(field)));
}

// New geometry controls require an explicit intent plan. Preserve legacy panel density
// instead of unexpectedly exposing every child's coordinates in an existing card.
const LEGACY_FALLBACK_FIELDS = new Set(["subject_glow", "subject_glow_radius", "subject_flash", "subject_entrance_seconds", "subject_flash_seconds", "subject_glow_fade_seconds", "spacing_seconds", "duration_seconds", "duration", "gravity_drop_seconds", "letter_fall_seconds", "letter_fall_stagger_seconds", "mask_line_rotation", "mediaFillVideoPlaybackRate", "fontSizePx", "absX", "absY", "media_scale", "media_offset_x", "media_offset_y", "recolor_amount", "contour_radius_start", "contour_radius_end", "contour_duration", "remove_opening_seconds", "punch_in_source_seconds", "punch_in_scale", "punch_in_offset_x", "punch_in_offset_y", "source_start_seconds", "source_end_seconds", "playback_ramp_start_rate", "playback_ramp_end_rate", "playback_rate", "volume", "fade_in", "fade_out", "media_opacity", "animationInDuration", "animationOutDuration", "cameraRevealShutterAngle", "cameraRevealBlurSamples", "grade_exposure_ev", "grade_highlights", "grade_shadows", "grade_whites", "grade_blacks", "grade_contrast", "grade_saturation", "grade_temperature", "grade_tint", "grade_hue_degrees", "recolor_color", "sticker_outline_color", "media_orientation", "media_mirror", "media_blend_mode"]);

/** Every captions card carries these dials, so placement is always adjustable on the card. */
export const CAPTION_RAIL_DIALS = new Set(["offsetX", "offsetY", "font_size_px", "singleWordFlipSeconds"]);

const GEOMETRY_CONTROLS = new Set(["fontSizePx", "absX", "absY", "media_scale", "media_offset_x", "media_offset_y"]);

/** A plan selects controls from real mutations; it never creates fields or changes their labels. */
export function proposalControlIsVisible(
  change: { operation_index: number; target: string; field: string; after_value?: unknown },
  plan?: readonly ProposalControlReference[],
): boolean {
  if (change.target === "create_transition" && !plan) return false;
  if (change.target === "replace_captions") return isSupportedProposalControl(change.target, change.field, change.after_value);
  return isSupportedProposalControl(change.target, change.field, change.after_value)
    && (plan ? plan.some(ref => ref.operation_index === change.operation_index && ref.target === change.target && ref.field === change.field) : LEGACY_FALLBACK_FIELDS.has(change.field) && !GEOMETRY_CONTROLS.has(change.field));
}

export function proposalControlOrder(
  change: { operation_index: number; target: string; field: string },
  plan?: readonly ProposalControlReference[],
): number {
  return plan?.findIndex(ref => ref.operation_index === change.operation_index && ref.target === change.target && ref.field === change.field) ?? 0;
}
