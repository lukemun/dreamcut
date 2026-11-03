import zlib from "node:zlib";

/** Below this, compression overhead outweighs the transfer saving on localhost. */
export const COMPRESS_JSON_MIN_BYTES = 16 * 1024;

export function pickJsonEncoding(acceptEncoding: string | null): "br" | "gzip" | null {
  if (!acceptEncoding) return null;
  const accepted = new Map(acceptEncoding.split(",").map((part) => {
    const [name, ...params] = part.trim().toLowerCase().split(";");
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    return [name, q ? Number(q.slice(2)) : 1] as const;
  }));
  if ((accepted.get("br") ?? 0) > 0) return "br";
  if ((accepted.get("gzip") ?? 0) > 0) return "gzip";
  return null;
}

/**
 * `Response.json` with brotli/gzip for large payloads. The development server does
 * not compress route responses; `next start` skips responses that already carry a
 * Content-Encoding, so this never double-encodes.
 */
export function compressedJson(request: Request, body: unknown, init: ResponseInit = {}): Response {
  return compressedJsonText(request, JSON.stringify(body), init);
}

/** `compressedJson` for a body already serialized (a cached poll body). */
export function compressedJsonText(request: Request, text: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.append("Vary", "Accept-Encoding");
  const raw = Buffer.from(text, "utf8");
  const encoding = raw.length >= COMPRESS_JSON_MIN_BYTES ? pickJsonEncoding(request.headers.get("accept-encoding")) : null;
  if (!encoding) return new Response(text, { ...init, headers });
  const encoded = encodeJson(text, raw, encoding);
  headers.set("Content-Encoding", encoding);
  headers.set("Content-Length", String(encoded.length));
  return new Response(new Uint8Array(encoded), { ...init, headers });
}

// Polled and reloaded bodies (a large timeline) are often unchanged between requests. The last
// few encodings are kept and reused only for an identical body text, so the bytes are the same
// ones compression would produce. Bounded by entry count and total retained bytes.
type EncodedJsonEntry = { text: string; encoding: "br" | "gzip"; encoded: Buffer };
const ENCODED_JSON_CACHE_ENTRIES = 4;
const ENCODED_JSON_CACHE_MAX_BYTES = 48 * 1024 * 1024;
const encodedJsonCache: EncodedJsonEntry[] = [];

function encodeJson(text: string, raw: Buffer, encoding: "br" | "gzip"): Buffer {
  const hit = encodedJsonCache.findIndex((entry) => entry.encoding === encoding && entry.text.length === text.length && entry.text === text);
  if (hit >= 0) {
    const [entry] = encodedJsonCache.splice(hit, 1);
    encodedJsonCache.unshift(entry);
    return entry.encoded;
  }
  // Quality 4 brotli: near-gzip-9 ratio at a few ms per megabyte, suitable per request.
  const encoded = encoding === "br"
    ? zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } })
    : zlib.gzipSync(raw, { level: 6 });
  if (raw.length + encoded.length <= ENCODED_JSON_CACHE_MAX_BYTES) {
    encodedJsonCache.unshift({ text, encoding, encoded });
    let retained = 0;
    for (let index = 0; index < encodedJsonCache.length; index += 1) {
      retained += encodedJsonCache[index].text.length + encodedJsonCache[index].encoded.length;
      if (index >= ENCODED_JSON_CACHE_ENTRIES || retained > ENCODED_JSON_CACHE_MAX_BYTES) { encodedJsonCache.length = index; break; }
    }
  }
  return encoded;
}
