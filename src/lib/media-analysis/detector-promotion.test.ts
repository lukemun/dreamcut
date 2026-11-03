import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { CandidateMediaDetector, DetectorFrame, DetectorFrameResult } from "./detector";
import { DETECTOR_PROMOTION_GATES, readDetectorFixtureManifest, runDetectorPromotionBenchmark, verifyPromotionReport, type DetectorFixtureManifest } from "./detector-promotion";

class FakeDetector implements CandidateMediaDetector {
  readonly name = "fake-detector";
  constructor(private readonly omitPeople = false, private readonly alterParallelPts = false) {}
  async doctor() {
    return { status: "candidate" as const, reason: "test candidate", compiler_available: true, fixtures_available: true, compiler_version: "fake", platform_version: "fake" };
  }
  async detect(frames: DetectorFrame[]): Promise<DetectorFrameResult[]> {
    return (await this.detectCandidate(frames)).results;
  }
  async detectCandidate(frames: DetectorFrame[]) {
    const isParallelChunk = frames.length < 7;
    return {
      results: frames.map((frame) => ({
        ...frame,
        pts: this.alterParallelPts && isParallelChunk ? `${frame.pts}-changed` : frame.pts,
        boxes: frame.frame_id === "negative" ? [] : [
          { label: "face" as const, confidence: 0.9, x: 0.2, y: 0.2, width: 0.2, height: 0.2 },
          ...(this.omitPeople ? [] : [{ label: "person" as const, confidence: 0.8, x: 0.1, y: 0.1, width: 0.6, height: 0.8 }]),
        ],
      })),
      metrics: { wall_ms: frames.length, peak_rss_bytes: frames.length * 1_000 },
    };
  }
}

test("predeclared quality gates and public hand-authored fixture coverage cannot drift", () => {
  assert.equal(DETECTOR_PROMOTION_GATES.face_iou, 0.5);
  assert.equal(DETECTOR_PROMOTION_GATES.face_recall, 0.9);
  assert.equal(DETECTOR_PROMOTION_GATES.person_iou, 0.5);
  assert.equal(DETECTOR_PROMOTION_GATES.person_recall, 0.85);
  const manifest = readDetectorFixtureManifest(path.resolve(process.cwd(), "native/apple-vision-detector/fixtures/manifest.json"));
  assert.equal(manifest.annotation.method, "hand-authored");
  assert.deepEqual(new Set(manifest.scenarios.map((scenario) => scenario.coverage)), new Set(["talking_head", "multiple_people", "occlusion", "portrait_rotation", "dissolve", "longer_source", "negative"]));
  assert.ok(manifest.sources.every((source) => source.url.startsWith("https://images-assets.nasa.gov/") && /^[a-f0-9]{64}$/.test(source.sha256) && source.provenance_url.startsWith("https://images.nasa.gov/")));
});

function fixture(): { root: string; manifestPath: string; sourcePath: string; reportPath: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "detector-promotion-test-"));
  const image = Buffer.from("fixture pixels");
  fs.writeFileSync(path.join(root, "image.bin"), image);
  const sourcePath = path.join(root, "detector.swift");
  fs.writeFileSync(sourcePath, "// fake detector source\n");
  const scenarios = ["talking_head", "multiple_people", "occlusion", "portrait_rotation", "dissolve", "longer_source", "negative"] as const;
  const manifest: DetectorFixtureManifest = {
    schema_version: 1,
    name: "fake",
    annotation: { method: "hand-authored", author: "test author", note: "Fixture boxes were manually authored for this synthetic image." },
    sources: [{ id: "source", file: "image.bin", url: "https://example.invalid/image", sha256: createHash("sha256").update(image).digest("hex"), provenance_url: "https://example.invalid/details", rights: "Synthetic test bytes." }],
    scenarios: scenarios.map((coverage) => ({ id: coverage, coverage, note: coverage })),
    frames: scenarios.map((coverage) => ({
      frame_id: coverage === "negative" ? "negative" : coverage,
      scenario_id: coverage,
      file: "image.bin",
      pts: String(scenarios.indexOf(coverage)),
      time_base_num: 1,
      time_base_den: 30,
      negative: coverage === "negative" || undefined,
      expected: coverage === "negative" ? [] : [
        { truth_id: `${coverage}-face`, label: "face" as const, x: 0.2, y: 0.2, width: 0.2, height: 0.2 },
        { truth_id: `${coverage}-person`, label: "person" as const, x: 0.1, y: 0.1, width: 0.6, height: 0.8 },
      ],
    })),
  };
  const manifestPath = path.join(root, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  return { root, manifestPath, sourcePath, reportPath: path.join(root, "promotion.json") };
}

test("exact detection quality still cannot promote while tracking is unevaluated", async () => {
  const item = fixture();
  try {
    const report = await runDetectorPromotionBenchmark({ detector: new FakeDetector(), manifestPath: item.manifestPath, fixtureRoot: item.root, detectorSourcePath: item.sourcePath, reportPath: item.reportPath, compilerVersion: "fake compiler", platformVersion: "fake platform", parallelCapacity: 3 });
    assert.equal(report.passed, false);
    assert.equal(report.metrics.pts_echo_rate, 1);
    assert.equal(report.metrics.face_recall, 1);
    assert.equal(report.metrics.person_recall, 1);
    assert.equal(report.metrics.negative_false_positives, 0);
    assert.equal(report.runs.deterministic, true);
    assert.equal(report.gates.face_recall.pass, true);
    assert.equal(report.gates.person_recall.pass, true);
    assert.equal(report.gates.tracking_evaluated.pass, false);
    assert.equal(report.runs.bounded_parallel.capacity, 3);
    assert.equal(report.runs.serial.peak_rss_bytes, 7_000);
    assert.equal(report.runs.bounded_parallel.peak_rss_bytes, 7_000);
    assert.equal(report.derived_fixture_bytes, Buffer.byteLength("fixture pixels") * 7);
    assert.equal((await verifyPromotionReport({ reportPath: item.reportPath, manifestPath: item.manifestPath, detectorSourcePath: item.sourcePath, compilerVersion: "fake compiler", platformVersion: "fake platform" })).valid, false);
  } finally {
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});

test("promotion evaluator fails recall and serial/parallel determinism without weakening gates", async () => {
  const item = fixture();
  try {
    const report = await runDetectorPromotionBenchmark({ detector: new FakeDetector(true, true), manifestPath: item.manifestPath, fixtureRoot: item.root, detectorSourcePath: item.sourcePath, reportPath: item.reportPath });
    assert.equal(report.passed, false);
    assert.equal(report.gates.person_recall.pass, false);
    assert.equal(report.gates.deterministic.pass, false);
    assert.equal((await verifyPromotionReport({ reportPath: item.reportPath, manifestPath: item.manifestPath, detectorSourcePath: item.sourcePath })).valid, false);
  } finally {
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});

test("promotion verification invalidates a passing report when detector source changes", async () => {
  const item = fixture();
  try {
    const report = await runDetectorPromotionBenchmark({ detector: new FakeDetector(), manifestPath: item.manifestPath, fixtureRoot: item.root, detectorSourcePath: item.sourcePath, reportPath: item.reportPath });
    // Model a future evaluator-produced passing report after a tracker is
    // connected; this isolates current-input invalidation from today's
    // deliberately failing tracking gate.
    report.gates.tracking_evaluated = { pass: true, actual: true, required: "tracking evaluated" };
    report.metrics.tracking = { status: "evaluated", identity_switches: 0, cross_shot_violations: 0 };
    report.passed = true;
    fs.writeFileSync(item.reportPath, JSON.stringify(report));
    fs.appendFileSync(item.sourcePath, "// changed\n");
    const verification = await verifyPromotionReport({ reportPath: item.reportPath, manifestPath: item.manifestPath, detectorSourcePath: item.sourcePath });
    assert.equal(verification.valid, false);
    assert.match(verification.reason, /source changed/i);
  } finally {
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});
