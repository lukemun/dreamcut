import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { publishMediaContextDataset, readSourceMediaContext, sourceMediaContextId } from "../local-store/media-context";
import { writeManifest } from "../local-store/media-analysis";
import { sourceIntervalForTimelineClip } from "./project-context";
import type { AnalysisManifest, MediaContextDatasetRevision } from "./schema";

const fingerprint = "c".repeat(64);

function manifest(): AnalysisManifest {
  return {
    schema_version: 2,
    fingerprint_sha256: fingerprint,
    source_size_bytes: 123,
    probe: {
      duration_seconds: 20, width: 1080, height: 1920, frame_rate: "30/1", nominal_frame_rate: "30/1",
      is_variable_frame_rate: false, video_time_base: "1/30000", display_rotation_degrees: 0,
      sample_aspect_ratio: "1:1", pixel_format: "yuv420p", video_alpha_mode: null, color_transfer: "bt709",
      color_primaries: "bt709", video_codec: "h264", audio_codec: "aac", audio_channels: 2,
      audio_channel_layout: "stereo", sample_rate: 48000, has_video: true, has_audio: true,
    },
    derivatives: {}, stages: {}, stage_records: {}, stage_history: [], attempts: [],
    timing: {
      elapsed_wall_ms: 0, summed_stage_wall_ms: 0, total_queue_wait_ms: 0, critical_path_ms: 0,
      critical_path_stages: [], observed_parallelism: 0, effective_parallelism: null, max_concurrency: 0,
      average_concurrency: 0, cache_hits: 0, cache_misses: 0, cache_resumes: 0, cache_skips: 0,
      cache_time_avoided_ms: 0, active_union_ms: 0, worker_busy_ms: 0, worker_idle_ms: 0,
      dependency_wait_ms: 0, io_throughput_bytes_per_second: null, derived_bytes: 0, peak_rss_bytes: null,
      serial_baseline_wall_ms: null, parallel_speedup: null, parallel_efficiency: null, time_by_stage_ms: {}, by_resource: {},
    },
    detector: { status: "unavailable", reason: null },
    updated_at: "2026-07-22T00:00:00.000Z",
  };
}

function revision(overrides: Partial<MediaContextDatasetRevision> = {}): MediaContextDatasetRevision {
  return {
    dataset_id: "body_tracks",
    revision_id: "pose-v1:abc",
    kind: "body_keypoints",
    evidence_level: "L1",
    producer: { name: "pose-extractor", version: "1.0.0", recipe_version: "pose-v1" },
    input_revision_ids: [],
    coverage: { timebase: "source_seconds", status: "partial", ranges: [[2, 8]], gaps: [[5, 5.2]] },
    coordinate_space: { system: "normalized_display_source", width: 1080, height: 1920, display_rotation_degrees: 0 },
    summary: { people: 1, observed_samples: 180 },
    artifact: null,
    supersedes_revision_id: null,
    created_at: "2026-07-22T00:00:01.000Z",
    ...overrides,
  };
}

test("source context keeps append-only revisions and a stable content identity", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "media-context-"));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    writeManifest(manifest());
    const first = revision();
    publishMediaContextDataset(fingerprint, first);
    const second = revision({
      revision_id: "pose-v2:def",
      supersedes_revision_id: first.revision_id,
      coverage: { timebase: "source_seconds", status: "complete", ranges: [[0, 20]], gaps: [] },
      summary: { people: 1, observed_samples: 600 },
      created_at: "2026-07-22T00:00:02.000Z",
    });
    publishMediaContextDataset(fingerprint, second);

    const context = readSourceMediaContext(fingerprint)!;
    assert.equal(context.context_id, sourceMediaContextId(fingerprint));
    assert.equal(context.datasets[0]?.active_revision_id, second.revision_id);
    assert.deepEqual(context.datasets[0]?.revisions.map((item) => item.revision_id), [first.revision_id, second.revision_id]);
    assert.equal(context.probe?.width, 1080);

    assert.throws(() => publishMediaContextDataset(fingerprint, { ...second, summary: { people: 2 } }), /immutable/);
    assert.throws(() => publishMediaContextDataset(fingerprint, revision({ revision_id: "pose-v3:ghi", evidence_level: "L1", supersedes_revision_id: first.revision_id })), /must supersede active revision/);
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("splitting and trimming clips preserves one source-time context", () => {
  const original = sourceIntervalForTimelineClip({ trim_start: 10, trim_end: null, duration: 2, playback_rate: 2 });
  const left = sourceIntervalForTimelineClip({ trim_start: 10, trim_end: 8, source_duration_seconds: 20, duration: 1, playback_rate: 2 });
  const right = sourceIntervalForTimelineClip({ trim_start: 12, trim_end: 6, source_duration_seconds: 20, duration: 1, playback_rate: 2 });
  assert.deepEqual(original, [10, 14]);
  assert.deepEqual(left, [10, 12]);
  assert.deepEqual(right, [12, 14]);
  assert.deepEqual([left[0], right[1]], original);
});

test("shared source context rejects guidance and unsafe artifact paths", () => {
  assert.throws(() => publishMediaContextDataset(fingerprint, revision({ evidence_level: "L4" as "L1" })), /only L1 extraction or L2/);
  assert.throws(() => publishMediaContextDataset(fingerprint, revision({ artifact: { relative_path: "../escape.json", sha256: "d".repeat(64), media_type: "application/json" } })), /inside its source context/);
});
