/** Playback speeds the preview offers; 1 is normal. The choice is the viewer's, kept in this browser. */
export const PREVIEW_SPEEDS = [0.5, 1, 1.25, 1.5, 2] as const;
const KEY = "dreamcut:preview-speed";

export function formatPreviewSpeed(speed: number) {
  return `${speed}×`;
}

export function readPreviewSpeed(): number {
  try {
    const stored = Number(window.localStorage.getItem(KEY));
    return (PREVIEW_SPEEDS as readonly number[]).includes(stored) ? stored : 1;
  } catch { return 1; }
}

export function writePreviewSpeed(speed: number) {
  try { window.localStorage.setItem(KEY, String(speed)); } catch { /* private window: the choice lasts this session */ }
}
