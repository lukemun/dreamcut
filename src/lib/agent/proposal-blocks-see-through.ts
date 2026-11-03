import { z } from "zod";
import { blockElementId, framesToSeconds, secondsToFrames, type BlockDefinition, type BlockOperation } from "./proposal-block-kit";

const finite = z.number().finite();
const laneKey = z.string().regex(/^[a-z0-9_:-]{1,128}$/);
const lane = z.object({ lane_key: laneKey, lane_index: finite.int().min(0) }).strict();
const inputsSchema = z.object({
  take: z.object({
    source_url: z.string().min(1).max(2048),
    source_duration_seconds: finite.positive(),
    source_sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  }).strict().describe("The one long take holding both performances: first the base, later the part the copy comes from."),
  base_start_seconds: finite.min(0).describe("Take second where the base window starts. The base plays uncut from here with its own sound."),
  duration_seconds: finite.positive().describe("Length of the base window. The copy ends with it, while the base pose still holds."),
  cutout: z.object({
    source_url: z.string().min(1).max(2048).describe("The whole-person cut-out clip (alpha) from cutout_prepare on the later part of the take."),
    source_duration_seconds: finite.positive(),
    take_offset_seconds: finite.min(0).describe("Take second at cut-out second 0 (cutout_status reports the prepared window)."),
    cutout_id: z.string().min(1).max(128).optional().describe("The cut-out receipt id, for the card's record."),
  }).strict(),
  clock_offset_seconds: finite.positive().describe("How far the copy runs ahead in the take: copy take second = base take second + this offset. Measured from the take (the copy's line lands where it should against the base's)."),
  copy_start_seconds: finite.min(0).default(0).describe("Seconds into the base window where the copy first shows. Before the rise the copy sits on the body, so a short lead hides nothing."),
  copy_line: z.object({
    source_start_seconds: finite.min(0),
    source_end_seconds: finite.positive(),
  }).strict().optional().describe("The copy's spoken line in take seconds. It plays on the copy's clock, so the timing dial carries it."),
  titles: z.object({ base: z.string().min(1).max(120), copy: z.string().min(1).max(120), line: z.string().min(1).max(120) }).partial().strict().default({})
    .describe("Clip names the creator sees, e.g. \"Ghost of the man standing up\"."),
  timeline_start: finite.min(0).default(0),
  lanes: z.object({ base: lane, copy: lane, line: lane }).strict().default({
    base: { lane_key: "visual_0", lane_index: 0 }, copy: { lane_key: "visual_1", lane_index: 1 }, line: { lane_key: "audio_1", lane_index: 1 },
  }),
  lane_order_keys: z.array(laneKey).min(2).max(64).describe("Complete top-first lane order with the copy lane above the base lane."),
  remove_element_ids: z.array(z.string().uuid()).max(32).default([]),
}).strict().superRefine((input, ctx) => {
  const order = input.lane_order_keys;
  const copy = order.indexOf(input.lanes.copy.lane_key), base = order.indexOf(input.lanes.base.lane_key);
  if (new Set(order).size !== order.length || copy < 0 || base < 0 || copy >= base) {
    ctx.addIssue({ code: "custom", path: ["lane_order_keys"], message: "Use distinct lanes with the copy above the base in the complete top-first order." });
  }
  if (input.copy_start_seconds >= input.duration_seconds) ctx.addIssue({ code: "custom", path: ["copy_start_seconds"], message: "The copy must start inside the base window." });
  const line = input.copy_line;
  if (line && line.source_end_seconds <= line.source_start_seconds) ctx.addIssue({ code: "custom", path: ["copy_line", "source_end_seconds"], message: "The copy's line must end after it starts." });
  if (line && line.source_end_seconds > input.take.source_duration_seconds + 1e-6) ctx.addIssue({ code: "custom", path: ["copy_line", "source_end_seconds"], message: "The copy's line runs past the end of the take." });
});
type Inputs = z.infer<typeof inputsSchema>;

/**
 * A see-through cut-out of the person from later in the same take plays over the base window, so a
 * copy rises out of the body and acts on its own. The copy keeps the take's clock, offset ahead of
 * the base; its spoken line rides that clock, and one timing dial moves the copy and its line together.
 */
export const seeThroughCopyBlock: BlockDefinition<Inputs> = {
  kind: "see_through_copy", version: 1, label: "See-through copy",
  description: "Over a continuous base window of one long take, play a translucent whole-person cut-out of the same person from later in that take, offset on the take's clock, so a copy rises out of the body and acts on its own; the copy's line plays on its clock. Needs both performances in one locked take, the later part starting from the base pose, and a cut-out of that later part. Line windows and the offset are measured on the take.",
  inputs: inputsSchema,
  settings: {
    opacity: { kind: "number", label: "Opacity", unit: "percent", min: 0, max: 100, step: 1, default: 50, tier: "main",
      description: "How solid the copy looks; 0 hides it." },
    line_timing_frames: { kind: "number", label: "Line timing", unit: "frames", min: -30, max: 30, step: 1, default: 0, tier: "main",
      description: "Move the copy and its line later (positive) or earlier against the base. Clamped to the cut-out's handles." },
    line_volume: { kind: "number", label: "Copy line level", unit: "percent", min: 0, max: 200, step: 1, default: 100, off: 0, tier: "main", hidden: inputs => !inputs.copy_line,
      description: "Level of the copy's line." },
    base_volume: { kind: "number", label: "Base sound", unit: "percent", min: 0, max: 200, step: 1, default: 100, off: 0, tier: "advanced" },
    line_fade_in_frames: { kind: "number", label: "Line fade in", unit: "frames", min: 0, max: 30, step: 1, default: 1, tier: "advanced", hidden: inputs => !inputs.copy_line },
    line_fade_out_frames: { kind: "number", label: "Line fade out", unit: "frames", min: 0, max: 30, step: 1, default: 3, tier: "advanced", hidden: inputs => !inputs.copy_line },
  },
  instances: () => ({}),
  compile: (input, settings, context) => {
    const n = (key: string) => settings[key] as number;
    const fps = context.fps;
    const frames = secondsToFrames(input.duration_seconds, fps);
    if (frames < 2) throw new Error("The base window needs at least two output frames.");
    const duration = framesToSeconds(frames, fps);
    if (input.base_start_seconds + duration > input.take.source_duration_seconds + 1e-6) throw new Error(`The base window needs ${duration}s of the take from ${input.base_start_seconds}s.`);
    const copyStart = Math.min(framesToSeconds(secondsToFrames(input.copy_start_seconds, fps), fps), duration - 1 / fps);
    // Copy take second at base-window second t = base_start + t + clock offset - timing; positive timing
    // shows the copy's action later, so it reads earlier take. Unrounded at reset; clamped to the cut-out.
    const cutout = input.cutout;
    const atReset = input.base_start_seconds + input.clock_offset_seconds - cutout.take_offset_seconds;
    const earliest = -Math.floor((cutout.source_duration_seconds - atReset - duration) * fps + 1e-7);
    const latest = Math.floor((atReset + copyStart) * fps + 1e-7);
    if (earliest > latest) throw new Error(`The cut-out needs ${duration - copyStart}s from cut-out second ${atReset + copyStart}.`);
    const timing = Math.max(earliest, Math.min(latest, Math.round(n("line_timing_frames")))) / fps;
    const copyClock = atReset - timing; // cut-out second shown at base-window second 0
    const start = framesToSeconds(secondsToFrames(input.timeline_start, fps), fps);
    const ref = (role: string) => ({ element_id: blockElementId(context, role), block_ref: { block_id: context.block_id, role, index: 0 } });
    const operations: BlockOperation[] = input.remove_element_ids.map((id, index) => ({ element_id: id, block_ref: { block_id: context.block_id, role: "remove", index }, remove_visual: { reason: "Replace with the base window and its see-through copy." } }));
    operations.push({ ...ref("lane_order"), set_lane_order: { lane_order_keys: input.lane_order_keys } });
    operations.push({ ...ref("base"), create_visual: {
      type: "video_clip", title: input.titles.base ?? "Base performance", source_url: input.take.source_url,
      source_duration_seconds: input.take.source_duration_seconds, source_start_seconds: input.base_start_seconds,
      source_end_seconds: input.base_start_seconds + duration, timeline_start: start, volume: n("base_volume") / 100, ...input.lanes.base,
    } });
    const copy = ref("copy");
    operations.push({ ...copy, create_visual: {
      type: "video_clip", title: input.titles.copy ?? "See-through copy", source_url: cutout.source_url,
      source_duration_seconds: cutout.source_duration_seconds, source_start_seconds: copyClock + copyStart, source_end_seconds: copyClock + duration,
      timeline_start: start + copyStart, volume: 0, media_opacity: n("opacity") / 100, has_alpha: true, ...input.lanes.copy,
    } });
    const line = input.copy_line;
    if (!line) return operations;
    // The line keeps the copy's clock: take second s plays at base-window second s - offset of the copy,
    // trimmed to the copy's span; a timing that leaves no line inside it keeps one silent frame.
    const frame = 1 / fps;
    const toWindow = (takeSecond: number) => takeSecond - cutout.take_offset_seconds - copyClock;
    const from = Math.max(toWindow(line.source_start_seconds), copyStart), to = Math.min(toWindow(line.source_end_seconds), duration);
    const audible = from < to - frame;
    const lineStart = audible ? from : Math.min(duration - frame, Math.max(copyStart, from));
    const sourceStart = audible ? line.source_start_seconds + (from - toWindow(line.source_start_seconds)) : Math.max(line.source_start_seconds, line.source_end_seconds - frame);
    const sourceEnd = audible ? line.source_end_seconds - (toWindow(line.source_end_seconds) - to) : line.source_end_seconds;
    operations.push({ ...ref("line"), create_audio: {
      type: "vo_segment", title: input.titles.line ?? "The copy's line", source_url: input.take.source_url,
      ...(input.take.source_sha256 ? { source_sha256: input.take.source_sha256 } : {}),
      timeline_start: start + lineStart, source_duration_seconds: input.take.source_duration_seconds,
      source_start_seconds: sourceStart, source_end_seconds: sourceEnd, ...input.lanes.line,
      volume: audible ? n("line_volume") / 100 : 0, fade_in: framesToSeconds(n("line_fade_in_frames"), fps), fade_out: framesToSeconds(n("line_fade_out_frames"), fps), playback_rate: 1,
      follows_visual: { element_id: copy.element_id, offset_seconds: lineStart - copyStart },
    } });
    return operations;
  },
};
