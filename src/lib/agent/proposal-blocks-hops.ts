import { z } from "zod";
import { blockElementId, framesToSeconds, secondsToFrames, type BlockContext, type BlockDefinition, type BlockOperation, type ResolvedBlockSettings } from "./proposal-block-kit";

/**
 * The first blocks (docs/architecture/proposal-building-blocks.md, "First worked example"): a live
 * hold of real footage, an alpha clip keyframed between two placements, and a sequence that orders
 * holds and moves across stops. Named for what they do; any effect may use them.
 *
 * Units: `media_offset_x/y` are half-canvas units (1 moves the picture half the frame) and
 * `media_scale` scales about the frame centre, so a frame point p lands at 0.5 + s·(p − 0.5) + offset/2.
 * Blur is in pixels at 1080 width and is sized from the subject's height so a distant subject is
 * not erased by a blur meant for a close one.
 */

const finite = z.number().finite();
const fraction = finite.min(0).max(1);
const sourceSchema = z.object({
  source_url: z.string().min(1).max(2048),
  source_duration_seconds: finite.gt(0),
}).strict();
const cutoutSchema = sourceSchema.extend({
  source_offset_seconds: finite.min(0).default(0).describe("Where the cut-out file starts on the footage's clock: cut-out time = footage time − this."),
});
const laneSchema = z.object({ lane_key: z.string().min(1).max(128).regex(/^[a-z0-9_:-]+$/), lane_index: z.number().int().min(0) }).strict();
const placementSchema = z.object({
  scale: finite.min(0.1).max(3).default(1),
  offset_x: finite.min(-2).max(2).default(0),
  offset_y: finite.min(-2).max(2).default(0),
}).strict();
const subjectBoxSchema = z.object({
  cx: fraction.describe("Subject centre x as a fraction of the frame width."),
  cy: fraction.describe("Subject centre y as a fraction of the frame height."),
  h: finite.min(0.02).max(1).describe("Subject height as a fraction of the frame height."),
}).strict();
const colorGradeSchema = z.record(z.string(), z.unknown()).optional().describe("A colour grade every produced clip copies (the footage's existing grade).");

const EASE_CHOICES = [
  { value: "default", label: "Natural" },
  { value: "linear", label: "Linear" },
  { value: "ease_in", label: "Ease in" },
  { value: "ease_out", label: "Ease out" },
] as const;
const DIRECTION_CHOICES = [
  { value: "auto", label: "Direction of travel" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "up", label: "Up" },
  { value: "down", label: "Down" },
] as const;

type Ease = "linear" | "easeIn" | "easeOut" | "easeInOut" | "hold";
type Key = { t: number; v: number; ease?: Ease };
const track = (span: number, from: number, to: number, ease: Ease): Key[] => [{ t: 0, v: round(from), ease }, { t: span, v: round(to) }];
const round = (value: number) => Math.round(value * 1e6) / 1e6;
const num = (settings: ResolvedBlockSettings, field: string, index?: number) => {
  const value = settings[field];
  const picked = Array.isArray(value) ? value[index ?? 0] : value;
  if (typeof picked !== "number") throw new Error(`Setting ${field} must be a number`);
  return picked;
};
const str = (settings: ResolvedBlockSettings, field: string, index?: number) => {
  const value = settings[field];
  const picked = Array.isArray(value) ? value[index ?? 0] : value;
  if (typeof picked !== "string") throw new Error(`Setting ${field} must be a choice`);
  return picked;
};

// ---------------------------------------------------------------------------------------------
// live_hold

const liveHoldInputs = z.object({
  source: sourceSchema,
  lane: laneSchema,
  timeline_start: finite.min(0),
  settle_seconds: finite.min(0).describe("Footage time where the subject comes to rest."),
  takeoff_seconds: finite.min(0).describe("Footage time of the first frame of the subject's next move; the hold ends here."),
  title: z.string().min(1).max(500).optional(),
  volume: finite.min(0).max(1).default(0),
  color_grade: colorGradeSchema,
}).strict().refine(inputs => inputs.takeoff_seconds > inputs.settle_seconds, "takeoff_seconds must follow settle_seconds")
  .refine(inputs => inputs.takeoff_seconds <= inputs.source.source_duration_seconds + 1e-6, "takeoff_seconds must be inside the footage");
type LiveHoldInputs = z.infer<typeof liveHoldInputs>;

const MIN_HOLD_SECONDS = 0.1;

/** A window of real footage ending on the takeoff frame; the hold dial reaches back from it. */
function compileLiveHold(inputs: LiveHoldInputs, hold: number, speed: number, context: BlockContext, role: string, index: number): BlockOperation {
  const frames = Math.max(1, secondsToFrames(hold, context.fps));
  const span = framesToSeconds(frames, context.fps);
  const sourceStart = round(inputs.takeoff_seconds - span * speed);
  if (sourceStart < -1e-6) throw new Error(`a ${span}s hold at ${speed}× reaches ${round(-sourceStart)}s before the footage starts`);
  return {
    element_id: blockElementId(context, role, index),
    block_ref: { block_id: context.block_id, role, index },
    create_visual: {
      type: "video_clip", source_url: inputs.source.source_url, title: inputs.title ?? "Live hold",
      timeline_start: inputs.timeline_start, source_duration_seconds: inputs.source.source_duration_seconds,
      source_start_seconds: Math.max(0, sourceStart), source_end_seconds: round(inputs.takeoff_seconds), playback_rate: speed,
      lane_key: inputs.lane.lane_key, lane_index: inputs.lane.lane_index, volume: inputs.volume,
      ...(inputs.color_grade ? { color_grade: inputs.color_grade } : {}),
    },
  };
}

export const liveHoldBlock: BlockDefinition<LiveHoldInputs> = {
  kind: "live_hold", version: 1, label: "Live hold",
  description: "A window of real footage between a measured settle frame and the takeoff frame. The hold dial keeps the takeoff fixed and reaches back; speed slows the footage inside the same timeline length.",
  inputs: liveHoldInputs,
  settings: {
    hold_seconds: { kind: "number", label: "Hold", unit: "seconds", min: MIN_HOLD_SECONDS, max: 3, step: 0.01, max_from_default: true, tier: "main",
      default: inputs => round(inputs.takeoff_seconds - inputs.settle_seconds), description: "Time on screen before the subject moves, in timeline seconds." },
    speed: { kind: "number", label: "Speed", unit: "factor", min: 0.25, max: 1, step: 0.05, default: 1, off: 1, tier: "main", description: "Playback speed of the footage during the hold; 1 is real time." },
  },
  instances: () => ({}),
  compile: (inputs, settings, context) => [compileLiveHold(inputs, num(settings, "hold_seconds"), num(settings, "speed"), context, "hold", 0)],
};

// ---------------------------------------------------------------------------------------------
// keyframed_move

const keyframedMoveInputs = z.object({
  cutout: cutoutSchema,
  lane: laneSchema,
  timeline_start: finite.min(0),
  source_start_seconds: finite.min(0).describe("Footage time of the move's first frame."),
  subject_height: finite.min(0.02).max(1).describe("Subject height as a fraction of the frame, for sizing blur."),
  from: placementSchema.default({ scale: 1, offset_x: 0, offset_y: 0 }),
  to: placementSchema.default({ scale: 1, offset_x: 0, offset_y: 0 }),
  far_end: z.enum(["start", "end"]).describe("Which end is away from the subject's resting place: it fades and carries the blur peak. An exit's far end is `end`; an entrance's is `start`."),
  blur_axis: z.enum(["x", "y"]).default("x"),
  title: z.string().min(1).max(500).optional(),
  volume: finite.min(0).max(1).default(0),
  color_grade: colorGradeSchema,
}).strict();
type KeyframedMoveInputs = z.infer<typeof keyframedMoveInputs>;

type MoveSettings = { frames: number; travel_percent: number; blur_percent: number; fade_percent: number; ease: string };

/** An alpha clip moving between two placements over a few frames, with blur and fade. */
function compileKeyframedMove(inputs: KeyframedMoveInputs, settings: MoveSettings, context: BlockContext, role: string, index: number): BlockOperation {
  const frames = Math.max(2, Math.round(settings.frames));
  const clip = framesToSeconds(frames, context.fps);
  // Keys sit on real frames: the last on the clip's last frame.
  const span = framesToSeconds(frames - 1, context.fps);
  const sourceStart = round(inputs.source_start_seconds - inputs.cutout.source_offset_seconds);
  const sourceEnd = round(sourceStart + clip);
  if (sourceStart < -1e-6 || sourceEnd > inputs.cutout.source_duration_seconds + 1e-6) {
    throw new Error(`needs cut-out frames from ${round(sourceStart)}s to ${sourceEnd}s but the cut-out covers 0 to ${inputs.cutout.source_duration_seconds}s`);
  }
  const travel = settings.travel_percent / 100;
  // Overshoot (travel past 100%) stays inside the placement the renderer accepts.
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const lerp = (place: { scale: number; offset_x: number; offset_y: number }) => ({ scale: clamp(1 + (place.scale - 1) * travel, 0.1, 3), offset_x: clamp(place.offset_x * travel, -2, 2), offset_y: clamp(place.offset_y * travel, -2, 2) });
  const from = lerp(inputs.from), to = lerp(inputs.to);
  const ease: Ease = settings.ease === "linear" ? "linear" : settings.ease === "ease_in" ? "easeIn" : settings.ease === "ease_out" ? "easeOut" : inputs.far_end === "end" ? "easeIn" : "easeOut";
  const faded = 1 - settings.fade_percent / 100;
  const blur = Math.min(1080, round(settings.blur_percent / 100 * inputs.subject_height * 1080));
  const far = inputs.far_end === "end";
  const blurTrack = (axis: "x" | "y") => inputs.blur_axis === axis ? track(span, far ? 0 : blur, far ? blur : 0, ease) : track(span, 0, 0, ease);
  return {
    element_id: blockElementId(context, role, index),
    block_ref: { block_id: context.block_id, role, index },
    create_visual: {
      type: "video_clip", source_url: inputs.cutout.source_url, title: inputs.title ?? "Streak", has_alpha: true,
      timeline_start: inputs.timeline_start, source_duration_seconds: inputs.cutout.source_duration_seconds,
      source_start_seconds: Math.max(0, sourceStart), source_end_seconds: sourceEnd,
      lane_key: inputs.lane.lane_key, lane_index: inputs.lane.lane_index, volume: inputs.volume,
      directional_blur_x: inputs.blur_axis === "x" ? blur : 0, directional_blur_y: inputs.blur_axis === "y" ? blur : 0,
      transition_keyframes: {
        media_offset_x: track(span, from.offset_x, to.offset_x, ease),
        media_offset_y: track(span, from.offset_y, to.offset_y, ease),
        media_scale: track(span, from.scale, to.scale, ease),
        media_opacity: track(span, far ? 1 : faded, far ? faded : 1, ease),
        directional_blur_x: blurTrack("x"),
        directional_blur_y: blurTrack("y"),
      },
      ...(inputs.color_grade ? { color_grade: inputs.color_grade } : {}),
    },
  };
}

const moveSettings = (prefix = ""): BlockDefinition<KeyframedMoveInputs>["settings"] => ({
  frames: { kind: "number", label: `${prefix}Streak length`, unit: "frames", min: 2, max: 12, step: 1, default: 3, tier: "main", description: "Frames the move takes." },
  travel_percent: { kind: "number", label: `${prefix}Travel`, unit: "percent", min: 0, max: 150, step: 1, default: 100, off: 0, tier: "main", description: "How far along the authored move the clip goes; 0 stays put." },
  blur_percent: { kind: "number", label: `${prefix}Blur`, unit: "percent", min: 0, max: 100, step: 1, default: 8, off: 0, tier: "main", description: "Peak blur as a share of the subject's height; 0 is sharp. Above about 15% a small subject smears away." },
  fade_percent: { kind: "number", label: `${prefix}Fade during streak`, unit: "percent", min: 0, max: 100, step: 1, default: 60, off: 0, tier: "advanced", description: "How much the clip fades at its far end; 0 stays solid." },
  ease: { kind: "choice", label: `${prefix}Ease`, choices: EASE_CHOICES, default: "default", tier: "advanced", description: "Natural eases in out of a stop and out into one." },
});

export const keyframedMoveBlock: BlockDefinition<KeyframedMoveInputs> = {
  kind: "keyframed_move", version: 1, label: "Streak",
  description: "An alpha clip (a cut-out) moving between two placements over a few frames, with directional blur sized to the subject and a fade at its far end.",
  inputs: keyframedMoveInputs,
  settings: moveSettings(),
  instances: () => ({}),
  compile: (inputs, settings, context) => [compileKeyframedMove(inputs, {
    frames: num(settings, "frames"), travel_percent: num(settings, "travel_percent"), blur_percent: num(settings, "blur_percent"),
    fade_percent: num(settings, "fade_percent"), ease: str(settings, "ease"),
  }, context, "move", 0)],
};

// ---------------------------------------------------------------------------------------------
// hop_sequence

const stopSchema = z.object({
  label: z.string().trim().min(1).max(120).describe("The stop's name on the card: a place or thing the creator can see (\"the swings\", \"path bend\"), never a mark number, which they may have cleared.")
    .refine(label => !/^\s*(mark|stop|pose)\s*#?\d+\s*$/i.test(label), "name the stop by a place the creator can see, not a mark number"),
  cutout: cutoutSchema.describe("The stop's prepared cut-out (cutout_status), covering its entrance streak (and its exit streak unless exit_cutout is given) at every streak length up to 12 frames."),
  exit_cutout: cutoutSchema.optional().describe("A separate cut-out covering the exit streak from the takeoff frame, when one window would be too long for preview parity."),
  subject: subjectBoxSchema.describe("The subject's box at the stop, measured from the cut-out's mask."),
  settle_seconds: finite.min(0).describe("Footage time where the subject comes to rest at this stop."),
  takeoff_seconds: finite.min(0).describe("Footage time of the subject's first step away from this stop."),
}).strict().refine(stop => stop.takeoff_seconds > stop.settle_seconds, "takeoff_seconds must follow settle_seconds");

const hopSequenceInputs = z.object({
  source: sourceSchema.describe("The locked-off performance footage."),
  empty_set: z.object({
    type: z.enum(["video_clip", "still"]).default("video_clip"),
    source_url: z.string().min(1).max(2048),
    source_duration_seconds: finite.gt(0).optional(),
    source_start_seconds: finite.min(0).default(0),
  }).strict().describe("The same framing with nobody in it, shown under the whole sequence."),
  stops: z.array(stopSchema).min(2).max(12),
  line_end_seconds: finite.gt(0).optional().describe("When the creator speaks at the last stop: the footage time the line ends. The last stop then plays live with sound to here."),
  first_entrance: z.boolean().default(false).describe("The first stop is entered from off frame (the sequence opens on the empty set) instead of opening live."),
  lanes: z.object({ base: laneSchema, top: laneSchema }).strict().default({ base: { lane_key: "visual_0", lane_index: 0 }, top: { lane_key: "visual_1", lane_index: 1 } }),
  lane_order_keys: z.array(z.string().min(1).max(128).regex(/^[a-z0-9_:-]+$/)).min(1).max(64).optional().describe("Complete top-first lane order, when the sequence registers a new lane."),
  remove_element_ids: z.array(z.string().uuid()).max(32).default([]).describe("Existing clips the sequence replaces (the full walk)."),
  timeline_start: finite.min(0).default(0),
  color_grade: colorGradeSchema,
}).strict().superRefine((inputs, ctx) => {
  for (const [index, stop] of inputs.stops.entries()) {
    if (stop.takeoff_seconds > inputs.source.source_duration_seconds + 1e-6) ctx.addIssue({ code: "custom", path: ["stops", index, "takeoff_seconds"], message: "must be inside the footage" });
  }
  const last = inputs.stops.at(-1)!;
  if (inputs.line_end_seconds !== undefined && (inputs.line_end_seconds <= last.settle_seconds || inputs.line_end_seconds > inputs.source.source_duration_seconds + 1e-6)) {
    ctx.addIssue({ code: "custom", path: ["line_end_seconds"], message: "must follow the last stop's settle and stay inside the footage" });
  }
  if (inputs.empty_set.type === "video_clip" && inputs.empty_set.source_duration_seconds === undefined) {
    ctx.addIssue({ code: "custom", path: ["empty_set", "source_duration_seconds"], message: "a video empty set needs its source duration" });
  }
});
type HopSequenceInputs = z.infer<typeof hopSequenceInputs>;

type Direction = "left" | "right" | "up" | "down";
type Box = { cx: number; cy: number; h: number };

/** Which way the subject travels between two boxes: the dominant axis. */
function travelDirection(from: Box, to: Box): Direction {
  const dx = to.cx - from.cx, dy = to.cy - from.cy;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "down" : "up");
}
const opposite: Record<Direction, Direction> = { left: "right", right: "left", up: "down", down: "up" };
const axisOf = (direction: Direction) => direction === "left" || direction === "right" ? "x" as const : "y" as const;

/** The placement that moves a subject fully to the frame edge in `direction` (travel 100%). */
function edgePlacement(box: Box, direction: Direction) {
  const distance = direction === "right" ? 1 - box.cx : direction === "left" ? box.cx : direction === "down" ? 1 - box.cy : box.cy;
  const sign = direction === "right" || direction === "down" ? 1 : -1;
  return axisOf(direction) === "x" ? { scale: 1, offset_x: 2 * distance * sign, offset_y: 0 } : { scale: 1, offset_x: 0, offset_y: 2 * distance * sign };
}

/** The placement that puts `box` where the midpoint between two stops' boxes would be. */
function midpointPlacement(box: Box, a: Box, b: Box) {
  const cx = (a.cx + b.cx) / 2, cy = (a.cy + b.cy) / 2, h = Math.sqrt(a.h * b.h);
  const scale = h / box.h;
  return { scale, offset_x: 2 * (cx - 0.5 - scale * (box.cx - 0.5)), offset_y: 2 * (cy - 0.5 - scale * (box.cy - 0.5)) };
}

/** Stops whose hold the creator tunes: a closing line fixes the last stop's length. */
const heldStops = (inputs: HopSequenceInputs) => inputs.line_end_seconds === undefined ? inputs.stops : inputs.stops.slice(0, -1);
const hopLabels = (inputs: HopSequenceInputs) => [
  ...(inputs.first_entrance ? [`Into ${inputs.stops[0]!.label}`] : []),
  ...inputs.stops.slice(0, -1).map((stop, index) => `${stop.label} → ${inputs.stops[index + 1]!.label}`),
];

function compileHopSequence(inputs: HopSequenceInputs, settings: ResolvedBlockSettings, context: BlockContext): BlockOperation[] {
  const fps = context.fps;
  const variant = str(settings, "variant");
  const beatFrames = Math.round(num(settings, "empty_beat_frames"));
  const speed = num(settings, "speed_at_stops");
  // Each hop's streak length and blur are its own dials; travel, fade and ease are shared.
  const move = (hop: number, role: string, index: number, timelineFrame: number, stop: HopSequenceInputs["stops"][number], sourceStart: number,
    place: { scale: number; offset_x: number; offset_y: number }, farEnd: "start" | "end", axis: "x" | "y", title: string) =>
    compileKeyframedMove(keyframedMoveInputs.parse({
      cutout: stop.cutout, lane: inputs.lanes.top, timeline_start: framesToSeconds(timelineFrame, fps), source_start_seconds: sourceStart,
      subject_height: stop.subject.h, from: farEnd === "start" ? place : {}, to: farEnd === "end" ? place : {}, far_end: farEnd, blur_axis: axis, title,
      ...(inputs.color_grade ? { color_grade: inputs.color_grade } : {}),
    }), { frames: Math.round(num(settings, "streak_frames", hop)), travel_percent: num(settings, "travel_percent"), blur_percent: num(settings, "blur_percent", hop),
      fade_percent: num(settings, "fade_percent"), ease: str(settings, "ease") }, context, role, index);
  const streakFramesOf = (hop: number) => Math.round(num(settings, "streak_frames", hop));
  const direction = (hop: number, fallback: Direction): Direction => {
    const chosen = str(settings, "direction", hop);
    return chosen === "auto" ? fallback : chosen as Direction;
  };
  const operations: BlockOperation[] = [];
  if (inputs.lane_order_keys) operations.push({ element_id: blockElementId(context, "lane_order"), block_ref: { block_id: context.block_id, role: "lane_order", index: 0 }, set_lane_order: { lane_order_keys: inputs.lane_order_keys } });
  for (const [index, id] of inputs.remove_element_ids.entries()) {
    operations.push({ element_id: id, block_ref: { block_id: context.block_id, role: "remove", index }, remove_visual: { reason: "The footage becomes the hops between the stops, built from the same take." } });
  }
  const clips: BlockOperation[] = [];
  let frame = secondsToFrames(inputs.timeline_start, fps);
  let hop = 0;
  const stops = inputs.stops;
  const held = heldStops(inputs);
  for (const [index, stop] of stops.entries()) {
    const isLast = index === stops.length - 1;
    const label = (text: string) => `${text} (${stop.label})`;
    if (index === 0 && inputs.first_entrance) {
      const from = direction(hop, stop.subject.cx < 0.5 ? "left" : "right");
      const streakFrames = streakFramesOf(hop);
      try {
        clips.push(move(hop, "enter", index, frame, stop, stop.settle_seconds - framesToSeconds(streakFrames, fps), edgePlacement(stop.subject, from), "start", axisOf(from), label("Streak in")));
      } catch (error) { throw new Error(`${stop.label} entrance ${String((error as Error).message)}`); }
      frame += streakFrames; hop++;
    }
    if (isLast && inputs.line_end_seconds !== undefined) {
      clips.push({
        element_id: blockElementId(context, "line"), block_ref: { block_id: context.block_id, role: "line", index: 0 },
        create_visual: {
          type: "video_clip", source_url: inputs.source.source_url, title: label("Your line to camera"), timeline_start: framesToSeconds(frame, fps),
          source_duration_seconds: inputs.source.source_duration_seconds, source_start_seconds: round(stop.settle_seconds), source_end_seconds: round(inputs.line_end_seconds),
          lane_key: inputs.lanes.top.lane_key, lane_index: inputs.lanes.top.lane_index, volume: 1,
          ...(inputs.color_grade ? { color_grade: inputs.color_grade } : {}),
        },
      });
      frame += Math.max(1, secondsToFrames(inputs.line_end_seconds - stop.settle_seconds, fps));
      break;
    }
    const holdIndex = held.indexOf(stop);
    const hold = num(settings, "hold_seconds", holdIndex);
    try {
      clips.push(compileLiveHold(liveHoldInputs.parse({ source: inputs.source, lane: inputs.lanes.top, timeline_start: framesToSeconds(frame, fps), settle_seconds: stop.settle_seconds,
        takeoff_seconds: stop.takeoff_seconds, title: label("You at the stop"), ...(inputs.color_grade ? { color_grade: inputs.color_grade } : {}) }), hold, speed, context, "hold", index));
    } catch (error) { throw new Error(`${stop.label} hold: ${String((error as Error).message)}`); }
    frame += Math.max(1, secondsToFrames(hold, fps));
    if (isLast) break;
    const next = stops[index + 1]!;
    const travel = travelDirection(stop.subject, next.subject);
    const chosen = direction(hop, travel);
    const axis = axisOf(variant === "mark_to_mark" ? travel : chosen);
    const streakFrames = streakFramesOf(hop);
    try {
      const exitPlace = variant === "mark_to_mark" ? midpointPlacement(stop.subject, stop.subject, next.subject) : edgePlacement(stop.subject, chosen);
      clips.push(move(hop, "exit", index, frame, { ...stop, cutout: stop.exit_cutout ?? stop.cutout }, stop.takeoff_seconds, exitPlace, "end", axis, label("Streak away")));
    } catch (error) { throw new Error(`${stop.label} exit ${String((error as Error).message)}`); }
    frame += streakFrames + beatFrames;
    try {
      const enterPlace = variant === "mark_to_mark" ? midpointPlacement(next.subject, stop.subject, next.subject) : edgePlacement(next.subject, opposite[chosen]);
      clips.push(move(hop, "enter", index + 1, frame, next, next.settle_seconds - framesToSeconds(streakFrames, fps), enterPlace, "start", axis, `Streak in (${next.label})`));
    } catch (error) { throw new Error(`${next.label} entrance ${String((error as Error).message)}`); }
    frame += streakFrames; hop++;
  }
  const totalSeconds = framesToSeconds(frame - secondsToFrames(inputs.timeline_start, fps), fps);
  const emptySet = inputs.empty_set;
  const emptyBase = { element_id: blockElementId(context, "empty_set"), block_ref: { block_id: context.block_id, role: "empty_set", index: 0 } };
  if (emptySet.type === "still") {
    operations.push({ ...emptyBase, create_visual: { type: "still", source_url: emptySet.source_url, title: "Empty set", timeline_start: framesToSeconds(secondsToFrames(inputs.timeline_start, fps), fps),
      duration_seconds: totalSeconds, lane_key: inputs.lanes.base.lane_key, lane_index: inputs.lanes.base.lane_index, ...(inputs.color_grade ? { color_grade: inputs.color_grade } : {}) } });
  } else {
    // A short window of the empty frame covers the whole sequence slowed down; the slowest rate that fits.
    const available = emptySet.source_duration_seconds! - emptySet.source_start_seconds;
    const rate = [0.25, 0.5, 1].find(candidate => totalSeconds * candidate <= available + 1e-6);
    if (rate === undefined) throw new Error(`the empty set has ${round(available)}s of footage but the sequence needs ${totalSeconds}s even at real speed`);
    operations.push({ ...emptyBase, create_visual: { type: "video_clip", source_url: emptySet.source_url, title: "Empty set", timeline_start: framesToSeconds(secondsToFrames(inputs.timeline_start, fps), fps),
      source_duration_seconds: emptySet.source_duration_seconds!, source_start_seconds: emptySet.source_start_seconds, source_end_seconds: round(emptySet.source_start_seconds + totalSeconds * rate),
      playback_rate: rate, volume: 0, lane_key: inputs.lanes.base.lane_key, lane_index: inputs.lanes.base.lane_index, ...(inputs.color_grade ? { color_grade: inputs.color_grade } : {}) } });
  }
  return [...operations, ...clips];
}

export const hopSequenceBlock: BlockDefinition<HopSequenceInputs> = {
  kind: "hop_sequence", version: 1, label: "Speed hops",
  description: "Orders live holds and streaks across measured stops on locked-off footage (the Speed Entrance & Exit effect) and owns their shared settings. Each stop holds on real footage from its settle to its takeoff frame; between stops the cut-out streaks away and back in over a few frames with blur and fade while the empty set shows underneath. Out and in streaks toward the frame edge; Mark to mark streaks straight to the next stop's place, swapping cut-outs at the midpoint.",
  inputs: hopSequenceInputs,
  settings: {
    variant: { kind: "choice", label: "Variant", choices: [{ value: "out_and_in", label: "Out and in" }, { value: "mark_to_mark", label: "Mark to mark" }], default: "out_and_in", tier: "main" },
    streak_frames: { kind: "number", label: "Streak length", unit: "frames", min: 2, max: 12, step: 1, default: 3, tier: "main", per: "hop", description: "Frames this hop's streaks take." },
    empty_beat_frames: { kind: "number", label: "Empty beat", unit: "frames", min: 0, max: 12, step: 1, off: 0, tier: "main",
      default: (_inputs, _index, settings) => settings.variant === "mark_to_mark" ? 0 : 4, description: "Frames of empty set between a streak away and the next streak in." },
    travel_percent: { kind: "number", label: "Travel", unit: "percent", min: 0, max: 150, step: 1, off: 0, tier: "main",
      default: (_inputs, _index, settings) => settings.variant === "mark_to_mark" ? 100 : 15, description: "Out and in: share of the distance to the frame edge. Mark to mark: share of the way to the next stop's place. 0 is no move." },
    blur_percent: { kind: "number", label: "Blur", unit: "percent", min: 0, max: 100, step: 1, default: 8, off: 0, tier: "main", per: "hop", description: "Peak streak blur for this hop as a share of the subject's height; above about 15% a small subject smears away." },
    fade_percent: { kind: "number", label: "Fade during streak", unit: "percent", min: 0, max: 100, step: 1, default: 60, off: 0, tier: "advanced" },
    hold_seconds: { kind: "number", label: "Hold", unit: "seconds", min: MIN_HOLD_SECONDS, max: 3, step: 0.01, max_from_default: true, tier: "main", per: "hold",
      default: (inputs, index) => { const stop = heldStops(inputs)[index]!; return round(stop.takeoff_seconds - stop.settle_seconds); }, description: "Time on screen at the stop, in timeline seconds; the takeoff stays fixed." },
    speed_at_stops: { kind: "number", label: "Speed at stops", unit: "factor", min: 0.25, max: 1, step: 0.05, default: 1, off: 1, tier: "advanced", description: "Playback speed during every hold; the hold's timeline length stays, so nothing later moves." },
    direction: { kind: "choice", label: "Leaves toward", choices: DIRECTION_CHOICES, default: "auto", tier: "advanced", per: "hop", first_main: true, description: "Out and in: the edge the subject streaks toward (and the next entrance comes from the other side). For an opening entrance: the edge it enters from." },
    ease: { kind: "choice", label: "Ease", choices: EASE_CHOICES, default: "default", tier: "advanced" },
  },
  instances: inputs => ({ hold: heldStops(inputs).map(stop => stop.label), hop: hopLabels(inputs) }),
  // Time order: what the whole run shares, then each hop with the hold that follows it.
  sections: inputs => {
    const held = heldStops(inputs);
    const holdField = (stop: HopSequenceInputs["stops"][number]) => { const index = held.indexOf(stop); return index >= 0 ? [`hold_seconds.${index}`] : []; };
    const sections = [{ label: "Every hop", fields: ["variant", "travel_percent", "empty_beat_frames", "speed_at_stops", "fade_percent", "ease"] }];
    let hop = 0;
    if (!inputs.first_entrance) sections.push({ label: `Opening at ${inputs.stops[0]!.label}`, fields: holdField(inputs.stops[0]!) });
    else sections.push({ label: `Into ${inputs.stops[0]!.label}`, fields: [`streak_frames.${hop}`, `blur_percent.${hop}`, `direction.${hop}`, ...holdField(inputs.stops[0]!)] }), hop++;
    for (let index = 0; index < inputs.stops.length - 1; index++, hop++) {
      sections.push({ label: `${inputs.stops[index]!.label} → ${inputs.stops[index + 1]!.label}`, fields: [`streak_frames.${hop}`, `blur_percent.${hop}`, `direction.${hop}`, ...holdField(inputs.stops[index + 1]!)] });
    }
    return sections;
  },
  compile: compileHopSequence,
};
