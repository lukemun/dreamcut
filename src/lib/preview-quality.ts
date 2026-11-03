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
/** Each project keeps its own quality; this browser mirrors the prepared size for the player. */
export const previewQualityKey = (projectId: string) => `${PREVIEW_QUALITY_KEY}:${projectId}`;
export function readPreviewQuality(projectId: string): PreviewQuality {
  try { return parsePreviewQuality(getStoredItem(window.localStorage, previewQualityKey(projectId))); } catch { return "prepared"; }
}
export function storePreviewQuality(projectId: string, quality: PreviewQuality) {
  try { window.localStorage.setItem(previewQualityKey(projectId), quality); } catch { /* The server remains authoritative. */ }
  window.dispatchEvent(new Event(PREVIEW_QUALITY_EVENT));
}

const AUTOMATIC_TIERS = ["economy", "balanced", "detail", "hd", "uhd"] as const satisfies readonly PreviewQuality[];
/**
 * The size Automatic prepares at: the smallest that fills the player's long edge in screen pixels,
 * never larger than the video itself. Up to 15% enlargement on screen is allowed, as it is not visible.
 */
export function automaticPreviewQuality(playerLongEdgePixels: number, outputLongEdge: number): PreviewQuality {
  const needed = Math.min(playerLongEdgePixels, outputLongEdge) * 0.85;
  return AUTOMATIC_TIERS.find(tier => PREVIEW_QUALITIES[tier].edge >= needed) ?? "uhd";
}

/** Shared picture bounds for both preview engines. */
export function previewDimensions(quality: PreviewQuality, alpha: boolean) {
  const edge = PREVIEW_QUALITIES[quality].edge || (alpha ? 960 : 640);
  return { edge: alpha ? Math.min(edge, 960) : edge, short: alpha ? 540 : quality === "uhd" ? 2160 : quality === "hd" ? 1080 : 720 };
}
