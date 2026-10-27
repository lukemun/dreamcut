import { currentFrameRate } from "../timeline/frame-rate-scope";
import { HANDWRITING_WEIGHT } from "../timeline/handwriting-weight";
import { TRANSITION_CONTROLS, proposedFieldValue, availableTransitionFieldValue } from "../timeline/transition-controls";
import { EFFECT_CONTROLS, type EffectProposalNumber } from "../timeline/effect-controls";
import { FADER_MIN_DB, FADER_MAX_DB, gainToFaderDb, faderDbToGain } from "../timeline/audio-gain";
import { PLACEMENT_ALIGNS, PLACEMENT_GAP, PLACEMENT_SIDES } from "../timeline/placement-vocabulary";

export type ProposalControlReference = {
  operation_index: number;
  target: "create_transition" | "create_audio" | "create_visual" | "create_text" | "create_shape" | "opening_sequence_edit" | "replace_captions" | "speed_change" | "patch" | "props" | "timing_control";
  field: string;
  linked_operation_indices?: number[];
  /** Heading this dial sits under; dials sharing one sit together, in plan order. */
  section?: string;
};

export function proposalAvailableFieldValue(target: string, values: Record<string, unknown> | undefined, field: string) {
  if (target === "create_transition") return availableTransitionFieldValue(values, field);
  return proposedFieldValue(values, field) ?? (DERIVED_TARGETS.has(target) ? derivedFieldValue(values, field) ?? derivedChoiceValue(values, field) : undefined);
}

/*
 * Derived dials: one number tuning part of a structured value the editor stores whole. Each
 * crop edge reads and writes one entry of `mask_inset` ([top, right, bottom, left]); the zoom
 * amount is the peak of a keyframed `media_scale` track, and moving it rescales every point's
 * distance from fitted (1), so a 1 → 1.1 punch-in tuned to 1.2 becomes 1 → 1.2 with the same
 * timing and easing. The punch's timing dials keep its peak on its anchor: Ramp in moves
 * the point the zoom leaves from, Hold and Ramp out move the return (and everything
 * after it) while the peak stays put. Approval writes the structured value, never these names.
 */
const DERIVED_TARGETS = new Set(["props", "create_visual", "create_text", "create_shape"]);
const CROP_EDGES = ["mask_inset_top", "mask_inset_right", "mask_inset_bottom", "mask_inset_left"] as const;
const ZOOM_PEAK = "media_scale_peak";
const ZOOM_TIMING = ["media_scale_ramp_in_seconds", "media_scale_hold_seconds", "media_scale_ramp_out_seconds"] as const;
type ZoomTimingField = typeof ZOOM_TIMING[number];
/*
 * A relation placement (`place`, timeline/placement-relation.ts) is tuned through its gap (a
 * number) and its side and alignment (choices); the anchors are identities, never dials.
 */
const PLACE_GAP = "place_gap";
const PLACE_CHOICES = { place_side: "side", place_align: "align", place_vertical_align: "vertical_align" } as const;
export const PLACE_CHOICE_VALUES: Record<string, readonly string[]> = { place_side: PLACEMENT_SIDES, place_align: PLACEMENT_ALIGNS, place_vertical_align: PLACEMENT_ALIGNS };
const placeOf = (values: Record<string, unknown> | undefined) => values?.place && typeof values.place === "object" ? values.place as Record<string, unknown> : undefined;
/*
 * A clip whose sideways keyframed move starts off frame comes in from a side. Its choice dial
 * mirrors that move: switching sides negates every horizontal position key, so the clip lands
 * where it did, from the other edge.
 */
const ENTRY_SIDE = "motion_from_side";
export const ENTRY_SIDES = ["left", "right"] as const;
function entryTrack(values: Record<string, unknown> | undefined) {
  const track = (values?.transition_keyframes as Record<string, unknown> | undefined)?.media_offset_x as { t: number; v: number }[] | undefined;
  return Array.isArray(track) && track.length >= 2 && typeof track[0]?.v === "number" && Math.abs(track[0].v) >= 1 ? track : undefined;
}
/** A derived choice dial's value: the side or alignment of a relation placement, or a move's entry side. */
export function derivedChoiceValue(values: Record<string, unknown> | undefined, field: string): string | undefined {
  if (field === ENTRY_SIDE) { const track = entryTrack(values); return track ? track[0].v < 0 ? "left" : "right" : undefined; }
  const key = PLACE_CHOICES[field as keyof typeof PLACE_CHOICES];
  const place = key ? placeOf(values) : undefined;
  if (!place) return undefined;
  // Vertical alignment only means something inside the anchor.
  if (key === "vertical_align" && place.side !== "inside") return undefined;
  return typeof place[key] === "string" ? place[key] as string : key === "align" || key === "vertical_align" ? "center" : undefined;
}
/** Write a derived choice dial; false when `field` is not one or the value is not a listed choice. */
export function setDerivedChoice(values: Record<string, unknown>, field: string, value: string): boolean {
  if (field === ENTRY_SIDE) {
    const track = entryTrack(values);
    if (!track || !(ENTRY_SIDES as readonly string[]).includes(value)) return false;
    if (derivedChoiceValue(values, field) !== value) {
      values.transition_keyframes = { ...(values.transition_keyframes as Record<string, unknown>), media_offset_x: track.map(point => ({ ...point, v: point.v === 0 ? 0 : -point.v })) };
    }
    return true;
  }
  const key = PLACE_CHOICES[field as keyof typeof PLACE_CHOICES];
  if (!key || !placeOf(values) || !PLACE_CHOICE_VALUES[field]!.includes(value)) return false;
  values.place = { ...placeOf(values), [key]: value };
  return true;
}
/** Derived choice dial names available on these values. */
export function derivedChoiceFields(target: string, values: Record<string, unknown> | undefined): string[] {
  return DERIVED_TARGETS.has(target) ? [...Object.keys(PLACE_CHOICES), ENTRY_SIDE].filter(field => derivedChoiceValue(values, field) !== undefined) : [];
}

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
type ZoomPoint = {t: number; v: number; ease?: string};
/** The track the zoom dials tune: real motion, with no static scale beside it. */
function zoomTrack(values: Record<string, unknown> | undefined) {
  const track = scaleTrack(values) as ZoomPoint[] | undefined;
  return track && values?.media_scale === undefined && trackPeak(track) !== 1 ? track : undefined;
}
function writeZoomTrack(values: Record<string, unknown>, track: ZoomPoint[]) {
  if (scaleTrackKey(values) === "media_scale_keyframes") values.media_scale_keyframes = track;
  else values.transition_keyframes = { ...(values.transition_keyframes as Record<string, unknown>), media_scale: track };
}
/**
 * The punch on a zoom track: `first`..`last` are the run of points at the peak, `back` the
 * point it returns to (-1 when it never returns). A final point level with the one before it
 * is the track's end anchor and stays put when the return moves.
 */
function punchShape(track: ZoomPoint[]) {
  const peak = trackPeak(track);
  const first = track.findIndex(point => point.v === peak);
  let last = first;
  while (last + 1 < track.length && track[last + 1].v === peak) last += 1;
  const back = last + 1 < track.length ? last + 1 : -1;
  const end = track.length - 1;
  const anchor = back >= 0 && end > back && track[end].v === track[end - 1].v ? end : -1;
  return { first, last, back, anchor };
}
const roundMs = (seconds: number) => Math.round(seconds * 1000) / 1000;
function zoomTimingValue(track: ZoomPoint[], field: ZoomTimingField): number | undefined {
  const { first, last, back } = punchShape(track);
  if (field === "media_scale_ramp_in_seconds") return first >= 1 ? roundMs(track[first].t - track[first - 1].t) : undefined;
  if (back < 0) return undefined;
  return roundMs(field === "media_scale_hold_seconds" ? track[last].t - track[first].t : track[back].t - track[last].t);
}
function setZoomTiming(track: ZoomPoint[], field: ZoomTimingField, value: number): ZoomPoint[] {
  const { first, last, back, anchor } = punchShape(track);
  // Shift the return and what follows it, leaving an end anchor where it is.
  const shiftTail = (points: ZoomPoint[], delta: number) => points.map((point, index) =>
    index + back === anchor ? point : { ...point, t: roundMs(point.t + delta) });
  let next: ZoomPoint[];
  if (field === "media_scale_ramp_in_seconds") {
    const start = roundMs(track[first].t - value);
    // A zoom that leaves from the clip's first frame gains a level lead-in when it starts later.
    next = first === 1 && track[0].t === 0 && start > 0
      ? [{ ...track[0] }, { ...track[0], t: start }, ...track.slice(1)]
      : track.map((point, index) => index === first - 1 ? { ...point, t: start } : point);
  } else if (field === "media_scale_hold_seconds") {
    const hold = track[last].t - track[first].t;
    const delta = value - hold;
    const held = value <= 0 ? [] : last === first ? [{ ...track[first], t: roundMs(track[first].t + value) }]
      : track.slice(first + 1, last + 1).map(point => ({ ...point, t: roundMs(track[first].t + (point.t - track[first].t) * value / hold) }));
    // Without a hold the peak point takes the easing of the return it now starts.
    const { ease, ...peakPoint } = track[value <= 0 ? last : first];
    const peak = { ...peakPoint, t: track[first].t, ...(ease ? { ease } : {}) };
    next = [...track.slice(0, first), peak, ...held, ...shiftTail(track.slice(back), delta)];
  } else {
    next = [...track.slice(0, back), ...shiftTail(track.slice(back), value - (track[back].t - track[last].t))];
  }
  if (next.some((point, index) => point.t < 0 || (index > 0 && point.t <= next[index - 1].t))) {
    throw new Error("Zoom timing would move a keyframe past its neighbour");
  }
  return next;
}

/**
 * Where a zoom timing dial can go inside a clip `clipSeconds` long: each ramp at least a
 * frame, the lead-in no earlier than the point before it, the return no later than the
 * clip's end (or its end anchor).
 */
export function zoomTimingRange(values: Record<string, unknown> | undefined, field: string, clipSeconds: number | undefined): {min: number; max: number} | undefined {
  const track = zoomTrack(values);
  if (!track || !(ZOOM_TIMING as readonly string[]).includes(field)) return undefined;
  const value = zoomTimingValue(track, field as ZoomTimingField);
  if (value === undefined) return undefined;
  const frame = 1 / currentFrameRate();
  const { first, back, anchor } = punchShape(track);
  if (field === "media_scale_ramp_in_seconds") {
    const floor = first >= 2 ? track[first - 2].t + frame : 0;
    return { min: Math.min(value, roundMs(frame)), max: roundMs(Math.max(value, track[first].t - floor)) };
  }
  const end = track.length - 1;
  const room = anchor >= 0 ? track[anchor].t - track[anchor - 1].t - frame : (clipSeconds ?? track[end].t) - track[end].t;
  const max = roundMs(value + Math.max(0, room));
  return field === "media_scale_hold_seconds" ? { min: 0, max } : { min: Math.min(value, roundMs(frame)), max: Math.max(max, value) };
}

export function derivedFieldValue(values: Record<string, unknown> | undefined, field: string): number | undefined {
  if (field === PLACE_GAP) {
    const place = placeOf(values);
    return !place ? undefined : typeof place.gap === "number" ? place.gap : PLACEMENT_GAP.default;
  }
  const edge = CROP_EDGES.indexOf(field as typeof CROP_EDGES[number]);
  if (edge >= 0) {
    const inset = values?.mask_inset;
    return Array.isArray(inset) && inset.length === 4 && typeof inset[edge] === "number" ? inset[edge] : undefined;
  }
  // A static scale beside the track is the authored size; the zoom dials need real motion.
  const track = field === ZOOM_PEAK || (ZOOM_TIMING as readonly string[]).includes(field) ? zoomTrack(values) : undefined;
  if (!track) return undefined;
  return field === ZOOM_PEAK ? trackPeak(track) : zoomTimingValue(track, field as ZoomTimingField);
}

/** Derived dial names available on these values, for default selection. */
export function derivedProposalFields(target: string, values: Record<string, unknown> | undefined): string[] {
  if (!DERIVED_TARGETS.has(target)) return [];
  return [...CROP_EDGES, ZOOM_PEAK, ...ZOOM_TIMING, PLACE_GAP].filter(field => derivedFieldValue(values, field) !== undefined);
}

/** Write a derived dial into its structured value; false when `field` is not derived. */
export function setDerivedField(values: Record<string, unknown>, field: string, value: number): boolean {
  if (field === PLACE_GAP && placeOf(values)) {
    values.place = { ...placeOf(values), gap: value };
    return true;
  }
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
    writeZoomTrack(values, track.map(point => ({ ...point, v: Math.round((1 + (point.v - 1) * ratio) * 1e4) / 1e4 })));
    return true;
  }
  if ((ZOOM_TIMING as readonly string[]).includes(field)) {
    writeZoomTrack(values, setZoomTiming(scaleTrack(values) as ZoomPoint[], field as ZoomTimingField, value));
    return true;
  }
  return false;
}

/** A linked group's children never appear a second time in Advanced. */
export function proposalControlIsLinkedChild(change: {operation_index: number; target: string; field: string}, plan?: readonly ProposalControlReference[]) {
  return !!plan?.some(ref => ref.target === change.target && ref.linked_operation_indices?.includes(change.operation_index)
    // A long caption track is split into several operations that form one rail: a part linked to
    // the first for any caption dial follows it for all of them, so the card shows one set.
    && (ref.field === change.field || change.target === "replace_captions"));
}

export function proposalControlTier(change: {operation_index: number; target: string; field: string; after_value?: unknown; control_tier?: "main" | "advanced"}, plan?: readonly ProposalControlReference[]): "main" | "advanced" | null {
  // A block setting's tier comes from the block registry, not from a review_controls plan.
  if (change.target === "block") return change.control_tier ?? "advanced";
  // The peak-ramp compiler owns these values. Tuning a derived duration or the
  // playback-rate base separately would break the linked source clock.
  if (["duration", "playback_rate"].includes(change.field) && change.target === "patch"
    && plan?.some(ref => ref.field === "playback_ramp_fast_rate"
      && [ref.operation_index, ...(ref.linked_operation_indices ?? [])].includes(change.operation_index))) return null;
  if (!isSupportedProposalControl(change.target, change.field, change.after_value) || proposalControlIsLinkedChild(change, plan)) return null;
  return proposalControlIsVisible(change, plan) ? "main" : "advanced";
}

export type TunableField = {
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
export function proposalTunableField(target: string, field: string, nativeRange?: {min: number; max: number}, unit?: "seconds" | "frames", display?: {step: number; suffix: string}): TunableField | undefined {
  // A block setting is stored in its display units; its range and step come with the review row.
  if (target === "block") return nativeRange && display ? { min: nativeRange.min, max: nativeRange.max, step: display.step, suffix: display.suffix } : undefined;
  const spec = target === "timing_control" && unit === "frames" ? {
    ...PROPOSAL_TUNABLE_FIELDS[field], min: 0, max: 3 * currentFrameRate(), step: 1, suffix: "frames",
    toDisplay: (value: number) => Math.round(value * currentFrameRate()),
    fromDisplay: (value: number) => Math.round(value) / currentFrameRate(),
  } : target === "create_transition" ? transitionNumbers[field] : PROPOSAL_TUNABLE_FIELDS[field];
  if (!spec || !nativeRange) return spec;
  // Source-dependent bounds are native values, just like the stored value.
  const shown = spec.toDisplay ?? ((value: number) => value);
  return {...spec, min: shown(nativeRange.min), max: shown(nativeRange.max)};
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
  rotationDeg: { min: -180, max: 180, step: 1, suffix: "°", label: "Rotation" },
  // Shapes (timeline/shapes.ts): size as a share of the canvas height, outline in px at 1080.
  shape_width: { min: 0.5, max: 400, step: 0.5, suffix: "%", label: "Width", toDisplay: value => value * 100, fromDisplay: value => value / 100 },
  shape_height: { min: 0.5, max: 400, step: 0.5, suffix: "%", label: "Height", toDisplay: value => value * 100, fromDisplay: value => value / 100 },
  shape_stroke_width: { min: 0, max: 200, step: 1, suffix: "px", label: "Outline" },
  shape_corner_radius: { min: 0, max: 50, step: 1, suffix: "%", label: "Corners", toDisplay: value => value * 100, fromDisplay: value => value / 100 },
  shape_draw: { min: 0, max: 100, step: 1, suffix: "%", label: "Drawn", toDisplay: value => value * 100, fromDisplay: value => value / 100 },
  shape_taper: { min: 0, max: 100, step: 1, suffix: "%", label: "Taper", toDisplay: value => value * 100, fromDisplay: value => value / 100 },
  shape_wobble: { min: 0, max: 100, step: 1, suffix: "%", label: "Wobble", toDisplay: value => value * 100, fromDisplay: value => value / 100 },
  shape_seed: { min: 0, max: 9999, step: 1, suffix: "", label: "Variation" },
  shape_sides: { min: 3, max: 24, step: 1, suffix: "", label: "Points" },
  shape_star_depth: { min: 5, max: 95, step: 1, suffix: "%", label: "Depth", toDisplay: value => value * 100, fromDisplay: value => value / 100 },
  shape_arc_start: { min: -360, max: 360, step: 1, suffix: "°", label: "Start" },
  shape_arc_end: { min: -360, max: 720, step: 1, suffix: "°", label: "End" },
  shape_arrow_head: { min: 5, max: 90, step: 1, suffix: "%", label: "Head", toDisplay: value => value * 100, fromDisplay: value => value / 100 },
  shape_arrow_shaft: { min: 2, max: 100, step: 1, suffix: "%", label: "Shaft", toDisplay: value => value * 100, fromDisplay: value => value / 100 },
  media_rotation: { min: -720, max: 720, step: 1, suffix: "°", label: "Rotation" },
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
  /** A speed change's one dial: how much faster everything from its clip on plays. */
  factor: { label: "Speed", min: 0.5, max: 2, step: 0.01, suffix: "×" },
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
  place_gap: { label: "Gap", min: PLACEMENT_GAP.min * 100, max: PLACEMENT_GAP.max * 100, step: 0.5, suffix: "%", toDisplay: value => value * 100, fromDisplay: value => value / 100 },
  // The review narrows these to the punch's neighbouring keyframes and the clip (zoomTimingRange).
  media_scale_ramp_in_seconds: { label: "Ramp in", min: 0, max: 600, step: 0.01, suffix: "s" },
  media_scale_hold_seconds: { label: "Hold", min: 0, max: 600, step: 0.01, suffix: "s" },
  media_scale_ramp_out_seconds: { label: "Ramp out", min: 0, max: 600, step: 0.01, suffix: "s" },
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
export const PROPOSAL_COLOR_CONTROL_FIELDS: readonly string[] = ["recolor_color", "sticker_outline_color", "gradient_map_shadows", "gradient_map_midtones", "gradient_map_highlights", "shape_fill", "shape_stroke"];
/** String dials: colours plus registered picture choices. */
export const PROPOSAL_STRING_CONTROL_FIELDS: readonly string[] = [...PROPOSAL_COLOR_CONTROL_FIELDS, "media_orientation", "media_mirror", "media_blend_mode", "subject_window_mode", ...Object.keys(PLACE_CHOICES), ENTRY_SIDE];

/** Graph and wheel dials (colour wheels, curves, colour slice): a list of numbers tuned as one control. */
export const PROPOSAL_LIST_CONTROL_FIELDS: readonly string[] = EFFECT_CONTROLS.filter(control => control.agentWritable && control.kind === "list").map(control => control.prop);

/** The registry's own normalizer for a list dial; it bounds, sorts and caps the value. */
export function normalizeProposalListValue(field: string, value: readonly number[]): number[] {
  const control = EFFECT_CONTROLS.find(entry => entry.prop === field && entry.kind === "list");
  if (!control || control.kind !== "list") throw new Error(`${field} is not a graph or wheel control`);
  return control.normalize(value);
}

/** Values compare by content, so a re-sent list equal to the authored one is not an override. */
export function controlValueEquals(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((entry, index) => entry === b[index]);
  return a === b;
}

/** A camera has no size of its own (its view is position, zoom and rotation), so its box is never a dial. */
export function isCameraSizeField(operation: Record<string, unknown> | undefined, target: string, field: string) {
  return target === "create_shape" && (operation?.create_shape as { shape_kind?: unknown } | undefined)?.shape_kind === "camera"
    && (field === "shape_width" || field === "shape_height");
}

export function isSupportedProposalControl(target: string, field: string, value: unknown): boolean {
  if (target === "block") return typeof value === "number" || typeof value === "string";
  if (TIMING_PATCH_FIELDS.has(field) && target !== "patch") return false;
  if (target === "create_transition") return typeof value === "number" && TRANSITION_CONTROLS.some(control => control.field === field);
  if (target === "timing_control") return field === "spacing_seconds" && typeof value === "number";
  if (target === "replace_captions") return typeof value === "number" && CAPTION_RAIL_DIALS.has(field);
  if (target === "speed_change") return field === "factor" && typeof value === "number";
  return ["create_audio", "create_visual", "create_text", "create_shape", "opening_sequence_edit", "patch", "props"].includes(target)
    && ((typeof value === "number" && Object.hasOwn(PROPOSAL_TUNABLE_FIELDS, field))
      || (typeof value === "string" && ["props", "create_visual", "create_shape"].includes(target) && PROPOSAL_STRING_CONTROL_FIELDS.includes(field))
      || (typeof value === "string" && target === "create_text" && Object.hasOwn(PLACE_CHOICES, field))
      || (Array.isArray(value) && target === "props" && PROPOSAL_LIST_CONTROL_FIELDS.includes(field)));
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
