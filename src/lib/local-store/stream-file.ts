import fs from "node:fs";

/**
 * Stream a local file as a Response with HTTP Range support (video/audio
 * scrubbing) and safe revalidation caching for MUTABLE project media.
 *
 * Cache contract (Stage D of the preview first-load readiness work):
 * project files are overwritten in place by preprocessing, so the browser may
 * RETAIN bytes but must REVALIDATE them — `Cache-Control: private, no-cache`,
 * never `immutable`, never `no-store` (which forbade reuse entirely and made
 * every Player remount refetch every byte). The validator is derived from
 * file size + high-resolution mtime: any same-path replacement produces a new
 * ETag, so a stale range can never be silently spliced into new bytes —
 * `If-Range` mismatches fall back to a fresh 200 with the full new
 * representation.
 */
export function streamFileResponse(
  absPath: string,
  request: Request,
  options: { contentType: string; downloadName?: string; headers?: Record<string, string> },
): Response {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(absPath);
  } catch {
    return Response.json({ error: "File not found" }, { status: 404 });
  }
  if (!stat.isFile()) {
    return Response.json({ error: "File not found" }, { status: 404 });
  }

  const size = stat.size;
  // Microsecond mtime: sub-millisecond precision so rapid same-path
  // overwrites (preprocessing rewrites files in place) still change the tag.
  const mtimeUs = Math.round(stat.mtimeMs * 1000);
  const mtimeMs = stat.mtimeMs;
  const etag = `"${size.toString(16)}-${mtimeUs.toString(16)}"`;
  const lastModified = new Date(mtimeMs).toUTCString();

  const baseHeaders: Record<string, string> = {
    "Content-Type": options.contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-cache",
    ETag: etag,
    "Last-Modified": lastModified,
    ...(options.headers ?? {}),
    ...(options.downloadName
      ? { "Content-Disposition": `attachment; filename="${options.downloadName.replace(/"/g, "")}"` }
      : {}),
  };

  // Conditional revalidation for FULL requests. If-None-Match wins over
  // If-Modified-Since per RFC 9110 §13.1.3. A 304 must not carry a body.
  const ifNoneMatch = request.headers.get("if-none-match");
  const ifModifiedSince = request.headers.get("if-modified-since");
  const rangeHeader = request.headers.get("range");
  if (!rangeHeader) {
    const etagMatches = ifNoneMatch != null
      && ifNoneMatch.split(",").map((candidate) => candidate.trim()).includes(etag);
    const timeMatches = ifNoneMatch == null
      && ifModifiedSince != null
      && mtimeMs <= Date.parse(ifModifiedSince) + 999;
    if (etagMatches || timeMatches) {
      return new Response(null, { status: 304, headers: baseHeaders });
    }
  }

  const match = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);

  let start = 0;
  let end = size - 1;
  let status = 200;

  if (match && (match[1] !== "" || match[2] !== "")) {
    // If-Range: only honor the range when the validator still names the bytes
    // on disk; a replaced file answers with the full new representation.
    const ifRange = request.headers.get("if-range");
    const ifRangeMatchesCurrent = ifRange == null
      || ifRange === etag
      || (!ifRange.startsWith("\"") && Date.parse(ifRange) >= mtimeMs);
    if (ifRangeMatchesCurrent) {
      if (match[1] === "") {
        // suffix range: last N bytes
        const suffixLength = Number.parseInt(match[2], 10);
        start = Math.max(0, size - suffixLength);
      } else {
        start = Number.parseInt(match[1], 10);
        if (match[2] !== "") end = Math.min(size - 1, Number.parseInt(match[2], 10));
      }
      if (start > end || start >= size) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}`, ETag: etag },
        });
      }
      status = 206;
      baseHeaders["Content-Range"] = `bytes ${start}-${end}/${size}`;
    }
  }

  baseHeaders["Content-Length"] = String(end - start + 1);

  const nodeStream = fs.createReadStream(absPath, { start, end });
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk as Buffer)));
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (error) => controller.error(error));
    },
    cancel() {
      nodeStream.destroy();
    },
  });

  return new Response(body, { status, headers: baseHeaders });
}
