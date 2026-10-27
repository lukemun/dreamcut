import { z } from "zod";

import { elementAnimationFrame } from "./element-animation";
import { gridMatteFrameUrl, gridMatteMaskSchema, type GridMatteMask } from "./grid-matte";
import { quantizeVisualFrameSpan } from "./frame-quantization";
import { resolveAnimationProps } from "./animation-presets";
import { mediaPictureAtFrame } from "./media-picture-plan";
import { resolveMaskInsetAtTime, resolveMediaTransformAtTime } from "./media-transform";
import { projectSourceToComposition } from "./source-projection";

/**
 * Subject window: a visual clip shows only inside (or outside) another clip's moving
 * subject cutout. The windowed clip owns its picture and timing; the subject clip owns
 * the mask clock and geometry. At timeline frame F the mask frame is the subject's own
 * source time at F (its trim, speed, reverse and holds through mediaPictureAtFrame), and
 * the mask is placed where the subject's picture is drawn (contain fit, scale, position
 * and crop at the subject's local time, then its entrance/exit slide or scale about the
 * composition centre, as both renderers pose the subject's media wrapper). Outside the subject's span there is no subject
 * shape: "inside" shows nothing and "outside" shows the whole clip.
 */
/** Same prepared-mask record as the grid matte (cutout_status grid_matte_mask), described for agents. */
export const subjectWindowMaskSchema = z.object({
  source_url: gridMatteMaskSchema.shape.source_url.describe("Folder URL of the prepared grayscale mask frames, copied from cutout_status grid_matte_mask."),
  source_start_seconds: gridMatteMaskSchema.shape.source_start_seconds.describe("Subject footage second (source clock) of mask frame 0."),
  fps: gridMatteMaskSchema.shape.fps.describe("Mask frames per second on the subject footage's source clock."),
  frame_count: gridMatteMaskSchema.shape.frame_count.describe("Number of prepared mask frames."),
  width: gridMatteMaskSchema.shape.width.describe("Mask frame width in pixels (same aspect as the subject footage)."),
  height: gridMatteMaskSchema.shape.height.describe("Mask frame height in pixels."),
  source_sha256: gridMatteMaskSchema.shape.source_sha256.describe("SHA-256 of the subject footage the mask was prepared from."),
}).strict();
export type SubjectWindowMask = GridMatteMask;

export const SUBJECT_WINDOW_MODES = ["inside", "outside"] as const;
export type SubjectWindowMode = (typeof SUBJECT_WINDOW_MODES)[number];

export const SUBJECT_WINDOW_DEFAULTS = {
  subject_window_feather: 0,
  subject_window_expand: 0,
  subject_window_strength: 1,
} as const;
export type SubjectWindowNumberField = keyof typeof SUBJECT_WINDOW_DEFAULTS;
/** Feather and expand are composition pixels at 1080 width, like other picture effects. */
export const SUBJECT_WINDOW_RANGES: Record<SubjectWindowNumberField, readonly [number, number]> = {
  subject_window_feather: [0, 100],
  subject_window_expand: [-80, 80],
  subject_window_strength: [0, 1],
};
export const SUBJECT_WINDOW_FIELDS = [
  "subject_window_parent_id", "subject_window_mask", "subject_window_enabled", "subject_window_mode",
  "subject_window_feather", "subject_window_expand", "subject_window_strength",
] as const;
/** Composition-only snapshot of the subject clip; never persisted. */
export const SUBJECT_WINDOW_RUNTIME_KEY = "runtime_subject_window_subject";

export function normalizeSubjectWindowNumber(field: SubjectWindowNumberField, value: unknown): number {
  const n = Number(value);
  const [min, max] = SUBJECT_WINDOW_RANGES[field];
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : SUBJECT_WINDOW_DEFAULTS[field]));
}

export function normalizeSubjectWindowMode(value: unknown): SubjectWindowMode {
  return value === "outside" ? "outside" : "inside";
}

/** The timing and geometry fields of a subject clip that decide its mask frame and placement. */
export type SubjectWindowSubject = {
  id: string;
  type: string;
  timeline_start: number;
  duration: number;
  trim_start: number;
  trim_end: number | null;
  playback_rate: number;
  props?: Record<string, unknown> | null;
  /** Present when the subject has a transition there; it suppresses that native animation, as in the renderers. */
  transition_in?: { type: string } | null;
  transition_out?: { type: string } | null;
};

type BindableElement = {
  id: string;
  type: string;
  timeline_start: number;
  duration: number;
  trim_start: number;
  trim_end: number | null;
  playback_rate: number;
  props?: Record<string, unknown> | null;
  transition_in?: { type: string } | null;
  transition_out?: { type: string } | null;
};

/**
 * Native entrance/exit presets whose picture geometry the window cannot follow: it follows
 * translate and scale only, not rotation, focus blur or a write-on wipe.
 */
const UNFOLLOWED_SUBJECT_ANIMATIONS: Readonly<Record<string, string>> = {
  rotate_in: "rotate", focus_settle: "focus blur", write_on: "write-on wipe",
};

export function hasSubjectWindowBinding(props: Record<string, unknown> | null | undefined): boolean {
  return typeof props?.subject_window_parent_id === "string" && props.subject_window_mask != null;
}

/**
 * Attach each windowed clip's subject snapshot (composition clock). A missing, removed or
 * disabled subject leaves no snapshot, so the window is closed. Subjects are never chained:
 * the snapshot drops the subject's own window binding.
 */
export function resolveSubjectWindowBindings<T extends BindableElement>(elements: T[], available: readonly BindableElement[] = elements): T[] {
  if (!elements.some((element) => hasSubjectWindowBinding(element.props))) return elements;
  const byId = new Map(available.map((element) => [element.id, element]));
  return elements.map((element) => {
    if (!hasSubjectWindowBinding(element.props)) return element;
    const subject = byId.get(String(element.props?.subject_window_parent_id));
    const props = { ...element.props } as Record<string, unknown>;
    delete props[SUBJECT_WINDOW_RUNTIME_KEY];
    if (subject && subject.id !== element.id && subject.type === "video_clip") {
      const subjectProps = { ...(subject.props ?? {}) };
      for (const field of [...SUBJECT_WINDOW_FIELDS, SUBJECT_WINDOW_RUNTIME_KEY]) delete subjectProps[field];
      props[SUBJECT_WINDOW_RUNTIME_KEY] = {
        id: subject.id, type: subject.type, timeline_start: subject.timeline_start, duration: subject.duration,
        trim_start: subject.trim_start, trim_end: subject.trim_end, playback_rate: subject.playback_rate,
        props: subjectProps,
        ...(subject.transition_in ? { transition_in: { type: subject.transition_in.type } } : {}),
        ...(subject.transition_out ? { transition_out: { type: subject.transition_out.type } } : {}),
      } satisfies SubjectWindowSubject;
    }
    return { ...element, props };
  });
}

type Rect = { x: number; y: number; width: number; height: number };

export type SubjectWindowPlan = {
  /** Prepared mask frame on the subject's source clock; null when no subject shape exists at this frame. */
  url: string | null;
  /** Composition size, and the processing grid that covers it (half resolution). */
  width: number;
  height: number;
  gridWidth: number;
  gridHeight: number;
  /** Subject picture rectangle and its visible (cropped) part, composition pixels. */
  rect: Rect;
  crop: Rect;
  mode: SubjectWindowMode;
  /** Softness and expansion in grid pixels. */
  feather: number;
  expand: number;
  strength: number;
};

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

export function subjectWindowActive(props: Record<string, unknown> | null | undefined): boolean {
  return hasSubjectWindowBinding(props) && props?.subject_window_enabled !== false
    && normalizeSubjectWindowNumber("subject_window_strength", props?.subject_window_strength) > 0;
}

/**
 * Shared Standard/GPU plan for an absolute timeline frame. Throws when the subject is on
 * screen but its prepared mask does not cover the subject's source time.
 */
export function subjectWindowPlanAtFrame(
  props: Record<string, unknown> | null | undefined,
  frame: number,
  fps: number,
  width: number,
  height: number,
): SubjectWindowPlan | null {
  if (!subjectWindowActive(props)) return null;
  const mask = props?.subject_window_mask as SubjectWindowMask;
  const subject = props?.[SUBJECT_WINDOW_RUNTIME_KEY] as SubjectWindowSubject | undefined;
  const gridWidth = Math.max(1, Math.round(width / 2)), gridHeight = Math.max(1, Math.round(height / 2));
  const toGrid = (gridWidth / width) * (width / 1080);
  const base = {
    width, height, gridWidth, gridHeight,
    mode: normalizeSubjectWindowMode(props?.subject_window_mode),
    feather: round6(normalizeSubjectWindowNumber("subject_window_feather", props?.subject_window_feather) * toGrid),
    expand: round6(normalizeSubjectWindowNumber("subject_window_expand", props?.subject_window_expand) * toGrid),
    strength: normalizeSubjectWindowNumber("subject_window_strength", props?.subject_window_strength),
  };
  const empty = { x: 0, y: 0, width: 0, height: 0 };
  const at = subject ? mediaPictureAtFrame(subject, frame, fps) : null;
  if (!subject || !at) return { ...base, url: null, rect: empty, crop: empty };
  const local = at.localFrame / fps;
  const transform = resolveMediaTransformAtTime(subject.props, local);
  const projection = projectSourceToComposition({
    source_width: mask.width, source_height: mask.height, composition_width: width, composition_height: height,
    fit: "contain", media_scale: transform.scale, media_offset_x: transform.offsetX, media_offset_y: transform.offsetY,
    mask_inset: resolveMaskInsetAtTime(subject.props, local), timeline_time_seconds: 0, timeline_start_seconds: 0,
  });
  // The subject's entrance/exit pose acts on its whole composition-sized media wrapper
  // (translate, then scale about the centre), evaluated on the same clip clock as the renderers.
  const durationFrames = quantizeVisualFrameSpan(subject.timeline_start, subject.duration, { fps, minFrames: 1 }).durationFrames;
  const pose = elementAnimationFrame(subject.props, at.localFrame, durationFrames, width, height,
    { fps, suppressIn: !!subject.transition_in, suppressOut: !!subject.transition_out });
  const posed = (rect: Rect): Rect => ({
    x: width / 2 + pose.translateX + pose.scale * (rect.x - width / 2),
    y: height / 2 + pose.translateY + pose.scale * (rect.y - height / 2),
    width: rect.width * pose.scale, height: rect.height * pose.scale,
  });
  const r6 = (rect: Rect) => ({ x: round6(rect.x), y: round6(rect.y), width: round6(rect.width), height: round6(rect.height) });
  return { ...base, url: gridMatteFrameUrl(mask, at.sourceTimeSeconds), rect: r6(posed(projection.transformed_rect)), crop: r6(posed(projection.visible_rect)) };
}

/** Alpha everywhere the subject shape is absent (outside its picture, or no subject at all). */
export function subjectWindowEmptyAlpha(plan: Pick<SubjectWindowPlan, "mode" | "strength">): number {
  return plan.mode === "outside" ? 1 : 1 - plan.strength;
}

function boxBlurPass(src: Float32Array, dst: Float32Array, width: number, height: number, radius: number, horizontal: boolean) {
  const length = horizontal ? width : height, lines = horizontal ? height : width;
  const stride = horizontal ? 1 : width, lineStride = horizontal ? width : 1;
  const inverse = 1 / (2 * radius + 1), last = length - 1;
  for (let line = 0; line < lines; line++) {
    const origin = line * lineStride;
    // Edge-replicate: a subject that leaves the frame continues past it.
    const first = src[origin]!, end = src[origin + last * stride]!;
    let sum = 0;
    for (let i = -radius; i <= radius; i++) sum += i <= 0 ? first : i >= last ? end : src[origin + i * stride]!;
    for (let i = 0, at = origin; i < length; i++, at += stride) {
      dst[at] = sum * inverse;
      const add = i + radius + 1, remove = i - radius;
      sum += (add >= last ? end : src[origin + add * stride]!) - (remove <= 0 ? first : src[origin + remove * stride]!);
    }
  }
}

function boxBlur(values: Float32Array, width: number, height: number, radius: number, passes: number) {
  const scratch = new Float32Array(values.length);
  for (let pass = 0; pass < passes; pass++) {
    boxBlurPass(values, scratch, width, height, radius, true);
    boxBlurPass(scratch, values, width, height, radius, false);
  }
  return values;
}

/**
 * Window alpha (0-255) on the plan's composition-covering grid, from the prepared
 * grayscale mask frame (red channel). Both renderers upload exactly these bytes and
 * stretch them over the composition, so edges, expansion and softness agree.
 */
export function subjectWindowAlpha(plan: SubjectWindowPlan, pixels: { data: Uint8ClampedArray; width: number; height: number } | null): Uint8Array {
  const { gridWidth: gw, gridHeight: gh } = plan;
  if (!Number.isSafeInteger(gw) || !Number.isSafeInteger(gh) || gw <= 0 || gh <= 0 || gw * gh > 4096 * 4096) throw Error("Invalid subject window grid");
  const a = new Float32Array(gw * gh);
  if (plan.url && pixels && plan.rect.width > 0 && plan.rect.height > 0) {
    const { data, width: pw, height: ph } = pixels;
    if (!Number.isSafeInteger(pw) || !Number.isSafeInteger(ph) || pw <= 0 || ph <= 0 || data.length !== pw * ph * 4) throw Error("Invalid subject window mask pixels");
    // Grid pixel centres in composition pixels.
    const scaleX = plan.width / gw, scaleY = plan.height / gh;
    const texel = (x: number, y: number) => (x < 0 || y < 0 || x >= pw || y >= ph ? 0 : data[(y * pw + x) * 4]! / 255);
    const { rect, crop } = plan;
    for (let j = 0; j < gh; j++) {
      const cy = (j + 0.5) * scaleY;
      if (cy < crop.y || cy >= crop.y + crop.height) continue;
      const v = (cy - rect.y) / rect.height * ph - 0.5;
      const y0 = Math.floor(v), fy = v - y0;
      for (let i = 0; i < gw; i++) {
        const cx = (i + 0.5) * scaleX;
        if (cx < crop.x || cx >= crop.x + crop.width) continue;
        const u = (cx - rect.x) / rect.width * pw - 0.5;
        const x0 = Math.floor(u), fx = u - x0;
        const top = texel(x0, y0) * (1 - fx) + texel(x0 + 1, y0) * fx;
        const bottom = texel(x0, y0 + 1) * (1 - fx) + texel(x0 + 1, y0 + 1) * fx;
        a[j * gw + i] = top * (1 - fy) + bottom * fy;
      }
    }
  }
  if (Math.abs(plan.expand) >= 0.05) {
    // Box-filtered distance: a straight edge falls linearly over 2R+1 pixels, so moving
    // the 50% threshold by `expand` moves the contour by that many pixels, then a
    // one-pixel ramp restores an antialiased edge.
    const radius = Math.max(1, Math.ceil(Math.abs(plan.expand) * 1.25)), n = 2 * radius + 1;
    boxBlur(a, gw, gh, radius, 1);
    const threshold = 0.5 - plan.expand / n;
    for (let i = 0; i < a.length; i++) a[i] = Math.max(0, Math.min(1, 0.5 + (a[i]! - threshold) * n));
  }
  if (plan.feather >= 1) boxBlur(a, gw, gh, Math.max(1, Math.round(plan.feather / 4)), 3);
  const out = new Uint8Array(gw * gh);
  const outside = plan.mode === "outside";
  for (let i = 0; i < a.length; i++) {
    const shape = outside ? 1 - a[i]! : a[i]!;
    out[i] = Math.round(Math.max(0, Math.min(1, 1 - plan.strength * (1 - shape))) * 255);
  }
  return out;
}

/** RGBA bytes (white, window alpha) for image uploads in either renderer. */
export function subjectWindowRgba(alpha: Uint8Array): Uint8ClampedArray<ArrayBuffer> {
  const rgba = new Uint8ClampedArray(new ArrayBuffer(alpha.length * 4));
  for (let i = 0; i < alpha.length; i++) {
    rgba[i * 4] = 255; rgba[i * 4 + 1] = 255; rgba[i * 4 + 2] = 255; rgba[i * 4 + 3] = alpha[i]!;
  }
  return rgba;
}

/**
 * Agent/admission validation of a binding against the timeline. Returns a creator-facing
 * reason or null. The subject must be a visible video clip with a prepared mask that
 * covers every source second the subject clip shows.
 */
export function subjectWindowBindingIssue(
  element: { id: string; props?: Record<string, unknown> | null },
  subject: (BindableElement & { removed_at?: string | null; source_url?: string | null }) | undefined,
  fps: number,
): string | null {
  const props = element.props ?? {};
  if (props.subject_window_parent_id == null && props.subject_window_mask == null) return null;
  if (typeof props.subject_window_parent_id !== "string") return "Subject window needs the subject clip.";
  if (!subjectWindowMaskSchema.safeParse(props.subject_window_mask).success) return "Subject window needs a prepared subject cutout mask.";
  if (props.subject_window_parent_id === element.id) return "A clip cannot use itself as its subject window.";
  if (!subject || subject.removed_at) return "The subject window's subject clip is missing.";
  if (subject.type !== "video_clip") return "The subject window's subject must be a video clip.";
  if (hasSubjectWindowBinding(subject.props)) return "The subject clip already shows through another subject window.";
  const orientation = subject.props?.media_orientation, mirror = subject.props?.media_mirror;
  if ((orientation != null && orientation !== "original") || (mirror != null && mirror !== "none")) return "Subject window does not follow a rotated or mirrored subject yet.";
  const animation = resolveAnimationProps(subject.props);
  for (const [preset, suppressed] of [[animation.animationIn, !!subject.transition_in], [animation.animationOut, !!subject.transition_out]] as const) {
    const kind = UNFOLLOWED_SUBJECT_ANIMATIONS[preset];
    if (kind && !suppressed) return `Subject window does not follow a subject's ${kind} animation yet. Use none, fade, slide, drop-in or pop on the subject clip.`;
  }
  const mask = props.subject_window_mask as SubjectWindowMask;
  const sourceSha = subject.props?.source_sha256;
  if (typeof sourceSha === "string" && sourceSha !== mask.source_sha256) return "The subject window mask was prepared from different footage than the subject clip.";
  const span = quantizeVisualFrameSpan(subject.timeline_start, subject.duration, { fps, minFrames: 1 });
  const first = mediaPictureAtFrame(subject, span.startFrame, fps);
  const last = mediaPictureAtFrame(subject, span.endFrame - 1, fps);
  for (const at of [first, last]) {
    if (!at) continue;
    try { gridMatteFrameUrl(mask, at.sourceTimeSeconds); }
    catch { return "The subject cutout does not cover the subject clip's footage. Prepare the cutout over the clip's whole source window."; }
  }
  return null;
}

