import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { streamFileResponse } from "./stream-file";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stream-file-test-"));
const filePath = path.join(dir, "clip.m4a");
fs.writeFileSync(filePath, "0123456789ABCDEF"); // 16 bytes

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/projects/p/media/clip.m4a", { headers });
}

async function bodyText(response: Response): Promise<string> {
  return Buffer.from(await response.arrayBuffer()).toString("utf8");
}

test("full response carries validators and revalidation caching, never no-store", async () => {
  const response = streamFileResponse(filePath, req(), { contentType: "audio/mp4" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-cache");
  assert.match(response.headers.get("ETag") ?? "", /^"[0-9a-f]+-[0-9a-f]+"$/);
  assert.ok(response.headers.get("Last-Modified"));
  assert.equal(response.headers.get("Content-Length"), "16");
  assert.equal(await bodyText(response), "0123456789ABCDEF");
});

test("If-None-Match with the current ETag returns 304 without a body", async () => {
  const first = streamFileResponse(filePath, req(), { contentType: "audio/mp4" });
  const etag = first.headers.get("ETag")!;
  const revalidated = streamFileResponse(filePath, req({ "if-none-match": etag }), {
    contentType: "audio/mp4",
  });
  assert.equal(revalidated.status, 304);
  assert.equal(revalidated.body, null);
  assert.equal(revalidated.headers.get("ETag"), etag);
});

test("If-Modified-Since at/after mtime returns 304; earlier returns 200", () => {
  const lastModified = streamFileResponse(filePath, req(), { contentType: "audio/mp4" })
    .headers.get("Last-Modified")!;
  const notModified = streamFileResponse(filePath, req({ "if-modified-since": lastModified }), {
    contentType: "audio/mp4",
  });
  assert.equal(notModified.status, 304);
  const stale = streamFileResponse(
    filePath,
    req({ "if-modified-since": new Date(0).toUTCString() }),
    { contentType: "audio/mp4" },
  );
  assert.equal(stale.status, 200);
});

test("range request returns 206 with correct Content-Range and bytes", async () => {
  const response = streamFileResponse(filePath, req({ range: "bytes=4-7" }), {
    contentType: "audio/mp4",
  });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("Content-Range"), "bytes 4-7/16");
  assert.equal(await bodyText(response), "4567");
});

test("suffix range and invalid range behave per RFC", async () => {
  const suffix = streamFileResponse(filePath, req({ range: "bytes=-4" }), {
    contentType: "audio/mp4",
  });
  assert.equal(suffix.status, 206);
  assert.equal(await bodyText(suffix), "CDEF");
  const invalid = streamFileResponse(filePath, req({ range: "bytes=99-120" }), {
    contentType: "audio/mp4",
  });
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers.get("Content-Range"), "bytes */16");
});

test("If-Range with the live validator honors the range", async () => {
  const etag = streamFileResponse(filePath, req(), { contentType: "audio/mp4" })
    .headers.get("ETag")!;
  const response = streamFileResponse(
    filePath,
    req({ range: "bytes=0-3", "if-range": etag }),
    { contentType: "audio/mp4" },
  );
  assert.equal(response.status, 206);
  assert.equal(await bodyText(response), "0123");
});

test("If-Range with a stale validator falls back to the FULL new representation", async () => {
  const response = streamFileResponse(
    filePath,
    req({ range: "bytes=0-3", "if-range": '"dead-beef"' }),
    { contentType: "audio/mp4" },
  );
  assert.equal(response.status, 200); // never splice old ranges into new bytes
  assert.equal(await bodyText(response), "0123456789ABCDEF");
});

test("a same-path replacement produces a new validator and new bytes", async () => {
  const replacedPath = path.join(dir, "replaced.m4a");
  fs.writeFileSync(replacedPath, "OLD-CONTENT");
  const before = streamFileResponse(replacedPath, req(), { contentType: "audio/mp4" });
  const oldEtag = before.headers.get("ETag")!;

  fs.writeFileSync(replacedPath, "NEW-CONTENT-LONGER");
  // Force a distinct mtime even on coarse-timestamp filesystems.
  const future = new Date(Date.now() + 2_000);
  fs.utimesSync(replacedPath, future, future);

  const after = streamFileResponse(replacedPath, req({ "if-none-match": oldEtag }), {
    contentType: "audio/mp4",
  });
  assert.equal(after.status, 200); // old validator no longer matches — full new bytes
  assert.notEqual(after.headers.get("ETag"), oldEtag);
  assert.equal(await bodyText(after), "NEW-CONTENT-LONGER");

  const rangeAfter = streamFileResponse(
    replacedPath,
    req({ range: "bytes=0-2", "if-range": oldEtag }),
    { contentType: "audio/mp4" },
  );
  assert.equal(rangeAfter.status, 200); // stale If-Range → full representation
  assert.equal(await bodyText(rangeAfter), "NEW-CONTENT-LONGER");
});

test("missing file stays a JSON 404", () => {
  const response = streamFileResponse(path.join(dir, "absent.mp4"), req(), {
    contentType: "video/mp4",
  });
  assert.equal(response.status, 404);
});
