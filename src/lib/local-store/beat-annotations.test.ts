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
    const recipe = `rhythm-map-v3-${hash(await fs.readFile("scripts/beat-grid.py"))}`;
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
    assert.equal(a.schema_version, 3);
    assert.ok(a.schema_version === 3 && a.hits.length > 0 && a.tempo_hint_bpm === null && a.beat_source === "tracker");
    // The existing tracker trims weak intro/outro beats. Check the strong 32–48s section.
    assert.ok(a.beats_seconds.filter(t => t >= 32 && t < 48).length >= 28, JSON.stringify(a.beats_seconds));
    assert.ok(a.beats_seconds.every(t => Math.abs(t - Math.round(t * 2) / 2) < 0.08));
    assert.deepEqual(await readBeatAnnotation(source, cache), a);
    assert.deepEqual(await prepareBeatAnnotation(source, cache), a);
    assert.deepEqual(await fs.readFile(source), original);
    assert.equal((await fs.readdir(cache)).length, 1);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("a stated tempo fits a constant grid, and bars and the drop land on the fixture's ground truth", { skip: !existsSync(beatPython) && "no .venv-music or BEAT_PYTHON" }, async () => {
  const { execFileSync } = await import("node:child_process");
  const { prepareBeatAnnotation } = await import("./beat-annotations");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "beat-bars-test-"));
  try {
    // 120 BPM, a kick on every 4th beat from beat 1 (bars start at 0.5 s + 2 s·n), quiet until a drop at 32.5 s.
    const source = path.join(root, "bars.wav");
    execFileSync(beatPython, ["scripts/music-fixture.py", "--out", source, "--downbeat-phase", "1", "--drop"]);
    const cache = path.join(root, "beats");
    const tracked = await prepareBeatAnnotation(source, cache);
    assert.ok(tracked.schema_version === 3 && tracked.downbeats !== "unknown");
    // The tracker skips the quiet intro; its bars still sit on the kick.
    assert.ok(tracked.downbeats.seconds.every(t => Math.abs(((t - 0.5) / 2) - Math.round((t - 0.5) / 2)) * 2 < 0.06), JSON.stringify(tracked.downbeats));
    assert.equal(tracked.drops.length, 1);
    assert.ok(Math.abs(tracked.drops[0]!.time_seconds - 32.5) < 0.06, JSON.stringify(tracked.drops));
    assert.deepEqual(await prepareBeatAnnotation(source, cache), tracked, "no hint reuses the saved map");

    // A slightly wrong stated tempo still finds the exact constant grid across the whole track.
    const fitted = await prepareBeatAnnotation(source, cache, { expected_bpm: 118 });
    assert.ok(fitted.schema_version === 3 && fitted.downbeats !== "unknown");
    assert.equal(fitted.beat_source, "fixed_tempo_fit");
    assert.equal(fitted.tempo_hint_bpm, 118);
    assert.ok(Math.abs(fitted.tempo_bpm - 120) < 0.05, String(fitted.tempo_bpm));
    assert.ok(fitted.beats_seconds[0]! < 0.6 && fitted.beats_seconds.length >= 126);
    assert.ok(Math.abs(fitted.downbeats.seconds[0]! - 0.5) < 0.06, JSON.stringify(fitted.downbeats.seconds.slice(0, 4)));
    assert.ok(Math.abs(fitted.drops[0]!.time_seconds - 32.5) < 0.06);
    assert.deepEqual(await prepareBeatAnnotation(source, cache), fitted, "the hinted map replaced the tracked one");
    assert.equal((await fs.readdir(cache)).length, 1);
    await assert.rejects(prepareBeatAnnotation(source, cache, { expected_bpm: 400 }), /between 40 and 240/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
