/**
 * Dial values of a motion graphic that have not been rendered yet. A render takes seconds, so the
 * viewer draws the composition itself with these values over the clip until the render lands.
 */
export type LiveMotionWindow = { start: number; sourceStart: number; duration: number };
export type LiveMotionDraft = {
  /** One graphic on one card or clip; a newer draft for another graphic replaces this one. */
  key: string;
  compositionId: string;
  values: Record<string, string | number | boolean>;
  window: LiveMotionWindow;
};

let draft: LiveMotionDraft | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };

export const liveMotionStore = {
  get: () => draft,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  set(next: LiveMotionDraft) {
    draft = next;
    emit();
  },
  /** Clears this graphic's draft only, so one card settling never hides another's. */
  clear(key: string) {
    if (draft?.key !== key) return;
    draft = null;
    emit();
  },
};
