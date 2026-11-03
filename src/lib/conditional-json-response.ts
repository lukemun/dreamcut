import { createHash } from "node:crypto";

// Server-only: kept out of api-helpers.ts, which browser bundles (the GPU worker) also import.
/**
 * JSON for a polled read: a content ETag lets an unchanged poll answer 304
 * with no body. The ETag is derived from the exact bytes, so any change in
 * the response (including computed staleness) produces a new tag.
 */
export function conditionalJsonResponse(request: Request, body: unknown): Response {
  const text = JSON.stringify(body);
  const etag = `"${createHash("sha1").update(text).digest("base64url")}"`;
  const headers = { ETag: etag, "Cache-Control": "no-cache" };
  const match = request.headers.get("if-none-match");
  if (match && match.split(",").some((candidate) => candidate.trim().replace(/^W\//, "") === etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(text, { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
}
