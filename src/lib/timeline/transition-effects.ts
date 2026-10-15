import type { CSSProperties } from "react";
import { z } from "zod";
import { resolveNumberKeyframe } from "./keyframes";

const points = (max: number, min = 0) => z.array(z.object({
  t: z.number().finite().min(0).max(600).describe("Clip-relative seconds; the first key is at 0 and times increase."),
  v: z.number().finite().min(min).max(max).describe(`Value at t, in the property's own units (${min} to ${max}).`),
  ease: z.enum(["linear", "easeIn", "easeOut", "easeInOut", "hold"]).describe("How the value travels to the next key; hold keeps it until the next key (use for flashes and bursts).").optional(),
}).strict()).min(2).max(120).refine(p => p[0].t === 0 && p.every((v, i) => i === 0 || v.t > p[i - 1].t), "Keyframes must start at zero and increase");

export const transitionKeyframesSchema = z.object({
  sticker_outline_width: points(32).optional(),
  subject_flash: points(1).optional(),
  subject_glow: points(3).optional(),
  subject_glow_radius: points(80).optional(),
  media_offset_x: points(2, -2).optional(),
  media_offset_y: points(2, -2).optional(),
  media_scale: points(3).refine(p => p.every(v => v.v >= 0.1), "Scale must be at least 0.1").optional(),
  media_opacity: points(1).optional(),
  iris_radius: points(2).optional(),
  iris_feather: points(.8).optional(),
  zoom_blur: points(40).optional(),
  transition_blur: points(40).optional(),
  directional_blur_x: points(1080).optional(),
  directional_blur_y: points(1080).optional(),
  // Color map and glitch: key a flash or burst onto a beat inside one clip.
  gradient_map_amount: points(1).describe("Color map mix over time (0 off, 1 full). For a 2\u20134 frame thermal flash on a beat: [{t:0,v:0,ease:\"hold\"},{t:beat,v:1,ease:\"hold\"},{t:beat+3/30,v:0,ease:\"hold\"}].").optional(),
  gradient_map_contrast: points(3, 0.25).describe("Color map contrast over time (1 = unchanged).").optional(),
  glitch_amount: points(1).describe("Glitch strength over time (0 off, 1 full). Key a burst with hold keys around the beat, like gradient_map_amount.").optional(),
  glitch_shift: points(0.5).describe("Largest sideways band shift over time, as a fraction of frame width.").optional(),
  glitch_rgb_split: points(60).describe("Red/blue split over time, in pixels at 1080 width.").optional(),
  glitch_smear: points(1).describe("Share of glitched bands that smear instead of shifting, over time.").optional(),
}).strict();

/** A frame layer with a rounded opening, evaluated on its own composition clock.
 * Duration zero disables the matte. The hole starts empty and stops at authored margins.
 * Roundness uses 1080-width pixels; only a full-canvas finish fades corners away. */
export function resolveWindowOpening(props: Record<string, unknown> | null | undefined, time: number, canvas: {width: number; height: number}) {
  const duration = Math.max(0, Math.min(10, Number(props?.window_open_duration) || 0));
  if (!duration) return { active: false, progress: 0, height: 0, radius: 0, rect: {x:0,y:0,width:0,height:0}, style: {} as CSSProperties };
  const clock = Math.max(0, Math.min(1, time / duration));
  const progress = clock * clock * (3 - 2 * clock);
  const side = Math.max(0, Math.min(45, Number(props?.window_side_margin_percent) || 0)) / 100;
  const vertical = Math.max(0, Math.min(45, Number(props?.window_vertical_margin_percent) || 0)) / 100;
  const x = canvas.width * side;
  const right = canvas.width - x;
  const h = canvas.height * (1 - 2 * vertical) * progress;
  const r = Math.min(canvas.width * (1 - 2 * side) / 2, h / 2, Math.max(0, Math.min(200, Number(props?.window_corner_radius) || 0)) * canvas.width / 1080 * (side > 0 || vertical > 0 ? 1 : Math.min(1, (1 - progress) * 10)));
  const authoredCenter = Number(props?.window_center_y_percent ?? 50);
  const center = Math.max(0, Math.min(100, Number.isFinite(authoredCenter) ? authoredCenter : 50)) / 100 * canvas.height;
  const w = canvas.width, y = Math.max(0, Math.min(canvas.height - h, center - h / 2)), b = y + h;
  const outer = `M0 0H${w}V${canvas.height}H0Z`;
  const hole = h <= 0 ? "" : `M${x+r} ${y}H${right-r}Q${right} ${y} ${right} ${y+r}V${b-r}Q${right} ${b} ${right-r} ${b}H${x+r}Q${x} ${b} ${x} ${b-r}V${y+r}Q${x} ${y} ${x+r} ${y}Z`;
  return { active: true, progress, height: h, radius: r, rect:{x,y,width:right-x,height:h}, style: {clipPath: `path(evenodd, "${outer}${hole}")`} as CSSProperties };
}

/** Radius is relative to each canvas half-axis, giving a portrait oval in 9:16.
 * Blur is specified at 1080 canvas width so preview and export agree. */
export function resolveTransitionEffects(props: Record<string, unknown> | null | undefined, time: number, canvas: {width: number; height: number}) {
  const directional = (axis: "x" | "y") => {
    const field = `directional_blur_${axis}`;
    const value = resolveNumberKeyframe(props, field, time, Number(props?.[field] ?? 0));
    return (Number.isFinite(value) ? Math.max(0, Math.min(1080, value)) : 0) * canvas.width / 1080;
  };
  const blurX = directional("x");
  const blurY = directional("y");
  const radius = Math.max(0, Math.min(2, resolveNumberKeyframe(props, "iris_radius", time, Number(props?.iris_radius ?? 2))));
  const blur = Math.max(0, Math.min(40, resolveNumberKeyframe(props, "transition_blur", time, Number(props?.transition_blur ?? 0))));
  const feather = Math.max(0, Math.min(.8, resolveNumberKeyframe(props, "iris_feather", time, Number(props?.iris_feather ?? .08))));
  const zoomBlur = Math.max(0, Math.min(40, resolveNumberKeyframe(props, "zoom_blur", time, Number(props?.zoom_blur ?? 0))));
  const edgeStyle: CSSProperties = zoomBlur > 0 ? {
    backdropFilter: `blur(${zoomBlur * canvas.width / 1080}px)`,
    WebkitBackdropFilter: `blur(${zoomBlur * canvas.width / 1080}px)`,
    maskImage: "radial-gradient(ellipse at center, transparent 15%, #000 75%)",
    WebkitMaskImage: "radial-gradient(ellipse at center, transparent 15%, #000 75%)",
    pointerEvents: "none",
  } : {display: "none"};
  const window = resolveWindowOpening(props, time, canvas);
  const style: CSSProperties = {...window.style};
  if (radius < 2) {
    const mask = radius <= 0 ? "linear-gradient(transparent, transparent)" : `radial-gradient(ellipse ${radius * 50}% ${radius * 50}% at 50% 50%, #000 ${(1 - feather) * 100}%, transparent 100%)`;
    style.maskImage = mask;
    style.WebkitMaskImage = mask;
  }
  if (blur > 0) style.filter = `blur(${blur * canvas.width / 1080}px)`;
  return { style, edgeStyle, radius, feather, zoomBlur, blur, blurX, blurY, window, active: window.active || blurX > 0 || blurY > 0 || radius < 2 || blur > 0 || zoomBlur > 0 };
}
