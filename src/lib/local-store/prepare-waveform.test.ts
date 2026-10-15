import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { prepareWaveform, resolveWaveformSource } from "./prepare-waveform";

test("waveforms resolve catalog aliases without fetching arbitrary remote URLs", () => {
  const relative = "/api/music-catalog/media/reference/test.opus";
  assert.equal(resolveWaveformSource("demo", relative), resolveWaveformSource("demo", `http://localhost:3123${relative}`));
  assert.equal(resolveWaveformSource("demo", `https://example.com${relative}`), null);
  assert.throws(() => resolveWaveformSource("demo", "/api/music-catalog/media/%2e%2e%2f%2e%2e%2fsecret"));
});

test("server generates cached full-source Opus peaks and invalidates changed bytes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "waveform-test-"));
  try {
    const source = path.join(root, "source.opus");
    const create = (duration: number) => execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=440:duration=${duration}`, "-c:a", "libopus", source]);
    create(1);
    const original = await fs.readFile(source);
    const cache = path.join(root, "cache");
    const [a, b] = await Promise.all([prepareWaveform(source, cache), prepareWaveform(source, cache)]);
    assert.deepEqual(a, b);
    assert.equal(a.peaks.length, 2000);
    assert.ok(a.peaks.some(p => p > 0));
    assert.ok(Math.abs(a.source_duration_seconds - 1) < .05);
    assert.deepEqual(await fs.readFile(source), original);
    assert.deepEqual(await prepareWaveform(source, cache), a);
    create(2);
    const changed = await prepareWaveform(source, cache);
    assert.ok(Math.abs(changed.source_duration_seconds - 2) < .05);
    assert.equal((await fs.readdir(cache)).length, 2);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
