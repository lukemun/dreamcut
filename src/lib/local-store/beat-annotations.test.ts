import { existsSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { readBeatAnnotation } from "./beat-annotations";

test("annotation reads never analyze; changed bytes invalidate saved source annotations", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "beat-read-test-"));
  try {
    const source = path.join(root, "source.wav");
    const cache = path.join(root, "beats");
    await fs.writeFile(source, "original bytes");
    assert.equal(await readBeatAnnotation(source, cache), null);
    await assert.rejects(fs.stat(cache));
    const hash = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
    const recipe = `rhythm-map-v2-${hash(await fs.readFile("scripts/beat-grid.py"))}`;
    const source_sha256 = hash("original bytes");
    const annotation = { schema_version: 1, source_sha256, recipe, analyzed_at: "2026-09-20", source_duration_seconds: 2, tempo_bpm: 120, tempo_confirmed: false, beats_seconds: [0.5, 1, 1.5], downbeats: "unknown" };
    await fs.mkdir(cache);
    await fs.writeFile(path.join(cache, `${source_sha256}-${hash(recipe).slice(0, 16)}.json`), JSON.stringify(annotation));
    assert.deepEqual(await readBeatAnnotation(source, cache), annotation);
    await fs.writeFile(source, "replacement bytes");
    assert.equal(await readBeatAnnotation(source, cache), null);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

// Needs the optional librosa environment; a fresh clone without it skips rather than fails.
const beatPython = process.env.BEAT_PYTHON || ".venv-music/bin/python";
test("real detector saves a reusable grid and preserves source bytes", { skip: !existsSync(beatPython) && "no .venv-music or BEAT_PYTHON" }, async () => {
  const { execFileSync } = await import("node:child_process");
  const { prepareBeatAnnotation } = await import("./beat-annotations");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "beat-detect-test-"));
  try {
    const source = path.join(root, "clicks.wav");
    execFileSync(beatPython, ["scripts/music-fixture.py", "--out", source]);
    const original = await fs.readFile(source);
    const cache = path.join(root, "beats");
    const [a, b] = await Promise.all([prepareBeatAnnotation(source, cache), prepareBeatAnnotation(source, cache)]);
    assert.deepEqual(a, b);
    assert.ok(Math.abs(a.tempo_bpm - 120) < 3);
    assert.equal(a.schema_version, 2);
    assert.ok(a.schema_version === 2 && a.hits.length > 0);
    // The existing tracker trims weak intro/outro beats. Check the strong 32–48s section.
    assert.ok(a.beats_seconds.filter(t => t >= 32 && t < 48).length >= 28, JSON.stringify(a.beats_seconds));
    assert.ok(a.beats_seconds.every(t => Math.abs(t - Math.round(t * 2) / 2) < 0.08));
    assert.deepEqual(await readBeatAnnotation(source, cache), a);
    assert.deepEqual(await prepareBeatAnnotation(source, cache), a);
    assert.deepEqual(await fs.readFile(source), original);
    assert.equal((await fs.readdir(cache)).length, 1);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
