import type { TimelineElement } from "@/components/studio/timeline/types";
import { newId, newRowTimestamps, type TimelineFile } from "@/lib/local-store/store";
import type { KeyframeEase, KeyframeMap, KeyframePoint } from "@/lib/timeline/keyframes";
import { resolveNumberKeyframe } from "@/lib/timeline/keyframes";
import { MAX_MEDIA_SCALE, MIN_MEDIA_SCALE, resolveMediaTransformAtTime } from "@/lib/timeline/media-transform";

export type TutorialCameraPose = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

/**
 * Frames a source-space viewport without guessing renderer offsets. `left` and
 * `top` are normalized coordinates of the desired visible source window.
 */
export function tutorialCameraPoseForSourceWindow(input: { scale: number; left: number; top: number }): TutorialCameraPose {
  const pose = {
    scale: input.scale,
    offsetX: round(input.scale - 1 - 2 * input.scale * input.left),
    offsetY: round(input.scale - 1 - 2 * input.scale * input.top),
  };
  assertPose(pose, "source window pose");
  return pose;
}

export type TutorialCameraMove = {
  kind: "move";
  start: number;
  end: number;
  to: TutorialCameraPose;
  ease?: Exclude<KeyframeEase, "hold">;
};

export type TutorialHiddenReframe = {
  kind: "hiddenReframe";
  fadeStart: number;
  hiddenAt: number;
  switchAt: number;
  revealStart: number;
  revealEnd: number;
  to: TutorialCameraPose;
};

export type TutorialCameraOperation = TutorialCameraMove | TutorialHiddenReframe;

export type TutorialRecordedClick = {
  time: number;
  x: number;
  y: number;
  label?: string;
};

export type TutorialStep = {
  start: number;
  end: number;
  text: string;
};

export type TutorialMotionRecipe = {
  id: string;
  projectId: string;
  duration: number;
  camera: {
    initial: TutorialCameraPose;
    operations: TutorialCameraOperation[];
  };
  clicks?: TutorialRecordedClick[];
  steps?: TutorialStep[];
  assets: {
    backgroundUrl: string;
    cursorUrl: string;
    eventReceipt?: string;
  };
  style?: {
    backgroundSourceId?: string;
    cursorScale?: number;
    stepFontPreset?: string;
    stepFontSizePx?: number;
    stepMaxWidth?: number;
    stepAbsX?: number;
    stepAbsY?: number;
    stepStyleVariant?: string;
    stepTextColor?: string;
  };
};

export type TutorialMotionFinding = {
  code: string;
  message: string;
  time?: number;
};

export type TutorialMotionPreflight = {
  ok: boolean;
  findings: TutorialMotionFinding[];
  sampledFrames: number;
  bounds: {
    minScale: number;
    maxScale: number;
    minOffsetX: number;
    maxOffsetX: number;
    minOffsetY: number;
    maxOffsetY: number;
  };
  maxVisibleFrameDelta: {
    scale: number;
    offsetX: number;
    offsetY: number;
  };
  maxVisibleFrameAcceleration: {
    scale: number;
    offsetX: number;
    offsetY: number;
  };
};

export type CompiledTutorialMotion = {
  recipeId: string;
  videoProps: Record<string, unknown>;
  elements: TimelineElement[];
  laneOrderKeys: string[];
  preflight: TutorialMotionPreflight;
};

export type ApplyTutorialMotionOptions = {
  videoLaneKey?: string;
  replaceRecipeIds?: readonly string[];
};

type NumberPoint = KeyframePoint<number>;

const round = (value: number) => Number(value.toFixed(3));
const point = (t: number, v: number, ease: KeyframeEase = "hold"): NumberPoint => ({
  t: round(t),
  v: round(v),
  ease,
});

function assertFinite(label: string, value: number) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function assertPose(pose: TutorialCameraPose, label: string) {
  assertFinite(`${label}.scale`, pose.scale);
  assertFinite(`${label}.offsetX`, pose.offsetX);
  assertFinite(`${label}.offsetY`, pose.offsetY);
  if (pose.scale < MIN_MEDIA_SCALE || pose.scale > MAX_MEDIA_SCALE) {
    throw new Error(`${label}.scale ${pose.scale} is outside ${MIN_MEDIA_SCALE}..${MAX_MEDIA_SCALE}`);
  }
  if (Math.abs(pose.offsetX) > 1 || Math.abs(pose.offsetY) > 1) {
    throw new Error(`${label} offsets must remain inside -1..1`);
  }
}

function appendPose(points: Record<"scale" | "offsetX" | "offsetY", NumberPoint[]>, time: number, pose: TutorialCameraPose, ease: KeyframeEase) {
  points.scale.push(point(time, pose.scale, ease));
  points.offsetX.push(point(time, pose.offsetX, ease));
  points.offsetY.push(point(time, pose.offsetY, ease));
}

function compileCamera(recipe: TutorialMotionRecipe) {
  const transform = { scale: [] as NumberPoint[], offsetX: [] as NumberPoint[], offsetY: [] as NumberPoint[] };
  const opacity = [point(0, 1, "hold")];
  const hiddenReframes: TutorialHiddenReframe[] = [];
  let pose = recipe.camera.initial;
  let lastOperationEnd = 0;
  assertPose(pose, "camera.initial");
  appendPose(transform, 0, pose, "hold");

  for (const [index, operation] of recipe.camera.operations.entries()) {
    assertPose(operation.to, `camera.operations[${index}].to`);
    if (operation.kind === "move") {
      if (!(operation.start >= lastOperationEnd && operation.end > operation.start && operation.end <= recipe.duration)) {
        throw new Error(`camera move ${index} has invalid or overlapping timing`);
      }
      appendPose(transform, operation.start, pose, operation.ease ?? "easeInOut");
      appendPose(transform, operation.end, operation.to, "hold");
      pose = operation.to;
      lastOperationEnd = operation.end;
      continue;
    }

    const times = [operation.fadeStart, operation.hiddenAt, operation.switchAt, operation.revealStart, operation.revealEnd];
    if (!(times.every((time) => time >= 0 && time <= recipe.duration)
      && operation.fadeStart >= lastOperationEnd
      && operation.fadeStart < operation.hiddenAt
      && operation.hiddenAt <= operation.switchAt
      && operation.switchAt <= operation.revealStart
      && operation.revealStart < operation.revealEnd)) {
      throw new Error(`hidden reframe ${index} has invalid or overlapping timing`);
    }
    appendPose(transform, Math.max(operation.hiddenAt, operation.switchAt - 0.001), pose, "hold");
    appendPose(transform, operation.switchAt, operation.to, "hold");
    opacity.push(
      point(operation.fadeStart, 1, "easeInOut"),
      point(operation.hiddenAt, 0, "hold"),
      point(operation.revealStart, 0, "easeOut"),
      point(operation.revealEnd, 1, "hold"),
    );
    hiddenReframes.push(operation);
    pose = operation.to;
    lastOperationEnd = operation.revealEnd;
  }

  appendPose(transform, recipe.duration, pose, "hold");
  opacity.push(point(recipe.duration, 1, "hold"));
  return {
    keyframes: {
      media_scale: transform.scale,
      media_offset_x: transform.offsetX,
      media_offset_y: transform.offsetY,
      media_opacity: opacity,
    } satisfies KeyframeMap,
    hiddenReframes,
  };
}

function hasHiddenReframeBetween(reframes: TutorialHiddenReframe[], start: number, end: number) {
  return reframes.some((reframe) => reframe.fadeStart >= start && reframe.revealEnd <= end);
}

function compileCursorKeyframes(clicks: TutorialRecordedClick[], reframes: TutorialHiddenReframe[], cursorScale: number) {
  const ordered = [...clicks].sort((a, b) => a.time - b.time);
  if (ordered.length === 0) return null;
  for (const [index, click] of ordered.entries()) {
    if (click.time < 0) throw new Error(`click ${index} has a negative time`);
    if (Math.abs(click.x) > 1 || Math.abs(click.y) > 1) throw new Error(`click ${index} is outside normalized canvas bounds`);
  }

  const x: NumberPoint[] = [];
  const y: NumberPoint[] = [];
  const scale: NumberPoint[] = [point(0, cursorScale, "hold")];
  const opacity: NumberPoint[] = [point(0, 0, "hold")];
  const first = ordered[0]!;
  const firstEntry = Math.max(0, first.time - 0.55);
  x.push(point(firstEntry, first.x + 0.14, "easeOut"), point(Math.max(firstEntry, first.time - 0.18), first.x, "hold"));
  y.push(point(firstEntry, first.y + 0.14, "easeOut"), point(Math.max(firstEntry, first.time - 0.18), first.y, "hold"));
  opacity.push(point(firstEntry, 0, "easeOut"), point(Math.min(first.time - 0.18, firstEntry + 0.18), 1, "hold"));

  for (let index = 0; index < ordered.length; index += 1) {
    const click = ordered[index]!;
    // A visible click emphasis: a quick GROW on contact (not a subtle shrink), then
    // settle and HOLD ~1s so the viewer registers where the click landed. The hold
    // is capped by the gap to the next click so it never overruns.
    const holdEnd = Math.min(click.time + 1.0, (ordered[index + 1]?.time ?? click.time + 1.0) - 0.2);
    scale.push(
      point(Math.max(0, click.time - 0.14), cursorScale, "easeOut"),
      point(click.time, cursorScale * 1.32, "easeOut"),
      point(click.time + 0.22, cursorScale, "easeInOut"),
      point(Math.max(click.time + 0.22, holdEnd), cursorScale, "hold"),
    );
    const next = ordered[index + 1];
    if (!next) continue;
    const gap = next.time - click.time;
    const concealTravel = gap > 4 || hasHiddenReframeBetween(reframes, click.time, next.time);
    if (concealTravel) {
      const fadeOutStart = Math.min(next.time - 0.75, click.time + 0.3);
      const fadeOutEnd = fadeOutStart + 0.18;
      const fadeInStart = Math.max(fadeOutEnd, next.time - 0.62);
      const hiddenTravelStart = Math.max(fadeOutEnd, fadeInStart - 0.18);
      opacity.push(point(fadeOutStart, 1, "easeInOut"), point(fadeOutEnd, 0, "hold"), point(fadeInStart, 0, "easeOut"), point(fadeInStart + 0.18, 1, "hold"));
      x.push(
        point(fadeOutEnd, click.x, "hold"),
        point(hiddenTravelStart, click.x, "easeOut"),
        point(fadeInStart, next.x + 0.14, "easeOut"),
        point(next.time - 0.18, next.x, "hold"),
      );
      y.push(
        point(fadeOutEnd, click.y, "hold"),
        point(hiddenTravelStart, click.y, "easeOut"),
        point(fadeInStart, next.y + 0.14, "easeOut"),
        point(next.time - 0.18, next.y, "hold"),
      );
    } else {
      const travelEnd = next.time - 0.18;
      const earliestAfterResponse = click.time + 0.17;
      const preferredStart = Math.max(earliestAfterResponse, next.time - Math.min(1, gap * 0.55));
      const travelStart = Math.min(preferredStart, travelEnd);
      x.push(point(travelStart, click.x, "easeInOut"), point(travelEnd, next.x, "hold"));
      y.push(point(travelStart, click.y, "easeInOut"), point(travelEnd, next.y, "hold"));
    }
  }

  // The final click holds for up to one second. Keep the lifecycle monotonic:
  // ending at +0.5 used to append a keyframe before the final +1.0 hold.
  const end = ordered.at(-1)!.time + 1.05;
  opacity.push(point(end - 0.25, 1, "easeInOut"), point(end, 0, "hold"));
  x.push(point(end, ordered.at(-1)!.x, "hold"));
  y.push(point(end, ordered.at(-1)!.y, "hold"));
  scale.push(point(end, cursorScale, "hold"));
  return { keyframes: { media_offset_x: x, media_offset_y: y, media_scale: scale, media_opacity: opacity }, duration: round(end) };
}

function baseElement(projectId: string, type: string, sourceUrl: string | null, start: number, duration: number, laneKey: string, laneIndex: number): TimelineElement {
  return {
    id: newId(), project_id: projectId, type, source_url: sourceUrl, props: {}, beat_id: null,
    voice_clip_id: null, character_id: null, timeline_start: start, duration, lane_key: laneKey,
    lane_index: laneIndex, trim_start: 0, trim_end: null, volume: 0, fade_in: 0, fade_out: 0,
    playback_rate: 1, position_locked: true, removed_at: null, removed_reason: null, ...newRowTimestamps(),
  };
}

export function preflightTutorialMotion(videoProps: Record<string, unknown>, duration: number, options: { fps?: number; maxVisibleScaleDelta?: number; maxVisibleOffsetDelta?: number; maxVisibleScaleAcceleration?: number; maxVisibleOffsetAcceleration?: number } = {}): TutorialMotionPreflight {
  const fps = options.fps ?? 30;
  const findings: TutorialMotionFinding[] = [];
  const bounds = { minScale: Infinity, maxScale: -Infinity, minOffsetX: Infinity, maxOffsetX: -Infinity, minOffsetY: Infinity, maxOffsetY: -Infinity };
  const maxDelta = { scale: 0, offsetX: 0, offsetY: 0 };
  const maxAcceleration = { scale: 0, offsetX: 0, offsetY: 0 };
  let previous: { scale: number; offsetX: number; offsetY: number } | null = null;
  let previousVelocity: { scale: number; offsetX: number; offsetY: number } | null = null;
  let previousVisible = false;
  const frames = Math.ceil(duration * fps);
  for (let frame = 0; frame <= frames; frame += 1) {
    const time = Math.min(duration, frame / fps);
    const current = resolveMediaTransformAtTime(videoProps, time);
    const opacity = resolveNumberKeyframe(videoProps, "media_opacity", time, 1);
    bounds.minScale = Math.min(bounds.minScale, current.scale); bounds.maxScale = Math.max(bounds.maxScale, current.scale);
    bounds.minOffsetX = Math.min(bounds.minOffsetX, current.offsetX); bounds.maxOffsetX = Math.max(bounds.maxOffsetX, current.offsetX);
    bounds.minOffsetY = Math.min(bounds.minOffsetY, current.offsetY); bounds.maxOffsetY = Math.max(bounds.maxOffsetY, current.offsetY);
    const visible = opacity > 0.05;
    if (previous && visible && previousVisible) {
      const velocity = { scale: current.scale - previous.scale, offsetX: current.offsetX - previous.offsetX, offsetY: current.offsetY - previous.offsetY };
      const deltas = { scale: Math.abs(velocity.scale), offsetX: Math.abs(velocity.offsetX), offsetY: Math.abs(velocity.offsetY) };
      maxDelta.scale = Math.max(maxDelta.scale, deltas.scale); maxDelta.offsetX = Math.max(maxDelta.offsetX, deltas.offsetX); maxDelta.offsetY = Math.max(maxDelta.offsetY, deltas.offsetY);
      if (deltas.scale > (options.maxVisibleScaleDelta ?? 0.04) || deltas.offsetX > (options.maxVisibleOffsetDelta ?? 0.03) || deltas.offsetY > (options.maxVisibleOffsetDelta ?? 0.03)) {
        findings.push({ code: "visible_camera_snap", message: `Visible per-frame camera delta exceeds the tutorial motion limit`, time: round(time) });
      }
      if (previousVelocity) {
        const acceleration = { scale: Math.abs(velocity.scale - previousVelocity.scale), offsetX: Math.abs(velocity.offsetX - previousVelocity.offsetX), offsetY: Math.abs(velocity.offsetY - previousVelocity.offsetY) };
        maxAcceleration.scale = Math.max(maxAcceleration.scale, acceleration.scale);
        maxAcceleration.offsetX = Math.max(maxAcceleration.offsetX, acceleration.offsetX);
        maxAcceleration.offsetY = Math.max(maxAcceleration.offsetY, acceleration.offsetY);
        if (acceleration.scale > (options.maxVisibleScaleAcceleration ?? 0.004)
          || acceleration.offsetX > (options.maxVisibleOffsetAcceleration ?? 0.006)
          || acceleration.offsetY > (options.maxVisibleOffsetAcceleration ?? 0.006)) {
          findings.push({ code: "visible_camera_jitter", message: "Visible camera velocity changes too abruptly between frames", time: round(time) });
        }
      }
      previousVelocity = velocity;
    } else {
      previousVelocity = null;
    }
    previous = current;
    previousVisible = visible;
  }
  if (bounds.minScale < MIN_MEDIA_SCALE || bounds.maxScale > MAX_MEDIA_SCALE || bounds.minOffsetX < -1 || bounds.maxOffsetX > 1 || bounds.minOffsetY < -1 || bounds.maxOffsetY > 1) {
    findings.push({ code: "transform_out_of_range", message: "Camera transform exceeds renderer bounds" });
  }
  return { ok: findings.length === 0, findings, sampledFrames: frames + 1, bounds, maxVisibleFrameDelta: maxDelta, maxVisibleFrameAcceleration: maxAcceleration };
}

export function assertTutorialMotionPreflight(preflight: TutorialMotionPreflight) {
  if (!preflight.ok) throw new Error(`Tutorial motion preflight failed: ${preflight.findings.map((finding) => `${finding.code}${finding.time == null ? "" : `@${finding.time}`}`).join(", ")}`);
}

export function compileTutorialMotionRecipe(recipe: TutorialMotionRecipe): CompiledTutorialMotion {
  if (!(recipe.duration > 0)) throw new Error("Tutorial duration must be positive");
  const camera = compileCamera(recipe);
  const videoProps = {
    motion_recipe_id: recipe.id,
    media_scale: recipe.camera.initial.scale,
    media_offset_x: recipe.camera.initial.offsetX,
    media_offset_y: recipe.camera.initial.offsetY,
    media_opacity: 1,
    keyframes: camera.keyframes,
    camera_contract: "Eased same-region moves; semantic reframes occur only while the screen is hidden behind the neutral tutorial canvas.",
  };
  const preflight = preflightTutorialMotion(videoProps, recipe.duration);

  const background = baseElement(recipe.projectId, "still", recipe.assets.backgroundUrl, 0, recipe.duration, "visual_background", -1);
  background.props = {
    source_id: recipe.style?.backgroundSourceId ?? "tutorial-neutral-background", source_width: 360, source_height: 640,
    editorial_role: "neutral-transition-and-phone-canvas", motion_recipe_id: recipe.id,
    media_scale: 1, media_offset_x: 0, media_offset_y: 0, media_opacity: 1,
  };
  const elements: TimelineElement[] = [background];

  const cursorScale = recipe.style?.cursorScale ?? 0.095;
  const cursorMotion = compileCursorKeyframes(recipe.clicks ?? [], camera.hiddenReframes, cursorScale);
  if (cursorMotion) {
    const first = [...(recipe.clicks ?? [])].sort((a, b) => a.time - b.time)[0]!;
    const cursor = baseElement(recipe.projectId, "still", recipe.assets.cursorUrl, 0, cursorMotion.duration, "visual_cursor", 20);
    cursor.props = {
      source_id: "continuous-recorded-click-cursor", source_width: 256, source_height: 256,
      editorial_role: "continuous-eased-recorded-click-path", motion_recipe_id: recipe.id,
      ...(recipe.assets.eventReceipt ? { event_receipt: recipe.assets.eventReceipt } : {}),
      media_scale: cursorScale, media_offset_x: first.x, media_offset_y: first.y, media_opacity: 0,
      animationIn: "none", animationOut: "none", keyframes: cursorMotion.keyframes,
      cursor_motion_contract: "One continuous path that settles before clicks, pulses on contact, and hides long or semantic travel.",
    };
    elements.push(cursor);
  }

  for (const [index, step] of (recipe.steps ?? []).entries()) {
    if (!(step.start >= 0 && step.end > step.start && step.end <= recipe.duration)) throw new Error(`step ${index} has invalid timing`);
    const label = baseElement(recipe.projectId, "caption_text", null, step.start, round(step.end - step.start), "captions_0", 10);
    label.props = {
      text: step.text, role: "tutorial_step_label", timeline_label: step.text, motion_recipe_id: recipe.id,
      timingMode: "static", fontPreset: recipe.style?.stepFontPreset ?? "inter",
      fontSizePx: recipe.style?.stepFontSizePx ?? 48, maxWidth: recipe.style?.stepMaxWidth ?? 0.82,
      positionPreset: "bottom_center", absX: recipe.style?.stepAbsX ?? 0.09, absY: recipe.style?.stepAbsY ?? 0.82,
      textAlign: "center", styleVariant: recipe.style?.stepStyleVariant ?? "black_card",
      textColor: recipe.style?.stepTextColor ?? "#FFFFFF", animationIn: "fade", animationOut: "fade",
      animationInDuration: 0.22, animationOutDuration: 0.2, editorial_role: `tutorial-step-${index + 1}`,
    };
    elements.push(label);
  }

  return { recipeId: recipe.id, videoProps, elements, laneOrderKeys: ["visual_cursor", "captions_0", "visual_0", "visual_background"], preflight };
}

/** Mutates a freshly read timeline after preflight, replacing only recipe-owned overlays. */
export function applyCompiledTutorialMotion(
  timeline: TimelineFile,
  compiled: CompiledTutorialMotion,
  options: ApplyTutorialMotionOptions = {},
) {
  assertTutorialMotionPreflight(compiled.preflight);
  const videoLaneKey = options.videoLaneKey ?? "visual_0";
  const replaceRecipeIds = new Set([compiled.recipeId, ...(options.replaceRecipeIds ?? [])]);
  timeline.elements = timeline.elements.filter((element) => {
    const recipeOwned = replaceRecipeIds.has(String(element.props?.motion_recipe_id ?? ""));
    return !recipeOwned || element.lane_key === videoLaneKey;
  });
  const video = timeline.elements.find((element) =>
    element.lane_key === videoLaneKey && element.type === "video_clip" && element.removed_at == null
  );
  if (!video) throw new Error(`Missing active tutorial video clip on ${videoLaneKey}`);
  video.props = { ...(video.props ?? {}), ...compiled.videoProps };
  video.updated_at = new Date().toISOString();
  timeline.elements.push(...compiled.elements);
  return video;
}
