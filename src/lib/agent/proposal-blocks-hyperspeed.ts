import { z } from "zod";
import { blockElementId, type BlockDefinition } from "./proposal-block-kit";

// This recipe's validated envelope stays bounded when other effects extend the shared clock.
const MAX_SPEED_RATE = 16;

const finite = z.number().finite();
export const hyperspeedInputs = z.object({
  source: z.object({
    source_url: z.string().min(1),
    source_duration_seconds: finite.positive(),
    source_start_seconds: finite.min(0).default(0),
    source_end_seconds: finite.positive(),
  }).strict(),
  // These are source marks, never timestamps from the flattened demonstration.
  fast_start_source_seconds: finite.min(0),
  fast_end_source_seconds: finite.positive(),
  timeline_start: finite.min(0).default(0),
  lane: z.object({ lane_key: z.string().regex(/^visual_\d+$/), lane_index: finite.int().min(0) }).strict()
    .default({ lane_key: "visual_0", lane_index: 0 }),
  temporal_blur: z.object({ source_url: z.string().min(1), source_duration_seconds: finite.positive(), original_source_url: z.string().min(1),
    frame_rate: finite.positive(), sample_frames: finite.int().min(2).max(64) }).strict().optional()
    .describe("Prepared source-clock temporal-average derivative of this same take; original retained. Blend is editable, preparation kernel fixed until regenerated."),
  blur_lane: z.object({ lane_key: z.string().regex(/^visual_\d+$/), lane_index: finite.int().min(0) }).strict().default({ lane_key: "visual_1", lane_index: 1 }),
  lane_order_keys: z.array(z.string()).max(64).optional(),
  replace_element_ids: z.array(z.string().uuid()).max(64).default([]),
}).strict().superRefine((input, ctx) => {
  const { source, fast_start_source_seconds: a, fast_end_source_seconds: b } = input;
  if (!(source.source_start_seconds < a && a < b && b < source.source_end_seconds
    && source.source_end_seconds <= source.source_duration_seconds)) {
    ctx.addIssue({ code: "custom", message: "Hyperspeed needs ordered source marks with real normal-speed lead and payoff handles inside the source" });
  }
  if (input.temporal_blur) {
    const t = input.temporal_blur, order = input.lane_order_keys ?? [];
    if (t.original_source_url !== source.source_url || Math.abs(t.source_duration_seconds - source.source_duration_seconds) > 1e-6) ctx.addIssue({ code: "custom", message: "Temporal blur must declare this original source and identical source-clock duration" });
    if (new Set(order).size !== order.length || !order.includes(input.blur_lane.lane_key) || !order.includes(input.lane.lane_key)
      || order.indexOf(input.blur_lane.lane_key) >= order.indexOf(input.lane.lane_key)) ctx.addIssue({ code: "custom", message: "Temporal blur needs a distinct lane above the original in complete top-first lane order" });
    if (input.blur_lane.lane_key !== `visual_${input.blur_lane.lane_index}`) ctx.addIssue({ code: "custom", message: "Blur lane key and index must match" });
  }
  if (input.lane.lane_key !== `visual_${input.lane.lane_index}`) ctx.addIssue({ code: "custom", message: "Visual lane key and index must match" });
});
export type HyperspeedInputs = z.infer<typeof hyperspeedInputs>;

/** Source-preserving three-section retime. The accelerated interval is rounded UP
 * to a whole output frame, then its actual rate is derived from the unchanged
 * source span. No endpoint is moved and no final frame reads beyond the source.
 * Uses the same source-indexed speed clock as proposal-speed-ramp, not a second
 * retime renderer or a baked derivative. Abrupt boundaries match this recipe. */
export function hyperspeedWindows(input: HyperspeedInputs, requestedRate: number, fps: number) {
  if (!Number.isFinite(requestedRate) || requestedRate < 1 || requestedRate > MAX_SPEED_RATE
    || !Number.isFinite(fps) || fps <= 0) throw new Error("Hyperspeed speed must be 1–16× on a positive frame grid");
  const { source, fast_start_source_seconds: a, fast_end_source_seconds: b } = hyperspeedInputs.parse(input);
  const start = source.source_start_seconds, end = source.source_end_seconds;
  // Normal handles must already be on the output grid; silently rounding them
  // would trim a performance or change normal speed. Intake can choose new marks.
  for (const seconds of [input.timeline_start, start, a, b, source.source_duration_seconds - end, a - start, end - b]) {
    if (Math.abs(seconds * fps - Math.round(seconds * fps)) > 1e-5) {
      throw new Error("Hyperspeed source trims, marks and timeline start must align to the project frame grid");
    }
  }
  const fastFrames = Math.max(1, Math.ceil((b - a) / requestedRate * fps - 1e-9));
  const fastDuration = fastFrames / fps;
  const rate = (b - a) / fastDuration;
  const leadDuration = a - start;
  return [
    { role: "lead", start, end: a, at: input.timeline_start, rate: 1, duration: leadDuration },
    { role: "fast", start: a, end: b, at: input.timeline_start + leadDuration, rate, duration: fastDuration },
    { role: "payoff", start: b, end, at: input.timeline_start + leadDuration + fastDuration, rate: 1, duration: end - b },
  ];
}

export const hyperspeedBlock: BlockDefinition<HyperspeedInputs> = {
  kind: "hyperspeed", version: 1, label: "Hyperspeed",
  description: "One continuous take: normal lead, bounded accelerated middle and normal payoff. Supply source marks and actual source duration. Middle audio is always muted; normal handles optionally retain original sound at original pitch. A supplied source-clock temporal-average derivative can blend over the fast section; without it, directional blur is a spatial approximation.",
  inputs: hyperspeedInputs,
  settings: {
    speed: { kind: "number", label: "Speed", unit: "factor", min: 1, max: MAX_SPEED_RATE, step: .1, default: 15, off: 1, tier: "main" },
    blur: { kind: "number", label: "Blur", unit: "percent", min: 0, max: 100, step: 1, default: i => i.temporal_blur ? 100 : 10, off: 0, tier: "main",
      description: "With a prepared temporal derivative: blend amount. Otherwise directional smear as a percentage of 1080px canvas width, applied only in the fast section. 0 is sharp; at Speed 1 blur is disabled." },
    blur_axis: { kind: "choice", label: "Blur direction", tier: "advanced", default: "horizontal", hidden: i => Boolean(i.temporal_blur), choices: [
      { value: "horizontal", label: "Horizontal" }, { value: "vertical", label: "Vertical" },
    ] },
    audio: { kind: "choice", label: "Original sound", tier: "main", default: "handles", choices: [
      { value: "handles", label: "Before and after" }, { value: "silent", label: "Silent" },
    ], description: "Accelerated sound is always muted. Retained lead/payoff sound runs at 1×, original pitch. No automatic sound replacement or pitch shifting." },
    volume: { kind: "number", label: "Volume", unit: "percent", min: 0, max: 200, step: 1, default: 100, off: 0, tier: "advanced" },
  },
  instances: () => ({}),
  compile(input, settings, context) {
    if (input.temporal_blur && input.temporal_blur.frame_rate !== context.fps) throw new Error("Temporal blur cadence must match project frame rate");
    const windows = hyperspeedWindows(input, Number(settings.speed), context.fps);
    const ref = (role: string, index = 0) => ({ element_id: blockElementId(context, role, index), block_ref: { block_id: context.block_id, role, index } });
    return [
      ...(input.temporal_blur ? [{ ...ref("order"), set_lane_order: { lane_order_keys: input.lane_order_keys! } }] : []),
      ...input.replace_element_ids.map((element_id, index) => ({ ...ref("remove", index), element_id,
        remove_visual: { reason: "Replace with source-continuous Hyperspeed sections" } })),
      ...windows.map(window => ({ ...ref(window.role), create_visual: {
        type: "video_clip", title: window.role === "lead" ? "Normal lead" : window.role === "fast" ? "Hyperspeed middle" : "Normal payoff",
        source_url: input.source.source_url, source_duration_seconds: input.source.source_duration_seconds,
        source_start_seconds: window.start, source_end_seconds: window.end, timeline_start: window.at,
        playback_rate: window.rate, ...input.lane,
        volume: window.role === "fast" || settings.audio === "silent" ? 0 : Number(settings.volume) / 100,
        ...(window.role === "fast" ? {
          directional_blur_x: !input.temporal_blur && settings.blur_axis === "horizontal" && Number(settings.speed) > 1 ? Number(settings.blur) * 10.8 : 0,
          directional_blur_y: !input.temporal_blur && settings.blur_axis === "vertical" && Number(settings.speed) > 1 ? Number(settings.blur) * 10.8 : 0,
        } : {}),
      } })),
      ...(input.temporal_blur ? [{ ...ref("fast_blur"), create_visual: {
        type: "video_clip", title: "Temporal motion blur", source_url: input.temporal_blur.source_url,
        source_duration_seconds: input.temporal_blur.source_duration_seconds,
        source_start_seconds: windows[1]!.start, source_end_seconds: windows[1]!.end,
        timeline_start: windows[1]!.at, playback_rate: windows[1]!.rate, volume: 0,
        media_opacity: Number(settings.speed) > 1 ? Number(settings.blur) / 100 : 0, ...input.blur_lane,
      } }] : []),
    ];
  },
};
