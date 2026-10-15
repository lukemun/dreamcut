/** Prevent pre-decision requests from restoring resolved cards or stale Undo state. */
export function createReviewRefreshEpoch() {
  let generation = 0;
  return {
    capture: () => generation,
    invalidate: () => { generation += 1; },
    isCurrent: (request: number) => request === generation,
  };
}

/** Fast Refresh can retain the old numeric ref across a development upgrade. */
export function restoreReviewRefreshEpoch(value: unknown): ReturnType<typeof createReviewRefreshEpoch> {
  const candidate = value as ReturnType<typeof createReviewRefreshEpoch> | null;
  return candidate && typeof candidate.capture === "function"
    && typeof candidate.invalidate === "function" && typeof candidate.isCurrent === "function"
    ? candidate : createReviewRefreshEpoch();
}
