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
const MIN_PICTURE_SCALE = .1;
const inputsSchema = z.object({
  take: clip.describe("The locked performance take (the creator at the wall): plays uncut from source_start_seconds."),
  duration_seconds: finite.positive().describe("Length of the take window; the screen stays on to its end."),
  screen: clip.describe("The screen recording shown on the wall, filling the canvas at size 1 (a 9:16 phone recording on a 9:16 canvas). source_start_seconds is its second at the moment the screen starts to open; it then runs at 1x on that clock with its own sound."),
  pop_start_seconds: finite.min(0).describe("Seconds into the window where the screen starts to open (the tap). Course demo: 1.2 s."),
  person_mask: subjectWindowMaskSchema.describe("The traced person on the TAKE, from cutout_prepare (copy cutout_status grid_matte_mask). It must cover the take window: the creator is redrawn from the take inside it, in front of the screen."),
  cutout_id: z.string().min(1).max(128).optional().describe("The cut-out receipt id the mask came from, for the card's record."),
  placement: z.object({
    scale: finite.min(.2).max(1.5).describe("Screen size once open, as a fraction of the fitted full frame (course demo 0.6366)."),
    offset_x: finite.min(-1).max(1).default(0).describe("Where the open screen's centre lands, in half-canvas units (media_offset_x), after the wall angle."),
    offset_y: finite.min(-1).max(1).default(0).describe("Same, vertical (course demo -0.3714: centre 603 px down a 1920 px canvas)."),
    rotation_deg: finite.min(-15).max(15).default(0).describe("Clockwise turn of the screen to match the wall, applied by a camera the screen follows (course demo 0.96)."),
    crop: z.tuple([finite.min(0).max(.4), finite.min(0).max(.4), finite.min(0).max(.4), finite.min(0).max(.4)]).default([0, 0, 0, 0])
      .describe("Recording edges cut away [top, right, bottom, left] as fractions of the recording (course demo top 0.0307: the status bar)."),
  }).strict(),
  reveal: z.object({
    frames: finite.int().min(2).max(30).default(10).describe("Frames from the first growth to full size (course demo 10)."),
    anchor_px: z.tuple([finite, finite]).default([0, 0]).describe("Where the screen grows from, in canvas pixels from the open screen's centre (course demo [0, -63]: a little above centre)."),
  }).strict().default({ frames: 10, anchor_px: [0, 0] }),
  look: z.object({ opacity: finite.min(0).max(1).default(.8), exposure_ev: finite.min(-1).max(2).default(0) }).strict().default({ opacity: .8, exposure_ev: 0 })
    .describe("Normal blend opacity once open (course 80%) and screen exposure in stops (course demo +0.6: its screen is brighter than the raw recording)."),
  edge: z.object({ expand_px: finite.min(-20).max(40).default(0), feather_px: finite.min(0).max(30).default(1) }).strict().default({ expand_px: 0, feather_px: 1 })
    .describe("How far the traced person grows past its outline and how soft that edge is (pixels at 1080 width)."),
  whoosh: z.object({
    source_url: z.string().min(1).max(2048),
    source_duration_seconds: finite.positive(),
    source_sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    offset_seconds: finite.min(-2).max(2).default(0).describe("Seconds from the moment the screen starts to open (course demo -0.2)."),
  }).strict().optional().describe("The tap sound, played whole and moving with the screen."),
  canvas: z.object({ width: finite.positive(), height: finite.positive() }).strict().default({ width: 1080, height: 1920 }),
  titles: z.object({ take: z.string().min(1).max(120), screen: z.string().min(1).max(120), person: z.string().min(1).max(120), camera: z.string().min(1).max(120), whoosh: z.string().min(1).max(120) }).partial().strict().default({}),
  timeline_start: finite.min(0).default(0),
  lanes: z.object({ take: lane, screen: lane, person: lane, camera: lane, whoosh: lane }).strict().default({
    take: { lane_key: "visual_0", lane_index: 0 }, screen: { lane_key: "visual_1", lane_index: 1 }, person: { lane_key: "visual_2", lane_index: 2 },
    camera: { lane_key: "visual_3", lane_index: 3 }, whoosh: { lane_key: "sound_effect_0", lane_index: 0 },
  }),
  lane_order_keys: z.array(laneKey).min(3).max(64).describe("Complete top-first lane order with the person above the screen above the take."),
  remove_element_ids: z.array(z.string().uuid()).max(32).default([]),
}).strict().superRefine((input, ctx) => {
  const order = input.lane_order_keys, at = (key: string) => order.indexOf(key);
  const person = at(input.lanes.person.lane_key), screen = at(input.lanes.screen.lane_key), take = at(input.lanes.take.lane_key);
  if (new Set(order).size !== order.length || person < 0 || screen < 0 || take < 0 || !(person < screen && screen < take)) {
    ctx.addIssue({ code: "custom", path: ["lane_order_keys"], message: "Use distinct lanes with the person above the screen above the take in the complete top-first order." });
  }
});
type Inputs = z.infer<typeof inputsSchema>;

/**
 * A screen recording pops open on a wall of a locked take as a see-through panel and plays on its own
 * clock, while the creator, traced from the take, stays in front of it. The pop-open grows the screen
 * on an ease-out from a point while its opacity rises evenly; a camera the screen follows matches the
 * wall's angle; the crop follows the screen as it grows.
 */
export const wallScreenBlock: BlockDefinition<Inputs> = {
  kind: "wall_screen", version: 1, label: "Wall screen",
  description: "Over a continuous locked take, a screen recording pops open on a wall (or any flat area) as a see-through panel where the creator taps, grows on an ease-out with its opacity rising, plays on its own clock with its sound, and stays to the end; the creator, redrawn from the take inside a person cut-out, stays in front of it. An optional tap sound moves with the pop-open. Needs a person cut-out of the take covering the window and a screen recording that fills the canvas at size 1. Placement, angle, crop and timing are measured from a reference or set by eye.",
  inputs: inputsSchema,
  settings: {
    pop_timing: { kind: "number", label: "Screen opens", unit: "frames", min: -30, max: 30, step: 1, default: 0, tier: "main",
      description: "Move the moment the screen starts to open later (positive) or earlier against the tap; the recording keeps its clock and the tap sound moves with it." },
    reveal_frames: { kind: "number", label: "Pop-open length", unit: "frames", min: 2, max: 30, step: 1, default: inputs => inputs.reveal.frames, tier: "main",
      description: "Frames from the first growth to full size." },
    recording_timing: { kind: "number", label: "Recording timing", unit: "frames", min: -30, max: 30, step: 1, default: 0, tier: "main",
      description: "Show later (positive) or earlier parts of the recording, to line its scroll up with the hand's swipe." },
    opacity: { kind: "number", label: "Screen opacity", unit: "percent", min: 0, max: 100, step: 1, default: inputs => Math.round(inputs.look.opacity * 100), tier: "main", off: 0,
      description: "How solid the open screen is; the wall shows through the rest." },
    exposure: { kind: "number", label: "Screen brightness", unit: "stops", min: -1, max: 2, step: .05, default: inputs => inputs.look.exposure_ev, tier: "main",
      description: "Exposure of the screen recording in stops." },
    whoosh_volume: { kind: "number", label: "Whoosh level", unit: "percent", min: 0, max: 200, step: 1, default: 100, off: 0, tier: "main", hidden: inputs => !inputs.whoosh },
    screen_volume: { kind: "number", label: "Screen sound", unit: "percent", min: 0, max: 200, step: 1, default: 100, off: 0, tier: "main" },
    person_expand: { kind: "number", label: "Creator edge", unit: "pixels", min: -20, max: 40, step: 1, default: inputs => inputs.edge.expand_px, tier: "main",
      description: "Pixels at 1080 width the creator in front grows past the traced outline (negative shrinks it)." },
    scale: { kind: "number", label: "Screen size", unit: "factor", min: .2, max: 1.5, step: .005, default: inputs => inputs.placement.scale, tier: "advanced" },
    offset_x: { kind: "number", label: "Horizontal position", unit: "percent", min: -100, max: 100, step: .5, default: inputs => Math.round(inputs.placement.offset_x * 1e4) / 100, tier: "advanced",
      description: "Moves the open screen right (positive) or left, in percent of half the canvas." },
    offset_y: { kind: "number", label: "Vertical position", unit: "percent", min: -100, max: 100, step: .5, default: inputs => Math.round(inputs.placement.offset_y * 1e4) / 100, tier: "advanced",
      description: "Moves the open screen down (positive) or up, in percent of half the canvas." },
    rotation: { kind: "number", label: "Wall angle", unit: "degrees", min: -15, max: 15, step: .05, default: inputs => inputs.placement.rotation_deg, tier: "advanced",
      description: "Clockwise turn of the screen to sit square on the wall." },
    crop_top: { kind: "number", label: "Crop top", unit: "percent", min: 0, max: 40, step: .1, default: inputs => Math.round(inputs.placement.crop[0] * 1e4) / 100, tier: "advanced" },
    crop_right: { kind: "number", label: "Crop right", unit: "percent", min: 0, max: 40, step: .1, default: inputs => Math.round(inputs.placement.crop[1] * 1e4) / 100, tier: "advanced" },
    crop_bottom: { kind: "number", label: "Crop bottom", unit: "percent", min: 0, max: 40, step: .1, default: inputs => Math.round(inputs.placement.crop[2] * 1e4) / 100, tier: "advanced" },
    crop_left: { kind: "number", label: "Crop left", unit: "percent", min: 0, max: 40, step: .1, default: inputs => Math.round(inputs.placement.crop[3] * 1e4) / 100, tier: "advanced" },
    person_feather: { kind: "number", label: "Creator edge softness", unit: "pixels", min: 0, max: 30, step: 1, default: inputs => inputs.edge.feather_px, tier: "advanced" },
    window_strength: { kind: "number", label: "Window strength", unit: "percent", min: 0, max: 100, step: 1, default: 100, tier: "advanced",
      description: "How fully the outline limits the creator copy; 0 lays the whole take over the screen (hides it)." },
    whoosh_timing: { kind: "number", label: "Whoosh timing", unit: "frames", min: -30, max: 30, step: 1, default: inputs => Math.round((inputs.whoosh?.offset_seconds ?? 0) * 30), tier: "advanced", hidden: inputs => !inputs.whoosh,
      description: "Frames from the moment the screen starts to open (at 30 fps)." },
    take_volume: { kind: "number", label: "Take sound", unit: "percent", min: 0, max: 200, step: 1, default: 0, off: 0, tier: "advanced" },
  },
  instances: () => ({}),
  compile: (input, settings, context) => {
    const n = (key: string) => settings[key] as number;
    const fps = context.fps, frame = 1 / fps;
    const frames = secondsToFrames(input.duration_seconds, fps);
    const duration = framesToSeconds(frames, fps);
    const revealFrames = Math.round(n("reveal_frames"));
    if (frames < revealFrames + 2) throw new Error("The take window needs more frames than the pop-open.");
    const take = input.take;
    if (take.source_start_seconds + duration > take.source_duration_seconds + 1e-6) throw new Error(`The take needs ${duration}s of source from ${take.source_start_seconds}s.`);
    const mask = input.person_mask, maskEnd = mask.source_start_seconds + mask.frame_count / mask.fps;
    if (take.source_start_seconds < mask.source_start_seconds - 1e-6 || take.source_start_seconds + duration > maskEnd + 1e-6) {
      throw new Error(`The person cut-out covers ${mask.source_start_seconds}-${maskEnd}s of the take; it must cover ${take.source_start_seconds}-${take.source_start_seconds + duration}s.`);
    }
    const start = framesToSeconds(secondsToFrames(input.timeline_start, fps), fps);
    // The pop-open moves on the timeline; the recording keeps its clock (source = pop source + time since pop).
    const authoredPop = secondsToFrames(input.pop_start_seconds, fps);
    const popFrames = Math.min(Math.max(0, authoredPop + Math.round(n("pop_timing"))), frames - revealFrames - 1);
    const pop = framesToSeconds(popFrames, fps);
    const screenLength = duration - pop;
    const screenIn = Math.max(0, input.screen.source_start_seconds + framesToSeconds(popFrames - authoredPop + Math.round(n("recording_timing")), fps));
    const screenOut = Math.min(input.screen.source_duration_seconds, screenIn + screenLength);
    if (screenOut - screenIn < (revealFrames + 1) * frame - 1e-6) throw new Error(`The screen recording has no ${screenLength}s left from ${screenIn}s.`);

    // Geometry in canvas pixels. The camera turns the screen about the canvas centre, so the screen is placed
    // where the turn lands its centre on the target; growth and crop are drawn before the turn.
    const W = input.canvas.width, H = input.canvas.height, cx0 = W / 2, cy0 = H / 2;
    const scale = n("scale"), rad = n("rotation") * Math.PI / 180;
    const tx = cx0 * (1 + n("offset_x") / 100) - cx0, ty = cy0 * (1 + n("offset_y") / 100) - cy0;
    const px = cx0 + tx * Math.cos(rad) - ty * Math.sin(rad), py = cy0 + tx * Math.sin(rad) + ty * Math.cos(rad);
    const ax = px + input.reveal.anchor_px[0], ay = py + input.reveal.anchor_px[1];
    const crop = [n("crop_top"), n("crop_right"), n("crop_bottom"), n("crop_left")].map(value => value / 100);
    const at = (s: number) => {
      const cx = ax + s * (px - ax), cy = ay + s * (py - ay), w = s * scale * W, h = s * scale * H;
      const inset = [
        crop[0] && (cy - h / 2 + crop[0] * h) / H, crop[1] && 1 - (cx + w / 2 - crop[1] * w) / W,
        crop[2] && 1 - (cy + h / 2 - crop[2] * h) / H, crop[3] && (cx - w / 2 + crop[3] * w) / W,
      ].map(value => Math.min(.95, Math.max(0, value)));
      return { scale: s * scale, x: (cx - cx0) / cx0, y: (cy - cy0) / cy0, inset };
    };
    // Size follows 1 - (1 - p)^2 over the pop-open (the editor's easeOut), measured on the course demo.
    // Pictures can't be smaller than 0.1, so it starts there, where that curve passes it; opacity rises evenly.
    const s0 = MIN_PICTURE_SCALE / scale, end = revealFrames * frame;
    const from = (1 - Math.sqrt(1 - s0)) * end;
    const open = at(1), closed = at(s0);
    const keys = <T>(a: T, b: T) => [{ t: 0, v: a, ease: "hold" }, { t: from, v: a, ease: "easeOut" }, { t: end, v: b }];

    const ref = (role: string) => ({ element_id: blockElementId(context, role), block_ref: { block_id: context.block_id, role, index: 0 } });
    const operations: BlockOperation[] = input.remove_element_ids.map((id, index) => ({ element_id: id, block_ref: { block_id: context.block_id, role: "remove", index }, remove_visual: { reason: "Rebuilt as its window, with the screen and the creator over it." } }));
    operations.push({ ...ref("lane_order"), set_lane_order: { lane_order_keys: input.lane_order_keys } });
    const takeOp = ref("take");
    const takeWindow = { source_url: take.source_url, source_duration_seconds: take.source_duration_seconds, source_start_seconds: take.source_start_seconds,
      source_end_seconds: take.source_start_seconds + duration, timeline_start: start };
    operations.push({ ...takeOp, create_visual: { type: "video_clip", title: input.titles.take ?? "Wall take", ...takeWindow, volume: n("take_volume") / 100, ...input.lanes.take } });
    const camera = ref("camera");
    operations.push({ ...camera, create_shape: { title: input.titles.camera ?? "Wall angle", shape_kind: "camera", shape_width: W / H, shape_height: 1,
      timeline_start: start + pop, duration_seconds: screenLength, ...input.lanes.camera, media_rotation: n("rotation") } });
    const screen = ref("screen");
    operations.push({ ...screen, create_visual: {
      type: "video_clip", title: input.titles.screen ?? "Screen on the wall", source_url: input.screen.source_url,
      source_duration_seconds: input.screen.source_duration_seconds, source_start_seconds: screenIn, source_end_seconds: screenOut,
      timeline_start: start + pop, volume: n("screen_volume") / 100, ...input.lanes.screen, camera_id: camera.element_id,
      media_blend_mode: "normal", media_opacity: n("opacity") / 100, color_grade: { grade_exposure_ev: n("exposure") },
      media_scale: open.scale, media_offset_x: open.x, media_offset_y: open.y,
      ...(crop.some(Boolean) ? { mask_inset: open.inset, mask_inset_keyframes: keys(closed.inset, open.inset) } : {}),
      transition_keyframes: {
        media_scale: keys(closed.scale, open.scale),
        ...(Math.abs(closed.x - open.x) > 1e-9 ? { media_offset_x: keys(closed.x, open.x) } : {}),
        ...(Math.abs(closed.y - open.y) > 1e-9 ? { media_offset_y: keys(closed.y, open.y) } : {}),
        media_opacity: [{ t: 0, v: 0, ease: "hold" }, { t: frame / 2, v: 0, ease: "linear" }, { t: end, v: n("opacity") / 100 }],
      },
    } });
    operations.push({ ...ref("person"), create_visual: {
      type: "video_clip", title: input.titles.person ?? "Creator in front of the screen", ...takeWindow, volume: 0, ...input.lanes.person,
      subject_window_parent_id: takeOp.element_id, subject_window_mask: mask, subject_window_mode: "inside",
      subject_window_expand: n("person_expand"), subject_window_feather: n("person_feather"), subject_window_strength: n("window_strength") / 100,
    } });
    const whoosh = input.whoosh;
    if (!whoosh) return operations;
    const offset = Math.max(-(start + pop), framesToSeconds(Math.round(n("whoosh_timing") * fps / 30), fps));
    operations.push({ ...ref("whoosh"), create_audio: {
      type: "sound_effect", title: input.titles.whoosh ?? "Tap whoosh", source_url: whoosh.source_url,
      ...(whoosh.source_sha256 ? { source_sha256: whoosh.source_sha256 } : {}),
      timeline_start: start + pop + offset, source_duration_seconds: whoosh.source_duration_seconds, source_start_seconds: 0, source_end_seconds: whoosh.source_duration_seconds,
      ...input.lanes.whoosh, volume: n("whoosh_volume") / 100, fade_in: 0, fade_out: 0, playback_rate: 1,
      follows_visual: { element_id: screen.element_id, offset_seconds: offset },
    } });
    return operations;
  },
};
