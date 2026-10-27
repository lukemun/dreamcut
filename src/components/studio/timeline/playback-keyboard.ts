export function clampSteppedFrame(currentFrame: number, step: -1 | 1, durationInFrames: number): number {
  const lastFrame = Math.max(0, Math.floor(durationInFrames) - 1);
  return Math.min(lastFrame, Math.max(0, Math.round(currentFrame) + step));
}

/** Sliders retain focus after dragging but are not text-entry fields. */
export function blocksReviewShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable
    || Boolean(target.closest('[role="dialog"][aria-modal="true"]'))
    || ["TEXTAREA", "SELECT"].includes(target.tagName)
    || (target instanceof HTMLInputElement && reviewInputCapturesKeys(target.type));
}

export function reviewInputCapturesKeys(type: string): boolean {
  return !["range", "checkbox", "radio", "button", "submit", "reset"].includes(type);
}
