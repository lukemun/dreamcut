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
  const text = JSON.stringify(body);
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.append("Vary", "Accept-Encoding");
  const raw = Buffer.from(text, "utf8");
  const encoding = raw.length >= COMPRESS_JSON_MIN_BYTES ? pickJsonEncoding(request.headers.get("accept-encoding")) : null;
  if (!encoding) return new Response(text, { ...init, headers });
  // Quality 4 brotli: near-gzip-9 ratio at a few ms per megabyte, suitable per request.
  const encoded = encoding === "br"
    ? zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } })
    : zlib.gzipSync(raw, { level: 6 });
  headers.set("Content-Encoding", encoding);
  headers.set("Content-Length", String(encoded.length));
  return new Response(new Uint8Array(encoded), { ...init, headers });
}
