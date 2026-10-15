import {currentFrameRate} from './frame-rate-scope';

/** Frame rates a project can use. Integer rates keep frame boundaries exact and timecode
 * non-drop; NTSC fractional rates (23.976, 29.97, 59.94) are not offered yet. */
export const PROJECT_FRAME_RATES = [24, 25, 30, 50, 60] as const;
export type ProjectFrameRate = typeof PROJECT_FRAME_RATES[number];
/** Default for projects that never chose a rate, and the cadence of legacy fixtures. */
export const DEFAULT_PROJECT_FRAME_RATE: ProjectFrameRate = 30;
export const COMPOSITION_FPS: number = DEFAULT_PROJECT_FRAME_RATE;

export function isProjectFrameRate(value: unknown): value is ProjectFrameRate {
  return PROJECT_FRAME_RATES.includes(value as ProjectFrameRate);
}

/** The project's composition frame rate. Every snap, render, proxy and export reads this. */
export function projectFrameRate(metadata: {frame_rate?: unknown} | null | undefined): ProjectFrameRate {
  return isProjectFrameRate(metadata?.frame_rate) ? metadata.frame_rate : DEFAULT_PROJECT_FRAME_RATE;
}

/** One renderable frame at the project rate. */
export function minTimelineDurationSeconds(fps: number = currentFrameRate()) {
  return MIN_VISUAL_FRAMES / fps;
}
// A timeline element must occupy at least one renderable frame, but there is
// no editorial minimum duration beyond that frame boundary.
export const MIN_VISUAL_FRAMES = 1;
// Two samples retain a visible intermediate blend for very fast montage cuts.
export const MIN_TRANSITION_FRAMES = 2;

const VISUAL_TYPES = new Set(["still", "video_clip"]);

export function isVisualElementType(type: string) {
  return VISUAL_TYPES.has(type);
}

/** Frame helpers default to the scoped project rate (frame-rate-scope.ts); pass fps when known. */
export function toVisualFrame(sec: number, fps: number = currentFrameRate()) {
  return Math.round(sec * fps);
}

export function fromVisualFrame(frame: number, fps: number = currentFrameRate()) {
  return frame / fps;
}

export function quantizeVisualTrimValue(sec: number, fps: number = currentFrameRate()) {
  return fromVisualFrame(toVisualFrame(sec, fps), fps);
}

export function quantizeVisualFrameSpan(
  startSec: number,
  durationSec: number,
  options?: {
    fps?: number;
    minFrames?: number;
  },
) {
  const fps = options?.fps ?? currentFrameRate();
  const minFrames = options?.minFrames ?? MIN_VISUAL_FRAMES;
  const from = toVisualFrame(Math.max(0, startSec), fps);
  const to = Math.max(from + minFrames, toVisualFrame(Math.max(0, startSec + durationSec), fps));
  const durationFrames = to - from;
  return {
    timeline_start: fromVisualFrame(from, fps),
    duration: fromVisualFrame(durationFrames, fps),
    startFrame: from,
    endFrame: to,
    durationFrames,
  };
}
