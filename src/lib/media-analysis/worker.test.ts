import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { claimNextJob, enqueueAssets, readJob, readManifest, reconcileAssetBindings, requestCancellation, retryJob, writeJob, writeManifest } from "../local-store/media-analysis";
import { mediaUrl } from "../local-store/media";
import { projectMediaDir } from "../local-store/paths";
import { createProject, readPeaks } from "../local-store/store";
import { acquireAnalysisStageLease, decodeSmokeArgs, fingerprintStableSource, processAnalysisJob, runMeasuredCommand } from "./worker";

function wavBuffer(): Buffer {
  const samples = 1600;
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + dataSize, 4); buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16000, 24); buffer.writeUInt32LE(32000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36); buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

test("decode smoke maps only the primary decodable media streams", () => {
  assert.deepEqual(
    decodeSmokeArgs("/tmp/iphone.mov", { has_video: true, has_audio: true }),
    ["-v", "error", "-i", "/tmp/iphone.mov", "-map", "0:v:0?", "-map", "0:a:0?", "-f", "null", "-"],
  );
  assert.deepEqual(
    decodeSmokeArgs("/tmp/tone.wav", { has_video: false, has_audio: true }),
    ["-v", "error", "-i", "/tmp/tone.wav", "-map", "0:a:0?", "-f", "null", "-"],
  );
});

test("worker persists lifecycle, timings, derivatives, and cache reuse", { skip: spawnSync("ffmpeg", ["-version"]).status !== 0 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "media-analysis-"));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    createProject("fixture", "web");
    fs.writeFileSync(path.join(projectMediaDir("fixture"), "tone.wav"), wavBuffer());
    const asset = reconcileAssetBindings("fixture").assets[0];
    const queued = enqueueAssets("fixture", [asset.asset_id])[0];
    const claimed = claimNextJob("test-worker", 10_000);
    assert.equal(claimed?.job_id, queued.job_id);
    const completed = await processAnalysisJob(claimed!, "test-worker");
    assert.equal(completed.status, "completed");
    assert.ok(completed.fingerprint_sha256);
    assert.ok(completed.timing);
    assert.ok(completed.timing!.critical_path_stages.length > 0);
    assert.equal(completed.timing!.by_resource.ffmpeg.max_concurrency, 2);
    const manifest = readManifest(completed.fingerprint_sha256!);
    assert.equal(manifest?.stages.probe, "completed");
    assert.equal(manifest?.stages.audio_pcm, "completed");
    assert.equal(manifest?.stages.waveform, "completed");
    assert.equal(manifest?.stages.waveform_peaks, "completed");
    const persistedPeaks = readPeaks("fixture")[mediaUrl("fixture", "tone.wav")];
    assert.ok(persistedPeaks);
    assert.ok(persistedPeaks.peaks.length > 0);
    assert.ok(persistedPeaks.source_duration_seconds > 0);
    assert.equal(manifest?.detector.status, "unavailable");
    assert.equal(manifest?.schema_version, 2);
    assert.equal(manifest?.stage_records.audio_pcm.status, "completed");
    assert.match(manifest?.stage_records.audio_pcm.cache_key ?? "", /^[a-f0-9]{64}$/);
    assert.ok((manifest?.stage_records.audio_pcm.output_bytes ?? 0) > 0);
    assert.ok(manifest?.attempts.every((attempt) => attempt.worker_id.length > 0));
    assert.ok(manifest?.attempts.every((attempt) => attempt.tool.name.length > 0));
    assert.ok(manifest?.attempts.some((attempt) => (attempt.peak_rss_bytes ?? 0) > 0));
    assert.ok((manifest?.timing.derived_bytes ?? 0) > 0);
    assert.ok((manifest?.timing.elapsed_wall_ms ?? 0) >= 0);
    assert.ok((manifest?.timing.max_concurrency ?? 0) >= 1);
    const parallelBranches = manifest?.attempts.filter((attempt) => ["decode_smoke", "audio_pcm", "waveform", "waveform_peaks"].includes(attempt.stage)) ?? [];
    assert.equal(parallelBranches.length, 4);
    assert.ok(parallelBranches.some((attempt) => attempt.queue_wait_ms > 0));
    assert.ok((manifest?.timing.total_queue_wait_ms ?? 0) > 0);

    const second = enqueueAssets("fixture", [asset.asset_id])[0];
    const completedAgain = await processAnalysisJob(claimNextJob("test-worker-2")!, "test-worker-2");
    assert.equal(completedAgain.job_id, second.job_id);
    const cached = readManifest(completedAgain.fingerprint_sha256!);
    assert.ok((cached?.timing.cache_hits ?? 0) >= 3);
    assert.ok((cached?.timing.cache_time_avoided_ms ?? 0) > 0);
    assert.ok((cached?.timing.cache_skips ?? 0) >= 1);

    cached!.stage_records.waveform = { ...cached!.stage_records.waveform, status: "running" };
    cached!.stages.waveform = "running";
    writeManifest(cached!);
    const resumeJob = enqueueAssets("fixture", [asset.asset_id])[0];
    const resumed = await processAnalysisJob(claimNextJob("resume-worker")!, "resume-worker");
    assert.equal(resumed.status, "completed");
    const resumedManifest = readManifest(resumed.fingerprint_sha256!);
    assert.ok(resumedManifest?.attempts.some((attempt) => attempt.job_id === resumeJob.job_id
      && attempt.stage === "waveform" && attempt.cache_disposition === "resumed"));

    const cancelJob = enqueueAssets("fixture", [asset.asset_id])[0];
    const cancelled = await processAnalysisJob(claimNextJob("cancel-worker")!, "cancel-worker", {
      beforeFinalSourceStat: () => { requestCancellation(cancelJob.job_id); },
    });
    assert.equal(cancelled.status, "cancelled");
    const cancelledManifest = readManifest(cancelled.fingerprint_sha256!);
    assert.ok(cancelledManifest?.attempts.some((attempt) => attempt.job_id === cancelJob.job_id
      && attempt.stage === "source_stability" && attempt.status === "cancelled"));

    const cancellable = enqueueAssets("fixture", [asset.asset_id])[0];
    assert.equal(requestCancellation(cancellable.job_id).status, "cancelled");
    assert.equal(retryJob(cancellable.job_id).status, "queued");
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("fingerprinting rejects a source changed during the read", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "stable-fingerprint-"));
  const filePath = path.join(directory, "source.bin");
  try {
    fs.writeFileSync(filePath, "before");
    await assert.rejects(
      fingerprintStableSource(filePath, () => { fs.appendFileSync(filePath, "-after"); }),
      /source_changed_during_preprocessing/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("source mutation during a job discards its fingerprint and requeues", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "media-analysis-change-"));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    createProject("fixture", "web");
    const sourcePath = path.join(projectMediaDir("fixture"), "tone.wav");
    fs.writeFileSync(sourcePath, wavBuffer());
    const asset = reconcileAssetBindings("fixture").assets[0];
    enqueueAssets("fixture", [asset.asset_id]);
    const claimed = claimNextJob("mutation-worker")!;
    const result = await processAnalysisJob(claimed, "mutation-worker", {
      afterFingerprintRead: () => { fs.appendFileSync(sourcePath, Buffer.from([0])); },
    });
    assert.equal(result.status, "queued");
    assert.equal(result.fingerprint_sha256, null);
    assert.match(result.error ?? "", /source_changed/);
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("source mutation after derived stages marks the old revision stale and requeues", { skip: spawnSync("ffmpeg", ["-version"]).status !== 0 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "media-analysis-final-change-"));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    createProject("fixture", "web");
    const sourcePath = path.join(projectMediaDir("fixture"), "tone.wav");
    fs.writeFileSync(sourcePath, wavBuffer());
    const oldFingerprint = await fingerprintStableSource(sourcePath);
    const asset = reconcileAssetBindings("fixture").assets[0];
    enqueueAssets("fixture", [asset.asset_id]);
    const result = await processAnalysisJob(claimNextJob("final-mutation-worker")!, "final-mutation-worker", {
      beforeFinalSourceStat: () => { fs.appendFileSync(sourcePath, Buffer.from([0])); },
    });
    assert.equal(result.status, "queued");
    assert.equal(result.fingerprint_sha256, null);
    const stale = readManifest(oldFingerprint);
    assert.equal(stale?.stage_records.audio_pcm.status, "stale");
    assert.equal(stale?.stage_records.source_stability.status, "stale");
    assert.ok(stale?.attempts.some((attempt) => attempt.stage === "source_stability" && attempt.status === "failed"));
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("fingerprint stage leases serialize cross-worker publication", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "media-analysis-lease-"));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    const fingerprint = "a".repeat(64);
    const releaseFirst = await acquireAnalysisStageLease(fingerprint, "proxy", "worker-one", () => false, 2_000);
    let acquiredSecond = false;
    const second = acquireAnalysisStageLease(fingerprint, "proxy", "worker-two", () => false, 2_000).then((release) => {
      acquiredSecond = true;
      return release;
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(acquiredSecond, false);
    releaseFirst();
    const releaseSecond = await second;
    assert.equal(acquiredSecond, true);
    releaseSecond();
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("stage cancellation terminates the measured process group and its descendants", { timeout: 10_000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "media-analysis-process-group-"));
  const heartbeat = path.join(directory, "heartbeat.txt");
  let cancelled = false;
  const grandchild = `const fs=require('node:fs');const p=${JSON.stringify(heartbeat)};setInterval(()=>fs.appendFileSync(p,'x'),25)`;
  const parent = `const {spawn}=require('node:child_process');process.on('SIGTERM',()=>{});spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'ignore'});setInterval(()=>{},1000)`;
  try {
    const running = runMeasuredCommand(process.execPath, ["-e", parent], () => cancelled);
    const deadline = Date.now() + 2_000;
    while (!fs.existsSync(heartbeat) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(fs.existsSync(heartbeat), true);
    cancelled = true;
    await assert.rejects(running, /cancelled/);
    const stoppedAt = fs.statSync(heartbeat).size;
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(fs.statSync(heartbeat).size, stoppedAt);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("a restarted worker reclaims an expired durable job lease", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "media-analysis-restart-"));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    createProject("fixture", "web");
    fs.writeFileSync(path.join(projectMediaDir("fixture"), "tone.wav"), wavBuffer());
    const asset = reconcileAssetBindings("fixture").assets[0];
    const queued = enqueueAssets("fixture", [asset.asset_id])[0];
    const abandoned = claimNextJob("worker-before-restart")!;
    assert.equal(abandoned.attempt_number, 1);
    writeJob({
      ...abandoned,
      lease: {
        owner: "worker-before-restart",
        heartbeat_at: new Date(Date.now() - 60_000).toISOString(),
        expires_at: new Date(Date.now() - 1_000).toISOString(),
      },
    });
    const reclaimed = claimNextJob("worker-after-restart")!;
    assert.equal(reclaimed.job_id, queued.job_id);
    assert.equal(reclaimed.status, "running");
    assert.equal(reclaimed.lease?.owner, "worker-after-restart");
    assert.equal(reclaimed.attempt_number, 2);
    assert.equal(readJob(queued.job_id)?.lease?.owner, "worker-after-restart");
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
