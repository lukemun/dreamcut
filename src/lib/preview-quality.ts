import { getStoredItem } from "@/lib/persisted-key";
export const PREVIEW_QUALITY_KEY = "dreamcut.preview-quality";
export const PREVIEW_QUALITY_EVENT = "dreamcut-preview-quality";
export const PREVIEW_QUALITIES = {
  prepared: { label: "Automatic", edge: 0 },
  economy: { label: "Smoothest · 360 px", edge: 360 },
  balanced: { label: "Balanced · 640 px", edge: 640 },
  detail: { label: "Detailed · 960 px", edge: 960 },
  hd: { label: "Full HD · up to 1080p", edge: 1920 },
  uhd: { label: "4K · up to 2160p", edge: 3840 },
} as const;
export type PreviewQuality = keyof typeof PREVIEW_QUALITIES;
export function parsePreviewQuality(value: unknown): PreviewQuality {
  return typeof value === "string" && Object.hasOwn(PREVIEW_QUALITIES, value) ? value as PreviewQuality : "prepared";
}
export function readPreviewQuality(): PreviewQuality {
  try { return parsePreviewQuality(getStoredItem(window.localStorage, PREVIEW_QUALITY_KEY)); } catch { return "prepared"; }
}

/** Shared picture bounds for both preview engines. */
export function previewDimensions(quality: PreviewQuality, alpha: boolean) {
  const edge = PREVIEW_QUALITIES[quality].edge || (alpha ? 960 : 640);
  return { edge: alpha ? Math.min(edge, 960) : edge, short: alpha ? 540 : quality === "uhd" ? 2160 : quality === "hd" ? 1080 : 720 };
}
