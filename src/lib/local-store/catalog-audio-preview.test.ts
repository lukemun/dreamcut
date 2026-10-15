import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { prepareCatalogAudioPreview } from "./catalog-audio-preview";
import { catalogAudioPreviewUrl } from "../remotion/catalog-audio-preview";
import { MEDIA_CONTENT_TYPES } from "./media";

test("catalog preview routing preserves export and unrelated media", () => {
  const src = "/api/music-catalog/media/reference/test.opus";
  assert.equal(catalogAudioPreviewUrl(src), src + "?preview=1");
  assert.equal(catalogAudioPreviewUrl(src, true), src);
  assert.equal(catalogAudioPreviewUrl(`http://localhost:3123${src}`), src + "?preview=1");
  assert.equal(catalogAudioPreviewUrl("http://localhost:3123/api/music-catalog/media/licensed/killers.mp3"), "/api/music-catalog/media/licensed/killers.mp3");
  assert.equal(catalogAudioPreviewUrl("http://localhost:3123/api/sfx-catalog/media/pop.wav"), "/api/sfx-catalog/media/pop.wav");
  assert.equal(catalogAudioPreviewUrl("http://localhost:3123/api/music-catalog/media/track.mp3", true), "http://localhost:3123/api/music-catalog/media/track.mp3");
  assert.equal(catalogAudioPreviewUrl("/voice.m4a"), "/voice.m4a");
  assert.equal(catalogAudioPreviewUrl("https://example.com/test.opus"), "https://example.com/test.opus");
  assert.equal(MEDIA_CONTENT_TYPES[".opus"], "audio/ogg; codecs=opus");
});

test("Opus preview is compatible, cached, source-timed and leaves original unchanged", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "catalog-preview-test-"));
  try {
    const source = path.join(root, "source.opus");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "libopus", source]);
    const before = await fs.readFile(source);
    const cache = path.join(root, "cache");
    const [a, b] = await Promise.all([prepareCatalogAudioPreview(source, cache), prepareCatalogAudioPreview(source, cache)]);
    assert.equal(a, b);
    assert.equal(await prepareCatalogAudioPreview(source, cache), a);
    assert.deepEqual(await fs.readFile(source), before);
    const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", a], { encoding: "utf8" }));
    assert.equal(probe.streams[0].codec_name, "aac");
    assert.ok(Math.abs(Number(probe.format.duration) - 1) < 0.1);
    assert.deepEqual(await fs.readdir(cache), [path.basename(a)]);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
