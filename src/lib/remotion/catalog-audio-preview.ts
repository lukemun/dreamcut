/** Browser-only transport; the saved source and export authority never change. */
export function catalogAudioPreviewUrl(source: string, isRendering = false): string {
  if (isRendering) return source;
  const url = new URL(source, "http://preview.local");
  const music = url.pathname.startsWith("/api/music-catalog/media/");
  const sfx = url.pathname.startsWith("/api/sfx-catalog/media/");
  if (!music && !sfx) return source;
  // Local catalog URLs may have been saved under localhost while the editor
  // is opened under 127.0.0.1. Web Audio requires same-origin/CORS transport
  // for every codec, not only the Opus compatibility derivative.
  if (music && /\.(opus|ogg)$/i.test(url.pathname)) url.searchParams.set("preview", "1");
  return source.startsWith("/") || ["localhost", "127.0.0.1"].includes(url.hostname)
    ? url.pathname + url.search : url.toString();
}
