import { z } from "zod";
import { subjectWindowMaskSchema } from "../timeline/subject-window";
import { blockElementId, framesToSeconds, secondsToFrames, type BlockDefinition, type BlockOperation } from "./proposal-block-kit";

const finite = z.number().finite();
const laneKey = z.string().regex(/^[a-z0-9_:-]{1,128}$/);
const lane = z.object({ lane_key: laneKey, lane_index: finite.int().min(0) }).strict();
const take = z.object({
  source_url: z.string().min(1).max(2048),
  source_duration_seconds: finite.positive(),
  source_start_seconds: finite.min(0).default(0),
}).strict();
const inset = z.array(finite.min(0).max(.9)).length(4);
const inputsSchema = z.object({
  main: take.describe("The main take: plays uncut on its own source clock from source_start_seconds, with its own sound."),
  matched: take.describe("A second take filmed from the same spot. source_start_seconds is the slip reference: the matched-take second that plays at the main window's first frame. Leave source handles for the timing dial."),
  duration_seconds: finite.positive().describe("Length of the main window and of the region."),
  region_inset: inset.describe("The swapped area as mask edges [top, right, bottom, left], 0 to 1 from each canvas edge. Measured per take on frames; never copy another card's box."),
  subject_mask: subjectWindowMaskSchema.describe("The cut-out of what stays in front (hands, a person), from cutout_prepare on the MAIN take: copy cutout_status grid_matte_mask. It must cover every main-take second the window shows."),
  cutout_id: z.string().min(1).max(128).optional().describe("The cut-out receipt id the mask came from, for the card's record."),
  sound: z.object({
    source_url: z.string().min(1).max(2048).optional().describe("Defaults to the matched take's file."),
    source_duration_seconds: finite.positive().optional().describe("The audio stream's own duration when it differs from the picture's."),
    source_sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    source_start_seconds: finite.min(0),
    source_end_seconds: finite.positive(),
  }).strict().optional().describe("A window of the matched take's sound, in its own source seconds. It plays on the matched take's clock, so the timing dial carries it."),
  titles: z.object({ main: z.string().min(1).max(120), region: z.string().min(1).max(120), sound: z.string().min(1).max(120) }).partial().strict().default({})
    .describe("Clip names the creator sees, e.g. \"Coffee filling the glass\"."),
  timeline_start: finite.min(0).default(0),
  lanes: z.object({ main: lane, region: lane, sound: lane }).strict().default({
    main: { lane_key: "visual_0", lane_index: 0 }, region: { lane_key: "visual_1", lane_index: 1 }, sound: { lane_key: "sound_effect_0", lane_index: 0 },
  }),
  lane_order_keys: z.array(laneKey).min(2).max(64).describe("Complete top-first lane order with the region lane above the main lane."),
  remove_element_ids: z.array(z.string().uuid()).max(32).default([]),
}).strict().superRefine((input, ctx) => {
  const [top, right, bottom, left] = input.region_inset as [number, number, number, number];
  if (top + bottom > .95 || left + right > .95) ctx.addIssue({ code: "custom", path: ["region_inset"], message: "Region must be at least 5% wide and high." });
  const order = input.lane_order_keys;
  const region = order.indexOf(input.lanes.region.lane_key), main = order.indexOf(input.lanes.main.lane_key);
  if (new Set(order).size !== order.length || region < 0 || main < 0 || region >= main) {
    ctx.addIssue({ code: "custom", path: ["lane_order_keys"], message: "Use distinct lanes with the region above the main take in the complete top-first order." });
  }
  const sound = input.sound;
  if (sound && sound.source_end_seconds <= sound.source_start_seconds) ctx.addIssue({ code: "custom", path: ["sound", "source_end_seconds"], message: "Sound must end after it starts." });
  if (sound && sound.source_end_seconds > (sound.source_duration_seconds ?? input.matched.source_duration_seconds) + 1e-6) ctx.addIssue({ code: "custom", path: ["sound", "source_end_seconds"], message: "Sound window runs past the end of its source." });
});
type Inputs = z.infer<typeof inputsSchema>;

const cropDefault = (side: number) => (inputs: Inputs) => Math.round(inputs.region_inset[side]! * 1e4) / 100;

/**
 * A region of a second, matched take replaces the same region of the main take, with a cut-out of
 * the main take kept in front through the native subject window, and that take's sound on its own
 * clock. One timing dial slips the region's source window and its sound together.
 */
export const matchedTakeRegionBlock: BlockDefinition<Inputs> = {
  kind: "matched_take_region", version: 1, label: "Matched-take region",
  description: "Swap one boxed area of a continuous main take for the same area of a second take filmed from the same locked spot, keep the main take's subject (hands, a person) in front with its cut-out, and bring the second take's sound on its own clock. Needs a locked camera, matched exposure and a cut-out of the main take; anything else that differs between the takes inside the box shows.",
  inputs: inputsSchema,
  settings: {
    slip_frames: { kind: "number", label: "Second take timing", unit: "frames", min: -30, max: 30, step: 1, default: 0, tier: "main",
      description: "Move the second take's action later (positive) or earlier against the main take; its sound moves with it. Clamped to the second take's source handles." },
    subject_expand: { kind: "number", label: "Expand edge", unit: "pixels", min: -20, max: 40, step: 1, default: 2, tier: "main",
      description: "Pixels at 1080 width the kept-in-front cut-out grows past its outline (negative shrinks it)." },
    subject_feather: { kind: "number", label: "Edge softness", unit: "pixels", min: 0, max: 30, step: 1, default: 2, tier: "main",
      description: "Soft edge of the kept-in-front cut-out in pixels at 1080 width." },
    sound_volume: { kind: "number", label: "Sound level", unit: "percent", min: 0, max: 200, step: 1, default: 100, off: 0, tier: "main", hidden: inputs => !inputs.sound,
      description: "Level of the second take's sound." },
    window_strength: { kind: "number", label: "Window strength", unit: "percent", min: 0, max: 100, step: 1, default: 100, tier: "advanced",
      description: "How fully the cut-out holds the second take back; 0 turns the cut-out off (the box covers the subject)." },
    crop_top: { kind: "number", label: "Area top edge", unit: "percent", min: 0, max: 90, step: .1, default: cropDefault(0), tier: "advanced" },
    crop_right: { kind: "number", label: "Area right edge", unit: "percent", min: 0, max: 90, step: .1, default: cropDefault(1), tier: "advanced" },
    crop_bottom: { kind: "number", label: "Area bottom edge", unit: "percent", min: 0, max: 90, step: .1, default: cropDefault(2), tier: "advanced",
      description: "Inset from the bottom; where it meets the top edge, the top edge wins and the area stays 2% high." },
    crop_left: { kind: "number", label: "Area left edge", unit: "percent", min: 0, max: 90, step: .1, default: cropDefault(3), tier: "advanced",
      description: "Inset from the left; where it meets the right edge, the right edge wins and the area stays 2% wide." },
    crop_softness: { kind: "number", label: "Area edge softness", unit: "percent", min: 0, max: 10, step: .05, default: .15, tier: "advanced",
      description: "Feather of the box edge, in percent of the frame." },
    main_volume: { kind: "number", label: "Main take sound", unit: "percent", min: 0, max: 200, step: 1, default: 100, off: 0, tier: "advanced" },
    sound_fade_in_frames: { kind: "number", label: "Sound fade in", unit: "frames", min: 0, max: 30, step: 1, default: 1, tier: "advanced", hidden: inputs => !inputs.sound },
    sound_fade_out_frames: { kind: "number", label: "Sound fade out", unit: "frames", min: 0, max: 30, step: 1, default: 3, tier: "advanced", hidden: inputs => !inputs.sound },
  },
  instances: () => ({}),
  compile: (input, settings, context) => {
    const n = (key: string) => settings[key] as number;
    const fps = context.fps;
    const frames = secondsToFrames(input.duration_seconds, fps);
    if (frames < 2) throw new Error("The main window needs at least two output frames.");
    const duration = framesToSeconds(frames, fps);
    for (const [name, source] of [["Main take", input.main], ["Second take", input.matched]] as const) {
      if (source.source_start_seconds + duration > source.source_duration_seconds + 1e-6) throw new Error(`${name} needs ${duration}s of source from ${source.source_start_seconds}s.`);
    }
    // Positive slip moves the action later, so the region reads from earlier in the second take.
    // Keep the authored source mapping unrounded at reset; clamp to the handles either side.
    const matched = input.matched;
    const earliest = -Math.floor((matched.source_duration_seconds - matched.source_start_seconds - duration) * fps + 1e-7);
    const latest = Math.floor(matched.source_start_seconds * fps + 1e-7);
    const slip = Math.max(earliest, Math.min(latest, Math.round(n("slip_frames")))) / fps;
    const regionSource = matched.source_start_seconds - slip;
    const start = framesToSeconds(secondsToFrames(input.timeline_start, fps), fps);
    const ref = (role: string) => ({ element_id: blockElementId(context, role), block_ref: { block_id: context.block_id, role, index: 0 } });
    const operations: BlockOperation[] = input.remove_element_ids.map((id, index) => ({ element_id: id, block_ref: { block_id: context.block_id, role: "remove", index }, remove_visual: { reason: "Replace with the continuous main take and its matched-take region." } }));
    operations.push({ ...ref("lane_order"), set_lane_order: { lane_order_keys: input.lane_order_keys } });
    const main = ref("main");
    operations.push({ ...main, create_visual: {
      type: "video_clip", title: input.titles.main ?? "Main take", source_url: input.main.source_url,
      source_duration_seconds: input.main.source_duration_seconds, source_start_seconds: input.main.source_start_seconds,
      source_end_seconds: input.main.source_start_seconds + duration, timeline_start: start, volume: n("main_volume") / 100,
      ...input.lanes.main,
    } });
    // Opposite edges never cross: the top and right edges win, leaving a 2% sliver.
    const top = n("crop_top") / 100, right = n("crop_right") / 100;
    const bottom = Math.min(n("crop_bottom") / 100, .98 - top), left = Math.min(n("crop_left") / 100, .98 - right);
    const region = ref("region");
    operations.push({ ...region, create_visual: {
      type: "video_clip", title: input.titles.region ?? "Matched-take region", source_url: matched.source_url,
      source_duration_seconds: matched.source_duration_seconds, source_start_seconds: regionSource, source_end_seconds: regionSource + duration,
      timeline_start: start, volume: 0, ...input.lanes.region,
      mask_inset: [top, right, bottom, left], mask_feather: n("crop_softness") / 100,
      subject_window_parent_id: main.element_id, subject_window_mask: input.subject_mask, subject_window_mode: "outside",
      subject_window_expand: n("subject_expand"), subject_window_feather: n("subject_feather"), subject_window_strength: n("window_strength") / 100,
    } });
    const sound = input.sound;
    if (!sound) return operations;
    // The sound keeps the second take's clock: a source second plays where the region shows it,
    // trimmed to the region's span so a slip never runs it before or past the picture.
    // A slip that leaves no sound inside the region keeps the clip as one silent frame.
    const frame = 1 / fps;
    const audible = Math.max(sound.source_start_seconds, regionSource) < Math.min(sound.source_end_seconds, regionSource + duration) - frame;
    const sourceStart = audible ? Math.max(sound.source_start_seconds, regionSource) : Math.max(sound.source_start_seconds, sound.source_end_seconds - frame);
    const sourceEnd = audible ? Math.min(sound.source_end_seconds, regionSource + duration) : sound.source_end_seconds;
    const offset = Math.min(duration - frame, Math.max(0, sourceStart - regionSource));
    operations.push({ ...ref("sound"), create_audio: {
      type: "sound_effect", title: input.titles.sound ?? "Second take sound", source_url: sound.source_url ?? matched.source_url,
      ...(sound.source_sha256 ? { source_sha256: sound.source_sha256 } : {}),
      timeline_start: start + offset, source_duration_seconds: sound.source_duration_seconds ?? matched.source_duration_seconds,
      source_start_seconds: sourceStart, source_end_seconds: sourceEnd, ...input.lanes.sound,
      volume: audible ? n("sound_volume") / 100 : 0, fade_in: framesToSeconds(n("sound_fade_in_frames"), fps), fade_out: framesToSeconds(n("sound_fade_out_frames"), fps), playback_rate: 1,
      follows_visual: { element_id: region.element_id, offset_seconds: offset },
    } });
    return operations;
  },
};
