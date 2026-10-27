import { useEffect, useState } from "react";

/** A re-preparation of an already-shown preview stays quiet until it takes this long. */
export const PREVIEW_LOADING_DELAY_MS = 600;

/**
 * Whether the card shows Loading instead of Replay. The first preparation of a
 * preview shows at once; a dial drag re-prepares the shown preview on every
 * value, so those show Loading only once one runs past the delay.
 */
export function previewLoadingShown({
  loading,
  previewKey,
  readyKey,
  loadingElapsedMs,
}: {
  loading: boolean;
  previewKey: string | null;
  /** The preview that has finished preparing at least once. */
  readyKey: string | null;
  loadingElapsedMs: number;
}) {
  if (!loading) return false;
  if (previewKey == null || previewKey !== readyKey) return true;
  return loadingElapsedMs >= PREVIEW_LOADING_DELAY_MS;
}

export function useShownPreviewLoading(loading: boolean, previewKey: string | null) {
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!loading) {
      setSlow(false);
      setReadyKey(previewKey);
      return;
    }
    setSlow(false);
    const timer = window.setTimeout(() => setSlow(true), PREVIEW_LOADING_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [loading, previewKey]);
  return previewLoadingShown({ loading, previewKey, readyKey, loadingElapsedMs: slow ? PREVIEW_LOADING_DELAY_MS : 0 });
}
