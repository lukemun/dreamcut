import { z } from "zod";
import { blockElementId, framesToSeconds, secondsToFrames, type BlockDefinition, type BlockOperation } from "./proposal-block-kit";

const finite = z.number().finite();
const lane = z.object({ lane_key: z.string().regex(/^visual_\d+$/), lane_index: finite.int().min(0) }).strict();
const source = z.object({ source_url: z.string().min(1).max(2048), source_duration_seconds: finite.positive(), source_start_seconds: finite.min(0).default(0) }).strict();
const point = z.object({ x: finite.min(-20).max(120), y: finite.min(-20).max(120) }).strict();
export const keyedStillMotionInputs = z.object({
  background: source.extend({ type: z.enum(["video_clip", "still"]).default("video_clip") }).describe("Untreated continuous locked-camera take or explicitly declared still plate. A flattened effect demonstration is not this input; a tutorial-derived still must retain its frame/crop receipt."),
  photograph: z.object({ source_url: z.string().min(1).max(2048), key_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    mask_inset: z.array(finite.min(0).max(.95)).length(4),
  }).strict().refine(p => p.mask_inset[0]! + p.mask_inset[2]! < 1 && p.mask_inset[1]! + p.mask_inset[3]! < 1, "Garbage mask must retain a nonempty rectangle.")
    .describe("Separate book photograph on green paper, centred in its display-oriented canvas; pick a midtone green and measure a rectangle outside the book, [top,right,bottom,left]. Retain the unchanged photo."),
  foreground: source.extend({ has_alpha: z.literal(true) }).optional().describe("Optional prepared hand/foreground alpha clip on its own source clock, registered to the background; never a flattened tutorial crop."),
  canvas: z.object({ width: finite.int().positive().max(8192), height: finite.int().positive().max(8192) }).strict()
    .refine(c => c.width / c.height >= 9 / 16 && c.width / c.height <= 16 / 9, "Use an aspect ratio between 9:16 and 16:9."),
  duration_seconds: finite.positive().max(150),
  from: point, to: point,
  timeline_start: finite.min(0).default(0),
  lanes: z.object({ background: lane, photograph: lane, camera: lane, foreground: lane }).strict().default({
    background: { lane_key: "visual_0", lane_index: 0 }, photograph: { lane_key: "visual_1", lane_index: 1 },
    camera: { lane_key: "visual_2", lane_index: 2 }, foreground: { lane_key: "visual_3", lane_index: 3 },
  }),
  lane_order_keys: z.array(z.string().regex(/^[a-z0-9_:-]{1,128}$/)).min(3).max(64).describe("Complete top-first lane order: foreground (if supplied), camera, photograph, background, retaining unrelated lanes."),
  remove_element_ids: z.array(z.string().uuid()).max(32).default([]),
}).strict().superRefine((i, ctx) => {
  const keys = [i.lanes.camera.lane_key, i.lanes.photograph.lane_key, i.lanes.background.lane_key];
  if (i.foreground) keys.unshift(i.lanes.foreground.lane_key);
  if (new Set(i.lane_order_keys).size !== i.lane_order_keys.length || new Set(keys).size !== keys.length || keys.some((k, n) => i.lane_order_keys.indexOf(k) < 0 || (n > 0 && i.lane_order_keys.indexOf(keys[n - 1]!) >= i.lane_order_keys.indexOf(k)))) {
    ctx.addIssue({ code: "custom", path: ["lane_order_keys"], message: "Use distinct ordered lanes: foreground above camera above photograph above background." });
  }
});
type Inputs = z.infer<typeof keyedStillMotionInputs>;

/** Correct only division residue at the native focus limit; invalid fits remain invalid. */
export function snapKeyedStillFocusRoundoff(v: number) {
  return Math.abs(v) <= 2 + 1e-12 ? Math.max(-2, Math.min(2, v)) : v;
}

/** Reusable keyed still + native camera; all motion remains normal editable keyframes. */
export const keyedStillMotionBlock: BlockDefinition<Inputs> = {
  kind: "keyed_still_motion", version: 1, label: "Floating Book",
  description: "A keyed photograph floats over a continuous background, with an optional registered foreground matte. A photograph camera moves the keyed image and its static garbage mask together; a separate scene camera provides a shared push-in. No segmentation, hidden pixels or contact shadows are invented. Draft: visual and fresh-footage acceptance pending.",
  inputs: keyedStillMotionInputs,
  settings: {
    travel: { kind: "number", label: "Movement", unit: "percent", min: 0, max: 100, step: 1, default: 0, off: 0, tier: "main" },
    turn: { kind: "number", label: "Turn", unit: "degrees", min: -180, max: 180, step: .5, default: 0, off: 0, tier: "main" },
    size: { kind: "number", label: "Book size", unit: "percent", min: 20, max: 100, step: 1, default: 30, tier: "main" },
    growth: { kind: "number", label: "Size change", unit: "percent", min: 0, max: 200, step: 1, default: 0, off: 0, tier: "main" },
    start_x: { kind: "number", label: "Start horizontal", unit: "percent", min: -20, max: 120, step: .5, default: i => i.from.x, tier: "advanced" },
    start_y: { kind: "number", label: "Start vertical", unit: "percent", min: -20, max: 120, step: .5, default: i => i.from.y, tier: "advanced" },
    end_x: { kind: "number", label: "End horizontal", unit: "percent", min: -20, max: 120, step: .5, default: i => i.to.x, tier: "advanced" },
    end_y: { kind: "number", label: "End vertical", unit: "percent", min: -20, max: 120, step: .5, default: i => i.to.y, tier: "advanced" },
    start_angle: { kind: "number", label: "Starting angle", unit: "degrees", min: -180, max: 180, step: .5, default: 0, tier: "advanced" },
    background_size: { kind: "number", label: "Background size", unit: "percent", min: 100, max: 200, step: .1, default: 100, tier: "advanced" },
    background_x: { kind: "number", label: "Background horizontal", unit: "percent", min: -25, max: 25, step: .1, default: 0, tier: "advanced" },
    background_y: { kind: "number", label: "Background vertical", unit: "percent", min: -25, max: 25, step: .1, default: 0, tier: "advanced" },
    scene_zoom: { kind: "number", label: "Scene zoom", unit: "percent", min: 0, max: 50, step: .5, default: 0, off: 0, tier: "advanced" },
    scene_exposure: { kind: "number", label: "Scene brightness", unit: "stops", min: -1, max: 1, step: .05, default: 0, tier: "advanced" },
    tolerance: { kind: "number", label: "Green removal", unit: "percent", min: 0, max: 100, step: 1, default: 18, tier: "advanced", description: "Raise only until paper disappears; excessive removal can erase reflective blue areas. Review the actual photograph on light and dark backgrounds." },
    softness: { kind: "number", label: "Key softness", unit: "percent", min: 0, max: 100, step: 1, default: 8, tier: "advanced" },
    spill: { kind: "number", label: "Green spill", unit: "percent", min: 0, max: 100, step: 1, default: 25, tier: "advanced" },
    feather: { kind: "number", label: "Mask softness", unit: "percent", min: 0, max: 5, step: .1, default: .2, tier: "advanced", description: "Feather is canvas-height based. The garbage mask needs margin outside the book; this does not repair holes made by an excessive chroma tolerance." },
    tint: { kind: "number", label: "Book tint", unit: "percent", min: -100, max: 100, step: 1, default: 0, tier: "advanced" },
    warmth: { kind: "number", label: "Book warmth", unit: "percent", min: -100, max: 100, step: 1, default: 0, tier: "advanced" },
    exposure: { kind: "number", label: "Book brightness", unit: "stops", min: -2, max: 2, step: .05, default: 0, tier: "advanced" },
    image_softness: { kind: "number", label: "Book softness", unit: "percent", min: 0, max: 100, step: 1, default: 0, off: 0, tier: "advanced", description: "Softens photographic detail and the outline, keeping apparent softness steady as the book grows. Does not change green removal." },
    contrast: { kind: "number", label: "Book contrast", unit: "percent", min: 0, max: 200, step: 1, default: 100, tier: "advanced" },
    saturation: { kind: "number", label: "Book saturation", unit: "percent", min: 0, max: 200, step: 1, default: 100, tier: "advanced" },
    ease: { kind: "choice", label: "Motion", choices: [{ value: "linear", label: "Even" }, { value: "smooth", label: "Gentle start and stop" }], default: "linear", tier: "advanced" },
  },
  instances: () => ({}),
  compile: (i, settings, ctx) => {
    const n = (k: string) => settings[k] as number;
    const frames = secondsToFrames(i.duration_seconds, ctx.fps);
    if (frames < 2) throw new Error("Floating photograph needs at least two output frames.");
    const duration = framesToSeconds(frames, ctx.fps), span = framesToSeconds(frames - 1, ctx.fps);
    for (const [role, take] of [["Background", i.background], ["Foreground", i.foreground]] as const) {
      if (role === "Background" && i.background.type === "still") continue;
      if (take && take.source_start_seconds + duration > take.source_duration_seconds + 1e-6) throw new Error(`${role} needs ${duration}s of real source handles.`);
    }
    const start = framesToSeconds(secondsToFrames(i.timeline_start, ctx.fps), ctx.fps);
    const ref = (role: string) => ({ element_id: blockElementId(ctx, role), block_ref: { block_id: ctx.block_id, role, index: 0 } });
    const ops: BlockOperation[] = i.remove_element_ids.map((id, index) => ({ element_id: id, block_ref: { block_id: ctx.block_id, role: "remove", index }, remove_visual: { reason: "Replace with editable keyed photograph construction." } }));
    // Cameras are clips and each needs a free lane, though neither draws pixels.
    const sceneLaneIndex = Math.max(...Object.values(i.lanes).map(l => l.lane_index), ...i.lane_order_keys.map(k => Number(k.match(/^visual_(\d+)$/)?.[1] ?? 0))) + 1;
    const sceneLane = { lane_key: `visual_${sceneLaneIndex}`, lane_index: sceneLaneIndex };
    ops.push({ ...ref("lane_order"), set_lane_order: { lane_order_keys: [sceneLane.lane_key, ...i.lane_order_keys] } });
    const video = (role: "background" | "foreground", take: z.infer<typeof source>, alpha = false) => ({ ...ref(role), create_visual: {
      type: "video_clip", title: role === "background" ? "Continuous background" : "Foreground occlusion", ...i.lanes[role],
      ...take, source_end_seconds: take.source_start_seconds + duration, timeline_start: start, volume: alpha ? 0 : 1,
      ...(alpha ? { has_alpha: true } : {}),
    } });
    const sceneCameraId = blockElementId(ctx, "scene_camera");
    const backgroundProps = { media_scale: n("background_size") / 100,
      media_offset_x: n("background_x") / 50, media_offset_y: n("background_y") / 50,
      camera_id: sceneCameraId, color_grade: { grade_exposure_ev: n("scene_exposure") } };
    if (i.background.type === "still") ops.push({ ...ref("background"), create_visual: {
      type: "still", title: "Still background plate", source_url: i.background.source_url,
      ...i.lanes.background, timeline_start: start, duration_seconds: duration, volume: 0, ...backgroundProps,
    } });
    else { const op = video("background", i.background); ops.push({ ...op, create_visual: { ...op.create_visual, ...backgroundProps } }); }
    // At most 120 native keys. Exact on each frame for <=120 frames; longer paths use
    // evenly spaced output frames and linear interpolation between them (not a baked clip).
    const count = Math.min(frames, 120);
    // Keep the image and garbage mask centred and static before the outer camera.
    // Translating a viewport mask and clamping its insets before rotation clips the
    // object prematurely near the frame edge. The camera transforms both together.
    // Base scale keeps every advertised combination within native zoom/focus bounds.
    const poses = Array.from({ length: count }, (_, j) => {
      const frame = Math.round(j * (frames - 1) / (count - 1)), u = frame / (frames - 1);
      const p = settings.ease === "smooth" ? u * u * (3 - 2 * u) : u;
      const angle = n("start_angle") + n("turn") * p, a = angle * Math.PI / 180;
      const x = (n("start_x") + (n("end_x") - n("start_x")) * p * n("travel") / 100 - 50) / 50;
      const y = (n("start_y") + (n("end_y") - n("start_y")) * p * n("travel") / 100 - 50) / 50;
      const scene = 1 + n("scene_zoom") / 100 * p;
      const scale = n("size") / 100 * (1 + n("growth") / 100 * p);
      return { t: frame / ctx.fps,
        x: x * Math.cos(a) + y * i.canvas.height / i.canvas.width * Math.sin(a),
        y: -x * i.canvas.width / i.canvas.height * Math.sin(a) + y * Math.cos(a),
        rotation: -angle, scale, scene };
    });
    // Use the largest feasible intermediate picture. Tiny pre-camera grading
    // surfaces lose detail when magnified, even if the original image is full-res.
    const focusRatio = Math.max(...poses.flatMap(p => [Math.abs(p.x) / p.scale, Math.abs(p.y) / p.scale]));
    const baseScale = Math.max(.1, Math.max(...poses.map(p => p.scale * p.scene)) / 10,
      Math.min(1, focusRatio > 0 ? 2 / focusRatio : 1));
    // The fitted focus can land exactly on ±2; division may leave one ULP
    // outside the native bound. Snap only numerical residue, never a bad fit.
    const samples = poses.map(p => ({ ...p, x: snapKeyedStillFocusRoundoff(-p.x * baseScale / p.scale),
      y: snapKeyedStillFocusRoundoff(-p.y * baseScale / p.scale), zoom: p.scale * p.scene / baseScale }));
    const track = (key: "x" | "y" | "rotation" | "zoom" | "scene") => samples.map(s => ({ t: s.t, v: s[key], ease: "linear" as const }));
    // Native blur is applied before the outer book camera. Compensate its zoom
    // so a fixed photographic softness does not grow into a motion blur.
    const softening = n("image_softness") / 20;
    const blurTrack = samples.map(s => ({ t: s.t, v: softening / s.zoom, ease: "linear" as const }));
    ops.push({ ...ref("scene_camera"), create_shape: { title: "Scene push-in", shape_kind: "camera", shape_width: 1, shape_height: 1,
      ...sceneLane, timeline_start: start, duration_seconds: duration,
      keyframes: { media_scale: track("scene") },
    } });
    ops.push({ ...ref("camera"), create_shape: { title: "Book movement", shape_kind: "camera", shape_width: 1, shape_height: 1,
      ...i.lanes.camera, timeline_start: start, duration_seconds: duration,
      keyframes: { media_rotation: track("rotation"), media_scale: track("zoom"), media_offset_x: track("x"), media_offset_y: track("y") },
    } });
    ops.push({ ...ref("photograph"), create_visual: { type: "still", title: "Floating photograph", source_url: i.photograph.source_url,
      ...i.lanes.photograph, timeline_start: start, duration_seconds: duration, volume: 0, camera_id: blockElementId(ctx, "camera"),
      media_scale: baseScale,
      chroma_key_color: i.photograph.key_color, chroma_key_tolerance: n("tolerance") / 100,
      chroma_key_softness: n("softness") / 100, chroma_key_spill: n("spill") / 100,
      mask_inset: i.photograph.mask_inset.map(v => .5 + (v - .5) * baseScale),
      mask_feather: n("feather") / 100 / samples[0]!.zoom,
      ...(softening > 0 ? { directional_blur_x: blurTrack[0]!.v, directional_blur_y: blurTrack[0]!.v,
        transition_keyframes: { directional_blur_x: blurTrack, directional_blur_y: blurTrack } } : {}),
      color_grade: { grade_tint: n("tint") / 100, grade_temperature: n("warmth") / 100, grade_exposure_ev: n("exposure") + n("scene_exposure"),
        ...(n("contrast") !== 100 ? { grade_contrast: n("contrast") / 100 } : {}),
        ...(n("saturation") !== 100 ? { grade_saturation: n("saturation") / 100 } : {}) },
    } });
    if (i.foreground) { const { has_alpha: _alpha, ...take } = i.foreground; const op = video("foreground", take, true); ops.push({ ...op, create_visual: { ...op.create_visual, ...backgroundProps } }); }
    if (samples.at(-1)!.t !== span) throw new Error("Motion endpoint must be the last visible frame.");
    // Followers must reference cameras already created in this atomic option.
    return [...ops.filter(op => op.create_shape), ...ops.filter(op => !op.create_shape)];
  },
};
