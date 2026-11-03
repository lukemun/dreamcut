import { z } from "zod";
import { CAPTION_FONT_PRESETS, CAPTION_POSITION_PRESETS } from "../timeline/captions";
import { blockElementId, type BlockDefinition } from "./proposal-block-kit";

const n = z.number().finite();
const source = z.object({ source_url: z.string().min(1), source_duration_seconds: n.positive() }).strict();
export const actorRevealInputs = z.object({
  source,
  foreground: source.extend({ source_offset_seconds: n.nonnegative().default(0),
    original_source_url: z.string().min(1).describe("Declared original source identity from the cutout receipt; must match source.source_url."),
    chroma_key_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()
      .describe("Only for a source-matched instructor-supplied solid-colour foreground view; never key an ordinary room. Prefer a traced cut-out of the original take (cutout_prepare, alpha): the key left green rims on Object Reveal and the cut-out did not.") })
    .strict().describe("The person in front: a cutout_prepare cut-out of the original take (alpha, preferred) covering the window, or a supplied solid-colour view of it with chroma_key_color."),
  source_start_seconds: n.nonnegative(), duration_seconds: n.positive().max(600),
  timeline_start: n.nonnegative().default(0),
  boundary: z.array(z.object({ source_seconds: n.nonnegative(), x: n.min(0).max(.95) }).strict()).min(2).max(118)
    .describe("Body-center marks on the original source clock, x as canvas-width fraction; increasing source times and nondecreasing x. Rightward crossing only."),
  text: z.string().trim().min(1).max(500),
  font: z.enum(CAPTION_FONT_PRESETS as [string, ...string[]]),
  position: z.enum(CAPTION_POSITION_PRESETS).default("center"),
  text_origin: z.object({x:n.min(0).max(.9),y:n.min(0).max(.9)}).strict().optional()
    .describe("Measured native text-box top-left anchor, only when no preset matches; option must declare coordinate_fallback_reason."),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#ffffff"),
  lane_order_keys: z.array(z.string()).min(4).max(64),
  lanes: z.object({ base: z.string().regex(/^visual_\d+$/), cover: z.string().regex(/^visual_\d+$/),
    foreground: z.string().regex(/^visual_\d+$/), text: z.string().regex(/^captions_\d+$/) }).strict()
    .default({ base: "visual_0", text: "captions_1", cover: "visual_1", foreground: "visual_2" }),
}).strict().superRefine((i, ctx) => {
  const end = i.source_start_seconds + i.duration_seconds;
  if (i.foreground.original_source_url !== i.source.source_url) ctx.addIssue({ code: "custom", message: "Foreground receipt must identify the same original source" });
  if (end > i.source.source_duration_seconds + 1e-6 || i.source_start_seconds < i.foreground.source_offset_seconds
    || end - i.foreground.source_offset_seconds > i.foreground.source_duration_seconds + 1e-6) {
    ctx.addIssue({ code: "custom", message: "Original and cutout must cover the entire continuous source window" });
  }
  if (i.boundary.some((p, j) => p.source_seconds < i.source_start_seconds || p.source_seconds > end
    || j > 0 && (p.source_seconds <= i.boundary[j - 1]!.source_seconds || p.x < i.boundary[j - 1]!.x))) {
    ctx.addIssue({ code: "custom", message: "Rightward boundary marks must be ordered inside the original source window" });
  }
  const required = [i.lanes.foreground, i.lanes.cover, i.lanes.text, i.lanes.base];
  if (new Set(i.lane_order_keys).size !== i.lane_order_keys.length || new Set(required).size !== 4
    || required.some(k => !i.lane_order_keys.includes(k)) || required.some((k, j) => j > 0 && i.lane_order_keys.indexOf(k) <= i.lane_order_keys.indexOf(required[j - 1]!))) {
    ctx.addIssue({ code: "custom", message: "Complete top-first lane order must keep foreground above cover above text above original" });
  }
});
export type ActorRevealInputs = z.infer<typeof actorRevealInputs>;

export const actorRevealBlock: BlockDefinition<ActorRevealInputs> = {
  kind: "actor_wake_reveal", version: 1, label: "Object Reveal",
  description: "Reveal editable native text behind a rightward-crossing person. Original base, native text, synchronized original-cover split and a foreground cut-out of the person (a cutout_prepare cut-out of the original take, preferred over keying a supplied green view); no text bake. Requires source-bound body marks and the prepared cut-out; compiler does not segment or track.",
  inputs: actorRevealInputs,
  settings: {
    edge: { kind: "number", label: "Reveal edge", unit: "percent", min: -5, max: 5, step: .1, default: 0, off: 0, tier: "main", description: "Shift the measured mask boundary horizontally; clamped within0–95% canvas width. Keep it hidden inside the body." },
    feather: { kind: "number", label: "Edge softness", unit: "percent", min: 0, max: 5, step: .1, default: .5, off: 0, tier: "main" },
    text_size: { kind: "number", label: "Text size", unit: "percent", min: 25, max: 200, step: 1, default: 100, tier: "main", description: "100%=100px native font; text stays editable. Keep the complete text inside the swept area." },
    text_width: { kind: "number", label: "Text width", unit: "percent", min: 15, max: 90, step: 1, default: 70, tier: "advanced" },
    text_x: { kind: "number", label: "Text X", unit: "percent", min: 0, max: 90, step: .1, default: i => (i.text_origin?.x ?? .15)*100, tier: "main", hidden: i => !i.text_origin },
    text_y: { kind: "number", label: "Text Y", unit: "percent", min: 0, max: 90, step: .1, default: i => (i.text_origin?.y ?? .4)*100, tier: "main", hidden: i => !i.text_origin },
    volume: { kind: "number", label: "Original sound", unit: "percent", min: 0, max: 200, step: 1, default: 100, off: 0, tier: "advanced" },
    key_tolerance: { kind: "number", label: "Key tolerance", unit: "percent", min: 0, max: 100, step: 1, default: 18, tier: "advanced", hidden: i => !i.foreground.chroma_key_color },
    key_softness: { kind: "number", label: "Key softness", unit: "percent", min: 0, max: 100, step: 1, default: 8, tier: "advanced", hidden: i => !i.foreground.chroma_key_color },
    key_spill: { kind: "number", label: "Spill cleanup", unit: "percent", min: 0, max: 100, step: 1, default: 25, tier: "advanced", hidden: i => !i.foreground.chroma_key_color },
  },
  instances: () => ({}),
  compile(i, s, c) {
    actorRevealInputs.parse(i);
    const end = i.source_start_seconds + i.duration_seconds;
    // The source's unused handles may end on its own29.97/VFR clock. Only authored
    // placement and the chosen window need the composition grid; bounds are checked above.
    for (const v of [i.timeline_start, i.source_start_seconds, i.duration_seconds, i.foreground.source_offset_seconds]) {
      if (Math.abs(v * c.fps - Math.round(v * c.fps)) > 1e-5) throw new Error("Object Reveal source trims and placement must align to the project frame grid");
    }
    const ref = (role: string) => ({ element_id: blockElementId(c, role), block_ref: { block_id: c.block_id, role, index: 0 } });
    const points = i.boundary.map(p => ({ t: p.source_seconds - i.source_start_seconds,
      v: [0, 0, 0, Math.max(0, Math.min(.95, p.x + Number(s.edge) / 100))], ease: "linear" }));
    if (points[0]!.t > 0) points.unshift({ ...points[0]!, t: 0 });
    if (points.at(-1)!.t < i.duration_seconds) points.push({ ...points.at(-1)!, t: i.duration_seconds });
    const laneIndex = (key: string) => Number(key.split("_")[1]);
    const video = (role: "base" | "cover" | "foreground") => {
      const foreground = role === "foreground", src = foreground ? i.foreground : i.source;
      const start = i.source_start_seconds - (foreground ? i.foreground.source_offset_seconds : 0);
      return { ...ref(role), create_visual: { type: "video_clip", title: role === "base" ? "Continuous performance" : foreground ? "Person in front" : "Hide text ahead of person",
        source_url: src.source_url, source_duration_seconds: src.source_duration_seconds,
        source_start_seconds: start, source_end_seconds: start + i.duration_seconds, timeline_start: i.timeline_start,
        playback_rate: 1, lane_key: i.lanes[role], lane_index: laneIndex(i.lanes[role]),
        volume: role === "base" ? Number(s.volume) / 100 : 0,
        ...(foreground ? i.foreground.chroma_key_color ? {
          chroma_key_color: i.foreground.chroma_key_color,
          chroma_key_tolerance: Number(s.key_tolerance ?? 18) / 100,
          chroma_key_softness: Number(s.key_softness ?? 8) / 100,
          chroma_key_spill: Number(s.key_spill ?? 25) / 100,
        } : { has_alpha: true } : {}),
        ...(role === "cover" ? { mask_inset: points[0]!.v, mask_inset_keyframes: points, mask_feather: Number(s.feather) / 100 } : {}),
      } };
    };
    return [{ ...ref("order"), set_lane_order: { lane_order_keys: i.lane_order_keys } }, video("base"),
      { ...ref("text"), create_text: { text: i.text, title: "Revealed text", timeline_start: i.timeline_start, duration_seconds: i.duration_seconds,
        lane_key: i.lanes.text, lane_index: laneIndex(i.lanes.text), fontPreset: i.font, fontSizePx: Number(s.text_size), maxWidth: Number(s.text_width) / 100,
        ...(i.text_origin ? { absX:Number(s.text_x ?? i.text_origin.x*100)/100,absY:Number(s.text_y ?? i.text_origin.y*100)/100 } : {positionPreset: i.position}),
        styleVariant: "none", textAlign: "center", textColor: i.color, animationIn: "none", animationOut: "none" } },
      video("cover"), video("foreground")];
  },
};
