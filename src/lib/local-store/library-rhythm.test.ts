import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readRhythmReview, withRhythmReview, writeRhythmReview } from "./library-rhythm";
import type { BeatAnnotation } from "../timeline/beat-annotations";

const annotation: BeatAnnotation = {
  schema_version: 2,
  source_sha256: "a".repeat(64), recipe: "rhythm-map-v2-test", analyzed_at: "2026-09-23T00:00:00.000Z",
  source_duration_seconds: 3, tempo_bpm: 120, tempo_confirmed: false,
  beats_seconds: [0.5, 1, 1.5], downbeats: "unknown",
  hits: [{ time_seconds: 0.5, kind: "drum", confidence: 0.2, strength: 0.4 }, { time_seconds: 1, kind: "synth", confidence: 0.3, strength: 0.5 }],
};

test("source-level hit review preserves detection and rejects stale edits", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "rhythm-review-test-"));
  try {
    assert.equal(await readRhythmReview(directory, annotation), null);
    const edited = [{ ...annotation.hits[0]!, kind: "synth" as const }, { time_seconds: 1.1, kind: "synth" as const, confidence: 1, strength: 1 }];
    const saved = await writeRhythmReview(directory, annotation, edited, null);
    assert.deepEqual(withRhythmReview(annotation, saved.review.hits), { ...annotation, hits: edited });
    assert.equal(annotation.hits[0]!.kind, "drum");
    assert.deepEqual((await readRhythmReview(directory, annotation))?.review.hits, edited);
    await assert.rejects(writeRhythmReview(directory, annotation, edited, null), /changed elsewhere/);
    await assert.rejects(writeRhythmReview(directory, annotation, [{ ...edited[0]!, time_seconds: 3 }], saved.revision), /ordered and within/);
    assert.deepEqual((await readRhythmReview(directory, annotation))?.review.hits, edited);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
