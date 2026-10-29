import { z } from "zod";
import { blockElementId, framesToSeconds, secondsToFrames, type BlockContext, type BlockDefinition, type BlockOperation, type ResolvedBlockSettings } from "./proposal-block-kit";

/**
 * flash_sequence (docs/architecture/proposal-building-blocks.md): a subject's poses replace each other
 * on a locked-off shot, each landing with a one-frame white flash and glow, over the empty set, then
 * the take plays live. Built from cut-outs of one take; nothing moves between poses, so no blur and
 * no streak. Any effect whose subject appears pose by pose may use it (the Flash effect template).
 */

const finite = z.number().finite();
const laneSchema = z.object({ lane_key: z.string().min(1).max(128).regex(/^[a-z0-9_:-]+$/), lane_index: z.number().int().min(0) }).strict();
const sourceSchema = z.object({ source_url: z.string().min(1).max(2048), source_duration_seconds: finite.gt(0) }).strict();
const cutoutSchema = sourceSchema.extend({
  source_offset_seconds: finite.min(0).default(0).describe("Where the cut-out file starts on the footage's clock: cut-out time = footage time − this."),
});
const colorGradeSchema = z.record(z.string(), z.unknown()).optional().describe("A colour grade every produced clip copies (the footage's existing grade).");

const MAX_POSE_FRAMES = 8;

const poseSchema = z.object({
  label: z.string().trim().min(1).max(120).describe("The pose's name on the card: a place or thing the creator can see (\"the swings\", \"path bend\"), never a mark number.")
    .refine(label => !/^\s*(mark|stop|pose)\s*#?\d+\s*$/i.test(label), "name the pose by a place the creator can see, not a mark number"),
  cutout: cutoutSchema.describe(`The pose's prepared cut-out (cutout_status), covering ${MAX_POSE_FRAMES} frames from at_seconds so every pose length compiles.`),
  at_seconds: finite.min(0).describe("Footage time of the pose's first frame: where the subject is in this pose (visual_activity_prepare holds at the creator's marks, or the mark itself)."),
}).strict();

const flashSequenceInputs = z.object({
  source: sourceSchema.optional().describe("The locked-off take; needed for line_end_seconds."),
  empty_set: z.object({
    type: z.enum(["video_clip", "still"]).default("video_clip"),
    source_url: z.string().min(1).max(2048),
    source_duration_seconds: finite.gt(0).optional(),
    source_start_seconds: finite.min(0).default(0),
  }).strict().describe("The same framing with nobody in it, shown under the poses."),
  poses: z.array(poseSchema).min(2).max(16).describe("The poses in order. The last one lands where the take goes live when line_end_seconds is set."),
  line_end_seconds: finite.gt(0).optional().describe("When the creator speaks after the last pose: footage time the line ends. The take then plays live with sound from the end of the last pose to here."),
  lanes: z.object({ base: laneSchema, top: laneSchema }).strict().default({ base: { lane_key: "visual_0", lane_index: 0 }, top: { lane_key: "visual_1", lane_index: 1 } }),
  lane_order_keys: z.array(z.string().min(1).max(128).regex(/^[a-z0-9_:-]+$/)).min(1).max(64).optional().describe("Complete top-first lane order, when the sequence registers a new lane."),
  remove_element_ids: z.array(z.string().uuid()).max(32).default([]).describe("Existing clips the sequence replaces (the raw walk)."),
  timeline_start: finite.min(0).default(0),
  color_grade: colorGradeSchema,
  sound: sourceSchema.extend({
    lane: laneSchema.default({ lane_key: "sound_effect_0", lane_index: 0 }),
    peak_seconds: finite.min(0).default(0).describe("Where the click is loudest (sfx_search peak_time_seconds); it lands on the flash frame."),
    title: z.string().trim().min(1).max(120).optional(),
  }).strict().optional().describe("A camera shutter click on every flash (sfx_search \"camera shutter click\"); the card gets one Click volume dial."),
}).strict().superRefine((inputs, ctx) => {
  if (inputs.line_end_seconds !== undefined) {
    const last = inputs.poses.at(-1)!;
    if (!inputs.source || inputs.line_end_seconds <= last.at_seconds || inputs.line_end_seconds > inputs.source.source_duration_seconds + 1e-6) {
      ctx.addIssue({ code: "custom", path: ["line_end_seconds"], message: "needs the source, must follow the last pose and stay inside the footage" });
    }
  }
  if (inputs.empty_set.type === "video_clip" && inputs.empty_set.source_duration_seconds === undefined) {
    ctx.addIssue({ code: "custom", path: ["empty_set", "source_duration_seconds"], message: "a video empty set needs its source duration" });
  }
});
type FlashSequenceInputs = z.infer<typeof flashSequenceInputs>;

const round = (value: number) => Math.round(value * 1e6) / 1e6;
const num = (settings: ResolvedBlockSettings, field: string) => {
  const value = settings[field];
  if (typeof value !== "number") throw new Error(`Setting ${field} must be a number`);
  return value;
};

function compileFlashSequence(inputs: FlashSequenceInputs, settings: ResolvedBlockSettings, context: BlockContext): BlockOperation[] {
  const fps = context.fps;
  const poseFrames = Math.round(num(settings, "pose_frames"));
  const flashFrames = Math.round(num(settings, "flash_frames"));
  const flash = num(settings, "flash_percent") / 100;
  const glow = num(settings, "glow");
  const poseSpan = framesToSeconds(poseFrames, fps);
  const flashEnd = round(framesToSeconds(flashFrames, fps));
  const ref = (role: string, index: number) => ({ element_id: blockElementId(context, role, index), block_ref: { block_id: context.block_id, role, index } });
  const grade = inputs.color_grade ? { color_grade: inputs.color_grade } : {};
  const operations: BlockOperation[] = [];
  if (inputs.lane_order_keys) {
    const soundLane = inputs.sound?.lane.lane_key;
    const keys = soundLane && !inputs.lane_order_keys.includes(soundLane) ? [...inputs.lane_order_keys, soundLane] : inputs.lane_order_keys;
    operations.push({ ...ref("lane_order", 0), set_lane_order: { lane_order_keys: keys } });
  }
  for (const [index, id] of inputs.remove_element_ids.entries()) {
    operations.push({ element_id: id, block_ref: { block_id: context.block_id, role: "remove", index }, remove_visual: { reason: "The walk becomes flashed poses cut out of the same take." } });
  }
  const startFrame = secondsToFrames(inputs.timeline_start, fps);
  const poses: BlockOperation[] = inputs.poses.map((pose, index) => {
    const sourceStart = round(pose.at_seconds - pose.cutout.source_offset_seconds);
    const sourceEnd = round(sourceStart + poseSpan);
    if (sourceStart < -1e-6 || sourceEnd > pose.cutout.source_duration_seconds + 1e-6) {
      throw new Error(`${pose.label}: needs cut-out frames from ${sourceStart}s to ${sourceEnd}s but the cut-out covers 0 to ${pose.cutout.source_duration_seconds}s`);
    }
    // A hold ease keeps the flash on whole frames: white for flash_frames, then the pose's own colour.
    const hit = (value: number) => [{ t: 0, v: round(value), ease: "hold" }, { t: flashEnd, v: 0, ease: "hold" }];
    return {
      ...ref("pose", index),
      create_visual: {
        type: "video_clip", source_url: pose.cutout.source_url, title: `You at ${pose.label}`, has_alpha: true,
        timeline_start: framesToSeconds(startFrame + index * poseFrames, fps), source_duration_seconds: pose.cutout.source_duration_seconds,
        source_start_seconds: Math.max(0, sourceStart), source_end_seconds: sourceEnd, volume: 0,
        lane_key: inputs.lanes.top.lane_key, lane_index: inputs.lanes.top.lane_index,
        subject_flash: round(flash), subject_glow: round(glow), subject_glow_radius: 12,
        transition_keyframes: { subject_flash: hit(flash), subject_glow: hit(glow) },
        ...grade,
      },
    };
  });
  const posesEndFrame = startFrame + inputs.poses.length * poseFrames;
  const clips: BlockOperation[] = [...poses];
  if (inputs.line_end_seconds !== undefined) {
    // The take goes live from the frame after the last pose, so the cut-out and the footage join seamlessly.
    const source = inputs.source!, last = inputs.poses.at(-1)!;
    if (inputs.line_end_seconds <= last.at_seconds + poseSpan) throw new Error(`${last.label}: the line ends before the pose does`);
    clips.push({
      ...ref("line", 0),
      create_visual: {
        type: "video_clip", source_url: source.source_url, title: "Your line to camera", timeline_start: framesToSeconds(posesEndFrame, fps),
        source_duration_seconds: source.source_duration_seconds, source_start_seconds: round(last.at_seconds + poseSpan), source_end_seconds: round(inputs.line_end_seconds),
        lane_key: inputs.lanes.top.lane_key, lane_index: inputs.lanes.top.lane_index, volume: 1, ...grade,
      },
    });
  }
  const emptySeconds = framesToSeconds(posesEndFrame - startFrame, fps);
  const emptySet = inputs.empty_set;
  const emptyStart = framesToSeconds(startFrame, fps);
  if (emptySet.type === "still") {
    operations.push({ ...ref("empty_set", 0), create_visual: { type: "still", source_url: emptySet.source_url, title: "Empty set", timeline_start: emptyStart,
      duration_seconds: emptySeconds, lane_key: inputs.lanes.base.lane_key, lane_index: inputs.lanes.base.lane_index, ...grade } });
  } else {
    // A short empty window covers the poses slowed down; the slowest rate that fits.
    const available = emptySet.source_duration_seconds! - emptySet.source_start_seconds;
    const rate = [0.25, 0.5, 1].find(candidate => emptySeconds * candidate <= available + 1e-6);
    if (rate === undefined) throw new Error(`the empty set has ${round(available)}s of footage but the poses need ${round(emptySeconds)}s even at real speed`);
    operations.push({ ...ref("empty_set", 0), create_visual: { type: "video_clip", source_url: emptySet.source_url, title: "Empty set", timeline_start: emptyStart,
      source_duration_seconds: emptySet.source_duration_seconds!, source_start_seconds: emptySet.source_start_seconds, source_end_seconds: round(emptySet.source_start_seconds + emptySeconds * rate),
      playback_rate: rate, volume: 0, lane_key: inputs.lanes.base.lane_key, lane_index: inputs.lanes.base.lane_index, ...grade } });
  }
  return [...operations, ...clips, ...shutterClicks(inputs, poses, poseSpan, num(settings, "sound_volume") / 100, context)];
}

/**
 * A click on every flash, locked to its pose so the Time per pose dial carries it; the loudest moment
 * lands on the flash frame. Each stops before the next pose's click so they never stack on one lane.
 */
function shutterClicks(inputs: FlashSequenceInputs, poses: BlockOperation[], poseSpan: number, volume: number, context: BlockContext): BlockOperation[] {
  const sound = inputs.sound;
  if (!sound) return [];
  // A click starts no earlier than the sequence or halfway from the previous flash; when that leaves less than its
  // lead, it starts later in the file so the peak still lands on the flash. Each ends where the next begins.
  const flashes = poses.map(pose => (pose.create_visual as { timeline_start: number }).timeline_start);
  const placed = poses.map((pose, index) => {
    const at = flashes[index]!;
    const earliest = index ? (flashes[index - 1]! + at) / 2 : Math.min(at, inputs.timeline_start);
    const lead = Math.min(sound.peak_seconds, at - earliest);
    return { pose, lead, start: at - lead, skip: sound.peak_seconds - lead };
  });
  return placed.map(({ pose, lead, start, skip }, index) => {
    const next = placed[index + 1];
    const room = next ? next.start - start : poseSpan;
    const end = Math.floor(Math.min(sound.source_duration_seconds, skip + room) * 1e6) / 1e6;
    return {
      element_id: blockElementId(context, "click", index), block_ref: { block_id: context.block_id, role: "click", index },
      create_audio: {
        type: "sound_effect", title: sound.title ?? `Shutter click (${inputs.poses[index]!.label})`, source_url: sound.source_url,
        timeline_start: round(start), source_duration_seconds: sound.source_duration_seconds, source_start_seconds: round(skip), source_end_seconds: end,
        lane_key: sound.lane.lane_key, lane_index: sound.lane.lane_index, volume: round(volume),
        follows_visual: { element_id: pose.element_id, offset_seconds: round(-lead) },
      },
    };
  });
}

export const flashSequenceBlock: BlockDefinition<FlashSequenceInputs> = {
  kind: "flash_sequence", version: 1, label: "Flash poses",
  description: "Cut-out poses of one locked-off take replace each other over the empty set, each landing with a white flash and glow (the Flash effect), with a shutter click on every flash; then the take can play live for a line. Nothing moves between poses.",
  inputs: flashSequenceInputs,
  settings: {
    pose_frames: { kind: "number", label: "Time per pose", unit: "frames", min: 2, max: MAX_POSE_FRAMES, step: 1, default: 4, tier: "main", description: "Frames each pose stays before the next flashes in; fewer is faster." },
    flash_percent: { kind: "number", label: "White flash", unit: "percent", min: 0, max: 100, step: 1, default: 100, off: 0, tier: "main", description: "How white each pose lands; 0 is no flash." },
    glow: { kind: "number", label: "Glow", unit: "factor", min: 0, max: 3, step: 0.1, default: 1.5, off: 0, tier: "main", description: "The halo around each pose as it flashes; 0 is none." },
    sound_volume: { kind: "number", label: "Click volume", unit: "percent", min: 0, max: 200, step: 1, default: 70, off: 0, tier: "main", hidden: inputs => !(inputs as FlashSequenceInputs).sound, description: "Loudness of every shutter click; 0 is silent." },
    flash_frames: { kind: "number", label: "Flash length", unit: "frames", min: 1, max: 2, step: 1, default: 1, tier: "advanced", description: "Frames each flash stays white." },
  },
  instances: () => ({}),
  compile: compileFlashSequence,
};
