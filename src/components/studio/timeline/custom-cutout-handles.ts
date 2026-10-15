export const DEFAULT_EDITABLE_HANDLE_SECONDS = 2;
export const MAX_CUTOUT_INTERVAL_SECONDS = 75;

export function cutoutIntervalWithEditableHandles(input: {
  visibleStartSeconds: number;
  visibleEndSeconds: number;
  sourceDurationSeconds: number;
  handleSeconds?: number;
}) {
  const handle = Math.max(0, input.handleSeconds ?? DEFAULT_EDITABLE_HANDLE_SECONDS);
  const visibleStart = Math.max(0, input.visibleStartSeconds);
  const visibleEnd = Math.min(input.sourceDurationSeconds, input.visibleEndSeconds);
  let start = Math.max(0, visibleStart - handle);
  let end = Math.min(input.sourceDurationSeconds, visibleEnd + handle);
  if (end - start > MAX_CUTOUT_INTERVAL_SECONDS) {
    start = visibleStart;
    end = visibleEnd;
  }
  return { startSeconds: start, endSeconds: end };
}
