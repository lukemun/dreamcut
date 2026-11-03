/**
 * Browsing thumbnails for local media routes. Pure and client-safe.
 *
 * The media routes accept `?w=<width>` from this bounded allow-list and answer
 * with a cached WebP derivative (images) or poster frame (videos). Originals,
 * preview proxies and render/export paths keep requesting the unmodified URL.
 */
export const THUMBNAIL_WIDTHS = [160, 320, 640] as const;
export type ThumbnailWidth = (typeof THUMBNAIL_WIDTHS)[number];

/** Routes whose GET handler understands `?w=`. Anything else is returned unchanged. */
const THUMBNAIL_ROUTE = /^\/api\/(?:image-catalog\/media|visual-catalog\/media|projects\/[^/?#]+\/media)\/[^?#]+/;

/** Smallest allowed width covering `pixels`; requests above the largest use the largest. */
export function snapThumbnailWidth(pixels: number): ThumbnailWidth {
  const wanted = Number.isFinite(pixels) ? pixels : THUMBNAIL_WIDTHS[THUMBNAIL_WIDTHS.length - 1];
  return THUMBNAIL_WIDTHS.find((width) => width >= wanted) ?? THUMBNAIL_WIDTHS[THUMBNAIL_WIDTHS.length - 1];
}

/**
 * Thumbnail URL for a local media URL at `width` device pixels (snapped up to
 * the allow-list). For video, `time` asks for the frame at that many seconds
 * (quantized server-side to 30 fps); images ignore it. Non-local URLs (blob:,
 * data:, remote, other routes) are returned unchanged. An existing media
 * fragment is preserved.
 */
export function thumbnailUrl(src: string, width: number, time?: number): string {
  if (!THUMBNAIL_ROUTE.test(src)) return src;
  const hashAt = src.indexOf("#");
  const base = hashAt === -1 ? src : src.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : src.slice(hashAt);
  const queryAt = base.indexOf("?");
  const pathPart = queryAt === -1 ? base : base.slice(0, queryAt);
  const params = new URLSearchParams(queryAt === -1 ? "" : base.slice(queryAt + 1));
  params.set("w", String(snapThumbnailWidth(width)));
  if (time != null && Number.isFinite(time) && time > 0) params.set("t", (Math.round(time * 30) / 30).toFixed(4).replace(/\.?0+$/, ""));
  return `${pathPart}?${params.toString()}${hash}`;
}
