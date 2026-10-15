/** A viewing preference, never a timeline edit or export setting. */
export const PREVIEW_PREPARATION_KEY = 'dreamcut.preview-preparation';
export const PREVIEW_PREPARATION_EVENT = 'dreamcut-preview-preparation';
export type PreviewPreparation = 'prepared' | 'live' | 'rolling' | 'selective' | 'gpu';
export function parsePreviewPreparation(value: unknown): PreviewPreparation {
  return value === 'live' || value === 'rolling' || value === 'selective' || value === 'gpu' ? value : 'prepared';
}
export function shouldUsePreparedPicture(mode: PreviewPreparation, frames: number) {
  return mode === 'prepared' && frames > 0 && frames <= 1800;
}
