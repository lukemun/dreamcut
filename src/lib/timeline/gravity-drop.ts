import { readKeyframeMap, resolveNumberKeyframe, type KeyframePoint } from "./keyframes";

export const EARTH_GRAVITY = 9.80665;
/** A semantic drop travels one canvas height from rest. Duration sets the
 * virtual scene scale, never an arbitrary easing curve or mass-dependent speed.
 * Existing vertical movement before release and all other tracks are preserved.
 * Media offsets span half a canvas height, so one full height is two units. */
export function deriveGravityDrop(props: Record<string, unknown>, start: number, seconds: number) {
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(seconds) || seconds <= 0) throw new Error("Invalid gravity drop timing");
  start = Number(start.toFixed(3));
  const map = readKeyframeMap(props);
  const initial = resolveNumberKeyframe(props, "media_offset_y", start, Number(props.media_offset_y ?? 0));
  const limit = Math.min(2, initial + 2);
  // Stop only after the actor is below the viewport, respecting the existing
  // transform range. Shorter lower-actor tracks retain exactly the same g.
  // The native keyframe clock has millisecond precision. Derive position from
  // that quantized time so rounding cannot change acceleration.
  const travelSeconds = Math.floor(seconds * Math.sqrt((limit - initial) / 2) * 1000) / 1000;
  const end = initial + 2 * (travelSeconds / seconds) ** 2;
  const points: KeyframePoint<number>[] = (map.media_offset_y ?? [])
    .filter(p => p.t < start && typeof p.v === "number") as KeyframePoint<number>[];
  if (!points.length && start > 0) points.push({ t: 0, v: initial, ease: "hold" });
  points.push({ t: start, v: initial, ease: "easeIn" });
  if (travelSeconds > 0) points.push({ t: start + travelSeconds, v: end, ease: "hold" });
  return {
    ...props,
    gravity_drop_start_seconds: start,
    gravity_drop_seconds: seconds,
    gravity_drop_receipt: { model: "earth-gravity-v1", gravity_m_s2: EARTH_GRAVITY,
      canvas_height_meters: 0.5 * EARTH_GRAVITY * seconds * seconds,
      initial_velocity_m_s: 0, displacement_canvas_heights: (end - initial) / 2 },
    keyframes: { ...map, media_offset_y: points },
  };
}
