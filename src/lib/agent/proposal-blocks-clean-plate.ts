import { z } from "zod";
import { blockElementId, framesToSeconds, secondsToFrames, type BlockDefinition, type BlockOperation } from "./proposal-block-kit";

const finite = z.number().finite();
const lane = z.object({ lane_key: z.string().regex(/^[a-z0-9_:-]{1,128}$/), lane_index: finite.int().min(0) }).strict();
const source = z.object({
  source_url: z.string().min(1).max(2048),
  source_duration_seconds: finite.positive(),
  source_start_seconds: finite.min(0).default(0),
}).strict();
const inputsSchema = z.object({
  hero: source.describe("Continuous performance with the object already present; retain its original audio."),
  clean_plate: source.extend({ type: z.enum(["video_clip", "still"]).default("video_clip") }).describe("Matching locked-camera empty scene. Video must cover the latest reveal allowed by the timing dial; the hero may continue beyond the patch."),
  duration_seconds: finite.positive(),
  reveal_seconds: finite.min(0).describe("Measured gesture time relative to the selected hero window, not source time."),
  patch: z.object({
    left: finite.min(0).max(.95), top: finite.min(0).max(.95),
    right: finite.min(.05).max(1), bottom: finite.min(.05).max(1),
  }).strict().refine(p => p.right - p.left >= .05 && p.bottom - p.top >= .05, "Patch must be at least 5% wide and high; include the object, shadows and feather margin."),
  timeline_start: finite.min(0).default(0),
  lanes: z.object({ hero: lane, patch: lane }).strict().default({ hero: { lane_key: "visual_0", lane_index: 0 }, patch: { lane_key: "visual_1", lane_index: 1 } }),
  lane_order_keys: z.array(z.string().regex(/^[a-z0-9_:-]{1,128}$/)).min(2).max(64).describe("Complete top-first lane order, including patch above hero and all existing lanes."),
  remove_element_ids: z.array(z.string().uuid()).max(32).default([]),
}).strict().superRefine((input, ctx) => {
  if (input.reveal_seconds > input.duration_seconds) ctx.addIssue({ code: "custom", path: ["reveal_seconds"], message: "Reveal must lie within the hero window." });
  const order = input.lane_order_keys;
  if (new Set(order).size !== order.length || order.indexOf(input.lanes.patch.lane_key) < 0 || order.indexOf(input.lanes.hero.lane_key) < 0 || order.indexOf(input.lanes.patch.lane_key) >= order.indexOf(input.lanes.hero.lane_key)) {
    ctx.addIssue({ code: "custom", path: ["lane_order_keys"], message: "Use distinct lanes with the clean patch above the hero in the complete top-first order." });
  }
});
type Inputs = z.infer<typeof inputsSchema>;

/** Generic local background-cover reveal: no segmentation, generation or baked composite. */
export const cleanPlateRevealBlock: BlockDefinition<Inputs> = {
  kind: "clean_plate_reveal", version: 1, label: "Object Appear",
  description: "A matching empty-scene patch hides an object on continuous hero footage, then ends at a marked gesture. Geometry and timing require source inspection; moving cameras and performer crossings are unsupported by this static patch.",
  inputs: inputsSchema,
  settings: {
    reveal_shift_frames: { kind: "number", label: "Reveal shift", unit: "frames", min: -30, max: 30, step: 1, default: 0, tier: "main", description: "Move the marked reveal by up to 30 frames; bounded to the selected hero window. Negative is earlier." },
    feather: { kind: "number", label: "Edge softness", unit: "percent", min: 0, max: 50, step: 1, default: 2, tier: "main", description: "Native mask feather. Expand the patch to keep the object outside the soft edge." },
    width: { kind: "number", label: "Patch width", unit: "percent", min: 5, max: 100, step: 1, default: i => (i.patch.right - i.patch.left) * 100, tier: "main" },
    height: { kind: "number", label: "Patch height", unit: "percent", min: 5, max: 100, step: 1, default: i => (i.patch.bottom - i.patch.top) * 100, tier: "main" },
    center_x: { kind: "number", label: "Patch horizontal position", unit: "percent", min: 0, max: 100, step: 1, default: i => (i.patch.left + i.patch.right) * 50, tier: "advanced", description: "Patch centre; bounded so the complete patch remains in frame." },
    center_y: { kind: "number", label: "Patch vertical position", unit: "percent", min: 0, max: 100, step: 1, default: i => (i.patch.top + i.patch.bottom) * 50, tier: "advanced" },
    align_x: { kind: "number", label: "Plate horizontal alignment", unit: "percent", min: -25, max: 25, step: .1, default: 0, tier: "advanced", description: "Move the plate picture horizontally in percent of canvas width." },
    align_y: { kind: "number", label: "Plate vertical alignment", unit: "percent", min: -25, max: 25, step: .1, default: 0, tier: "advanced" },
    scale: { kind: "number", label: "Plate scale", unit: "factor", min: .5, max: 2, step: .01, default: 1, tier: "advanced" },
  },
  instances: () => ({}),
  compile: (input, settings, context) => {
    const n = (key: string) => settings[key] as number;
    const fps = context.fps;
    const frames = secondsToFrames(input.duration_seconds, fps);
    if (frames < 2) throw new Error("Hero window needs at least two output frames.");
    const duration = framesToSeconds(frames, fps);
    // Keep source starts unrounded: the supplied source mapping survives frame-grid tuning.
    for (const [name, take] of [["Hero", input.hero], ["Clean plate", input.clean_plate]] as const) {
      if (name === "Clean plate" && input.clean_plate.type === "still") continue;
      const required = name === "Clean plate" ? framesToSeconds(Math.min(frames, secondsToFrames(input.reveal_seconds, fps) + 30), fps) : duration;
      if (take.source_start_seconds + required > take.source_duration_seconds + 1e-6) throw new Error(`${name} needs ${required}s of source handles from ${take.source_start_seconds}s.`);
    }
    const reveal = Math.max(0, Math.min(frames, secondsToFrames(input.reveal_seconds, fps) + Math.round(n("reveal_shift_frames"))));
    const ref = (role: string) => ({ element_id: blockElementId(context, role), block_ref: { block_id: context.block_id, role, index: 0 } });
    const start = framesToSeconds(secondsToFrames(input.timeline_start, fps), fps);
    const operations: BlockOperation[] = input.remove_element_ids.map((id, index) => ({ element_id: id, block_ref: { block_id: context.block_id, role: "remove", index }, remove_visual: { reason: "Replace with the continuous hero and editable clean-plate reveal." } }));
    operations.push({ ...ref("lane_order"), set_lane_order: { lane_order_keys: input.lane_order_keys } });
    operations.push({ ...ref("hero"), create_visual: {
      type: "video_clip", title: "Continuous performance", source_url: input.hero.source_url,
      source_duration_seconds: input.hero.source_duration_seconds, source_start_seconds: input.hero.source_start_seconds,
      source_end_seconds: input.hero.source_start_seconds + duration, timeline_start: start, volume: 1,
      ...input.lanes.hero,
    } });
    // Preserve the patch operation and identity when tuning through frame zero.
    // A transparent one-frame patch expresses an immediate reveal without changing scope.
    const patchFrames = Math.max(1, reveal);
    const width = n("width") / 100, height = n("height") / 100;
    const cx = Math.max(width / 2, Math.min(1 - width / 2, n("center_x") / 100));
    const cy = Math.max(height / 2, Math.min(1 - height / 2, n("center_y") / 100));
    const plate = input.clean_plate;
    operations.push({ ...ref("patch"), create_visual: {
      type: plate.type, title: "Clean plate patch", source_url: plate.source_url, timeline_start: start, volume: 0, media_opacity: reveal === 0 ? 0 : 1,
      ...(plate.type === "still" ? { duration_seconds: framesToSeconds(patchFrames, fps) } : {
        source_duration_seconds: plate.source_duration_seconds, source_start_seconds: plate.source_start_seconds,
        source_end_seconds: plate.source_start_seconds + framesToSeconds(patchFrames, fps),
      }),
      ...input.lanes.patch,
      mask_inset: [cy - height / 2, 1 - cx - width / 2, 1 - cy - height / 2, cx - width / 2].map(v => Math.max(0, Math.min(.95, v))),
      mask_feather: n("feather") / 100,
      media_offset_x: n("align_x") / 50, media_offset_y: n("align_y") / 50, media_scale: n("scale"),
    } });
    return operations;
  },
};
