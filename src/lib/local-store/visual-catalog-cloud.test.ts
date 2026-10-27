import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ensureVisualCatalogFile, pruneVisualCloudCache, visualCatalogFileDownloaded } from "./visual-catalog-cloud";
import { resolveVisualCatalogFile, visualCatalogCheckoutPath, visualCatalogMediaRoot, visualCloudCachePath } from "./visual-catalog";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "visual-cloud-test-"));
const catalogDir = path.join(root, "catalog");
process.env.TIMELINE_VISUAL_CATALOG_DIR = catalogDir;
process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
process.env.DREAMCUT_CLOUD_URL = "https://cloud.test";

const clip = Buffer.from("public domain clip bytes");
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const file = "public-domain/test/river.webm";
fs.mkdirSync(catalogDir, { recursive: true });
fs.writeFileSync(path.join(catalogDir, "catalog.json"), JSON.stringify({ schema_version: 1, assets: [{
  id: "river", type: "video_clip", title: "River", description: "A river.", file, sha256: sha(clip), width: 1920, height: 1080, duration_seconds: 4,
  source: { provider: "Test", asset_url: "https://example.test/river", license_name: "Public domain", license_url: "https://example.test/pd", source_status: "public_domain", acquired_at: "2026-10-27T00:00:00.000Z", acquisition_notes: "Fixture" },
  annotation: { meaning: "Calm", use_cases: ["B-roll"], tone: ["calm"], template_structure: "Place it", cultural_context: "None", avoid_when: [], tags: ["river"], confidence: "high", sources: [{ label: "Source", url: "https://example.test/river", kind: "original_source" }] },
}] }));

const calls: string[] = [];
function stubCloud(body: Buffer, linkStatus = 200) {
  calls.length = 0;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith("https://cloud.test/api/v1/visuals/")) {
      return linkStatus === 200 ? Response.json({ url: "https://storage.test/signed" }) : Response.json({ error: "x" }, { status: linkStatus });
    }
    if (url === "https://storage.test/signed") return new Response(body);
    return Response.json(null, { status: 404 });
  }) as typeof fetch;
}

test("a shared clip is not downloaded until it is used", () => {
  assert.equal(visualCatalogFileDownloaded(file), false);
  assert.equal(resolveVisualCatalogFile(file), visualCloudCachePath(file));
});

test("a shared clip downloads once without an account, is hash-checked and then served from the cache", async () => {
  stubCloud(clip);
  const local = await ensureVisualCatalogFile(file);
  assert.equal(local, visualCloudCachePath(file));
  assert.deepEqual(fs.readFileSync(local), clip);
  assert.equal(calls[0], "https://cloud.test/api/v1/visuals/public-domain/test/river.webm");
  assert.equal(visualCatalogFileDownloaded(file), true);
  assert.equal(visualCatalogMediaRoot(file), path.resolve(root, "profile", "cache", "visual-catalog"));
  calls.length = 0;
  assert.equal(await ensureVisualCatalogFile(file), local);
  assert.equal(calls.length, 0, "a cached clip is not downloaded again");
});

test("a download that does not match the catalog is refused and not kept", async () => {
  fs.rmSync(visualCloudCachePath(file), { force: true });
  stubCloud(Buffer.from("tampered"));
  await assert.rejects(ensureVisualCatalogFile(file), /does not match/);
  assert.equal(fs.existsSync(visualCloudCachePath(file)), false);
  assert.deepEqual(fs.readdirSync(path.dirname(visualCloudCachePath(file))), [], "no temporary file is left behind");
});

test("Cloud refusals and unknown files surface as errors with a status", async () => {
  stubCloud(clip, 404);
  await assert.rejects(ensureVisualCatalogFile(file), (error: Error & { status?: number }) => error.status === 404);
  await assert.rejects(ensureVisualCatalogFile("public-domain/test/missing.webm"), (error: Error & { status?: number }) => error.status === 404);
  assert.throws(() => visualCloudCachePath("../outside.webm"), /Invalid visual catalog file path/);
});

test("the cache keeps only files the catalog lists and temporary files of live downloads", () => {
  const listed = visualCloudCachePath(file);
  const unlisted = visualCloudCachePath("public-domain/test/retired.webm");
  const live = `${listed}.${process.pid}.${"0".repeat(8)}-0000-0000-0000-${"0".repeat(12)}.tmp`;
  const dead = `${listed}.999999999.${"1".repeat(8)}-1111-1111-1111-${"1".repeat(12)}.tmp`;
  for (const target of [listed, unlisted, live, dead]) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, "x"); }
  assert.equal(pruneVisualCloudCache(), 2);
  assert.equal(fs.existsSync(listed), true);
  assert.equal(fs.existsSync(live), true);
  assert.equal(fs.existsSync(unlisted), false);
  assert.equal(fs.existsSync(dead), false);
  fs.rmSync(live);
});

test("a checkout copy is used as is", async () => {
  const checkout = visualCatalogCheckoutPath(file);
  fs.mkdirSync(path.dirname(checkout), { recursive: true });
  fs.writeFileSync(checkout, clip);
  stubCloud(clip);
  assert.equal(await ensureVisualCatalogFile(file), checkout);
  assert.equal(resolveVisualCatalogFile(file), checkout);
  assert.equal(calls.length, 0);
  fs.rmSync(checkout);
});

test.after(() => fs.rmSync(root, { recursive: true, force: true }));
