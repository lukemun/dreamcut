import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

import type { CandidateMediaDetector, DetectorDoctorResult, DetectorFrame, DetectorFrameResult } from "./detector";
import { verifyPromotionReport } from "./detector-promotion";

function execute(command: string, args: string[], stdin = ""): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(stdin);
  });
}

function parsePeakRss(stderr: string): number | null {
  const mac = /(?:^|\n)\s*(\d+)\s+maximum resident set size\s*$/m.exec(stderr)?.[1];
  const gnu = /Maximum resident set size \(kbytes\):\s*(\d+)/.exec(stderr)?.[1];
  return mac ? Number(mac) : gnu ? Number(gnu) * 1024 : null;
}

export const FACE_FRAME_GATES = ["pts_echo", "face_recall", "negative_false_positives", "mean_coordinate_error", "max_coordinate_error", "deterministic"] as const;

export class AppleVisionDetector implements CandidateMediaDetector {
  readonly name = "apple-vision";
  private compiledBinary: Promise<string> | null = null;
  constructor(
    private readonly sourcePath = path.resolve(process.cwd(), "native/apple-vision-detector/main.swift"),
    private readonly fixtureManifest = process.env.APPLE_VISION_FIXTURE_MANIFEST
      ?? path.resolve(process.cwd(), "native/apple-vision-detector/fixtures/manifest.json"),
    private readonly promotionReport = process.env.APPLE_VISION_PROMOTION_REPORT
      ?? path.resolve(process.cwd(), ".cache/media-analysis/apple-vision-promotion.json"),
  ) {}

  toolIdentity(compilerVersion: string | null): { name: string; version: string } {
    const sourceHash = fs.existsSync(this.sourcePath)
      ? createHash("sha256").update(fs.readFileSync(this.sourcePath)).digest("hex")
      : "missing";
    return { name: this.name, version: `${compilerVersion ?? "unknown"};source=${sourceHash}` };
  }

  private async compileCandidate(): Promise<string> {
    if (this.compiledBinary) return this.compiledBinary;
    this.compiledBinary = (async () => {
      const sourceHash = createHash("sha256").update(fs.readFileSync(this.sourcePath)).digest("hex").slice(0, 16);
      const directory = fs.mkdtempSync(path.join(tmpdir(), "dreamcut-apple-vision-"));
      const binaryPath = path.join(directory, `detector-${sourceHash}`);
      const compiled = await execute("xcrun", ["swiftc", "-O", this.sourcePath, "-o", binaryPath]);
      if (compiled.code !== 0) throw new Error(`Apple Vision compile failed: ${compiled.stderr}`);
      return binaryPath;
    })();
    return this.compiledBinary;
  }

  async doctor(): Promise<DetectorDoctorResult> {
    const compiler = await execute("xcrun", ["--find", "swiftc"]).catch(() => ({ code: 1, stdout: "", stderr: "" }));
    const compilerAvailable = compiler.code === 0;
    const fixturesAvailable = fs.existsSync(this.fixtureManifest);
    const compilerVersion = compilerAvailable ? await execute("xcrun", ["swiftc", "--version"]) : null;
    const platformVersion = await execute("sw_vers", ["-productVersion"]).catch(() => null);
    const base = {
      compiler_available: compilerAvailable,
      fixtures_available: fixturesAvailable,
      compiler_version: compilerVersion?.stdout.trim() || null,
      platform_version: platformVersion?.stdout.trim() || null,
    };
    if (!compilerAvailable) return { ...base, status: "unavailable", reason: "xcrun swiftc is unavailable" };
    const binaryPath = path.join(tmpdir(), `dreamcut-apple-vision-doctor-${process.pid}`);
    const compilation = await execute("xcrun", ["swiftc", this.sourcePath, "-o", binaryPath]);
    try {
      if (compilation.code !== 0) return { ...base, status: "unavailable", reason: `Apple Vision candidate does not compile: ${compilation.stderr.slice(-1_000)}` };
    } finally {
      try { fs.unlinkSync(binaryPath); } catch { /* best effort */ }
    }
    if (!fixturesAvailable) return { ...base, status: "candidate", reason: `Fixture manifest is absent: ${this.fixtureManifest}` };
    const verification = await verifyPromotionReport({
      reportPath: this.promotionReport,
      manifestPath: this.fixtureManifest,
      detectorSourcePath: this.sourcePath,
      compilerVersion: compilerVersion?.stdout.trim() || null,
      platformVersion: platformVersion?.stdout.trim() || null,
    });
    if (!verification.valid) return { ...base, status: "candidate", reason: verification.reason };
    return { ...base, status: "available", reason: null };
  }

  /**
   * Face boxes for individual frames, without tracking. Allowed when the benchmark's face, position,
   * false-positive and determinism gates pass on this detector, compiler and platform; body and tracking
   * gates are not required. Person boxes the detector still returns are kept (they carry no false positives
   * in the benchmark) but may be missing.
   */
  async detectFaces(frames: DetectorFrame[]): Promise<DetectorFrameResult[]> {
    const compilerVersion = await execute("xcrun", ["swiftc", "--version"]).catch(() => null);
    const platformVersion = await execute("sw_vers", ["-productVersion"]).catch(() => null);
    const verification = await verifyPromotionReport({
      reportPath: this.promotionReport, manifestPath: this.fixtureManifest, detectorSourcePath: this.sourcePath,
      compilerVersion: compilerVersion?.stdout.trim() || null, platformVersion: platformVersion?.stdout.trim() || null,
      requiredGates: FACE_FRAME_GATES,
    });
    if (!verification.valid) throw new Error(`Face detection is not verified on this machine: ${verification.reason} Run pnpm preprocess detector-benchmark.`);
    return (await this.detectCandidate(frames)).results;
  }

  async detect(frames: DetectorFrame[]): Promise<DetectorFrameResult[]> {
    const doctor = await this.doctor();
    if (doctor.status !== "available") throw new Error(doctor.reason ?? "Apple Vision detector is unavailable");
    return (await this.detectCandidate(frames)).results;
  }

  async detectCandidate(frames: DetectorFrame[]): Promise<{ results: DetectorFrameResult[]; metrics: { wall_ms: number; peak_rss_bytes: number | null } }> {
    if (frames.length === 0) return { results: [], metrics: { wall_ms: 0, peak_rss_bytes: 0 } };
    const binaryPath = await this.compileCandidate();
    const started = process.hrtime.bigint();
    const timePath = fs.existsSync("/usr/bin/time") ? "/usr/bin/time" : null;
    const result = timePath
      ? await execute(timePath, ["-l", binaryPath], `${frames.map((frame) => JSON.stringify(frame)).join("\n")}\n`)
      : await execute(binaryPath, [], `${frames.map((frame) => JSON.stringify(frame)).join("\n")}\n`);
    const wallMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    if (result.code !== 0) throw new Error(`Apple Vision detector failed: ${result.stderr}`);
    const results = result.stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as DetectorFrameResult);
    return { results, metrics: { wall_ms: wallMs, peak_rss_bytes: parsePeakRss(result.stderr) } };
  }
}
