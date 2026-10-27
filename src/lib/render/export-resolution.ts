/** Export resolutions by short side. The composition always lays out on its canonical
 * 1080p canvas, so layout, text and effects match across resolutions and renderers.
 * Smaller deliveries are downscaled by the encoder; 2K and 4K render at a higher
 * pixel density (Chromium's device scale for Standard, CanvasKit supersampling for GPU). */
export const EXPORT_RESOLUTIONS = [480, 720, 1080, 1440, 2160] as const;
export type ExportResolution = typeof EXPORT_RESOLUTIONS[number];
export const DEFAULT_EXPORT_RESOLUTION: ExportResolution = 1080;

export function isExportResolution(value: unknown): value is ExportResolution {
  return EXPORT_RESOLUTIONS.includes(value as ExportResolution);
}

/** The name creators know a resolution by. */
export function exportResolutionLabel(resolution: ExportResolution) {
  return resolution === 2160 ? "4K" : resolution === 1440 ? "2K" : `${resolution}p`;
}

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

type Size = { width: number; height: number };

/** How to produce a resolution from a canvas: render density, then optional encoder downscale. */
export function exportRenderPlan(canvas: Size, resolution: ExportResolution): { pixelScale: number; outputSize: Size; downscale: boolean } {
  const scale = resolution / Math.min(canvas.width, canvas.height);
  if (scale > 1) {
    const outputSize = { width: canvas.width * scale, height: canvas.height * scale };
    if (![outputSize.width, outputSize.height].every((n) => Number.isInteger(n) && n % 2 === 0)) {
      throw new Error(`${exportResolutionLabel(resolution)} is unavailable for a ${canvas.width} × ${canvas.height} canvas`);
    }
    return { pixelScale: scale, outputSize, downscale: false };
  }
  if (scale === 1) return { pixelScale: 1, outputSize: { ...canvas }, downscale: false };
  return { pixelScale: 1, outputSize: { width: even(canvas.width * scale), height: even(canvas.height * scale) }, downscale: true };
}

/** Encoded frame size for a canvas at the given short-side resolution. H.264 needs even sides. */
export function exportOutputSize(canvas: Size, resolution: ExportResolution) {
  return exportRenderPlan(canvas, resolution).outputSize;
}
