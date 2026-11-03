import { z } from "zod";
import { blockElementId, framesToSeconds, secondsToFrames, type BlockDefinition, type BlockOperation } from "./proposal-block-kit";
const finite = z.number().finite();
const take = z.object({ source_url: z.string().min(1).max(2048), source_duration_seconds: finite.positive(), source_start_seconds: finite.min(0) }).strict();
const lane = z.object({ lane_key: z.string().regex(/^visual_\d+$/), lane_index: finite.int().min(0) }).strict()
  .refine(l => l.lane_key === `visual_${l.lane_index}`, "Visual lane key and index must match.");
export const staticSceneSplitInputs = z.object({
  base: take.describe("Continuous first outfit performance from the locked camera."),
  replacement: take.describe("Matched second outfit performance, already aligned at the foot/pole crossing; retain twelve output frames of slip handles before and after this window."),
  duration_seconds: finite.positive().max(600), timeline_start: finite.min(0).default(0),
  seam_percent: finite.min(25).max(75).describe("Measured centre of stationary occluder in canvas width percent, not guessed from the finished example."),
  canvas: z.object({width:finite.positive(),height:finite.positive()}).strict().default({width:1080,height:1920})
    .refine(c=>c.width/c.height>=9/16&&c.width/c.height<=16/9,"Use an aspect ratio between 9:16 and16:9."),
  lanes: z.object({ base: lane, replacement: lane }).strict().default({ base: { lane_key: "visual_0", lane_index: 0 }, replacement: { lane_key: "visual_1", lane_index: 1 } }),
  lane_order_keys: z.array(z.string().regex(/^[a-z0-9_:-]{1,128}$/)).min(2).max(64),
  remove_element_ids: z.array(z.string().uuid()).max(32).default([]),
}).strict().superRefine((i, ctx) => {
  const a = i.lane_order_keys.indexOf(i.lanes.replacement.lane_key), b = i.lane_order_keys.indexOf(i.lanes.base.lane_key);
  if (new Set(i.lane_order_keys).size !== i.lane_order_keys.length || a < 0 || b < 0 || a >= b) ctx.addIssue({ code: "custom", path: ["lane_order_keys"], message: "Use distinct replacement above base lanes in complete top-first order." });
});
type Inputs = z.infer<typeof staticSceneSplitInputs>;

export const staticSceneSplitBlock: BlockDefinition<Inputs> = {
  kind: "static_scene_split", version: 1, label: "Magic Pole Transition",
  description: "Two continuous locked-camera takes meet behind a stationary vertical occluder. Native split/feather with bounded source slip; no moving-camera tracking. Draft until actual source alignment, seam and playback are reviewed.",
  inputs: staticSceneSplitInputs,
  settings: {
    seam: { kind: "number", label: "Pole position", unit: "percent", min: 25, max: 75, step: .1, default: i => i.seam_percent, tier: "main" },
    feather: { kind: "number", label: "Edge softness", unit: "percent", min: 0, max: 5, step: .1, default: .2, tier: "main" },
    slip_frames: { kind: "number", label: "Second take timing", unit: "frames", min: -12, max: 12, step: 1, default: 0, tier: "main", description: "Positive reads later in the replacement take. Never changes the base take or timeline duration." },
    side: { kind: "choice", label: "New outfit appears on", choices: [{ value: "right", label: "Right" }, { value: "left", label: "Left" }], default: "right", tier: "advanced" },
    align_x: { kind: "number", label: "Second take horizontal", unit: "percent", min: -5, max: 5, step: .1, default: 0, tier: "advanced" },
    align_y: { kind: "number", label: "Second take vertical", unit: "percent", min: -5, max: 5, step: .1, default: 0, tier: "advanced" },
  },
  instances: () => ({}),
  compile: (i, s, ctx) => {
    const n = (k: string) => s[k] as number;
    const frames = secondsToFrames(i.duration_seconds, ctx.fps);
    if (frames < 2) throw new Error("Split scene needs at least two output frames.");
    const duration = framesToSeconds(frames, ctx.fps), slipHandle = 12 / ctx.fps;
    for (const seconds of [i.base.source_start_seconds, i.replacement.source_start_seconds, i.timeline_start]) {
      if (Math.abs(seconds * ctx.fps - Math.round(seconds * ctx.fps)) > 1e-5) throw new Error("Source starts and timeline start must align to the project frame grid.");
    }
    if (i.base.source_start_seconds + duration > i.base.source_duration_seconds + 1e-6) throw new Error("Base take lacks source handles for the complete continuous window.");
    if (i.replacement.source_start_seconds < slipHandle - 1e-6 || i.replacement.source_start_seconds + duration + slipHandle > i.replacement.source_duration_seconds + 1e-6) throw new Error("Replacement take needs twelve output frames before and after the selected window for its timing dial.");
    const ref = (role: string) => ({ element_id: blockElementId(ctx, role), block_ref: { block_id: ctx.block_id, role, index: 0 } });
    const operations: BlockOperation[] = i.remove_element_ids.map((id, index) => ({ element_id: id, block_ref: { block_id: ctx.block_id, role: "remove", index }, remove_visual: { reason: "Replace with continuous editable split-scene takes." } }));
    operations.push({ ...ref("lane_order"), set_lane_order: { lane_order_keys: i.lane_order_keys } });
    for (const role of ["base", "replacement"] as const) {
      const source = i[role], upper = role === "replacement";
      const start = source.source_start_seconds + (upper ? Math.round(n("slip_frames")) / ctx.fps : 0);
      const seam = n("seam") / 100;
      operations.push({ ...ref(role), create_visual: { type: "video_clip", title: upper ? "Second outfit" : "Continuous first outfit",
        source_url: source.source_url, source_duration_seconds: source.source_duration_seconds,
        source_start_seconds: start, source_end_seconds: start + duration, timeline_start: i.timeline_start,
        ...i.lanes[role], volume: upper ? 0 : 1,
        ...(upper ? { mask_inset: [.5 + (s.side === "right" ? 1 : -1) * (seam-.5) * i.canvas.width/i.canvas.height,0,0,0],
          mask_line_rotation: s.side === "right" ? -90 : 90, mask_feather: n("feather") / 100,
          media_offset_x: n("align_x") / 50, media_offset_y: n("align_y") / 50 } : {}),
      } });
    }
    return operations;
  },
};
