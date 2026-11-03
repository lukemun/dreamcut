import {
  COMPOSITION_FPS,
  MIN_VISUAL_FRAMES,
  fromVisualFrame,
  MIN_TRANSITION_FRAMES,
  toVisualFrame,
} from "@/lib/timeline/frame-quantization";
import { isVisualLane } from "@/lib/timeline/lanes";

import type {
  TimelineElement,
  TimelineTransition,
  TimelineTransitionChip,
  TimelineTransitionDirection,
  TimelineTransitionParams,
  TimelineTransitionType,
  PageTurnOrigin,
} from "@/components/studio/timeline/types";

import { TIMELINE_TRANSITION_TYPES } from "@/lib/timeline/contracts";
import { resolveTransitionNumber, transitionControl } from "./transition-controls";

/** The only owner of smear geometry; absent values preserve historical presets. */
export function resolveSmearTransitionVisualStyle(
  progress: number, phase: "in" | "out", direction: TimelineTransitionDirection,
  params: TimelineTransitionParams | null | undefined, canvasWidth = 1080,
) {
  const p = Math.max(0, Math.min(1, progress));
  const amount = phase === "in" ? 1 - p : p;
  const vertical = direction === "from-top" || direction === "from-bottom";
  const sign = (direction === "from-right" || direction === "from-bottom" ? 1 : -1) * (phase === "out" ? -1 : 1);
  const travel = sign * amount * resolveTransitionNumber(params, "params.smear_travel_percent");
  const scale = 1 + amount * resolveTransitionNumber(params, "params.smear_zoom_percent") / 100;
  return {
    translateXPercent: vertical ? 0 : travel,
    translateYPercent: vertical ? travel : 0,
    scale,
    transform: `translate3d(${vertical ? 0 : travel}%, ${vertical ? travel : 0}%, 0) scale(${scale})`,
    blurPx: Math.sin(Math.PI * p) * 160 * resolveTransitionNumber(params, "params.whip_blur_strength") * canvasWidth / 1080,
    opacity: phase === "in" ? p : 1,
    vertical,
  };
}

export const DEFAULT_TRANSITION_DURATION_SECONDS: number = transitionControl("duration_seconds")!.default;
export const MAX_TRANSITION_DURATION_SECONDS: number = transitionControl("duration_seconds")!.max;
export const DEFAULT_PAGE_TURN_CURL: number = transitionControl("params.page_curl")!.default;
export const MAX_PAGE_TURN_CURL: number = transitionControl("params.page_curl")!.max;
export const DEFAULT_PAGE_TURN_ORIGIN: PageTurnOrigin = "right-edge";

export type TransitionValidationResult =
  | { ok: true; durationSeconds: number }
  | { ok: false; reason: string };

export type TimelineTransitionLayout = {
  renderedElements: TimelineElement[];
  transitionChips: TimelineTransitionChip[];
  effectiveDurationSeconds: number;
};

export type TimelineTransitionWindow = {
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
};

export type WhipTransitionVisualStyle = {
  opacity: number;
  translateXPercent: number;
  translateYPercent: number;
  scale: number;
  blurPx: number;
  rotateYDeg: number;
  rotateZDeg: number;
};

export type CubeTransitionVisualStyle = {
  transform: string;
  translateX: number;
  translateY: number;
  translateZ: number;
  rotateXDeg: number;
  rotateYDeg: number;
  transformOrigin: string;
};

export type PageTurnTransitionVisualStyle = {
  rotateXDeg: number;
  rotateYDeg: number;
  transformOrigin: string;
  revealPercent: number;
  shadowOpacity: number;
  pageShadeOpacity: number;
};

export const DEFAULT_WHIP_BLUR_STRENGTH: number = transitionControl("params.whip_blur_strength")!.default;
export const MAX_WHIP_BLUR_STRENGTH: number = transitionControl("params.whip_blur_strength")!.max;
export const SLIDE_MOTION_BLUR_PEAK_PX = 28;

/** Use real incoming source handles so a moving join lands on its saved head. */
export function resolveIncomingTransitionPreroll(
  sourceHeadFrame: number,
  transitionFrames: number,
  playbackRate: number,
) {
  const sourceFrames = Math.round(transitionFrames * playbackRate);
  if (!Number.isFinite(sourceFrames) || sourceFrames <= 0 || sourceHeadFrame < sourceFrames) return null;
  return { trimBefore: sourceHeadFrame - sourceFrames, trimAfter: sourceHeadFrame };
}

export function resolveWhipBlurStrength(
  params: TimelineTransitionParams | null | undefined,
) {
  return resolveTransitionNumber(params, "params.whip_blur_strength");
}

/** Optional blur pulse for travelling slides; absent stays perfectly sharp. */
export function resolveSlideMotionBlurPx(
  progress: number,
  params: TimelineTransitionParams | null | undefined,
) {
  if (params?.whip_blur_strength == null) return 0;
  const p = Math.max(0, Math.min(1, progress));
  return Math.sin(Math.PI * p)
    * SLIDE_MOTION_BLUR_PEAK_PX
    * resolveWhipBlurStrength(params);
}

/** Shared two-card slide geometry; filtering precedes the actor transform. */
export function resolveSlideTransitionVisualStyle(
  progress:number,phase:'in'|'out',direction:TimelineTransitionDirection,
  params:TimelineTransitionParams|null|undefined,travelPercent=100,
){
  // Preserve authored easing overshoot; CSS clamps opacity independently.
  const p=progress,inPlace=params?.motion==='in-place';
  const amount=phase==='in'?1-p:p;
  const sign=(direction==='from-right'||direction==='from-bottom'?1:-1)*(phase==='out'?-1:1);
  const distance=phase==='out'&&inPlace?0:sign*amount*(inPlace?6:Math.max(1,Math.min(100,travelPercent)));
  const vertical=direction==='from-top'||direction==='from-bottom';
  return {translateXPercent:vertical?0:distance,translateYPercent:vertical?distance:0,
    scale:phase==='in'&&inPlace ? .985+p*.015 : 1,opacity:phase==='in'&&inPlace?p:1,
    blurPx:phase==='out'&&inPlace?0:resolveSlideMotionBlurPx(p,params)};
}

export function resolvePageTurnCurl(
  params: TimelineTransitionParams | null | undefined,
) {
  return resolveTransitionNumber(params, "params.page_curl");
}

export function resolvePageTurnOrigin(
  params: TimelineTransitionParams | null | undefined,
): PageTurnOrigin {
  return params?.page_turn_origin === "bottom-right"
    ? "bottom-right"
    : DEFAULT_PAGE_TURN_ORIGIN;
}

/** Hold a transition visually neutral until its narration-owned start. */
export function remapTransitionProgressAfterHold(
  rawProgress: number,
  motionStartProgress = 0,
) {
  const raw = Math.max(0, Math.min(1, rawProgress));
  const start = Math.max(0, Math.min(0.95, motionStartProgress));
  if (raw <= start) return 0;
  return Math.max(0, Math.min(1, (raw - start) / (1 - start)));
}

export function resolveTransitionAudioMultiplier(
  frame: number,
  durationInFrames: number,
  transition: Pick<TimelineTransition, "duration_seconds" | "params"> | null | undefined,
) {
  if (!transition) return 1;
  const transitionFrames = Math.max(1, toVisualFrame(transition.duration_seconds));
  const transitionStartFrame = Math.max(0, durationInFrames - transitionFrames);
  const startProgress = Math.max(
    0,
    Math.min(0.95, transition.params?.audio_fade_start_progress ?? 0),
  );
  const fadeStartFrame = Math.min(
    durationInFrames,
    transitionStartFrame + Math.round(transitionFrames * startProgress),
  );
  const requestedFadeFrames = transition.params?.audio_fade_duration_seconds == null
    ? durationInFrames - fadeStartFrame
    : Math.max(1, toVisualFrame(transition.params.audio_fade_duration_seconds));
  const fadeEndFrame = Math.min(
    durationInFrames,
    fadeStartFrame + Math.max(1, requestedFadeFrames),
  );
  if (frame <= fadeStartFrame) return 1;
  if (frame >= fadeEndFrame) return 0;
  return 1 - ((frame - fadeStartFrame) / Math.max(1, fadeEndFrame - fadeStartFrame));
}

/** Overlapping camera plates, blended through the peak of directional motion. */
export function resolveWhipTransitionVisualStyle(
  progress: number, phase: "in" | "out", direction: TimelineTransitionDirection,
  blurStrength = DEFAULT_WHIP_BLUR_STRENGTH,
  params?: TimelineTransitionParams | null,
): WhipTransitionVisualStyle {
  const p = Math.max(0, Math.min(1, progress));
  const eased = p * p * (3 - 2 * p);
  const motion = phase === "in" ? 1 - eased : eased;
  const pulse = p === 0 || p === 1 ? 0 : Math.sin(Math.PI * p);
  const sign = (direction === "from-right" || direction === "from-bottom" ? 1 : -1) * (phase === "out" ? -1 : 1);
  const vertical = direction === "from-top" || direction === "from-bottom";
  const blend = Math.max(0, Math.min(1, (p - .2) / .6));
  return {
    translateXPercent: vertical || motion === 0 ? 0 : sign * motion * 32,
    translateYPercent: vertical && motion !== 0 ? sign * motion * 32 : 0,
    scale: 1 + pulse * resolveTransitionNumber(params, "params.whip_zoom_percent") / 100,
    blurPx: pulse * 100 * Math.max(0, Math.min(MAX_WHIP_BLUR_STRENGTH, blurStrength)),
    opacity: phase === "in" ? blend * blend * (3 - 2 * blend) : 1,
    rotateYDeg: 0, rotateZDeg: 0,
  };
}

/** Adjacent rigid cube faces share one rotation centre and one moving edge.
 * The axis depth follows the canvas, so portrait and landscape use equal geometry. */
export function resolveCubeTransitionVisualStyle(
  progress: number, phase: "in" | "out", direction: TimelineTransitionDirection,
  width = 1080, height = 1920,
): CubeTransitionVisualStyle {
  const p = Math.max(0, Math.min(1, progress));
  const vertical = direction === "from-top" || direction === "from-bottom";
  const sign = direction === "from-left" || direction === "from-top" ? -1 : 1;
  const size = vertical ? height : width;
  const theta = p * Math.PI / 2;
  const clean = (value: number) => Math.abs(value) < 1e-10 ? 0 : value;
  const travel = clean(sign * size / 2 * (phase === "in" ? Math.cos(theta) : -Math.sin(theta)));
  const z = clean(size / 2 * ((phase === "in" ? Math.sin(theta) : Math.cos(theta)) - 1));
  const angle = clean(sign * (phase === "in" ? 1 - p : -p) * 90);
  const x = vertical ? 0 : travel, y = vertical ? travel : 0;
  const rotateXDeg = vertical ? clean(-angle) : 0, rotateYDeg = vertical ? 0 : angle;
  return {translateX:x,translateY:y,translateZ:z,rotateXDeg,rotateYDeg,transformOrigin:"center",
    transform:`perspective(${size * 3}px) translate3d(${x}px, ${y}px, ${z}px) rotateX(${rotateXDeg}deg) rotateY(${rotateYDeg}deg)`};
}

/**
 * A single rigid sheet rotates through a near-complete turn while the next page
 * remains flat underneath. The renderer gives the sheet distinct front and back
 * faces; this resolver only owns the deterministic hinge geometry and lighting.
 */
export function resolvePageTurnTransitionVisualStyle(
  progress: number,
  phase: "in" | "out",
  direction: TimelineTransitionDirection,
): PageTurnTransitionVisualStyle {
  const p = Math.max(0, Math.min(1, progress));
  const isVertical = direction === "from-top" || direction === "from-bottom";
  const fromLeadingEdge = direction === "from-left" || direction === "from-top";
  const signedRotation = p === 0 ? 0 : (fromLeadingEdge ? 1 : -1) * p * 165;

  if (phase === "in") {
    return {
      rotateXDeg: 0,
      rotateYDeg: 0,
      transformOrigin: "center",
      revealPercent: 100,
      shadowOpacity: 0,
      pageShadeOpacity: 0,
    };
  }

  const lift = Math.sin(p * Math.PI);
  return {
    rotateXDeg: isVertical ? signedRotation : 0,
    rotateYDeg: isVertical ? 0 : signedRotation,
    transformOrigin: isVertical
      ? (direction === "from-top" ? "center bottom" : "center top")
      : (direction === "from-left" ? "right center" : "left center"),
    revealPercent: 100,
    shadowOpacity: lift * 0.58,
    pageShadeOpacity: lift * 0.46,
  };
}

function isTransitionType(value: string): value is TimelineTransitionType {
  return (TIMELINE_TRANSITION_TYPES as readonly string[]).includes(value);
}

export function resolveTransitionDirection(params: TimelineTransitionParams | null | undefined): TimelineTransitionDirection {
  const direction = params?.direction;
  if (
    direction === "from-left"
    || direction === "from-right"
    || direction === "from-top"
    || direction === "from-bottom"
  ) {
    return direction;
  }
  return "from-left";
}

export function quantizeTransitionDurationSeconds(
  durationSeconds: number,
  options?: {
    minFrames?: number;
    maxSeconds?: number;
  },
) {
  const minFrames = options?.minFrames ?? MIN_TRANSITION_FRAMES;
  const maxSeconds = options?.maxSeconds ?? MAX_TRANSITION_DURATION_SECONDS;
  const clamped = Math.max(fromVisualFrame(minFrames), Math.min(maxSeconds, durationSeconds));
  const durationFrames = Math.max(minFrames, toVisualFrame(clamped));
  return fromVisualFrame(durationFrames);
}

export function getTransitionMaxDurationSeconds(
  fromElement: Pick<TimelineElement, "duration">,
  toElement: Pick<TimelineElement, "duration">,
  _otherTransitionDurationOnFrom = 0,
  _otherTransitionDurationOnTo = 0,
) {
  const minBodyFrames = MIN_VISUAL_FRAMES;
  const fromAvailableFrames = toVisualFrame(fromElement.duration) - minBodyFrames;
  const toAvailableFrames = toVisualFrame(toElement.duration) - minBodyFrames;
  const maxFrames = Math.min(
    fromAvailableFrames,
    toAvailableFrames,
    toVisualFrame(MAX_TRANSITION_DURATION_SECONDS),
  );
  return maxFrames < MIN_TRANSITION_FRAMES ? 0 : fromVisualFrame(maxFrames);
}

function buildLaneOrder(elements: TimelineElement[]) {
  const byLane = new Map<string, TimelineElement[]>();
  for (const element of elements) {
    if (!isVisualLane(element.lane_key)) continue;
    const lane = byLane.get(element.lane_key) ?? [];
    lane.push(element);
    byLane.set(element.lane_key, lane);
  }
  for (const laneElements of byLane.values()) {
    laneElements.sort((a, b) => {
      const frameDiff = toVisualFrame(a.timeline_start) - toVisualFrame(b.timeline_start);
      if (frameDiff !== 0) return frameDiff;
      return a.created_at.localeCompare(b.created_at);
    });
  }
  return byLane;
}

export function validateTransitionPair(
  fromElement: TimelineElement,
  toElement: TimelineElement,
  durationSeconds: number,
  _otherTransitionDurationOnFrom = 0,
  _otherTransitionDurationOnTo = 0,
) : TransitionValidationResult {
  if (!isVisualLane(fromElement.lane_key) || !isVisualLane(toElement.lane_key)) {
    return { ok: false, reason: "Transitions only support visual lanes." };
  }
  if (fromElement.lane_key !== toElement.lane_key) {
    return { ok: false, reason: "Transitions require clips in the same visual lane." };
  }
  const fromEndFrame = toVisualFrame(fromElement.timeline_start + fromElement.duration);
  const toStartFrame = toVisualFrame(toElement.timeline_start);
  if (fromEndFrame !== toStartFrame) {
    return { ok: false, reason: "Transitions require clips to touch." };
  }
  const maxDuration = getTransitionMaxDurationSeconds(fromElement, toElement);
  if (maxDuration <= 0) {
    return { ok: false, reason: "These clips are too short for a transition." };
  }
  const normalizedDuration = quantizeTransitionDurationSeconds(durationSeconds, { maxSeconds: maxDuration });
  if (normalizedDuration > maxDuration + 0.0001) {
    return { ok: false, reason: "Transition exceeds the available clip duration." };
  }
  return { ok: true, durationSeconds: normalizedDuration };
}

export function validateTransitionAdjacency(
  elements: TimelineElement[],
  fromElementId: string,
  toElementId: string,
  durationSeconds: number,
): TransitionValidationResult {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const fromElement = byId.get(fromElementId);
  const toElement = byId.get(toElementId);
  if (!fromElement || !toElement) {
    return { ok: false, reason: "Transition clips were not found." };
  }
  const laneElements = buildLaneOrder(elements).get(fromElement.lane_key) ?? [];
  const fromIndex = laneElements.findIndex((element) => element.id === fromElementId);
  if (fromIndex < 0 || laneElements[fromIndex + 1]?.id !== toElementId) {
    return { ok: false, reason: "Transitions can only be added between adjacent clips." };
  }
  return validateTransitionPair(fromElement, toElement, durationSeconds);
}

export function deriveTransitionWindow(
  fromElement: Pick<TimelineElement, "timeline_start" | "duration">,
  transition: Pick<TimelineTransition, "duration_seconds">,
): TimelineTransitionWindow {
  const fromEndFrame = toVisualFrame(fromElement.timeline_start + fromElement.duration);
  const durationFrames = Math.max(1, toVisualFrame(transition.duration_seconds));
  const startFrame = Math.max(0, fromEndFrame - durationFrames);
  const endFrame = fromEndFrame;
  return {
    startFrame,
    endFrame,
    durationFrames,
    startSeconds: fromVisualFrame(startFrame),
    endSeconds: fromVisualFrame(endFrame),
    durationSeconds: fromVisualFrame(durationFrames),
  };
}

export function buildTimelineTransitionLayout(
  elements: TimelineElement[],
  transitions: TimelineTransition[],
): TimelineTransitionLayout {
  const activeTransitions = transitions.filter(
    (transition) =>
      !transition.removed_at
      && isTransitionType(transition.type),
  );
  const activeVisualElements = elements.filter((element) => !element.removed_at && isVisualLane(element.lane_key));
  const byId = new Map(elements.map((element) => [element.id, element]));
  const transitionInByElementId = new Map<string, TimelineTransition>();
  const transitionOutByElementId = new Map<string, TimelineTransition>();
  const transitionChips: TimelineTransitionChip[] = [];

  for (const transition of activeTransitions) {
    const fromElement = byId.get(transition.from_element_id);
    const toElement = byId.get(transition.to_element_id);
    if (!fromElement || !toElement) continue;
    const validation = validateTransitionPair(
      fromElement,
      toElement,
      transition.duration_seconds,
    );
    if (!validation.ok) continue;
    const normalizedTransition = {
      ...transition,
      duration_seconds: validation.durationSeconds,
    };
    transitionInByElementId.set(toElement.id, normalizedTransition);
    transitionOutByElementId.set(fromElement.id, normalizedTransition);
    const transitionWindow = deriveTransitionWindow(
      fromElement,
      normalizedTransition,
    );
    transitionChips.push({
      id: transition.id,
      from_element_id: fromElement.id,
      to_element_id: toElement.id,
      lane_key: fromElement.lane_key,
      timeline_start: transitionWindow.startSeconds,
      duration: transitionWindow.durationSeconds,
      start_frame: transitionWindow.startFrame,
      duration_frames: transitionWindow.durationFrames,
      end_frame: transitionWindow.endFrame,
      type: transition.type,
    });
  }

  let effectiveDurationSeconds = 0;
  const renderedElements = elements.map((element) => {
    const renderedEnd = element.timeline_start + element.duration;
    effectiveDurationSeconds = Math.max(effectiveDurationSeconds, renderedEnd);
    const transitionIn = transitionInByElementId.get(element.id) ?? null;
    const transitionOut = transitionOutByElementId.get(element.id) ?? null;
    const nextProps = element.props && typeof element.props === "object"
      ? { ...element.props }
      : element.props;

    if (nextProps && transitionIn) {
      nextProps.animationIn = "none";
    }
    if (nextProps && transitionOut) {
      nextProps.animationOut = "none";
    }

    if (!activeVisualElements.some((candidate) => candidate.id === element.id)) {
      return {
        ...element,
        props: nextProps,
        timeline_start: element.timeline_start,
        duration: element.duration,
        rendered_timeline_start: element.timeline_start,
        rendered_duration: element.duration,
        rendered_end: renderedEnd,
        transition_in_offset_seconds: 0,
      };
    }

    return {
      ...element,
      props: nextProps,
      timeline_start: element.timeline_start,
      duration: element.duration,
      rendered_timeline_start: element.timeline_start,
      rendered_duration: element.duration,
      rendered_end: renderedEnd,
      transition_in_offset_seconds: 0,
      transition_in: transitionIn,
      transition_out: transitionOut,
    };
  });

  return {
    renderedElements,
    transitionChips: transitionChips.sort((a, b) => a.timeline_start - b.timeline_start),
    effectiveDurationSeconds,
  };
}
