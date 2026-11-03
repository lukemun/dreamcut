/** Source trims are frame-snapped at the storyboard's 30 fps clock. */
export const TRIM_FPS = 30;
export type TrimWindow = { start: number; duration: number };

/** Last whole frame of a source; trims never extend past it. */
export const sourceLastFrame = (sourceDuration: number) => Math.max(0, Math.floor(sourceDuration * TRIM_FPS + 1e-6));

/**
 * Resolve an in/out range (seconds) to a frame-snapped trim inside the source.
 * Returns null when nothing changes, so callers skip a no-op save.
 */
export function trimFromRange(current: TrimWindow, inSeconds: number, outSeconds: number, sourceDuration: number): TrimWindow | null {
  const lastFrame = sourceLastFrame(sourceDuration);
  if (lastFrame < 1 || !Number.isFinite(inSeconds) || !Number.isFinite(outSeconds)) return null;
  const startFrame = Math.min(lastFrame - 1, Math.max(0, Math.round(inSeconds * TRIM_FPS)));
  const endFrame = Math.min(lastFrame, Math.max(startFrame + 1, Math.round(outSeconds * TRIM_FPS)));
  const currentStart = Math.round(current.start * TRIM_FPS), currentEnd = Math.round((current.start + current.duration) * TRIM_FPS);
  if (startFrame === currentStart && endFrame === currentEnd) return null;
  return { start: startFrame / TRIM_FPS, duration: (endFrame - startFrame) / TRIM_FPS };
}

/**
 * Move one edge to a time. Moving the in point past the out point pushes the out point
 * one frame later (and vice versa), keeping at least one frame selected.
 */
export function trimEdge(current: TrimWindow, edge: "in" | "out", seconds: number, sourceDuration: number): TrimWindow | null {
  const lastFrame = sourceLastFrame(sourceDuration);
  if (lastFrame < 1 || !Number.isFinite(seconds)) return null;
  const frame = Math.min(lastFrame, Math.max(0, Math.round(seconds * TRIM_FPS)));
  const startFrame = Math.round(current.start * TRIM_FPS), endFrame = Math.round((current.start + current.duration) * TRIM_FPS);
  if (edge === "in") {
    const nextStart = Math.min(frame, lastFrame - 1);
    return trimFromRange(current, nextStart / TRIM_FPS, Math.max(endFrame, nextStart + 1) / TRIM_FPS, sourceDuration);
  }
  const nextEnd = Math.max(1, frame);
  return trimFromRange(current, Math.min(startFrame, nextEnd - 1) / TRIM_FPS, nextEnd / TRIM_FPS, sourceDuration);
}

/** Keep the in point and change only the length, bounded by the source end. */
export function trimDuration(current: TrimWindow, duration: number, sourceDuration: number): TrimWindow | null {
  return trimFromRange(current, current.start, current.start + duration, sourceDuration);
}
