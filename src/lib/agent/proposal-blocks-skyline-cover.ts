import { z } from "zod";
import { blockElementId, framesToSeconds, secondsToFrames, type BlockDefinition, type BlockOperation } from "./proposal-block-kit";

const finite = z.number().finite();
const laneKey = z.string().regex(/^[a-z0-9_:-]{1,128}$/);
const lane = z.object({ lane_key: laneKey, lane_index: finite.int().min(0) }).strict();
const inset = z.array(finite.min(0).max(.95)).length(4);
const inputsSchema = z.object({
  take: z.object({
    source_url: z.string().min(1).max(2048),
    source_duration_seconds: finite.positive(),
  }).strict().describe("The one locked take: the run and jump, then the empty scene after the person has left the frame."),
  main_start_seconds: finite.min(0).describe("Take second where the main window starts. It plays uncut from here with its sound."),
  duration_seconds: finite.positive().describe("Length of the main window."),
  cover: z.object({
    source_start_seconds: finite.min(0),
    source_end_seconds: finite.positive(),
    playback_rate: finite.min(.5).max(2).default(1),
  }).strict().describe("The empty end of the same take that covers everything below the skyline from the block's start. Its fade ends where it ends: (end - start) / playback_rate after the start, so choose the rate that ends it as the person clears the skyline (Building Jump: 10.2-15.12 s at 0.976, ending at 5.04 s). Live footage, not a held frame: a held frame breaks the card's hold and source sliders."),
  cover_inset: inset.describe("The rectangle part of the cover as mask edges [top, right, bottom, left], 0 to 1 from each canvas edge: everything below a line just under the skyline (Building Jump: [0.56, 0, 0, 0])."),
  edge_cutout: z.object({
    source_url: z.string().min(1).max(2048).describe("The cut-out clip (alpha) of the object below its jagged skyline, from cutout_prepare on the empty end."),
    source_duration_seconds: finite.positive(),
    take_offset_seconds: finite.min(0).describe("Take second at cut-out second 0 (cutout_status reports the prepared window)."),
    cutout_id: z.string().min(1).max(128).optional().describe("The cut-out receipt id, for the card's record."),
  }).strict().optional().describe("Covers the jagged skyline above the rectangle; plays on the cover's clock."),
  cover_exposure_ev: finite.min(-2).max(2).default(0).describe("Exposure of the cover in stops, matched to the main take (or a reference) on the covered area; light drifts between the jump and the empty end."),
  fade_seconds: finite.min(0).max(2).default(.2).describe("The cover's fade out, ending where it ends; measured from a reference's per-frame layer share when there is one."),
  titles: z.object({ main: z.string().min(1).max(120), cover: z.string().min(1).max(120), edge: z.string().min(1).max(120) }).partial().strict().default({})
    .describe("Clip names the creator sees, e.g. \"Empty stadium and grass\"."),
  timeline_start: finite.min(0).default(0),
  lanes: z.object({ main: lane, cover: lane, edge: lane }).strict().default({
    main: { lane_key: "visual_0", lane_index: 0 }, cover: { lane_key: "visual_1", lane_index: 1 }, edge: { lane_key: "visual_2", lane_index: 2 },
  }),
  lane_order_keys: z.array(laneKey).min(2).max(64).describe("Complete top-first lane order with the cover lanes above the main lane."),
  remove_element_ids: z.array(z.string().uuid()).max(32).default([]),
}).strict().superRefine((input, ctx) => {
  const [top, right, bottom, left] = input.cover_inset as [number, number, number, number];
  if (top + bottom > .95 || left + right > .95) ctx.addIssue({ code: "custom", path: ["cover_inset"], message: "The cover rectangle must be at least 5% wide and high." });
  const cover = input.cover;
  if (cover.source_end_seconds <= cover.source_start_seconds) ctx.addIssue({ code: "custom", path: ["cover", "source_end_seconds"], message: "The cover must end after it starts." });
  if (cover.source_end_seconds > input.take.source_duration_seconds + 1e-6) ctx.addIssue({ code: "custom", path: ["cover", "source_end_seconds"], message: "The cover runs past the end of the take." });
  const edge = input.edge_cutout;
  if (edge && (edge.take_offset_seconds > cover.source_start_seconds + 1e-6 || edge.take_offset_seconds + edge.source_duration_seconds < cover.source_end_seconds - .05)) {
    ctx.addIssue({ code: "custom", path: ["edge_cutout"], message: "The skyline cut-out must cover the cover's take window (within 0.05 s at its end)." });
  }
  const order = input.lane_order_keys, main = order.indexOf(input.lanes.main.lane_key);
  const covers = [input.lanes.cover.lane_key, ...(edge ? [input.lanes.edge.lane_key] : [])];
  if (new Set(order).size !== order.length || new Set([input.lanes.main.lane_key, ...covers]).size !== covers.length + 1 || main < 0 || covers.some(key => { const at = order.indexOf(key); return at < 0 || at >= main; })) {
    ctx.addIssue({ code: "custom", path: ["lane_order_keys"], message: "Use distinct lanes with the cover lanes above the main take in the complete top-first order." });
  }
});
type Inputs = z.infer<typeof inputsSchema>;

const insetDefault = (side: number) => (inputs: Inputs) => Math.round(inputs.cover_inset[side]! * 1e4) / 100;

/**
 * The empty end of the same take covers everything below a skyline (a rectangle plus an optional
 * cut-out of the jagged edge), so the person seems to be behind the object until they clear it;
 * then the cover fades. The cover is live footage at a rate that ends it on the fade, exposure
 * matched; one timing dial moves the fade by changing that rate.
 */
export const skylineCoverBlock: BlockDefinition<Inputs> = {
  kind: "skyline_cover", version: 1, label: "Skyline cover",
  description: "Over a continuous main window of one locked take, cover everything below an object's skyline with the empty end of the same take (a rectangle below a line under the skyline plus an optional cut-out of the jagged edge), exposure matched, so the person seems to run behind the object; the cover fades out as they clear the top and jump over it. Needs a locked camera, a still empty end with steady light and the person's feet clearly above the skyline when the fade starts.",
  inputs: inputsSchema,
  settings: {
    fade_timing_frames: { kind: "number", label: "Fade timing", unit: "frames", min: -30, max: 30, step: 1, default: 0, tier: "main",
      description: "Move the cover's fade later (positive) or earlier; the empty end plays a little slower or faster to end there." },
    fade_frames: { kind: "number", label: "Fade length", unit: "frames", min: 0, max: 30, step: 1, default: inputs => Math.round(inputs.fade_seconds * 30), tier: "main",
      description: "Frames the cover takes to fade out, at 30 fps; 0 cuts it." },
    cover_top: { kind: "number", label: "Cover top edge", unit: "percent", min: 0, max: 95, step: .1, default: insetDefault(0), tier: "main",
      description: "Where the rectangle part of the cover starts, from the top; just under the skyline." },
    cover_exposure: { kind: "number", label: "Cover brightness", unit: "stops", min: -2, max: 2, step: .05, default: inputs => inputs.cover_exposure_ev, tier: "main",
      description: "Exposure of the cover, to match the main take where it is covered." },
    main_volume: { kind: "number", label: "Take sound", unit: "percent", min: 0, max: 200, step: 1, default: 100, off: 0, tier: "main" },
    cover_right: { kind: "number", label: "Cover right edge", unit: "percent", min: 0, max: 95, step: .1, default: insetDefault(1), tier: "advanced" },
    cover_bottom: { kind: "number", label: "Cover bottom edge", unit: "percent", min: 0, max: 95, step: .1, default: insetDefault(2), tier: "advanced",
      description: "Inset from the bottom; where it meets the top edge, the top edge wins and the cover stays 2% high." },
    cover_left: { kind: "number", label: "Cover left edge", unit: "percent", min: 0, max: 95, step: .1, default: insetDefault(3), tier: "advanced",
      description: "Inset from the left; where it meets the right edge, the right edge wins and the cover stays 2% wide." },
    cover_softness: { kind: "number", label: "Cover edge softness", unit: "percent", min: 0, max: 10, step: .05, default: 0, tier: "advanced" },
  },
  instances: () => ({}),
  compile: (input, settings, context) => {
    const n = (key: string) => settings[key] as number;
    const fps = context.fps;
    const frames = secondsToFrames(input.duration_seconds, fps);
    if (frames < 2) throw new Error("The main window needs at least two output frames.");
    const duration = framesToSeconds(frames, fps);
    if (input.main_start_seconds + duration > input.take.source_duration_seconds + 1e-6) throw new Error(`The main window needs ${duration}s of the take from ${input.main_start_seconds}s.`);
    const cover = input.cover, span = cover.source_end_seconds - cover.source_start_seconds;
    const authored = span / cover.playback_rate;
    if (authored > duration + 1e-6) throw new Error(`The cover (${authored.toFixed(3)}s) must end inside the ${duration}s main window.`);
    // Fade timing changes the cover's rate so the same empty footage ends later or earlier; the
    // authored rate stays exact at reset, and the cover never runs past the main window.
    const minimum = framesToSeconds(1, fps);
    const length = Math.min(duration, Math.max(span / 2, minimum, authored + framesToSeconds(Math.round(n("fade_timing_frames")), fps)));
    const rate = n("fade_timing_frames") === 0 ? cover.playback_rate : Math.min(2, span / length);
    const fade = Math.min(span / rate, framesToSeconds(Math.round(n("fade_frames") * fps / 30), fps));
    const grade = { grade_exposure_ev: n("cover_exposure") };
    const fadeOut = fade > 0 ? { animationOut: "fade", animationOutDuration: fade } : {};
    const start = framesToSeconds(secondsToFrames(input.timeline_start, fps), fps);
    const ref = (role: string) => ({ element_id: blockElementId(context, role), block_ref: { block_id: context.block_id, role, index: 0 } });
    const operations: BlockOperation[] = input.remove_element_ids.map((id, index) => ({ element_id: id, block_ref: { block_id: context.block_id, role: "remove", index }, remove_visual: { reason: "Replace with the main window and the empty-scene cover." } }));
    operations.push({ ...ref("lane_order"), set_lane_order: { lane_order_keys: input.lane_order_keys } });
    operations.push({ ...ref("main"), create_visual: {
      type: "video_clip", title: input.titles.main ?? "Main take", source_url: input.take.source_url,
      source_duration_seconds: input.take.source_duration_seconds, source_start_seconds: input.main_start_seconds,
      source_end_seconds: input.main_start_seconds + duration, timeline_start: start, volume: n("main_volume") / 100, ...input.lanes.main,
    } });
    // Opposite edges never cross: the top and right edges win, leaving a 2% sliver.
    const top = n("cover_top") / 100, right = n("cover_right") / 100;
    const bottom = Math.min(n("cover_bottom") / 100, .98 - top), left = Math.min(n("cover_left") / 100, .98 - right);
    operations.push({ ...ref("cover"), create_visual: {
      type: "video_clip", title: input.titles.cover ?? "Empty scene", source_url: input.take.source_url,
      source_duration_seconds: input.take.source_duration_seconds, source_start_seconds: cover.source_start_seconds, source_end_seconds: cover.source_end_seconds,
      playback_rate: rate, timeline_start: start, volume: 0, ...input.lanes.cover,
      mask_inset: [top, right, bottom, left], mask_feather: n("cover_softness") / 100, color_grade: grade, ...fadeOut,
    } });
    const edge = input.edge_cutout;
    if (!edge) return operations;
    // The skyline cut-out plays the same take seconds on the cover's clock.
    const edgeStart = cover.source_start_seconds - edge.take_offset_seconds;
    const edgeEnd = Math.min(edge.source_duration_seconds, cover.source_end_seconds - edge.take_offset_seconds);
    operations.push({ ...ref("edge"), create_visual: {
      type: "video_clip", title: input.titles.edge ?? "Empty scene skyline", source_url: edge.source_url,
      source_duration_seconds: edge.source_duration_seconds, source_start_seconds: edgeStart, source_end_seconds: edgeEnd,
      playback_rate: rate, timeline_start: start, volume: 0, has_alpha: true, ...input.lanes.edge, color_grade: grade, ...fadeOut,
    } });
    return operations;
  },
};
