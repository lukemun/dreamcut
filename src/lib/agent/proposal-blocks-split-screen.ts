import { z } from "zod";
import { blockElementId, framesToSeconds, secondsToFrames, type BlockDefinition } from "./proposal-block-kit";

const finite = z.number().finite();
const take = z.object({
  source_url: z.string().min(1).max(2048),
  source_duration_seconds: finite.positive(),
  source_start_seconds: finite.nonnegative().default(0),
}).strict();
const inputs = z.object({
  left: take.describe("Locked-camera performance on the left; unchanged original source and measured window."),
  right: take.describe("Matching performance on the right; may be another window of the same recording."),
  duration_seconds: finite.positive(),
  timeline_start: finite.nonnegative().default(0),
  seam_percent: finite.min(5).max(95).default(50),
  lane_order_keys: z.array(z.string().regex(/^[a-z0-9_:-]{1,128}$/)).min(2).max(64),
  left_lane: z.string().regex(/^[a-z0-9_:-]{1,128}$/).default("visual_0"),
  right_lane: z.string().regex(/^[a-z0-9_:-]{1,128}$/).default("visual_1"),
}).strict().superRefine((i, ctx) => {
  if (new Set(i.lane_order_keys).size !== i.lane_order_keys.length ||
      !i.lane_order_keys.includes(i.left_lane) || !i.lane_order_keys.includes(i.right_lane) ||
      i.lane_order_keys.indexOf(i.right_lane) >= i.lane_order_keys.indexOf(i.left_lane)) {
    ctx.addIssue({ code: "custom", path: ["lane_order_keys"], message: "Use distinct lanes, right above left, in the complete top-first order." });
  }
});

/** Two continuous performances joined at an inspected stationary division. No tracking or baking. */
export const splitScreenBlock: BlockDefinition<z.infer<typeof inputs>> = {
  kind: "split_screen", version: 1, label: "Split screen",
  description: "Combine two matched locked-camera performances across a static vertical seam. Actors and shadows must remain on their own side. Source windows and alignment require inspection; visual acceptance pending.",
  inputs,
  settings: {
    seam: { kind: "number", label: "Split position", unit: "percent", min: 5, max: 95, step: .1, default: i => i.seam_percent, tier: "main" },
    feather: { kind: "number", label: "Edge softness", unit: "percent", min: 0, max: 10, step: .1, default: 1, tier: "main" },
    timing: { kind: "number", label: "Right take timing", unit: "frames", min: -30, max: 30, step: 1, default: 0, tier: "main", description: "Shift the right source window, clamped to available source handles; playback stays at 1x." },
    audio: { kind: "choice", label: "Recorded sound", choices: [{ value: "left", label: "Left take" }, { value: "right", label: "Right take" }, { value: "silent", label: "Muted" }], default: "left", tier: "main" },
  },
  instances: () => ({}),
  compile: (i, s, context) => {
    const duration = framesToSeconds(secondsToFrames(i.duration_seconds, context.fps), context.fps);
    if (duration < 1 / context.fps) throw new Error("Split screen needs at least one output frame.");
    for (const [name, source] of [["Left", i.left], ["Right", i.right]] as const) {
      if (source.source_start_seconds + duration > source.source_duration_seconds + 1e-6) throw new Error(`${name} take needs ${duration}s of source handles from ${source.source_start_seconds}s.`);
    }
    // Quantize the change, retaining the original source mapping at reset.
    const low = -Math.floor(i.right.source_start_seconds * context.fps + 1e-7);
    const high = Math.floor((i.right.source_duration_seconds - i.right.source_start_seconds - duration) * context.fps + 1e-7);
    const shift = Math.max(low, Math.min(high, Math.round(s.timing as number))) / context.fps;
    const ref = (role: string) => ({ element_id: blockElementId(context, role), block_ref: { block_id: context.block_id, role, index: 0 } });
    const start = framesToSeconds(secondsToFrames(i.timeline_start, context.fps), context.fps);
    const visual = (source: z.infer<typeof take>, role: "left" | "right", lane: string, sourceStart: number) => ({
      ...ref(role), create_visual: {
        type: "video_clip", title: role === "left" ? "Left performance" : "Right performance",
        source_url: source.source_url, source_duration_seconds: source.source_duration_seconds,
        source_start_seconds: sourceStart, source_end_seconds: sourceStart + duration,
        timeline_start: start, playback_rate: 1, volume: s.audio === role ? 1 : 0,
        lane_key: lane, lane_index: i.lane_order_keys.length - 1 - i.lane_order_keys.indexOf(lane),
        ...(role === "right" ? { mask_inset: [0, 0, 0, (s.seam as number) / 100], mask_feather: (s.feather as number) / 100 } : {}),
      },
    });
    return [{ ...ref("lane_order"), set_lane_order: { lane_order_keys: i.lane_order_keys } },
      visual(i.left, "left", i.left_lane, i.left.source_start_seconds),
      visual(i.right, "right", i.right_lane, i.right.source_start_seconds + shift)];
  },
};
