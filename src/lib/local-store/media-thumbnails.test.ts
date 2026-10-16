import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import zlib from "node:zlib";

import sharp from "sharp";

import { snapThumbnailWidth, thumbnailUrl } from "@/lib/media/thumbnail-url";
import { compressedJson, pickJsonEncoding } from "./compressed-json";
import { resolveImageCatalogFile } from "./image-catalog";
import { resolveMediaPath } from "./media";
import {
  enforceThumbnailCacheBudget,
  ensureThumbnail,
  parseThumbnailTime,
  parseThumbnailWidth,
  thumbnailCacheKey,
  thumbnailCacheRoot,
  thumbnailResponse,
  MUTABLE_THUMBNAIL_CACHE_CONTROL,
} from "./media-thumbnails";
import { coverFromTimeline, projectCover } from "./project-cover";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-thumbs-"));
process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
process.env.TIMELINE_IMAGE_CATALOG_DIR = path.join(root, "catalogs/images");
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

async function noisyJpeg(file: string, width = 1920, height = 1080) {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i += 1) raw[i] = (i * 2654435761) >>> 24;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 92 }).toFile(file);
}

test("width allow-list rejects arbitrary and malformed widths", () => {
  assert.equal(parseThumbnailWidth(null), null);
  for (const width of ["160", "320", "640"]) assert.equal(parseThumbnailWidth(width), Number(width));
  for (const bad of ["", "321", "1920", "0", "-320", "320px", "3e2", " 320", "99999"]) {
    assert.throws(() => parseThumbnailWidth(bad), (error: Error & { status?: number }) => error.status === 400, bad);
  }
});

test("media resolvers refuse traversal before any thumbnail work", () => {
  for (const escape of ["../catalog.json", "../../etc/passwd", "/etc/passwd"]) {
    assert.throws(() => resolveImageCatalogFile(escape), /Invalid image catalog file path/);
  }
  fs.mkdirSync(path.join(root, "projects", "fixture", "media"), { recursive: true });
  assert.equal(resolveMediaPath("fixture", ["..", "timeline.json"]), null);
  assert.equal(resolveMediaPath("fixture", ["..", "..", "..", "etc", "passwd"]), null);
});

test("derivative is bounded, smaller than the original, cached, and re-keyed when the source changes", async () => {
  const source = path.join(root, "projects", "fixture", "media", "still.jpg");
  await noisyJpeg(source);
  const original = fs.statSync(source);
  const thumb = await ensureThumbnail(source, 320);
  const meta = await sharp(thumb.body).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 320);
  assert.ok((meta.height ?? 0) <= 640);
  assert.ok(thumb.body.length < original.size / 10, `${thumb.body.length} vs ${original.size}`);
  assert.equal(fs.statSync(source).mtimeMs, original.mtimeMs, "original untouched");

  const again = await ensureThumbnail(source, 320);
  assert.equal(again.key, thumb.key);

  const before = thumbnailCacheKey(source, fs.statSync(source), 320);
  await noisyJpeg(source, 1280, 720);
  const future = new Date(Date.now() + 5000);
  fs.utimesSync(source, future, future);
  const after = thumbnailCacheKey(source, fs.statSync(source), 320);
  assert.notEqual(after, before);
  assert.notEqual((await ensureThumbnail(source, 320)).etag, thumb.etag);
  assert.notEqual(thumbnailCacheKey(source, fs.statSync(source), 640), after, "width is part of the key");
});

test("small sources are never enlarged and tall sources stay height-bounded", async () => {
  const small = path.join(root, "projects", "fixture", "media", "small.jpg");
  await noisyJpeg(small, 200, 100);
  assert.equal((await sharp((await ensureThumbnail(small, 640)).body).metadata()).width, 200);
  const tall = path.join(root, "projects", "fixture", "media", "tall.jpg");
  await noisyJpeg(tall, 300, 3000);
  const meta = await sharp((await ensureThumbnail(tall, 160)).body).metadata();
  assert.ok((meta.height ?? 0) <= 320 && (meta.width ?? 0) <= 160, `${meta.width}x${meta.height}`);
});

test("route integration: no w serves the original, invalid w is 400, matching ETag is 304", async () => {
  const source = path.join(root, "projects", "fixture", "media", "still.jpg");
  const options = { cacheControl: MUTABLE_THUMBNAIL_CACHE_CONTROL };
  assert.equal(await thumbnailResponse(new Request("http://x/a.jpg"), source, options), null);
  assert.equal((await thumbnailResponse(new Request("http://x/a.jpg?w=333"), source, options))?.status, 400);
  const ok = (await thumbnailResponse(new Request("http://x/a.jpg?w=160"), source, options))!;
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "image/webp");
  assert.equal(ok.headers.get("cache-control"), MUTABLE_THUMBNAIL_CACHE_CONTROL);
  const etag = ok.headers.get("etag")!;
  const revalidated = await thumbnailResponse(new Request("http://x/a.jpg?w=160", { headers: { "If-None-Match": etag } }), source, options);
  assert.equal(revalidated?.status, 304);
  const notes = path.join(root, "projects", "fixture", "media", "notes.txt");
  fs.writeFileSync(notes, "text");
  assert.equal(await thumbnailResponse(new Request("http://x/notes.txt?w=160"), notes, options), null, "unsupported types fall back to the original");
  assert.equal((await thumbnailResponse(new Request("http://x/missing.jpg?w=160"), `${source}.missing`, options))?.status, 404);
});

test("video sources produce a bounded poster frame", { skip: (() => { try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return false; } catch { return "ffmpeg unavailable"; } })() }, async () => {
  const video = path.join(root, "projects", "fixture", "media", "clip.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=1280x720:rate=30:duration=1", "-pix_fmt", "yuv420p", video]);
  const poster = await ensureThumbnail(video, 320);
  const meta = await sharp(poster.body).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 320);
  assert.equal(meta.height, 180);
});

test("timed video frames differ by time, quantize to frames, and leave the default poster key unchanged", { skip: (() => { try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return false; } catch { return "ffmpeg unavailable"; } })() }, async () => {
  const video = path.join(root, "projects", "fixture", "media", "colors.mp4");
  // Red for the first second, blue for the second.
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:size=320x180:rate=30:duration=1", "-f", "lavfi", "-i", "color=c=blue:size=320x180:rate=30:duration=1",
    "-filter_complex", "[0:v][1:v]concat=n=2:v=1[v]", "-map", "[v]", "-pix_fmt", "yuv420p", video]);
  const pixel = async (body: Buffer) => [...(await sharp(body).raw().toBuffer()).subarray(0, 3)];
  const early = await ensureThumbnail(video, 160, 0.5), late = await ensureThumbnail(video, 160, 1.5);
  assert.notEqual(early.key, late.key);
  const [r1, , b1] = await pixel(early.body), [r2, , b2] = await pixel(late.body);
  assert.ok(r1 > b1, "frame at 0.5s is red");
  assert.ok(b2 > r2, "frame at 1.5s is blue");
  const stat = fs.statSync(video);
  assert.equal(thumbnailCacheKey(video, stat, 160), thumbnailCacheKey(video, stat, 160, null), "default poster key is unchanged");
  assert.equal(thumbnailCacheKey(video, stat, 160, 0.5), thumbnailCacheKey(video, stat, 160, 0.5 + 1 / 120), "times within one frame share a key");
  const pastEnd = await ensureThumbnail(video, 160, 9);
  assert.ok(pastEnd.body.length > 0, "a time past the end falls back to the poster");
});

test("frame times are bounded and quantized to 30 fps", () => {
  assert.equal(parseThumbnailTime(null), null);
  assert.equal(parseThumbnailTime("1.5"), 1.5);
  assert.equal(parseThumbnailTime("0.0667"), 2 / 30);
  for (const bad of ["-1", "abc", "1e3", "999999", "1.23456"]) assert.throws(() => parseThumbnailTime(bad), /thumbnail time/i);
});

test("budget eviction removes least-recently-used owned entries only", async () => {
  const cache = thumbnailCacheRoot();
  fs.mkdirSync(cache, { recursive: true });
  const foreign = path.join(cache, "keep-me.webp");
  fs.writeFileSync(foreign, Buffer.alloc(4096));
  const names = ["a", "b", "c"].map((c) => `${c.repeat(64)}.webp`);
  names.forEach((name, index) => {
    fs.writeFileSync(path.join(cache, name), Buffer.alloc(1000));
    const at = new Date(Date.now() - (10 - index) * 60_000);
    fs.utimesSync(path.join(cache, name), at, at);
  });
  const existing = fs.readdirSync(cache).filter((name) => /^[a-f0-9]{64}\.webp$/.test(name) && !names.includes(name));
  const otherBytes = existing.reduce((sum, name) => sum + fs.statSync(path.join(cache, name)).size, 0);
  const result = await enforceThumbnailCacheBudget(otherBytes + 2000);
  assert.ok(result.bytes_after <= otherBytes + 2000);
  assert.equal(fs.existsSync(foreign), true, "unowned names are never removed");
  assert.equal(fs.existsSync(path.join(cache, names[2])), true, "most recent survives");
  assert.equal(fs.existsSync(path.join(cache, names[0])), false, "oldest evicted first");
});

test("thumbnailUrl rewrites only local media routes and snaps to the allow-list", () => {
  assert.equal(thumbnailUrl("/api/image-catalog/media/licensed/a%20b.jpg", 250), "/api/image-catalog/media/licensed/a%20b.jpg?w=320");
  assert.equal(thumbnailUrl("/api/visual-catalog/media/clip.mp4", 100), "/api/visual-catalog/media/clip.mp4?w=160");
  assert.equal(thumbnailUrl("/api/projects/p1/media/sources/x.png?v=2#t=0.1", 5000), "/api/projects/p1/media/sources/x.png?v=2&w=640#t=0.1");
  assert.equal(thumbnailUrl("/api/projects/p1/media/x.png?w=160", 600), "/api/projects/p1/media/x.png?w=640");
  for (const untouched of ["blob:http://x/1", "data:image/png;base64,AA", "https://example.com/a.jpg", "/api/projects/p1/timeline", "/api/music-catalog/media/a.mp3"]) {
    assert.equal(thumbnailUrl(untouched, 320), untouched);
  }
  assert.equal(snapThumbnailWidth(Number.NaN), 640);
  assert.equal(thumbnailUrl("/api/projects/p1/media/clip.mp4", 320, 1 / 15), "/api/projects/p1/media/clip.mp4?w=320&t=0.0667");
  assert.equal(thumbnailUrl("/api/projects/p1/media/clip.mp4", 320, 2), "/api/projects/p1/media/clip.mp4?w=320&t=2");
  assert.equal(thumbnailUrl("/api/projects/p1/media/clip.mp4", 320, 0), "/api/projects/p1/media/clip.mp4?w=320");
});

test("compressedJson encodes large payloads per Accept-Encoding and leaves small ones alone", async () => {
  assert.equal(pickJsonEncoding("gzip, deflate, br"), "br");
  assert.equal(pickJsonEncoding("gzip"), "gzip");
  assert.equal(pickJsonEncoding("br;q=0, gzip"), "gzip");
  assert.equal(pickJsonEncoding("identity"), null);
  const big = { items: Array.from({ length: 4000 }, (_, i) => ({ id: `asset-${i}`, url: `/api/projects/p/media/${i}.png` })) };
  const br = compressedJson(new Request("http://x", { headers: { "Accept-Encoding": "br" } }), big);
  assert.equal(br.headers.get("content-encoding"), "br");
  assert.deepEqual(JSON.parse(zlib.brotliDecompressSync(Buffer.from(await br.arrayBuffer())).toString()), big);
  const gz = compressedJson(new Request("http://x", { headers: { "Accept-Encoding": "gzip" } }), big);
  assert.deepEqual(JSON.parse(zlib.gunzipSync(Buffer.from(await gz.arrayBuffer())).toString()), big);
  const plain = compressedJson(new Request("http://x", { headers: { "Accept-Encoding": "br" } }), { ok: true }, { status: 201 });
  assert.equal(plain.headers.get("content-encoding"), null);
  assert.equal(plain.status, 201);
  assert.deepEqual(await plain.json(), { ok: true });
});

test("project cover is cached until timeline.json changes", () => {
  const timeline = path.join(root, "projects", "fixture", "timeline.json");
  fs.writeFileSync(timeline, JSON.stringify({ elements: [{ source_url: "https://remote/x.png" }, { source_url: "/api/projects/fixture/media/a.png" }] }));
  assert.deepEqual(projectCover("fixture"), { url: "/api/projects/fixture/media/a.png", video: false });
  fs.writeFileSync(timeline, JSON.stringify({ elements: [{ props: { preview_source_url: "/api/projects/fixture/media/b.mp4" } }] }));
  const future = new Date(Date.now() + 10_000);
  fs.utimesSync(timeline, future, future);
  assert.deepEqual(projectCover("fixture"), { url: "/api/projects/fixture/media/b.mp4", video: true });
  assert.equal(coverFromTimeline({ elements: [{ source_url: "/api/projects/p/media/a.png#x" }] }), undefined);
});
