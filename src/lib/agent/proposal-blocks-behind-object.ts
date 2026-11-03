import { z } from "zod";
import { subjectWindowMaskSchema } from "../timeline/subject-window";
import { blockElementId, framesToSeconds, secondsToFrames, type BlockDefinition, type BlockOperation } from "./proposal-block-kit";

const finite = z.number().finite();
const laneKey = z.string().regex(/^[a-z0-9_:-]{1,128}$/);
const lane = z.object({ lane_key: laneKey, lane_index: finite.int().min(0) }).strict();
const sha = z.string().regex(/^[0-9a-f]{64}$/);
const inset = z.array(finite.min(0).max(.9)).length(4);
const SPEED = { min: .5, max: 3 } as const;
const inputsSchema = z.object({
  object_take: z.object({
    source_url: z.string().min(1).max(2048),
    source_duration_seconds: finite.positive(),
    source_start_seconds: finite.min(0).default(0),
  }).strict().describe("The take whose object the performer vanishes behind (the cup that splashes). Plays uncut underneath from source_start_seconds for duration_seconds; its object's cut-out stands in front of the performer, and it shows whole after the vanish. Leave source handles for the timing dial."),
  duration_seconds: finite.positive().describe("Length of the object-take window: the performance plus what plays after the vanish."),
  performance: z.object({
    source_url: z.string().min(1).max(2048),
    source_duration_seconds: finite.positive(),
  }).strict().describe("A take filmed from the same locked spot in which the performer moves behind where the object stands."),
  pieces: z.array(z.object({
    source_start_seconds: finite.min(0),
    source_end_seconds: finite.positive(),
    speed: finite.min(SPEED.min).max(SPEED.max).default(1),
    title: z.string().min(1).max(120).optional(),
  }).strict()).min(1).max(4).describe("The performance as back-to-back pieces from the block's start, each a performance-take window at its own speed (Cup Jump: 3.5-4.6 s at 1x, then 4.6-5.0 s at 1.5x). The vanish is where the last piece ends. Separate pieces, not one clip with speed steps: those break the card's dials."),
  band_inset: inset.default([0, 0, 0, 0]).describe("The part of the performance frame that shows, as mask edges [top, right, bottom, left], 0 to 1 from each canvas edge. Below or beside it the object take's own ground shows, so the ground never changes at the cut (Cup Jump: [0, 0, 0.4, 0], the top 60%)."),
  object_mask: subjectWindowMaskSchema.describe("The cut-out of the object, from cutout_prepare on the OBJECT take: copy cutout_status grid_matte_mask. It must cover every object-take second the performance shows over."),
  cutout_id: z.string().min(1).max(128).optional().describe("The cut-out receipt id the mask came from, for the card's record."),
  sound: z.object({
    source_url: z.string().min(1).max(2048),
    source_duration_seconds: finite.positive(),
    source_sha256: sha.optional(),
    source_start_seconds: finite.min(0).default(0),
    source_end_seconds: finite.positive(),
    offset_seconds: finite.min(-1).max(1).default(0).describe("Where the sound starts against the vanish (negative = before). Cup Jump: one frame before."),
    fade_in_seconds: finite.min(0).max(2).default(0),
    fade_out_seconds: finite.min(0).max(2).default(0),
  }).strict().optional().describe("A sound effect on the vanish (the splash). It follows the last piece, so speed and timing dials carry it."),
  titles: z.object({ object_take: z.string().min(1).max(120), sound: z.string().min(1).max(120) }).partial().strict().default({})
    .describe("Clip names the creator sees, e.g. \"Cup splash take\"; piece names go on each piece."),
  timeline_start: finite.min(0).default(0),
  lanes: z.object({ object_take: lane, pieces: z.array(lane).min(1).max(4), sound: lane }).partial().strict().default({})
    .describe("Defaults: object take visual_0, pieces visual_1 upward, sound sound_effect_0."),
  lane_order_keys: z.array(laneKey).min(2).max(64).describe("Complete top-first lane order with every piece lane above the object take's lane."),
  remove_element_ids: z.array(z.string().uuid()).max(32).default([]),
}).strict().superRefine((input, ctx) => {
  const [top, right, bottom, left] = input.band_inset as [number, number, number, number];
  if (top + bottom > .95 || left + right > .95) ctx.addIssue({ code: "custom", path: ["band_inset"], message: "The band must be at least 5% wide and high." });
  input.pieces.forEach((piece, index) => {
    if (piece.source_end_seconds <= piece.source_start_seconds) ctx.addIssue({ code: "custom", path: ["pieces", index, "source_end_seconds"], message: "A piece must end after it starts." });
    if (piece.source_end_seconds > input.performance.source_duration_seconds + 1e-6) ctx.addIssue({ code: "custom", path: ["pieces", index, "source_end_seconds"], message: "A piece runs past the end of the performance take." });
  });
  const lanes = resolveLanes(input);
  if (lanes.pieces.length !== input.pieces.length) ctx.addIssue({ code: "custom", path: ["lanes", "pieces"], message: "Give one lane per piece." });
  const order = input.lane_order_keys;
  const base = order.indexOf(lanes.object_take.lane_key);
  const keys = [lanes.object_take.lane_key, ...lanes.pieces.map(item => item.lane_key)];
  if (new Set(order).size !== order.length || new Set(keys).size !== keys.length || base < 0 || lanes.pieces.some(item => { const at = order.indexOf(item.lane_key); return at < 0 || at >= base; })) {
    ctx.addIssue({ code: "custom", path: ["lane_order_keys"], message: "Use distinct lanes with every piece above the object take in the complete top-first order." });
  }
  const sound = input.sound;
  if (sound && sound.source_end_seconds <= sound.source_start_seconds) ctx.addIssue({ code: "custom", path: ["sound", "source_end_seconds"], message: "Sound must end after it starts." });
  if (sound && sound.source_end_seconds > sound.source_duration_seconds + 1e-6) ctx.addIssue({ code: "custom", path: ["sound", "source_end_seconds"], message: "Sound window runs past the end of its source." });
});
type Inputs = z.infer<typeof inputsSchema>;

function resolveLanes(input: Pick<Inputs, "lanes" | "pieces">) {
  return {
    object_take: input.lanes.object_take ?? { lane_key: "visual_0", lane_index: 0 },
    pieces: input.lanes.pieces ?? input.pieces.map((_, index) => ({ lane_key: `visual_${index + 1}`, lane_index: index + 1 })),
    sound: input.lanes.sound ?? { lane_key: "sound_effect_0", lane_index: 0 },
  };
}
const pieceName = (input: Inputs, index: number) => input.pieces[index]?.title ?? `piece ${index + 1}`;
const bandDefault = (side: number) => (inputs: Inputs) => Math.round(inputs.band_inset[side]! * 1e4) / 100;

/**
 * The performer moves behind an object that comes from a second take filmed from the same spot,
 * and vanishes there: the object take plays uncut underneath, the performance shows as back-to-back
 * pieces in a band of the frame, held back wherever the object's cut-out is (native subject window,
 * parented to the object take), and the object take shows whole once the last piece ends. A sound
 * effect follows the vanish.
 */
export const behindObjectVanishBlock: BlockDefinition<Inputs> = {
  kind: "behind_object_vanish", version: 1, label: "Behind-object vanish",
  description: "Over a continuous take of an object (a cup), play a matched take of the performer moving behind where that object stands, as one to four back-to-back pieces with their own speeds, shown in a band of the frame and held back wherever the object take's cut-out is, so the performer vanishes behind the object and its take plays on whole (the splash); a sound effect lands on the vanish. Needs a locked camera, matched exposure, the move lined up behind the object and a cut-out of the object take covering the performance.",
  inputs: inputsSchema,
  settings: {
    performance_timing_frames: { kind: "number", label: "Your take timing", unit: "frames", min: -30, max: 30, step: 1, default: 0, tier: "main",
      description: "Move the performer's action later (positive) or earlier against the object take; every piece moves together. Clamped to the performance take's source." },
    speed: { kind: "number", label: "Speed", unit: "factor", min: SPEED.min, max: SPEED.max, step: .05, default: (inputs, index) => inputs.pieces[index]?.speed ?? 1, tier: "main", per: "piece",
      description: "Playback speed of this piece. The piece keeps its action; the vanish and its sound move with it." },
    object_timing_frames: { kind: "number", label: "Object take timing", unit: "frames", min: -30, max: 30, step: 1, default: 0, tier: "main",
      description: "Move the object take's action (the splash) later (positive) or earlier against the vanish. Clamped to its source and to the object's cut-out." },
    subject_expand: { kind: "number", label: "Expand edge", unit: "pixels", min: -20, max: 40, step: 1, default: 2, tier: "main",
      description: "Pixels at 1080 width the object's cut-out grows past its outline (negative shrinks it)." },
    subject_feather: { kind: "number", label: "Edge softness", unit: "pixels", min: 0, max: 30, step: 1, default: 2, tier: "main",
      description: "Soft edge of the object's cut-out in pixels at 1080 width." },
    window_strength: { kind: "number", label: "Window strength", unit: "percent", min: 0, max: 100, step: 1, default: 100, tier: "main",
      description: "How fully the object holds the performer back; 0 turns the cut-out off, a quick check that the object is in front." },
    sound_volume: { kind: "number", label: "Sound level", unit: "percent", min: 0, max: 200, step: 1, default: 100, off: 0, tier: "main", hidden: inputs => !inputs.sound },
    sound_timing_frames: { kind: "number", label: "Sound timing", unit: "frames", min: -30, max: 30, step: 1, tier: "main", hidden: inputs => !inputs.sound,
      default: inputs => Math.round((inputs.sound?.offset_seconds ?? 0) * 30),
      description: "Frames from the vanish to the sound's start (negative = before), at 30 fps." },
    band_top: { kind: "number", label: "Band top edge", unit: "percent", min: 0, max: 90, step: .1, default: bandDefault(0), tier: "advanced" },
    band_right: { kind: "number", label: "Band right edge", unit: "percent", min: 0, max: 90, step: .1, default: bandDefault(1), tier: "advanced" },
    band_bottom: { kind: "number", label: "Band bottom edge", unit: "percent", min: 0, max: 90, step: .1, default: bandDefault(2), tier: "advanced",
      description: "Inset from the bottom; where it meets the top edge, the top edge wins and the band stays 2% high." },
    band_left: { kind: "number", label: "Band left edge", unit: "percent", min: 0, max: 90, step: .1, default: bandDefault(3), tier: "advanced",
      description: "Inset from the left; where it meets the right edge, the right edge wins and the band stays 2% wide." },
    band_softness: { kind: "number", label: "Band edge softness", unit: "percent", min: 0, max: 10, step: .05, default: 1.5, tier: "advanced",
      description: "Feather of the band's edges, in percent of the frame." },
    object_volume: { kind: "number", label: "Object take sound", unit: "percent", min: 0, max: 200, step: 1, default: 0, tier: "advanced",
      description: "Off by default: the sound effect carries the moment." },
  },
  instances: inputs => ({ piece: inputs.pieces.map((_, index) => pieceName(inputs, index)) }),
  compile: (input, settings, context) => {
    const n = (key: string) => settings[key] as number;
    const speeds = settings.speed as number[];
    const fps = context.fps, frame = 1 / fps;
    const baseFrames = secondsToFrames(input.duration_seconds, fps);
    if (baseFrames < 2) throw new Error("The object-take window needs at least two output frames.");
    const duration = framesToSeconds(baseFrames, fps);
    const take = input.object_take, performance = input.performance;
    if (take.source_start_seconds + duration > take.source_duration_seconds + 1e-6) throw new Error(`Object take needs ${duration}s of source from ${take.source_start_seconds}s.`);
    // Positive timing moves the action later, so the performance reads earlier source; every piece
    // shifts together, unrounded at reset and clamped to the take.
    const first = Math.min(...input.pieces.map(piece => piece.source_start_seconds));
    const last = Math.max(...input.pieces.map(piece => piece.source_end_seconds));
    const earliest = -Math.floor((performance.source_duration_seconds - last) * fps + 1e-7), latest = Math.floor(first * fps + 1e-7);
    const shift = Math.max(earliest, Math.min(latest, Math.round(n("performance_timing_frames")))) / fps;
    // Each piece keeps its action and snaps to whole output frames at its speed; pieces that would
    // run past the object-take window shrink, keeping one frame each.
    let cursor = 0;
    const pieces = input.pieces.map((piece, index) => {
      const speed = speeds[index]!, start = piece.source_start_seconds - shift;
      const room = baseFrames - 1 - cursor - (input.pieces.length - 1 - index);
      const frames = Math.max(1, Math.min(room, Math.round((piece.source_end_seconds - piece.source_start_seconds) * fps / speed)));
      if (room < 1) throw new Error(`The object-take window is too short for ${input.pieces.length} pieces.`);
      const end = Math.min(performance.source_duration_seconds, start + framesToSeconds(frames, fps) * speed);
      const placed = { start, end, speed, at: framesToSeconds(cursor, fps) };
      cursor += frames;
      return placed;
    });
    const vanish = framesToSeconds(cursor, fps);
    const authoredVanish = framesToSeconds(input.pieces.reduce((sum, piece) => sum + Math.max(1, Math.round((piece.source_end_seconds - piece.source_start_seconds) * fps / piece.speed)), 0), fps);
    if (authoredVanish >= duration) throw new Error(`The performance (${input.pieces.length} pieces, ${authoredVanish}s) must end inside the ${duration}s object-take window.`);
    // Positive object timing moves the splash later, so the object take reads earlier source; it
    // stays inside its file and inside the object's cut-out while the performance shows over it.
    // The authored card must fit; a slower tuned performance only narrows the clamp.
    const mask = input.object_mask;
    const maskStart = mask.source_start_seconds, maskEnd = mask.source_start_seconds + mask.frame_count / mask.fps;
    const lowest = Math.max(0, maskStart), fileEnd = take.source_duration_seconds - duration;
    if (take.source_start_seconds < lowest - 1e-6 || take.source_start_seconds > Math.min(fileEnd, maskEnd - authoredVanish) + 1e-6) {
      throw new Error(`The object's cut-out covers ${maskStart}-${maskEnd}s; it must cover the object take from ${take.source_start_seconds}s for the ${authoredVanish}s the performance shows.`);
    }
    const highest = Math.max(lowest, Math.min(fileEnd, maskEnd - vanish));
    const objectEarliest = -Math.floor((fileEnd - take.source_start_seconds) * fps + 1e-7), objectLatest = Math.floor((take.source_start_seconds - lowest) * fps + 1e-7);
    const slipped = take.source_start_seconds - Math.max(objectEarliest, Math.min(objectLatest, Math.round(n("object_timing_frames")))) / fps;
    const objectSource = Math.min(slipped, highest);
    const start = framesToSeconds(secondsToFrames(input.timeline_start, fps), fps);
    const lanes = resolveLanes(input);
    const ref = (role: string, index = 0) => ({ element_id: blockElementId(context, role, index), block_ref: { block_id: context.block_id, role, index } });
    const operations: BlockOperation[] = input.remove_element_ids.map((id, index) => ({ element_id: id, block_ref: { block_id: context.block_id, role: "remove", index }, remove_visual: { reason: "Replace with the object take and the performance vanishing behind its object." } }));
    operations.push({ ...ref("lane_order"), set_lane_order: { lane_order_keys: input.lane_order_keys } });
    const base = ref("object_take");
    operations.push({ ...base, create_visual: {
      type: "video_clip", title: input.titles.object_take ?? "Object take", source_url: take.source_url,
      source_duration_seconds: take.source_duration_seconds, source_start_seconds: objectSource, source_end_seconds: objectSource + duration,
      timeline_start: start, volume: n("object_volume") / 100, ...lanes.object_take,
    } });
    // Opposite edges never cross: the top and right edges win, leaving a 2% sliver.
    const top = n("band_top") / 100, right = n("band_right") / 100;
    const bottom = Math.min(n("band_bottom") / 100, .98 - top), left = Math.min(n("band_left") / 100, .98 - right);
    const pieceRefs = pieces.map((piece, index) => {
      const item = ref("piece", index);
      operations.push({ ...item, create_visual: {
        type: "video_clip", title: pieceName(input, index), source_url: performance.source_url,
        source_duration_seconds: performance.source_duration_seconds, source_start_seconds: piece.start, source_end_seconds: piece.end,
        playback_rate: piece.speed, timeline_start: start + piece.at, volume: 0, ...lanes.pieces[index]!,
        mask_inset: [top, right, bottom, left], mask_feather: n("band_softness") / 100,
        subject_window_parent_id: base.element_id, subject_window_mask: mask, subject_window_mode: "outside",
        subject_window_expand: n("subject_expand"), subject_window_feather: n("subject_feather"), subject_window_strength: n("window_strength") / 100,
      } });
      return item;
    });
    const sound = input.sound;
    if (!sound) return operations;
    // The sound follows the last piece, landing its timing in frames from the vanish.
    const lastPiece = pieces[pieces.length - 1]!;
    const soundStart = Math.max(0, vanish + framesToSeconds(Math.round(n("sound_timing_frames") * fps / 30), fps));
    operations.push({ ...ref("sound"), create_audio: {
      type: "sound_effect", title: input.titles.sound ?? "Vanish sound", source_url: sound.source_url,
      ...(sound.source_sha256 ? { source_sha256: sound.source_sha256 } : {}),
      timeline_start: start + soundStart, source_duration_seconds: sound.source_duration_seconds,
      source_start_seconds: sound.source_start_seconds, source_end_seconds: sound.source_end_seconds, ...lanes.sound,
      volume: n("sound_volume") / 100, fade_in: sound.fade_in_seconds, fade_out: sound.fade_out_seconds, playback_rate: 1,
      follows_visual: { element_id: pieceRefs[pieceRefs.length - 1]!.element_id, offset_seconds: soundStart - lastPiece.at },
    } });
    return operations;
  },
};
