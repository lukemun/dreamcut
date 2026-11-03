// Pure and client-safe: the dashboard cover and the export dialog both pick
// the timeline's first local image/video source.
export type ProjectCover = { url: string; video: boolean };

/** First existing local image/video source in a timeline: no render job or external request. */
export function coverFromTimeline(timeline: unknown): ProjectCover | undefined {
  const elements = (timeline as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) return undefined;
  for (const element of elements as Array<{ source_url?: unknown; props?: { preview_source_url?: unknown } }>) {
    const url = element?.props?.preview_source_url ?? element?.source_url;
    if (typeof url !== "string" || !url.startsWith("/api/projects/") || url.includes("#")) continue;
    if (/\.(png|jpe?g|webp|gif)(?:\?|$)/i.test(url)) return { url, video: false };
    if (/\.(mp4|webm|mov)(?:\?|$)/i.test(url)) return { url, video: true };
  }
  return undefined;
}
