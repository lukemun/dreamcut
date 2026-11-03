import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { projectMediaDir } from "../local-store/paths";
import { createProject } from "../local-store/store";
import { runCapacityBenchmark } from "./benchmark";

function wavBuffer(): Buffer {
  const samples = 3_200;
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + dataSize, 4); buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16_000, 24); buffer.writeUInt32LE(32_000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36); buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

test("capacity benchmark runs serial/default/higher cold graphs and compares artifact hashes", { skip: spawnSync("ffmpeg", ["-version"]).status !== 0 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "capacity-benchmark-test-"));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    createProject("fixture", "web");
    fs.writeFileSync(path.join(projectMediaDir("fixture"), "tone.wav"), wavBuffer());
    const report = await runCapacityBenchmark("fixture");
    assert.deepEqual(report.rows.map((row) => row.label), ["serial", "default", "higher"]);
    assert.equal(report.rows[0].ffmpeg_capacity, 1);
    assert.equal(report.rows[1].ffmpeg_capacity, report.selected_default_ffmpeg_capacity);
    assert.ok(report.rows[2].ffmpeg_capacity > report.rows[1].ffmpeg_capacity);
    assert.equal(report.deterministic_artifacts, true);
    assert.deepEqual(report.artifact_mismatches, []);
    assert.ok(report.rows.every((row) => row.timing.serial_baseline_wall_ms != null));
    assert.ok(report.rows.every((row) => row.timing.parallel_speedup != null));
    assert.ok(report.rows.every((row) => row.attempt_trace.length > 0));
    assert.ok(report.rows.every((row) => row.configured_capacities.ffmpeg === row.ffmpeg_capacity));
    assert.ok(report.rows.every((row) => row.derived_bytes > 0));
    assert.equal(fs.existsSync(report.report_path), true);
    assert.ok(report.rows.some((row) => row.ffmpeg_capacity === report.recommended_ffmpeg_capacity_for_fixture));
    assert.ok(report.recommendation_reason.length > 0);
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
