import { z } from "zod";
import { subjectWindowMaskSchema } from "../timeline/subject-window";
import { blockElementId, framesToSeconds, secondsToFrames, type BlockDefinition, type BlockOperation } from "./proposal-block-kit";

const finite = z.number().finite();
const laneKey = z.string().regex(/^[a-z0-9_:-]{1,128}$/);
const lane = z.object({ lane_key: laneKey, lane_index: finite.int().min(0) }).strict();
const DIRECTIONS = ["up", "down", "left", "right"] as const;
const inputsSchema = z.object({
  take: z.object({
    source_url: z.string().min(1).max(2048),
    source_duration_seconds: finite.positive(),
    source_start_seconds: finite.min(0).default(0),
  }).strict().describe("The locked take: plays from source_start_seconds (the run-up) to the freeze, then holds that frame. The same take must hold an empty frame (nobody, no shadow) for the patch."),
  freeze_seconds: finite.positive().describe("Take second of the frozen moment, where the cut-out leaves (Fly Like Superman: 6.406 s, feet just off the ground on the way up)."),
  hold_seconds: finite.positive().describe("How long the frozen frame stays after the freeze; the picture ends there (course demo 1.9 s)."),
  clean_frame_seconds: finite.min(0).describe("Take second of the empty frame shown where the subject was. Pick the one whose sky or background matches the freeze best (Fly Like Superman: 10.67 s; clouds drift)."),
  person_mask: subjectWindowMaskSchema.describe("The traced subject on the TAKE, from cutout_prepare (copy cutout_status grid_matte_mask). It must cover the freeze frame: the empty frame shows only inside this outline, so drifted sky never shows as a rectangle."),
  cutout_id: z.string().min(1).max(128).optional().describe("The cut-out receipt id the mask came from, for the card's record."),
  edge: z.object({ expand_px: finite.min(0).max(40).default(10), feather_px: finite.min(0).max(30).default(8) }).strict().default({ expand_px: 10, feather_px: 8 })
    .describe("How far the empty-frame patch grows past the outline and how soft its edge is (pixels at 1080 width). Grow it until no edge of the subject (cap, fist) is left at the freeze."),
  shadow: z.object({
    inset: z.tuple([finite.min(0).max(.98), finite.min(0).max(.98), finite.min(0).max(.98), finite.min(0).max(.98)]),
    feather: finite.min(0).max(.2).default(.02),
  }).strict().optional().describe("A rectangle of the same empty frame over the subject's ground shadow at the freeze, as mask edges [top, right, bottom, left] from each canvas edge (Fly Like Superman: [0.825, 0.49, 0.12, 0.22])."),
  cutout: z.object({
    source_url: z.string().min(1).max(2048),
    source_duration_seconds: finite.positive(),
    take_offset_seconds: finite.min(0).describe("Take second of the cut-out file's first frame."),
    window_seconds: finite.positive().max(10).optional().describe("Source seconds the flying clip plays from the freeze (it runs on off-screen). Never shorter than the flight needs at the set speed, so the speed dial can't run it out mid-flight."),
  }).strict().describe("A person cut-out (has alpha) of the take around the freeze, from cutout_prepare; the flying clip starts on the freeze frame."),
  flight: z.object({
    direction: z.enum(DIRECTIONS).default("up"),
    seconds: finite.positive().max(1).default(.4).describe("Time to leave the frame (course demo 0.4 s)."),
    distance: finite.min(1).max(2).default(1.9).describe("How far it moves, in half-canvas units (media_offset); 1.9 clears a 9:16 frame from a mid-frame start."),
    speed: finite.min(.25).max(1).default(.25).describe("Playback rate of the flying clip; slow keeps the pose nearly still while it moves."),
    blur_px: finite.min(0).max(100).default(70).describe("Peak directional blur along the flight at 1080 width. 70 gives a smooth streak one to two body heights long; 140 split into stripes."),
    blur_ramp_seconds: finite.min(0).max(1).default(.15).describe("Time for the blur to reach its peak."),
  }).strict().default({ direction: "up", seconds: .4, distance: 1.9, speed: .25, blur_px: 70, blur_ramp_seconds: .15 }),
  sounds: z.array(z.object({
    source_url: z.string().min(1).max(2048),
    source_duration_seconds: finite.positive(),
    source_sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    source_start_seconds: finite.min(0).default(0),
    source_end_seconds: finite.positive().optional(),
    offset_seconds: finite.min(-1).max(.5).default(0).describe("Seconds from the freeze to the sound's start (negative = before; course demo: whoosh -0.32, boom -0.16)."),
    volume: finite.min(0).max(2).default(1),
    fade_out: finite.min(0).max(2).default(0),
    end_with_picture: z.boolean().default(false).describe("Trim the sound to end where the picture ends (a long boom), instead of at source_end_seconds."),
    title: z.string().min(1).max(120).optional(),
  }).strict()).max(3).default([]).describe("Whoosh, boom and the like, timed from the freeze."),
  titles: z.object({ take: z.string().min(1).max(120), patch: z.string().min(1).max(120), shadow: z.string().min(1).max(120), flyer: z.string().min(1).max(120) }).partial().strict().default({}),
  timeline_start: finite.min(0).default(0),
  lanes: z.object({ take: lane, patch: lane, shadow: lane, flyer: lane, sounds: z.array(lane).max(3) }).partial().strict().default({}),
  lane_order_keys: z.array(laneKey).min(3).max(64).describe("Complete top-first lane order with the flying clip above the patches above the take."),
  remove_element_ids: z.array(z.string().uuid()).max(32).default([]),
}).strict().superRefine((input, ctx) => {
  const lanes = resolveLanes(input), order = input.lane_order_keys, at = (key: string) => order.indexOf(key);
  const flyer = at(lanes.flyer.lane_key), patch = at(lanes.patch.lane_key), take = at(lanes.take.lane_key), shadow = input.shadow ? at(lanes.shadow.lane_key) : patch;
  if (new Set(order).size !== order.length || [flyer, patch, take, shadow].some(index => index < 0) || !(flyer < patch && flyer < shadow && patch < take && shadow < take)) {
    ctx.addIssue({ code: "custom", path: ["lane_order_keys"], message: "Use distinct lanes with the flying clip above the patches above the take in the complete top-first order." });
  }
  if (input.freeze_seconds <= input.take.source_start_seconds) ctx.addIssue({ code: "custom", path: ["freeze_seconds"], message: "The freeze must come after the take's start." });
});
type Inputs = z.infer<typeof inputsSchema>;

function resolveLanes(input: Pick<Inputs, "lanes" | "sounds">) {
  return {
    take: input.lanes.take ?? { lane_key: "visual_0", lane_index: 0 },
    patch: input.lanes.patch ?? { lane_key: "visual_1", lane_index: 1 },
    shadow: input.lanes.shadow ?? { lane_key: "visual_2", lane_index: 2 },
    flyer: input.lanes.flyer ?? { lane_key: "visual_3", lane_index: 3 },
    sounds: input.sounds.map((_, index) => input.lanes.sounds?.[index] ?? { lane_key: `sound_effect_${index}`, lane_index: index }),
  };
}
const soundName = (input: Inputs, index: number) => input.sounds[index]?.title ?? `sound ${index + 1}`;

/**
 * Freeze at a moment, fly a cut-out out of frame, clean the spot. The take plays to the freeze and
 * holds; an empty frame of the same take covers the subject inside its traced outline (subject window
 * `inside`, parented to the take) and over its shadow; a person cut-out starting on the freeze frame
 * moves out of the frame on an ease-in with directional blur. Sounds are timed from the freeze.
 */
export const freezeFlyOutBlock: BlockDefinition<Inputs> = {
  kind: "freeze_fly_out", version: 1, label: "Freeze and fly out",
  description: "A locked take plays to a frozen moment and holds it; the subject, as a cut-out starting on that frame, shoots out of the frame (up, down, left or right) on an ease-in with a directional blur streak, and the spot it leaves is cleaned with an empty frame of the same take shown only inside the subject's traced outline (so drifted sky never shows as a rectangle) plus an optional rectangle over its shadow. Whoosh and boom sounds are timed from the freeze. Needs a locked camera, an empty frame in the same take, a person cut-out of the whole take (for the outline) and one around the freeze (for the flight).",
  inputs: inputsSchema,
  settings: {
    freeze_timing: { kind: "number", label: "Freeze moment", unit: "frames", min: -15, max: 15, step: 1, default: 0, tier: "main",
      description: "Freeze later (positive) or earlier in the take; the flight, patches and sounds move with it. Clamped to the take and the cut-outs." },
    hold_frames: { kind: "number", label: "Hold after the freeze", unit: "frames", min: 6, max: 150, step: 1, default: inputs => Math.round(inputs.hold_seconds * 30), tier: "main", max_from_default: true,
      description: "How long the empty scene stays after the freeze, at 30 fps; the picture ends there." },
    flight_frames: { kind: "number", label: "Flight length", unit: "frames", min: 3, max: 30, step: 1, default: inputs => Math.round(inputs.flight.seconds * 30), tier: "main",
      description: "Frames to leave the frame, at 30 fps; fewer is faster." },
    flight_speed: { kind: "number", label: "Pose speed", unit: "factor", min: .25, max: 1, step: .05, default: inputs => inputs.flight.speed, tier: "main",
      description: "Playback rate of the flying clip; low keeps the pose nearly still while it moves." },
    blur: { kind: "number", label: "Streak blur", unit: "pixels", min: 0, max: 100, step: 1, default: inputs => inputs.flight.blur_px, tier: "main", off: 0,
      description: "Peak blur along the flight at 1080 width; past about 100 it splits into stripes." },
    patch_expand: { kind: "number", label: "Patch edge", unit: "pixels", min: 0, max: 40, step: 1, default: inputs => inputs.edge.expand_px, tier: "main",
      description: "Pixels at 1080 width the empty-frame patch grows past the outline; grow it until no edge of the subject is left at the freeze." },
    sound_volume: { kind: "number", label: "Level of", unit: "percent", min: 0, max: 200, step: 1, default: (inputs, index) => Math.round((inputs.sounds[index]?.volume ?? 1) * 100), off: 0, tier: "main", per: "sound" },
    direction: { kind: "choice", label: "Direction", choices: DIRECTIONS.map(value => ({ value, label: value[0]!.toUpperCase() + value.slice(1) })), default: inputs => inputs.flight.direction, tier: "advanced" },
    distance: { kind: "number", label: "Flight distance", unit: "percent", min: 50, max: 100, step: 1, default: inputs => Math.round(inputs.flight.distance * 50), tier: "advanced",
      description: "How far the cut-out moves, in percent of the canvas along the flight." },
    patch_feather: { kind: "number", label: "Patch edge softness", unit: "pixels", min: 0, max: 30, step: 1, default: inputs => inputs.edge.feather_px, tier: "advanced" },
    sound_timing: { kind: "number", label: "Timing of", unit: "seconds", min: -1, max: .5, step: .01, default: (inputs, index) => inputs.sounds[index]?.offset_seconds ?? 0, tier: "advanced", per: "sound",
      description: "Seconds from the freeze to the sound's start (negative = before)." },
    take_volume: { kind: "number", label: "Take sound", unit: "percent", min: 0, max: 200, step: 1, default: 100, off: 0, tier: "advanced" },
  },
  instances: inputs => ({ sound: inputs.sounds.map((_, index) => soundName(inputs, index)) }),
  compile: (input, settings, context) => {
    const n = (key: string) => settings[key] as number;
    const fps = context.fps, frame = 1 / fps;
    const take = input.take, cutout = input.cutout, mask = input.person_mask;
    const lanes = resolveLanes(input);
    const rate = n("flight_speed");
    const flight = framesToSeconds(Math.round(n("flight_frames") * fps / 30), fps);
    const window = Math.max(flight * rate + frame, cutout.window_seconds ?? 0);
    // The freeze moves on the take; it stays where the run-up, the flying cut-out and the outline all have footage.
    const maskEnd = mask.source_start_seconds + mask.frame_count / mask.fps;
    const lo = Math.max(take.source_start_seconds + 2 * frame, cutout.take_offset_seconds, mask.source_start_seconds);
    const hi = Math.min(take.source_duration_seconds, cutout.take_offset_seconds + cutout.source_duration_seconds - window, maskEnd - frame);
    if (hi < lo) throw new Error(`The freeze needs take footage, a flying cut-out with ${window.toFixed(3)}s from it and the outline cut-out; they only overlap before ${lo}s.`);
    const freezeSource = Math.min(hi, Math.max(lo, input.freeze_seconds + framesToSeconds(Math.round(n("freeze_timing")), fps)));
    const start = framesToSeconds(secondsToFrames(input.timeline_start, fps), fps);
    const freeze = start + framesToSeconds(secondsToFrames(freezeSource - take.source_start_seconds, fps), fps);
    const hold = framesToSeconds(Math.round(n("hold_frames") * fps / 30), fps);
    const end = freeze + hold;
    if (input.clean_frame_seconds + frame > take.source_duration_seconds + 1e-6) throw new Error(`The empty frame at ${input.clean_frame_seconds}s is past the take's end.`);

    const ref = (role: string, index = 0) => ({ element_id: blockElementId(context, role, index), block_ref: { block_id: context.block_id, role, index } });
    const operations: BlockOperation[] = input.remove_element_ids.map((id, index) => ({ element_id: id, block_ref: { block_id: context.block_id, role: "remove", index }, remove_visual: { reason: "Rebuilt as the run-up, the frozen moment and the flight out." } }));
    operations.push({ ...ref("lane_order"), set_lane_order: { lane_order_keys: input.lane_order_keys } });
    const base = ref("take");
    operations.push({ ...base, create_visual: { type: "video_clip", title: input.titles.take ?? "Run-up and freeze", source_url: take.source_url, source_duration_seconds: take.source_duration_seconds,
      source_start_seconds: take.source_start_seconds, source_end_seconds: freezeSource, trailing_hold_seconds: hold, timeline_start: start, volume: n("take_volume") / 100, ...lanes.take } });
    const clean = { type: "video_clip", source_url: take.source_url, source_duration_seconds: take.source_duration_seconds, source_start_seconds: input.clean_frame_seconds,
      source_end_seconds: input.clean_frame_seconds + frame, trailing_hold_seconds: hold - frame, timeline_start: freeze, volume: 0 };
    operations.push({ ...ref("patch"), create_visual: { ...clean, title: input.titles.patch ?? "Empty scene inside the outline", ...lanes.patch,
      subject_window_parent_id: base.element_id, subject_window_mask: mask, subject_window_mode: "inside",
      subject_window_expand: n("patch_expand"), subject_window_feather: n("patch_feather"), subject_window_strength: 1 } });
    if (input.shadow) operations.push({ ...ref("shadow"), create_visual: { ...clean, title: input.titles.shadow ?? "Empty scene over the shadow", ...lanes.shadow,
      mask_inset: input.shadow.inset, mask_feather: input.shadow.feather } });

    const direction = settings.direction as typeof DIRECTIONS[number];
    const vertical = direction === "up" || direction === "down";
    const distance = n("distance") / 50 * (direction === "up" || direction === "left" ? -1 : 1);
    const blur = n("blur"), ramp = Math.min(input.flight.blur_ramp_seconds, flight / 2);
    const sourceStart = freezeSource - cutout.take_offset_seconds;
    operations.push({ ...ref("flyer"), create_visual: {
      type: "video_clip", title: input.titles.flyer ?? "Flying out", source_url: cutout.source_url, source_duration_seconds: cutout.source_duration_seconds,
      source_start_seconds: sourceStart, source_end_seconds: Math.min(cutout.source_duration_seconds, sourceStart + window),
      timeline_start: freeze, playback_rate: rate, has_alpha: true, volume: 0, ...lanes.flyer,
      ...(blur > 0 ? { [vertical ? "directional_blur_y" : "directional_blur_x"]: blur } : {}),
      transition_keyframes: {
        [vertical ? "media_offset_y" : "media_offset_x"]: [{ t: 0, v: 0, ease: "easeIn" }, { t: flight, v: distance }],
        ...(blur > 0 ? { [vertical ? "directional_blur_y" : "directional_blur_x"]: [{ t: 0, v: 0, ease: "easeIn" }, { t: ramp, v: blur, ease: "linear" }, { t: flight, v: blur }] } : {}),
      },
    } });

    const volumes = settings.sound_volume as number[], timings = settings.sound_timing as number[];
    input.sounds.forEach((sound, index) => {
      const at = Math.max(0, freeze + timings[index]!);
      const sourceEnd = sound.end_with_picture ? sound.source_start_seconds + (end - at) : sound.source_end_seconds ?? sound.source_duration_seconds;
      if (sourceEnd <= sound.source_start_seconds) return;
      operations.push({ ...ref("sound", index), create_audio: {
        type: "sound_effect", title: soundName(input, index), source_url: sound.source_url, ...(sound.source_sha256 ? { source_sha256: sound.source_sha256 } : {}),
        timeline_start: at, source_duration_seconds: sound.source_duration_seconds, source_start_seconds: sound.source_start_seconds,
        source_end_seconds: Math.min(sound.source_duration_seconds, sourceEnd), ...lanes.sounds[index]!,
        volume: volumes[index]! / 100, fade_in: 0, fade_out: sound.fade_out, playback_rate: 1,
      } });
    });
    return operations;
  },
};
