import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type {
  CandidateMediaDetector,
  DetectorBox,
  DetectorFrame,
  DetectorFrameResult,
  DetectorRunMetrics,
} from "./detector";

export const DETECTOR_PROMOTION_GATES_VERSION = "apple-vision-promotion-v3-tracking-required";

/** Gates live in code, not in the fixture manifest, so changing fixture data
 * cannot silently weaken the production threshold. */
export const DETECTOR_PROMOTION_GATES = Object.freeze({
  face_iou: 0.5,
  face_recall: 0.9,
  person_iou: 0.5,
  person_recall: 0.85,
  negative_false_positives: 0,
  mean_coordinate_error: 0.08,
  max_coordinate_error: 0.2,
  pts_echo_rate: 1,
});

export type FixtureTruthBox = Omit<DetectorBox, "confidence"> & {
  truth_id: string;
  track_id?: string;
};

export type DetectorFixtureManifest = {
  schema_version: 1;
  name: string;
  annotation: {
    method: "hand-authored";
    author: string;
    note: string;
  };
  sources: Array<{
    id: string;
    file: string;
    url: string;
    sha256: string;
    provenance_url: string;
    rights: string;
  }>;
  scenarios: Array<{
    id: string;
    coverage: "talking_head" | "multiple_people" | "occlusion" | "portrait_rotation" | "dissolve" | "longer_source" | "negative";
    note: string;
  }>;
  frames: Array<{
    frame_id: string;
    scenario_id: string;
    file: string;
    pts: string;
    time_base_num: number;
    time_base_den: number;
    negative?: boolean;
    expected: FixtureTruthBox[];
  }>;
};

type GateResult = { pass: boolean; actual: number | boolean; required: string };

export type DetectorPromotionReport = {
  schema_version: 1;
  gates_version: typeof DETECTOR_PROMOTION_GATES_VERSION;
  detector_name: string;
  detector_source_sha256: string;
  manifest_sha256: string;
  fixture_sha256: Record<string, string>;
  compiler_version: string | null;
  platform_version: string | null;
  generated_at: string;
  fixture_root: string;
  frame_count: number;
  derived_fixture_bytes: number;
  metrics: {
    pts_echo_rate: number;
    face_recall: number;
    person_recall: number;
    negative_false_positives: number;
    mean_coordinate_error: number;
    max_coordinate_error: number;
    matched_faces: number;
    expected_faces: number;
    matched_people: number;
    expected_people: number;
    scenarios: Record<string, {
      frames: number;
      pts_echoes: number;
      matched_faces: number;
      expected_faces: number;
      matched_people: number;
      expected_people: number;
      false_positives: number;
    }>;
    tracking:
      | { status: "not_available"; reason: string }
      | { status: "evaluated"; identity_switches: number; cross_shot_violations: number };
  };
  runs: {
    serial: DetectorRunMetrics;
    bounded_parallel: DetectorRunMetrics & { capacity: number; speedup: number | null };
    deterministic: boolean;
    serial_output_sha256: string;
    bounded_parallel_output_sha256: string;
    mismatched_frame_ids: string[];
  };
  gates: Record<string, GateResult>;
  passed: boolean;
  report_path: string;
};

function sha256Buffer(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(filePath: string): string {
  return sha256Buffer(fs.readFileSync(filePath));
}

function validateManifest(value: unknown): DetectorFixtureManifest {
  if (!value || typeof value !== "object") throw new Error("Detector fixture manifest must be an object");
  const manifest = value as DetectorFixtureManifest;
  if (manifest.schema_version !== 1) throw new Error("Unsupported detector fixture manifest schema");
  if (manifest.annotation?.method !== "hand-authored") throw new Error("Detector fixture truth must be explicitly hand-authored");
  if (!Array.isArray(manifest.frames) || manifest.frames.length === 0) throw new Error("Detector fixture manifest has no frames");
  const coverage = new Set(manifest.scenarios?.map((scenario) => scenario.coverage));
  for (const required of ["talking_head", "multiple_people", "occlusion", "portrait_rotation", "dissolve", "longer_source", "negative"] as const) {
    if (!coverage.has(required)) throw new Error(`Detector fixture manifest is missing ${required} coverage`);
  }
  const scenarioIds = new Set(manifest.scenarios.map((scenario) => scenario.id));
  const frameIds = new Set<string>();
  for (const frame of manifest.frames) {
    if (frameIds.has(frame.frame_id)) throw new Error(`Duplicate detector fixture frame_id: ${frame.frame_id}`);
    frameIds.add(frame.frame_id);
    if (!scenarioIds.has(frame.scenario_id)) throw new Error(`Unknown scenario for ${frame.frame_id}`);
    if (!Number.isInteger(frame.time_base_num) || !Number.isInteger(frame.time_base_den) || frame.time_base_den <= 0) throw new Error(`Invalid time base for ${frame.frame_id}`);
    if (frame.negative && frame.expected.length > 0) throw new Error(`Negative frame ${frame.frame_id} cannot have positive truth`);
    for (const box of frame.expected) {
      if (!box.truth_id || !["face", "person"].includes(box.label)) throw new Error(`Invalid truth box in ${frame.frame_id}`);
      if ([box.x, box.y, box.width, box.height].some((coordinate) => !Number.isFinite(coordinate))) throw new Error(`Non-finite truth box in ${frame.frame_id}`);
      if (box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0 || box.x + box.width > 1.001 || box.y + box.height > 1.001) throw new Error(`Out-of-bounds truth box in ${frame.frame_id}`);
    }
  }
  return manifest;
}

export function readDetectorFixtureManifest(manifestPath: string): DetectorFixtureManifest {
  return validateManifest(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
}

function intersectionOverUnion(a: Pick<DetectorBox, "x" | "y" | "width" | "height">, b: Pick<DetectorBox, "x" | "y" | "width" | "height">): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

type MatchSummary = { expected: number; matched: number; coordinateErrors: number[] };

function matchLabel(expected: FixtureTruthBox[], actual: DetectorBox[], label: DetectorBox["label"], minimumIou: number): MatchSummary {
  const truth = expected.filter((box) => box.label === label);
  const candidates = actual.filter((box) => box.label === label);
  const pairs = truth.flatMap((expectedBox, expectedIndex) => candidates.map((actualBox, actualIndex) => ({
    expectedIndex,
    actualIndex,
    iou: intersectionOverUnion(expectedBox, actualBox),
  }))).sort((a, b) => b.iou - a.iou || a.expectedIndex - b.expectedIndex || a.actualIndex - b.actualIndex);
  const usedExpected = new Set<number>();
  const usedActual = new Set<number>();
  const coordinateErrors: number[] = [];
  for (const pair of pairs) {
    if (pair.iou < minimumIou || usedExpected.has(pair.expectedIndex) || usedActual.has(pair.actualIndex)) continue;
    usedExpected.add(pair.expectedIndex);
    usedActual.add(pair.actualIndex);
    const a = truth[pair.expectedIndex];
    const b = candidates[pair.actualIndex];
    coordinateErrors.push((Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.width - b.width) + Math.abs(a.height - b.height)) / 4);
  }
  return { expected: truth.length, matched: usedExpected.size, coordinateErrors };
}

function canonicalResults(results: DetectorFrameResult[]): string {
  return JSON.stringify([...results].sort((a, b) => a.frame_id.localeCompare(b.frame_id)).map((result) => ({
    frame_id: result.frame_id,
    image_path: path.basename(result.image_path),
    pts: result.pts,
    time_base_num: result.time_base_num,
    time_base_den: result.time_base_den,
    boxes: [...result.boxes].map((box) => ({
      label: box.label,
      confidence: Number(box.confidence.toFixed(8)),
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    })).sort((a, b) =>
      a.label.localeCompare(b.label) || a.x - b.x || a.y - b.y || a.width - b.width || a.height - b.height),
  })));
}

function canonicalResult(result: DetectorFrameResult | undefined): string {
  return canonicalResults(result ? [result] : []);
}

async function runBoundedParallel(detector: CandidateMediaDetector, frames: DetectorFrame[], capacity: number): Promise<{ results: DetectorFrameResult[]; metrics: DetectorRunMetrics }> {
  const chunks: DetectorFrame[][] = Array.from({ length: Math.min(capacity, frames.length) }, () => []);
  frames.forEach((frame, index) => chunks[index % chunks.length].push(frame));
  const started = process.hrtime.bigint();
  const runs = await Promise.all(chunks.map((chunk) => detector.detectCandidate(chunk)));
  return {
    results: runs.flatMap((run) => run.results),
    metrics: {
      wall_ms: Number(process.hrtime.bigint() - started) / 1_000_000,
      // Concurrent child maxima are conservatively summed. This is an upper
      // bound, rather than pretending the parent RSS includes detector workers.
      peak_rss_bytes: runs.every((run) => run.metrics.peak_rss_bytes != null)
        ? runs.reduce((sum, run) => sum + (run.metrics.peak_rss_bytes ?? 0), 0)
        : null,
    },
  };
}

export async function runDetectorPromotionBenchmark(options: {
  detector: CandidateMediaDetector;
  manifestPath: string;
  fixtureRoot: string;
  detectorSourcePath: string;
  reportPath: string;
  compilerVersion?: string | null;
  platformVersion?: string | null;
  parallelCapacity?: number;
}): Promise<DetectorPromotionReport> {
  const manifest = readDetectorFixtureManifest(options.manifestPath);
  const fixtureSha: Record<string, string> = {};
  let derivedBytes = 0;
  const frames: DetectorFrame[] = manifest.frames.map((frame) => {
    const imagePath = path.resolve(options.fixtureRoot, frame.file);
    if (!fs.existsSync(imagePath)) throw new Error(`Detector fixture is missing: ${imagePath}. Run the fixture generator first.`);
    const stat = fs.statSync(imagePath);
    derivedBytes += stat.size;
    fixtureSha[frame.file] ??= sha256File(imagePath);
    return { frame_id: frame.frame_id, image_path: imagePath, pts: frame.pts, time_base_num: frame.time_base_num, time_base_den: frame.time_base_den };
  });
  for (const source of manifest.sources) {
    const sourcePath = path.resolve(options.fixtureRoot, source.file);
    if (!fs.existsSync(sourcePath) || sha256File(sourcePath) !== source.sha256) throw new Error(`NASA source fixture failed SHA-256 verification: ${source.file}`);
  }

  const serial = await options.detector.detectCandidate(frames);
  const capacity = Math.max(2, Math.min(options.parallelCapacity ?? 3, frames.length));
  const parallel = await runBoundedParallel(options.detector, frames, capacity);
  const resultByFrame = new Map(serial.results.map((result) => [result.frame_id, result]));
  let ptsEchoes = 0;
  let negativeFalsePositives = 0;
  const face: MatchSummary = { expected: 0, matched: 0, coordinateErrors: [] };
  const person: MatchSummary = { expected: 0, matched: 0, coordinateErrors: [] };
  const scenarios: DetectorPromotionReport["metrics"]["scenarios"] = {};
  for (const fixture of manifest.frames) {
    const result = resultByFrame.get(fixture.frame_id);
    if (result && result.pts === fixture.pts && result.time_base_num === fixture.time_base_num && result.time_base_den === fixture.time_base_den && path.resolve(result.image_path) === path.resolve(options.fixtureRoot, fixture.file)) ptsEchoes += 1;
    const boxes = result?.boxes ?? [];
    if (fixture.negative) negativeFalsePositives += boxes.length;
    const faceFrame = matchLabel(fixture.expected, boxes, "face", DETECTOR_PROMOTION_GATES.face_iou);
    const personFrame = matchLabel(fixture.expected, boxes, "person", DETECTOR_PROMOTION_GATES.person_iou);
    const scenario = scenarios[fixture.scenario_id] ??= { frames: 0, pts_echoes: 0, matched_faces: 0, expected_faces: 0, matched_people: 0, expected_people: 0, false_positives: 0 };
    scenario.frames += 1;
    scenario.pts_echoes += result && result.pts === fixture.pts && result.time_base_num === fixture.time_base_num && result.time_base_den === fixture.time_base_den ? 1 : 0;
    scenario.matched_faces += faceFrame.matched; scenario.expected_faces += faceFrame.expected;
    scenario.matched_people += personFrame.matched; scenario.expected_people += personFrame.expected;
    if (fixture.negative) scenario.false_positives += boxes.length;
    face.expected += faceFrame.expected; face.matched += faceFrame.matched; face.coordinateErrors.push(...faceFrame.coordinateErrors);
    person.expected += personFrame.expected; person.matched += personFrame.matched; person.coordinateErrors.push(...personFrame.coordinateErrors);
  }
  const errors = [...face.coordinateErrors, ...person.coordinateErrors];
  const metrics = {
    pts_echo_rate: ptsEchoes / frames.length,
    face_recall: face.expected > 0 ? face.matched / face.expected : 0,
    person_recall: person.expected > 0 ? person.matched / person.expected : 0,
    negative_false_positives: negativeFalsePositives,
    mean_coordinate_error: errors.length > 0 ? errors.reduce((sum, error) => sum + error, 0) / errors.length : Number.POSITIVE_INFINITY,
    max_coordinate_error: errors.length > 0 ? Math.max(...errors) : Number.POSITIVE_INFINITY,
    matched_faces: face.matched,
    expected_faces: face.expected,
    matched_people: person.matched,
    expected_people: person.expected,
    scenarios,
    tracking: { status: "not_available" as const, reason: "Apple Vision returns per-frame boxes without stable track IDs; tracking gates are deferred until a tracker is connected." },
  };
  const canonicalSerial = canonicalResults(serial.results);
  const canonicalParallel = canonicalResults(parallel.results);
  const deterministic = canonicalSerial === canonicalParallel;
  const parallelByFrame = new Map(parallel.results.map((result) => [result.frame_id, result]));
  const mismatchedFrameIds = frames.map((frame) => frame.frame_id).filter((frameId) => canonicalResult(resultByFrame.get(frameId)) !== canonicalResult(parallelByFrame.get(frameId)));
  const gates: Record<string, GateResult> = {
    pts_echo: { pass: metrics.pts_echo_rate >= DETECTOR_PROMOTION_GATES.pts_echo_rate, actual: metrics.pts_echo_rate, required: `>= ${DETECTOR_PROMOTION_GATES.pts_echo_rate}` },
    face_recall: { pass: metrics.face_recall >= DETECTOR_PROMOTION_GATES.face_recall, actual: metrics.face_recall, required: `>= ${DETECTOR_PROMOTION_GATES.face_recall} at IoU ${DETECTOR_PROMOTION_GATES.face_iou}` },
    person_recall: { pass: metrics.person_recall >= DETECTOR_PROMOTION_GATES.person_recall, actual: metrics.person_recall, required: `>= ${DETECTOR_PROMOTION_GATES.person_recall} at IoU ${DETECTOR_PROMOTION_GATES.person_iou}` },
    negative_false_positives: { pass: metrics.negative_false_positives <= DETECTOR_PROMOTION_GATES.negative_false_positives, actual: metrics.negative_false_positives, required: `<= ${DETECTOR_PROMOTION_GATES.negative_false_positives}` },
    mean_coordinate_error: { pass: metrics.mean_coordinate_error <= DETECTOR_PROMOTION_GATES.mean_coordinate_error, actual: metrics.mean_coordinate_error, required: `<= ${DETECTOR_PROMOTION_GATES.mean_coordinate_error}` },
    max_coordinate_error: { pass: metrics.max_coordinate_error <= DETECTOR_PROMOTION_GATES.max_coordinate_error, actual: metrics.max_coordinate_error, required: `<= ${DETECTOR_PROMOTION_GATES.max_coordinate_error}` },
    deterministic: { pass: deterministic, actual: deterministic, required: "serial and bounded-parallel outputs must match" },
    tracking_evaluated: {
      pass: false,
      actual: false,
      required: "tracking must be evaluated with zero identity switches and zero cross-shot associations",
    },
  };
  const report: DetectorPromotionReport = {
    schema_version: 1,
    gates_version: DETECTOR_PROMOTION_GATES_VERSION,
    detector_name: options.detector.name,
    detector_source_sha256: sha256File(options.detectorSourcePath),
    manifest_sha256: sha256File(options.manifestPath),
    fixture_sha256: fixtureSha,
    compiler_version: options.compilerVersion ?? null,
    platform_version: options.platformVersion ?? null,
    generated_at: new Date().toISOString(),
    fixture_root: path.resolve(options.fixtureRoot),
    frame_count: frames.length,
    derived_fixture_bytes: derivedBytes,
    metrics,
    runs: {
      serial: serial.metrics,
      bounded_parallel: { ...parallel.metrics, capacity, speedup: parallel.metrics.wall_ms > 0 ? serial.metrics.wall_ms / parallel.metrics.wall_ms : null },
      deterministic,
      serial_output_sha256: sha256Buffer(canonicalSerial),
      bounded_parallel_output_sha256: sha256Buffer(canonicalParallel),
      mismatched_frame_ids: mismatchedFrameIds,
    },
    gates,
    passed: Object.values(gates).every((gate) => gate.pass),
    report_path: path.resolve(options.reportPath),
  };
  fs.mkdirSync(path.dirname(options.reportPath), { recursive: true });
  const temporary = `${options.reportPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  fs.renameSync(temporary, options.reportPath);
  return report;
}

export async function verifyPromotionReport(options: {
  reportPath: string;
  manifestPath: string;
  detectorSourcePath: string;
  compilerVersion?: string | null;
  platformVersion?: string | null;
  /** Gates that must pass for a narrower use (e.g. single-frame face boxes); omit for full promotion including tracking. */
  requiredGates?: readonly string[];
}): Promise<{ valid: boolean; reason: string }> {
  if (!fs.existsSync(options.reportPath)) return { valid: false, reason: `No local promotion report exists at ${options.reportPath}; run preprocess detector-benchmark.` };
  try {
    const report = JSON.parse(fs.readFileSync(options.reportPath, "utf8")) as DetectorPromotionReport;
    if (report.schema_version !== 1 || report.gates_version !== DETECTOR_PROMOTION_GATES_VERSION) return { valid: false, reason: "Detector promotion report uses stale gates." };
    if (options.requiredGates) {
      const failed = options.requiredGates.filter((gate) => report.gates?.[gate]?.pass !== true);
      if (failed.length) return { valid: false, reason: `The latest detector benchmark did not pass: ${failed.join(", ")}.` };
    } else if (!report.passed || !report.gates || !Object.values(report.gates).every((gate) => gate.pass)) return { valid: false, reason: "The latest detector promotion benchmark did not pass every gate." };
    if (!options.requiredGates && (report.metrics?.tracking?.status !== "evaluated"
      || report.metrics.tracking.identity_switches !== 0
      || report.metrics.tracking.cross_shot_violations !== 0)) {
      return { valid: false, reason: "Detector promotion report lacks passing tracking evidence." };
    }
    if (report.detector_source_sha256 !== sha256File(options.detectorSourcePath)) return { valid: false, reason: "Detector source changed after promotion." };
    if (report.manifest_sha256 !== sha256File(options.manifestPath)) return { valid: false, reason: "Detector fixture manifest changed after promotion." };
    if (options.compilerVersion !== undefined && report.compiler_version !== options.compilerVersion) return { valid: false, reason: "Swift compiler identity changed after promotion." };
    if (options.platformVersion !== undefined && report.platform_version !== options.platformVersion) return { valid: false, reason: "macOS platform identity changed after promotion." };
    for (const [relativePath, expectedSha] of Object.entries(report.fixture_sha256)) {
      const fixturePath = path.resolve(report.fixture_root, relativePath);
      if (!fs.existsSync(fixturePath) || sha256File(fixturePath) !== expectedSha) return { valid: false, reason: `Detector fixture changed after promotion: ${relativePath}` };
    }
    return { valid: true, reason: "Current detector, fixtures, platform, and compiler match a passing promotion report." };
  } catch (error) {
    return { valid: false, reason: `Promotion report is invalid: ${error instanceof Error ? error.message : String(error)}` };
  }
}
