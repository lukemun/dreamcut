/**
 * The local editor speaks plain HTTP/1.1, and a browser opens at most six connections per
 * host:port, shared by every tab. Paused <video>/<audio> downloads and the agent-chat event
 * stream each hold one open, so a page with several media elements left no connection for
 * Apply, timeline reads or polls. The same server answers on several loopback names, and the
 * browser pools connections per name, so this module gives long-lived traffic names of its own:
 *
 * - media playback (element sources, decoder range reads) goes to the sibling loopback name:
 *   a page on 127.0.0.1:<port> loads media from localhost:<port>, and the reverse;
 * - event streams go to [::1]:<port>, which carries nothing else.
 *
 * Only the browser transport changes. Stored timeline URLs, cache keys and export sources keep
 * the URL they were given. Any other page host (a renderer bundle, a remote preview) is unchanged.
 */

const SIBLING: Record<string, string> = { "127.0.0.1": "localhost", localhost: "127.0.0.1" };
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** Routes that serve files through streamFileResponse/thumbnailResponse, which answer the
 * editor's sibling origins with CORS headers (editorSiblingCorsHeaders). */
const MEDIA_ROUTE = /^\/api\/(?:projects\/[^/]+\/(?:media\/|library\/instruments\/|render\/latest\/file(?:$|\?))|(?:music|sfx|visual|image)-catalog\/media\/|guide\/(?:user-)?effects\/[^/]+\/media(?:$|\?)|template-drafts\/[^/]+\/media(?:$|\?)|user\/video-ideas\/[^/]+\/media(?:$|\?)|exports\/[^/]+\/file(?:$|\?))/;

export type PagePlace = { protocol: string; hostname: string; port: string; origin: string; href: string };

function currentPlace(): PagePlace | null {
  const place = (globalThis as { location?: PagePlace }).location;
  return place && typeof place.href === "string" && typeof place.hostname === "string" ? place : null;
}

/** The URL a browser should load this media from. `url` may be relative or absolute; a URL
 * stored under either loopback name of this editor (same port) counts as the editor's own. */
export function mediaTransportUrl(url: string, place: PagePlace | null = currentPlace()): string {
  if (!url || !place || place.protocol !== "http:") return url;
  const sibling = SIBLING[place.hostname];
  if (!sibling) return url;
  let parsed: URL;
  try { parsed = new URL(url, place.href); } catch { return url; }
  if (parsed.protocol !== "http:" || parsed.port !== place.port || !SIBLING[parsed.hostname]) return url;
  if (!MEDIA_ROUTE.test(parsed.pathname + parsed.search)) return url;
  parsed.hostname = sibling;
  return parsed.href;
}

/** The URL a long-lived event stream should open, on the stream-only [::1] name.
 * Returns null where no separate name exists (callers keep the same-origin path). */
export function streamTransportUrl(path: string, place: PagePlace | null = currentPlace()): string | null {
  if (!path.startsWith("/") || !place || place.protocol !== "http:" || !SIBLING[place.hostname]) return null;
  return `http://[::1]${place.port ? `:${place.port}` : ""}${path}`;
}

/** Headers that answer a browser's CORS preflight for a media read from the editor's sibling loopback
 * name (the decoder's range reads send one), or null when the request is not such a preflight:
 * only read methods, only the media routes, only a same-port loopback origin. */
export function editorSiblingPreflightHeaders(request: Request): Record<string, string> | null {
  if (request.method !== "OPTIONS") return null;
  const method = request.headers.get("access-control-request-method")?.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return null;
  const url = new URL(request.url);
  if (!MEDIA_ROUTE.test(url.pathname + url.search)) return null;
  const cors = editorSiblingCorsHeaders(request);
  if (!cors["Access-Control-Allow-Origin"]) return null;
  return {
    ...cors,
    "Access-Control-Allow-Methods": "GET, HEAD",
    // Echo the requested headers: fetch wrappers (error tracing) add their own to every read.
    "Access-Control-Allow-Headers": request.headers.get("access-control-request-headers") || "Range",
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Max-Age": "600",
  };
}

/** CORS headers that let the editor's other loopback names read a same-port response
 * (crossOrigin="anonymous" media drawn into WebGL, range reads in the decoder worker,
 * the event stream). Any other origin gets none. */
export function editorSiblingCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin) return {};
  try {
    const from = new URL(origin), host = new URL(`http://${request.headers.get("host") ?? new URL(request.url).host}`);
    if (from.protocol !== "http:" || from.origin !== origin || !LOOPBACK.has(from.hostname) || !LOOPBACK.has(host.hostname) || from.port !== host.port) return {};
  } catch { return {}; }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length, ETag",
    Vary: "Origin",
  };
}
