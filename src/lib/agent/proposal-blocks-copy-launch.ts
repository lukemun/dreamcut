import { z } from "zod";
import { blockElementId, framesToSeconds, secondsToFrames, type BlockDefinition, type BlockOperation } from "./proposal-block-kit";

const finite = z.number().finite();
const laneKey = z.string().regex(/^[a-z0-9_:-]{1,128}$/);
const lane = z.object({ lane_key: laneKey, lane_index: finite.int().min(0) }).strict();
const cutoutSchema = z.object({
  source_url: z.string().min(1).max(2048),
  source_duration_seconds: finite.positive(),
  take_offset_seconds: finite.min(0).describe("Take second of the cut-out file's first frame."),
}).strict();
const inputsSchema = z.object({
  take: z.object({
    source_url: z.string().min(1).max(2048),
    source_duration_seconds: finite.positive(),
  }).strict().describe("One locked take: the action toward an empty spot, then the same person walking onto that spot and reacting there."),
  action_start_seconds: finite.min(0).describe("Take second the clip starts: the spot still empty, before the action enters (Kick Away: 0.233 s, frame 7)."),
  contact_seconds: finite.positive().describe("Take second the action reaches the spot (a foot, a fist, a push; Kick Away: 1.3 s, frame 39)."),
  loop_seconds: finite.positive().describe("Take second the person stands settled on the spot. The clip ends here and the waiting copy starts here, so the last frame matches the first and the clip loops (Kick Away: 4.0 s, frame 120)."),
  spot: z.object({
    inset: z.tuple([finite.min(0).max(.95), finite.min(0).max(.95), finite.min(0).max(.95), finite.min(0).max(.95)]),
    feather: finite.min(0).max(.2).default(.03),
  }).strict().describe("A box around the person on the spot and their shadow, as mask edges [top, right, bottom, left] from each canvas edge (Kick Away: [0.2, 0, 0.1, 0.3]). The later take shows only inside it until the launch; it must stay clear of anything else that moves then."),
  copy: cutoutSchema.extend({
    window_seconds: finite.positive().max(10).optional().describe("Source seconds the flying copy plays from the launch; it holds its last pose if the flight outlasts them."),
  }).strict().describe("A person cut-out (cutout_prepare) of the reaction on the spot, covering the launch frame of the waiting copy's clock (loop + launch time after the start) and the pose that follows."),
  front: cutoutSchema.optional().describe("A cut-out of the acting person around the contact (the kicking leg), drawn on top so it crosses in front of the copy. Placed on the take's own clock."),
  flight: z.object({
    frames: finite.int().min(10).max(90).default(33).describe("Frames at 30 fps from the launch until the copy is gone (Kick Away demo: 33)."),
    rise_percent: finite.min(0).max(60).default(37.5).describe("How far it climbs, in percent of the canvas height (37.5: from mid-frame to about an eighth from the top)."),
    drift_percent: finite.min(-30).max(30).default(10).describe("Sideways drift by the end, in percent of the canvas width; positive is right."),
    shrink_percent: finite.min(0).max(100).default(100).describe("How far it shrinks toward the distance along the measured profile; it fades out from the point it reaches 10 % size."),
    speed: finite.min(.25).max(1).default(.25).describe("Playback rate of the flying copy; slow keeps the reaction pose nearly still."),
    blur_px: finite.min(0).max(100).default(70).describe("Peak vertical streak at the launch, at 1080 width; gone by the fifth frame. Past about 100 it splits into stripes."),
  }).strict().default({ frames: 33, rise_percent: 37.5, drift_percent: 10, shrink_percent: 100, speed: .25, blur_px: 70 }),
  launch_delay_frames: finite.int().min(0).max(15).default(1).describe("Frames from the contact to the launch (Kick Away demo: 1)."),
  sounds: z.array(z.object({
    source_url: z.string().min(1).max(2048),
    source_duration_seconds: finite.positive(),
    source_sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    source_start_seconds: finite.min(0).default(0),
    source_end_seconds: finite.positive().optional(),
    offset_seconds: finite.min(-1).max(1).default(0).describe("Seconds from the contact to the sound's start (negative = before)."),
    volume: finite.min(0).max(2).default(1),
    fade_out: finite.min(0).max(2).default(0),
    title: z.string().min(1).max(120).optional(),
  }).strict()).max(2).default([]).describe("A hit and the like, timed from the contact."),
  titles: z.object({ take: z.string().min(1).max(120), spot: z.string().min(1).max(120), copy: z.string().min(1).max(120), front: z.string().min(1).max(120) }).partial().strict().default({}),
  timeline_start: finite.min(0).default(0),
  lanes: z.object({ take: lane, spot: lane, copy: lane, front: lane, sounds: z.array(lane).max(2) }).partial().strict().default({}),
  lane_order_keys: z.array(laneKey).min(3).max(64).describe("Complete top-first lane order: the front cut-out above the flying copy above the waiting copy above the take."),
  remove_element_ids: z.array(z.string().uuid()).max(32).default([]),
}).strict().superRefine((input, ctx) => {
  const lanes = resolveLanes(input), order = input.lane_order_keys, at = (key: string) => order.indexOf(key);
  const front = input.front ? at(lanes.front.lane_key) : -1, copy = at(lanes.copy.lane_key), spot = at(lanes.spot.lane_key), take = at(lanes.take.lane_key);
  if (new Set(order).size !== order.length || [copy, spot, take].some(index => index < 0) || (input.front && front < 0) || !((!input.front || front < copy) && copy < spot && spot < take)) {
    ctx.addIssue({ code: "custom", path: ["lane_order_keys"], message: "Use distinct lanes with the front cut-out above the flying copy above the waiting copy above the take in the complete top-first order." });
  }
  if (!(input.action_start_seconds < input.contact_seconds && input.contact_seconds < input.loop_seconds)) {
    ctx.addIssue({ code: "custom", path: ["contact_seconds"], message: "The take must run start < contact < loop: the empty spot, the action reaching it, then the person settled on it." });
  }
});
type Inputs = z.infer<typeof inputsSchema>;

function resolveLanes(input: Pick<Inputs, "lanes" | "sounds">) {
  return {
    take: input.lanes.take ?? { lane_key: "visual_0", lane_index: 0 },
    spot: input.lanes.spot ?? { lane_key: "visual_1", lane_index: 1 },
    copy: input.lanes.copy ?? { lane_key: "visual_2", lane_index: 2 },
    front: input.lanes.front ?? { lane_key: "visual_3", lane_index: 3 },
    sounds: input.sounds.map((_, index) => input.lanes.sounds?.[index] ?? { lane_key: `sound_effect_${index}`, lane_index: index }),
  };
}
const soundName = (input: Inputs, index: number) => input.sounds[index]?.title ?? `sound ${index + 1}`;

/**
 * The flight measured from the Kick Away demo, in frames of a 33-frame flight: most of the climb in
 * the first frame, settled by frame 11 while it keeps drifting, shrinking toward the distance and
 * fading once it is a tenth of its size. Values are shares of the rise, drift and shrink settings.
 */
const RISE = [[0, 0, "linear"], [1, .47 / .75, "linear"], [2, .5 / .75, "linear"], [3, .56 / .75, "easeOut"], [11, 1]] as const;
const DRIFT = [[0, 0, "linear"], [11, .3, "linear"], [33, 1]] as const;
const SCALE = [[0, 1, "linear"], [1, .67, "linear"], [2, .62, "linear"], [3, .55, "linear"], [7, .35, "linear"], [11, .25, "linear"], [20, .1]] as const;
const FADE = [[0, 1, "hold"], [20, 1, "easeIn"], [33, 0]] as const;
const BLUR = [[0, 1, "linear"], [1, 1, "linear"], [2, .5, "linear"], [3, 1 / 7, "linear"], [5, 0]] as const;
const PROFILE_FRAMES = 33;
const SCALE_FLOOR = .1;

/**
 * Launch a copy away. One locked take: the person acts toward an empty spot (a kick), then walks
 * onto it. Their later self waits on the spot (the later take in a box, with its shadow) until the
 * contact; from the launch a cut-out of their reaction climbs, drifts and shrinks into the
 * distance with a streak, and an optional cut-out of the actor is drawn on top so the kick crosses
 * in front. The take ends where the waiting copy starts, so the clip loops.
 */
export const copyLaunchBlock: BlockDefinition<Inputs> = {
  kind: "copy_launch", version: 1, label: "Launch a copy away",
  description: "One locked take where the person acts toward an empty spot (a kick, a push) and then stands on that spot: their later self waits on the spot (the later take inside a box, so its shadow comes too), the action reaches it, and from the launch a cut-out of their reaction climbs, drifts sideways and shrinks into the distance with a vertical streak, fading once it is a tenth of its size. An optional cut-out of the acting person is drawn on top so the kick crosses in front. The take ends on the frame the waiting copy starts, so the clip loops. Needs a locked camera with steady light, a cut-out of the reaction and, for the crossing, one of the action.",
  inputs: inputsSchema,
  settings: {
    launch_delay: { kind: "number", label: "Launch after contact", unit: "frames", min: 0, max: 15, step: 1, default: inputs => inputs.launch_delay_frames, tier: "main",
      description: "Frames from the contact to the launch; the waiting copy ends and the flight starts together." },
    flight_frames: { kind: "number", label: "Flight length", unit: "frames", min: 10, max: 90, step: 1, default: inputs => inputs.flight.frames, tier: "main",
      description: "Frames at 30 fps until the copy is gone; the whole path stretches with it." },
    rise: { kind: "number", label: "Rise", unit: "percent", min: 0, max: 60, step: .5, default: inputs => inputs.flight.rise_percent, off: 0, tier: "main",
      description: "How far it climbs, in percent of the canvas height." },
    drift: { kind: "number", label: "Drift sideways", unit: "percent", min: -30, max: 30, step: .5, default: inputs => inputs.flight.drift_percent, off: 0, tier: "main",
      description: "Sideways drift by the end, in percent of the canvas width; positive is right." },
    shrink: { kind: "number", label: "Shrink into the distance", unit: "percent", min: 0, max: 100, step: 1, default: inputs => inputs.flight.shrink_percent, off: 0, tier: "main" },
    flight_speed: { kind: "number", label: "Pose speed", unit: "factor", min: .25, max: 1, step: .05, default: inputs => inputs.flight.speed, tier: "main",
      description: "Playback rate of the flying copy; low keeps the reaction pose nearly still." },
    blur: { kind: "number", label: "Streak blur", unit: "pixels", min: 0, max: 100, step: 1, default: inputs => inputs.flight.blur_px, off: 0, tier: "main",
      description: "Peak vertical streak at the launch at 1080 width; past about 100 it splits into stripes." },
    spot_softness: { kind: "number", label: "Box edge softness", unit: "percent", min: 0, max: 20, step: .5, default: inputs => inputs.spot.feather * 100, tier: "main",
      description: "Soft edge of the box the waiting copy shows in, in percent of the frame; raise it if the box edge shows." },
    sound_volume: { kind: "number", label: "Level of", unit: "percent", min: 0, max: 200, step: 1, default: (inputs, index) => Math.round((inputs.sounds[index]?.volume ?? 1) * 100), off: 0, tier: "main", per: "sound" },
    loop_frame: { kind: "number", label: "Loop frame", unit: "frames", min: -15, max: 15, step: 1, default: 0, tier: "advanced",
      description: "Moves the take's last frame and the waiting copy's first frame together, so the loop still joins. Clamped to the take and the copy's cut-out." },
    sound_timing: { kind: "number", label: "Timing of", unit: "seconds", min: -1, max: 1, step: .01, default: (inputs, index) => inputs.sounds[index]?.offset_seconds ?? 0, tier: "advanced", per: "sound",
      description: "Seconds from the contact to the sound's start (negative = before)." },
  },
  instances: inputs => ({ sound: inputs.sounds.map((_, index) => soundName(inputs, index)) }),
  compile: (input, settings, context) => {
    const n = (key: string) => settings[key] as number;
    const fps = context.fps, frame = 1 / fps, snap = (seconds: number) => framesToSeconds(secondsToFrames(seconds, fps), fps);
    const lanes = resolveLanes(input), take = input.take, copy = input.copy;
    const start = snap(input.timeline_start);
    const contact = snap(input.contact_seconds - input.action_start_seconds);
    const launch = contact + framesToSeconds(Math.round(n("launch_delay")), fps);
    // The loop frame moves on the take; the waiting copy's clock runs on into the copy's cut-out.
    const copyStartAt = (loop: number) => loop + launch - copy.take_offset_seconds;
    const authored = input.loop_seconds + contact + framesToSeconds(input.launch_delay_frames, fps);
    if (authored < copy.take_offset_seconds || authored > copy.take_offset_seconds + copy.source_duration_seconds - frame) {
      throw new Error(`The copy's cut-out (take ${copy.take_offset_seconds}–${(copy.take_offset_seconds + copy.source_duration_seconds).toFixed(3)}s) must cover the waiting copy's launch frame, take ${authored.toFixed(3)}s.`);
    }
    // Dials clamp: the loop stays after the contact and the launch frame stays inside the take and the cut-out.
    const lo = Math.max(input.contact_seconds + frame, copy.take_offset_seconds - launch);
    const hi = Math.min(take.source_duration_seconds - launch, copy.take_offset_seconds + copy.source_duration_seconds - frame - launch);
    const loop = Math.min(hi, Math.max(lo, input.loop_seconds + framesToSeconds(Math.round(n("loop_frame")), fps)));

    const ref = (role: string, index = 0) => ({ element_id: blockElementId(context, role, index), block_ref: { block_id: context.block_id, role, index } });
    const operations: BlockOperation[] = input.remove_element_ids.map((id, index) => ({ element_id: id, block_ref: { block_id: context.block_id, role: "remove", index }, remove_visual: { reason: "Rebuilt as the action, the copy waiting on the spot and its launch." } }));
    operations.push({ ...ref("lane_order"), set_lane_order: { lane_order_keys: input.lane_order_keys } });
    const clip = { type: "video_clip", source_url: take.source_url, source_duration_seconds: take.source_duration_seconds, volume: 0 };
    operations.push({ ...ref("take"), create_visual: { ...clip, title: input.titles.take ?? "The action", source_start_seconds: input.action_start_seconds, source_end_seconds: loop, timeline_start: start, ...lanes.take } });
    operations.push({ ...ref("spot"), create_visual: { ...clip, title: input.titles.spot ?? "Copy waiting on the spot", source_start_seconds: loop, source_end_seconds: loop + launch, timeline_start: start, ...lanes.spot,
      mask_inset: input.spot.inset, mask_feather: n("spot_softness") / 100 } });

    const flight = framesToSeconds(Math.round(n("flight_frames") * fps / 30), fps);
    const t = (profileFrame: number) => Math.round(profileFrame / PROFILE_FRAMES * flight * 1e4) / 1e4;
    const round = (value: number) => Math.round(value * 1e4) / 1e4 + 0;
    const keys = (profile: readonly (readonly [number, number, string?])[], value: (share: number) => number) =>
      profile.map(([at, share, ease]) => ({ t: t(at), v: round(value(share)), ...(ease ? { ease } : {}) }));
    const rate = n("flight_speed"), rise = n("rise") / 50, drift = n("drift") / 50, shrink = n("shrink") / 100, blur = n("blur");
    const sourceStart = copyStartAt(loop);
    const window = Math.min(copy.window_seconds ?? flight * rate + frame, copy.source_duration_seconds - sourceStart);
    const plays = window / rate;
    const transition_keyframes: Record<string, unknown> = {
      media_scale: keys(SCALE, share => Math.max(SCALE_FLOOR, 1 - shrink * (1 - share))),
      media_opacity: keys(FADE, share => share),
    };
    if (rise > 0) transition_keyframes.media_offset_y = keys(RISE, share => -rise * share);
    if (drift !== 0) transition_keyframes.media_offset_x = keys(DRIFT, share => drift * share);
    if (blur > 0) transition_keyframes.directional_blur_y = keys(BLUR, share => blur * share);
    operations.push({ ...ref("copy"), create_visual: {
      type: "video_clip", title: input.titles.copy ?? "Copy launched away", source_url: copy.source_url, source_duration_seconds: copy.source_duration_seconds,
      source_start_seconds: sourceStart, source_end_seconds: sourceStart + window, playback_rate: rate, has_alpha: true, volume: 0,
      timeline_start: start + launch, ...lanes.copy, ...(plays < flight ? { trailing_hold_seconds: flight - plays } : {}),
      ...(blur > 0 ? { directional_blur_y: blur } : {}), transition_keyframes,
    } });
    if (input.front) {
      const front = input.front, from = front.take_offset_seconds - input.action_start_seconds;
      const skip = Math.max(0, -from), until = Math.min(front.source_duration_seconds, loop - front.take_offset_seconds);
      if (until > skip) operations.push({ ...ref("front"), create_visual: {
        type: "video_clip", title: input.titles.front ?? "Action in front", source_url: front.source_url, source_duration_seconds: front.source_duration_seconds,
        source_start_seconds: skip, source_end_seconds: until, has_alpha: true, volume: 0, timeline_start: start + Math.max(0, from), ...lanes.front,
      } });
    }

    const volumes = settings.sound_volume as number[], timings = settings.sound_timing as number[];
    input.sounds.forEach((sound, index) => {
      const sourceEnd = sound.source_end_seconds ?? sound.source_duration_seconds;
      if (sourceEnd <= sound.source_start_seconds) return;
      operations.push({ ...ref("sound", index), create_audio: {
        type: "sound_effect", title: soundName(input, index), source_url: sound.source_url, ...(sound.source_sha256 ? { source_sha256: sound.source_sha256 } : {}),
        timeline_start: Math.max(0, start + contact + timings[index]!), source_duration_seconds: sound.source_duration_seconds, source_start_seconds: sound.source_start_seconds,
        source_end_seconds: Math.min(sound.source_duration_seconds, sourceEnd), ...lanes.sounds[index]!,
        volume: volumes[index]! / 100, fade_in: 0, fade_out: sound.fade_out, playback_rate: 1,
      } });
    });
    return operations;
  },
};
