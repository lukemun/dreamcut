import { z } from "zod";
import { subjectWindowMaskSchema } from "../timeline/subject-window";
import { blockElementId, framesToSeconds, secondsToFrames, type BlockDefinition, type BlockOperation } from "./proposal-block-kit";

const finite = z.number().finite();
const laneKey = z.string().regex(/^[a-z0-9_:-]{1,128}$/);
const lane = z.object({ lane_key: laneKey, lane_index: finite.int().min(0) }).strict();
const clip = z.object({
  source_url: z.string().min(1).max(2048),
  source_duration_seconds: finite.positive(),
  source_start_seconds: finite.min(0).default(0),
}).strict();
const SCALE = { min: .25, max: 3 } as const;
const inputsSchema = z.object({
  main: clip.describe("The main take: plays uncut from source_start_seconds with its own sound."),
  duration_seconds: finite.positive().describe("Length of the main window and of the inserted clip."),
  insert: clip.describe("The clip that fills the surface (a carp pond); any footage, not a matched take. It must run the whole window from source_start_seconds."),
  surface_mask: subjectWindowMaskSchema.describe("The traced surface (the patio floor), from cutout_prepare on the MAIN take: copy cutout_status grid_matte_mask. It must cover every main-take second of the window; trace the whole recording so trims keep working."),
  cutout_id: z.string().min(1).max(128).optional().describe("The cut-out receipt id the mask came from, for the card's record."),
  placement: z.object({
    scale: finite.min(SCALE.min).max(SCALE.max).default(1),
    offset_x: finite.min(-1).max(1).default(0),
    offset_y: finite.min(-1).max(1).default(0),
  }).strict().default({ scale: 1, offset_x: 0, offset_y: 0 }).describe("The inserted clip's size and position on the canvas (media_scale, media_offset_x/y), fitted to a reference by grid search or to the surface by eye."),
  edge: z.object({ expand_px: finite.min(-20).max(60).default(0), feather_px: finite.min(0).max(30).default(2) }).strict().default({ expand_px: 0, feather_px: 2 })
    .describe("How far the surface outline grows (pixels at 1080 width) and how soft it is; grow it to close a gap at a boundary (House Pond: 24 px to the door threshold)."),
  sound: z.object({
    source_url: z.string().min(1).max(2048),
    source_duration_seconds: finite.positive(),
    source_sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    source_start_seconds: finite.min(0).default(0),
    fade_in_seconds: finite.min(0).max(2).default(0),
    fade_out_seconds: finite.min(0).max(2).default(0),
  }).strict().optional().describe("A sound for the new surface (water) under the whole window, linked to the inserted clip."),
  titles: z.object({ main: z.string().min(1).max(120), insert: z.string().min(1).max(120), sound: z.string().min(1).max(120) }).partial().strict().default({})
    .describe("Clip names the creator sees, e.g. \"Carp pond\"."),
  timeline_start: finite.min(0).default(0),
  lanes: z.object({ main: lane, insert: lane, sound: lane }).strict().default({
    main: { lane_key: "visual_0", lane_index: 0 }, insert: { lane_key: "visual_1", lane_index: 1 }, sound: { lane_key: "sound_effect_0", lane_index: 0 },
  }),
  lane_order_keys: z.array(laneKey).min(2).max(64).describe("Complete top-first lane order with the insert lane above the main lane."),
  remove_element_ids: z.array(z.string().uuid()).max(32).default([]),
}).strict().superRefine((input, ctx) => {
  const order = input.lane_order_keys;
  const insert = order.indexOf(input.lanes.insert.lane_key), main = order.indexOf(input.lanes.main.lane_key);
  if (new Set(order).size !== order.length || insert < 0 || main < 0 || insert >= main) {
    ctx.addIssue({ code: "custom", path: ["lane_order_keys"], message: "Use distinct lanes with the insert above the main take in the complete top-first order." });
  }
});
type Inputs = z.infer<typeof inputsSchema>;

/**
 * Another clip shows only inside a traced surface of the main take (native subject window, mode
 * inside, parented to the main take), placed by size and position, so the floor becomes a pond
 * while everything else stays as filmed; an optional sound for the new surface runs with it.
 */
export const surfaceSwapBlock: BlockDefinition<Inputs> = {
  kind: "surface_swap", version: 1, label: "Surface swap",
  description: "Over a continuous main take, show another clip (any footage) only inside a traced surface of that take, such as a floor becoming a pond, placed by size and position; people, doors and furniture outside the surface stay in front as filmed. An optional sound for the new surface runs with it. Needs a cut-out of the surface on the main take covering the window; anything that crosses the surface is cut out of it by the trace.",
  inputs: inputsSchema,
  settings: {
    scale: { kind: "number", label: "Size", unit: "factor", min: SCALE.min, max: SCALE.max, step: .005, default: inputs => inputs.placement.scale, tier: "main",
      description: "Size of the inserted clip on the canvas." },
    offset_x: { kind: "number", label: "Horizontal position", unit: "percent", min: -100, max: 100, step: .5, default: inputs => Math.round(inputs.placement.offset_x * 1e4) / 100, tier: "main",
      description: "Moves the inserted clip right (positive) or left, in percent of the canvas." },
    offset_y: { kind: "number", label: "Vertical position", unit: "percent", min: -100, max: 100, step: .5, default: inputs => Math.round(inputs.placement.offset_y * 1e4) / 100, tier: "main",
      description: "Moves the inserted clip down (positive) or up, in percent of the canvas." },
    surface_expand: { kind: "number", label: "Expand edge", unit: "pixels", min: -20, max: 60, step: 1, default: inputs => inputs.edge.expand_px, tier: "main",
      description: "Pixels at 1080 width the surface grows past its traced outline (negative shrinks it)." },
    sound_volume: { kind: "number", label: "Sound level", unit: "percent", min: 0, max: 200, step: 1, default: 100, off: 0, tier: "main", hidden: inputs => !inputs.sound },
    surface_feather: { kind: "number", label: "Edge softness", unit: "pixels", min: 0, max: 30, step: 1, default: inputs => inputs.edge.feather_px, tier: "advanced",
      description: "Soft edge of the surface outline in pixels at 1080 width." },
    window_strength: { kind: "number", label: "Window strength", unit: "percent", min: 0, max: 100, step: 1, default: 100, tier: "advanced",
      description: "How fully the outline limits the inserted clip; 0 shows it over the whole frame, a quick check of its placement." },
    main_volume: { kind: "number", label: "Take sound", unit: "percent", min: 0, max: 200, step: 1, default: 100, off: 0, tier: "advanced" },
  },
  instances: () => ({}),
  compile: (input, settings, context) => {
    const n = (key: string) => settings[key] as number;
    const fps = context.fps;
    const frames = secondsToFrames(input.duration_seconds, fps);
    if (frames < 2) throw new Error("The main window needs at least two output frames.");
    const duration = framesToSeconds(frames, fps);
    for (const [name, source] of [["Main take", input.main], ["Inserted clip", input.insert]] as const) {
      if (source.source_start_seconds + duration > source.source_duration_seconds + 1e-6) throw new Error(`${name} needs ${duration}s of source from ${source.source_start_seconds}s.`);
    }
    const mask = input.surface_mask, maskEnd = mask.source_start_seconds + mask.frame_count / mask.fps;
    if (input.main.source_start_seconds < mask.source_start_seconds - 1e-6 || input.main.source_start_seconds + duration > maskEnd + 1e-6) {
      throw new Error(`The surface cut-out covers ${mask.source_start_seconds}-${maskEnd}s of the main take; it must cover ${input.main.source_start_seconds}-${input.main.source_start_seconds + duration}s.`);
    }
    const start = framesToSeconds(secondsToFrames(input.timeline_start, fps), fps);
    const ref = (role: string) => ({ element_id: blockElementId(context, role), block_ref: { block_id: context.block_id, role, index: 0 } });
    const operations: BlockOperation[] = input.remove_element_ids.map((id, index) => ({ element_id: id, block_ref: { block_id: context.block_id, role: "remove", index }, remove_visual: { reason: "Replace with the main take and the clip inside its traced surface." } }));
    operations.push({ ...ref("lane_order"), set_lane_order: { lane_order_keys: input.lane_order_keys } });
    const main = ref("main");
    operations.push({ ...main, create_visual: {
      type: "video_clip", title: input.titles.main ?? "Main take", source_url: input.main.source_url,
      source_duration_seconds: input.main.source_duration_seconds, source_start_seconds: input.main.source_start_seconds,
      source_end_seconds: input.main.source_start_seconds + duration, timeline_start: start, volume: n("main_volume") / 100, ...input.lanes.main,
    } });
    const insert = ref("insert");
    operations.push({ ...insert, create_visual: {
      type: "video_clip", title: input.titles.insert ?? "Inserted surface", source_url: input.insert.source_url,
      source_duration_seconds: input.insert.source_duration_seconds, source_start_seconds: input.insert.source_start_seconds,
      source_end_seconds: input.insert.source_start_seconds + duration, timeline_start: start, volume: 0, ...input.lanes.insert,
      media_scale: n("scale"), media_offset_x: n("offset_x") / 100, media_offset_y: n("offset_y") / 100,
      subject_window_parent_id: main.element_id, subject_window_mask: mask, subject_window_mode: "inside",
      subject_window_expand: n("surface_expand"), subject_window_feather: n("surface_feather"), subject_window_strength: n("window_strength") / 100,
    } });
    const sound = input.sound;
    if (!sound) return operations;
    // The sound runs under the whole window, as far as its file goes, linked to the inserted clip.
    const sourceEnd = Math.min(sound.source_duration_seconds, sound.source_start_seconds + duration);
    if (sourceEnd - sound.source_start_seconds < 1 / fps) throw new Error("The sound has no audio left from its source_start_seconds.");
    operations.push({ ...ref("sound"), create_audio: {
      type: "sound_effect", title: input.titles.sound ?? "Surface sound", source_url: sound.source_url,
      ...(sound.source_sha256 ? { source_sha256: sound.source_sha256 } : {}),
      timeline_start: start, source_duration_seconds: sound.source_duration_seconds,
      source_start_seconds: sound.source_start_seconds, source_end_seconds: sourceEnd, ...input.lanes.sound,
      volume: n("sound_volume") / 100, fade_in: sound.fade_in_seconds, fade_out: sound.fade_out_seconds, playback_rate: 1,
      follows_visual: { element_id: insert.element_id, offset_seconds: 0 },
    } });
    return operations;
  },
};
