import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getMiddlewareMatchers } from "next/dist/build/analysis/get-page-static-info";
import { getMiddlewareRouteMatcher } from "next/dist/shared/lib/router/utils/middleware-route-matcher";
import { config } from "../../proxy";
import { POST as upload } from "../../app/api/projects/[projectId]/uploaded-assets/route";
import { readProjectSourceManifest } from "./media-ingest";

const MB = 1024 * 1024;
const editor = { origin: "http://127.0.0.1:3123", "sec-fetch-site": "same-origin" };

/** A body of `size` bytes delivered in 1MB chunks, as a browser sends a large file. */
function body(size: number) {
  let sent = 0;
  const hash = createHash("sha256");
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= size) return controller.close();
      const chunk = new Uint8Array(Math.min(MB, size - sent)).fill(sent / MB % 251);
      hash.update(chunk); sent += chunk.byteLength; controller.enqueue(chunk);
    },
  });
  return { stream, sha256: () => hash.digest("hex") };
}

function post(projectId: string, init: { body: BodyInit; headers: Record<string, string> }) {
  return upload(new Request(`http://127.0.0.1:3123/api/projects/${projectId}/uploaded-assets`, {
    method: "POST", ...init, headers: { host: "127.0.0.1:3123", ...init.headers }, duplex: "half",
  } as RequestInit), { params: Promise.resolve({ projectId }) });
}

function withProject(run: (projectId: string, root: string) => Promise<void>) {
  return async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "upload-streaming-"));
    const previous = { projects: process.env.TIMELINE_PROJECTS_DIR, analysis: process.env.DREAMCUT_IMPORT_ANALYSIS };
    process.env.TIMELINE_PROJECTS_DIR = root; delete process.env.DREAMCUT_IMPORT_ANALYSIS;
    fs.mkdirSync(path.join(root, "test", "media"), { recursive: true });
    try { await run("test", root); }
    finally {
      if (previous.projects === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previous.projects;
      if (previous.analysis !== undefined) process.env.DREAMCUT_IMPORT_ANALYSIS = previous.analysis;
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

const leftovers = (root: string) => fs.readdirSync(path.join(root, "test", "media", "sources")).filter(name => name.startsWith(".upload-"));

test("video uploads skip the proxy, whose body buffer cuts requests off at 10MB", () => {
  const proxied = getMiddlewareRouteMatcher(getMiddlewareMatchers(config.matcher, {} as never));
  const matches = (pathname: string) => proxied(pathname, {} as never, {});
  assert.equal(matches("/api/projects/demo/uploaded-assets"), false);
  assert.equal(matches("/api/template-drafts"), false);
  // Everything else still passes the proxy's origin check.
  for (const pathname of ["/api/projects/demo/uploaded-assets/extra", "/api/template-drafts/d-1/save", "/api/projects/demo/asset-generation", "/api/projects", "/p/demo/storyboard"]) {
    assert.equal(matches(pathname), true, pathname);
  }
});

test("a raw-body upload larger than 10MB streams whole into project media", withProject(async (projectId, root) => {
  const size = 24 * MB + 123;
  const source = body(size);
  const response = await post(projectId, { body: source.stream, headers: { ...editor, "content-type": "video/mp4", "content-length": String(size), "x-dreamcut-filename": encodeURIComponent("Long take #1.mp4"), "x-dreamcut-asset-type": "video_clip" } });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.asset.original_filename, "Long take #1.mp4");
  const [asset] = readProjectSourceManifest(projectId).assets;
  assert.equal(asset.bytes, size);
  assert.equal(asset.source_sha256, source.sha256());
  assert.equal(fs.statSync(path.join(root, projectId, "media", asset.media_path)).size, size);
  assert.deepEqual(leftovers(root), []);
}));

test("an interrupted upload records nothing and leaves no temporary file", withProject(async (projectId, root) => {
  const response = await post(projectId, { body: body(3 * MB).stream, headers: { ...editor, "content-type": "video/mp4", "content-length": String(5 * MB), "x-dreamcut-filename": "cut.mp4", "x-dreamcut-asset-type": "video_clip" } });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /interrupted/);
  assert.deepEqual(readProjectSourceManifest(projectId).assets, []);
  assert.deepEqual(leftovers(root), []);
}));

test("without the proxy in front, the route itself refuses other sites", withProject(async (projectId) => {
  const response = await post(projectId, { body: "x", headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site", "x-dreamcut-filename": "x.mp4", "x-dreamcut-asset-type": "video_clip" } });
  assert.equal(response.status, 403);
  assert.deepEqual(readProjectSourceManifest(projectId).assets, []);
}));
