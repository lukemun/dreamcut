/**
 * The project frame rate that frame helpers use when they are not handed one explicitly.
 *
 * - The server scopes it around each synchronous unit of work for one project (a proposal
 *   derivation or validation) with withFrameRate. Routes that already know the project pass
 *   the rate explicitly.
 * - A browser context renders one project: the editor, the render-frame and playback-proof
 *   pages and the GPU preview worker each set it once with setEditorFrameRate.
 *
 * Code that has the project rate in hand should pass it rather than rely on this default.
 * 30 is the rate of every project created before rates were selectable.
 */
let current = 30;

export function currentFrameRate(): number {
  return current;
}

export function withFrameRate<T>(fps: number, run: () => T): T {
  const previous = current;
  current = fps;
  try { return run(); } finally { current = previous; }
}

export function setEditorFrameRate(fps: number) {
  if (!Number.isFinite(fps) || fps <= 0) throw Error('Invalid project frame rate');
  current = fps;
}
